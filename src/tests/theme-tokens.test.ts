/**
 * Theme dot-notation token resolution tests.
 * Covers: color.X, spacing.X, radius.X, shadow.X
 * Plus backward compat (bare "primary") and hard errors on typos.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../index.js';
import { Compiler } from '../compiler.js';

/**
 * Helper: compile a .nyx source and return { html, css, js }.
 */
function compile(source: string) {
  const ast = parse(source);
  const compiler = new Compiler({ pretty: true });
  return compiler.compile(ast);
}

describe('theme dot-notation token resolution', () => {

  it('color.primary in a color property resolves to var(--colors-primary)', () => {
    const out = compile(`
      theme {
        colors {
          primary #ff0000
          accent #00ff00
        }
      }
      page / {
        p "Hello" style="color: color.primary;"
      }
    `);
    assert.match(out.html, /var\(--colors-primary\)/,
      'Expected color.primary to resolve to var(--colors-primary)');
  });

  it('spacing.md in padding property resolves to var(--spacing-md)', () => {
    const out = compile(`
      theme {
        spacing {
          md 16px
          lg 24px
        }
      }
      page / {
        div "box" {
          style {
            padding spacing.md
          }
        }
      }
    `);
    assert.match(out.html, /var\(--spacing-md\)/,
      'Expected spacing.md to resolve to var(--spacing-md)');
  });

  it('radius.lg in border-radius resolves to var(--radius-lg)', () => {
    const out = compile(`
      theme {
        radius {
          lg 12px
          sm 4px
        }
      }
      page / {
        div "box" {
          style {
            border-radius radius.lg
          }
        }
      }
    `);
    assert.match(out.html, /var\(--radius-lg\)/,
      'Expected radius.lg to resolve to var(--radius-lg)');
  });

  it('shadow.glow in box-shadow resolves to var(--shadows-glow)', () => {
    const out = compile(`
      theme {
        shadows {
          glow 0 0 10px #ff0
        }
      }
      page / {
        div "card" {
          style {
            box-shadow shadow.glow
          }
        }
      }
    `);
    assert.match(out.html, /var\(--shadows-glow\)/,
      'Expected shadow.glow to resolve to var(--shadows-glow)');
  });

  it('color.primry (typo) throws compile error with Undefined theme token', () => {
    assert.throws(
      () => compile(`
        theme {
          colors {
            primary #ff0000
            accent #00ff00
          }
        }
        page / {
          p "Hello" style="color: color.primry;"
        }
      `),
      (err: Error) => {
        assert.match(err.message, /Undefined theme token.*color\.primry/,
          'Error should mention the undefined token');
        return true;
      },
    );
  });

  it('backward compat: bare "primary" (no dot) in color prop still works', () => {
    const out = compile(`
      theme {
        colors {
          primary #ff0000
        }
      }
      page / {
        p "Hello" style="color: primary;"
      }
    `);
    assert.match(out.html, /var\(--colors-primary\)/,
      'Expected bare "primary" to still resolve via backward-compat path');
  });

});
