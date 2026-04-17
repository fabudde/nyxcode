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
import { readFileSync, writeFileSync, mkdirSync, watch as fsWatch, statSync, readdirSync, realpathSync, openSync, fstatSync, closeSync } from 'fs';
import { resolve, dirname, relative, isAbsolute, join, extname, basename } from 'path';

/**
 * v0.24.1 (Issue #92) — TOCTOU-safe file read for imports.
 *
 * The previous implementation had two gaps:
 *   1. `resolve()` does NOT follow symlinks. A symlink at `./leak.nyx` pointing
 *      to `/etc/passwd` passed the projectRoot check (the symlink path itself
 *      was in-project) but the target was outside.
 *   2. `statSync()` and `readFileSync()` used *separate* path lookups. Between
 *      them, the underlying file could be swapped.
 *
 * This helper closes both:
 *   - realpath the target → canonical, symlink-free. Recheck bounds against
 *     realpath(projectRoot).
 *   - Open the canonical path ONCE. Everything downstream (fstat, read) uses
 *     the same file descriptor, which is pinned to a single inode.
 *   - O_NOFOLLOW on the leaf: if between realpath() and openSync() an attacker
 *     swaps the leaf for a symlink, the open refuses.
 *
 * Directories: realpath is still performed (so symlinked dirs can't escape),
 * but readdir is used instead of open (not all platforms allow openSync on dirs).
 *
 * Callers must treat the returned `realPath` as canonical (used for visited
 * sets, error messages, etc.) — never re-resolve from the raw path after this.
 */
type SafeLoadResult =
  | { kind: 'file'; content: string; realPath: string }
  | { kind: 'dir'; entries: string[]; realPath: string }
  | { kind: 'escape'; realPath: string }
  | { kind: 'missing' }
  | { kind: 'error'; error: string };

function safeLoad(absPath: string, projectRootReal: string): SafeLoadResult {
  // 1. Canonicalize. This dereferences every symlink in the path.
  let realPath: string;
  try {
    realPath = realpathSync(absPath);
  } catch (e: any) {
    if (e && e.code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'error', error: String((e && e.message) || e) };
  }

  // 2. Bounds-check the CANONICAL path, not the raw one. This is what catches
  //    symlinks that point outside the project.
  const rel = relative(projectRootReal, realPath);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return { kind: 'escape', realPath };
  }

  // 3. Distinguish file vs. directory via stat on the realPath. Because
  //    realPath is symlink-free, lstat and stat are equivalent here. We also
  //    reject non-regular non-directory entries (FIFO, socket, device) up
  //    front — some of those (FIFO on Linux) would BLOCK openSync() in a
  //    readerless state, turning a supposed security check into a DoS.
  let preStat: ReturnType<typeof statSync>;
  try {
    preStat = statSync(realPath);
  } catch (e: any) {
    if (e && e.code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'error', error: String((e && e.message) || e) };
  }

  if (preStat.isDirectory()) {
    try {
      const entries = readdirSync(realPath).filter(f => extname(f) === '.nyx').sort();
      return { kind: 'dir', entries, realPath };
    } catch (e: any) {
      return { kind: 'error', error: String((e && e.message) || e) };
    }
  }

  if (!preStat.isFile()) {
    return { kind: 'error', error: 'not a regular file (FIFO, socket, device refused)' };
  }

  // 4. Open the canonical path ONCE. Flags used:
  //      O_RDONLY    — obviously.
  //      O_NOFOLLOW  — closes the tiny window where the leaf could be swapped
  //                    for a symlink between our realpath() and this open.
  //      O_NONBLOCK  — belt-and-braces: if between preStat and this open an
  //                    attacker swaps the regular file for a FIFO, O_NONBLOCK
  //                    prevents openSync() from hanging waiting for a writer.
  //                    fstat below will then reject it.
  //    Constants can be undefined on some platforms → fall back to 0.
  const O_NOFOLLOW = (fs.constants as any).O_NOFOLLOW ?? 0;
  const O_NONBLOCK = (fs.constants as any).O_NONBLOCK ?? 0;
  const flags = fs.constants.O_RDONLY | O_NOFOLLOW | O_NONBLOCK;
  let fd: number;
  try {
    fd = openSync(realPath, flags);
  } catch (e: any) {
    // ELOOP = attacker swapped in a symlink after our realpath() succeeded.
    if (e && (e.code === 'ELOOP' || e.code === 'EMLINK')) {
      return { kind: 'error', error: 'path changed to symlink between check and open (TOCTOU)' };
    }
    if (e && e.code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'error', error: String((e && e.message) || e) };
  }

  try {
    // 5. fstat on the SAME fd — reconfirms the inode is a regular file after
    //    open (catches a FIFO that was swapped in between preStat and open,
    //    which O_NONBLOCK let us survive instead of hanging).
    const st = fstatSync(fd);
    if (!st.isFile()) {
      return { kind: 'error', error: 'not a regular file after open (inode changed)' };
    }
    // Inode-match check: if the inode we stat'd up front differs from the one
    // we actually opened, something swapped under us. Bail.
    if (st.ino !== preStat.ino || st.dev !== preStat.dev) {
      return { kind: 'error', error: 'inode changed between check and open (TOCTOU)' };
    }
    // 6. readFileSync with an fd reads from the SAME inode we just statted.
    //    No second path lookup. This is the atomic leg.
    const content = readFileSync(fd, 'utf-8');
    return { kind: 'file', content, realPath };
  } finally {
    try { closeSync(fd); } catch { /* best-effort */ }
  }
}
import { parse } from './index.js';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Compiler } from './compiler.js';
import { Validator, ValidationError } from './validator.js';
import { Program, ComponentNode, UseStatement, TopLevelNode, PageNode, LayoutNode, ThemeNode, StoreNode } from './ast.js';
import { formatSourceFrame } from './suggest.js';

