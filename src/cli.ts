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
import { readFileSync, writeFileSync, mkdirSync, watch as fsWatch, statSync, readdirSync } from 'fs';
import { resolve, dirname, relative, isAbsolute, join, extname, basename } from 'path';
import { parse } from './index.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler } from './compiler.js';
import { Validator, ValidationError } from './validator.js';
import { Program, ComponentNode, UseStatement, TopLevelNode, PageNode, LayoutNode, ThemeNode, StoreNode } from './ast.js';

/**
 * Multi-file import system (v0.21.0)
 *
 * `use "./path.nyx"` — single file relative import
 * `use "./components/"` — directory import (all .nyx files, alphabetical)
 * `use "@/shared/nav.nyx"` — @/ = project root (directory containing entry file)
 *
 * Security: local-only. No URLs, no absolute outside-project paths.
 * Imports are merged at AST level. Circular imports skipped via visited Set.
 * Duplicate definitions (pages, themes, components, layouts, stores) throw build errors.
 */

interface ImportResolveResult {
  ast: Program;
  sourceFiles: string[]; // absolute paths of every file touched (for watch mode)
  errors: string[];
}

function resolveAllImports(entryPath: string): ImportResolveResult {
  const entryAbs = resolve(entryPath);
  const projectRoot = dirname(entryAbs);
  const visited = new Set<string>();
  const sourceFiles: string[] = [];
  const errors: string[] = [];

  // Global registries to detect duplicates during merge
  const seenPages = new Map<string, string>();           // route -> file
  const seenComponents = new Map<string, string>();      // name  -> file
  const seenLayoutFile: { value: string | null } = { value: null };
  const seenThemeFile: { value: string | null } = { value: null };
  const mergedBody: TopLevelNode[] = [];

  function resolveImportPath(rawPath: string, fromFile: string): string | null {
    // v0.23.1 security hardening (recommended by @TytoTheOwl 🦉):
    // Use an ALLOWLIST, not a denylist. Any URI scheme we don't explicitly permit is rejected.
    // This catches current and future schemes we haven't anticipated: javascript:, data:, ws://,
    // wss://, ssh://, git://, s3://, gs://, protocol-relative //, etc.
    //
    // Allowed shapes:
    //   ./foo.nyx        — relative (current dir)
    //   ../foo.nyx       — relative (parent dir)
    //   @/foo.nyx        — project-root alias
    //   /abs/foo.nyx     — absolute (only permitted if within projectRoot; checked below)
    //   foo.nyx          — bare filename, treated as relative to the importing file's dir
    //   foo/bar.nyx      — subdir, also relative
    //
    // Anything with a `<scheme>:` prefix or a `//` prefix is rejected.
    // Scheme detection: at least 2 alpha chars followed by `:` (to not collide with Windows C:\ paths).
    if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(rawPath) || rawPath.startsWith('//')) {
      errors.push(`[${relative(process.cwd(), fromFile)}] only local relative, @/-alias, or in-project absolute paths are allowed. Got: "${rawPath}"`);
      return null;
    }
    let resolved: string;
    if (rawPath.startsWith('@/')) {
      resolved = resolve(projectRoot, rawPath.slice(2));
    } else if (isAbsolute(rawPath)) {
      // Allow absolute only if within projectRoot
      resolved = rawPath;
    } else {
      resolved = resolve(dirname(fromFile), rawPath);
    }
    // Security: must be inside project root
    const rel = relative(projectRoot, resolved);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      errors.push(`[${relative(process.cwd(), fromFile)}] import path escapes project root: "${rawPath}"`);
      return null;
    }
    return resolved;
  }

  function loadFile(absPath: string, fromFile: string, rawPath: string): void {
    // Circular / already-visited: skip silently (like ES modules)
    if (visited.has(absPath)) return;

    // Directory import: alphabetical .nyx files
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(absPath);
    } catch {
      errors.push(`[${relative(process.cwd(), fromFile)}] import not found: "${rawPath}" (resolved: ${relative(projectRoot, absPath)})`);
      return;
    }

    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = readdirSync(absPath)
          .filter(f => extname(f) === '.nyx')
          .sort();
      } catch {
        errors.push(`[${relative(process.cwd(), fromFile)}] cannot read directory: "${rawPath}"`);
        return;
      }
      for (const entry of entries) {
        loadFile(join(absPath, entry), fromFile, join(rawPath, entry));
      }
      return;
    }

    // File import
    visited.add(absPath);
    sourceFiles.push(absPath);

    let src: string;
    try {
      src = readFileSync(absPath, 'utf-8');
    } catch {
      errors.push(`[${relative(process.cwd(), fromFile)}] cannot read file: "${rawPath}"`);
      return;
    }

    let imported: Program;
    try {
      imported = parse(src);
    } catch (e: any) {
      errors.push(`[${relative(process.cwd(), absPath)}] parse error: ${e.message || e}`);
      return;
    }

    // Recurse into its imports first (depth-first, so dependencies are loaded before users)
    for (const node of imported.body) {
      if (node.type === 'Use') {
        const subResolved = resolveImportPath((node as UseStatement).path, absPath);
        if (subResolved !== null) {
          loadFile(subResolved, absPath, (node as UseStatement).path);
        }
      }
      // v0.23.0 — also follow `@theme extends "./path.nyx"` as an implicit import
      // so users do not have to write a separate `use` line. Same security rules apply.
      if (node.type === 'Theme' && (node as any).extends) {
        const extPath = (node as any).extends;
        const subResolved = resolveImportPath(extPath, absPath);
        if (subResolved !== null) {
          loadFile(subResolved, absPath, extPath);
        }
      }
    }

    // Merge non-Use nodes into global body, checking for duplicates
    mergeNodes(imported.body, absPath);
  }

  function mergeNodes(nodes: TopLevelNode[], fromFile: string): void {
    const fileRel = relative(projectRoot, fromFile);
    for (const node of nodes) {
      if (node.type === 'Use') continue; // already processed
      if (node.type === 'Page') {
        const route = (node as PageNode).path;
        if (seenPages.has(route)) {
          errors.push(`duplicate page "${route}" (already defined in ${seenPages.get(route)}, redefined in ${fileRel})`);
          continue;
        }
        seenPages.set(route, fileRel);
      } else if (node.type === 'Component') {
        const name = (node as ComponentNode).name;
        if (seenComponents.has(name)) {
          errors.push(`duplicate component "${name}" (already defined in ${seenComponents.get(name)}, redefined in ${fileRel})`);
          continue;
        }
        seenComponents.set(name, fileRel);
      } else if (node.type === 'Layout') {
        // Only error on cross-file duplicates (two files both defining a layout).
        // Within-file is caught by the compiler's existing "only one layout per file" check.
        if (seenLayoutFile.value !== null && seenLayoutFile.value !== fileRel) {
          errors.push(`duplicate layout (already defined in ${seenLayoutFile.value}, redefined in ${fileRel})`);
          continue;
        }
        seenLayoutFile.value = fileRel;
      } else if (node.type === 'Theme') {
        // Theme: multiple theme nodes in ONE file are legal (preset selection + overrides).
        // v0.23.0: Named themes (`theme as "name"`) and extending themes (`theme extends "./..."`)
        // ARE allowed across files — that is the whole point of composition.
        const themeNode: any = node;
        const isComposable = !!themeNode.name || !!themeNode.extends;
        if (isComposable) {
          mergedBody.push(node);
          continue;
        }
        // Regular themes: cross-file ambiguity is still an error.
        if (seenThemeFile.value !== null && seenThemeFile.value !== fileRel) {
          errors.push(`theme defined in multiple files (${seenThemeFile.value} and ${fileRel}) — consolidate into one file`);
          continue;
        }
        seenThemeFile.value = fileRel;
      }
      mergedBody.push(node);
    }
  }

  // Kick off with entry file
  loadFile(entryAbs, entryAbs, relative(process.cwd(), entryAbs));

  return {
    ast: { type: 'Program', body: mergedBody, line: 1, col: 1 },
    sourceFiles,
    errors,
  };
}

