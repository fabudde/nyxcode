import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const out = new Compiler().compile(ast);
  return out.html;
}

// Read package.json for expected version
const pkgPath = join(__dirname, '..', '..', 'package.json');
let expectedVersion = '0.0.0';
try {
  expectedVersion = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
} catch {}

describe('v0.24.3: #108 __version__ template replacement', () => {

  test('__version__ in quoted string content', () => {
    const html = compile(`page / { p "Built with NyxCode v__version__" }`);
    assert.ok(html.includes(`Built with NyxCode v${expectedVersion}`), `Expected version ${expectedVersion} in: ${html}`);
    assert.ok(!html.includes('__version__'));
  });

  test('${__version__} syntax still works', () => {
    const html = compile(`page / { p "Version: \${__version__}" }`);
    assert.ok(html.includes(`Version: ${expectedVersion}`));
  });

  test('__version__ in span text', () => {
    const html = compile(`page / { span "v__version__" }`);
    assert.ok(html.includes(`v${expectedVersion}`));
    assert.ok(!html.includes('__version__'));
  });

  test('__version__ in badge with other text', () => {
    const html = compile(`page / { span "NyxCode __version__ release" }`);
    assert.ok(html.includes(`NyxCode ${expectedVersion} release`));
  });

});
