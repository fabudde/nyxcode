import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Compiler } from '../compiler.js';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';

function compileMulti(src: string) {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens, src).parse();
  const c = new Compiler();
  return c.compileMultiFile(ast);
}

describe('#125 — Preset CSS in multi-page builds', () => {
  it('emits preset CSS on all pages (no layout)', () => {
    const results = compileMulti(`
      preset card { bg #121212; p 2rem; r 12px }
      page / { div preset=card { p "Home" } }
      page /test { div preset=card { p "Test" } }
    `);
    for (const r of results) {
      assert.ok(r.html.includes('.nyx-p_card'), `${r.path}: missing preset CSS`);
      assert.ok(r.html.includes('nyx-p_card'), `${r.path}: missing preset class on element`);
    }
  });

  it('emits preset CSS on all pages (with layout)', () => {
    const results = compileMulti(`
      preset card { bg #121212; p 2rem; r 12px }
      layout {
        nav { a "Home" href="/" }
        slot
        footer { p "Footer" }
      }
      page / { div preset=card { p "Home" } }
      page /about { div preset=card { p "About" } }
    `);
    for (const r of results) {
      assert.ok(r.html.includes('.nyx-p_card'), `${r.path}: missing preset CSS`);
      assert.ok(r.html.includes('<nav'), `${r.path}: missing layout nav`);
      assert.ok(r.html.includes('<footer'), `${r.path}: missing layout footer`);
    }
  });

  it('applies layout to all pages when page / uses head injection', () => {
    const results = compileMulti(`
      preset card { bg #121212; p 2rem }
      layout {
        nav { a "Home" href="/" }
        slot
      }
      page / {
        head "<style>.custom{color:red}</style>"
        div { p "Home" }
      }
      page /other { div preset=card { p "Other" } }
    `);
    const other = results.find(r => r.path === '/other');
    assert.ok(other, '/other page exists');
    assert.ok(other!.html.includes('<nav'), '/other: missing layout nav');
    assert.ok(other!.html.includes('.nyx-p_card'), '/other: missing preset CSS');
  });
});
