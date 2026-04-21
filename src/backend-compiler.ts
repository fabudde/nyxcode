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

import { TableNode, ApiNode, ColumnDef, QueryStatement, ValidateStatement, RespondStatement, ConfigNode, HookNode, MiddlewareNode, ActionNode, EnvNode, EmailStatement, PipeNode, PipeStep } from './ast.js';

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

function crudForTable(table: TableNode, allTables: TableNode[], onEvents: any[] = []): string {
  const n = table.name;

  // Generate on-event hook calls for this table (v0.30)
  const tableEvents = onEvents.filter((e: any) => e.table === n);
  const createdHook = tableEvents.find((e: any) => e.event === 'created')
    ? `\n    onEvent_${n}_created(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(info.lastInsertRowid));` : '';
  const updatedHook = tableEvents.find((e: any) => e.event === 'updated')
    ? `\n    onEvent_${n}_updated(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(req.params.id));` : '';
  const deletedHook = tableEvents.find((e: any) => e.event === 'deleted')
    ? `\n    onEvent_${n}_deleted({ id: req.params.id });` : '';

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

  // Column metadata for filtering/search (Feature 2 & 3)
  const allColNames = table.columns.map(c => c.name);
  const textColNames = table.columns
    .filter(c => c.type === 'text' || c.type === 'email')
    .map(c => c.name);
  const validColSetLiteral = JSON.stringify(allColNames);
  const textColSetLiteral = JSON.stringify(textColNames);

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
  res.json(db.prepare('SELECT * FROM ${n} WHERE id = ?').get(req.params.id));${updatedHook}`;

  // Relations: auto JOIN + nested response
  const joinCode = buildJoinCode(table, allTables);
  
  let mapperBlock = '';
  let mapperSuffix = stripPassword;
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
    mapperSuffix = `.map(mapRow_${n})`;
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
  // ── Filtering & Search ──
  const validColumns = new Set(${validColSetLiteral});
  const textColumns = ${textColSetLiteral};
  const filters = [];
  const params = [];
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'page' || key === 'limit' || key === 'search') continue;
    if (validColumns.has(key)) {
      filters.push(key + ' = ?');
      params.push(value);
    }
  }
  if (req.query.search && textColumns.length > 0) {
    filters.push('(' + textColumns.map(c => c + ' LIKE ?').join(' OR ') + ')');
    textColumns.forEach(() => params.push('%' + req.query.search + '%'));
  }
  const where = filters.length > 0 ? ' WHERE ' + filters.join(' AND ') : '';

  // ── Pagination (opt-in: only when ?page= or ?limit= is provided) ──
  if (req.query.page || req.query.limit) {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const total = db.prepare('SELECT COUNT(*) as count FROM ${n}' + where).get(...params).count;
    const rows = db.prepare('SELECT * FROM ${n}' + where + ' LIMIT ? OFFSET ?').all(...params, limit, offset)${mapperSuffix};
    return res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }

  // ── Default: return plain array (backwards-compatible) ──
  const rows = db.prepare('SELECT * FROM ${n}' + where).all(...params)${mapperSuffix};
  res.json(rows);
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
    ).run(${colNames.join(', ')});${createdHook}
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
  if (!info.changes) return res.status(404).json({ error: 'Not found' });${deletedHook}
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
      const safeSql = q.sql.replace(/\$([\w.]+)/g, '?');
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
  
  // Extract statements from body — sequential order preserved for let/query/respond
  const queries: QueryStatement[] = [];
  const validates: ValidateStatement[] = [];
  const responds: RespondStatement[] = [];
  const lets: any[] = [];
  const emails: any[] = [];
  const actionCalls: any[] = [];
  
  for (const stmt of api.body) {
    if (stmt.type === 'Query') queries.push(stmt as QueryStatement);
    if (stmt.type === 'Validate') validates.push(stmt as ValidateStatement);
    if (stmt.type === 'Respond') responds.push(stmt as RespondStatement);
    if (stmt.type === 'Let') lets.push(stmt);
    if (stmt.type === 'Email') emails.push(stmt);
    if (stmt.type === 'ActionCall') actionCalls.push(stmt);
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
  
  // Generate let bindings (v0.30)
  for (const l of lets) {
    if (l.value.kind === 'query') {
      const sql = l.value.sql;
      const params = [...sql.matchAll(/\$([\w.]+)/g)].map(m => m[1]);
      const paramList = params.map(p => p.startsWith('req.') ? p : `req.body.${p}`).join(', ');
      const safeSql = sql.replace(/\$([\w.]+)/g, '?');
      const isSingleRow = /\blimit\s+1\b/i.test(safeSql) || /\bWHERE\s+\w+\s*=\s*\?/i.test(safeSql);
      if (isSingleRow) {
        handlerBody += `    const ${l.name} = db.prepare(\`${safeSql}\`).get(${paramList});\n`;
      } else {
        handlerBody += `    const ${l.name} = db.prepare(\`${safeSql}\`).all(${paramList});\n`;
      }
    } else if (l.value.kind === 'builtin') {
      const fn = l.value.fn;
      const args = l.value.args;
      if (['sum', 'count', 'avg', 'min', 'max'].includes(fn)) {
        handlerBody += `    const ${l.name} = ${args[0]}.reduce((a, b) => a + (Number(b.${args[1]?.replace(/"/g, '')}) || 0), 0);\n`;
      } else if (fn === 'len') {
        handlerBody += `    const ${l.name} = ${args[0]}.length;\n`;
      }
    } else if (l.value.kind === 'call') {
      handlerBody += `    const ${l.name} = await ${l.value.target}.${l.value.method}(${l.value.args.join(', ')});\n`;
    } else if (l.value.kind === 'arithmetic') {
      handlerBody += `    const ${l.name} = ${l.value.expr};\n`;
    }
  }

  // Generate action calls (v0.30)
  for (const ac of actionCalls) {
    handlerBody += `    await action_${ac.name}(${ac.args.join(', ')});\n`;
  }

  // Generate email sends (v0.30)
  for (const em of emails) {
    handlerBody += `    await sendEmail({ to: ${em.to}, subject: ${JSON.stringify(em.subject)}, body: ${JSON.stringify(em.body)} });\n`;
  }

  // Generate query execution
  if (queries.length > 0) {
    const pathParams = [...api.path.matchAll(/:(\w+)/g)].map((m: any) => m[1]);
    const paramSrc = (p: string) => {
      if (p.startsWith('req.')) return '';
      return pathParams.includes(p) ? 'req.params' : (method === 'get' ? 'req.query' : 'req.body');
    };

    if (method === 'get') {
      // GET: use first query only
      const q = queries[0];
      const sql = q.sql;
      const params = [...sql.matchAll(/\$([\w.]+)/g)].map(m => m[1]);
      const paramList = params.map(p => p.startsWith('req.') ? p : `${paramSrc(p)}.${p}`).join(', ');
      const safeSql = sql.replace(/\$([\w.]+)/g, '?');
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
      // POST/PUT/DELETE: execute ALL queries sequentially, respond after last
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        const sql = q.sql;
        const params = [...sql.matchAll(/\$([\w.]+)/g)].map(m => m[1]);
        const paramList = params.map(p => p.startsWith('req.') ? p : `${paramSrc(p)}.${p}`).join(', ');
        const safeSql = sql.replace(/\$([\w.]+)/g, '?');
        const isLast = i === queries.length - 1;
        
        if (isLast) {
          if (safeSql.toLowerCase().startsWith('insert')) {
            handlerBody += `    const info = db.prepare(\`${safeSql}\`).run(${paramList});\n`;
            handlerBody += `    res.status(201).json({ id: info.lastInsertRowid, ...req.body });\n`;
          } else {
            handlerBody += `    const info = db.prepare(\`${safeSql}\`).run(${paramList});\n`;
            handlerBody += `    res.json({ changes: info.changes });\n`;
          }
        } else {
          handlerBody += `    db.prepare(\`${safeSql}\`).run(${paramList});\n`;
        }
      }
    }
  } else if (responds.length > 0) {
    const r = responds[0];
    if (r.body && typeof r.body === 'object') {
      // Build response object, resolving variable references
      const entries = Object.entries(r.body).map(([k, v]) => {
        if (typeof v === 'object' && v !== null && (v as any).isRef) {
          return `${JSON.stringify(k)}: ${(v as any).value}`;
        }
        return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
      });
      handlerBody += `    res.status(${r.status || 200}).json({ ${entries.join(', ')} });\n`;
    } else {
      handlerBody += `    res.status(${r.status || 200}).json(${JSON.stringify(r.body || { ok: true })});\n`;
    }
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

// ── Action blocks (reusable server-side functions) ─────────────────────

function compileAction(action: any): string {
  const params = action.params.map((p: any) => p.name).join(', ');
  let body = '';
  
  for (const stmt of action.body) {
    if (stmt.type === 'Let') {
      if (stmt.value.kind === 'query') {
        const sql = stmt.value.sql;
        const safeSql = sql.replace(/\$([\w.]+)/g, '?');
        const params = [...sql.matchAll(/\$([\w.]+)/g)].map((m: any) => m[1]);
        body += `    const ${stmt.name} = db.prepare(\`${safeSql}\`).get(${params.join(', ')});\n`;
      } else if (stmt.value.kind === 'call') {
        body += `    const ${stmt.name} = await ${stmt.value.target}.${stmt.value.method}(${stmt.value.args.join(', ')});\n`;
      } else {
        body += `    const ${stmt.name} = ${stmt.value.expr || 'null'};\n`;
      }
    } else if (stmt.type === 'Email') {
      body += `    await sendEmail({ to: ${stmt.to}, subject: ${JSON.stringify(stmt.subject)}, body: ${JSON.stringify(stmt.body)} });\n`;
    } else if (stmt.type === 'Query') {
      const safeSql = stmt.sql.replace(/\$([\w.]+)/g, '?');
      const sqlParams = [...stmt.sql.matchAll(/\$([\w.]+)/g)].map((m: any) => m[1]);
      body += `    db.prepare(\`${safeSql}\`).run(${sqlParams.join(', ')});\n`;
    } else if (stmt.type === 'ActionCall') {
      body += `    await action_${stmt.name}(${stmt.args.join(', ')});\n`;
    } else if (stmt.type === 'Respond') {
      body += `    return { status: ${stmt.status || 200}, body: ${JSON.stringify(stmt.body || {})} };\n`;
    }
  }
  
  let errorBlock = '';
  if (action.errorHandler) {
    errorBlock = `  } catch (e) {\n`;
    for (const stmt of action.errorHandler) {
      if (stmt.type === 'Respond') {
        errorBlock += `    return { status: ${stmt.status || 500}, body: ${JSON.stringify(stmt.body || { error: 'Internal error' })} };\n`;
      }
    }
  } else {
    errorBlock = `  } catch (e) {\n    console.error('[action:${action.name}]', e.message);\n    throw e;\n`;
  }
  
  return `
// action ${action.name}(${params})
async function action_${action.name}(${params}) {
  try {
${body}${errorBlock}  }
}
`;
}

// ── Env validation ─────────────────────────────────────────────────────

function compileEnvNode(env: any): string {
  if (!env || !env.vars || env.vars.length === 0) return '';
  
  const checks: string[] = [];
  for (const v of env.vars) {
    if (v.required) {
      checks.push(`if (!process.env.${v.name}) { console.error('Missing required env: ${v.name}'); process.exit(1); }`);
    } else if (v.defaultValue) {
      checks.push(`if (!process.env.${v.name}) process.env.${v.name} = '${v.defaultValue}';`);
    }
  }
  
  return `
// ── Environment Validation ─────────────────────────────────────────────
${checks.join('\n')}
`;
}

// ── Use Statements (package imports) ──────────────────────────────────

const TIER1_ADAPTERS: Record<string, { require: string; varName: string; init: string }> = {
  stripe: {
    require: "const Stripe = require('stripe');",
    varName: 'stripe',
    init: "const stripe = Stripe(process.env.STRIPE_KEY || process.env.STRIPE_SECRET_KEY);"
  },
  nodemailer: {
    require: "const nodemailer = require('nodemailer');",
    varName: 'mailer',
    init: `const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
});
async function sendEmail({ to, subject, body }) {
  return mailer.sendMail({ from: process.env.SMTP_FROM || 'noreply@localhost', to, subject, html: body });
}`
  },
  redis: {
    require: "const Redis = require('ioredis');",
    varName: 'redis',
    init: "const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');"
  },
  bcrypt: {
    require: "const bcrypt = require('bcryptjs');",
    varName: 'bcrypt',
    init: ''
  },
  jsonwebtoken: {
    require: "const jwt = require('jsonwebtoken');",
    varName: 'jwt',
    init: ''
  },
  'better-sqlite3': {
    require: '', // already included
    varName: '',
    init: ''
  },
  sharp: {
    require: "const sharp = require('sharp');",
    varName: 'sharp',
    init: ''
  },
  resend: {
    require: "const { Resend } = require('resend');",
    varName: 'resend',
    init: "const resend = new Resend(process.env.RESEND_API_KEY);"
  },
  uuid: {
    require: "const { v4: uuidv4 } = require('uuid');",
    varName: 'uuidv4',
    init: ''
  }
};

const BLOCKED_PACKAGES = new Set([
  'child_process', 'fs', 'eval', 'vm', 'cluster', 'worker_threads',
  'dgram', 'net', 'tls', 'http2', 'os', 'process', 'crypto'
]);

function compileUseStatements(useStmts: any[]): { imports: string; init: string } {
  if (!useStmts || useStmts.length === 0) return { imports: '', init: '' };
  
  const imports: string[] = [];
  const inits: string[] = [];
  
  for (const u of useStmts) {
    if (!u.packageMode) continue; // skip file imports
    
    if (u.packageMode === 'builtin') {
      const adapter = TIER1_ADAPTERS[u.packageName];
      if (adapter) {
        if (adapter.require) imports.push(adapter.require);
        if (adapter.init) inits.push(adapter.init);
      }
    } else if (u.packageMode === 'npm') {
      if (BLOCKED_PACKAGES.has(u.packageName)) {
        throw new Error(`[NyxCode] BLOCKED: '${u.packageName}' is not allowed for security reasons.`);
      }
      // Tier 2: raw require with sanitized variable name
      const safeName = u.packageName.replace(/[^a-zA-Z0-9_]/g, '_');
      imports.push(`const ${safeName} = require('${u.packageName}'); // ⚠️ Tier 2: unverified npm package`);
    }
  }
  
  return {
    imports: imports.length ? '\n// ── Package Imports ──\n' + imports.join('\n') : '',
    init: inits.length ? '\n// ── Package Init ──\n' + inits.join('\n') : ''
  };
}

// ── On Events (table lifecycle hooks) ──────────────────────────────────

function compileOnEvents(onEvents: any[]): string {
  if (!onEvents || onEvents.length === 0) return '';
  
  const blocks: string[] = [];
  
  for (const ev of onEvents) {
    const funcName = `onEvent_${ev.table}_${ev.event}`;
    let body = '';
    
    for (const stmt of ev.body) {
      if (stmt.type === 'Let') {
        if (stmt.value.kind === 'query') {
          const safeSql = stmt.value.sql.replace(/\$(\w[\w.]*)/g, '?');
          const params = [...stmt.value.sql.matchAll(/\$(\w[\w.]*)/g)].map((m: any) => m[1]);
          const paramList = params.map((p: string) => p.startsWith('row.') ? `row.${p.slice(4)}` : p).join(', ');
          body += `    const ${stmt.name} = db.prepare(\`${safeSql}\`).get(${paramList});\n`;
        } else if (stmt.value.kind === 'call') {
          body += `    const ${stmt.name} = await ${stmt.value.target}.${stmt.value.method}(${stmt.value.args.join(', ')});\n`;
        }
      } else if (stmt.type === 'Query') {
        const safeSql = (stmt as any).sql.replace(/\$(\w[\w.]*)/g, '?');
        const params = [...(stmt as any).sql.matchAll(/\$(\w[\w.]*)/g)].map((m: any) => m[1]);
        const paramList = params.map((p: string) => p.startsWith('row.') ? `row.${p.slice(4)}` : p).join(', ');
        body += `    db.prepare(\`${safeSql}\`).run(${paramList});\n`;
      } else if (stmt.type === 'ActionCall') {
        body += `    await action_${(stmt as any).name}(${(stmt as any).args.join(', ')});\n`;
      } else if (stmt.type === 'Email') {
        body += `    await sendEmail({ to: ${(stmt as any).to}, subject: ${JSON.stringify((stmt as any).subject)}, body: ${JSON.stringify((stmt as any).body)} });\n`;
      }
    }
    
    blocks.push(`
// on ${ev.table}.${ev.event}
async function ${funcName}(row) {
  try {
${body}  } catch(e) {
    console.error('[on:${ev.table}.${ev.event}]', e.message);
  }
}`);
  }
  
  return `
// ── Table Lifecycle Events ─────────────────────────────────────────────
${blocks.join('\n')}
`;
}

// ── Every blocks (background workers) ──────────────────────────────────

function compileEveryBlocks(everys: any[]): string {
  if (!everys || everys.length === 0) return '';
  
  const intervals: string[] = [];
  const cleanups: string[] = [];
  
  for (const every of everys) {
    const name = every.label ? every.label.replace(/[^a-zA-Z0-9_]/g, '_') : `worker_${every.intervalMs}`;
    const body = compileEveryBody(every.body);
    
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

/**
 * Compile an every-block body with multi-statement support.
 *
 * If the first statement is a SELECT query, its result is stored in `rows`.
 * Subsequent statements that reference `$row.field` are wrapped in a
 * `for (const row of rows)` loop, with `$row.field` compiled to `row.field`.
 * This enables patterns like:
 *
 *   every 60s 'health-check' {
 *     query "SELECT id, url FROM monitors"
 *     query "UPDATE monitors SET last_check = datetime('now') WHERE id = $row.id"
 *   }
 */
function compileEveryBody(stmts: any[]): string {
  if (!stmts || stmts.length === 0) return '    // empty body';

  // Single statement — simple path
  if (stmts.length === 1) {
    return '    ' + compileEveryStatement(stmts[0]);
  }

  // Multi-statement: check if first is a SELECT (produces rows)
  const first = stmts[0];
  const firstSql = (first.type === 'Query') ? (first.sql || first.value || '') : '';
  const firstIsSelect = firstSql.trim().toUpperCase().startsWith('SELECT');

  if (!firstIsSelect) {
    // No leading SELECT — just emit all statements sequentially
    return stmts.map((s: any) => '    ' + compileEveryStatement(s)).join('\n');
  }

  // First is SELECT → store in `rows`, then check remaining for $row references
  const lines: string[] = [];
  lines.push(`    const rows = db.prepare(${JSON.stringify(firstSql)}).all();`);

  // Partition remaining statements into row-dependent and independent
  const remaining = stmts.slice(1);
  const hasRowRef = (s: any): boolean => {
    if (s.type === 'Query') {
      const sql = s.sql || s.value || '';
      return /\$row\./.test(sql);
    }
    return false;
  };

  const anyRowRefs = remaining.some(hasRowRef);

  if (anyRowRefs) {
    lines.push('    for (const row of rows) {');
    for (const stmt of remaining) {
      lines.push('      ' + compileEveryStatementInLoop(stmt));
    }
    lines.push('    }');
  } else {
    // No $row references — just emit sequentially after the SELECT
    for (const stmt of remaining) {
      lines.push('    ' + compileEveryStatement(stmt));
    }
  }

  return lines.join('\n');
}

/**
 * Compile a single statement inside a `for (const row of rows)` loop.
 * Replaces `$row.field` with `row.field` in SQL and uses parameterized queries.
 */
function compileEveryStatementInLoop(stmt: any): string {
  if (stmt.type === 'Query') {
    const sql = stmt.sql || stmt.value || '';
    // Special: "fetch $row.url" pattern → HTTP health check
    if (sql.trim().startsWith('fetch ')) {
      const urlField = sql.trim().replace('fetch ', '').replace('$row.', 'row.');
      return `const start = Date.now();
      try {
        const res = await fetch(${urlField}, { signal: AbortSignal.timeout(10000) });
        const ms = Date.now() - start;
        db.prepare("INSERT INTO checks (monitor_id, status, response_ms, status_code, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(row.id, res.ok ? 'up' : 'down', ms, res.status);
        db.prepare("UPDATE monitors SET status = ?, last_check = datetime('now'), avg_response_ms = ? WHERE id = ?").run(res.ok ? 'up' : 'down', ms, row.id);
      } catch(fetchErr) {
        const ms = Date.now() - start;
        db.prepare("INSERT INTO checks (monitor_id, status, response_ms, error_msg, created_at) VALUES (?, 'down', ?, ?, datetime('now'))").run(row.id, ms, fetchErr.message);
        db.prepare("UPDATE monitors SET status = 'down', last_check = datetime('now') WHERE id = ?").run(row.id);
      }`;
    }
    // Extract $row.field references for parameterized binding
    const rowRefs = [...sql.matchAll(/\$row\.(\w+)/g)].map((m: any) => m[1]);
    if (rowRefs.length > 0) {
      const safeSql = sql.replace(/\$row\.(\w+)/g, '?');
      const params = rowRefs.map((f: string) => `row.${f}`).join(', ');
      if (safeSql.trim().toUpperCase().startsWith('SELECT')) {
        return `const result = db.prepare(${JSON.stringify(safeSql)}).all(${params});`;
      } else {
        return `db.prepare(${JSON.stringify(safeSql)}).run(${params});`;
      }
    }
    // No $row refs inside loop — just compile normally
    return compileEveryStatement(stmt);
  }
  return compileEveryStatement(stmt);
}

function compileEveryStatement(stmt: any): string {
  if (stmt.type === 'Query') {
    const sql = stmt.sql || stmt.value || '';
    // Special: "fetch $row.url" pattern → HTTP health check with response tracking
    if (sql.trim().startsWith('fetch ')) {
      const urlField = sql.trim().replace('fetch ', '').replace('$row.', 'row.');
      return `const start = Date.now();
    try {
      const res = await fetch(${urlField}, { signal: AbortSignal.timeout(10000) });
      const ms = Date.now() - start;
      db.prepare("INSERT INTO checks (monitor_id, status, response_ms, status_code, created_at) VALUES (?, ?, ?, ?, datetime('now'))").run(row.id, res.ok ? 'up' : 'down', ms, res.status);
      db.prepare("UPDATE monitors SET status = ?, last_check = datetime('now'), avg_response_ms = ? WHERE id = ?").run(res.ok ? 'up' : 'down', ms, row.id);
    } catch(fetchErr) {
      const ms = Date.now() - start;
      db.prepare("INSERT INTO checks (monitor_id, status, response_ms, error_msg, created_at) VALUES (?, 'down', ?, ?, datetime('now'))").run(row.id, ms, fetchErr.message);
      db.prepare("UPDATE monitors SET status = 'down', last_check = datetime('now') WHERE id = ?").run(row.id);
    }`;
    }
    // Regular SQL
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return `const rows = db.prepare(${JSON.stringify(sql)}).all();`;
    } else {
      return `db.prepare(${JSON.stringify(sql)}).run();`;
    }
  }
  // Fallback: emit as comment for unsupported statement types
  return `// TODO: unsupported statement in every block: ${stmt.type}`;
}


// ── Pipe blocks (v0.32.0 — declarative logic chains) ──────────────────

function compilePipeStateTable(): string {
  return `
db.exec(\`CREATE TABLE IF NOT EXISTS _pipe_state (
  pipe_name TEXT,
  row_key TEXT,
  field_name TEXT,
  last_value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (pipe_name, row_key, field_name)
)\`);`;
}

function compilePipeExpr(expr: string): string {
  return expr
    .replace(/\$body\.(\w+)/g, 'ctx.req.body.$1')
    .replace(/\$req\.(\w[\w.]*)/g, 'ctx.req.$1')
    .replace(/\$row\.(\w+)/g, 'ctx.row.$1')
    .replace(/\$(\w+)/g, 'ctx.$1');
}

function compilePipeSql(sql: string): { safeSql: string; paramList: string[] } {
  const params = [...sql.matchAll(/\$(\w[\w.]*)/g)].map(m => m[1]);
  const safeSql = sql.replace(/\$[\w.]+/g, '?');
  const paramList = params.map(p => {
    if (p.startsWith('body.')) return `ctx.req.body.${p.slice(5)}`;
    if (p.startsWith('req.')) return `ctx.req.${p.slice(4)}`;
    if (p.startsWith('row.')) return `ctx.row.${p.slice(4)}`;
    return `ctx.${p}`;
  });
  return { safeSql, paramList };
}

function compilePipeStep(step: any, pipeName: string, indent: string = '    '): string {
  switch (step.type) {
    case 'PipeValidate': {
      const lines: string[] = [];
      for (const f of step.fields) {
        const fieldPath = f.field.replace(/^\$/, '');
        const accessor = fieldPath.startsWith('body.') ? `ctx.req.${fieldPath}` :
          fieldPath.startsWith('req.') ? `ctx.${fieldPath}` : `ctx.req.body.${fieldPath}`;
        for (const check of f.checks) {
          if (check.kind === 'email') {
            lines.push(`${indent}if (${accessor} && !/^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$/.test(${accessor})) return ctx.res?.status(400).json({ error: '${fieldPath} must be a valid email' });`);
          } else if (check.kind === 'url') {
            lines.push(`${indent}if (${accessor} && !/^https?:\\\\/\\\\//.test(${accessor})) return ctx.res?.status(400).json({ error: '${fieldPath} must be a valid URL' });`);
          } else if (check.kind === 'number') {
            lines.push(`${indent}if (${accessor} !== undefined && isNaN(Number(${accessor}))) return ctx.res?.status(400).json({ error: '${fieldPath} must be a number' });`);
          } else if (check.kind === 'string') {
            lines.push(`${indent}if (${accessor} !== undefined && typeof ${accessor} !== 'string') return ctx.res?.status(400).json({ error: '${fieldPath} must be a string' });`);
          } else if (check.kind === 'required') {
            lines.push(`${indent}if (!${accessor} && ${accessor} !== 0) return ctx.res?.status(400).json({ error: '${fieldPath} is required' });`);
          } else if (check.kind === 'min') {
            lines.push(`${indent}if (${accessor} !== undefined && ${accessor}.length < ${check.value}) return ctx.res?.status(400).json({ error: '${fieldPath} must be at least ${check.value} characters' });`);
          } else if (check.kind === 'max') {
            lines.push(`${indent}if (${accessor} !== undefined && ${accessor}.length > ${check.value}) return ctx.res?.status(400).json({ error: '${fieldPath} must be at most ${check.value} characters' });`);
          }
        }
      }
      return lines.join('\n');
    }
    case 'PipeQuery': {
      const { safeSql, paramList } = compilePipeSql(step.sql);
      const isSelect = safeSql.trim().toUpperCase().startsWith('SELECT');
      const varName = step.as || (isSelect ? 'rows' : 'queryResult');
      if (isSelect) {
        return `${indent}ctx.${varName} = db.prepare(${JSON.stringify(safeSql)}).all(${paramList.join(', ')}); // pipe: ${pipeName}`;
      } else {
        return `${indent}ctx.${varName} = db.prepare(${JSON.stringify(safeSql)}).run(${paramList.join(', ')}); // pipe: ${pipeName}`;
      }
    }
    case 'PipeFetch': {
      const urlExpr = step.url.startsWith('$') ? compilePipeExpr(step.url) : JSON.stringify(step.url);
      const timeoutMs = step.options.timeout ? parseInt(step.options.timeout) * 1000 : 10000;
      const method = step.options.method || 'GET';
      const varName = step.options.as || 'fetchResult';
      const lines: string[] = [];
      let fetchOpts = `{ method: '${method}', signal: AbortSignal.timeout(${timeoutMs})`;
      if (step.options.body) {
        fetchOpts += `, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${compilePipeExpr(step.options.body)})`;
      }
      fetchOpts += ' }';
      lines.push(`${indent}const __fetch_resp_${varName} = await fetch(${urlExpr}, ${fetchOpts}); // pipe: ${pipeName}`);
      lines.push(`${indent}ctx.${varName} = await __fetch_resp_${varName}.json();`);
      return lines.join('\n');
    }
    case 'PipeSet': {
      const expr = compilePipeExpr(step.expression);
      return `${indent}ctx.${step.name} = ${expr}; // pipe: ${pipeName}`;
    }
    case 'PipeTransform': {
      const entries = step.fields.map((f: any) => `${f.key}: ${compilePipeExpr(f.expr)}`).join(', ');
      return `${indent}ctx.result = { ${entries} }; // pipe: ${pipeName}`;
    }
    case 'PipeEach': {
      const collection = compilePipeExpr(step.collection);
      const lines: string[] = [];
      lines.push(`${indent}for (const ${step.itemName} of ${collection}) {`);
      lines.push(`${indent}  ctx.${step.itemName} = ${step.itemName};`);
      for (const s of step.body) {
        lines.push(compilePipeStep(s, pipeName, indent + '  '));
      }
      lines.push(`${indent}}`);
      return lines.join('\n');
    }
    case 'PipeWhen': {
      const cond = compilePipeExpr(step.condition);
      const lines: string[] = [];
      lines.push(`${indent}if (${cond}) { // pipe: ${pipeName}`);
      for (const s of step.body) {
        lines.push(compilePipeStep(s, pipeName, indent + '  '));
      }
      if (step.elseBody) {
        lines.push(`${indent}} else {`);
        for (const s of step.elseBody) {
          lines.push(compilePipeStep(s, pipeName, indent + '  '));
        }
      }
      lines.push(`${indent}}`);
      return lines.join('\n');
    }
    case 'PipeOnChange': {
      const lines: string[] = [];
      const field = step.field.replace(/^\$/, '');
      const fieldAccessor = field.startsWith('body.') ? `ctx.req.body.${field.slice(5)}` : `ctx.${field}`;
      lines.push(`${indent}{ // pipe: ${pipeName} — on change ${step.field}`);
      lines.push(`${indent}  const __current_val = String(${fieldAccessor});`);
      lines.push(`${indent}  const __prev = db.prepare('SELECT last_value FROM _pipe_state WHERE pipe_name = ? AND row_key = ? AND field_name = ?').get('${pipeName}', String(ctx.req?.params?.id || 'default'), '${field}');`);
      lines.push(`${indent}  const __prev_val = __prev ? __prev.last_value : null;`);
      lines.push(`${indent}  if (__prev_val !== __current_val) {`);
      for (const t of step.transitions) {
        if (t.from === '*' && t.to === '*') {
          lines.push(`${indent}    // any -> any`);
          for (const s of t.body) {
            lines.push(compilePipeStep(s, pipeName, indent + '    '));
          }
        } else {
          const fromCond = t.from === '*' ? 'true' : `__prev_val === '${t.from}'`;
          const toCond = t.to === '*' ? 'true' : `__current_val === '${t.to}'`;
          lines.push(`${indent}    if (${fromCond} && ${toCond}) {`);
          for (const s of t.body) {
            lines.push(compilePipeStep(s, pipeName, indent + '      '));
          }
          lines.push(`${indent}    }`);
        }
      }
      lines.push(`${indent}    db.prepare('INSERT OR REPLACE INTO _pipe_state (pipe_name, row_key, field_name, last_value) VALUES (?, ?, ?, ?)').run('${pipeName}', String(ctx.req?.params?.id || 'default'), '${field}', __current_val);`);
      lines.push(`${indent}  }`);
      lines.push(`${indent}}`);
      return lines.join('\n');
    }
    case 'PipeNotify': {
      if (step.channel === 'email') {
        const to = compilePipeExpr(step.params.to || '');
        const subject = step.params.subject || '';
        const body = step.params.body || '';
        return `${indent}await sendEmail({ to: ${to}, subject: ${JSON.stringify(subject)}, body: ${JSON.stringify(body)} }); // pipe: ${pipeName}`;
      } else if (step.channel === 'sms') {
        const to = compilePipeExpr(step.params.to || '');
        const msg = step.params.message || '';
        return `${indent}await sendSms(${to}, ${JSON.stringify(msg)}); // pipe: ${pipeName}`;
      } else if (step.channel === 'webhook') {
        const url = compilePipeExpr(step.params.to || '');
        const body = step.params.body ? compilePipeExpr(JSON.stringify(step.params.body)) : '{}';
        return `${indent}await fetch(${url}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${body}) }); // pipe: ${pipeName}`;
      }
      return `${indent}// unsupported notify channel: ${step.channel}`;
    }
    case 'PipeLog': {
      const msg = step.message.replace(/\$(\w[\w.]*)/g, (_: string, v: string) => `\${${compilePipeExpr('$' + v)}}`);
      return `${indent}console.log('[pipe:${pipeName}]', \`${msg}\`); // pipe: ${pipeName}`;
    }
    case 'PipeRespond': {
      const bodyEntries = step.body ? Object.entries(step.body).map(([k, v]: [string, any]) => {
        const compiled = compilePipeExpr(v);
        return `${JSON.stringify(k)}: ${compiled}`;
      }).join(', ') : '';
      const bodyStr = bodyEntries ? `{ ${bodyEntries} }` : '{ ok: true }';
      return `${indent}return ctx.res?.status(${step.status}).json(${bodyStr}); // pipe: ${pipeName}`;
    }
    case 'PipeAbort': {
      return `${indent}return ctx.res?.status(${step.status}).json({ error: ${JSON.stringify(step.message)} }); // pipe: ${pipeName}`;
    }
    case 'PipeWebhook': {
      const bodyStr = step.body ? JSON.stringify(step.body) : '{}';
      return `${indent}await fetch(${JSON.stringify(step.url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${bodyStr}) }); // pipe: ${pipeName}`;
    }
    case 'PipeRun': {
      const safeName = step.pipeName.replace(/[^a-zA-Z0-9_]/g, '_');
      if (step.withParams) {
        return `${indent}await pipe_${safeName}({ ...ctx, ...${JSON.stringify(step.withParams)} }); // pipe: ${pipeName}`;
      }
      return `${indent}await pipe_${safeName}(ctx); // pipe: ${pipeName}`;
    }
    default:
      return `${indent}// unknown pipe step: ${(step as any).type}`;
  }
}

function compilePipeBlocks(pipes: PipeNode[]): string {
  if (!pipes || pipes.length === 0) return '';

  const hasOnChange = pipes.some(p => p.steps.some((s: any) => s.type === 'PipeOnChange'));
  const blocks: string[] = [];
  const routes: string[] = [];
  const intervals: string[] = [];

  if (hasOnChange) {
    blocks.push(compilePipeStateTable());
  }

  for (const pipe of pipes) {
    const safeName = pipe.name.replace(/[^a-zA-Z0-9_]/g, '_');

    // Generate async function
    let body = '';
    for (const step of pipe.steps) {
      body += compilePipeStep(step, pipe.name) + '\n';
    }

    blocks.push(`
// pipe: ${pipe.name}
async function pipe_${safeName}(ctx) {
  try {
${body}  } catch(e) {
    console.error('[pipe:${pipe.name}]', e.message);
    if (ctx.res && !ctx.res.headersSent) ctx.res.status(500).json({ error: 'Internal pipe error' });
  }
}`);

    // Register trigger
    if (pipe.trigger) {
      const t = pipe.trigger;
      if (t.kind === 'api') {
        const method = t.method.toLowerCase();
        const middleware = t.auth ? 'authMiddleware, ' : '';
        const mwNames = (t.middleware || []).map((m: string) => 'mw_' + m + ', ').join('');
        routes.push(`
// pipe: ${pipe.name} — trigger: api ${t.method} ${t.path}
app.${method}('${t.path}', ${middleware}${mwNames}async (req, res) => {
  await pipe_${safeName}({ req, res, db, result: null });
});`);
      } else if (t.kind === 'every') {
        intervals.push(`
// pipe: ${pipe.name} — trigger: every ${t.interval}
const interval_pipe_${safeName} = setInterval(async () => {
  await pipe_${safeName}({ db, result: null });
}, ${t.intervalMs});`);
      } else if (t.kind === 'webhook') {
        const method = t.method.toLowerCase();
        let verifyBlock = '';
        if (t.secret) {
          const secretRef = t.secret.startsWith('$') ? `process.env.${t.secret.slice(1)}` : JSON.stringify(t.secret);
          verifyBlock = `
  // Webhook signature verification
  const crypto = require('crypto');
  const sigHeader = req.headers['x-signature'] || req.headers['x-hub-signature-256'] || '';
  const expectedSig = crypto.createHmac('sha256', ${secretRef}).update(JSON.stringify(req.body)).digest('hex');
  if (!sigHeader.includes(expectedSig)) return res.status(401).json({ error: 'Invalid signature' });`;
        }
        routes.push(`
// pipe: ${pipe.name} — trigger: webhook ${t.method} ${t.path}
app.${method}('${t.path}', webhookLimiter, async (req, res) => {${verifyBlock}
  await pipe_${safeName}({ req, res, db, result: null });
});`);
      }
    }
  }

  let output = `
// ── Pipe Blocks (v0.32.0) ─────────────────────────────────────────────────────
${blocks.join('\n')}

// ── Pipe Webhook Rate Limiter ──
const webhookLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { error: 'Too many webhook requests' } });

${routes.join('\n')}
`;

  if (intervals.length > 0) {
    output += `
// ── Pipe Background Workers ──
${intervals.join('\n')}
`;
  }

  return output;
}
// ── Main export ────────────────────────────────────────────────────────

export function compileBackend(tables: TableNode[], apis: ApiNode[] = [], config: ConfigNode | undefined = undefined, hooks: HookNode[] = [], pagePaths: string[] = [], middlewares: MiddlewareNode[] = [], everys: any[] = [], actions: any[] = [], envNode?: any, onEvents: any[] = [], useStatements: any[] = [], pipes: PipeNode[] = []): string {
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

  // Generate auto-migration calls
  const migrateStatements = tables.map(t => {
    const cols = t.columns.map(col => {
      const type = sqlType(col);
      const constraints = sqlConstraints(col).replace(/'/g, "\\'");
      return `{ name: '${col.name}', type: '${type}', constraints: '${constraints}' }`;
    });
    return `autoMigrate('${t.name}', [${cols.join(', ')}]);`;
  }).join('\n');
  const crudBlocks = tables.map(t => crudForTable(t, tables, onEvents)).join('\n');
  const hookBlocks = hooks.map(h => compileHook(h)).join('\n');
  const actionBlocks = actions.map(a => compileAction(a)).join('\n');
  const envValidation = envNode ? compileEnvNode(envNode) : '';
  const onEventBlocks = compileOnEvents(onEvents);
  const { imports: useImports, init: useInit } = compileUseStatements(useStatements);
  const apiBlocks = apis.map(a => compileApiRoute(a)).join('\n');
  // Custom API routes go BEFORE CRUD (so /mine matches before /:id)
  // Order: apiBlocks first, then crudBlocks

  return `// ═══════════════════════════════════════════════════════════════
// Auto-generated by NyxCode Backend Compiler
// Do not edit — regenerate from your .nyx source
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
${useImports}

const app = express();
app.set('trust proxy', true);

${configValidation}
app.use(express.json());
${useInit}

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

const DB_PATH = process.env.DATABASE_PATH || process.env.DB_PATH || path.resolve(__dirname, '..', '.nyx-data', 'app.db');
const fs = require('fs'); if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Auto-Migration ─────────────────────────────────────────────

db.exec(\`CREATE TABLE IF NOT EXISTS _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  column_name TEXT,
  sql_executed TEXT,
  applied_at TEXT DEFAULT (datetime('now'))
)\`);

function autoMigrate(tableName, expectedCols) {
  const existing = db.prepare(\`PRAGMA table_info(\${tableName})\`).all();
  if (existing.length === 0) return; // Table doesn't exist yet, CREATE TABLE will handle it
  const existingNames = new Set(existing.map(c => c.name));
  for (const col of expectedCols) {
    if (!existingNames.has(col.name)) {
      // SQLite cannot ADD COLUMN with UNIQUE — strip it and create index instead
      const hasUnique = col.constraints && col.constraints.includes('UNIQUE');
      const safeConstraints = (col.constraints || '').replace(/ UNIQUE/g, '');
      const sql = \`ALTER TABLE \${tableName} ADD COLUMN \${col.name} \${col.type}\${safeConstraints}\`;
      try {
        db.exec(sql);
        if (hasUnique) {
          db.exec(\`CREATE UNIQUE INDEX IF NOT EXISTS idx_\${tableName}_\${col.name} ON \${tableName}(\${col.name})\`);
        }
        db.prepare('INSERT INTO _migrations (action, table_name, column_name, sql_executed) VALUES (?, ?, ?, ?)')
          .run('add_column', tableName, col.name, sql + (hasUnique ? ' + UNIQUE INDEX' : ''));
        console.log(\`[migration] Added column \${tableName}.\${col.name}\${hasUnique ? ' (+ unique index)' : ''}\`);
      } catch(e) {
        console.error(\`[migration] Failed: \${sql} — \${e.message}\`);
      }
    }
  }
}

${migrateStatements}

// ── Create tables ──────────────────────────────────────────────

${createStatements}
${actionBlocks}
${onEventBlocks}
${envValidation}
${apiBlocks}
${crudBlocks}
${hookBlocks}
${compilePipeBlocks(pipes)}

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
