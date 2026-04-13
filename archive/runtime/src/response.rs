use serde_json;
use std::io::Write;
use std::net::TcpStream;

pub struct Response {
    pub status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Response {
    pub fn json(data: serde_json::Value) -> Self {
        let body = serde_json::to_string(&data).unwrap_or_else(|_| "{}".into());
        Self::new(200, "OK")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.into_bytes())
    }

    pub fn html(content: &str) -> Self {
        Self::new(200, "OK")
            .header("Content-Type", "text/html; charset=utf-8")
            .with_body(content.as_bytes().to_vec())
    }

    pub fn text(content: &str) -> Self {
        Self::new(200, "OK")
            .header("Content-Type", "text/plain; charset=utf-8")
            .with_body(content.as_bytes().to_vec())
    }

    pub fn created(data: serde_json::Value) -> Self {
        let body = serde_json::to_string(&data).unwrap_or_else(|_| "{}".into());
        Self::new(201, "Created")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.into_bytes())
    }

    pub fn no_content() -> Self {
        Self::new(204, "No Content")
    }

    pub fn bad_request(msg: &str) -> Self {
        let body = serde_json::json!({ "error": msg });
        Self::new(400, "Bad Request")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.to_string().into_bytes())
    }

    pub fn not_found() -> Self {
        let body = serde_json::json!({ "error": "Not Found" });
        Self::new(404, "Not Found")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.to_string().into_bytes())
    }

    pub fn method_not_allowed() -> Self {
        let body = serde_json::json!({ "error": "Method Not Allowed" });
        Self::new(405, "Method Not Allowed")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.to_string().into_bytes())
    }

    pub fn error(msg: &str) -> Self {
        let body = serde_json::json!({ "error": msg });
        Self::new(500, "Internal Server Error")
            .header("Content-Type", "application/json; charset=utf-8")
            .with_body(body.to_string().into_bytes())
    }

    pub fn file(content: Vec<u8>, mime: &str) -> Self {
        Self::new(200, "OK")
            .header("Content-Type", mime)
            .with_body(content)
    }

    pub fn redirect(location: &str) -> Self {
        Self::new(302, "Found")
            .header("Location", location)
            .with_body(Vec::new())
    }

    fn new(status: u16, status_text: &str) -> Self {
        Response {
            status,
            status_text: status_text.to_string(),
            headers: Vec::new(),
            body: Vec::new(),
        }
    }

    pub fn header(mut self, key: &str, value: &str) -> Self {
        self.headers.push((key.to_string(), value.to_string()));
        self
    }

    fn with_body(mut self, body: Vec<u8>) -> Self {
        self.body = body;
        self
    }

    pub fn send(&self, stream: &mut TcpStream) {
        let mut buf = Vec::with_capacity(512 + self.body.len());
        write!(buf, "HTTP/1.1 {} {}\r\n", self.status, self.status_text).ok();
        write!(buf, "Content-Length: {}\r\n", self.body.len()).ok();
        write!(buf, "Connection: close\r\n").ok();
        write!(buf, "Server: NyxCode/0.1.0\r\n").ok();
        for (k, v) in &self.headers {
            write!(buf, "{}: {}\r\n", k, v).ok();
        }
        write!(buf, "Access-Control-Allow-Origin: *\r\n").ok();
        write!(buf, "Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\n").ok();
        write!(buf, "Access-Control-Allow-Headers: Content-Type, Authorization\r\n").ok();
        write!(buf, "\r\n").ok();
        buf.extend_from_slice(&self.body);
        let _ = stream.write_all(&buf);
        let _ = stream.flush();
    }
}
