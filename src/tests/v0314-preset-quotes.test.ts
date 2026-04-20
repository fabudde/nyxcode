import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

function compile(src: string): { html: string; css: string } {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('#147 — Quoted CSS values in presets strip quotes in output', () => {
  it('strips quotes from multi-word padding value', () => {
    const src = `
theme { colors { primary #3b82f6 } }
preset btn { bg color.primary, c white, p "0.8rem 1.5rem", r 8px, border none, fw bold }
page "/" { button "Click" preset=btn }
`;
    const result = compile(src);
    const css = result.css ?? '';
    // padding should NOT have quotes
    assert.ok(css.includes('padding: 0.8rem 1.5rem'), `Expected unquoted padding, got CSS:\n${css}`);
    assert.ok(!css.includes('padding: "0.8rem 1.5rem"'), 'Quoted padding should be stripped');
  });

  it('strips quotes from multi-word border value', () => {
    const src = `
theme { colors { primary #3b82f6 } }
preset input-field { w 100%, bg #111, c white, border "1px solid #333", p 1rem, r 8px }
page "/" { input "Name" preset=input-field }
`;
    const result = compile(src);
    const css = result.css ?? '';
    assert.ok(css.includes('border: 1px solid #333'), `Expected unquoted border, got CSS:\n${css}`);
    assert.ok(!css.includes('border: "1px solid #333"'), 'Quoted border should be stripped');
  });

  it('strips quotes from multi-word margin value', () => {
    const src = `
preset spaced { m "2rem auto", p "1rem 2rem 3rem" }
page "/" { div "Hello" preset=spaced }
`;
    const result = compile(src);
    const css = result.css ?? '';
    assert.ok(css.includes('margin: 2rem auto'), `Expected unquoted margin, got CSS:\n${css}`);
    assert.ok(css.includes('padding: 1rem 2rem 3rem'), `Expected unquoted padding, got CSS:\n${css}`);
  });

  it('preserves unquoted single-word values', () => {
    const src = `
preset simple { bg red, c white, fw bold }
page "/" { span "Test" preset=simple }
`;
    const result = compile(src);
    const css = result.css ?? '';
    assert.ok(css.includes('background: red'), `Expected 'background: red' in CSS:\n${css}`);
    assert.ok(css.includes('color: white'), `Expected 'color: white' in CSS:\n${css}`);
  });

  it('works in style blocks too (not just presets)', () => {
    const src = `
page "/" {
  div "Test" style={ p "1rem 2rem", m "0 auto" }
}
`;
    const result = compile(src);
    const html = result.html ?? '';
    // Inline styles or scoped CSS should have unquoted values
    assert.ok(!html.includes('padding: "1rem 2rem"'), 'Inline style should not have quoted padding');
    assert.ok(!html.includes('margin: "0 auto"'), 'Inline style should not have quoted margin');
  });
});
