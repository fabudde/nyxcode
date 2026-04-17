import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// Regression test for Issue #90 (v0.22.1 critical bug):
// Multi-page builds dropped :root theme vars when there was no layout.

function compileMultiPage(src: string): Array<{path: string, html: string}> {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const c = new Compiler();
  return c.compileMultiFile(ast);
}

describe('v0.22.2: #90 multi-page theme emission', () => {
  test('two pages without layout both emit :root theme vars', () => {
    const src = `
theme { colors { primary: #ff0000, bg: #000000 } }
page / { p "home" { style { c color.primary } } }
page /about/ { p "about" { style { c color.primary } } }
`;
    const results = compileMultiPage(src);
    assert.equal(results.length, 2, 'two pages emitted');
    for (const page of results) {
      assert.match(
        page.html,
        /:root\{[^}]*--colors-primary:\s*#ff0000[^}]*\}/,
        `page ${page.path} must contain :root with --colors-primary`
      );
      assert.match(
        page.html,
        /:root\{[^}]*--colors-bg:\s*#000000[^}]*\}/,
        `page ${page.path} must contain :root with --colors-bg`
      );
    }
  });

  test('three pages with multiple theme sections all receive :root', () => {
    const src = `
theme {
  colors { primary: #8b5cf6 }
  spacing { md: 1rem }
  radius { md: 8px }
}
page / { p "home" }
page /foo/ { p "foo" }
page /bar/baz/ { p "bar-baz" }
`;
    const results = compileMultiPage(src);
    assert.equal(results.length, 3);
    for (const page of results) {
      assert.match(page.html, /--colors-primary:\s*#8b5cf6/);
      assert.match(page.html, /--spacing-md:\s*1rem/);
      assert.match(page.html, /--radius-md:\s*8px/);
    }
  });

  test('dark mode vars reach every page without layout', () => {
    const src = `
theme { colors { bg: #ffffff } }
theme dark { colors { bg: #000000 } }
page / { p "a" }
page /b/ { p "b" }
`;
    const results = compileMultiPage(src);
    for (const page of results) {
      assert.match(page.html, /--colors-bg:\s*#ffffff/);
      assert.match(page.html, /prefers-color-scheme:dark/);
      assert.match(page.html, /\[data-theme="dark"\]/);
    }
  });
});
