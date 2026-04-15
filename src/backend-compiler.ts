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
 *
 * Relations (v0.11):
 *   author [users] → LEFT JOIN + nested JSON response + cascade delete
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
  if (col.type.startsWith('[') && col.type.endsWith(']')) {
    const ref = col.type.slice(1, -1);
    return `INTEGER REFERENCES ${ref}(id) ON DELETE CASCADE`;
  }
  return SQL_TYPE[col.type] || 'TEXT';
}

function sqlConstraints(col: ColumnDef): string {
  const parts: string[] = [];
  if (col.type === 'auto') parts.push('DEFAULT CURRENT_TIMESTAMP');
  for (const c of col.constraints) {
    if (c === 'required') parts.push('NOT NULL');
    else if (c === 'unique') parts.push('UNIQUE');
    else if (c.startsWith('default=')) {
      const val = c.slice('default='.length).replace(/^"|"$/g, '');
      parts.push(`DEFAULT '${val.replace(/'/g, "''")}'`);
    }
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

// ── Column helpers ─────────────────────────────────────────────────────

function isAutoColumn(col: ColumnDef): boolean {
  return col.type === 'auto';
}

function createTableSQL(table: TableNode): string {
  const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
  for (const col of table.columns) {
    cols.push(`${col.name} ${sqlType(col)}${sqlConstraints(col)}`);
  }
  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n    ${cols.join(',\n    ')}\n  )`;
}

// ── Relation helpers (v0.11) ───────────────────────────────────────────

interface Relation {
  column: string;
  refTable: string;
}

function getRelations(table: TableNode): Relation[] {
  return table.columns
    .filter(c => c.type.startsWith('[') && c.type.endsWith(']'))
    .map(c => ({ column: c.name, refTable: c.type.slice(1, -1) }));
}

function buildJoinCode(table: TableNode, allTables: TableNode[]): {
  mapperFn: string;
  getAllExpr: string;
  getOneExpr: string;
} | null {
  const relations = getRelations(table);
  if (!relations.length) return null;

  const n = table.name;
  
  // Build SELECT columns
  const ownCols = [`${n}.id`];
  for (const col of table.columns) ownCols.push(`${n}.${col.name}`);

  const joins: string[] = [];
  const extraCols: string[] = [];
  const mapperLines: string[] = [];

  for (const rel of relations) {
    const ref = allTables.find(t => t.name === rel.refTable);
    if (!ref) continue;
    
    const refCols = ref.columns.filter(c => c.name !== 'password' && c.type !== 'password');
    
    joins.push(`LEFT JOIN ${rel.refTable} ON ${n}.${rel.column} = ${rel.refTable}.id`);
    extraCols.push(`${rel.refTable}.id AS __${rel.column}_id`);
    for (const rc of refCols) {
      extraCols.push(`${rel.refTable}.${rc.name} AS __${rel.column}_${rc.name}`);
    }

    // Build nested object mapper
    const fields = [`id: row.__${rel.column}_id`];
    for (const rc of refCols) fields.push(`${rc.name}: row.__${rel.column}_${rc.name}`);
    mapperLines.push(`    r.${rel.column} = row.__${rel.column}_id ? { ${fields.join(', ')} } : null;`);
  }

  const allCols = [...ownCols, ...extraCols].join(', ');
  const joinStr = joins.join(' ');
  const selectSQL = `SELECT ${allCols} FROM ${n} ${joinStr}`;

  const mapperFn = `function mapRow_${n}(row) {
    const r = { ...row };
${mapperLines.join('\n')}
    Object.keys(r).forEach(k => { if (k.startsWith('__')) delete r[k]; });
    return r;
  }`;

  return {
    mapperFn,
    getAllExpr: `db.prepare('${selectSQL}').all().map(mapRow_${n})`,
    getOneExpr: `db.prepare('${selectSQL} WHERE ${n}.id = ?').get(req.params.id)`,
  };
}

// ── CRUD generator ─────────────────────────────────────────────────────


function generateValidation(columns: ColumnDef[]): string {
  const checks: string[] = [];
  for (const col of columns) {
    const name = col.name;
    for (const c of col.constraints) {
      if (c === 'required') {
        checks.push(`if (!req.body.${name} && req.body.${name} !== 0) return res.status(400).json({ error: '${name} is required' });`);
      } else if (c.startsWith('min=')) {
        const val = c.split('=')[1];
        if (col.type === 'number' || col.type === 'int' || col.type === 'float') {
          checks.push(`if (req.body.${name} !== undefined && req.body.${name} < ${val}) return res.status(400).json({ error: '${name} must be at least ${val}' });`);
        } else {
          checks.push(`if (req.body.${name} && req.body.${name}.length < ${val}) return res.status(400).json({ error: '${name} must be at least ${val} characters' });`);
        }
      } else if (c.startsWith('max=')) {
        const val = c.split('=')[1];
        if (col.type === 'number' || col.type === 'int' || col.type === 'float') {
          checks.push(`if (req.body.${name} !== undefined && req.body.${name} > ${val}) return res.status(400).json({ error: '${name} must be at most ${val}' });`);
        } else {
          checks.push(`if (req.body.${name} && req.body.${name}.length > ${val}) return res.status(400).json({ error: '${name} must be at most ${val} characters' });`);
        }
      } else if (c.startsWith('format=')) {
        const fmt = c.split('=')[1];
        if (fmt === 'email') {
          checks.push(`if (req.body.${name} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(req.body.${name})) return res.status(400).json({ error: '${name} must be a valid email' });`);
        } else if (fmt === 'url') {
          checks.push(`if (req.body.${name} && !/^https?:\\/\\//.test(req.body.${name})) return res.status(400).json({ error: '${name} must be a valid URL' });`);
        }
      } else if (c.startsWith('pattern=')) {
        const pat = c.split('=')[1];
        checks.push(`if (req.body.${name} && !/${pat}/.test(req.body.${name})) return res.status(400).json({ error: '${name} has invalid format' });`);
      }
    }
  }
  return checks.length ? '    ' + checks.join('\n    ') + '\n' : '';
}

