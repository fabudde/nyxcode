use std::fs;
use std::path::{Path, PathBuf};

use crate::mime::mime_from_path;
use crate::response::Response;

pub fn serve_static(base_dir: &str, path: &str) -> Option<Response> {
    let base = Path::new(base_dir);
    if !base.is_dir() { return None; }

    let relative = path.trim_start_matches('/');
    let relative = if relative.is_empty() { "index.html" } else { relative };

    let mut file_path: PathBuf = base.join(relative);
    let canonical_base = base.canonicalize().ok()?;

    if file_path.is_dir() {
        file_path = file_path.join("index.html");
    }

    if !file_path.exists() && file_path.extension().is_none() {
        let with_html = file_path.with_extension("html");
        if with_html.exists() { file_path = with_html; }
    }

    let canonical_file = file_path.canonicalize().ok()?;
    if !canonical_file.starts_with(&canonical_base) { return None; }

    let content = fs::read(&canonical_file).ok()?;
    let mime = mime_from_path(canonical_file.to_str().unwrap_or(""));
    Some(Response::file(content, mime))
}
