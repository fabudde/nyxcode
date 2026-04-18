import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.2 — Issue #118: Missing CSS shorthands.
//
// Each new shorthand should expand to the corresponding full CSS property
// in the generated <style> block. We compile a minimal page that sets the
// shorthand on a page-level style block and assert the expanded CSS appears.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

function pageWithStyle(styleBody: string): string {
  return `
page "/" {
  style {
    ${styleBody}
  }
  h1 "x"
}
`;
}

describe('v0.25.2: Issue #118 — new CSS shorthands', () => {
  test('cv auto → content-visibility: auto', () => {
    const { html } = compile(pageWithStyle('cv auto'));
    assert.match(html, /content-visibility:\s*auto/);
  });

  test('sb smooth → scroll-behavior: smooth', () => {
    const { html } = compile(pageWithStyle('sb smooth'));
    assert.match(html, /scroll-behavior:\s*smooth/);
  });

  test('osb contain → overscroll-behavior: contain', () => {
    const { html } = compile(pageWithStyle('osb contain'));
    assert.match(html, /overscroll-behavior:\s*contain/);
  });

  test('osbx none → overscroll-behavior-x: none', () => {
    const { html } = compile(pageWithStyle('osbx none'));
    assert.match(html, /overscroll-behavior-x:\s*none/);
  });

  test('osby none → overscroll-behavior-y: none', () => {
    const { html } = compile(pageWithStyle('osby none'));
    assert.match(html, /overscroll-behavior-y:\s*none/);
  });

  test('smt 80px → scroll-margin-top: 80px', () => {
    const { html } = compile(pageWithStyle('smt 80px'));
    assert.match(html, /scroll-margin-top:\s*80px/);
  });

  test('tof ellipsis → text-overflow: ellipsis', () => {
    const { html } = compile(pageWithStyle('tof ellipsis'));
    assert.match(html, /text-overflow:\s*ellipsis/);
  });

  test('hy auto → hyphens: auto', () => {
    const { html } = compile(pageWithStyle('hy auto'));
    assert.match(html, /hyphens:\s*auto/);
  });

  test('caret red → caret-color: red', () => {
    const { html } = compile(pageWithStyle('caret red'));
    assert.match(html, /caret-color:\s*red/);
  });

  test('acc #ff0 → accent-color: #ff0', () => {
    const { html } = compile(pageWithStyle('acc #ff0'));
    assert.match(html, /accent-color:\s*#ff0/);
  });

  test('cs dark → color-scheme: dark', () => {
    const { html } = compile(pageWithStyle('cs dark'));
    assert.match(html, /color-scheme:\s*dark/);
  });

  test('ar 16/9 → aspect-ratio: 16/9', () => {
    const { html } = compile(pageWithStyle('ar 16/9'));
    assert.match(html, /aspect-ratio:\s*16\s*\/\s*9/);
  });

  test('ind 2rem → text-indent: 2rem', () => {
    const { html } = compile(pageWithStyle('ind 2rem'));
    assert.match(html, /text-indent:\s*2rem/);
  });

  test('bv hidden → backface-visibility: hidden', () => {
    const { html } = compile(pageWithStyle('bv hidden'));
    assert.match(html, /backface-visibility:\s*hidden/);
  });

  test('ps 1000px → perspective: 1000px', () => {
    const { html } = compile(pageWithStyle('ps 1000px'));
    assert.match(html, /perspective:\s*1000px/);
  });

  test('pso center → perspective-origin: center', () => {
    const { html } = compile(pageWithStyle('pso center'));
    assert.match(html, /perspective-origin:\s*center/);
  });

  test('to center → transform-origin: center', () => {
    const { html } = compile(pageWithStyle('to center'));
    assert.match(html, /transform-origin:\s*center/);
  });

  test('trs preserve-3d → transform-style: preserve-3d', () => {
    const { html } = compile(pageWithStyle('trs preserve-3d'));
    assert.match(html, /transform-style:\s*preserve-3d/);
  });

  test('wm vertical-rl → writing-mode: vertical-rl', () => {
    const { html } = compile(pageWithStyle('wm vertical-rl'));
    assert.match(html, /writing-mode:\s*vertical-rl/);
  });

  test('dir rtl → direction: rtl', () => {
    const { html } = compile(pageWithStyle('dir rtl'));
    assert.match(html, /direction:\s*rtl/);
  });
});

describe('v0.25.2: regression — existing shorthands still work', () => {
  test('bg red → background: red', () => {
    const { html } = compile(pageWithStyle('bg red'));
    assert.match(html, /background:\s*red/);
  });

  test('p 1rem → padding: 1rem', () => {
    const { html } = compile(pageWithStyle('p 1rem'));
    assert.match(html, /padding:\s*1rem/);
  });

  test('c blue → color: blue', () => {
    const { html } = compile(pageWithStyle('c blue'));
    assert.match(html, /color:\s*blue/);
  });

  test('fs 2rem → font-size: 2rem', () => {
    const { html } = compile(pageWithStyle('fs 2rem'));
    assert.match(html, /font-size:\s*2rem/);
  });

  test('hyphens (full name) still works', () => {
    const { html } = compile(pageWithStyle('hyphens auto'));
    assert.match(html, /hyphens:\s*auto/);
  });

  test('ww (legacy overflow-wrap alias) still works', () => {
    const { html } = compile(pageWithStyle('ww break-word'));
    assert.match(html, /overflow-wrap:\s*break-word/);
  });

  test('multiple new shorthands together', () => {
    const { html } = compile(pageWithStyle(`
      ar 16/9
      tof ellipsis
      sb smooth
      cs dark
    `));
    assert.match(html, /aspect-ratio:\s*16\s*\/\s*9/);
    assert.match(html, /text-overflow:\s*ellipsis/);
    assert.match(html, /scroll-behavior:\s*smooth/);
    assert.match(html, /color-scheme:\s*dark/);
  });
});
