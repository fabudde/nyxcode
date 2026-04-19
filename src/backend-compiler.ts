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

import { TableNode, ApiNode, ColumnDef, QueryStatement, ValidateStatement, RespondStatement, ConfigNode, HookNode, MiddlewareNode } from './ast.js';

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
  upload: 'TEXT', // stores file path
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
  const bodyCols = insertCols.filter(c => c.type !== '[users]' && c.type !== 'upload');
  const bodyColList = bodyCols.map(c => c.name).join(', ');
  const autoUserCols = userFkCols.map(c => 
    `const ${c.name} = req.user ? req.user.id : req.body.${c.name};\n    `
  ).join('');
  const hasPassword = table.columns.some(c => c.name === 'password' || c.type === 'password');
  const isRealtime = table.columns.some(c => c.constraints.includes('realtime'));
  const uploadCols = insertCols.filter(c => c.type === 'upload');
  const hasUploadCols = uploadCols.length > 0;
  const uploadFields = uploadCols.map(c => `{ name: '${c.name}', maxCount: 1 }`).join(', ');
  const uploadMiddleware = hasUploadCols ? `upload.fields([${uploadFields}]), ` : '';
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

  let postResponse = isRealtime
    ? `const newRow = db.prepare('SELECT * FROM ${n} WHERE id = ?').get(info.lastInsertRowid);
    broadcast('${n}', { event: 'insert', row: newRow });
    res.status(201).json(newRow);`
    : `res.status(201).json(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(info.lastInsertRowid));`;

  if (joinCode) {
    mapperBlock = '\n' + joinCode.mapperFn;
    getAllExpr = joinCode.getAllExpr;
    getOneExpr = joinCode.getOneExpr;
    getOneResponse = `\n  res.json(mapRow_${n}(row));`;
    postResponse = `const created = ${joinCode.getOneExpr.replace('req.params.id', 'info.lastInsertRowid')};
    ${isRealtime ? `broadcast('${n}', { event: 'insert', row: mapRow_${n}(created) });` : ''}
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

app.post('/api/${n}', ${uploadMiddleware}writeLimiter, (req, res) => {
  try {
${validationCode}    const { ${bodyColList} } = req.body;
${hasUploadCols ? uploadCols.map(uc => `    const ${uc.name} = req.files?.['${uc.name}']?.[0]?.filename || null;`).join('\n') : ''}
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


function compileHook(hook: HookNode): string {
  const method = hook.method.toLowerCase();
  const timing = hook.timing;
  
  // Extract log and query statements from body
  let code = '';
  for (const stmt of hook.body) {
    if (stmt.type === 'Query') {
      const q = stmt as QueryStatement;
      const params = [...q.sql.matchAll(/\$(\w+)/g)].map((m: any) => m[1]);
      const safeSql = q.sql.replace(/\$(\w+)/g, '?');
      const paramList = params.map(p => `req.body.${p}`).join(', ');
      code += `    db.prepare(\`${safeSql}\`).run(${paramList});
`;
    }
  }
  
  if (timing === 'before') {
    return `
// Hook: before ${hook.method} ${hook.path}
app.use('${hook.path}', (req, res, next) => {
  if (req.method === '${hook.method.toUpperCase()}') {
    try {
${code}    } catch(e) { console.error('Hook error:', e.message); }
  }
  next();
});`;
  } else {
    // After hooks use response finish event
    return `
// Hook: after ${hook.method} ${hook.path}  
app.${method}('${hook.path}', (req, res, next) => {
  res.on('finish', () => {
    try {
${code}    } catch(e) { console.error('After hook error:', e.message); }
  });
  next();
});`;
  }
}
function compileApiRoute(api: ApiNode): string {
  const method = api.method.toLowerCase();
  let middleware = '';
  if ((api as any).guard) {
    middleware = `authMiddleware, roleGuard('${(api as any).guard}'), `;
  } else if ((api as any).auth) {
    middleware = 'authMiddleware, ';
  }
  
  // Extract query statements, validate statements, respond statements from body
  const queries: QueryStatement[] = [];
  const validates: ValidateStatement[] = [];
  const responds: RespondStatement[] = [];
  
  for (const stmt of api.body) {
    if (stmt.type === 'Query') queries.push(stmt as QueryStatement);
    if (stmt.type === 'Validate') validates.push(stmt as ValidateStatement);
    if (stmt.type === 'Respond') responds.push(stmt as RespondStatement);
  }
  
  let handlerBody = '';
  
  // Generate validation code
  for (const v of validates) {
    for (const field of v.fields) {
      for (const rule of field.rules) {
        if (rule === 'required') {
          handlerBody += `    if (!req.body.${field.name} && req.body.${field.name} !== 0) return res.status(400).json({ error: '${field.name} is required' });\n`;
        } else if (rule.startsWith('min=')) {
          const val = rule.split('=')[1];
          handlerBody += `    if (req.body.${field.name} && req.body.${field.name}.length < ${val}) return res.status(400).json({ error: '${field.name} must be at least ${val} characters' });\n`;
        } else if (rule.startsWith('max=')) {
          const val = rule.split('=')[1];
          handlerBody += `    if (req.body.${field.name} && req.body.${field.name}.length > ${val}) return res.status(400).json({ error: '${field.name} must be at most ${val} characters' });\n`;
        } else if (rule.startsWith('format=')) {
          const fmt = rule.split('=')[1];
          if (fmt === 'email') handlerBody += `    if (req.body.${field.name} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(req.body.${field.name})) return res.status(400).json({ error: '${field.name} must be a valid email' });\n`;
        }
      }
    }
  }
  
  // Generate query execution
  if (queries.length > 0) {
    const q = queries[0];
    const sql = q.sql;
    // Extract $param references from SQL
    const params = [...sql.matchAll(/\$(\w+)/g)].map(m => m[1]);
    const pathParams = [...api.path.matchAll(/:(\w+)/g)].map((m: any) => m[1]);
    const paramSrc = (p: string) => pathParams.includes(p) ? 'req.params' : (method === 'get' ? 'req.query' : 'req.body');
    const paramList = params.map(p => `${paramSrc(p)}.${p}`).join(', ');
    const safeSql = sql.replace(/\$(\w+)/g, '?');
    
    if (method === 'get') {
      // SELECT → return all rows or single row
      const sqlLower = safeSql.toLowerCase();
      const isSingleRow = /\blimit\s+1\b/.test(sqlLower) || /\b(count|sum|avg|min|max)\s*\(/.test(sqlLower);
      if (isSingleRow) {
        handlerBody += `    const row = db.prepare(\`${safeSql}\`).get(${paramList});\n`;
        handlerBody += `    if (!row) return res.status(404).json({ error: 'Not found' });\n`;
        handlerBody += `    res.json(row);\n`;
      } else {
        handlerBody += `    const rows = db.prepare(\`${safeSql}\`).all(${paramList});\n`;
        handlerBody += `    res.json(rows);\n`;
      }
    } else {
      // INSERT/UPDATE/DELETE → run and return result
      if (safeSql.toLowerCase().startsWith('insert')) {
        handlerBody += `    const info = db.prepare(\`${safeSql}\`).run(${paramList});\n`;
        handlerBody += `    res.status(201).json({ id: info.lastInsertRowid, ...req.body });\n`;
      } else {
        handlerBody += `    const info = db.prepare(\`${safeSql}\`).run(${paramList});\n`;
        handlerBody += `    res.json({ changes: info.changes });\n`;
      }
    }
  } else if (responds.length > 0) {
    const r = responds[0];
    handlerBody += `    res.status(${r.status || 200}).json(${JSON.stringify(r.body || { ok: true })});\n`;
  } else {
    handlerBody += `    res.json({ ok: true });\n`;
  }
  
  return `
app.${method}('${api.path}', ${middleware}${(api.middleware || []).map(m => 'mw_' + m + ', ').join('')}(req, res) => {
  try {
${handlerBody}  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});`;
}

// ── Every blocks (background workers) ──────────────────────────────────

function compileEveryBlocks(everys: any[]): string {
  if (!everys || everys.length === 0) return '';
  
  const intervals: string[] = [];
  const cleanups: string[] = [];
  
  for (const every of everys) {
    const name = every.label ? every.label.replace(/[^a-zA-Z0-9_]/g, '_') : `worker_${every.intervalMs}`;
    const body = every.body.map((stmt: any) => compileEveryStatement(stmt)).join('\n    ');
    
    intervals.push(`
// every ${every.interval}${every.label ? ` '${every.label}'` : ''}
const interval_${name} = setInterval(async () => {
  try {
    ${body}
  } catch(e) {
    console.error('[every:${name}]', e.message);
  }
}, ${every.intervalMs});`);
    
    cleanups.push(`clearInterval(interval_${name});`);
  }
  
  return `
// ── Background Workers (every blocks) ─────────────────────────────────
${intervals.join('\n')}

process.on('SIGTERM', () => {
  ${cleanups.join('\n  ')}
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  ${cleanups.join('\n  ')}
  server.close();
  process.exit(0);
});

console.log('⏰ ${everys.length} background worker(s) started');
`;
}

function compileEveryStatement(stmt: any): string {
  if (stmt.type === 'Query') {
    // query "SQL" → db.prepare(sql).run() or .all()
    const sql = stmt.sql || stmt.value || '';
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return `const rows = db.prepare(${JSON.stringify(sql)}).all();`;
    } else {
      return `db.prepare(${JSON.stringify(sql)}).run();`;
    }
  }
  // Fallback: treat as raw JS
  return `// unsupported statement type: ${stmt.type}`;
}