/**
 * Flatten: concatenates all source files (entry + transitive imports) into a single .nyx source.
 * Preserves comments and formatting because it works at SOURCE level, not AST level.
 * Strips `use "./..."` lines that point to internal (resolvable) paths.
 * Leaves remote/third-party `use` strings untouched (though we currently reject those anyway).
 *
 * Order: dependencies first (depth-first post-order), then entry file last.
 * This means imported components are defined before pages that use them.
 */
function flattenToSource(entryPath: string): { source: string; errors: string[]; fileCount: number } {
  const entryAbs = resolve(entryPath);
  const projectRoot = dirname(entryAbs);
  const visited = new Set<string>();
  const errors: string[] = [];
  const orderedFiles: string[] = []; // post-order: deepest dependencies first

  function resolveInternalPath(rawPath: string, fromFile: string): string | null {
    if (/^(https?:|ftp:|file:|\/\/)/i.test(rawPath)) return null;
    let abs: string;
    if (rawPath.startsWith('@/')) abs = resolve(projectRoot, rawPath.slice(2));
    else if (isAbsolute(rawPath)) abs = rawPath;
    else abs = resolve(dirname(fromFile), rawPath);
    const rel = relative(projectRoot, abs);
    if (rel.startsWith('..')) return null;
    return abs;
  }

  function walk(absPath: string, fromFile: string, rawPath: string): void {
    if (visited.has(absPath)) return;

    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(absPath);
    } catch {
      errors.push(`[${relative(process.cwd(), fromFile)}] cannot resolve "${rawPath}"`);
      return;
    }

    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = readdirSync(absPath).filter(f => extname(f) === '.nyx').sort();
      } catch {
        return;
      }
      for (const entry of entries) {
        walk(join(absPath, entry), fromFile, join(rawPath, entry));
      }
      return;
    }

    visited.add(absPath);

    let src: string;
    try {
      src = readFileSync(absPath, 'utf-8');
    } catch {
      errors.push(`cannot read ${relative(process.cwd(), absPath)}`);
      return;
    }

    // Recurse into this file's imports first (depth-first)
    let ast: Program;
    try {
      ast = parse(src);
    } catch (e: any) {
      errors.push(`[${relative(process.cwd(), absPath)}] parse error: ${e.message || e}`);
      return;
    }
    for (const node of ast.body) {
      if (node.type === 'Use') {
        const sub = resolveInternalPath((node as UseStatement).path, absPath);
        if (sub !== null) walk(sub, absPath, (node as UseStatement).path);
      }
    }

    // Post-order: add AFTER dependencies
    orderedFiles.push(absPath);
  }

  walk(entryAbs, entryAbs, relative(process.cwd(), entryAbs));

  if (errors.length > 0) return { source: '', errors, fileCount: 0 };

  // Regex that strips any line that is ONLY a `use "..."` import
  //   Matches:    use "./foo.nyx"
  //               use  './foo/'
  //   Does NOT match:  use Nav(...)  (component invocation)
  //                    NavBar x="y" use="y" (attribute)
  const importLineRe = /^[ \t]*use[ \t]+["'][^"'\n]+["'][ \t]*;?[ \t]*(?:#[^\n]*)?$/gm;

  const chunks: string[] = [];
  for (const f of orderedFiles) {
    const src = readFileSync(f, 'utf-8');
    const rel = relative(projectRoot, f);
    const cleaned = src.replace(importLineRe, '').replace(/\n{3,}/g, '\n\n').trimStart();
    chunks.push(`# --- from: ${rel} ---\n${cleaned}`);
  }

  return {
    source: chunks.join('\n\n') + '\n',
    errors: [],
    fileCount: orderedFiles.length,
  };
}
import { DevServer } from './dev-server.js';
import { ConfigNode, HookNode } from './ast.js';
import { compileBackend } from './backend-compiler.js';
import { compileAuth } from './auth-compiler.js';
import { TableNode, SecurityNode, ApiNode } from './ast.js';

