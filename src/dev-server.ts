/**
 * NyxCode Dev Server
 * 
 * - Compiles .nyx → HTML
 * - Serves compiled files via HTTP (from memory, no disk I/O)
 * - Watches for changes, auto-rebuilds with debounce
 * - Live Reload via Server-Sent Events (injected script)
 * - Full-stack mode: embeds CRUD API routes + in-memory SQLite
 *   when the .nyx source contains `table` or `security` blocks
 * 
 * Uses node:http for serving, better-sqlite3 for the embedded database.
 */

import * as http from 'http';
import { readFileSync, watch as fsWatch, statSync } from 'fs';
import { resolve, dirname, relative, extname, join } from 'path';
import { createRequire } from 'module';
import { parse } from './index.js';
import { Compiler } from './compiler.js';
import { Validator } from './validator.js';
import { Program, ComponentNode, UseStatement, TableNode, ApiNode, SecurityNode, ColumnDef } from './ast.js';

// Use createRequire for native addons (better-sqlite3) in ESM context
const _require = createRequire(import.meta.url);

/** MIME type map for static file serving */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.txt':  'text/plain; charset=utf-8',
};

/** Live reload script injected before </body> */
const LIVE_RELOAD_SCRIPT = `<script>(function(){var e=new EventSource("/__nyx_reload");e.onmessage=function(){location.reload()};e.onerror=function(){e.close();setTimeout(function(){location.reload()},1000)}})();</script>`;

/**
 * Format byte sizes for pretty output.
 */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

// ── Inline API route types ─────────────────────────────────────────────

type ApiHandler = (req: ApiReq, res: ApiRes) => void;

interface ApiRoute {
  method: string;     // GET | POST | PUT | DELETE
  pattern: string;    // e.g. '/api/users' or '/api/users/:id'
  segments: string[]; // split pattern parts
  paramNames: string[]; // param names from :param segments
  handler: ApiHandler;
}

interface ApiReq {
  method: string;
  url: string;
  params: Record<string, string>;
  body: any;
  headers: Record<string, string | string[] | undefined>;
  user?: any;
}

interface ApiRes {
  _res: http.ServerResponse;
  _sent: boolean;
  status(code: number): ApiRes;
  json(data: any): void;
  end(data?: string): void;
}

function createApiRes(raw: http.ServerResponse): ApiRes {
  let statusCode = 200;
  const res: ApiRes = {
    _res: raw,
    _sent: false,
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      if (res._sent) return;
      res._sent = true;
      const body = JSON.stringify(data);
      raw.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      raw.end(body);
    },
    end(data?: string) {
      if (res._sent) return;
      res._sent = true;
      raw.writeHead(statusCode, { 'Access-Control-Allow-Origin': '*' });
      raw.end(data || '');
    },
  };
  return res;
}

// ── SQL helpers (mirrors backend-compiler logic) ───────────────────────

const SQL_TYPE_MAP: Record<string, string> = {
  text: 'TEXT', email: 'TEXT', number: 'INTEGER', int: 'INTEGER',
  float: 'REAL', decimal: 'REAL', bool: 'INTEGER', auto: 'DATETIME',
};

function colSqlType(col: ColumnDef): string {
  if (col.type.startsWith('[') && col.type.endsWith(']')) {
    const ref = col.type.slice(1, -1);
    return `INTEGER REFERENCES ${ref}(id)`;
  }
  return SQL_TYPE_MAP[col.type] || 'TEXT';
}

