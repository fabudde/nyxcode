import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

/**
 * v0.24.3 — Bug #102
 *
 * Theme token values containing CSS function calls like `rgba(...)`,
 * `hsla(...)`, or `linear-gradient(...)` were whitespace-expanded by the
 * parser's join step. The output became `rgba ( 20 , 20 , 37 , 0.6 )` —
 * which browsers silently ignore because `rgba` followed by a space is
 * treated as an unknown identifier, not a function call.
 *
 * Fix: inside balanced parens we still join tokens with single spaces, but
 * we post-process to remove spaces around `(` / `)` and normalize `, ` so
 * the emitted CSS var value matches what the user typed.
 */

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const out = new Compiler().compile(ast);
  return out.html + '\n' + out.css;
}

describe('v0.24.3 — #102: CSS function values in theme tokens', () => {
  test('rgba() is preserved exactly in --colors-* CSS var', () => {
    const src = `
theme { colors { surface: rgba(20, 20, 37, 0.6) } }
page / { div "x" { style { bg var(--colors-surface) } } }
`;
    const html = compile(src);
    assert.match(html, /--colors-surface:\s*rgba\(20, 20, 37, 0\.6\)/);
    // Must NOT contain the broken whitespace-expanded form.
    assert.ok(
      !/rgba\s+\(/.test(html),
      'rgba( must not have a space between name and open paren',
    );
    assert.ok(
      !/--colors-surface:[^;]*,\s{2,}/.test(html),
      'must not have double spaces between commas',
    );
  });

  test('hsla() is preserved exactly', () => {
    const src = `
theme { colors { overlay: hsla(240, 10%, 15%, 0.6) } }
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(html, /--colors-overlay:\s*hsla\(240, 10%, 15%, 0\.6\)/);
    assert.ok(!/hsla\s+\(/.test(html));
  });

  test('linear-gradient() with hex colors is preserved', () => {
    const src = `
theme { colors { grad: linear-gradient(135deg, #e879a8, #a855f7) } }
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(
      html,
      /--colors-grad:\s*linear-gradient\(135deg, #e879a8, #a855f7\)/,
    );
    assert.ok(!/linear-gradient\s+\(/.test(html));
  });

  test('simple hex values still work (regression guard)', () => {
    const src = `
theme { colors { bg: #0a0a12 } }
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(html, /--colors-bg:\s*#0a0a12/);
  });

  test('multiple rgba tokens in one theme block are all preserved', () => {
    const src = `
theme {
  colors {
    surface: rgba(20, 20, 37, 0.6)
    border: rgba(255, 255, 255, 0.1)
    muted: rgba(200, 200, 200, 0.5)
  }
}
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(html, /--colors-surface:\s*rgba\(20, 20, 37, 0\.6\)/);
    assert.match(html, /--colors-border:\s*rgba\(255, 255, 255, 0\.1\)/);
    assert.match(html, /--colors-muted:\s*rgba\(200, 200, 200, 0\.5\)/);
    // Sanity: no whitespace-before-paren anywhere.
    assert.ok(!/rgba\s+\(/.test(html));
  });

  test('composite value mixing hex + rgba (e.g. border shorthand) is clean', () => {
    const src = `
theme {
  colors { accent: #ff6b00 }
  borders { glow: 1px solid rgba(255, 107, 0, 0.4) }
}
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(
      html,
      /--borders-glow:\s*1px solid rgba\(255, 107, 0, 0\.4\)/,
    );
  });
});