function crudForTable(table: TableNode, allTables: TableNode[]): string {
  const n = table.name;
  const insertCols = table.columns.filter(c => !isAutoColumn(c));
  const colNames = insertCols.map(c => c.name);
  // Separate user FK columns (auto-set from JWT) from body columns
  const userFkCols = insertCols.filter(c => c.type === '[users]');
  const bodyCols = insertCols.filter(c => c.type !== '[users]');
  const bodyColList = bodyCols.map(c => c.name).join(', ');
  const autoUserCols = userFkCols.map(c => 
    `const ${c.name} = req.user ? req.user.id : req.body.${c.name};\n    `
  ).join('');
  const hasPassword = table.columns.some(c => c.name === 'password' || c.type === 'password');
  const validationCode = generateValidation(insertCols);
  const stripPassword = hasPassword ? '.map(({ password: _, ...r }) => r)' : '';
  const placeholders = colNames.map(() => '?').join(', ');
  const colList = colNames.join(', ');

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

  // Relations: auto JOIN + nested response
  const joinCode = buildJoinCode(table, allTables);
  
  let mapperBlock = '';
  let getAllExpr = `db.prepare('SELECT * FROM ${n}').all()${stripPassword}`;
  let getOneExpr = `db.prepare('SELECT * FROM ${n} WHERE id = ?').get(req.params.id)`;
  let getOneResponse = `
  if (row.password) { const { password: _, ...safe } = row; return res.json(safe); }
  res.json(row);`;

  let postResponse = `res.status(201).json(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(info.lastInsertRowid));`;

  if (joinCode) {
    mapperBlock = '\n' + joinCode.mapperFn;
    getAllExpr = joinCode.getAllExpr;
    getOneExpr = joinCode.getOneExpr;
    getOneResponse = `\n  res.json(mapRow_${n}(row));`;
    postResponse = `const created = ${joinCode.getOneExpr.replace('req.params.id', 'info.lastInsertRowid')};
    res.status(201).json(mapRow_${n}(created));`;
  }

  // Cascade delete: delete children that reference this table BEFORE deleting parent
  const cascadeDeletes: string[] = [];
  for (const other of allTables) {
    if (other.name === n) continue;
    for (const col of other.columns) {
      if (col.type === `[${n}]`) {
        cascadeDeletes.push(`  db.prepare('DELETE FROM ${other.name} WHERE ${col.name} = ?').run(req.params.id);`);
      }
    }
  }
  let cascadeBlock = '';
  if (cascadeDeletes.length) {
    cascadeBlock = '  const deleteAll = db.transaction(() => {\n';
    cascadeBlock += '    db.pragma(\'defer_foreign_keys = ON\');\n';
    cascadeBlock += cascadeDeletes.map(d => '  ' + d).join('\n') + '\n';
    cascadeBlock += '    db.prepare(\'DELETE FROM ' + n + ' WHERE id = ?\').run(req.params.id);\n';
    cascadeBlock += '  });\n';
    cascadeBlock += '  deleteAll();\n';
    cascadeBlock += '  res.json({ deleted: true });\n';
  }

  return `
// ── ${n} CRUD ──────────────────────────────────────
${mapperBlock}
app.get('/api/${n}', (req, res) => {
  res.json(${getAllExpr});
});

app.get('/api/${n}/:id', (req, res) => {
  const row = ${getOneExpr};
  if (!row) return res.status(404).json({ error: 'Not found' });${getOneResponse}
});

app.post('/api/${n}', writeLimiter, (req, res) => {
  try {
${validationCode}    const { ${bodyColList} } = req.body;
    ${autoUserCols}const info = db.prepare(
      'INSERT INTO ${n} (${colList}) VALUES (${placeholders})'
    ).run(${colNames.join(', ')});
    ${postResponse}
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/${n}/:id', writeLimiter, (req, res) => {
  try {${updateBody}
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/${n}/:id', writeLimiter, (req, res) => {
${cascadeBlock ? cascadeBlock : `  const info = db.prepare('DELETE FROM ${n} WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ deleted: true });`}
});`;
}

// ── Custom API routes ──────────────────────────────────────────────────

function compileApiRoute(api: ApiNode): string {
  const method = api.method.toLowerCase();
  return `
app.${method}('${api.path}', (req, res) => {
  res.json({ status: 'ok' });
});`;
}

// ── Main export ────────────────────────────────────────────────────────

export function compileBackend(tables: TableNode[], apis: ApiNode[] = []): string {
  for (const t of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
      throw new Error(`Invalid table name: "${t.name}" — must be alphanumeric/underscore`);
    }
  }
  const createStatements = tables.map(t => `db.exec(\`${createTableSQL(t)}\`);`).join('\n');
  const crudBlocks = tables.map(t => crudForTable(t, tables)).join('\n');
  const apiBlocks = apis.map(a => compileApiRoute(a)).join('\n');

  return `// ═══════════════════════════════════════════════════════════════
// Auto-generated by NyxCode Backend Compiler
// Do not edit — regenerate from your .nyx source
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());

const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } });

const db = new Database(process.env.DB_PATH || 'app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create tables ──────────────────────────────────────────────

${createStatements}
${crudBlocks}
${apiBlocks}

// ── Error handler ──────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ──────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`NyxCode server listening on :\${PORT}\`));
`;
}
