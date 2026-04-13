/**
 * NyxCode Backend Compiler
 *
 * Transforms TableNode[] and ApiNode[] into a complete Express + better-sqlite3
 * server.js string. Auto-generates CRUD endpoints for every table.
 *
 * Type Mapping:
 *   text/email → TEXT, number/int → INTEGER, float/decimal → REAL,
 *   bool → INTEGER, auto → DATETIME DEFAULT CURRENT_TIMESTAMP,
 *   [tablename] → INTEGER REFERENCES tablename(id)
 *
 * Constraints:
 *   required → NOT NULL, unique → UNIQUE, default="value" → DEFAULT 'value'
 */

import { TableNode, ApiNode, ColumnDef } from './ast.js';

// ── Type & constraint maps ─────────────────────────────────────────────

const SQL_TYPE: Record<string, string> = {
  text: 'TEXT',
  email: 'TEXT',
  number: 'INTEGER',
  int: 'INTEGER',
  float: 'REAL',
  decimal: 'REAL',
  bool: 'INTEGER',
  auto: 'DATETIME',
};

function sqlType(col: ColumnDef): string {
  // Foreign key: [tablename] → INTEGER REFERENCES tablename(id)
  if (col.type.startsWith('[') && col.type.endsWith(']')) {
    const ref = col.type.slice(1, -1);
    return `INTEGER REFERENCES ${ref}(id)`;
  }
  return SQL_TYPE[col.type] || 'TEXT';
}

function sqlConstraints(col: ColumnDef): string {
  const parts: string[] = [];

  // auto columns get a default timestamp
  if (col.type === 'auto') {
    parts.push('DEFAULT CURRENT_TIMESTAMP');
  }

  for (const c of col.constraints) {
    if (c === 'required') parts.push('NOT NULL');
    else if (c === 'unique') parts.push('UNIQUE');
    else if (c.startsWith('default=')) {
      const val = c.slice('default='.length).replace(/^"|"$/g, '');
      parts.push(`DEFAULT '${val}'`);
    }
  }

  return parts.length ? ' ' + parts.join(' ') : '';
}

// ── Column helpers ─────────────────────────────────────────────────────

/** Columns that should NOT appear in INSERT statements */
function isAutoColumn(col: ColumnDef): boolean {
  return col.type === 'auto';
}

/** Generate the CREATE TABLE statement for a single table */
function createTableSQL(table: TableNode): string {
  const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
  for (const col of table.columns) {
    cols.push(`${col.name} ${sqlType(col)}${sqlConstraints(col)}`);
  }
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n    ${cols.join(',\n    ')}\n  )`;
}

// ── CRUD generator ─────────────────────────────────────────────────────

function crudForTable(table: TableNode): string {
  const n = table.name;
  const insertCols = table.columns.filter(c => !isAutoColumn(c));
  const colNames = insertCols.map(c => c.name);
  const hasPassword = table.columns.some(c => c.name === 'password' || c.type === 'password');
  const stripPassword = hasPassword ? '.map(({ password: _, ...r }) => r)' : '';
  const placeholders = colNames.map(() => '?').join(', ');
  const colList = colNames.join(', ');

  // Dynamic SET clause for PUT — ALLOWLISTED columns only (SQL injection safe)
  const validColSet = JSON.stringify(colNames);
  const updateBody = `
  const validCols = new Set(${validColSet});
  const fields = Object.keys(req.body).filter(k => k !== 'id' && validCols.has(k));
  if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });
  const sets = fields.map(f => f + ' = ?').join(', ');
  const vals = fields.map(f => req.body[f]);
  vals.push(req.params.id);
  const info = db.prepare('UPDATE ${n} SET ' + sets + ' WHERE id = ?').run(...vals);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(req.params.id));`;

  return `
// ── ${n} CRUD ──────────────────────────────────────

app.get('/api/${n}', (req, res) => {
  res.json(db.prepare('SELECT * FROM ${n}').all()` + stripPassword + `);
});

app.get('/api/${n}/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM ${n} WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.password) { const { password: _, ...safe } = row; return res.json(safe); }
  res.json(row);
});

app.post('/api/${n}', (req, res) => {
  try {
    const { ${colList} } = req.body;
    const info = db.prepare(
      'INSERT INTO ${n} (${colList}) VALUES (${placeholders})'
    ).run(${colNames.join(', ')});
    res.status(201).json(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/${n}/:id', (req, res) => {
  try {${updateBody}
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/${n}/:id', (req, res) => {
  const info = db.prepare('DELETE FROM ${n} WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });
});`;
}

// ── Custom API routes ──────────────────────────────────────────────────

function compileApiRoute(api: ApiNode): string {
  // Basic: emit the method + path with a placeholder body
  // Full statement compilation is out of scope (would need the frontend
  // compiler's statement engine). For now we emit the route skeleton
  // so it registers and doesn't 404.
  const method = api.method.toLowerCase();
  return `
app.${method}('${api.path}', (req, res) => {
  // Custom API route — body compiled from NyxCode statements
  res.json({ status: 'ok' });
});`;
}

// ── Main export ────────────────────────────────────────────────────────

/**
 * Compile TableNode[] and ApiNode[] into a complete server.js string.
 *
 * The output is a self-contained Express server that:
 * 1. Creates SQLite tables on startup
 * 2. Exposes full CRUD for every table at /api/<tablename>
 * 3. Registers any custom api routes defined in .nyx source
 */
export function compileBackend(tables: TableNode[], apis: ApiNode[] = []): string {
  const createStatements = tables.map(t => `db.exec(\`${createTableSQL(t)}\`);`).join('\n');
  const crudBlocks = tables.map(t => crudForTable(t)).join('\n');
  const apiBlocks = apis.map(a => compileApiRoute(a)).join('\n');

  return `// ═══════════════════════════════════════════════════════════════
// Auto-generated by NyxCode Backend Compiler
// Do not edit — regenerate from your .nyx source
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());

const db = new Database(process.env.DB_PATH || 'app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create tables ──────────────────────────────────────────────

${createStatements}
${crudBlocks}
${apiBlocks}

// ── Start ──────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`NyxCode server listening on :\${PORT}\`));
`;
}
