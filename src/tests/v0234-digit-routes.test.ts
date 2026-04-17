import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.23.4 — Bug #94: routes starting with a digit (e.g. `/650-hex-values/`)
// failed to lex as a single path token. The lexer's canStartPath() required
// the char after `/` to be alpha, so digit-starting segments split into
// Slash + Number + Identifier tokens, confusing the parser.
//
// Fix: when the previous emitted token is a path-introducing keyword
// (page, api, layout), accept any valid path character — including digits.

function tokens(src: string) {
  return new Lexer(src).tokenize();
}

function compile(src: string): string {
  const ast = new Parser(tokens(src)).parse();
  return new Compiler().compile(ast).html;
}

describe('v0.23.4: digit-starting route segments (#94)', () => {
  test('page /650-hex-values/ lexes as a single Identifier', () => {
    const toks = tokens('page /650-hex-values/ { p "hi" }');
    // page, /path/, {, p, "hi", }, EOF
    assert.equal(toks[0].type, 'Page');
    assert.equal(toks[1].type, 'Identifier');
    assert.equal(toks[1].value, '/650-hex-values/');
    assert.equal(toks[2].type, 'LeftBrace');
  });

  test('page /650-hex-values/ compiles to a valid page', () => {
    const html = compile('page /650-hex-values/ { p "hello" }');
    assert.match(html, /<p>hello<\/p>/);
  });

  test('api GET /v2/users/42/profile lexes as a single path', () => {
    const toks = tokens('api GET /v2/users/42/profile { respond "ok" }');
    const pathTok = toks.find((t) => t.value === '/v2/users/42/profile');
    assert.ok(pathTok, 'numeric path segment is preserved as one token');
    assert.equal(pathTok!.type, 'Identifier');
  });

  test('page /blog/2026/04/post — all-numeric segments in the middle', () => {
    const toks = tokens('page /blog/2026/04/post { p "x" }');
    const pathTok = toks.find((t) => t.value === '/blog/2026/04/post');
    assert.ok(pathTok, 'nested numeric segments preserved');
  });

  test('non-route slash context still tokenizes as Slash', () => {
    // `1 / 2` outside of a path-keyword context — the / should be a
    // plain Slash, not open a path lex.
    const toks = tokens('state { ratio: 1 / 2 }');
    const slashes = toks.filter((t) => t.type === 'Slash');
    assert.ok(
      slashes.length >= 1,
      'bare `/` in state context lexes as Slash, not path',
    );
  });

  test('calc() arithmetic inside string attr stays intact', () => {
    // Regression: the fix must not affect `/` inside CSS string contexts.
    const html = compile('page /home { p "x" style="width:calc(100% / 2)" }');
    assert.match(html, /width:calc\(100% \/ 2\)/);
  });

  test('dash + digit combinations work: /v1-beta/', () => {
    // Alpha-starting path with digits later — already worked, but verify
    // the fix didn't regress it.
    const toks = tokens('page /v1-beta/ { p "x" }');
    const pathTok = toks.find((t) => t.value === '/v1-beta/');
    assert.ok(pathTok);
  });

  test('purely numeric segment: /1/', () => {
    const toks = tokens('page /1/ { p "x" }');
    const pathTok = toks.find((t) => t.value === '/1/');
    assert.ok(pathTok, 'single-digit segment works');
  });
});
