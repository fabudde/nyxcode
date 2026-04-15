#!/usr/bin/env node
/**
 * NyxCode CLI
 * 
 * Usage:
 *   nyx parse <file.nyx>    — Parse a .nyx file and output the AST as JSON
 *   nyx tokens <file.nyx>   — Tokenize a .nyx file and output tokens
 *   nyx build <file.nyx>    — Compile a .nyx file to HTML
 *   nyx watch <file.nyx>    — Watch file & rebuild on change
 *   nyx dev <file.nyx>      — Dev server with hot reload
 * 
 * Examples:
 *   nyx parse examples/hello.nyx
 *   nyx tokens examples/todo.nyx
 *   nyx dev examples/docs.nyx --port=8080
 */

import * as fs from 'fs';
import { readFileSync, writeFileSync, mkdirSync, watch as fsWatch, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { parse } from './index.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler } from './compiler.js';
import { Validator, ValidationError } from './validator.js';
import { Program, ComponentNode, UseStatement } from './ast.js';
import { DevServer } from './dev-server.js';
import { ConfigNode, HookNode } from './ast.js';
import { compileBackend } from './backend-compiler.js';
import { compileAuth } from './auth-compiler.js';
import { TableNode, SecurityNode, ApiNode } from './ast.js';

const args = process.argv.slice(2);
const command = args[0];
const file = args[1];

if (!command || (command !== 'dev' && !file) || (!file && command !== '--help')) {
  console.log(`
🦞 NyxCode v0.15.1

Usage:
  nyx parse <file.nyx>              Parse file → AST (JSON)
  nyx tokens <file.nyx>             Tokenize file → Token list
  nyx build <file.nyx>              Compile file → HTML output
  nyx watch <file.nyx>              Watch file & rebuild on change
  nyx dev <file.nyx> [--port=3000]  Dev server with live reload

Examples:
  nyx parse examples/hello.nyx
  nyx build examples/hello.nyx
  nyx watch examples/landing.nyx
  nyx dev examples/docs.nyx
  nyx dev examples/landing.nyx --port=8080
`);
  process.exit(0);
}

// Handle 'dev' command early — it manages its own file I/O and never exits
if (command === 'dev') {
  if (!file) {
    console.error('Usage: nyxcode dev <file.nyx> [--port=3000]');
    process.exit(1);
  }
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : 3000;
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`\x1b[31m❌ Invalid port number\x1b[0m`);
    process.exit(1);
  }
  const server = new DevServer(file, port);
  server.start();
  // Dev server keeps process alive — no code below runs
} else {
  // All other commands need to read the file upfront

const filePath = resolve(file);
let source: string;

try {
  source = readFileSync(filePath, 'utf-8');
} catch (e) {
  console.error(`❌ Cannot read file: ${filePath}`);
  process.exit(1);
}

try {
  if (command === 'parse') {
    const ast = parse(source);
    console.log(JSON.stringify(ast, null, 2));
  } else if (command === 'tokens') {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    for (const t of tokens) {
      console.log(`${t.line}:${t.col.toString().padEnd(4)} ${t.type.padEnd(15)} ${t.value}`);
    }
  } else if (command === 'parse') {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('Usage: nyxcode parse <file.nyx>');
    process.exit(1);
  }
  const source = fs.readFileSync(inputFile, 'utf-8');
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  console.log(JSON.stringify(ast, null, 2));
  console.log(`\n✅ Parsed ${ast.body.length} top-level nodes successfully.`);
} else if (command === 'build') {
    const ast = parse(source);

    // Set up import resolver for `use` statements
    const baseDir = dirname(filePath);
    const resolveImport = (importPath: string): Program | null => {
      try {
        const resolved = resolve(baseDir, importPath);
        const importSource = readFileSync(resolved, 'utf-8');
        return parse(importSource);
      } catch {
        return null;
      }
    };

    // --- Validation pass ---
    // Resolve imported component names for the validator
    const importedComponents = new Set<string>();
    const uses = ast.body.filter(n => n.type === 'Use');
    for (const use of uses) {
      const imported = resolveImport((use as any).path);
      if (imported) {
        for (const node of imported.body) {
          if (node.type === 'Component') {
            importedComponents.add((node as ComponentNode).name);
          }
        }
      }
    }

    const validator = new Validator();
    const validationResults = validator.validate(ast, importedComponents);

    const validationErrors = validationResults.filter(e => e.severity === 'error');
    const validationWarnings = validationResults.filter(e => e.severity === 'warning');

    // Print warnings
    for (const w of validationWarnings) {
      console.log(`\x1b[33m⚠️  Warning: ${w.message} (line ${w.line}:${w.col})\x1b[0m`);
    }

    // Print errors and abort if any
    if (validationErrors.length > 0) {
      for (const e of validationErrors) {
        console.error(`\x1b[31m❌ Error: ${e.message} (line ${e.line}:${e.col})\x1b[0m`);
      }
      console.error(`\n\x1b[31m${validationErrors.length} error(s) found. Compilation aborted.\x1b[0m`);
      process.exit(1);
    }

    if (validationWarnings.length > 0) {
      console.log(''); // blank line after warnings
    }

    const compiler = new Compiler({ pretty: true });
    compiler.setImportResolver(resolveImport);

    // Count pages to determine output mode
    const pages = ast.body.filter((n: any) => n.type === 'Page');
    const outDir = resolve('dist-site');

    if (pages.length <= 1) {
      // Single page — legacy behavior: one index.html
      const output = compiler.compile(ast);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, 'index.html'), output.html);
      console.log(`✅ Built: ${outDir}/index.html`);
      console.log(`   HTML: ${output.html.length} bytes`);
      if (output.css) console.log(`   CSS:  ${output.css.length} bytes`);
      if (output.js) console.log(`   JS:   ${output.js.length} bytes`);
    } else {
      // Multi-page — static site generation: one HTML per page
      const results = compiler.compileMultiFile(ast);
      let totalBytes = 0;

      for (const { path: pagePath, html } of results) {
        // Convert route to file path:
        //   /docs        → dist-site/docs/index.html
        //   /docs/install → dist-site/docs/install/index.html
        //   /            → dist-site/index.html
        let fileDirPath: string;
        if (pagePath === '/') {
          fileDirPath = outDir;
        } else {
          fileDirPath = resolve(outDir, pagePath.replace(/^\//, ''));
        }
        mkdirSync(fileDirPath, { recursive: true });
        const outFile = resolve(fileDirPath, 'index.html');
        writeFileSync(outFile, html);
        totalBytes += html.length;
      }

      console.log(`✅ Built: ${results.length} pages to dist-site/`);
      console.log(`   Total: ${totalBytes} bytes`);
      for (const { path: pagePath } of results) {
        const rel = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '') + '/index.html';
        console.log(`   📄 ${rel}`);
      }
    }
    // === Backend Generation ===
    const tables = ast.body.filter((n: any) => n.type === 'Table') as TableNode[];
    const apis = ast.body.filter((n: any) => n.type === 'Api') as ApiNode[];
    const security = ast.body.find((n: any) => n.type === 'Security') as SecurityNode | undefined;
    const config = ast.body.find((n: any) => n.type === 'Config') as ConfigNode | undefined;
    const hooks = ast.body.filter((n: any) => n.type === 'Hook') as HookNode[];

    if (tables.length > 0 || apis.length > 0) {
      // Extract protected paths from security block
      const protectedPaths = security 
        ? security.rules.filter(r => r.name === 'protect').map(r => r.value)
        : [];
      let serverCode = compileBackend(tables, apis, config, hooks);
      if (security) {
        // Inject auth AFTER express.json() but BEFORE create tables
        const authCode = compileAuth(security, tables, config);
        // Inject protect middleware AFTER auth definition but BEFORE CRUD  
        const protectLines = protectedPaths.map(p => {
          // Parse "path [write|read|all]" — default is "write" (GET stays open)
          const parts = p.trim().split(/\s+/);
          const rawPath = parts[0];
          const mode = parts[1] || 'write'; // write = POST/PUT/DELETE only, all = everything, read = GET only
          const path = rawPath.startsWith('/api/') ? rawPath : `/api/${rawPath}`;
          // Check for role=X
          const rolePart = parts.find(pt => pt.startsWith('role='));
          const role = rolePart ? rolePart.split('=')[1] : null;
          if (mode === 'all') {
            return role
              ? `\n// Protect ${path} (all methods, role: ${role})\napp.use('${path}', authMiddleware, roleGuard('${role}'));`
              : `\n// Protect ${path} (all methods)\napp.use('${path}', authMiddleware);`;
          } else if (mode === 'read') {
            return `\n// Protect ${path} (read only)\napp.use('${path}', (req, res, next) => { if (req.method === 'GET') return authMiddleware(req, res, next); next(); });`;
          } else {
            // write (default): protect POST, PUT, DELETE — GET stays open
            return `\n// Protect ${path} (write only)\napp.use('${path}', (req, res, next) => { if (req.method !== 'GET') return authMiddleware(req, res, next); next(); });`;
          }
        }
        ).join('\n');
        serverCode = serverCode.replace(
          '// ── Create tables',
          authCode + protectLines + '\n\n// ── Create tables'
        );
      }
      writeFileSync(resolve(outDir, 'server.js'), serverCode);
      // Print required npm deps
      const deps = ['express', 'better-sqlite3', 'express-rate-limit'];
      if (security) deps.push('bcryptjs', 'jsonwebtoken');
      if (config?.cors) deps.push('cors');
      if (tables.some((t: any) => t.columns.some((c: any) => c.type === 'upload'))) deps.push('multer');
      if (tables.some((t: any) => t.columns.some((c: any) => c.constraints.includes('realtime')))) deps.push('ws');
      console.log(`   📦 deps: ${deps.join(' ')}`);
      console.log(`   🖥️  server.js generated (${tables.length} table${tables.length !== 1 ? 's' : ''}${security ? ' + auth' : ''})`);
    }
  } else if (command === 'watch') {
    // === Watch Mode ===
    // Watches .nyx file(s) for changes and rebuilds on save.
    // Uses Node's fs.watch — zero external dependencies.
    console.log(`\x1b[36m�\udc40 Watching ${relative(process.cwd(), filePath)}...\x1b[0m`);

    // Collect all files to watch (main file + use-imported files)
    function collectWatchFiles(mainPath: string): string[] {
      const files = [mainPath];
      try {
        const src = readFileSync(mainPath, 'utf-8');
        const ast = parse(src);
        const baseDir = dirname(mainPath);
        for (const node of ast.body) {
          if (node.type === 'Use') {
            const importPath = resolve(baseDir, (node as UseStatement).path);
            try {
              statSync(importPath);
              files.push(importPath);
            } catch {}
          }
        }
      } catch {}
      return files;
    }

    // Build function (returns success/failure info)
    function doBuild(): { ok: boolean; pages: number; bytes: number; ms: number } {
      const start = performance.now();
      try {
        const src = readFileSync(filePath, 'utf-8');
        const ast = parse(src);
        const baseDir = dirname(filePath);

        const resolveImport = (importPath: string): Program | null => {
          try {
            const resolved = resolve(baseDir, importPath);
            const importSource = readFileSync(resolved, 'utf-8');
            return parse(importSource);
          } catch { return null; }
        };

        // Validation
        const importedComponents = new Set<string>();
        const uses = ast.body.filter(n => n.type === 'Use');
        for (const use of uses) {
          const imported = resolveImport((use as any).path);
          if (imported) {
            for (const node of imported.body) {
              if (node.type === 'Component') {
                importedComponents.add((node as ComponentNode).name);
              }
            }
          }
        }

        const validator = new Validator();
        const validationResults = validator.validate(ast, importedComponents);
        const validationErrors = validationResults.filter(e => e.severity === 'error');
        const validationWarnings = validationResults.filter(e => e.severity === 'warning');

        for (const w of validationWarnings) {
          console.log(`\x1b[33m⚠\ufe0f  ${w.message} (line ${w.line}:${w.col})\x1b[0m`);
        }

        if (validationErrors.length > 0) {
          for (const e of validationErrors) {
            console.error(`\x1b[31m❌ ${e.message} (line ${e.line}:${e.col})\x1b[0m`);
          }
          return { ok: false, pages: 0, bytes: 0, ms: performance.now() - start };
        }

        const compiler = new Compiler({ pretty: true });
        compiler.setImportResolver(resolveImport);

        const pages = ast.body.filter((n: any) => n.type === 'Page');
        const outDir = resolve('dist-site');
        let totalBytes = 0;
        let pageCount = 0;

        if (pages.length <= 1) {
          const output = compiler.compile(ast);
          mkdirSync(outDir, { recursive: true });
          writeFileSync(resolve(outDir, 'index.html'), output.html);
          totalBytes = output.html.length;
          pageCount = 1;
        } else {
          const results = compiler.compileMultiFile(ast);
          for (const { path: pagePath, html } of results) {
            let fileDirPath: string;
            if (pagePath === '/') {
              fileDirPath = outDir;
            } else {
              fileDirPath = resolve(outDir, pagePath.replace(/^\//, ''));
            }
            mkdirSync(fileDirPath, { recursive: true });
            writeFileSync(resolve(fileDirPath, 'index.html'), html);
            totalBytes += html.length;
          }
          pageCount = results.length;
        }

        const ms = performance.now() - start;
        return { ok: true, pages: pageCount, bytes: totalBytes, ms };
      } catch (e: any) {
        console.error(`\x1b[31m❌ ${e.message}\x1b[0m`);
        return { ok: false, pages: 0, bytes: 0, ms: performance.now() - start };
      }
    }

    // Initial build
    const initial = doBuild();
    if (initial.ok) {
      const sizeStr = initial.bytes >= 1024
        ? `${Math.round(initial.bytes / 1024)}KB`
        : `${initial.bytes}B`;
      console.log(`\x1b[32m✅ Built: ${initial.pages} page${initial.pages > 1 ? 's' : ''} (${sizeStr}) [${Math.round(initial.ms)}ms]\x1b[0m`);
    }

    // Set up watchers with debounce
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 100;

    function onFileChange() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log(`\x1b[36m�\udd04 Rebuilding...\x1b[0m`);
        const result = doBuild();
        if (result.ok) {
          const sizeStr = result.bytes >= 1024
            ? `${Math.round(result.bytes / 1024)}KB`
            : `${result.bytes}B`;
          console.log(`\x1b[32m✅ Built: ${result.pages} page${result.pages > 1 ? 's' : ''} (${sizeStr}) [${Math.round(result.ms)}ms]\x1b[0m`);
        }

        // Re-collect watch files (imports may have changed)
        setupWatchers();
      }, DEBOUNCE_MS);
    }

    const activeWatchers: ReturnType<typeof fsWatch>[] = [];

    function setupWatchers() {
      // Close old watchers
      for (const w of activeWatchers) w.close();
      activeWatchers.length = 0;

      const files = collectWatchFiles(filePath);
      for (const f of files) {
        try {
          const watcher = fsWatch(f, { persistent: true }, (eventType) => {
            if (eventType === 'change') onFileChange();
          });
          activeWatchers.push(watcher);
        } catch {
          // File may not exist yet — skip
        }
      }
    }

    setupWatchers();

    // Keep process alive & handle Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\x1b[36m�\udc4b Stopped watching.\x1b[0m');
      for (const w of activeWatchers) w.close();
      process.exit(0);
    });

  } else {
    console.error(`\x1b[31m❌ Unknown command: ${command}. Use 'parse', 'tokens', 'build', 'watch', or 'dev'.\x1b[0m`);
    process.exit(1);
  }
} catch (e: any) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}

} // end of else block for non-dev commands
