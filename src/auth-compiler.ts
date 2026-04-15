/**
 * NyxCode Auth Compiler
 * 
 * Transforms SecurityNode into JWT auth code (register, login, middleware).
 * Dependencies: bcryptjs, jsonwebtoken
 */

import { SecurityNode, TableNode, ColumnDef } from './ast.js';

export function compileAuth(security: SecurityNode, tables: TableNode[]): string {
  // Extract rules
  const rules: Record<string, string> = {};
  for (const rule of security.rules) {
    rules[rule.name] = rule.value;
  }

  const userTable = rules['table'] || 'users';
  const loginFields = (rules['login'] || 'email password').split(' ').filter(Boolean);
  const identityField = loginFields[0] || 'email'; // first field = identity
  const passwordField = loginFields[loginFields.length - 1] || 'password'; // last = password
  const tokenType = rules['token'] || 'jwt';
  const protectedPaths = Object.entries(rules)
    .filter(([k]) => k === 'protect')
    .map(([, v]) => v);

  // Find user table columns for register (exclude id + auto columns)
  const table = tables.find(t => t.name === userTable);
  const registerFields = table 
    ? table.columns.filter(c => c.type !== 'auto' && c.name !== 'id')
    : [{ name: 'email', type: 'email', constraints: [] }, { name: 'password', type: 'text', constraints: [] }];

  // Generate validation code for register fields
  const valChecks: string[] = [];
  for (const col of registerFields) {
    for (const cn of col.constraints) {
      if (cn === 'required') {
        valChecks.push(`  if (!req.body.${col.name} && req.body.${col.name} !== 0) return res.status(400).json({ error: '${col.name} is required' });`);
      } else if (cn.startsWith('min=')) {
        const v = cn.split('=')[1];
        if (['number','int','float'].includes(col.type)) {
          valChecks.push(`  if (req.body.${col.name} !== undefined && req.body.${col.name} < ${v}) return res.status(400).json({ error: '${col.name} must be at least ${v}' });`);
        } else {
          valChecks.push(`  if (req.body.${col.name} && req.body.${col.name}.length < ${v}) return res.status(400).json({ error: '${col.name} must be at least ${v} characters' });`);
        }
      } else if (cn.startsWith('max=')) {
        const v = cn.split('=')[1];
        if (['number','int','float'].includes(col.type)) {
          valChecks.push(`  if (req.body.${col.name} !== undefined && req.body.${col.name} > ${v}) return res.status(400).json({ error: '${col.name} must be at most ${v}' });`);
        } else {
          valChecks.push(`  if (req.body.${col.name} && req.body.${col.name}.length > ${v}) return res.status(400).json({ error: '${col.name} must be at most ${v} characters' });`);
        }
      } else if (cn.startsWith('format=')) {
        const fmt = cn.split('=')[1];
        if (fmt === 'email') valChecks.push(`  if (req.body.${col.name} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(req.body.${col.name})) return res.status(400).json({ error: '${col.name} must be a valid email' });`);
      }
    }
  }
  const registerValidation = valChecks.length ? valChecks.join('\n') + '\n' : '';

  const nonPasswordFields = registerFields.filter(c => c.name !== passwordField);
  const allFieldNames = registerFields.map(c => c.name);
  const insertCols = allFieldNames.join(', ');
  const insertPlaceholders = allFieldNames.map(() => '?').join(', ');
  const insertValues = allFieldNames.map(f => 
    f === passwordField ? 'hash' : f
  ).join(', ');

  let code = `
// ── Auth (bcryptjs + jsonwebtoken + rate-limit) ─────────────────────
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// rateLimit already declared by backend compiler
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, try again later' } });
app.use('/api/auth', authLimiter);

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { console.error('❌ FATAL: JWT_SECRET not set in production!'); process.exit(1); })() : 'nyx-dev-' + require('crypto').randomBytes(8).toString('hex'));
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') console.warn('⚠️  No JWT_SECRET set — using random dev secret (tokens expire on restart)');

// Register
app.post('/api/auth/register', (req, res) => {
  const { ${allFieldNames.join(', ')} } = req.body;
  if (!${identityField} || !${passwordField}) return res.status(400).json({ error: '${identityField} and ${passwordField} required' });
${registerValidation}  const hash = bcrypt.hashSync(${passwordField}, 10);
  try {
    const result = db.prepare('INSERT INTO ${userTable} (${insertCols}) VALUES (${insertPlaceholders})').run(${insertValues});
    const token = jwt.sign({ id: result.lastInsertRowid, ${identityField} }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, ${identityField} } });
  } catch(e) {
    res.status(409).json({ error: 'User already exists' });
  }
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { ${identityField}, ${passwordField} } = req.body;
  if (!${identityField} || !${passwordField}) return res.status(400).json({ error: '${identityField} and ${passwordField} required' });
  const user = db.prepare('SELECT * FROM ${userTable} WHERE ${identityField} = ?').get(${identityField});
  if (!user || !bcrypt.compareSync(${passwordField}, user.${passwordField})) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, ${identityField}: user.${identityField} }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, ${identityField}: user.${identityField} } });
});

// Auth middleware
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Me endpoint
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM ${userTable} WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { ${passwordField}: _, ...safe } = user;
  res.json(safe);
});
`;

  return code;
}