// ── Main export ────────────────────────────────────────────────────────

export function compileBackend(tables: TableNode[], apis: ApiNode[] = [], config?: ConfigNode, hooks: HookNode[] = [], pagePaths: string[] = [], middlewares: MiddlewareNode[] = [], everys: any[] = []): string {
  const hasUploads = tables.some(t => t.columns.some(c => c.type === 'upload'));
  const realtimeTables = tables.filter(t => t.columns.some(c => c.constraints.includes('realtime')));
  const hasRealtime = realtimeTables.length > 0;
  const configPortDefault = config?.envVars?.find((e: any) => e.name === 'PORT')?.defaultValue;
  const defaultPort = configPortDefault || '3000';
  for (const t of tables) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)) {
      throw new Error(`Invalid table name: "${t.name}" — must be alphanumeric/underscore`);
    }
  }
    // Generate env validation
  let configValidation = '';
  if (config) {
    const checks: string[] = [];
    for (const env of config.envVars) {
      if (env.defaultValue) {
        // Set as process.env default, don't create const (avoids duplicates with auth)
        checks.push(`if (!process.env.${env.name}) process.env.${env.name} = '${env.defaultValue}';`);
      } else if (env.required) {
        checks.push(`if (!process.env.${env.name}) { console.error('❌ Missing required env: ${env.name}'); process.exit(1); }`);
      }
    }
    if (config.cors) {
      checks.push(`const cors = require('cors');`);
      checks.push(`app.use(cors({ origin: '${config.cors.origins[0]}' }));`);
    }
    configValidation = checks.join('\n');
  }

  const createStatements = tables.map(t => `db.exec(\`${createTableSQL(t)}\`);`).join('\n');
  const crudBlocks = tables.map(t => crudForTable(t, tables)).join('\n');
  const hookBlocks = hooks.map(h => compileHook(h)).join('\n');
  const apiBlocks = apis.map(a => compileApiRoute(a)).join('\n');

  return `// ═══════════════════════════════════════════════════════════════
// Auto-generated by NyxCode Backend Compiler
// Do not edit — regenerate from your .nyx source
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const app = express();

${configValidation}
app.use(express.json());

${hasUploads ? `const multer = require('multer');
const uploadDir = './uploads';
require('fs').mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB default
` : ''}
${hasUploads ? "app.use('/uploads', express.static(uploadDir));" : ''}

${hasRealtime ? `const { WebSocketServer } = require('ws');
const wsClients = new Map(); // table -> Set<ws>

