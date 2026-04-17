import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

/**
 * v0.24.2 — Issue #97: Double title tag bug.
 *
 * Problem:
 *   Site-level `meta { title "..." }` and page-level `meta { title "..." }` both
 *   emitted their `<title>` into the final `<head>`. Browsers take the first one,
 *   so site-level silently wins and page overrides are ignored. Same bug applied
 *   to description, og:*, twitter:*, canonical — any singleton meta tag.
 *
 * Fix:
 *   At emission time, dedupe head injections by key. Since page-level Head nodes
 *   are appended AFTER globalHeadInjections in compile()/compileMultiFile(),
 *   "last wins" makes page-level override site-level naturally.
 *
 * These tests cover the observable behavior: single-file compile() and
 * multi-page compileMultiFile() both produce exactly ONE `<title>` per page,
 * and the content reflects the page override when present.
 */

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

function compileMulti(src: string): Array<{ path: string; html: string }> {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compileMultiFile(ast);
}

function countMatches(html: string, re: RegExp): number {
  const m = html.match(re);
  return m ? m.length : 0;
}

describe('v0.24.2: #97 site-level vs page-level meta merge', () => {
  test('page-level title overrides site-level title (single <title> tag)', () => {
    const src = `
meta { title "Site Title" }
page / {
  meta { title "Page Title" }
  h1 "Home"
}
`;
    const html = compile(src);
    // Exactly one <title> ... </title>
    assert.equal(countMatches(html, /<title>[^<]*<\/title>/g), 1,
      'exactly one <title> tag must be emitted');
    // And it must be the PAGE title, not the site one.
    assert.match(html, /<title>Page Title<\/title>/);
    assert.ok(!html.includes('<title>Site Title</title>'),
      'site-level title must not appear when page overrides it');
  });

  test('page without own title falls back to site-level title', () => {
    const src = `
meta { title "Site Title" }
page / {
  h1 "Home"
}
`;
    const html = compile(src);
    assert.equal(countMatches(html, /<title>[^<]*<\/title>/g), 1);
    assert.match(html, /<title>Site Title<\/title>/);
  });

  test('page-level og:title overrides site-level og:title', () => {
    const src = `
meta { og:title "Site OG" }
page / {
  meta { og:title "Page OG" }
  h1 "Home"
}
`;
    const html = compile(src);
    const ogCount = countMatches(html, /<meta\s+property="og:title"[^>]*>/g);
    assert.equal(ogCount, 1, 'exactly one og:title meta must be emitted');
    assert.match(html, /<meta\s+property="og:title"\s+content="Page OG">/);
    assert.ok(!html.includes('content="Site OG"'),
      'site-level og:title must not appear when page overrides it');
  });

  test('page-level description overrides site-level description', () => {
    const src = `
meta { description "Site desc" }
page / {
  meta { description "Page desc" }
  h1 "Home"
}
`;
    const html = compile(src);
    const descCount = countMatches(html, /<meta\s+name="description"[^>]*>/g);
    assert.equal(descCount, 1, 'exactly one description meta must be emitted');
    assert.match(html, /<meta\s+name="description"\s+content="Page desc">/);
    assert.ok(!html.includes('content="Site desc"'));
  });

  test('page-level canonical overrides site-level canonical', () => {
    const src = `
meta { canonical "https://example.com/" }
page /about/ {
  meta { canonical "https://example.com/about/" }
  h1 "About"
}
`;
    const html = compile(src);
    const canonCount = countMatches(html, /<link\s+rel="canonical"[^>]*>/g);
    assert.equal(canonCount, 1, 'exactly one canonical link must be emitted');
    assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/example\.com\/about\/">/);
  });

  test('page-level twitter:card overrides site-level', () => {
    const src = `
meta { twitter:card "summary" }
page / {
  meta { twitter:card "summary_large_image" }
  h1 "Home"
}
`;
    const html = compile(src);
    const twCount = countMatches(html, /<meta\s+name="twitter:card"[^>]*>/g);
    assert.equal(twCount, 1);
    assert.match(html, /content="summary_large_image"/);
    assert.ok(!html.includes('content="summary"'));
  });

  test('non-overridden site-level meta keys survive alongside page overrides', () => {
    const src = `
meta { title "Site" description "Site desc" og:image "https://x/a.png" }
page / {
  meta { title "Page" }
  h1 "Home"
}
`;
    const html = compile(src);
    // Page overrides title only.
    assert.match(html, /<title>Page<\/title>/);
    assert.equal(countMatches(html, /<title>[^<]*<\/title>/g), 1);
    // Site-level description + og:image stay.
    assert.match(html, /<meta\s+name="description"\s+content="Site desc">/);
    assert.match(html, /<meta\s+property="og:image"\s+content="https:\/\/x\/a\.png">/);
  });

  test('multi-page build: each page gets its own page-level title', () => {
    const src = `
meta { title "Default" description "Shared" }
page / {
  meta { title "Home" }
  h1 "Home"
}
page /about/ {
  meta { title "About" }
  h1 "About"
}
page /contact/ {
  h1 "Contact"
}
`;
    const pages = compileMulti(src);
    assert.equal(pages.length, 3);

    const home = pages.find(p => p.path === '/')!;
    const about = pages.find(p => p.path === '/about/')!;
    const contact = pages.find(p => p.path === '/contact/')!;

    // Each page has exactly one <title>.
    for (const p of pages) {
      assert.equal(countMatches(p.html, /<title>[^<]*<\/title>/g), 1,
        `page ${p.path} must have exactly one <title>`);
    }
    assert.match(home.html, /<title>Home<\/title>/);
    assert.match(about.html, /<title>About<\/title>/);
    // Page without its own title inherits site-level.
    assert.match(contact.html, /<title>Default<\/title>/);

    // Shared description survives on every page.
    for (const p of pages) {
      assert.match(p.html, /<meta\s+name="description"\s+content="Shared">/);
      assert.equal(countMatches(p.html, /<meta\s+name="description"[^>]*>/g), 1);
    }
  });

  test('theme <style> blocks survive dedup (non-keyed tags are not dropped)', () => {
    // Regression guard: the dedup logic must not touch <style> / <link rel="stylesheet">.
    const src = `
theme { colors { primary: #ff0000 } }
meta { title "Site" }
page / {
  meta { title "Page" }
  p "hi" { style { c color.primary } }
}
`;
    const html = compile(src);
    // Theme :root must still be there.
    assert.match(html, /:root\{[^}]*--colors-primary:\s*#ff0000[^}]*\}/);
    // And title dedup still works.
    assert.equal(countMatches(html, /<title>[^<]*<\/title>/g), 1);
    assert.match(html, /<title>Page<\/title>/);
  });
});
