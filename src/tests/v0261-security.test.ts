import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';

import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.26.1 — Two security fixes:
//
// FINDING 1: Runtime `when` with a BARE identifier (not `__xxx__`, not `.dotRef`,
//   not a declared state/store) leaked secrets into generated JS. View-Source
//   exposes them. Fix: warn + STRIP content (fail-safe).
//
// FINDING 2: URL-type attributes (src, srcset, href, action, formaction, poster,
//   data, cite) did not filter dangerous schemes (javascript:, vbscript:,
//   data:text/html, …). Fix: sanitize and strip on detection.
//   Exception: data:image/* is allowed.

function compile(src: string, buildVars: Record<string, string> = {}): { html: string; js: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler({ pretty: true, buildVars }).compile(ast);
  return { html: out.html, js: out.js };
}

/** Capture console.warn / console.error during a block to assert on warnings. */
function captureLogs(fn: () => void): { warn: string[]; error: string[] } {
  const warn: string[] = [];
  const error: string[] = [];
  const origWarn = console.warn;
  const origError = console.error;
  console.warn = (...a: any[]) => { warn.push(a.join(' ')); };
  console.error = (...a: any[]) => { error.push(a.join(' ')); };
  try { fn(); } finally {
    console.warn = origWarn;
    console.error = origError;
  }
  return { warn, error };
}