function broadcast(table, data) {
  const clients = wsClients.get(table);
  if (!clients) return;
  const msg = JSON.stringify({ table, ...data });
  clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}
` : ''}
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } });

const db = new Database(process.env.DB_PATH || 'app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Create tables ──────────────────────────────────────────────

${createStatements}
${crudBlocks}
${apiBlocks}
${hookBlocks}

// ── Role guard middleware ────────────────────────────────────
function roleGuard(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (!user || user.role !== role) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// ── Named Middleware ──────────────────────────────────────────
${middlewares.map(m => `function mw_${m.name}(req, res, next) { ${m.body}; next(); }`).join('\n')}

// ── Error handler ──────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: err.message });
});



// ── Static File Serving ─────────────────────────────────────────
const distDir = path.join(__dirname, '.');
app.use(express.static(distDir));

// ── Start ──────────────────────────────────────────────────────

const PORT = process.env.PORT || ${defaultPort};
const server = app.listen(PORT, () => console.log(\`NyxCode server listening on :\${PORT}\`));
${compileEveryBlocks(everys)}
${hasRealtime ? `
// WebSocket server for realtime tables
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const table = url.searchParams.get('table');
  if (!table) return ws.close(1008, 'Missing table param');
  if (!wsClients.has(table)) wsClients.set(table, new Set());
  wsClients.get(table).add(ws);
  ws.on('close', () => wsClients.get(table)?.delete(ws));
});
console.log('WebSocket ready');
` : ''}
`;
}
