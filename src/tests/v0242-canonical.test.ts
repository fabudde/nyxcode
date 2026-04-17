import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * v0.24.2 — Canonical URL hardcoding fix (Issue #99)
 *
 * Bug: compiler hardcoded `https://nyxcode.io${pagePath}` as a fallback
 * `<link rel="canonical">` for every built page. Sister sites like
 * mindsmatter.now inherited canonicals pointing at nyxcode.io → 404.
 *
 * Fix:
 *   - If user provides `meta { canonical "…" }` → emit that value.
 *   - If user does NOT provide a canonical → emit nothing (search engines
 *     assume the current URL).
 *   - "nyxcode.io" must NEVER be a hardcoded default in built output.
 */

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

describe('v0.24.2: canonical URL is not hardcoded (Issue #99)', () => {
  test('no canonical in meta → no <link rel="canonical"> is emitted', () => {
    const { html } = compile(`
      page / {
        h1 "Hello"
      }
    `);
    assert.doesNotMatch(html, /<link[^>]+rel=["']canonical["']/i,
      'Expected no canonical tag when meta{canonical} is absent');
  });

  test('no canonical in meta → nyxcode.io does NOT appear as canonical target', () => {
    const { html } = compile(`
      page / {
        h1 "Hello"
      }
    `);
    assert.doesNotMatch(html, /href=["'][^"']*nyxcode\.io[^"']*["'][^>]*rel=["']canonical["']/i);
    assert.doesNotMatch(html, /rel=["']canonical["'][^>]*href=["'][^"']*nyxcode\.io/i);
  });

  test('no canonical in meta, multi-page → no canonical fallback on any page', () => {
    const { html } = compile(`
      page / {
        h1 "Home"
      }
      page /about {
        h1 "About"
      }
    `);
    assert.doesNotMatch(html, /<link[^>]+rel=["']canonical["']/i);
    assert.doesNotMatch(html, /nyxcode\.io/);
  });

  test('explicit canonical in meta → correct <link rel="canonical"> is emitted', () => {
    const { html } = compile(`
      meta {
        canonical "https://mindsmatter.now/"
      }
      page / {
        h1 "Hello"
      }
    `);
    assert.match(html, /<link rel="canonical" href="https:\/\/mindsmatter\.now\/">/);
    assert.doesNotMatch(html, /nyxcode\.io/);
  });

  test('explicit canonical propagates — not overwritten by default', () => {
    const { html } = compile(`
      meta {
        canonical "https://example.com/"
      }
      page / {
        h1 "Hello"
      }
    `);
    const matches = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/gi) || [];
    assert.equal(matches.length, 1, `Expected exactly one canonical tag, got ${matches.length}: ${matches.join(' | ')}`);
    assert.match(matches[0], /example\.com/);
    assert.doesNotMatch(matches[0], /nyxcode\.io/);
  });

  test('other meta (title, description) still emit without canonical fallback', () => {
    const { html } = compile(`
      meta {
        title "My Site"
        description "Not nyxcode.io"
      }
      page / {
        h1 "Hello"
      }
    `);
    assert.match(html, /<title>My Site<\/title>/);
    assert.match(html, /<meta name="description" content="Not nyxcode\.io">/);
    assert.doesNotMatch(html, /<link[^>]+rel=["']canonical["']/i);
  });
});

describe('v0.24.2: nyxcode.io never hardcoded in compiler source', () => {
  test('compiled dist/compiler.js contains no nyxcode.io canonical hardcode', () => {
    const compilerPath = join(process.cwd(), 'dist', 'compiler.js');
    let source = '';
    try {
      source = readFileSync(compilerPath, 'utf-8');
    } catch {
      return;
    }
    // The specific bug pattern: `rel="canonical" ... href="https://nyxcode.io`
    assert.doesNotMatch(source, /rel=\\?"canonical\\?"[^`]*href=\\?"https:\/\/nyxcode\.io/i,
      'Compiled compiler.js still contains a hardcoded nyxcode.io canonical URL');
  });
});
