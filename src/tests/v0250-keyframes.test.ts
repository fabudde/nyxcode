import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.0 — Issue #110: Native top-level `keyframes name { ... }` syntax.
//
// Previously authors had to smuggle @keyframes through `head "<style>..."`, which
// bypassed the shorthand mapper entirely and offered no error reporting. The new
// top-level syntax:
//
//   keyframes drift {
//     0%, 100% { tf translate(0,0) }
//     50% { tf translate(-2%, 1.5%) }
//   }
//
// parses to a `KeyframesNode` and emits `@keyframes drift { ... }` into the
// stylesheet with full shorthand + theme resolution, positioned after theme vars
// and before page styles. Duplicate names raise a compile error.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

// The compiler emits @keyframes as part of the animCSS block inside the <style>
// element in the HTML head (not the per-scope CSS string). Pull it out of html.
// Extract a full @keyframes block by balancing braces — our emitter nests { } per step
// so a non-greedy regex won't work. Walk the string once we find the opening brace.
function extractKeyframes(html: string, name: string): string | null {
  const re = new RegExp('@keyframes\\s+' + name + '\\s*\\{');
  const m = re.exec(html);
  if (!m) return null;
  const openIdx = html.indexOf('{', m.index);
  let depth = 1;
  let i = openIdx + 1;
  while (i < html.length && depth > 0) {
    const ch = html[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return html.slice(m.index, i);
}

describe('v0.25.0: #110 native top-level keyframes', () => {
  test('basic keyframes with two stops emits correct @keyframes CSS', () => {
    const src = `
      keyframes drift {
        0% { tf translate(0,0) }
        100% { tf translate(10px, 5px) }
      }
      page / {
        div { text "hi" }
      }
    `;
    const { html } = compile(src);
    const kf = extractKeyframes(html, 'drift');
    assert.ok(kf, 'expected @keyframes drift in html');
    assert.match(kf!, /0%\s*\{[\s\S]*?transform:\s*translate\(0,\s*0\)/);
    assert.match(kf!, /100%\s*\{[\s\S]*?transform:\s*translate\(10px,\s*5px\)/);
  });

  test('keyframes with shorthand properties (tf, op, bg) are mapped correctly', () => {
    const src = `
      keyframes fade {
        0% { op 0 bg red }
        100% { op 1 bg blue tf scale(1.2) }
      }
      page / { div { text "x" } }
    `;
    const { html } = compile(src);
    const kf = extractKeyframes(html, 'fade');
    assert.ok(kf);
    // Shorthand expansion: op -> opacity, bg -> background, tf -> transform
    assert.match(kf!, /opacity:\s*0/);
    assert.match(kf!, /background:\s*red/);
    assert.match(kf!, /opacity:\s*1/);
    assert.match(kf!, /background:\s*blue/);
    assert.match(kf!, /transform:\s*scale\(1.2\)/);
  });

  test('multiple keyframes blocks both emitted', () => {
    const src = `
      keyframes drift {
        0% { tf translate(0,0) }
        100% { tf translate(-2%, 1.5%) }
      }
      keyframes float {
        0% { tf translateY(0) }
        100% { tf translateY(-10px) }
      }
      page / { div { text "x" } }
    `;
    const { html } = compile(src);
    assert.ok(extractKeyframes(html, 'drift'), 'drift missing');
    assert.ok(extractKeyframes(html, 'float'), 'float missing');
  });

  test('keyframes with from/to syntax works', () => {
    const src = `
      keyframes slide {
        from { tf translateX(0) }
        to { tf translateX(100px) }
      }
      page / { div { text "x" } }
    `;
    const { html } = compile(src);
    const kf = extractKeyframes(html, 'slide');
    assert.ok(kf);
    assert.match(kf!, /from\s*\{[\s\S]*transform:\s*translateX\(0\)/);
    assert.match(kf!, /to\s*\{[\s\S]*transform:\s*translateX\(100px\)/);
  });

  test('multiple selectors per stop (0%, 100%) works', () => {
    const src = `
      keyframes drift {
        0%, 100% { tf translate(0,0) }
        50% { tf translate(-2%, 1.5%) }
      }
      page / { div { text "x" } }
    `;
    const { html } = compile(src);
    const kf = extractKeyframes(html, 'drift');
    assert.ok(kf);
    // The combined selector should round-trip as "0%, 100%"
    assert.match(kf!, /0%,\s*100%\s*\{[\s\S]*?transform:\s*translate\(0,\s*0\)/);
    assert.match(kf!, /50%\s*\{[\s\S]*?transform:\s*translate\(-2%,\s*1\.5%\)/);
  });

  test('duplicate keyframes name raises compile error', () => {
    const src = `
      keyframes drift {
        0% { tf translate(0,0) }
      }
      keyframes drift {
        0% { tf translate(5px,5px) }
      }
      page / { div { text "x" } }
    `;
    assert.throws(() => compile(src), /Duplicate keyframes name 'drift'/);
  });

  test('keyframes referenced in style via anim works end-to-end', () => {
    const src = `
      keyframes drift {
        0%, 100% { tf translate(0,0) }
        50% { tf translate(-2%, 1.5%) }
      }
      page / {
        div {
          style { anim drift 30s ease-in-out infinite }
          text "moving"
        }
      }
    `;
    const { html, css } = compile(src);
    assert.ok(extractKeyframes(html, 'drift'), '@keyframes drift should be emitted');
    // The element's scoped CSS should carry animation: drift 30s ease-in-out infinite
    assert.match(css, /animation:\s*drift 30s ease-in-out infinite/);
  });

  test('no keyframes defined → backwards compatible (no error, no @keyframes)', () => {
    const src = `
      page / {
        div { text "plain" }
      }
    `;
    const { html } = compile(src);
    assert.doesNotMatch(html, /@keyframes/);
  });

  test('keyframes CSS is positioned after theme vars and before page styles', () => {
    const src = `
      theme {
        colors { primary "#ff0000" }
      }
      keyframes drift {
        0% { tf translate(0,0) }
        100% { tf translate(10px, 10px) }
      }
      page / {
        div {
          style { c primary }
          text "x"
        }
      }
    `;
    const { html } = compile(src);
    // Theme :root block must come before @keyframes drift
    const themeIdx = html.indexOf(':root');
    const kfIdx = html.indexOf('@keyframes drift');
    assert.ok(themeIdx >= 0, 'theme :root should be present');
    assert.ok(kfIdx >= 0, '@keyframes should be present');
    assert.ok(themeIdx < kfIdx, `expected theme :root (${themeIdx}) before @keyframes (${kfIdx})`);
    // The @keyframes should appear inside the same <style> block as theme + page CSS.
    assert.match(html, /@keyframes drift/);
  });
});