const args = process.argv.slice(2);
const command = args[0];
const file = args[1];

/**
 * Parse --output / -o flag from args. Supports:
 *   -o path/to/file.html       → single-file output
 *   --output path/to/dir/      → directory output
 *   -o=path/to/thing           → equals-form
 * Returns the path string, or null if not present.
 */
function getOutputFlag(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') {
      return argv[i + 1] ?? null;
    }
    if (a.startsWith('-o=')) return a.slice(3);
    if (a.startsWith('--output=')) return a.slice(9);
  }
  return null;
}

if (!command || (command !== 'dev' && !file) || (!file && command !== '--help')) {
  console.log(`
🦞 NyxCode v${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}

Usage:
  nyx parse <file.nyx>              Parse file → AST (JSON)
  nyx flatten <file.nyx>            Flatten multi-file project to single .nyx source
  nyx tokens <file.nyx>             Tokenize file → Token list
  nyx build <file.nyx> [-o <path>]  Compile file → HTML output
  nyx watch <file.nyx> [-o <path>]  Watch file & rebuild on change
  nyx dev <file.nyx> [--port=3000]  Dev server with live reload

Examples:
  nyx parse examples/hello.nyx
  nyx build examples/hello.nyx
  nyx build examples/hello.nyx -o build/index.html    # single-file output
  nyx build examples/hello.nyx -o public/             # directory output
  nyx watch examples/landing.nyx
  nyx dev examples/docs.nyx
  nyx dev examples/landing.nyx --port=8080

Output:
  Without -o: defaults to <input-file-dir>/dist-site/
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
} else if (command === 'flatten') {
    // === Flatten ===
    // Concatenate entry + all transitive imports into a single .nyx source (stdout).
    // Output can be piped to a file: `nyx flatten app.nyx > flat.nyx`
    //
    // Works at SOURCE level — preserves comments and formatting.
    // Import lines (`use "./..."`) are stripped. Non-internal `use` (component invocation) is kept.
    const result = flattenToSource(filePath);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`\x1b[31m❌ Flatten: ${err}\x1b[0m`);
      }
      process.exit(1);
    }
    // Prepend a header comment so output is obviously generated.
    // Note: we operate at SOURCE level (not AST), so comments and formatting ARE preserved.
    // Only `use "./..."` import lines are stripped; everything else passes through byte-for-byte.
    const header = `# Flattened from ${relative(process.cwd(), filePath)} (${result.fileCount} file${result.fileCount !== 1 ? 's' : ''})\n# Generated by \`nyx flatten\`. Comments and formatting preserved.\n\n`;
    process.stdout.write(header + result.source);
    console.error(`\x1b[36mℹ️  Flattened ${result.fileCount} file${result.fileCount !== 1 ? 's' : ''} to stdout (${result.source.length} bytes).\x1b[0m`);
} else if (command === 'build') {
    // Resolve all imports recursively (merges into a single AST)
    const resolved = resolveAllImports(filePath);
    if (resolved.errors.length > 0) {
      for (const err of resolved.errors) {
        console.error(`\x1b[31m❌ Import error: ${err}\x1b[0m`);
      }
      console.error(`\n\x1b[31m${resolved.errors.length} import error(s). Compilation aborted.\x1b[0m`);
      process.exit(1);
    }
    const ast = resolved.ast;

    // --- Validation pass ---
    // All components are already in the merged AST, so no separate importedComponents set needed
    const validator = new Validator();
    const validationResults = validator.validate(ast, new Set());

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

    // Count pages to determine output mode
    const pages = ast.body.filter((n: any) => n.type === 'Page');

    // Resolve output path (Issue #82):
    //  -o <file.html>   → single-file output (error if multi-page)
    //  -o <dir>         → use as output directory
    //  (no flag)        → default to <input-file-dir>/dist-site/ (sibling of input)
    const outputFlag = getOutputFlag(args);
    let outDir: string;
    let singleFilePath: string | null = null;

    if (outputFlag) {
      const outResolved = resolve(outputFlag);
      const looksLikeFile = extname(outputFlag).toLowerCase() === '.html';
      if (looksLikeFile) {
        if (pages.length > 1) {
          console.error(`\x1b[31m❌ Cannot use -o <file.html> with a multi-page project (${pages.length} pages). Pass a directory path instead, e.g. -o ./build/\x1b[0m`);
          process.exit(1);
        }
        singleFilePath = outResolved;
        outDir = dirname(outResolved);
      } else {
        outDir = outResolved;
      }
    } else {
      // Default: sibling of input file (not CWD)
      outDir = resolve(dirname(filePath), 'dist-site');
    }

    if (pages.length <= 1) {
      // Single page — legacy behavior: one index.html
      const output = compiler.compile(ast);
      mkdirSync(outDir, { recursive: true });
      const outFile = singleFilePath ?? resolve(outDir, 'index.html');
      writeFileSync(outFile, output.html);
      console.log(`✅ Built: ${outFile}`);
      console.log(`   HTML: ${output.html.length} bytes`);
      if (output.css) console.log(`   CSS:  ${output.css.length} bytes`);
      if (output.js) console.log(`   JS:   ${output.js.length} bytes`);
    } else {
      // Multi-page — static site generation: one HTML per page
      const results = compiler.compileMultiFile(ast);
      let totalBytes = 0;

      for (const { path: pagePath, html } of results) {
        // Convert route to file path:
        //   /docs        → <outDir>/docs/index.html
        //   /docs/install → <outDir>/docs/install/index.html
        //   /            → <outDir>/index.html
        let fileDirPath: string;
        if (pagePath === '/') {
          fileDirPath = outDir;
        } else {
          fileDirPath = resolve(outDir, pagePath.replace(/^\//, '').replace(/\/+$/, ''));
        }
        mkdirSync(fileDirPath, { recursive: true });
        const outFile = resolve(fileDirPath, 'index.html');
        writeFileSync(outFile, html);
        totalBytes += html.length;
      }

      console.log(`✅ Built: ${results.length} pages to ${outDir}/`);
      console.log(`   Total: ${totalBytes} bytes`);
      for (const { path: pagePath } of results) {
        const rel = pagePath === '/' ? 'index.html' : pagePath.replace(/^\//, '').replace(/\/+$/, '') + '/index.html';
        console.log(`   📄 ${rel}`);
      }
    }
    // === Backend Generation ===
    const tables = ast.body.filter((n: any) => n.type === 'Table') as TableNode[];
    const apis = ast.body.filter((n: any) => n.type === 'Api') as ApiNode[];
    const security = ast.body.find((n: any) => n.type === 'Security') as SecurityNode | undefined;
    const config = ast.body.find((n: any) => n.type === 'Config') as ConfigNode | undefined;
    const hooks = ast.body.filter((n: any) => n.type === 'Hook') as HookNode[];

    // Issue #80: auto-inject users table when security block references one that wasn't declared.
    // Previously the compiler generated INSERT/SELECT against `users` without a corresponding
    // CREATE TABLE, breaking register/login at runtime. Now we synthesize a minimal user table
    // with sensible defaults (id auto-inc + login fields + password) if the user didn't declare one.
    if (security) {
      const userTableName = (security.rules.find(r => r.name === 'table')?.value) || 'users';
      if (!tables.some(t => t.name === userTableName)) {
        const loginRule = security.rules.find(r => r.name === 'login')?.value || 'email password';
        const loginFields = loginRule.split(/\s+/).filter(Boolean);
        const identityField = loginFields[0] || 'email';
        const passwordField = loginFields[loginFields.length - 1] || 'password';

        const syntheticCols: any[] = [];
        // identity field: required + unique
        syntheticCols.push({ name: identityField, type: identityField === 'email' ? 'email' : 'text', constraints: ['required', 'unique'] });
        // any additional login fields between identity and password
        for (const f of loginFields.slice(1, -1)) {
          syntheticCols.push({ name: f, type: 'text', constraints: ['required'] });
        }
        // password field (only add if distinct from identity)
        if (passwordField !== identityField) {
          syntheticCols.push({ name: passwordField, type: 'text', constraints: ['required'] });
        }
        const syntheticTable = {
          type: 'Table',
          name: userTableName,
          columns: syntheticCols,
          line: (security as any).line || 1,
          col: (security as any).col || 1,
        } as TableNode;
        tables.unshift(syntheticTable);
        console.error(`\x1b[90mℹ️  Auto-generating "${userTableName}" table for security block (declare it explicitly to customize).\x1b[0m`);
      }
    }

    if (tables.length > 0 || apis.length > 0) {
      // Extract protected paths from security block
      const protectedPaths = security 
        ? security.rules.filter(r => r.name === 'protect').map(r => r.value)
        : [];
      const middlewares = ast.body.filter((n: any) => n.type === 'Middleware') as any[];
      let serverCode = compileBackend(tables, apis, config, hooks, [], middlewares);
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

    // Track files for watch (populated by doBuild)
    let currentWatchFiles: string[] = [filePath];

    // Build function (returns success/failure info)
    function doBuild(): { ok: boolean; pages: number; bytes: number; ms: number } {
      const start = performance.now();
      try {
        const resolved = resolveAllImports(filePath);
        // Keep watch list up to date every rebuild
        currentWatchFiles = resolved.sourceFiles.length > 0 ? resolved.sourceFiles : [filePath];

        if (resolved.errors.length > 0) {
          for (const err of resolved.errors) {
            console.error(`\x1b[31m❌ Import: ${err}\x1b[0m`);
          }
          return { ok: false, pages: 0, bytes: 0, ms: performance.now() - start };
        }
        const ast = resolved.ast;

        const validator = new Validator();
        const validationResults = validator.validate(ast, new Set());
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

        const pages = ast.body.filter((n: any) => n.type === 'Page');

        // Resolve output path (Issue #82) — mirrors build-command logic
        const outputFlag = getOutputFlag(args);
        let outDir: string;
        let singleFilePath: string | null = null;
        if (outputFlag) {
          const outResolved = resolve(outputFlag);
          const looksLikeFile = extname(outputFlag).toLowerCase() === '.html';
          if (looksLikeFile) {
            if (pages.length > 1) {
              console.error(`\x1b[31m❌ Cannot use -o <file.html> with multi-page project. Use a directory.\x1b[0m`);
              return { ok: false, pages: 0, bytes: 0, ms: performance.now() - start };
            }
            singleFilePath = outResolved;
            outDir = dirname(outResolved);
          } else {
            outDir = outResolved;
          }
        } else {
          outDir = resolve(dirname(filePath), 'dist-site');
        }

        let totalBytes = 0;
        let pageCount = 0;

        if (pages.length <= 1) {
          const output = compiler.compile(ast);
          mkdirSync(outDir, { recursive: true });
          const outFile = singleFilePath ?? resolve(outDir, 'index.html');
          writeFileSync(outFile, output.html);
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

      const files = currentWatchFiles;
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
