use std::sync::Arc;

use serde_json::json;

use crate::db::{Column, Database};
use crate::response::Response;
use crate::router::Router;

/// Register full CRUD routes for a table.
///
/// Creates:
///   GET    /api/{table}       → list all
///   GET    /api/{table}/:id   → get one
///   POST   /api/{table}       → create
///   PUT    /api/{table}/:id   → update
///   DELETE /api/{table}/:id   → delete
pub fn register_crud_routes(
    router: &mut Router,
    db: Arc<Database>,
    table: &str,
    columns: &[Column],
) {
    let table_owned = table.to_string();
    let cols: Vec<String> = columns.iter().map(|c| c.name.clone()).collect();

    // ── GET /api/{table} ─── List all ───────────────────────────
    {
        let db = Arc::clone(&db);
        let table = table_owned.clone();
        let route = format!("/api/{}", table);
        router.get(&route, move |req| {
            // Support ?limit=N&offset=M
            let limit: i64 = req
                .query
                .get("limit")
                .and_then(|v| v.parse().ok())
                .unwrap_or(100);
            let offset: i64 = req
                .query
                .get("offset")
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);

            let sql = format!(
                "SELECT * FROM {} ORDER BY id DESC LIMIT ? OFFSET ?",
                table
            );
            match db.query(&sql, &[json!(limit), json!(offset)]) {
                Ok(rows) => Response::json(json!({
                    "data": rows,
                    "count": rows.len(),
                })),
                Err(e) => Response::error(&format!("Database error: {}", e)),
            }
        });
    }

    // ── GET /api/{table}/:id ─── Get one ────────────────────────
    {
        let db = Arc::clone(&db);
        let table = table_owned.clone();
        let route = format!("/api/{}/:id", table);
        router.get(&route, move |req| {
            let id = req.params.get("id").cloned().unwrap_or_default();
            let sql = format!("SELECT * FROM {} WHERE id = ?", table);
            match db.query(&sql, &[json!(id)]) {
                Ok(rows) if !rows.is_empty() => Response::json(rows[0].clone()),
                Ok(_) => Response::not_found(),
                Err(e) => Response::error(&format!("Database error: {}", e)),
            }
        });
    }

    // ── POST /api/{table} ─── Create ────────────────────────────
    {
        let db = Arc::clone(&db);
        let table = table_owned.clone();
        let cols = cols.clone();
        let route = format!("/api/{}", table);
        router.post(&route, move |req| {
            let body = match req.json() {
                Some(v) => v,
                None => return Response::bad_request("Invalid JSON body"),
            };

            let mut insert_cols = Vec::new();
            let mut placeholders = Vec::new();
            let mut values = Vec::new();

            for col_name in &cols {
                if let Some(val) = body.get(col_name) {
                    insert_cols.push(col_name.clone());
                    placeholders.push("?".to_string());
                    values.push(val.clone());
                }
            }

            if insert_cols.is_empty() {
                return Response::bad_request("No valid columns in request body");
            }

            let sql = format!(
                "INSERT INTO {} ({}) VALUES ({})",
                table,
                insert_cols.join(", "),
                placeholders.join(", ")
            );

            match db.execute(&sql, &values) {
                Ok(_) => {
                    let id = db.last_insert_id();
                    // Fetch the created row.
                    let fetch_sql = format!("SELECT * FROM {} WHERE id = ?", table);
                    match db.query(&fetch_sql, &[json!(id)]) {
                        Ok(rows) if !rows.is_empty() => Response::created(rows[0].clone()),
                        _ => Response::created(json!({ "id": id })),
                    }
                }
                Err(e) => Response::error(&format!("Insert failed: {}", e)),
            }
        });
    }

    // ── PUT /api/{table}/:id ─── Update ─────────────────────────
    {
        let db = Arc::clone(&db);
        let table = table_owned.clone();
        let cols = cols.clone();
        let route = format!("/api/{}/:id", table);
        router.put(&route, move |req| {
            let id = req.params.get("id").cloned().unwrap_or_default();
            let body = match req.json() {
                Some(v) => v,
                None => return Response::bad_request("Invalid JSON body"),
            };

            let mut set_parts = Vec::new();
            let mut values = Vec::new();

            for col_name in &cols {
                if let Some(val) = body.get(col_name) {
                    set_parts.push(format!("{} = ?", col_name));
                    values.push(val.clone());
                }
            }

            if set_parts.is_empty() {
                return Response::bad_request("No valid columns to update");
            }

            values.push(json!(id));
            let sql = format!(
                "UPDATE {} SET {} WHERE id = ?",
                table,
                set_parts.join(", ")
            );

            match db.execute(&sql, &values) {
                Ok(0) => Response::not_found(),
                Ok(_) => {
                    let fetch_sql = format!("SELECT * FROM {} WHERE id = ?", table);
                    match db.query(&fetch_sql, &[json!(id)]) {
                        Ok(rows) if !rows.is_empty() => Response::json(rows[0].clone()),
                        _ => Response::json(json!({ "ok": true })),
                    }
                }
                Err(e) => Response::error(&format!("Update failed: {}", e)),
            }
        });
    }

    // ── DELETE /api/{table}/:id ─── Delete ──────────────────────
    {
        let db = Arc::clone(&db);
        let table = table_owned.clone();
        let route = format!("/api/{}/:id", table);
        router.delete(&route, move |req| {
            let id = req.params.get("id").cloned().unwrap_or_default();
            let sql = format!("DELETE FROM {} WHERE id = ?", table);
            match db.execute(&sql, &[json!(id)]) {
                Ok(0) => Response::not_found(),
                Ok(_) => Response::no_content(),
                Err(e) => Response::error(&format!("Delete failed: {}", e)),
            }
        });
    }
}
