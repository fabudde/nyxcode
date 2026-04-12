#!/usr/bin/env node
/**
 * NyxCode CLI
 * 
 * Usage:
 *   nyx parse <file.nyx>    — Parse a .nyx file and output the AST as JSON
 *   nyx tokens <file.nyx>   — Tokenize a .nyx file and output tokens
 * 
 * Examples:
 *   nyx parse examples/hello.nyx
 *   nyx tokens examples/todo.nyx
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { parse } from './index.js';
import { Lexer } from './lexer.js';
import { Compiler } from './compiler.js';
import { Validator, ValidationError } from './validator.js';
import { Program, ComponentNode } from './ast.js';

const [,, command, file] = process.argv;

if (!command || !file) {
  console.log(`
🦞 NyxCode v0.1.0

Usage:
  nyx parse <file.nyx>     Parse file → AST (JSON)
  nyx tokens <file.nyx>    Tokenize file → Token list
  nyx build <file.nyx>     Compile file → HTML output

Examples:
  nyx parse examples/hello.nyx
  nyx build examples/hello.nyx
`);
  process.exit(0);
}

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
  } else {
    console.error(`❌ Unknown command: ${command}. Use 'parse', 'tokens', or 'build'.`);
    process.exit(1);
  }
} catch (e: any) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
