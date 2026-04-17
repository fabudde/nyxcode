import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// Bug #91 regression: comma-separated font stacks must be collected as one entry,
// not split into phantom tokens, and must not bleed into the next line's key.

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

describe('v0.23.2: Bug #91 — comma-separated font stacks', () => {
  test('string + identifier stack single line', () => {
    const html = compile(`
theme { fonts { body: "Inter", system-ui, sans-serif } }
page / { p "x" }
`);
    assert.match(html, /--fonts-body:\s*Inter,\s*system-ui,\s*sans-serif/);
    assert.doesNotMatch(html, /--fonts-system-ui/);
    assert.doesNotMatch(html, /--fonts-sans-serif/);
  });

  test('identifier-only stack single line', () => {
    const html = compile(`
theme { fonts { heading: Georgia, serif } }
page / { p "x" }
`);
    assert.match(html, /--fonts-heading:\s*Georgia,\s*serif/);
    assert.doesNotMatch(html, /--fonts-serif/);
  });

  test('two entries on separate lines with stacks', () => {
    const html = compile(`
theme {
  fonts {
    body: "Inter", system-ui, sans-serif
    heading: Georgia, serif
  }
}
page / { p "x" }
`);
    assert.match(html, /--fonts-body:\s*Inter,\s*system-ui,\s*sans-serif/);
    assert.match(html, /--fonts-heading:\s*Georgia,\s*serif/);
    assert.doesNotMatch(html, /--fonts-system-ui/);
    assert.doesNotMatch(html, /--fonts-sans-serif/);
    assert.doesNotMatch(html, /--fonts-serif:/);
    // Bleed check: the literal quoted bleed `"heading : Georgia"` must NOT appear as a value.
    assert.doesNotMatch(html, /"heading\s*:\s*Georgia"/, 'next-key bleed must not appear as a var value');
  });

  test('two entries single-line comma-separated without stacks', () => {
    const html = compile(`
theme { fonts { body: "Inter", heading: "Playfair Display" } }
page / { p "x" }
`);
    assert.match(html, /--fonts-body:\s*"Inter"/);
    assert.match(html, /--fonts-heading:\s*"Playfair Display"/);
  });

  test('stack + source: google meta', () => {
    const html = compile(`
theme { fonts { body: "Inter", system-ui source: google } }
page / { p "x" }
`);
    assert.match(html, /--fonts-body:\s*Inter,\s*system-ui/);
    // Google Font preconnect should include "Inter" (first stack entry)
    assert.match(html, /fonts\.googleapis\.com[\s\S]*Inter/);
  });

  test('mixed: string body + identifier-only heading on different lines', () => {
    const html = compile(`
theme {
  fonts {
    body: "Inter"
    heading: Georgia, serif
  }
}
page / { p "x" }
`);
    assert.match(html, /--fonts-body:\s*"Inter"/);
    assert.match(html, /--fonts-heading:\s*Georgia,\s*serif/);
  });
});

describe('v0.23.2: Bug #91 — stacks work with extends', () => {
  test('base with font stack, extending theme override', () => {
    const html = compile(`
theme as "base" {
  fonts { body: "Inter", system-ui, sans-serif }
}
theme extends "./base.nyx" {
  fonts { heading: Georgia, serif }
}
page / { p "x" }
`);
    // Base body stack preserved, heading added by extending
    assert.match(html, /--fonts-body:\s*Inter,\s*system-ui,\s*sans-serif/);
    assert.match(html, /--fonts-heading:\s*Georgia,\s*serif/);
  });
});