function colConstraints(col: ColumnDef): string {
  const parts: string[] = [];
  if (col.type === 'auto') parts.push('DEFAULT CURRENT_TIMESTAMP');
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

export class DevServer {
  private inputFile: string;
  private port: number;
  private pages: Map<string, string> = new Map(); // route → HTML with live reload injected
  private sseClients: Set<http.ServerResponse> = new Set();
  private server: http.Server | null = null;
  private watchers: ReturnType<typeof fsWatch>[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastBuildOk: boolean = false;
  private baseDir: string;

  // ── Full-stack state ────────────────────────────────────────────────
  private db: any = null;             // better-sqlite3 Database instance
  private apiRoutes: ApiRoute[] = []; // registered API routes
  private tableCount: number = 0;     // for logging
  private hasAuth: boolean = false;   // for logging

  constructor(inputFile: string, port: number = 3000) {
    this.inputFile = resolve(inputFile);
    this.port = port;
    this.baseDir = dirname(this.inputFile);
  }

  /**
   * Start the dev server: initial build, HTTP server, file watcher.
   */
  start(): void {
    // Banner
    console.log('');
    console.log(`\x1b[36m🦞 NyxCode Dev Server v0.3.0\x1b[0m`);

    // Initial build
    this.build();

    // Start HTTP server (printServerInfo called from listen callback)
    this.startServer();

    // Start file watchers
    this.setupWatchers();

    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Build the .nyx file(s), populate in-memory page cache.
   * Returns build info for logging. On error, keeps old pages.
   */
  private build(): { ok: boolean; pageCount: number; totalBytes: number; ms: number } {
    const start = performance.now();

    try {
      const source = readFileSync(this.inputFile, 'utf-8');
      const ast = parse(source);

      // Set up import resolver
      const resolveImport = (importPath: string): Program | null => {
        try {
          const resolved = resolve(this.baseDir, importPath);
          // Path traversal protection: imports must stay within project
          if (!resolved.startsWith(this.baseDir)) {
            console.warn(`⚠️  Blocked import outside project: ${importPath}`);
            return null;
          }
          const importSource = readFileSync(resolved, 'utf-8');
          return parse(importSource);
        } catch {
          return null;
        }
      };

      // Resolve imported component names for validator
      const importedComponents = new Set<string>();
      const uses = ast.body.filter(n => n.type === 'Use') as UseStatement[];
      for (const use of uses) {
        const imported = resolveImport(use.path);
        if (imported) {
          for (const node of imported.body) {
            if (node.type === 'Component') {
              importedComponents.add((node as ComponentNode).name);
            }
          }
        }
      }

      // Validate
      const validator = new Validator();
      const validationResults = validator.validate(ast, importedComponents);
      const validationErrors = validationResults.filter(e => e.severity === 'error');
      const validationWarnings = validationResults.filter(e => e.severity === 'warning');

      // Log warnings
      for (const w of validationWarnings) {
        console.log(`   \x1b[33m⚠️  ${w.message} (line ${w.line}:${w.col})\x1b[0m`);
      }

      // Abort on errors
      if (validationErrors.length > 0) {
        for (const e of validationErrors) {
          console.error(`   \x1b[31m❌ ${e.message} (line ${e.line}:${e.col})\x1b[0m`);
        }
        const ms = performance.now() - start;
        return { ok: false, pageCount: 0, totalBytes: 0, ms };
      }

      // Compile
      const compiler = new Compiler({ pretty: true });
      compiler.setImportResolver(resolveImport);

      const pageNodes = ast.body.filter(n => n.type === 'Page');
      const newPages = new Map<string, string>();
      let totalBytes = 0;

      if (pageNodes.length <= 1) {
        // Single page mode
        const output = compiler.compile(ast);
        let html = output.html;
        html = this.injectLiveReload(html);
        const route = pageNodes.length === 1 ? (pageNodes[0] as any).path : '/';
        newPages.set(this.normalizeRoute(route), html);
        totalBytes = html.length;
      } else {
        // Multi-page mode
        const results = compiler.compileMultiFile(ast);
        for (const { path: pagePath, html: rawHtml } of results) {
          const html = this.injectLiveReload(rawHtml);
          newPages.set(this.normalizeRoute(pagePath), html);
          totalBytes += html.length;
        }
      }

      // Success — swap the page cache
      this.pages = newPages;
      this.lastBuildOk = true;

      // ── Full-stack: build API from table/security blocks ────────────
      const tables = ast.body.filter(n => n.type === 'Table') as TableNode[];
      const apis = ast.body.filter(n => n.type === 'Api') as ApiNode[];
      const security = ast.body.find(n => n.type === 'Security') as SecurityNode | undefined;

      if (tables.length > 0 || apis.length > 0) {
        this.buildApi(tables, apis, security);
      } else {
        // No tables — tear down any existing API state
        this.apiRoutes = [];
        this.tableCount = 0;
        this.hasAuth = false;
        if (this.db) {
          try { this.db.close(); } catch { /* ignore */ }
          this.db = null;
        }
      }

      const ms = performance.now() - start;
      return { ok: true, pageCount: newPages.size, totalBytes, ms };

    } catch (e: any) {
      console.error(`   \x1b[31m❌ Build failed:\x1b[0m`);
      console.error(`   \x1b[31m${e.message}\x1b[0m`);
      const ms = performance.now() - start;
      return { ok: false, pageCount: 0, totalBytes: 0, ms };
    }
  }

  /**
   * Inject live reload script before </body>.
   */
  private injectLiveReload(html: string): string {
    if (html.includes('</body>')) {
      return html.replace('</body>', LIVE_RELOAD_SCRIPT + '</body>');
    }
    // No </body> tag — append at end
    return html + LIVE_RELOAD_SCRIPT;
  }

  /**
   * Normalize a route path to always end with /.
   */
  private normalizeRoute(routePath: string): string {
    if (routePath === '/') return '/';
    // Ensure leading slash and trailing slash
    let normalized = routePath.startsWith('/') ? routePath : '/' + routePath;
    if (!normalized.endsWith('/')) normalized += '/';
    return normalized;
  }

  /**
   * Start the HTTP server. Tries ports incrementally if in use.
   */
  private startServer(): void {
    const tryListen = (port: number, maxRetries: number = 10): void => {
      this.port = port;
      // Create a fresh server for each attempt
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && maxRetries > 0) {
          console.log(`   \x1b[33m⚠️  Port ${port} in use, trying ${port + 1}...\x1b[0m`);
          this.server!.close();
          tryListen(port + 1, maxRetries - 1);
        } else {
          console.error(`   \x1b[31m❌ Server error: ${err.message}\x1b[0m`);
          process.exit(1);
        }
      });

      this.server.listen(port, () => this.printServerInfo());
    };

    tryListen(this.port);
  }

  /**
   * Print server start info and route listing.
   */
  private printServerInfo(): void {
    console.log(`   \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
    console.log('');
    console.log(`   📁 Watching: ${relative(process.cwd(), this.inputFile)}`);

    // Print initial build result
    const result = this.buildSummary();
    if (result) {
      console.log(result.summary);
      if (result.routes.length > 0) {
        console.log('');
        console.log('   Pages:');
        for (const route of result.routes) {
          console.log(`   · ${route}`);
        }
      }
    }

    // Print API info
    if (this.apiRoutes.length > 0) {
      console.log('');
      console.log(`   \x1b[35m🗄️  API: ${this.tableCount} table${this.tableCount !== 1 ? 's' : ''}${this.hasAuth ? ' + auth' : ''} (in-memory SQLite)\x1b[0m`);
      console.log('   API routes:');
      for (const route of this.apiRoutes) {
        console.log(`   \x1b[35m· ${route.method.padEnd(7)} ${route.pattern}\x1b[0m`);
      }
    }
    console.log('');
  }

  /**
   * Build a summary string from current page cache.
   */
  private buildSummary(): { summary: string; routes: string[] } | null {
    if (this.pages.size === 0) return null;

    let totalBytes = 0;
    const routes: string[] = [];
    for (const [route, html] of this.pages) {
      totalBytes += html.length;
      routes.push(route);
    }
    routes.sort();

    const summary = `   \x1b[32m✅ Built ${this.pages.size} page${this.pages.size > 1 ? 's' : ''} (${formatSize(totalBytes)})\x1b[0m`;
    return { summary, routes };
  }

  /**
   * Handle an incoming HTTP request.
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    const [pathname] = url.split('?');
    const method = (req.method || 'GET').toUpperCase();

    // CORS preflight for API routes
    if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      });
      res.end();
      return;
    }

    // SSE endpoint for live reload
    if (pathname === '/__nyx_reload') {
      this.handleSSE(req, res);
      return;
    }

    // API routes — check BEFORE page matching
    if (pathname.startsWith('/api/') && this.apiRoutes.length > 0) {
      this.handleApiRequest(req, res, method, pathname);
      return;
    }

    // Try to match a compiled page
    const pageHtml = this.matchPage(pathname);
    if (pageHtml !== null) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(pageHtml);
      return;
    }

    // Try static file serving from the base directory
    const staticResult = this.serveStaticFile(pathname);
    if (staticResult !== null) {
      res.writeHead(200, {
        'Content-Type': staticResult.mimeType,
        'Cache-Control': 'no-cache',
      });
      res.end(staticResult.data);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(this.build404Page(pathname));
  }

  /**
   * Match a URL pathname to a compiled page.
   */
  private matchPage(pathname: string): string | null {
    // Exact match
    if (this.pages.has(pathname)) return this.pages.get(pathname)!;

    // Try with trailing slash
    const withSlash = pathname.endsWith('/') ? pathname : pathname + '/';
    if (this.pages.has(withSlash)) return this.pages.get(withSlash)!;

    // Try without trailing slash
    const withoutSlash = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    if (this.pages.has(withoutSlash)) return this.pages.get(withoutSlash)!;

    // Root fallback
    if (pathname === '/' || pathname === '/index.html') {
      if (this.pages.has('/')) return this.pages.get('/')!;
    }

    return null;
  }

  /**
   * Serve a static file from the input file's directory.
   */
  private serveStaticFile(pathname: string): { data: Buffer; mimeType: string } | null {
    // Prevent directory traversal
    const safePath = pathname.replace(/\.\./g, '');
    const filePath = join(this.baseDir, safePath);

    // Must be within baseDir
    if (!filePath.startsWith(this.baseDir)) return null;

    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) return null;

      const ext = extname(filePath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      const data = readFileSync(filePath) as Buffer;
      return { data, mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Generate a styled 404 page.
   */
  private build404Page(pathname: string): string {
    const routes = Array.from(this.pages.keys()).sort();
    const routeLinks = routes
      .map(r => `<li><a href="${r}">${r}</a></li>`)
      .join('\n          ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>404 — Not Found</title>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 20px; color: #333; }
    h1 { color: #e74c3c; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    a { color: #3498db; }
    ul { list-style: none; padding: 0; }
    li { padding: 4px 0; }
    li::before { content: "· "; color: #999; }
  </style>
</head>
<body>
  <h1>🦞 404 — Not Found</h1>
  <p>No page matched <code>${pathname}</code></p>
  ${routes.length > 0 ? `
  <p>Available routes:</p>
  <ul>
    ${routeLinks}
  </ul>` : '<p>No pages compiled yet.</p>'}
  ${LIVE_RELOAD_SCRIPT}
</body>
</html>`;
  }

  /**
   * Handle Server-Sent Events connection for live reload.
   */
  private handleSSE(_req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Send initial comment to keep connection alive
    res.write(': connected\n\n');

    this.sseClients.add(res);

    // Clean up on close
    _req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /**
   * Notify all SSE clients to reload.
   */
  private notifyReload(): void {
    const msg = `data: reload\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  /**
   * Collect all files that should be watched (main + use-imported files).
   */
  private collectWatchFiles(): string[] {
    const files = [this.inputFile];

    try {
      const source = readFileSync(this.inputFile, 'utf-8');
      const ast = parse(source);

      for (const node of ast.body) {
        if (node.type === 'Use') {
          const importPath = resolve(this.baseDir, (node as UseStatement).path);
          try {
            statSync(importPath);
            files.push(importPath);
          } catch {
            // File doesn't exist yet
          }
        }
      }
    } catch {
      // Parse error — just watch the main file
    }

    return files;
  }

  /**
   * Set up file watchers with debounce.
   */
  private setupWatchers(): void {
    // Close existing watchers
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }
    this.watchers = [];

    const files = this.collectWatchFiles();
    for (const file of files) {
      try {
        const watcher = fsWatch(file, { persistent: true }, (eventType) => {
          if (eventType === 'change') this.onFileChange(file);
        });
        this.watchers.push(watcher);
      } catch {
        // File may not exist — skip
      }
    }
  }

  /**
   * Debounced handler for file changes.
   */
  private onFileChange(changedFile: string): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      const filename = relative(process.cwd(), changedFile);
      console.log(`   \x1b[36m🔄 Change detected in ${filename}\x1b[0m`);

      const result = this.build();
      if (result.ok) {
        const apiInfo = this.tableCount > 0 ? ` + ${this.tableCount} table${this.tableCount !== 1 ? 's' : ''}` : '';
        console.log(`   \x1b[32m✅ Rebuilt ${result.pageCount} page${result.pageCount > 1 ? 's' : ''}${apiInfo} (${formatSize(result.totalBytes)}) [${Math.round(result.ms)}ms]\x1b[0m`);
        // Notify browsers to reload
        this.notifyReload();
      } else {
        console.log(`   \x1b[33m⏳ Waiting for changes...\x1b[0m`);
      }

      // Re-setup watchers (imports may have changed)
      this.setupWatchers();
    }, 150);
  }

  // ── Full-stack API support ───────────────────────────────────────────

  /**
   * Build the in-memory SQLite database and register CRUD routes
   * for every table found in the AST. Called on every successful build.
   */
  private buildApi(tables: TableNode[], apis: ApiNode[], security?: SecurityNode): void {
    // Lazy-load better-sqlite3 (only needed when tables exist)
    let Database: any;
    try {
      Database = _require('better-sqlite3');
    } catch {
      console.log(`   \x1b[33m⚠️  better-sqlite3 not installed — skipping API routes\x1b[0m`);
      console.log(`   \x1b[33m   Run: npm install better-sqlite3\x1b[0m`);
      return;
    }

    // Close previous DB if any
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
    }

    // Create fresh in-memory database
    this.db = new Database(':memory:');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Create tables
    for (const table of tables) {
      const cols = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
      for (const col of table.columns) {
        cols.push(`${col.name} ${colSqlType(col)}${colConstraints(col)}`);
      }
      const sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n    ${cols.join(',\n    ')}\n  )`;
      this.db.exec(sql);
    }

    // Register routes
    this.apiRoutes = [];
    this.tableCount = tables.length;
    this.hasAuth = !!security;

    // Auth routes (simplified for dev — no bcrypt, no JWT, just passthrough)
    if (security) {
      this.registerAuthRoutes(security, tables);
    }

    // CRUD routes for each table
    for (const table of tables) {
      this.registerCrudRoutes(table);
    }

    // Custom API routes (skeleton)
    for (const api of apis) {
      this.addRoute(api.method.toUpperCase(), api.path, (_req, res) => {
        res.json({ status: 'ok' });
      });
    }
  }

  /**
   * Register simplified auth endpoints for dev mode.
   * No real bcrypt/JWT — dev mode uses plain passwords + simple tokens.
   */
  private registerAuthRoutes(security: SecurityNode, tables: TableNode[]): void {
    const rules: Record<string, string> = {};
    for (const rule of security.rules) {
      rules[rule.name] = rule.value;
    }

    const userTable = rules['table'] || 'users';
    const loginFields = (rules['login'] || 'email password').split(' ').filter(Boolean);
    const identityField = loginFields[0] || 'email';
    const passwordField = loginFields[loginFields.length - 1] || 'password';

    const table = tables.find(t => t.name === userTable);
    const registerFields = table
      ? table.columns.filter(c => c.type !== 'auto' && c.name !== 'id')
      : [{ name: 'email', type: 'email', constraints: [] }, { name: 'password', type: 'text', constraints: [] }];

    const db = this.db;

    // Register
    this.addRoute('POST', '/api/auth/register', (req, res) => {
      const identity = req.body?.[identityField];
      const password = req.body?.[passwordField];
      if (!identity || !password) {
        return res.status(400).json({ error: `${identityField} and ${passwordField} required` });
      }
      try {
        const colNames = registerFields.map(c => c.name);
        const vals = colNames.map(n => req.body[n]);
        const placeholders = colNames.map(() => '?').join(', ');
        const result = db.prepare(`INSERT INTO ${userTable} (${colNames.join(', ')}) VALUES (${placeholders})`).run(...vals);
        const token = `dev-token-${result.lastInsertRowid}`;
        res.json({ token, user: { id: result.lastInsertRowid, [identityField]: identity } });
      } catch (e: any) {
        res.status(409).json({ error: 'User already exists' });
      }
    });

    // Login
    this.addRoute('POST', '/api/auth/login', (req, res) => {
      const identity = req.body?.[identityField];
      const password = req.body?.[passwordField];
      if (!identity || !password) {
        return res.status(400).json({ error: `${identityField} and ${passwordField} required` });
      }
      const user = db.prepare(`SELECT * FROM ${userTable} WHERE ${identityField} = ?`).get(identity) as Record<string, any> | undefined;
      if (!user || user[passwordField] !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = `dev-token-${user.id}`;
      const { [passwordField]: _, ...safe } = user;
      res.json({ token, user: safe });
    });

    // Me
    this.addRoute('GET', '/api/auth/me', (req, res) => {
      const auth = req.headers['authorization'] as string | undefined;
      if (!auth?.startsWith('Bearer dev-token-')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      const id = auth.slice('Bearer dev-token-'.length);
      const user = db.prepare(`SELECT * FROM ${userTable} WHERE id = ?`).get(id) as Record<string, any> | undefined;
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { [passwordField]: _, ...safe } = user;
      res.json(safe);
    });
  }

  /**
   * Register full CRUD endpoints for a single table.
   */
  private registerCrudRoutes(table: TableNode): void {
    const name = table.name;
    const db = this.db;
    const insertCols = table.columns.filter(c => c.type !== 'auto');
    const colNames = insertCols.map(c => c.name);
    const hasPassword = table.columns.some(c => c.name === 'password' || c.type === 'password');

    const stripPw = (row: any) => {
      if (!hasPassword || !row) return row;
      const { password: _, ...safe } = row;
      return safe;
    };

    // GET /api/:table — list all
    this.addRoute('GET', `/api/${name}`, (_req, res) => {
      const rows = db.prepare(`SELECT * FROM ${name}`).all() as any[];
      res.json(hasPassword ? rows.map(stripPw) : rows);
    });

    // GET /api/:table/:id — get one
    this.addRoute('GET', `/api/${name}/:id`, (req, res) => {
      const row = db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(req.params.id) as any;
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(stripPw(row));
    });

    // POST /api/:table — create
    this.addRoute('POST', `/api/${name}`, (req, res) => {
      try {
        const vals = colNames.map(n => req.body?.[n]);
        const placeholders = colNames.map(() => '?').join(', ');
        const info = db.prepare(`INSERT INTO ${name} (${colNames.join(', ')}) VALUES (${placeholders})`).run(...vals);
        const created = db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(info.lastInsertRowid);
        res.status(201).json(stripPw(created));
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    });

    // PUT /api/:table/:id — update
    this.addRoute('PUT', `/api/${name}/:id`, (req, res) => {
      try {
        const validCols = new Set(colNames);
        const fields = Object.keys(req.body || {}).filter(k => k !== 'id' && validCols.has(k));
        if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });
        const sets = fields.map(f => `${f} = ?`).join(', ');
        const vals = fields.map(f => req.body[f]);
        vals.push(req.params.id);
        const info = db.prepare(`UPDATE ${name} SET ${sets} WHERE id = ?`).run(...vals);
        if (!info.changes) return res.status(404).json({ error: 'Not found' });
        const updated = db.prepare(`SELECT * FROM ${name} WHERE id = ?`).get(req.params.id);
        res.json(stripPw(updated));
      } catch (e: any) {
        res.status(400).json({ error: e.message });
      }
    });

    // DELETE /api/:table/:id — delete
    this.addRoute('DELETE', `/api/${name}/:id`, (req, res) => {
      const info = db.prepare(`DELETE FROM ${name} WHERE id = ?`).run(req.params.id);
      if (!info.changes) return res.status(404).json({ error: 'Not found' });
      res.json({ deleted: true });
    });
  }

  /**
   * Register an API route.
   */
  private addRoute(method: string, pattern: string, handler: ApiHandler): void {
    const segments = pattern.split('/').filter(Boolean);
    const paramNames: string[] = [];
    for (const seg of segments) {
      if (seg.startsWith(':')) paramNames.push(seg.slice(1));
    }
    this.apiRoutes.push({ method: method.toUpperCase(), pattern, segments, paramNames, handler });
  }

  /**
   * Match a request against registered API routes.
   */
  private matchApiRoute(method: string, pathname: string): { route: ApiRoute; params: Record<string, string> } | null {
    const reqSegments = pathname.split('/').filter(Boolean);

    for (const route of this.apiRoutes) {
      if (route.method !== method) continue;
      if (route.segments.length !== reqSegments.length) continue;

      let match = true;
      const params: Record<string, string> = {};

      for (let i = 0; i < route.segments.length; i++) {
        const pat = route.segments[i];
        const req = reqSegments[i];
        if (pat.startsWith(':')) {
          params[pat.slice(1)] = req;
        } else if (pat !== req) {
          match = false;
          break;
        }
      }

      if (match) return { route, params };
    }

    return null;
  }

  /**
   * Handle an API request: parse JSON body, match route, invoke handler.
   */
  private handleApiRequest(raw: http.IncomingMessage, rawRes: http.ServerResponse, method: string, pathname: string): void {
    // For GET/DELETE we don't need to parse body
    if (method === 'GET' || method === 'DELETE' || method === 'HEAD') {
      const matched = this.matchApiRoute(method, pathname);
      if (!matched) {
        rawRes.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        rawRes.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      const apiReq: ApiReq = {
        method,
        url: pathname,
        params: matched.params,
        body: {},
        headers: raw.headers as Record<string, string | string[] | undefined>,
      };
      const apiRes = createApiRes(rawRes);
      try {
        matched.route.handler(apiReq, apiRes);
      } catch (e: any) {
        if (!apiRes._sent) apiRes.status(500).json({ error: e.message });
      }
      return;
    }

    // POST/PUT/PATCH — read and parse JSON body
    let bodyChunks: Buffer[] = [];
    raw.on('data', (chunk: Buffer) => bodyChunks.push(chunk));
    raw.on('end', () => {
      let body: any = {};
      try {
        const raw = Buffer.concat(bodyChunks).toString('utf-8');
        if (raw.length > 0) body = JSON.parse(raw);
      } catch {
        rawRes.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        rawRes.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const matched = this.matchApiRoute(method, pathname);
      if (!matched) {
        rawRes.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        rawRes.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      const apiReq: ApiReq = {
        method,
        url: pathname,
        params: matched.params,
        body,
        headers: raw.headers as Record<string, string | string[] | undefined>,
      };
      const apiRes = createApiRes(rawRes);
      try {
        matched.route.handler(apiReq, apiRes);
      } catch (e: any) {
        if (!apiRes._sent) apiRes.status(500).json({ error: e.message });
      }
    });
  }

  /**
   * Graceful shutdown.
   */
  private shutdown(): void {
    console.log(`\n   \x1b[36m👋 Dev server stopped.\x1b[0m\n`);

    // Close watchers
    for (const w of this.watchers) {
      try { w.close(); } catch { /* ignore */ }
    }

    // Close SSE connections
    for (const client of this.sseClients) {
      try { client.end(); } catch { /* ignore */ }
    }

    // Close HTTP server
    if (this.server) {
      this.server.close();
    }

    // Close SQLite database
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
    }

    process.exit(0);
  }
}
