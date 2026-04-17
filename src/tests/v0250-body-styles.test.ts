import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.0 — Issue #109: Native body-level styles via theme block.
//
// Previously, body styles required head injection:
//   head "<style>body{background:#0a0a12;color:#f0eaff}</style>"
//
// New syntax:
//   theme { body { bg #0a0a12; c #f0eaff; of-x hidden } }
// emits a real `body { ... }` CSS rule (with shorthand expansion + vendor
// prefix support) after :root and before page-specific styles.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('v0.25.0: #109 native body-level styles via theme block', () => {
  test('basic: bg + c shorthands → body { background: ...; color: ... }', () => {
    const src = `
theme {
  body {
    bg #0a0a12
    c #fff
  }
}
page "/" { h1 "Hi" }
`;
    const { html } = compile(src);
    assert.match(html, /body\s*\{[^}]*background:\s*#0a0a12/);
    assert.match(html, /body\s*\{[^}]*color:\s*#fff/);
  });

  test('overflow shorthand: of-x hidden → overflow-x: hidden', () => {
    const src = `
theme {
  body {
    of-x hidden
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    assert.match(html, /body\s*\{[^}]*overflow-x:\s*hidden/);
  });

  test('body styles AND color vars coexist', () => {
    const src = `
theme {
  body {
    bg #000
  }
  colors {
    primary: #fff
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // :root CSS var for primary
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#fff/);
    // body rule with background
    assert.match(html, /body\s*\{[^}]*background:\s*#000/);
  });

  test('multiple shorthand properties all map correctly', () => {
    const src = `
theme {
  body {
    bg #0a0a12
    c #f0eaff
    of-x hidden
    m 0
    p 0
  }
}
page "/" { h1 "hi" }
`;
    const { html } = compile(src);
    const m = html.match(/body\s*\{([^}]*)\}/);
    assert.ok(m, 'body rule must exist');
    const rule = m![1];
    assert.match(rule, /background:\s*#0a0a12/);
    assert.match(rule, /color:\s*#f0eaff/);
    assert.match(rule, /overflow-x:\s*hidden/);
    assert.match(rule, /margin:\s*0/);
    assert.match(rule, /padding:\s*0/);
  });

  test('vendor-prefixed property: -webkit-font-smoothing works', () => {
    const src = `
theme {
  body {
    -webkit-font-smoothing antialiased
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    assert.match(html, /body\s*\{[^}]*-webkit-font-smoothing:\s*antialiased/);
  });

  test('theme without body block: no body rule emitted (backwards compatible)', () => {
    const src = `
theme {
  colors {
    primary: #fff
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // :root for colors must exist
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#fff/);
    // There must be NO explicit `body { ... }` rule from the theme.
    // Our reset uses `:where(body)` — so a bare `body {` selector should be absent.
    const matches = html.match(/\bbody\s*\{/g);
    assert.equal(matches, null, 'no explicit body rule should be emitted when theme.body is absent');
  });

  test('font-family with comma-separated stack works', () => {
    const src = `
theme {
  body {
    font-family "Inter", sans-serif
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /body\s*\{[^}]*font-family:\s*"Inter",\s*sans-serif/);
  });

  test('body rule appears after :root (cascade order)', () => {
    const src = `
theme {
  body {
    bg #000
  }
  colors {
    primary: #fff
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    const rootIdx = html.search(/:root\s*\{/);
    const bodyIdx = html.search(/body\s*\{[^}]*background/);
    assert.ok(rootIdx >= 0, ':root must exist');
    assert.ok(bodyIdx >= 0, 'body rule must exist');
    assert.ok(bodyIdx > rootIdx, 'body rule must come after :root');
  });
});
