use std::net::TcpListener;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use crate::request::Request;
use crate::response::Response;
use crate::router::Router;

pub struct Server {
    addr: String,
    router: Arc<Router>,
}

impl Server {
    pub fn new(addr: &str, router: Router) -> Self {
        Server {
            addr: addr.to_string(),
            router: Arc::new(router),
        }
    }

    pub fn run(&self) {
        let listener = TcpListener::bind(&self.addr).unwrap_or_else(|e| {
            panic!("Failed to bind to {}: {}", self.addr, e);
        });
        println!("🦞 NyxCode Server running on http://{}", self.addr);

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let router = Arc::clone(&self.router);
                    thread::spawn(move || {
                        handle_connection(stream, &router);
                    });
                }
                Err(e) => eprintln!("Connection error: {}", e),
            }
        }
    }
}

fn handle_connection(mut stream: std::net::TcpStream, router: &Router) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(10)));

    let request = match Request::from_stream(&mut stream) {
        Some(req) => req,
        None => return,
    };

    let method = request.method.clone();
    let path = request.path.clone();

    // Handle CORS preflight
    if method == "OPTIONS" {
        let resp = Response::no_content()
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            .header("Access-Control-Max-Age", "86400");
        resp.send(&mut stream);
        log_request(&method, &path, 204);
        return;
    }

    let response = match router.resolve(&method, &path) {
        Some((handler, params)) => {
            let mut req = request;
            req.params = params;
            handler(req)
        }
        None => {
            if router.has_path(&path) {
                Response::method_not_allowed()
            } else {
                Response::not_found()
            }
        }
    };

    let status = response.status;
    response.send(&mut stream);
    log_request(&method, &path, status);
}

fn log_request(method: &str, path: &str, status: u16) {
    let color = match status {
        200..=299 => "\x1b[32m",
        300..=399 => "\x1b[36m",
        400..=499 => "\x1b[33m",
        500..=599 => "\x1b[31m",
        _ => "\x1b[0m",
    };
    println!("  {} {}{}\x1b[0m {}", method, color, status, path);
}
