import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(process.env.DATABASE_PATH || path.join(process.cwd(), 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat REAL,
    lon REAL
  );
`);

export default db;