describe('v0.26.1: Finding #1 — runtime `when` bare-identifier leak protection', () => {
  test('bare `when SECRET == "true"` without state/store → warn + STRIP content', () => {
    const src = `
      page / {
        when SECRET == "true" {
          div { text "API KEY: sk-12345" }
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { warn } = captureLogs(() => { result = compile(src); });
    // Content must NOT appear anywhere in the output — no innerHTML leak.
    assert.ok(!/sk-12345/.test(result!.html), 'HTML must not contain the secret');
    assert.ok(!/sk-12345/.test(result!.js), 'JS must not contain the secret');
    // No wrapper div / render fn either — the whole block is stripped.
    assert.ok(!/id="cond_/.test(result!.html), 'no cond_ wrapper when stripped');
    assert.ok(!/function render_cond_/.test(result!.js), 'no runtime JS when stripped');
    // Warning is emitted with the suggested alternatives.
    assert.ok(warn.some(w => w.includes("'when SECRET'")), 'warning mentions the bad identifier');
    assert.ok(warn.some(w => w.includes('__SECRET__')), 'warning suggests compile-time form');
    assert.ok(warn.some(w => w.includes('.SECRET')),  'warning suggests runtime-state form');
  });

  test('compile-time `when __secret__ == "true"` without --define → content stripped silently', () => {
    const src = `
      page / {
        when __secret__ == "true" {
          div { text "confidential" }
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { warn } = captureLogs(() => { result = compile(src); });
    assert.ok(!/confidential/.test(result!.html));
    assert.ok(!/confidential/.test(result!.js));
    // No warning — this is the correct, intended usage.
    assert.ok(!warn.some(w => w.includes('bare identifier')), 'no warning for __xxx__ form');
  });

  test('runtime `when .role == "admin"` WITH `state role` → still generates JS', () => {
    const src = `
      page / {
        state role = "admin"
        when .role == "admin" {
          div { text "admin panel" }
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { warn } = captureLogs(() => { result = compile(src); });
    // Runtime when → wrapper + render_ fn present.
    assert.match(result!.html, /id="cond_\d+"/);
    assert.match(result!.js, /function render_cond_\d+/);
    assert.match(result!.js, /__nyx\.state\.role == "admin"/);
    // No warning — dotted refs are always safe.
    assert.ok(!warn.some(w => w.includes('bare identifier')), 'no warning for .dotRef');
  });

  test('runtime `when count > 0` with `state count` → still generates JS', () => {
    const src = `
      page / {
        state count = 0
        when count > 0 {
          div { text "items" }
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { warn } = captureLogs(() => { result = compile(src); });
    // Declared state → safe, emits runtime.
    assert.match(result!.html, /id="cond_\d+"/);
    assert.match(result!.js, /function render_cond_\d+/);
    assert.ok(!warn.some(w => w.includes('bare identifier')),
      'declared state identifier must not trigger the warning');
  });

  test('bare undeclared identifier WITHOUT operator (just `when SECRET { … }`) also stripped', () => {
    const src = `
      page / {
        when SECRET {
          div { text "leaky-content" }
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { warn } = captureLogs(() => { result = compile(src); });
    assert.ok(!/leaky-content/.test(result!.html));
    assert.ok(!/leaky-content/.test(result!.js));
    assert.ok(warn.some(w => w.includes('bare identifier')));
  });
});

describe('v0.26.1: Finding #2 — URL attribute scheme sanitization', () => {
  test('source srcset="javascript:alert(1)" → attribute STRIPPED', () => {
    const src = `
      page / {
        picture {
          source srcset="javascript:alert(1)"
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.ok(!/javascript:/.test(result!.html), 'javascript: URL must not appear');
    assert.ok(!/srcset="javascript/.test(result!.html));
    assert.ok(error.some(e => e.includes('srcset')), 'error logged for blocked srcset');
  });

  test('source srcset="data:text/html,<script>..." → STRIPPED', () => {
    const src = `
      page / {
        picture {
          source srcset="data:text/html,<script>alert(1)</script>"
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.ok(!/data:text\/html/.test(result!.html));
    assert.ok(error.some(e => e.includes('srcset')));
  });

  test('source srcset="hero.avif" → passes through (relative path)', () => {
    const src = `
      page / {
        picture {
          source srcset="hero.avif"
        }
      }
    `;
    const { html } = compile(src);
    assert.match(html, /srcset="hero\.avif"/);
  });

  test('source srcset="https://cdn.example.com/img.avif" → passes through', () => {
    const src = `
      page / {
        picture {
          source srcset="https://cdn.example.com/img.avif"
        }
      }
    `;
    const { html } = compile(src);
    assert.match(html, /srcset="https:\/\/cdn\.example\.com\/img\.avif"/);
  });

  test('source srcset="data:image/png;base64,iVBOR…" → allowed (data:image whitelist)', () => {
    const src = `
      page / {
        picture {
          source srcset="data:image/png;base64,iVBORw0KGgo="
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.match(result!.html, /srcset="data:image\/png;base64,/);
    assert.equal(error.length, 0, 'no error for data:image/*');
  });

  test('a href="javascript:alert(1)" → attribute STRIPPED', () => {
    const src = `
      page / {
        link "click" href="javascript:alert(1)"
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.ok(!/javascript:alert/.test(result!.html));
    assert.ok(!/href="javascript/.test(result!.html));
    assert.ok(error.some(e => e.includes('href')), 'error logged for blocked href');
  });

  test('img src="https://example.com/img.jpg" → passes through', () => {
    const src = `
      page / {
        img src="https://example.com/img.jpg"
      }
    `;
    const { html } = compile(src);
    assert.match(html, /src="https:\/\/example\.com\/img\.jpg"/);
  });

  test('img src="javascript:void(0)" → STRIPPED', () => {
    const src = `
      page / {
        img src="javascript:void(0)"
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.ok(!/javascript:void/.test(result!.html));
    assert.ok(!/src="javascript/.test(result!.html));
    assert.ok(error.some(e => e.includes('src')));
  });

  test('case-insensitive scheme detection: src="JaVaScRiPt:…" → STRIPPED', () => {
    const src = `
      page / {
        img src="JaVaScRiPt:alert(1)"
      }
    `;
    let result: ReturnType<typeof compile>;
    captureLogs(() => { result = compile(src); });
    assert.ok(!/JaVaScRiPt/.test(result!.html),
      'case variations must not bypass the filter');
  });

  test('whitespace-obfuscated scheme: src="  javascript:…" → STRIPPED', () => {
    const src = `
      page / {
        img src="  javascript:alert(1)"
      }
    `;
    let result: ReturnType<typeof compile>;
    captureLogs(() => { result = compile(src); });
    assert.ok(!/javascript:alert/.test(result!.html),
      'leading whitespace must not bypass the filter');
  });

  test('srcset with mixed safe + dangerous candidate → whole attr DROPPED (fail-safe)', () => {
    const src = `
      page / {
        picture {
          source srcset="ok.avif 1x, javascript:alert(1) 2x"
        }
      }
    `;
    let result: ReturnType<typeof compile>;
    const { error } = captureLogs(() => { result = compile(src); });
    assert.ok(!/javascript:/.test(result!.html));
    // Whole attribute dropped — we do NOT keep the "safe" candidate either,
    // because partial data is a confusing attack surface.
    assert.ok(!/srcset="ok\.avif/.test(result!.html),
      'entire srcset attribute stripped when any candidate is dangerous');
    assert.ok(error.some(e => e.includes('srcset')));
  });

  test('vbscript: scheme also blocked', () => {
    const src = `
      page / {
        img src="vbscript:msgbox(1)"
      }
    `;
    let result: ReturnType<typeof compile>;
    captureLogs(() => { result = compile(src); });
    assert.ok(!/vbscript:/.test(result!.html));
  });
});
