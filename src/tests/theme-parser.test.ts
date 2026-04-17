/**
 * Theme dot-notation: end-to-end parser tests.
 *
 * These compile full .nyx source through Lexer -> Parser -> Compiler
 * and verify the resulting CSS contains correct var(--...) references.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../index.js';
import { Compiler } from '../compiler.js';

function compile(source: string) {
  const ast = parse(source);
  const compiler = new Compiler({ pretty: true });
  return compiler.compile(ast);
}

const THEME_BLOCK = `
  theme {
    colors {
      primary #00E5FF
      surface #1a1a1a
    }
    spacing {
      md 16px
      lg 24px
    }
    radius {
      lg 16px
    }
    shadows {
      glow 0 0 10px #0ff
    }
  }
`;

describe('theme dot-notation in style blocks (end-to-end)', () => {

  it('color.primary resolves to var(--colors-primary) in style block', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style { color color.primary }
        p "Hello"
      }
    `);
    assert.match(out.html, /color:\s*var\(--colors-primary\)/,
      'color.primary should become var(--colors-primary)');
    assert.doesNotMatch(out.html, /color:\s*\.\s*var/,
      'Should NOT have stray dot before var()');
  });

  it('color.primary with colon syntax resolves correctly', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style { color: color.primary }
        p "Hello"
      }
    `);
    assert.match(out.html, /color:\s*var\(--colors-primary\)/,
      'color: color.primary should become var(--colors-primary)');
    assert.doesNotMatch(out.html, /color:\s*:/,
      'Should NOT have stray colon in value');
  });

  it('spacing.md and spacing.lg in padding resolve correctly', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style { padding spacing.md spacing.lg }
        div "box"
      }
    `);
    assert.match(out.html, /var\(--spacing-md\)/);
    assert.match(out.html, /var\(--spacing-lg\)/);
  });

  it('radius.lg in border-radius resolves correctly', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style { border-radius radius.lg }
        div "box"
      }
    `);
    assert.match(out.html, /var\(--radius-lg\)/);
  });

  it('shadow.glow in box-shadow resolves correctly', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style { box-shadow shadow.glow }
        div "card"
      }
    `);
    assert.match(out.html, /var\(--shadows-glow\)/);
  });

  it('multiple dot-notation tokens on different properties', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style {
          color color.primary
          background color.surface
          padding spacing.md spacing.lg
          border-radius radius.lg
          box-shadow shadow.glow
        }
        h1 "Full test"
      }
    `);
    assert.match(out.html, /color:\s*var\(--colors-primary\)/);
    assert.match(out.html, /background:\s*var\(--colors-surface\)/);
    assert.match(out.html, /padding:\s*var\(--spacing-md\)\s+var\(--spacing-lg\)/);
    assert.match(out.html, /border-radius:\s*var\(--radius-lg\)/);
    assert.match(out.html, /box-shadow:\s*var\(--shadows-glow\)/);
  });

  it('multiple dot-notation tokens with colon syntax', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style {
          color: color.primary
          background: color.surface
          padding: spacing.md spacing.lg
          border-radius: radius.lg
          box-shadow: shadow.glow
        }
        h1 "Full test with colons"
      }
    `);
    assert.match(out.html, /color:\s*var\(--colors-primary\)/);
    assert.match(out.html, /background:\s*var\(--colors-surface\)/);
    assert.match(out.html, /padding:\s*var\(--spacing-md\)\s+var\(--spacing-lg\)/);
    assert.match(out.html, /border-radius:\s*var\(--radius-lg\)/);
    assert.match(out.html, /box-shadow:\s*var\(--shadows-glow\)/);
  });

  it('no duplicate properties from dot-notation parsing', () => {
    const out = compile(`
      ${THEME_BLOCK}
      page / {
        style {
          color color.primary
          background color.surface
        }
        p "No duplicates"
      }
    `);
    // Extract the second <style> block (scoped page CSS, not :root vars)
    const styleBlocks = out.html.match(/<style>[\s\S]*?<\/style>/g) || [];
    const scopedStyle = styleBlocks.length >= 2 ? styleBlocks[1] : '';
    const colorMatches = scopedStyle.match(/\bcolor:/g) || [];
    assert.equal(colorMatches.length, 1,
      'Expected exactly 1 color: in scoped CSS, got ' + colorMatches.length);
  });

  it('theme block with optional colons parses correctly', () => {
    const out = compile(`
      theme {
        colors {
          primary: #ff0000
          accent: #00ff00
        }
      }
      page / {
        style { color color.primary }
        p "Colons in theme"
      }
    `);
    assert.match(out.html, /--colors-primary:\s*#ff0000/,
      'Theme entry with optional colon should parse correctly');
    assert.match(out.html, /var\(--colors-primary\)/);
  });

});

// ===== Phase 3: Dark Mode, Google Fonts, Named Breakpoints =====

describe('dark mode via theme dark { ... }', () => {

  it('theme dark { colors { primary: ... } } emits prefers-color-scheme + data-theme selector', () => {
    const out = compile(`
      theme {
        colors { primary: #0066ff; bg: #ffffff }
      }
      theme dark {
        colors { primary: #4da6ff; bg: #0a0a0a }
      }
      page / {
        p "Hello"
      }
    `);
    // Light theme :root
    assert.match(out.html, /--colors-primary:\s*#0066ff/,
      'Light theme should have --colors-primary: #0066ff');
    // Dark mode via media query
    assert.match(out.html, /@media\(prefers-color-scheme:dark\)\{:root\{/,
      'Should emit @media (prefers-color-scheme: dark)');
    assert.match(out.html, /prefers-color-scheme:dark[^}]*--colors-primary:\s*#4da6ff/,
      'Dark media query should have --colors-primary: #4da6ff');
    // Dark mode via data-theme attribute
    assert.match(out.html, /\[data-theme="dark"\]\{/,
      'Should emit [data-theme="dark"] selector');
    assert.match(out.html, /\[data-theme="dark"\][^}]*--colors-bg:\s*#0a0a0a/,
      '[data-theme="dark"] should override --colors-bg');
  });

});

describe('Google Fonts auto-injection', () => {

  it('font with source: google injects 3 link tags', () => {
    const out = compile(`
      theme {
        fonts {
          heading: Inter, source: google
          body: "Open Sans", source: google
        }
      }
      page / {
        p "Hello"
      }
    `);
    assert.match(out.html, /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/,
      'Should inject preconnect to fonts.googleapis.com');
    assert.match(out.html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/,
      'Should inject preconnect to fonts.gstatic.com');
    assert.match(out.html, /<link rel="stylesheet" crossorigin="anonymous" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter&family=Open\+Sans&display=swap">/,
      'Should inject stylesheet link with both font families');
  });

  it('font with source: url throws security error', () => {
    assert.throws(
      () => compile(`
        theme {
          fonts {
            heading: Inter, source: url "https://evil.com/font.woff2"
          }
        }
        page / {
          p "Hello"
        }
      `),
      (err: Error) => {
        assert.match(err.message, /External URL font sources are deprecated for security/,
          'Error should mention deprecated third-party URL sources');
        return true;
      },
    );
  });

});

describe('named breakpoints from theme', () => {

  it('breakpoints { sm: 600px } rebinds @mobile to max-width: 600px', () => {
    const out = compile(`
      theme {
        colors { primary: #000 }
        breakpoints { sm: 600px; lg: 1024px }
      }
      page / {
        style {
          color: color.primary
          @mobile { padding: 8px }
        }
        p "Hello"
      }
    `);
    assert.match(out.html, /@media \(max-width: 600px\)/,
      '@mobile should use user-defined breakpoints.sm (600px)');
    assert.doesNotMatch(out.html, /@media \(max-width: 768px\)/,
      'Should NOT use default 768px when user defines breakpoints.sm');
  });

  it('@mobile without user breakpoints defaults to 768px', () => {
    const out = compile(`
      theme {
        colors { primary: #000 }
      }
      page / {
        style {
          color: color.primary
          @mobile { padding: 8px }
        }
        p "Hello"
      }
    `);
    assert.match(out.html, /@media \(max-width: 768px\)/,
      '@mobile should default to 768px without user breakpoints');
  });

});
