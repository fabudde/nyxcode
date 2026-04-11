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
    const compiler = new Compiler({ pretty: true });
    const output = compiler.compile(ast);
    
    // Write to dist/ or stdout
    const outDir = resolve('dist-site');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'index.html'), output.html);
    console.log(`✅ Built: ${outDir}/index.html`);
    console.log(`   HTML: ${output.html.length} bytes`);
    if (output.css) console.log(`   CSS:  ${output.css.length} bytes`);
    if (output.js) console.log(`   JS:   ${output.js.length} bytes`);
  } else {
    console.error(`❌ Unknown command: ${command}. Use 'parse', 'tokens', or 'build'.`);
    process.exit(1);
  }
} catch (e: any) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
