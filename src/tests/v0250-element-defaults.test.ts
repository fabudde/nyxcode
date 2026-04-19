import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.0 — Issue #112: Element defaults via theme block.
//
// Previously, element defaults required head injection:
//   head "<style>a{color:#9b8ec4;text-decoration:none}pre,code{font-family:JetBrains Mono,monospace}</style>"
//
// New syntax:
//   theme {
//     defaults {
//       a { c #9b8ec4; td none }
//       pre { font-family "JetBrains Mono", monospace }
//     }
//   }
//
// Emits `a { ... }` rules (zero specificity) so local element styles always override.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('v0.25.0: #112 element defaults via theme block', () => {
  test('basic: a { c red; td none } → a { color: red; text-decoration: none }', () => {
    const src = `
theme {
  defaults {
    a { c red; td none }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /a\s*\{[^}]*color:\s*red/);
    assert.match(html, /a\s*\{[^}]*text-decoration:\s*none/);
  });

  test('font-family with comma-separated stack preserved', () => {
    const src = `
theme {
  defaults {
    pre { font-family "JetBrains Mono", monospace }
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    assert.match(html, /pre\s*\{[^}]*font-family:\s*"JetBrains Mono",\s*monospace/);
  });

  test('multiple elements in defaults → each gets its own rule', () => {
    const src = `
theme {
  defaults {
    a { c #9b8ec4 }
    pre { font-family "JetBrains Mono", monospace }
    code { font-family "JetBrains Mono", monospace }
    img { mw 100%; h auto }
    h1 { m 0 }
    h2 { m 0 }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /a\s*\{[^}]*color:\s*#9b8ec4/);
    assert.match(html, /pre\s*\{[^}]*font-family:\s*"JetBrains Mono"/);
    assert.match(html, /code\s*\{[^}]*font-family:\s*"JetBrains Mono"/);
    assert.match(html, /img\s*\{[^}]*max-width:\s*100%/);
    assert.match(html, /img\s*\{[^}]*height:\s*auto/);
    assert.match(html, /h1\s*\{[^}]*margin:\s*0/);
    assert.match(html, /h2\s*\{[^}]*margin:\s*0/);
  });

  test('defaults + body + colors all coexist in theme', () => {
    const src = `
theme {
  colors {
    primary: #667eea
  }
  body {
    bg #0a0a12
  }
  defaults {
    a { c #9b8ec4 }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // :root CSS var
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#667eea/);
    // body rule
    assert.match(html, /body\s*\{[^}]*background:\s*#0a0a12/);
    // a element default
    assert.match(html, /a\s*\{[^}]*color:\s*#9b8ec4/);
  });

  test('shorthand mapping works (m, p, bg, c, td, mw, h)', () => {
    const src = `
theme {
  defaults {
    div { m 0; p 10px; bg #fff; c #000 }
    a { td underline }
    img { mw 100%; h auto }
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    assert.match(html, /div\s*\{[^}]*margin:\s*0/);
    assert.match(html, /div\s*\{[^}]*padding:\s*10px/);
    assert.match(html, /div\s*\{[^}]*background:\s*#fff/);
    assert.match(html, /div\s*\{[^}]*color:\s*#000/);
    assert.match(html, /a\s*\{[^}]*text-decoration:\s*underline/);
    assert.match(html, /img\s*\{[^}]*max-width:\s*100%/);
    assert.match(html, /img\s*\{[^}]*height:\s*auto/);
  });

  test('no defaults section → backwards compatible, no extra default rules from theme', () => {
    const src = `
theme {
  colors {
    primary: #fff
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // :root still emitted
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#fff/);
    // No a / pre / code / img / h1 / :where(h2) from defaults.
    // (The reset CSS uses :where(body) and :where(*) only — not these.)
    assert.doesNotMatch(html, /a\s*\{/);
    assert.doesNotMatch(html, /pre\s*\{/);
    assert.doesNotMatch(html, /img\s*\{/);
  });

  test('theme color reference in defaults → resolves to var()', () => {
    // Both `color.primary` (dot-notation) and bare `primary` (implicit color
    // resolution for color-accepting properties) should resolve to the CSS var.
    const src = `
theme {
  colors {
    primary: #667eea
    accent: #9b8ec4
  }
  defaults {
    a { c color.primary }
    strong { c accent }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /a\s*\{[^}]*color:\s*var\(--colors-primary\)/);
    assert.match(html, /strong\s*\{[^}]*color:\s*var\(--colors-accent\)/);
  });

  test('uses bare element selector', () => {
    const src = `
theme {
  defaults {
    a { c red }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // v0.30: bare selectors (specificity 0,0,1) instead of :where() (0,0,0)
    // Bare selectors beat * { margin: 0 } resets while still being overridable by class/id
    assert.match(html, /a\s*\{[^}]*color:\s*red/);
    // Must NOT use :where() wrapper
    assert.doesNotMatch(html, /:where\(a\)/);
  });
});
