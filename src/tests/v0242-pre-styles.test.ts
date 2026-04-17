import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.24.2 — Issue #100: `<pre>` style rules dropped (Kiro QA)
//
// Kiro reported that `<pre>` elements with inline `style { ... }` blocks
// received a CSS class in the HTML but no corresponding rule in the stylesheet.
// Investigation showed `<pre>` is NOT treated specially in the compiler;
// the actual root cause is two unmapped shorthands:
//
//   1. `of-x auto` — `of-x` wasn't in the shorthand table, so it emitted
//       `of-x: auto;` (invalid CSS → browser drops it → looks like no overflow)
//   2. `br 6px`    — `br` used to map to `border-right`, but every utility
//       framework maps `br` to `border-radius`. Users writing `br 6px` expect
//       rounded corners, not a right-side border.
//
// From the outside, both bugs presented as "styles dropped from <pre>".
// Fix: map both shorthands to their expected CSS properties. `<pre>` compiles
// like any other tag (verified by a regression test below).

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

// Extract the first `<pre class="...">` scope class from the emitted HTML.
function preClass(html: string): string | null {
  const m = html.match(/<pre[^>]*class="([^"]+)"/);
  if (!m) return null;
  // Element may carry multiple classes (preset + scope) — return the nyx-s_* one.
  return m[1].split(/\s+/).find(c => /^nyx-s_\d+$/.test(c)) ?? null;
}

// Grab the CSS rule block (between `.class {` and the matching `}`) from `css`.
function cssRule(css: string, cls: string): string | null {
  const re = new RegExp('\\.' + cls.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('v0.24.2: <pre> inline styles — Issue #100', () => {
  test('pre with style{} gets both a class AND a matching CSS rule', () => {
    const { html, css } = compile(`
      page /test/ {
        pre "some code" {
          style { bg #f5f0eb, p 1.5rem, of-x auto, br 6px, ff monospace }
        }
      }
    `);
    const cls = preClass(html);
    assert.ok(cls, 'pre should carry a nyx-s_* class');
    const rule = cssRule(css, cls!);
    assert.ok(rule, `CSS rule for .${cls} should exist in stylesheet`);
  });

  test('all five shorthands from the Kiro repro land correctly in CSS', () => {
    const { html, css } = compile(`
      page /test/ {
        pre "some code" {
          style { bg #f5f0eb, p 1.5rem, of-x auto, br 6px, ff monospace }
        }
      }
    `);
    const cls = preClass(html)!;
    const rule = cssRule(css, cls)!;

    assert.match(rule, /background:\s*#f5f0eb/, 'bg → background');
    assert.match(rule, /padding:\s*1\.5rem/, 'p → padding');
    assert.match(rule, /overflow-x:\s*auto/, 'of-x → overflow-x (was dropped before fix)');
    assert.match(rule, /border-radius:\s*6px/, 'br → border-radius (was border-right before fix)');
    assert.match(rule, /font-family:\s*monospace/, 'ff → font-family');

    // Negative assertions: the old, broken output must NOT appear.
    assert.doesNotMatch(rule, /of-x:\s*auto/, 'of-x must be mapped, not passed through');
    assert.doesNotMatch(rule, /border-right:\s*6px/, 'br must be border-radius, not border-right');
  });

  test('pre without style{} emits no empty .nyx-s_* rule', () => {
    const { html, css } = compile(`
      page /test/ {
        pre "plain code"
      }
    `);
    // No scope class on pre
    assert.doesNotMatch(html, /<pre[^>]*class="nyx-s_/);
    // And no stray empty rule hanging around
    assert.doesNotMatch(css, /\.nyx-s_\d+\s*\{\s*\}/);
  });

  test('regression: <div> with the same shorthand block still works', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style { bg #eee, p 1rem, of-x scroll, br 8px, ff sans-serif }
        }
      }
    `);
    const m = html.match(/<div[^>]*class="(nyx-s_\d+)"/);
    assert.ok(m, 'div should carry a nyx-s_* class');
    const rule = cssRule(css, m![1])!;
    assert.match(rule, /background:\s*#eee/);
    assert.match(rule, /padding:\s*1rem/);
    assert.match(rule, /overflow-x:\s*scroll/);
    assert.match(rule, /border-radius:\s*8px/);
    assert.match(rule, /font-family:\s*sans-serif/);
  });

  test('of-y also maps to overflow-y (symmetric with of-x)', () => {
    const { html, css } = compile(`
      page /test/ {
        section {
          style { of-y hidden }
        }
      }
    `);
    const m = html.match(/<section[^>]*class="(nyx-s_\d+)"/)!;
    const rule = cssRule(css, m[1])!;
    assert.match(rule, /overflow-y:\s*hidden/);
    assert.doesNotMatch(rule, /of-y:/);
  });

  test('brad is a long-form alias for border-radius (covers discoverability)', () => {
    const { html, css } = compile(`
      page /test/ {
        div {
          style { brad 12px }
        }
      }
    `);
    const m = html.match(/<div[^>]*class="(nyx-s_\d+)"/)!;
    const rule = cssRule(css, m[1])!;
    assert.match(rule, /border-radius:\s*12px/);
  });

  test('real-world repro from mindsmatter.now Sister Sites essay compiles with full styling', () => {
    // This mirrors the actual source that was broken in the live build.
    const { html, css } = compile(`
      theme { colors { warm: #f5f0eb, text: #1a1a1a } }
      layout { main { slot } }
      page /essays/sister-sites/ {
        article {
          h1 "Sister Sites"
          pre "# base.nyx — 35 lines of geometry and typography" {
            style { bg warm, p 1.5rem, of-x auto, br 6px, mb 1.5rem, ff monospace, ws pre }
          }
        }
      }
    `);
    const cls = preClass(html);
    assert.ok(cls, 'live-repro pre should still get a class');
    const rule = cssRule(css, cls!)!;
    assert.match(rule, /overflow-x:\s*auto/);
    assert.match(rule, /border-radius:\s*6px/);
    assert.match(rule, /padding:\s*1\.5rem/);
    assert.match(rule, /margin-bottom:\s*1\.5rem/);
    assert.match(rule, /white-space:\s*pre/);
  });
});