/**
 * Extract `line:col` from an error message body that conventionally ends with
 * `... at line N:C` (Parser Error convention). Returns null if not present.
 */
function extractLineCol(msg: string): { line: number; col: number } | null {
  const m = msg.match(/at line (\d+):(\d+)/);
  if (!m) return null;
  return { line: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

/**
 * Decorate a parse/compile error message with a source frame showing the
 * offending line and a caret at the column. Falls back to the plain
 * message if no line:col can be extracted.
 */
function decorateError(filePath: string, source: string, msg: string): string {
  const rel = relative(process.cwd(), filePath);
  const loc = extractLineCol(msg);
  if (!loc) return `[${rel}] ${msg}`;
  const frame = formatSourceFrame(source, loc.line, loc.col);
  if (!frame) return `[${rel}] ${msg}`;
  return `[${rel}:${loc.line}:${loc.col}] ${msg}\n${frame}`;
}

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
  // v0.24.1 (#92): realpath the project root up-front, so symlink-based
  // escapes are caught by a STRING compare against the canonical root.
  let projectRootReal: string;
  try {
    projectRootReal = realpathSync(projectRoot);
  } catch {
    projectRootReal = projectRoot;
  }
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
    // Security (string-based first pass): must be inside project root. Check
    // against BOTH projectRoot and projectRootReal because `fromFile` may have
    // been realpath'd by safeLoad (v0.24.1) and therefore live under
    // projectRootReal rather than projectRoot.
    const rel = relative(projectRoot, resolved);
    const relReal = relative(projectRootReal, resolved);
    const escapes = (rel.startsWith('..') || isAbsolute(rel)) &&
                    (relReal.startsWith('..') || isAbsolute(relReal));
    if (escapes) {
      errors.push(`[${relative(process.cwd(), fromFile)}] import path escapes project root: "${rawPath}"`);
      return null;
    }
    return resolved;
  }

  function loadFile(absPath: string, fromFile: string, rawPath: string): void {
    // Circular / already-visited (early check on pre-realpath path).
    if (visited.has(absPath)) return;

    // v0.24.1 (#92): atomic, TOCTOU-safe load. All downstream work uses the
    // canonical path from the same syscall sequence — no second resolve.
    const loaded = safeLoad(absPath, projectRootReal);

    if (loaded.kind === 'missing') {
      errors.push(`[${relative(process.cwd(), fromFile)}] import not found: "${rawPath}" (resolved: ${relative(projectRoot, absPath)})`);
      return;
    }
    if (loaded.kind === 'escape') {
      errors.push(`[${relative(process.cwd(), fromFile)}] import path escapes project root via symlink: "${rawPath}" (resolved: ${loaded.realPath})`);
      return;
    }
    if (loaded.kind === 'error') {
      errors.push(`[${relative(process.cwd(), fromFile)}] cannot read: "${rawPath}" (${loaded.error})`);
      return;
    }

    if (loaded.kind === 'dir') {
      // Record the realpath in visited so a symlink loop back to the same
      // directory can't re-enter.
      if (visited.has(loaded.realPath)) return;
      for (const entry of loaded.entries) {
        loadFile(join(loaded.realPath, entry), fromFile, join(rawPath, entry));
      }
      return;
    }

    // File import — use the canonical realPath for visited + sourceFiles so
    // the same file reached via two different symlink paths only loads once.
    if (visited.has(loaded.realPath)) return;
    visited.add(absPath);
    visited.add(loaded.realPath);
    sourceFiles.push(loaded.realPath);

    const src = loaded.content;
    const absReal = loaded.realPath;

    let imported: Program;
    try {
      imported = parse(src);
    } catch (e: any) {
      errors.push(decorateError(absPath, src, `parse error: ${e.message || e}`));
      return;
    }

    // Recurse into its imports first (depth-first, so dependencies are loaded before users).
    // IMPORTANT: resolve child paths relative to the REAL path of this file — if we used the
    // pre-realpath absPath, a nested symlink could sneak `../` escapes past our bounds check.
    for (const node of imported.body) {
      if (node.type === 'Use') {
        const subResolved = resolveImportPath((node as UseStatement).path, absReal);
        if (subResolved !== null) {
          loadFile(subResolved, absReal, (node as UseStatement).path);
        }
      }
      // v0.23.0 — also follow `@theme extends "./path.nyx"` as an implicit import
      // so users do not have to write a separate `use` line. Same security rules apply.
      if (node.type === 'Theme' && (node as any).extends) {
        const extPath = (node as any).extends;
        const subResolved = resolveImportPath(extPath, absReal);
        if (subResolved !== null) {
          loadFile(subResolved, absReal, extPath);
        }
      }
    }

    // Merge non-Use nodes into global body, checking for duplicates
    mergeNodes(imported.body, absReal);
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
  let projectRootReal: string;
  try { projectRootReal = realpathSync(projectRoot); } catch { projectRootReal = projectRoot; }
  const visited = new Set<string>();
  const errors: string[] = [];
  const orderedFiles: string[] = []; // post-order: deepest dependencies first
  // v0.24.1 (#92): cache file contents read during walk so the final flatten
  // pass doesn't do a second, un-audited readFileSync — that was yet another
  // TOCTOU gap. Key = realPath.
  const contentCache = new Map<string, string>();

  function resolveInternalPath(rawPath: string, fromFile: string): string | null {
    // v0.24.1 (#92): align with resolveAllImports — allowlist, not denylist.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(rawPath) || rawPath.startsWith('//')) return null;
    let abs: string;
    if (rawPath.startsWith('@/')) abs = resolve(projectRoot, rawPath.slice(2));
    else if (isAbsolute(rawPath)) abs = rawPath;
    else abs = resolve(dirname(fromFile), rawPath);
    const rel = relative(projectRoot, abs);
    const relReal = relative(projectRootReal, abs);
    if ((rel.startsWith('..') || isAbsolute(rel)) &&
        (relReal.startsWith('..') || isAbsolute(relReal))) return null;
    return abs;
  }

  function walk(absPath: string, fromFile: string, rawPath: string): void {
    if (visited.has(absPath)) return;

    // v0.24.1 (#92): TOCTOU-safe load — same helper as resolveAllImports.
    const loaded = safeLoad(absPath, projectRootReal);

    if (loaded.kind === 'missing') {
      errors.push(`[${relative(process.cwd(), fromFile)}] cannot resolve "${rawPath}"`);
      return;
    }
    if (loaded.kind === 'escape') {
      errors.push(`[${relative(process.cwd(), fromFile)}] import path escapes project root via symlink: "${rawPath}"`);
      return;
    }
    if (loaded.kind === 'error') {
      errors.push(`cannot read ${relative(process.cwd(), absPath)} (${loaded.error})`);
      return;
    }

    if (loaded.kind === 'dir') {
      if (visited.has(loaded.realPath)) return;
      for (const entry of loaded.entries) {
        walk(join(loaded.realPath, entry), fromFile, join(rawPath, entry));
      }
      return;
    }

    if (visited.has(loaded.realPath)) return;
    visited.add(absPath);
    visited.add(loaded.realPath);
    const src = loaded.content;
    const absReal = loaded.realPath;
    contentCache.set(absReal, src);

    // Recurse into this file's imports first (depth-first)
    let ast: Program;
    try {
      ast = parse(src);
    } catch (e: any) {
      errors.push(decorateError(absReal, src, `parse error: ${e.message || e}`));
      return;
    }
    for (const node of ast.body) {
      if (node.type === 'Use') {
        const sub = resolveInternalPath((node as UseStatement).path, absReal);
        if (sub !== null) walk(sub, absReal, (node as UseStatement).path);
      }
    }

    // Post-order: add AFTER dependencies — use realPath so the later
    // readFileSync in the flatten pass sees the same canonical file.
    orderedFiles.push(absReal);
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
    // Use the content we already verified and read atomically during walk().
    // Never re-open by path here — that would reintroduce the TOCTOU window.
    const src = contentCache.get(f);
    if (src === undefined) {
      errors.push(`internal error: no cached content for ${relative(process.cwd(), f)}`);
      continue;
    }
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

// Early handler: `nyx theme import --figma <file>` (v0.23.5, Issue #88)
// Dispatched before the generic `command + file` argument shape check below,
// because `theme` is a subcommand-style verb with its own argument layout.
if (command === 'theme' && args[1] === 'import') {
  const subArgs = args.slice(2);
  let figmaPath: string | null = null;
  let format: 'figma' | 'dtcg' = 'figma';
  let themeName: string | undefined;
  let outputPath: string | null = null;

  for (let i = 0; i < subArgs.length; i++) {
    const a = subArgs[i];
    if (a === '--figma' || a === '--dtcg') {
      format = a === '--dtcg' ? 'dtcg' : 'figma';
      figmaPath = subArgs[i + 1] ?? null;
      i++;
    } else if (a === '--name') {
      themeName = subArgs[i + 1];
      i++;
    } else if (a.startsWith('--name=')) {
      themeName = a.slice(7);
    } else if (a === '-o' || a === '--output') {
      outputPath = subArgs[i + 1] ?? null;
      i++;
    } else if (a.startsWith('-o=')) {
      outputPath = a.slice(3);
    } else if (a.startsWith('--output=')) {
      outputPath = a.slice(9);
    } else if (!a.startsWith('-') && !figmaPath) {
      // Positional token file (e.g. `nyx theme import tokens.json`)
      figmaPath = a;
    }
  }

  if (!figmaPath) {
    console.error(
      `Usage: nyx theme import <tokens.json> [--name <theme-name>] [-o <out.nyx>]\n` +
        `\n` +
        `  Reads a W3C DTCG / Tokens Studio JSON file and emits a NyxCode @theme block.\n` +
        `  Supported sections: colors, spacing, radius, fonts, shadows.\n` +
        `\n` +
        `Examples:\n` +
        `  nyx theme import tokens.json                    # print @theme block to stdout\n` +
        `  nyx theme import tokens.json -o theme.nyx       # write to file\n` +
        `  nyx theme import tokens.json --name brand       # theme as "brand" { ... }\n`,
    );
    process.exit(1);
  }

  const absTokens = resolve(figmaPath);
  let raw: string;
  try {
    raw = readFileSync(absTokens, 'utf-8');
  } catch (e: any) {
    console.error(`\x1b[31m❌ Cannot read token file: ${absTokens}\x1b[0m`);
    process.exit(1);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    console.error(
      `\x1b[31m❌ Invalid JSON in ${absTokens}: ${e.message}\x1b[0m`,
    );
    process.exit(1);
  }

  // Use dynamic import so the figma-import module stays tree-shakable for
  // users who only consume the core compiler programmatically.
  const { importFigmaTokens } = await import('./figma-import.js');
  const result = importFigmaTokens(json, { themeName });

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      console.error(`\x1b[33m⚠️  ${w}\x1b[0m`);
    }
  }

  if (!result.nyx) {
    console.error(
      `\x1b[31m❌ No tokens could be imported from ${figmaPath}.\x1b[0m`,
    );
    process.exit(1);
  }

  if (outputPath) {
    const absOut = resolve(outputPath);
    writeFileSync(absOut, result.nyx, 'utf-8');
    const totalTokens = Object.values(result.stats).reduce(
      (a: number, b: number) => a + b,
      0,
    );
    const parts = Object.entries(result.stats)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    console.log(`✅ Imported ${totalTokens} tokens (${parts}) → ${outputPath}`);
  } else {
    // stdout: the theme block, nothing else. Pipeable.
    process.stdout.write(result.nyx);
  }
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`v${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`);
  process.exit(0);
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
  nyx theme import <tokens.json>    Import Figma/DTCG tokens → @theme block

Examples:
  nyx parse examples/hello.nyx
  nyx build examples/hello.nyx
  nyx build examples/hello.nyx -o build/index.html    # single-file output
  nyx build examples/hello.nyx -o public/             # directory output
  nyx watch examples/landing.nyx
  nyx dev examples/docs.nyx
  nyx dev examples/landing.nyx --port=8080
  nyx theme import figma-tokens.json -o theme.nyx

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
