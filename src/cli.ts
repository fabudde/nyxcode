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

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from './index.js';
import { Lexer } from './lexer.js';

const [,, command, file] = process.argv;

if (!command || !file) {
  console.log(`
🦞 NyxCode v0.1.0

Usage:
  nyx parse <file.nyx>    Parse file → AST (JSON)
  nyx tokens <file.nyx>   Tokenize file → Token list

Examples:
  nyx parse examples/hello.nyx
  nyx tokens examples/hello.nyx
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
  } else {
    console.error(`❌ Unknown command: ${command}. Use 'parse' or 'tokens'.`);
    process.exit(1);
  }
} catch (e: any) {
  console.error(`\n${e.message}\n`);
  process.exit(1);
}
