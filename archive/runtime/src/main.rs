mod crud;
mod db;
mod mime;
mod request;
mod response;
mod router;
mod server;
mod static_files;

use std::env;
use std::sync::Arc;

use db::{Column, ColumnType, Database};
use response::Response;
use router::Router;
use serde_json::json;

fn main() {
    println!("🦞 NyxCode Runtime v0.1.0");
    println!("   Self-contained HTTP + SQLite server");
    println!();

    // ── Config from env ─────────────────────────────────────────
    let port = env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let db_path = env::var("DATABASE").unwrap_or_else(|_| "app.db".to_string());
    let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| "./static".to_string());
    let addr = format!("0.0.0.0:{}", port);

    // ── Database ────────────────────────────────────────────────
    let db = Arc::new(Database::new(&db_path));

    // Example schema — in production this comes from the NyxCode compiler.
    db.create_table(
        "users",
        &[
            Column::new("name", ColumnType::Text).not_null(),
            Column::new("email", ColumnType::Text).not_null(),
            Column::new("bio", ColumnType::Text),
        ],
    )
    .expect("Failed to create users table");

    db.create_table(
        "posts",
        &[
            Column::new("title", ColumnType::Text).not_null(),
            Column::new("body", ColumnType::Text),
            Column::new("user_id", ColumnType::Integer),
            Column::new("published", ColumnType::Integer).default_value("0"),
        ],
    )
    .expect("Failed to create posts table");

    // ── Router ──────────────────────────────────────────────────
    let mut router = Router::new();

    // Health / info endpoint.
    router.get("/api/health", |_| {
        Response::json(json!({
            "status": "ok",
            "runtime": "NyxCode",
            "version": "0.1.0"
        }))
    });

    // Register CRUD for all tables.
    crud::register_crud_routes(
        &mut router,
        Arc::clone(&db),
        "users",
        &[
            Column::new("name", ColumnType::Text),
            Column::new("email", ColumnType::Text),
            Column::new("bio", ColumnType::Text),
        ],
    );
    crud::register_crud_routes(
        &mut router,
        Arc::clone(&db),
        "posts",
        &[
            Column::new("title", ColumnType::Text),
            Column::new("body", ColumnType::Text),
            Column::new("user_id", ColumnType::Integer),
            Column::new("published", ColumnType::Integer),
        ],
    );

    // Static file serving — explicit root + wildcard catch-all.
    {
        let dir1 = static_dir.clone();
        router.get("/", move |_req| {
            static_files::serve_static(&dir1, "/index.html")
                .unwrap_or_else(Response::not_found)
        });
    }
    {
        let dir2 = static_dir.clone();
        router.get("/*", move |req| {
            static_files::serve_static(&dir2, &req.path).unwrap_or_else(|| {
                // SPA fallback: serve index.html for non-file paths.
                if !req.path.contains('.') {
                    static_files::serve_static(&dir2, "/index.html")
                        .unwrap_or_else(Response::not_found)
                } else {
                    Response::not_found()
                }
            })
        });
    }

    // ── Start ───────────────────────────────────────────────────
    println!("📦 Database: {}", db_path);
    println!("📁 Static:   {}", static_dir);
    println!("🔗 API:      /api/health, /api/users, /api/posts");
    println!();

    server::Server::new(&addr, router).run();
}
