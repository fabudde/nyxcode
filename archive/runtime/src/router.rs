use std::collections::HashMap;
use std::sync::Arc;

use crate::request::Request;
use crate::response::Response;

pub type Handler = Arc<dyn Fn(Request) -> Response + Send + Sync>;

struct Route {
    method: String,
    segments: Vec<Segment>,
    handler: Handler,
}

#[derive(Clone, Debug)]
enum Segment {
    Literal(String),
    Param(String),
    Wildcard,
}

pub struct Router {
    routes: Vec<Route>,
}

impl Router {
    pub fn new() -> Self {
        Router { routes: Vec::new() }
    }

    pub fn get<F>(&mut self, pattern: &str, handler: F)
    where F: Fn(Request) -> Response + Send + Sync + 'static {
        self.add("GET", pattern, handler);
    }

    pub fn post<F>(&mut self, pattern: &str, handler: F)
    where F: Fn(Request) -> Response + Send + Sync + 'static {
        self.add("POST", pattern, handler);
    }

    pub fn put<F>(&mut self, pattern: &str, handler: F)
    where F: Fn(Request) -> Response + Send + Sync + 'static {
        self.add("PUT", pattern, handler);
    }

    pub fn delete<F>(&mut self, pattern: &str, handler: F)
    where F: Fn(Request) -> Response + Send + Sync + 'static {
        self.add("DELETE", pattern, handler);
    }

    fn add<F>(&mut self, method: &str, pattern: &str, handler: F)
    where F: Fn(Request) -> Response + Send + Sync + 'static {
        let segments = parse_pattern(pattern);
        self.routes.push(Route {
            method: method.to_uppercase(),
            segments,
            handler: Arc::new(handler),
        });
    }

    pub fn resolve(&self, method: &str, path: &str) -> Option<(Handler, HashMap<String, String>)> {
        let path_segments = split_path(path);
        for route in &self.routes {
            if route.method != method { continue; }
            if let Some(params) = match_segments(&route.segments, &path_segments) {
                return Some((Arc::clone(&route.handler), params));
            }
        }
        None
    }

    pub fn has_path(&self, path: &str) -> bool {
        let path_segments = split_path(path);
        self.routes.iter().any(|r| match_segments(&r.segments, &path_segments).is_some())
    }
}

fn parse_pattern(pattern: &str) -> Vec<Segment> {
    split_path(pattern)
        .into_iter()
        .map(|s| {
            if s == "*" { Segment::Wildcard }
            else if let Some(name) = s.strip_prefix(':') { Segment::Param(name.to_string()) }
            else { Segment::Literal(s) }
        })
        .collect()
}

fn split_path(path: &str) -> Vec<String> {
    path.split('/').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect()
}

fn match_segments(pattern: &[Segment], path: &[String]) -> Option<HashMap<String, String>> {
    let mut params = HashMap::new();
    let mut pi = 0;
    let mut si = 0;

    while pi < pattern.len() {
        match &pattern[pi] {
            Segment::Wildcard => return Some(params),
            Segment::Literal(expected) => {
                if si >= path.len() || path[si] != *expected { return None; }
                pi += 1; si += 1;
            }
            Segment::Param(name) => {
                if si >= path.len() { return None; }
                params.insert(name.clone(), path[si].clone());
                pi += 1; si += 1;
            }
        }
    }

    if si == path.len() { Some(params) } else { None }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_literal_match() {
        let mut r = Router::new();
        r.get("/hello", |_| Response::text("world"));
        assert!(r.resolve("GET", "/hello").is_some());
        assert!(r.resolve("GET", "/world").is_none());
        assert!(r.resolve("POST", "/hello").is_none());
    }

    #[test]
    fn test_param_extraction() {
        let mut r = Router::new();
        r.get("/users/:id", |_| Response::text("ok"));
        let (_, params) = r.resolve("GET", "/users/42").unwrap();
        assert_eq!(params.get("id").unwrap(), "42");
        assert!(r.resolve("GET", "/users").is_none());
        assert!(r.resolve("GET", "/users/42/extra").is_none());
    }

    #[test]
    fn test_wildcard() {
        let mut r = Router::new();
        r.get("/*", |_| Response::text("catch all"));
        assert!(r.resolve("GET", "/anything").is_some());
        assert!(r.resolve("GET", "/deep/nested/path").is_some());
    }
}
