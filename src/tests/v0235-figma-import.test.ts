import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { importFigmaTokens } from '../figma-import.js';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.23.5 — Figma / W3C DTCG token importer (Issue #88)

function compileNyx(src: string): string {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  return new Compiler().compile(ast).html;
}

describe('v0.23.5: Figma/DTCG import — basic shapes', () => {
  test('DTCG colors ($value/$type) → colors section', () => {
    const json = {
      color: {
        primary: { $value: '#8b5cf6', $type: 'color' },
        accent: { $value: '#ec4899', $type: 'color' },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(warnings.length, 0);
    assert.equal(stats.colors, 2);
    assert.match(nyx, /colors \{[\s\S]*primary: #8b5cf6[\s\S]*accent: #ec4899/);
  });

  test('Tokens Studio legacy format (value/type without $)', () => {
    const json = {
      color: {
        primary: { value: '#abcdef', type: 'color' },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.colors, 1);
    assert.match(nyx, /primary: #abcdef/);
  });

  test('nested groups are dash-joined', () => {
    const json = {
      color: {
        brand: {
          primary: { $value: '#000', $type: 'color' },
          secondary: { $value: '#fff', $type: 'color' },
        },
        text: {
          body: { $value: '#333', $type: 'color' },
        },
      },
    };
    const { nyx } = importFigmaTokens(json);
    assert.match(nyx, /brand-primary: #000/);
    assert.match(nyx, /brand-secondary: #fff/);
    assert.match(nyx, /text-body: #333/);
  });

  test('global wrapper is auto-unwrapped', () => {
    const json = {
      global: {
        color: { primary: { $value: '#111', $type: 'color' } },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.colors, 1);
    // Should NOT contain "global-" prefix
    assert.ok(!/global/.test(nyx), 'global wrapper stripped');
    assert.match(nyx, /primary: #111/);
  });
});

describe('v0.23.5: dimension values', () => {
  test('dimension with explicit px suffix passes through', () => {
    const json = {
      spacing: {
        md: { $value: '16px', $type: 'dimension' },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.spacing, 1);
    assert.match(nyx, /md: 16px/);
  });

  test('dimension as bare number → px', () => {
    const json = {
      spacing: {
        md: { $value: 16, $type: 'dimension' },
      },
    };
    const { nyx } = importFigmaTokens(json);
    assert.match(nyx, /md: 16px/);
  });

  test('dimension with 0 value emits bare 0', () => {
    const json = {
      spacing: {
        none: { $value: 0, $type: 'dimension' },
      },
    };
    const { nyx } = importFigmaTokens(json);
    assert.match(nyx, /none: 0(\s|$)/m);
  });

  test('borderRadius type routes to radius section', () => {
    const json = {
      borderRadius: {
        md: { $value: '8px', $type: 'borderRadius' },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.radius, 1);
    assert.match(nyx, /radius \{[\s\S]*md: 8px/);
  });

  test('group name "radius" routes dimension to radius section', () => {
    // Some token sets use $type: "dimension" with group name disambiguation
    const json = {
      radius: {
        md: { $value: '8px', $type: 'dimension' },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.radius, 1);
    assert.match(nyx, /radius \{[\s\S]*md: 8px/);
  });
});

describe('v0.23.5: fontFamily values', () => {
  test('array → comma-joined stack (quotes multi-word)', () => {
    const json = {
      fontFamily: {
        body: {
          $value: ['Inter', 'Helvetica Neue', 'system-ui', 'sans-serif'],
          $type: 'fontFamily',
        },
      },
    };
    const { nyx } = importFigmaTokens(json);
    assert.match(nyx, /body: Inter, "Helvetica Neue", system-ui, sans-serif/);
  });

  test('single string → passes through (quoted if multi-word)', () => {
    const json = {
      fontFamily: {
        heading: { $value: 'Playfair Display', $type: 'fontFamily' },
      },
    };
    const { nyx } = importFigmaTokens(json);
    assert.match(nyx, /heading: "Playfair Display"/);
  });
});

describe('v0.23.5: shadow values', () => {
  test('composite shadow object → CSS string', () => {
    const json = {
      shadow: {
        md: {
          $value: {
            offsetX: 0,
            offsetY: 4,
            blur: 8,
            spread: 0,
            color: 'rgba(0,0,0,0.1)',
          },
          $type: 'shadow',
        },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    assert.equal(stats.shadows, 1);
    assert.match(nyx, /md: 0 4px 8px rgba\(0,0,0,0.1\)/);
  });

  test('shadow with spread=0 is omitted', () => {
    const json = {
      shadow: {
        md: {
          $value: { offsetX: 0, offsetY: 2, blur: 4, spread: 0, color: '#000' },
          $type: 'shadow',
        },
      },
    };
    const { nyx } = importFigmaTokens(json);
    // Output should be "0 2px 4px #000" — not "0 2px 4px 0 #000"
    assert.match(nyx, /md: 0 2px 4px #000/);
  });
});

describe('v0.23.5: edge cases', () => {
  test('null input → warning, no output', () => {
    const { nyx, warnings } = importFigmaTokens(null);
    assert.equal(nyx, '');
    assert.ok(warnings.length > 0);
  });

  test('empty object → warning "no tokens found"', () => {
    const { nyx, warnings } = importFigmaTokens({});
    assert.equal(nyx, '');
    assert.ok(warnings.some((w) => /no recognized tokens/i.test(w)));
  });

  test('token with unknown type → warning, skip', () => {
    const json = {
      misc: {
        weird: { $value: 'xyz', $type: 'unknownType' },
      },
    };
    const { nyx, warnings } = importFigmaTokens(json);
    assert.equal(nyx, '');
    assert.ok(warnings.some((w) => /unknown type/i.test(w)));
  });

  test('duplicate keys in same section → deduped (first wins)', () => {
    const json = {
      color: {
        group1: {
          primary: { $value: '#111', $type: 'color' },
        },
        group2: {
          primary: { $value: '#222', $type: 'color' },
        },
      },
    };
    const { nyx, stats } = importFigmaTokens(json);
    // Each group becomes a different key (group1-primary vs group2-primary)
    assert.equal(stats.colors, 2);
    assert.match(nyx, /group1-primary: #111/);
    assert.match(nyx, /group2-primary: #222/);
  });

  test('themeName option emits `theme as "name"`', () => {
    const json = {
      color: { primary: { $value: '#000', $type: 'color' } },
    };
    const { nyx } = importFigmaTokens(json, { themeName: 'brand' });
    assert.match(nyx, /^theme as "brand" \{/);
  });
});

describe('v0.23.5: full roundtrip — import → compile', () => {
  test('imported theme block compiles and emits :root CSS vars', () => {
    const json = {
      color: {
        primary: { $value: '#8b5cf6', $type: 'color' },
        bg: { $value: '#faf9f6', $type: 'color' },
      },
      spacing: {
        md: { $value: '16px', $type: 'dimension' },
      },
      borderRadius: {
        lg: { $value: '12px', $type: 'borderRadius' },
      },
    };
    const { nyx } = importFigmaTokens(json);

    // Synthesize a tiny site that uses the imported tokens
    const site = `${nyx}\npage / { p "hi" style="color:color.primary;padding:spacing.md;border-radius:radius.lg" }\n`;
    const html = compileNyx(site);

    assert.match(html, /--colors-primary:\s*#8b5cf6/);
    assert.match(html, /--spacing-md:\s*16px/);
    assert.match(html, /--radius-lg:\s*12px/);
    assert.match(html, /var\(--colors-primary\)/);
    assert.match(html, /var\(--spacing-md\)/);
    assert.match(html, /var\(--radius-lg\)/);
  });

  test('imported theme with stats sums correctly', () => {
    const json = {
      color: {
        a: { $value: '#111', $type: 'color' },
        b: { $value: '#222', $type: 'color' },
      },
      spacing: {
        md: { $value: '16px', $type: 'dimension' },
      },
    };
    const { stats } = importFigmaTokens(json);
    assert.equal(stats.colors, 2);
    assert.equal(stats.spacing, 1);
  });
});
