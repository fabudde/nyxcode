/// MIME type detection based on file extension.

pub fn mime_from_path(path: &str) -> &'static str {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        // Web essentials
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        "svg" => "image/svg+xml",
        "wasm" => "application/wasm",

        // Images
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "bmp" => "image/bmp",

        // Fonts
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "eot" => "application/vnd.ms-fontobject",

        // Media
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",

        // Archives / misc
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "gzip" => "application/gzip",
        "map" => "application/json",

        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_common_types() {
        assert_eq!(mime_from_path("index.html"), "text/html; charset=utf-8");
        assert_eq!(mime_from_path("style.css"), "text/css; charset=utf-8");
        assert_eq!(mime_from_path("app.js"), "application/javascript; charset=utf-8");
        assert_eq!(mime_from_path("data.json"), "application/json; charset=utf-8");
        assert_eq!(mime_from_path("logo.png"), "image/png");
        assert_eq!(mime_from_path("photo.JPG"), "image/jpeg"); // case insensitive
        assert_eq!(mime_from_path("unknown.xyz"), "application/octet-stream");
    }

    #[test]
    fn test_no_extension() {
        assert_eq!(mime_from_path("Makefile"), "application/octet-stream");
    }
}
