import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.24.3 — Issue #104: Multi-line style blocks merge adjacent properties
//
// When a style block has properties on separate lines and the previous
// property's value contains parentheses (rgba(), linear-gradient(), blur(), ...),
// the parser was merging the next property's name and value into the previous
// value. Example:
//
//   style {
//     bg rgba(10, 10, 18, 0.7)
//     bdf blur(20px)
//   }
//
// Compiled to: `background: rgba(10, 10, 18, 0.7) bdf blur(20px);`
//
// Expected:    `background: rgba(10, 10, 18, 0.7); backdrop-filter: blur(20px);`
//
// Root cause: at paren depth 0 the parser only broke on known CSS property
// identifiers. Shorthands not in CSS_PROPERTIES (`bdf`, `bf`) and vendor
// prefixes like `-webkit-background-clip` slipped through and were glued onto
// the previous value.
//
// Fix: in `parseStyleProperty`, when paren depth is zero and we've already
// accumulated value content, a new-line boundary between the last consumed
// token and the next identifier closes the current property. One property
// per line is the NyxCode convention — enforce it at the parser level.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

// Pull the first `nyx-s_*` class from whichever element we styled.
function scopeClass(html: string): string | null {
  const m = html.match(/class="([^"]*nyx-s_\d+[^"]*)"/);
  if (!m) return null;
  return m[1].split(/\s+/).find(c => /^nyx-s_\d+$/.test(c)) ?? null;
}

function cssRule(css: string, cls: string): string | null {
  const re = new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('v0.24.3: #104 multi-line property boundaries with function values', () => {
  test('Case 1: bg rgba(...) \\n bdf blur(...) → two separate properties', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            bg rgba(10, 10, 18, 0.7)
            bdf blur(20px)
          }
        }
      }
    `);
    const cls = scopeClass(html);
    assert.ok(cls, 'div should carry a nyx-s_* class');
    const rule = cssRule(css, cls!);
    assert.ok(rule, `CSS rule for .${cls} should exist`);

    assert.match(rule!, /background:\s*rgba\(10,\s*10,\s*18,\s*0\.7\);/,
      'background should be its own declaration, terminated by semicolon');
    assert.match(rule!, /backdrop-filter:\s*blur\(20px\);/,
      'backdrop-filter should be parsed as its own property');
    assert.doesNotMatch(rule!, /bdf/,
      'the shorthand token bdf must not leak into the emitted CSS');
    assert.doesNotMatch(rule!, /rgba\([^)]*\)\s+bdf/,
      'bdf must not be merged into the background value');
  });

  test('Case 2: bg linear-gradient(...) \\n -webkit-background-clip text → two properties', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            bg linear-gradient(to right, red, blue)
            -webkit-background-clip text
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;

    assert.match(rule, /background:\s*linear-gradient\([^)]+\);/,
      'background with linear-gradient should terminate before the next line');
    assert.match(rule, /-webkit-background-clip:\s*text/,
      'vendor-prefixed property on next line must become its own declaration');
    assert.doesNotMatch(rule, /linear-gradient\([^)]*\)\s+-webkit/,
      'vendor-prefixed identifier must not be glued onto the background value');
  });

  test('Case 3: simple values on separate lines (bg #fff \\n c #000) still work', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            bg #fff
            c #000
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;

    assert.match(rule, /background:\s*#fff/);
    assert.match(rule, /color:\s*#000/);
  });

  test('Case 4: bg rgba(...) \\n p 2rem → two properties (non-function next value)', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            bg rgba(10, 20, 30, 0.5)
            p 2rem
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;

    assert.match(rule, /background:\s*rgba\(10,\s*20,\s*30,\s*0\.5\);/);
    assert.match(rule, /padding:\s*2rem/);
    assert.doesNotMatch(rule, /rgba\([^)]*\)\s+p\s+2rem/);
  });

  test('Case 5: shadow 0 10px 30px rgba(...) \\n r 12px → two properties', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            shadow 0 10px 30px rgba(0, 0, 0, 0.3)
            r 12px
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;

    assert.match(rule, /box-shadow:\s*0\s+10px\s+30px\s+rgba\(0,\s*0,\s*0,\s*0\.3\);/,
      'box-shadow should be a complete value ending at the newline');
    assert.match(rule, /border-radius:\s*12px/,
      'r should become border-radius on its own line');
    assert.doesNotMatch(rule, /rgba\([^)]*\)\s+r\s+12px/,
      'r must not be appended to the box-shadow value');
  });

  test('regression: comma-separated values on one line still parse as one value', () => {
    // font-family uses commas as value separators; make sure the newline
    // heuristic does not break values that legitimately span nothing.
    // (Using the full `font-family` spelling because `ff` shorthand is not in
    // COMMA_VALUE_PROPERTIES — that's a separate bug out of scope for #104.)
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            font-family Inter, system-ui, sans-serif
            font-size 1rem
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.match(rule, /font-family:\s*Inter,\s*system-ui,\s*sans-serif/);
    assert.match(rule, /font-size:\s*1rem/);
  });

  test('regression: multi-value on one line without function call still works', () => {
    // `border 1px solid #ccc` is three tokens — make sure our newline check
    // doesn't prematurely cut it off.
    const { html, css } = compile(`
      page /test/ {
        div {
          style {
            border 1px solid #ccc
            p 1rem
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.match(rule, /border:\s*1px\s+solid\s+#ccc/);
    assert.match(rule, /padding:\s*1rem/);
  });

  test('regression: single-line style block with multiple function values', () => {
    // Commas still separate properties for non-comma-value props — the
    // newline fix must not affect the one-line comma-separator path.
    const { html, css } = compile(`
      page /test/ {
        div {
          style { bg rgba(10, 10, 18, 0.7), bdf blur(20px) }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.match(rule, /background:\s*rgba\(10,\s*10,\s*18,\s*0\.7\)/);
    assert.match(rule, /backdrop-filter:\s*blur\(20px\)/);
  });
});
