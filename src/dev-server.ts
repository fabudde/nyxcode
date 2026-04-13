/**
 * NyxCode Dev Server
 * 
 * - Compiles .nyx → HTML
 * - Serves compiled files via HTTP (from memory, no disk I/O)
 * - Watches for changes, auto-rebuilds with debounce
 * - Live Reload via Server-Sent Events (injected script)
 * 
 * Zero third-party dependencies — uses only node:http, node:fs, node:path.
 */

import * as http from 'http';
import { readFileSync, watch as fsWatch, statSync } from 'fs';
import { resolve, dirname, relative, extname, join } from 'path';
import { parse } from './index.js';
import { Compiler } from './compiler.js';
import { Validator } from './validator.js';
import { Program, ComponentNode, UseStatement } from './ast.js';

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
        console.log('   Routes:');
        for (const route of result.routes) {
          console.log(`   · ${route}`);
        }
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

    // SSE endpoint for live reload
    if (pathname === '/__nyx_reload') {
      this.handleSSE(req, res);
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
        console.log(`   \x1b[32m✅ Rebuilt ${result.pageCount} page${result.pageCount > 1 ? 's' : ''} (${formatSize(result.totalBytes)}) [${Math.round(result.ms)}ms]\x1b[0m`);
        // Notify browsers to reload
        this.notifyReload();
      } else {
        console.log(`   \x1b[33m⏳ Waiting for changes...\x1b[0m`);
      }

      // Re-setup watchers (imports may have changed)
      this.setupWatchers();
    }, 150);
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

    process.exit(0);
  }
}
