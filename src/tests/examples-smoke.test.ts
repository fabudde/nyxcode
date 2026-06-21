/**
 * Smoke test: every shipped example and stdlib component must compile.
 *
 * The examples/ and stdlib/ directories are the language's own showcase — if any
 * of them stops compiling, that's a user-visible regression. This walks both trees
 * and compiles each `.nyx` file end-to-end (lex → parse → compile).
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';
import { Parser } from '../parser.js';
import { Lexer } from '../lexer.js';
import { Compiler } from '../compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// Files that are *intentionally* invalid (negative fixtures for the validator).
const EXPECTED_INVALID = new Set(['examples/validator-test.nyx']);

function collect(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(p));
    else if (e.name.endsWith('.nyx')) out.push(p);
  }
  return out;
}

function compileSource(src: string): void {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  new Compiler().compile(ast);
}

describe('smoke: shipped examples & stdlib compile', () => {
  const files = [
    ...collect(resolve(REPO_ROOT, 'examples')),
    ...collect(resolve(REPO_ROOT, 'stdlib')),
  ];

  it('finds .nyx files to test', () => {
    assert.ok(files.length > 10, `expected many example files, found ${files.length}`);
  });

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (EXPECTED_INVALID.has(rel)) {
      it(`${rel} fails validation as expected`, () => {
        assert.throws(() => compileSource(readFileSync(file, 'utf8')));
      });
    } else {
      it(`${rel} compiles`, () => {
        assert.doesNotThrow(() => compileSource(readFileSync(file, 'utf8')));
      });
    }
  }
});
