use std::collections::HashMap;
use std::io::Read;
use std::net::TcpStream;

/// Parsed HTTP request.
#[derive(Debug)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub query_string: String,
    pub params: HashMap<String, String>,
    pub query: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: String,
}

impl Request {
    pub fn from_stream(stream: &mut TcpStream) -> Option<Self> {
        let mut buf = Vec::with_capacity(4096);
        let mut tmp = [0u8; 4096];
        let header_end;

        loop {
            let n = stream.read(&mut tmp).ok()?;
            if n == 0 { return None; }
            buf.extend_from_slice(&tmp[..n]);
            if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                header_end = pos;
                break;
            }
            if buf.len() > 64 * 1024 { return None; }
        }

        let header_str = String::from_utf8_lossy(&buf[..header_end]).to_string();
        let mut lines = header_str.lines();

        let request_line = lines.next()?;
        let mut parts = request_line.split_whitespace();
        let method = parts.next()?.to_uppercase();
        let raw_path = parts.next()?.to_string();

        let mut headers = HashMap::new();
        for line in lines {
            if line.is_empty() { break; }
            if let Some((key, value)) = line.split_once(':') {
                headers.insert(key.trim().to_lowercase(), value.trim().to_string());
            }
        }

        let content_length: usize = headers
            .get("content-length")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0);

        let body_start = header_end + 4;
        let mut body_bytes: Vec<u8> = if body_start < buf.len() {
            buf[body_start..].to_vec()
        } else {
            Vec::new()
        };

        let already_read = body_bytes.len();
        if already_read < content_length {
            let remaining = content_length - already_read;
            let mut rest = vec![0u8; remaining];
            let mut read_so_far = 0;
            while read_so_far < remaining {
                let n = stream.read(&mut rest[read_so_far..]).ok()?;
                if n == 0 { break; }
                read_so_far += n;
            }
            body_bytes.extend_from_slice(&rest[..read_so_far]);
        }
        body_bytes.truncate(content_length);
        let body = String::from_utf8_lossy(&body_bytes).to_string();

        let (path, query_string) = match raw_path.split_once('?') {
            Some((p, q)) => (p.to_string(), q.to_string()),
            None => (raw_path, String::new()),
        };
        let query = parse_query_string(&query_string);

        Some(Request {
            method, path, query_string,
            params: HashMap::new(),
            query, headers, body,
        })
    }

    pub fn json(&self) -> Option<serde_json::Value> {
        serde_json::from_str(&self.body).ok()
    }
}

fn parse_query_string(qs: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if qs.is_empty() { return map; }
    for pair in qs.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            map.insert(url_decode(key), url_decode(value));
        } else if !pair.is_empty() {
            map.insert(url_decode(pair), String::new());
        }
    }
    map
}

fn url_decode(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        match b {
            b'+' => output.push(' '),
            b'%' => {
                let high = chars.next().and_then(hex_val);
                let low = chars.next().and_then(hex_val);
                if let (Some(h), Some(l)) = (high, low) {
                    output.push((h << 4 | l) as char);
                } else {
                    output.push('%');
                }
            }
            _ => output.push(b as char),
        }
    }
    output
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
