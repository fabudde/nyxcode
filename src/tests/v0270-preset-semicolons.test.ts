import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('#123 — Preset shorthand properties compiled to CSS', () => {
  it('should compile all shorthands in single-line preset', () => {
    const { html } = compile(`preset btn { bg #00e5a0; c #0a0a0f; py 0.75rem; px 2rem; r 10px; fw 700; td none; d inline-block }
page / { a "Click" href="/" preset=btn }`);
    assert.ok(html.includes('background: #00e5a0'), 'bg → background');
    assert.ok(html.includes('color: #0a0a0f'), 'c → color');
    assert.ok(html.includes('padding-block: 0.75rem'), 'py → padding-block');
    assert.ok(html.includes('padding-inline: 2rem'), 'px → padding-inline');
    assert.ok(html.includes('border-radius: 10px'), 'r → border-radius');
    assert.ok(html.includes('font-weight: 700'), 'fw → font-weight');
    assert.ok(html.includes('text-decoration: none'), 'td → text-decoration');
    assert.ok(html.includes('display: inline-block'), 'd → display');
  });

  it('should handle multi-line preset blocks', () => {
    const { html } = compile(`preset card {\n  bg #12121a\n  r 12px\n  p 2rem\n  border 1px solid #1a1a28\n}\npage / { div preset=card { p "Hello" } }`);
    assert.ok(html.includes('background: #12121a'), 'multi-line bg');
    assert.ok(html.includes('border-radius: 12px'), 'multi-line r');
    assert.ok(html.includes('padding: 2rem'), 'multi-line p');
    assert.ok(html.includes('border: 1px solid #1a1a28'), 'multi-line border');
  });

  it('should handle preset with theme color references', () => {
    const { html } = compile(`theme { colors { primary #ff0000 } }\npreset hl { bg color.primary; c white }\npage / { span "Hi" preset=hl }`);
    assert.ok(html.includes('background: var(--colors-primary)'), 'theme ref');
    assert.ok(html.includes('color: white'), 'plain color');
  });
});

describe('#124 — Consecutive -webkit-* properties', () => {
  it('should parse separate -webkit-* props on different lines', () => {
    const { html } = compile(`page / {\n  h1 "Hello" {\n    style {\n      -webkit-background-clip text\n      -webkit-text-fill-color transparent\n    }\n  }\n}`);
    assert.ok(html.includes('-webkit-background-clip: text'), 'separate clip');
    assert.ok(html.includes('-webkit-text-fill-color: transparent'), 'separate fill');
    assert.ok(!html.includes('text-webkit'), 'no merge');
  });

  it('should handle full gradient text pattern', () => {
    const { html } = compile(`page / {\n  h1 "Hello" {\n    style {\n      bg linear-gradient(135deg, #fff, #0f0)\n      -webkit-background-clip text\n      -webkit-text-fill-color transparent\n    }\n  }\n}`);
    assert.ok(html.includes('background: linear-gradient(135deg, #fff, #0f0)'), 'gradient bg');
    assert.ok(html.includes('-webkit-background-clip: text'), 'clip separate');
    assert.ok(html.includes('-webkit-text-fill-color: transparent'), 'fill separate');
  });

  it('should still handle negative values', () => {
    const { html } = compile(`page / {\n  div {\n    style {\n      mt -2rem\n      ml -1px\n    }\n  }\n}`);
    assert.ok(html.includes('margin-top: -2rem'), 'neg margin-top');
    assert.ok(html.includes('margin-left: -1px'), 'neg margin-left');
  });
});
