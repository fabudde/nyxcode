import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// Regression tests for bugs found in v0.22.0 after release.

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  const out = new Compiler().compile(ast);
  return out.html + '\n' + out.css;
}

describe('v0.22.1 bug fixes', () => {
  test('#86: borders composite shorthand with dot-notation ref resolves correctly', () => {
    const src = `
theme {
  colors { border-subtle: #e5e1dc }
  borders {
    divider: 1px solid color.border-subtle
  }
}
page / { h1 "x" }
`;
    const html = compile(src);
    // The --borders-divider var must contain the resolved dot-notation ref
    assert.match(html, /--borders-divider:\s*1px solid var\(--colors-border-subtle\)/);
    // And NOT be split into zombie vars
    assert.ok(!html.includes('--borders-solid:'), 'must not split "solid" into a zombie var');
    assert.ok(!html.includes('--borders-border-subtle:'), 'must not create zombie border-subtle var');
  });

  test('#86: shadows with multi-word value containing dot-notation ref', () => {
    const src = `
theme {
  colors { accent: #ff6b00 }
  shadows {
    glow: 0 0 40px color.accent
  }
}
page / { h1 "x" }
`;
    const html = compile(src);
    assert.match(html, /--shadows-glow:\s*0 0 40px var\(--colors-accent\)/);
  });

  test('#87: dot-notation refs do NOT emit trailing space + double semicolon', () => {
    const src = `
theme {
  colors { primary: #8b5cf6 }
}
page / {
  h1 "x" { style { c color.primary; fs 2rem } }
}
`;
    const html = compile(src);
    // Clean output: `color: var(--colors-primary);` — NO ` ;;`
    assert.ok(
      !html.includes(' ;;'),
      'must not emit space + double semicolon after dot-notation refs'
    );
    assert.match(html, /color:\s*var\(--colors-primary\);/);
    // Also: no trailing space before semicolon
    assert.ok(
      !/var\(--[^)]+\)\s+;/.test(html),
      'must not leave trailing space between var() and semicolon'
    );
  });

  test('#87: explicit semicolon in style block does not leak into value', () => {
    const src = `
theme { colors { c1: #111 } }
page / {
  h1 "x" { style { color color.c1; background #fff } }
}
`;
    const html = compile(src);
    assert.match(html, /color:\s*var\(--colors-c1\);/);
    assert.match(html, /background:\s*#fff;/);
    assert.ok(!html.includes(';;'), 'no double semicolons anywhere');
  });
});
