import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.0 — Issue #111: Native ::selection styles via theme block.
//
// Previously, selection styles required head injection:
//   head "<style>::selection{background:rgba(155,142,196,0.3);color:#f0eaff}</style>"
//
// New syntax:
//   theme { selection { bg rgba(155,142,196,0.3); c #f0eaff } }
// emits a real `::selection { ... }` CSS rule (with shorthand expansion +
// theme ref resolution) after :root and body rules.

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('v0.25.0: #111 native ::selection styles via theme block', () => {
  test('basic: bg + c shorthands → ::selection { background: ...; color: ... }', () => {
    const src = `
theme {
  selection {
    bg pink
    c white
  }
}
page "/" { h1 "Hi" }
`;
    const { html } = compile(src);
    assert.match(html, /::selection\s*\{[^}]*background:\s*pink/);
    assert.match(html, /::selection\s*\{[^}]*color:\s*white/);
  });

  test('rgba() values are preserved correctly (not mangled with spaces)', () => {
    const src = `
theme {
  selection {
    bg rgba(155,142,196,0.3)
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    assert.match(html, /::selection\s*\{[^}]*background:\s*rgba\(155,\s*142,\s*196,\s*0\.3\)/);
    // And crucially: no `rgba (` with space before paren (browsers silently drop that).
    assert.doesNotMatch(html, /rgba\s+\(/);
  });

  test('selection + body + colors + defaults all coexist', () => {
    const src = `
theme {
  colors {
    primary: #667eea
    accent: #f0eaff
  }
  body {
    bg #0a0a12
    c #f0eaff
  }
  selection {
    bg rgba(155,142,196,0.3)
    c #f0eaff
  }
}
page "/" { h1 "Coexist" }
`;
    const { html } = compile(src);
    // :root with colors
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#667eea/);
    assert.match(html, /:root\s*\{[^}]*--colors-accent:\s*#f0eaff/);
    // body rule
    assert.match(html, /body\s*\{[^}]*background:\s*#0a0a12/);
    assert.match(html, /body\s*\{[^}]*color:\s*#f0eaff/);
    // ::selection rule
    assert.match(html, /::selection\s*\{[^}]*background:\s*rgba\(155,\s*142,\s*196,\s*0\.3\)/);
    assert.match(html, /::selection\s*\{[^}]*color:\s*#f0eaff/);
    // Ordering sanity: :root before body before ::selection.
    const rootIdx = html.indexOf(':root');
    const bodyIdx = html.indexOf('body{');
    const selIdx = html.indexOf('::selection');
    assert.ok(rootIdx < bodyIdx, ':root must come before body rule');
    assert.ok(bodyIdx < selIdx, 'body rule must come before ::selection rule');
  });

  test('shorthand mapping works (bg → background, c → color)', () => {
    const src = `
theme {
  selection {
    bg #222
    c #eee
  }
}
page "/" { p "x" }
`;
    const { html } = compile(src);
    // Shorthand names should NOT appear as raw properties.
    assert.doesNotMatch(html, /::selection\s*\{[^}]*\bbg:/);
    assert.doesNotMatch(html, /::selection\s*\{[^}]*(^|;|\s)c:/);
    assert.match(html, /::selection\s*\{[^}]*background:\s*#222/);
    assert.match(html, /::selection\s*\{[^}]*color:\s*#eee/);
  });

  test('no selection section → backwards compatible (no ::selection rule emitted)', () => {
    const src = `
theme {
  colors {
    primary: #667eea
  }
  body {
    bg #000
    c #fff
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /:root\s*\{[^}]*--colors-primary:\s*#667eea/);
    assert.match(html, /body\s*\{[^}]*background:\s*#000/);
    assert.doesNotMatch(html, /::selection/);
  });

  test('theme color reference in selection → resolves to var()', () => {
    const src = `
theme {
  colors {
    primary: #667eea
    accent: #f0eaff
  }
  selection {
    bg color.primary
    c color.accent
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /::selection\s*\{[^}]*background:\s*var\(--colors-primary\)/);
    assert.match(html, /::selection\s*\{[^}]*color:\s*var\(--colors-accent\)/);
  });
});
