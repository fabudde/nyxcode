import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.2 — Issue #113: auto-prefix mask-* properties with -webkit-
//
// Safari 17.2 (Jan 2024) shipped unprefixed mask-*, but older Safari, iOS WebViews,
// and in-app browsers still need `-webkit-mask-image` etc. NyxCode emits BOTH the
// prefixed and standard form so mask effects Just Work across the board.
//
// Affected properties (see WEBKIT_PREFIX_PROPERTIES in src/compiler.ts):
//   mask-image, mask-size, mask-position, mask-repeat, mask-origin, mask-clip,
//   mask-composite, mask-mode, mask-border (+ 5 mask-border-* subproperties).
//
// This also adds the `mi` / `mimg` shorthand for `mask-image`. `ms` is skipped
// because it's ambiguous with margin-start / milliseconds.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

function scopeClass(html: string): string | null {
  const m = html.match(/class="([^"]*nyx-s_\d+[^"]*)"/);
  if (!m) return null;
  return m[1].split(/\s+/).find(c => /^nyx-s_\d+$/.test(c)) ?? null;
}

function cssRule(css: string, cls: string): string | null {
  const re = new RegExp(
    '\\.' + cls.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
  );
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('v0.25.2: #113 auto-prefix mask-* properties with -webkit-', () => {
  test('mask-image emits both -webkit-mask-image and mask-image', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { mask-image "url(mask.svg)" } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(
      /-webkit-mask-image:\s*url\(mask\.svg\)/.test(rule),
      `expected -webkit-mask-image: url(mask.svg), got: ${rule}`,
    );
    assert.ok(
      /(?<!-webkit-)mask-image:\s*url\(mask\.svg\)/.test(rule),
      `expected plain mask-image: url(mask.svg), got: ${rule}`,
    );
  });

  test('mask-size emits both prefixed and standard', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { mask-size cover } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-mask-size:\s*cover/.test(rule), `prefixed: ${rule}`);
    assert.ok(/(?<!-webkit-)mask-size:\s*cover/.test(rule), `standard: ${rule}`);
  });

  test('mask-position, mask-repeat, mask-origin, mask-clip all get prefixed', () => {
    const { html, css } = compile(`
      page /t/ {
        div {
          style {
            mask-position center,
            mask-repeat no-repeat,
            mask-origin border-box,
            mask-clip padding-box
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    for (const prop of ['mask-position', 'mask-repeat', 'mask-origin', 'mask-clip']) {
      assert.ok(
        new RegExp(`-webkit-${prop}:`).test(rule),
        `expected -webkit-${prop}: in ${rule}`,
      );
      assert.ok(
        new RegExp(`(?<!-webkit-)${prop}:`).test(rule),
        `expected plain ${prop}: in ${rule}`,
      );
    }
  });

  test('mask-composite and mask-mode get prefixed', () => {
    const { html, css } = compile(`
      page /t/ {
        div {
          style {
            mask-composite intersect,
            mask-mode alpha
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-mask-composite:\s*intersect/.test(rule), `comp: ${rule}`);
    assert.ok(/-webkit-mask-mode:\s*alpha/.test(rule), `mode: ${rule}`);
  });

  test('NON-mask properties are NOT prefixed (regression guard)', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { c red, bg blue, fs 14px, p 1rem } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    // None of the regular props should acquire -webkit-
    assert.ok(!/-webkit-color:/.test(rule), `color must not be prefixed: ${rule}`);
    assert.ok(!/-webkit-background:/.test(rule), `bg must not be prefixed: ${rule}`);
    assert.ok(!/-webkit-font-size:/.test(rule), `fs must not be prefixed: ${rule}`);
    assert.ok(!/-webkit-padding:/.test(rule), `padding must not be prefixed: ${rule}`);
    // The regular ones still land correctly
    assert.ok(/color:\s*red/.test(rule), `color present: ${rule}`);
    assert.ok(/background:\s*blue/.test(rule), `bg present: ${rule}`);
  });

  test('shorthand `mi` resolves to mask-image and gets prefixed', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { mi "url(mask.svg)" } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(
      /-webkit-mask-image:\s*url\(mask\.svg\)/.test(rule),
      `expected -webkit-mask-image from mi shorthand: ${rule}`,
    );
    assert.ok(
      /(?<!-webkit-)mask-image:\s*url\(mask\.svg\)/.test(rule),
      `expected mask-image from mi shorthand: ${rule}`,
    );
  });

  test('shorthand `mimg` resolves to mask-image and gets prefixed', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { mimg "url(m.png)" } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-mask-image:\s*url\(m\.png\)/.test(rule), `prefixed: ${rule}`);
    assert.ok(/(?<!-webkit-)mask-image:\s*url\(m\.png\)/.test(rule), `standard: ${rule}`);
  });

  test('mask-* inside a preset{} block emits both prefixed and standard', () => {
    const { css } = compile(`
      preset masked {
        mask-image "url(mask.svg)"
        mask-size cover
      }
      page /t/ { div { "hi" } }
    `);
    assert.ok(
      /\.nyx-p_masked\s*\{[^}]*-webkit-mask-image:\s*["']?url\(mask\.svg\)/.test(css),
      `expected -webkit-mask-image in preset: ${css}`,
    );
    assert.ok(
      /\.nyx-p_masked\s*\{[^}]*(?<!-webkit-)mask-image:\s*["']?url\(mask\.svg\)/.test(css),
      `expected plain mask-image in preset: ${css}`,
    );
    assert.ok(
      /-webkit-mask-size:\s*cover/.test(css),
      `expected -webkit-mask-size in preset: ${css}`,
    );
  });

  test('mask-* inside hover{} pseudo-class also gets both variants', () => {
    const { html, css } = compile(`
      page /t/ {
        div {
          style {
            c red
            hover { mask-image "url(hov.svg)" }
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    // The :hover rule is a separate block; just check the global css string contains both.
    const hoverRe = new RegExp(
      '\\.' + cls + ':hover\\s*\\{([^}]*)\\}',
    );
    const m = css.match(hoverRe);
    assert.ok(m, `:hover rule should exist: ${css}`);
    const hoverRule = m![1];
    assert.ok(
      /-webkit-mask-image:\s*url\(hov\.svg\)/.test(hoverRule),
      `expected -webkit-mask-image in :hover: ${hoverRule}`,
    );
    assert.ok(
      /(?<!-webkit-)mask-image:\s*url\(hov\.svg\)/.test(hoverRule),
      `expected plain mask-image in :hover: ${hoverRule}`,
    );
  });

  test('mask-* inside responsive @media block also gets both variants', () => {
    const { html, css } = compile(`
      page /t/ {
        div {
          style {
            c red
            @mobile { mask-image "url(m.svg)" }
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    // Grep inside the @media chunk
    const mediaRe = /@media[^{]+\{\s*\.([\w-]+)\s*\{([^}]*)\}/g;
    let found = false;
    let match: RegExpExecArray | null;
    while ((match = mediaRe.exec(css)) !== null) {
      if (match[1] === cls) {
        const body = match[2];
        assert.ok(
          /-webkit-mask-image:\s*url\(m\.svg\)/.test(body),
          `expected -webkit-mask-image inside @media: ${body}`,
        );
        assert.ok(
          /(?<!-webkit-)mask-image:\s*url\(m\.svg\)/.test(body),
          `expected plain mask-image inside @media: ${body}`,
        );
        found = true;
      }
    }
    assert.ok(found, `expected @media rule for .${cls} in: ${css}`);
  });

  test('ordering: -webkit-mask-image is emitted BEFORE plain mask-image', () => {
    // Some browsers use cascade order to resolve feature support; the prefixed
    // form must come first so the standard form wins when supported.
    const { html, css } = compile(`
      page /t/ {
        div { style { mask-image "url(ord.svg)" } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    const prefixIdx = rule.indexOf('-webkit-mask-image');
    const plainIdx = rule.search(/(?<!-webkit-)mask-image:/);
    assert.ok(prefixIdx >= 0 && plainIdx >= 0, `both must exist: ${rule}`);
    assert.ok(
      prefixIdx < plainIdx,
      `-webkit-mask-image must come before mask-image: ${rule}`,
    );
  });
});
