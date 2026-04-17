import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.24.3 — Issues #101 & #103 (related hyphen-handling bugs)
//
// Both bugs share a common root cause: the parser didn't treat consecutive
// hyphens as atomic.
//
//   #101: `var(--colors-muted)` in a style{} block compiled to
//          `var(- - colors-muted)`. Inside parens, the compiler emitted
//          spaces around every `-` (for calc() readability), which split
//          the leading `--` of a CSS custom property.
//
//   #103: `-webkit-background-clip text` inside a `preset { ... }` block
//          compiled to `-: webkit-background-clip text;`. `parsePreset`
//          consumed the leading `-` as a standalone property name while
//          `parseStyleProperty` already had the vendor-prefix guard.
//
// Fix lives in src/parser.ts:
//   1. Inside-paren `-` handler peeks for a following `-` and emits `--`
//      atomically; it no longer forces spaces around unary `-` that sit
//      at arg starts (after `(` or `,`).
//   2. `parsePreset` now mirrors the `parseStyleProperty` vendor-prefix
//      rescue: if the first token of a property name is `-`, glue the
//      next identifier onto it, and keep gluing `-ident` suffixes.

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

describe('v0.24.3: #101 var(--custom-prop) in style{} blocks', () => {
  test('c var(--colors-muted) -> color: var(--colors-muted)', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { c var(--colors-muted) } }
      }
    `);
    const cls = scopeClass(html);
    assert.ok(cls, 'div should carry a nyx-s_* class');
    const rule = cssRule(css, cls!);
    assert.ok(rule, 'rule block should exist');
    assert.ok(
      /color:\s*var\(--colors-muted\)/.test(rule!),
      `expected color: var(--colors-muted), got: ${rule}`,
    );
    assert.ok(
      !/var\(\s*-\s+-/.test(rule!),
      `must not split -- into "- -": ${rule}`,
    );
  });

  test('bg var(--colors-bg) -> background: var(--colors-bg)', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { bg var(--colors-bg) } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/background:\s*var\(--colors-bg\)/.test(rule), `got: ${rule}`);
  });

  test('font-family var(--fonts-mono) keeps --fonts-mono intact', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { font-family var(--fonts-mono) } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/font-family:\s*var\(--fonts-mono\)/.test(rule), `got: ${rule}`);
  });

  test('multiple var(--*) in one style block all survive', () => {
    const { html, css } = compile(`
      page /t/ {
        div {
          style {
            c var(--colors-muted),
            bg var(--colors-bg),
            ff var(--fonts-mono)
          }
        }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/color:\s*var\(--colors-muted\)/.test(rule), `c: ${rule}`);
    assert.ok(/background:\s*var\(--colors-bg\)/.test(rule), `bg: ${rule}`);
    assert.ok(/font-family:\s*var\(--fonts-mono\)/.test(rule), `ff: ${rule}`);
    assert.ok(!/-\s+-/.test(rule), `no "- -" split: ${rule}`);
  });

  test('calc() with negative values still renders correctly', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { m calc(-100% + 20px) } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/margin:\s*calc\(-100%\s*\+\s*20px\)/.test(rule), `got: ${rule}`);
  });

  test('calc() with spaced subtraction (calc(10px - 5px)) still works', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { w calc(10px - 5px) } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/width:\s*calc\(10px\s+-\s+5px\)/.test(rule), `got: ${rule}`);
  });
});

describe('v0.24.3: #103 vendor prefixes in presets and styles', () => {
  test('style: -webkit-background-clip text -> correct CSS', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { -webkit-background-clip text } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-background-clip:\s*text/.test(rule), `got: ${rule}`);
    assert.ok(!/^\s*-:\s/m.test(rule), `must not emit "-: ...": ${rule}`);
  });

  test('style: -webkit-text-fill-color transparent', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { -webkit-text-fill-color transparent } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-text-fill-color:\s*transparent/.test(rule), `got: ${rule}`);
  });

  test('style: -webkit-backdrop-filter blur(10px)', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { -webkit-backdrop-filter blur(10px) } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-webkit-backdrop-filter:\s*blur\(10px\)/.test(rule), `got: ${rule}`);
  });

  test('style: -moz-appearance none', () => {
    const { html, css } = compile(`
      page /t/ {
        div { style { -moz-appearance none } }
      }
    `);
    const cls = scopeClass(html)!;
    const rule = cssRule(css, cls)!;
    assert.ok(/-moz-appearance:\s*none/.test(rule), `got: ${rule}`);
  });

  test('preset: -webkit-background-clip text emits correct CSS', () => {
    const { css } = compile(`
      preset gradient {
        -webkit-background-clip text
        -webkit-text-fill-color transparent
        background linear-gradient(45deg, red, blue)
      }
      page /t/ { div { "hi" } }
    `);
    assert.ok(
      /\.nyx-p_gradient\s*\{[^}]*-webkit-background-clip:\s*text/.test(css),
      `expected -webkit-background-clip: text in preset: ${css}`,
    );
    assert.ok(
      /-webkit-text-fill-color:\s*transparent/.test(css),
      `expected -webkit-text-fill-color: transparent: ${css}`,
    );
    assert.ok(
      /background:\s*linear-gradient\(45deg,\s*red,\s*blue\)/.test(css),
      `expected background gradient: ${css}`,
    );
    assert.ok(!/-:\s/.test(css), `must not emit "-: ..." anywhere: ${css}`);
  });

  test('preset: -moz-appearance none', () => {
    const { css } = compile(`
      preset reset {
        -moz-appearance none
      }
      page /t/ { div { "hi" } }
    `);
    assert.ok(
      /\.nyx-p_reset\s*\{[^}]*-moz-appearance:\s*none/.test(css),
      `expected -moz-appearance: none in preset: ${css}`,
    );
  });
});
