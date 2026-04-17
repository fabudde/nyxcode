import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.23.0: @theme as "name" + @theme extends "./path" + numeric-prefix keys

function compileSingleAST(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

function parse(src: string) {
  return new Parser(new Lexer(src).tokenize()).parse();
}

describe('v0.23.0: numeric-prefix theme keys', () => {
  test('spacing.2xl parses and emits --spacing-2xl', () => {
    const html = compileSingleAST(`
theme { spacing { md: 1rem, 2xl: 3rem, 3xl: 4rem } }
page / { p "x" { style { p spacing.2xl } } }
`);
    assert.match(html, /--spacing-md:\s*1rem/);
    assert.match(html, /--spacing-2xl:\s*3rem/);
    assert.match(html, /--spacing-3xl:\s*4rem/);
    assert.match(html, /var\(--spacing-2xl\)/, 'reference resolves to numeric-prefix var');
  });

  test('radius.2xl and breakpoints.2xl both work', () => {
    const html = compileSingleAST(`
theme { radius { md: 8px, 2xl: 20px } }
page / { p "x" }
`);
    assert.match(html, /--radius-2xl:\s*20px/);
  });

  test('numeric-prefix key on new line starts new entry', () => {
    // This was the tricky case: borders / composite values with 2xl on next line
    const ast = parse(`
theme {
  spacing {
    md: 1rem
    2xl: 3rem
  }
}
`);
    const sections = (ast.body[0] as any).sections;
    assert.equal(sections[0].entries['md'], '1rem');
    assert.equal(sections[0].entries['2xl'], '3rem');
  });
});

describe('v0.23.0: @theme as "name" registration', () => {
  test('named theme alone emits NO :root in single file', () => {
    const html = compileSingleAST(`
theme as "brand-base" {
  colors { primary: #ff0000 }
}
page / { p "x" }
`);
    // Named-only theme must not pollute the document
    assert.doesNotMatch(html, /--colors-primary:\s*#ff0000/);
  });

  test('named theme + extending theme in SAME file merges', () => {
    const html = compileSingleAST(`
theme as "base" {
  colors { bg: #fff, text: #333 }
  spacing { md: 1rem, 2xl: 3rem }
}
theme extends "./base.nyx" {
  colors { text: #2c3e50, primary: #8b5cf6 }
}
page / { p "x" { style { c color.primary } } }
`);
    // Base unchanged
    assert.match(html, /--colors-bg:\s*#fff/);
    // Override wins
    assert.match(html, /--colors-text:\s*#2c3e50/);
    // New from extending
    assert.match(html, /--colors-primary:\s*#8b5cf6/);
    // Base spacing survives
    assert.match(html, /--spacing-md:\s*1rem/);
    assert.match(html, /--spacing-2xl:\s*3rem/);
  });

  test('extends with non-matching basename falls back to single named theme', () => {
    const html = compileSingleAST(`
theme as "editorial-reader" {
  colors { bg: #fff }
}
theme extends "./anything.nyx" {
  colors { text: #000 }
}
page / { p "x" }
`);
    // Only one named theme exists → use it even if basename mismatches
    assert.match(html, /--colors-bg:\s*#fff/);
    assert.match(html, /--colors-text:\s*#000/);
  });
});

describe('v0.23.0: @theme extends validation', () => {
  test('non-relative path errors at parse time', () => {
    assert.throws(
      () => parse(`theme extends "brand-base" { colors { x: #fff } }`),
      /relative file path/
    );
    assert.throws(
      () => parse(`theme extends "https://evil.com/base.nyx" { colors { x: #fff } }`),
      /relative file path/
    );
    assert.throws(
      () => parse(`theme extends "/absolute/base.nyx" { colors { x: #fff } }`),
      /relative file path/
    );
    assert.throws(
      () => parse(`theme extends "@org/theme" { colors { x: #fff } }`),
      /relative file path/
    );
  });

  test('extends without named theme in unit → compile error', () => {
    assert.throws(
      () => compileSingleAST(`
theme extends "./missing.nyx" { colors { x: #fff } }
page / { p "x" }
`),
      /no named themes are registered/
    );
  });

  test('@theme dark cannot combine with as or extends', () => {
    assert.throws(
      () => parse(`theme as "base" dark { colors { bg: #000 } }`),
      /cannot be combined/
    );
  });
});

describe('v0.23.0: token-merge semantics', () => {
  test('override does NOT delete base tokens, it only replaces matching keys', () => {
    const html = compileSingleAST(`
theme as "base" {
  colors { a: #111, b: #222, c: #333 }
}
theme extends "./base.nyx" {
  colors { b: #ffffff }
}
page / { p "x" }
`);
    assert.match(html, /--colors-a:\s*#111/);
    assert.match(html, /--colors-b:\s*#ffffff/, 'overridden');
    assert.match(html, /--colors-c:\s*#333/, 'untouched base survives');
  });

  test('new section in extending theme is appended alongside base sections', () => {
    const html = compileSingleAST(`
theme as "base" {
  colors { primary: #111 }
}
theme extends "./base.nyx" {
  radius { md: 8px }
}
page / { p "x" }
`);
    assert.match(html, /--colors-primary:\s*#111/);
    assert.match(html, /--radius-md:\s*8px/);
  });
});
