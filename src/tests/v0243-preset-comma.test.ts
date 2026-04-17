import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// Bug #105 regression: commas in property values inside presets caused
// `Expected RightBrace, got Comma`. Commas are valid in CSS values
// (font-family stacks, multiple box-shadows, gradient stops, etc.) and
// must be preserved as part of the property value.

function compile(src: string): { html: string; css: string } {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.html };
}

describe('v0.24.3: Bug #105 — commas in preset property values', () => {
  test('font-family with quoted name + identifier fallback', () => {
    const { html } = compile(`
preset mono {
  font-family "JetBrains Mono", monospace
}
page / { p "x" $mono }
`);
    // The preset CSS class carries the full font stack, commas preserved.
    assert.match(html, /\.nyx-p_mono\s*\{[^}]*font-family:\s*"JetBrains Mono",\s*monospace[^}]*\}/);
  });

  test('font-family with multiple quoted fallbacks', () => {
    const { html } = compile(`
preset typo {
  font-family "Inter", "Helvetica Neue", sans-serif
}
page / { p "x" $typo }
`);
    assert.match(html, /\.nyx-p_typo\s*\{[^}]*font-family:\s*"Inter",\s*"Helvetica Neue",\s*sans-serif[^}]*\}/);
  });

  test('multiple box-shadows separated by commas', () => {
    const { html } = compile(`
preset card {
  shadow 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05)
}
page / { p "x" $card }
`);
    // Both shadow layers must be present in the output.
    assert.match(html, /\.nyx-p_card\s*\{[^}]*box-shadow:[^}]*rgba\(0,\s*0,\s*0,\s*0\.1\)[^}]*rgba\(0,\s*0,\s*0,\s*0\.05\)[^}]*\}/);
  });

  test('linear-gradient with comma-separated color stops', () => {
    const { html } = compile(`
preset hero {
  bg linear-gradient(135deg, #e879a8, #a855f7)
}
page / { p "x" $hero }
`);
    assert.match(html, /\.nyx-p_hero\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#e879a8,\s*#a855f7\)[^}]*\}/);
  });

  test('simple preset values without commas still work', () => {
    const { html } = compile(`
preset simple {
  color #333
  padding 16
}
page / { p "x" $simple }
`);
    assert.match(html, /\.nyx-p_simple\s*\{[^}]*color:\s*#333[^}]*\}/);
    assert.match(html, /\.nyx-p_simple\s*\{[^}]*padding:\s*16[^}]*\}/);
  });

  test('multiple properties in a preset (with and without commas) coexist', () => {
    const { html } = compile(`
preset combo {
  font-family "Inter", sans-serif
  color #333
  shadow 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05)
  padding 12
}
page / { p "x" $combo }
`);
    const m = html.match(/\.nyx-p_combo\s*\{([^}]*)\}/);
    assert.ok(m, 'expected a .nyx-p_combo rule');
    const body = m![1];
    assert.match(body, /font-family:\s*"Inter",\s*sans-serif/);
    assert.match(body, /color:\s*#333/);
    assert.match(body, /box-shadow:[^;]*rgba\(0,\s*0,\s*0,\s*0\.1\)[^;]*rgba\(0,\s*0,\s*0,\s*0\.05\)/);
    assert.match(body, /padding:\s*12/);
  });

  test('preset with only identifier-based font stack (no quoted names)', () => {
    const { html } = compile(`
preset ident {
  font-family Georgia, serif
}
page / { p "x" $ident }
`);
    assert.match(html, /\.nyx-p_ident\s*\{[^}]*font-family:\s*Georgia,\s*serif[^}]*\}/);
  });
});
