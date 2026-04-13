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

  const nonPasswordFields = registerFields.filter(c => c.name !== passwordField);
  const allFieldNames = registerFields.map(c => c.name);
  const insertCols = allFieldNames.join(', ');
  const insertPlaceholders = allFieldNames.map(() => '?').join(', ');
  const insertValues = allFieldNames.map(f => 
    f === passwordField ? 'hash' : f
  ).join(', ');

  let code = `
// ── Auth (bcryptjs + jsonwebtoken) ──────────────────────────────────
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'nyx-dev-' + require('crypto').randomBytes(8).toString('hex');

// Register
app.post('/api/auth/register', (req, res) => {
  const { ${allFieldNames.join(', ')} } = req.body;
  if (!${identityField} || !${passwordField}) return res.status(400).json({ error: '${identityField} and ${passwordField} required' });
  const hash = bcrypt.hashSync(${passwordField}, 10);
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
