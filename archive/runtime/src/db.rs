use rusqlite::{Connection, Result as SqlResult};
use serde_json::{json, Value};
use std::sync::Mutex;

/// Thread-safe SQLite wrapper.
pub struct Database {
    conn: Mutex<Connection>,
}

/// Column type for schema definitions.
#[derive(Debug, Clone)]
pub enum ColumnType {
    Text,
    Integer,
    Real,
    Blob,
}

impl ColumnType {
    pub fn sql(&self) -> &'static str {
        match self {
            ColumnType::Text => "TEXT",
            ColumnType::Integer => "INTEGER",
            ColumnType::Real => "REAL",
            ColumnType::Blob => "BLOB",
        }
    }
}

/// Column definition.
#[derive(Debug, Clone)]
pub struct Column {
    pub name: String,
    pub col_type: ColumnType,
    pub nullable: bool,
    pub default: Option<String>,
}

impl Column {
    pub fn new(name: &str, col_type: ColumnType) -> Self {
        Column {
            name: name.to_string(),
            col_type,
            nullable: true,
            default: None,
        }
    }

    pub fn not_null(mut self) -> Self {
        self.nullable = false;
        self
    }

    pub fn default_value(mut self, val: &str) -> Self {
        self.default = Some(val.to_string());
        self
    }

    fn to_sql(&self) -> String {
        let mut s = format!("{} {}", self.name, self.col_type.sql());
        if !self.nullable {
            s.push_str(" NOT NULL");
        }
        if let Some(ref d) = self.default {
            s.push_str(&format!(" DEFAULT {}", d));
        }
        s
    }
}

impl Database {
    /// Open (or create) a SQLite database.
    pub fn new(path: &str) -> Self {
        let conn = Connection::open(path).expect("Failed to open SQLite database");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .expect("Failed to set PRAGMAs");
        Database {
            conn: Mutex::new(conn),
        }
    }

    /// Execute a write statement (INSERT/UPDATE/DELETE). Returns rows affected.
    pub fn execute(&self, sql: &str, params: &[Value]) -> SqlResult<usize> {
        let conn = self.conn.lock().unwrap();
        let param_refs: Vec<Box<dyn rusqlite::types::ToSql>> = params
            .iter()
            .map(|v| json_to_sql(v))
            .collect();
        let refs: Vec<&dyn rusqlite::types::ToSql> = param_refs.iter().map(|b| &**b).collect();
        conn.execute(sql, refs.as_slice())
    }

    /// Execute a read query. Returns rows as JSON objects.
    pub fn query(&self, sql: &str, params: &[Value]) -> SqlResult<Vec<Value>> {
        let conn = self.conn.lock().unwrap();
        let param_refs: Vec<Box<dyn rusqlite::types::ToSql>> = params
            .iter()
            .map(|v| json_to_sql(v))
            .collect();
        let refs: Vec<&dyn rusqlite::types::ToSql> = param_refs.iter().map(|b| &**b).collect();

        let mut stmt = conn.prepare(sql)?;
        let column_names: Vec<String> = stmt
            .column_names()
            .iter()
            .map(|c| c.to_string())
            .collect();

        let rows = stmt.query_map(refs.as_slice(), |row| {
            let mut obj = serde_json::Map::new();
            for (i, name) in column_names.iter().enumerate() {
                let val = row_value(row, i);
                obj.insert(name.clone(), val);
            }
            Ok(Value::Object(obj))
        })?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    /// Create a table if it doesn't exist. Auto-adds `id INTEGER PRIMARY KEY AUTOINCREMENT`.
    pub fn create_table(&self, table_name: &str, columns: &[Column]) -> SqlResult<()> {
        let cols: Vec<String> = columns.iter().map(|c| c.to_sql()).collect();
        let sql = format!(
            "CREATE TABLE IF NOT EXISTS {} (id INTEGER PRIMARY KEY AUTOINCREMENT, {}, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))",
            table_name,
            cols.join(", ")
        );
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(&sql)?;

        // Create updated_at trigger.
        let trigger_sql = format!(
            "CREATE TRIGGER IF NOT EXISTS {table}_updated_at AFTER UPDATE ON {table} \
             BEGIN UPDATE {table} SET updated_at = datetime('now') WHERE id = NEW.id; END;",
            table = table_name,
        );
        conn.execute_batch(&trigger_sql)?;
        Ok(())
    }

    /// Get the last inserted row id.
    pub fn last_insert_id(&self) -> i64 {
        let conn = self.conn.lock().unwrap();
        conn.last_insert_rowid()
    }

    /// Execute raw SQL batch (for migrations etc.).
    pub fn execute_batch(&self, sql: &str) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(sql)
    }
}

/// Convert a serde_json::Value into a boxed ToSql.
fn json_to_sql(v: &Value) -> Box<dyn rusqlite::types::ToSql> {
    match v {
        Value::Null => Box::new(rusqlite::types::Null),
        Value::Bool(b) => Box::new(*b as i32),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        Value::String(s) => Box::new(s.clone()),
        _ => Box::new(v.to_string()),
    }
}

/// Read a column value from a row into a serde_json::Value.
fn row_value(row: &rusqlite::Row, idx: usize) -> Value {
    // Try integer first, then float, then string, then null.
    if let Ok(v) = row.get::<_, i64>(idx) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, f64>(idx) {
        return json!(v);
    }
    if let Ok(v) = row.get::<_, String>(idx) {
        return json!(v);
    }
    Value::Null
}
