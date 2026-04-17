import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.24.0 — `nav burger` responsive collapsible nav (Issue #96)
// Spec consolidation: Kiro (design review) + Tyto (a11y + security review)

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('v0.24.0: nav burger — basic shape', () => {
  test('bare `nav burger` compiles to <details>/<summary>/<nav>', () => {
    const { html } = compile(`
      page / {
        nav burger {
          a "Home" href="/"
          a "About" href="/about"
        }
      }
    `);
    assert.match(html, /<details class="nx-burger/);
    assert.match(html, /<summary aria-label="Toggle menu">/);
    assert.match(html, /<nav aria-label="Main navigation">/);
    assert.match(html, /<\/details>/);
    // Links rendered inside the inner <nav>
    assert.match(html, /<a href="\/"[^>]*>Home<\/a>/);
    assert.match(html, /<a href="\/about"[^>]*>About<\/a>/);
  });

  test('state-correct dual spans are emitted (Tyto catch)', () => {
    const { html } = compile(`
      page / { nav burger { a "Home" href="/" } }
    `);
    assert.match(html, /<span class="nx-burger-closed">Menu<\/span>/);
    assert.match(html, /<span class="nx-burger-open" aria-hidden="true">Close<\/span>/);
  });

  test('default breakpoint is 768px when no burger= is given', () => {
    const { html } = compile(`
      page / { nav burger { a "H" href="/" } }
    `);
    assert.match(html, /@media\(max-width:768px\)/);
    assert.match(html, /nx-burger-bp-768/);
  });
});

describe('v0.24.0: nav burger — breakpoint resolution', () => {
  test('burger=<theme breakpoint token> resolves to px', () => {
    const { html } = compile(`
      theme { breakpoints { sm: 480px, md: 768px, lg: 1024px } }
      page / { nav burger=lg { a "H" href="/" } }
    `);
    assert.match(html, /@media\(max-width:1024px\)/);
    assert.match(html, /nx-burger-bp-1024/);
  });

  test('unknown breakpoint → did-you-mean error', () => {
    assert.throws(
      () =>
        compile(`
          theme { breakpoints { sm: 480px, md: 768px, lg: 1024px } }
          page / { nav burger=xl { a "H" href="/" } }
        `),
      /unknown breakpoint 'xl'.*Did you mean 'lg'/,
    );
  });

  test('missing theme.breakpoints with burger=<token> → hard error', () => {
    assert.throws(
      () =>
        compile(`
          page / { nav burger=md { a "H" href="/" } }
        `),
      /theme\.breakpoints\.md to be defined/,
    );
  });
});

describe('v0.24.0: nav burger — attribute overrides', () => {
  test('icon="..." replaces the closed-state label', () => {
    const { html } = compile(`
      page / { nav burger icon="☰" { a "H" href="/" } }
    `);
    assert.match(html, /<span class="nx-burger-closed">☰<\/span>/);
    // Open label stays "Close" by default
    assert.match(html, /<span class="nx-burger-open" aria-hidden="true">Close<\/span>/);
  });

  test('aria-label="..." overrides the inner nav aria-label', () => {
    const { html } = compile(`
      page / {
        nav burger aria-label="Section navigation" { a "H" href="/" }
      }
    `);
    assert.match(html, /<nav aria-label="Section navigation">/);
    // summary-aria-label stays at default
    assert.match(html, /<summary aria-label="Toggle menu">/);
  });

  test('summary-aria-label="..." overrides the summary aria-label', () => {
    const { html } = compile(`
      page / {
        nav burger summary-aria-label="Open site menu" { a "H" href="/" }
      }
    `);
    assert.match(html, /<summary aria-label="Open site menu">/);
    // nav aria stays at default
    assert.match(html, /<nav aria-label="Main navigation">/);
  });

  test('open-label="..." overrides the open-state span text', () => {
    const { html } = compile(`
      page / { nav burger open-label="Hide" { a "H" href="/" } }
    `);
    assert.match(html, /<span class="nx-burger-open" aria-hidden="true">Hide<\/span>/);
  });
});

describe('v0.24.0: nav burger — CSS emission', () => {
  test('base CSS rules are emitted once per build', () => {
    const { html } = compile(`
      page / { nav burger { a "H" href="/" } }
    `);
    assert.match(html, /\.nx-burger\{all:unset;display:flex;align-items:center\}/);
    assert.match(html, /\.nx-burger>summary\{display:none/);
    assert.match(html, /\.nx-burger\[open\] \.nx-burger-closed\{display:none\}/);
    assert.match(html, /\.nx-burger\[open\] \.nx-burger-open\{display:inline\}/);
  });

  test('responsive CSS uses the correct breakpoint', () => {
    const { html } = compile(`
      theme { breakpoints { sm: 480px, md: 768px, lg: 1024px } }
      page / { nav burger=sm { a "H" href="/" } }
    `);
    assert.match(
      html,
      /@media\(max-width:480px\)\{[^}]*\.nx-burger-bp-480>summary\{display:inline-block/,
    );
  });

  test('multiple burger navs with different breakpoints coexist', () => {
    const { html } = compile(`
      theme { breakpoints { sm: 480px, md: 768px } }
      page / {
        nav burger=sm { a "A" href="/" }
        nav burger=md { a "B" href="/" }
      }
    `);
    assert.match(html, /@media\(max-width:480px\)/);
    assert.match(html, /@media\(max-width:768px\)/);
    assert.match(html, /nx-burger-bp-480/);
    assert.match(html, /nx-burger-bp-768/);
  });
});

describe('v0.24.0: nav burger — HTML escaping (security)', () => {
  test('icon values are HTML-escaped', () => {
    const { html } = compile(`
      page / { nav burger icon="<script>alert(1)</script>" { a "H" href="/" } }
    `);
    // Must NOT contain raw <script>
    assert.ok(
      !html.includes('<script>alert(1)</script>'),
      'raw <script> must be escaped',
    );
    // Must contain the escaped form
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test('aria-label values are HTML-escaped', () => {
    const { html } = compile(`
      page / { nav burger aria-label="Nav & \\"menu\\"" { a "H" href="/" } }
    `);
    // Double-quotes inside the aria-label attribute must be escaped
    assert.ok(!/<nav aria-label="Nav & "menu""/.test(html));
  });
});

describe('v0.24.0: nav burger — body scroll lock (Issue #98, iOS)', () => {
  test('emits CSS-only scroll-lock on html+body when burger is open', () => {
    const { css } = compile(`
      page / { nav burger { a "Home" href="/" } }
    `);
    // Must lock both html and body via :has() on the open burger
    assert.match(
      css,
      /html:has\(\.nx-burger-bp-768\[open\]\),body:has\(\.nx-burger-bp-768\[open\]\)\{overflow:hidden;overscroll-behavior:contain\}/,
      'expected html+body scroll-lock selector with overflow:hidden',
    );
  });

  test('scroll-lock lives inside the mobile media query (desktop unaffected)', () => {
    const { css } = compile(`
      page / { nav burger { a "Home" href="/" } }
    `);
    // The scroll-lock rule must be nested inside the @media(max-width:768px) block,
    // not emitted at the top level. We verify this by checking the substring
    // between the @media opener and its matching close brace.
    const mq = css.match(/@media\(max-width:768px\)\{([^]*?)\}(?!\})/);
    // Fallback: just find the @media block and look for the lock rule within.
    const hasLockInMq = /@media\(max-width:768px\)\{[^@]*html:has\(\.nx-burger-bp-768\[open\]\)/.test(
      css,
    );
    assert.ok(hasLockInMq, 'scroll-lock must be inside the @media(max-width:...) block');
    // And it must NOT appear outside a media query (no top-level overflow:hidden on body from us).
    const outside = css.replace(/@media\(max-width:\d+px\)\{[^]*?\}(?=@|$)/g, '');
    assert.ok(
      !/body:has\(\.nx-burger/.test(outside),
      'scroll-lock must not leak outside the mobile media query',
    );
  });

  test('NO JavaScript is emitted for scroll-lock (zero-JS promise)', () => {
    const { html, css } = compile(`
      page / { nav burger { a "Home" href="/" } }
    `);
    // Hard constraint: the compiler must never emit <script> tags or inline handlers
    assert.ok(!/<script\b/i.test(html), 'no <script> tags allowed');
    assert.ok(!/\bon\w+\s*=/.test(html), 'no inline event handlers allowed');
    assert.ok(!/<script\b/i.test(css), 'no scripts in CSS output');
  });

  test('scroll-lock uses custom breakpoint when one is provided', () => {
    const { css } = compile(`
      theme { breakpoints { sm: 480px, md: 768px } }
      page / { nav burger=sm { a "Home" href="/" } }
    `);
    assert.match(
      css,
      /@media\(max-width:480px\)\{[^@]*html:has\(\.nx-burger-bp-480\[open\]\),body:has\(\.nx-burger-bp-480\[open\]\)\{overflow:hidden;overscroll-behavior:contain\}/,
    );
  });

  test('multiple burgers at different breakpoints each get their own lock rule', () => {
    const { css } = compile(`
      theme { breakpoints { sm: 480px, md: 768px } }
      page / {
        nav burger=sm { a "H" href="/" }
        nav burger=md { a "H" href="/" }
      }
    `);
    assert.match(css, /body:has\(\.nx-burger-bp-480\[open\]\)/);
    assert.match(css, /body:has\(\.nx-burger-bp-768\[open\]\)/);
  });
});
