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

// ---------------------------------------------------------------------------
// v0.23.5 — Figma import INPUT SANITIZATION (Issue #95)
//
// Security review by Tyto 🦉 on 2026-04-17. External token files are untrusted.
// Malicious values must be SKIPPED (with a warning), not silently passed through.
// ---------------------------------------------------------------------------

import {
  isValidColor,
  isValidDimension,
  isValidFontFamily,
  isValidShadow,
  isValidBorder,
} from '../figma-import.js';

describe('v0.23.5 SEC: color validation', () => {
  test('valid hex colors pass', () => {
    assert.ok(isValidColor('#fff'));
    assert.ok(isValidColor('#ffff'));
    assert.ok(isValidColor('#ff00aa'));
    assert.ok(isValidColor('#ff00aaff'));
  });

  test('valid rgb/rgba/hsl/hsla pass', () => {
    assert.ok(isValidColor('rgb(255, 0, 128)'));
    assert.ok(isValidColor('rgba(0,0,0,0.5)'));
    assert.ok(isValidColor('hsl(120, 100%, 50%)'));
    assert.ok(isValidColor('hsla(240, 50%, 50%, 0.8)'));
    assert.ok(isValidColor('rgb(255 0 128 / 0.5)'));
  });

  test('valid named colors pass', () => {
    assert.ok(isValidColor('red'));
    assert.ok(isValidColor('transparent'));
    assert.ok(isValidColor('currentColor'));
  });

  test('javascript: in color value is rejected', () => {
    assert.ok(!isValidColor('javascript:alert(1)'));
    assert.ok(!isValidColor('url(javascript:alert(1))'));
    assert.ok(!isValidColor('JavaScript:Alert(1)'));
  });

  test('url() in color value is rejected', () => {
    assert.ok(!isValidColor('url(http://evil.com/x.png)'));
    assert.ok(!isValidColor('url("/image.png")'));
  });

  test('expression() in color is rejected', () => {
    assert.ok(!isValidColor('expression(alert(1))'));
  });

  test('var() in color is rejected (forwarding bypass)', () => {
    assert.ok(!isValidColor('var(--evil)'));
  });

  test('data: URI in color is rejected', () => {
    assert.ok(!isValidColor('data:text/html,<script>alert(1)</script>'));
  });

  test('angle brackets / script tags in color rejected', () => {
    assert.ok(!isValidColor('<script>'));
    assert.ok(!isValidColor('#fff<script>'));
  });

  test('malformed rgb with letters in args rejected', () => {
    assert.ok(!isValidColor('rgb(alert, 0, 0)'));
    assert.ok(!isValidColor('rgb(calc(100), 0, 0)'));
  });

  test('end-to-end: javascript: in color token → skipped with warning', () => {
    const json = {
      color: {
        primary: { $value: 'url(javascript:alert(1))', $type: 'color' },
        safe: { $value: '#8b5cf6', $type: 'color' },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(stats.colors, 1, 'only the safe color survives');
    assert.ok(!/javascript/i.test(nyx), 'no javascript: leaks into output');
    assert.ok(!/url\(/i.test(nyx), 'no url() leaks into output');
    assert.ok(
      warnings.some((w) => /primary/.test(w) && /validation/.test(w)),
      'warning mentions the skipped token',
    );
    assert.match(nyx, /safe: #8b5cf6/);
  });
});

describe('v0.23.5 SEC: dimension validation', () => {
  test('valid numeric dimensions pass', () => {
    assert.ok(isValidDimension('16px'));
    assert.ok(isValidDimension('1rem'));
    assert.ok(isValidDimension('0.5em'));
    assert.ok(isValidDimension('100%'));
    assert.ok(isValidDimension('50vw'));
    assert.ok(isValidDimension('50vh'));
    assert.ok(isValidDimension('1ch'));
    assert.ok(isValidDimension('1lh'));
    assert.ok(isValidDimension('1cap'));
    assert.ok(isValidDimension('0'));
  });

  test('calc() in dimension is rejected', () => {
    assert.ok(!isValidDimension('calc(100% - 16px)'));
    assert.ok(!isValidDimension('calc(1rem + 2px)'));
  });

  test('expression() in dimension is rejected', () => {
    assert.ok(!isValidDimension('expression(document.body.clientWidth)'));
  });

  test('url() in dimension is rejected', () => {
    assert.ok(!isValidDimension('url(evil.png)'));
  });

  test('unknown units are rejected', () => {
    assert.ok(!isValidDimension('16pt'));  // pt not in allowlist
    assert.ok(!isValidDimension('16ex'));  // ex not in allowlist
    assert.ok(!isValidDimension('16foo'));
  });

  test('end-to-end: expression() in spacing → skipped with warning', () => {
    const json = {
      spacing: {
        bad: { $value: 'expression(alert(1))', $type: 'dimension' },
        md: { $value: '16px', $type: 'dimension' },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(stats.spacing, 1);
    assert.ok(!/expression/i.test(nyx));
    assert.ok(warnings.some((w) => /bad/.test(w) && /validation/.test(w)));
    assert.match(nyx, /md: 16px/);
  });

  test('end-to-end: calc() in radius → skipped with warning', () => {
    const json = {
      borderRadius: {
        sneaky: { $value: 'calc(100% - 4px)', $type: 'borderRadius' },
        lg: { $value: '12px', $type: 'borderRadius' },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(stats.radius, 1);
    assert.ok(!/calc/i.test(nyx));
    assert.ok(warnings.some((w) => /sneaky/.test(w)));
    assert.match(nyx, /lg: 12px/);
  });
});

describe('v0.23.5 SEC: font-family validation', () => {
  test('valid font stacks pass', () => {
    assert.ok(isValidFontFamily('Inter'));
    assert.ok(isValidFontFamily('"Helvetica Neue"'));
    assert.ok(isValidFontFamily('Inter, "Helvetica Neue", sans-serif'));
    assert.ok(isValidFontFamily('Playfair-Display'));
  });

  test('url() in font-family rejected', () => {
    assert.ok(!isValidFontFamily('url(http://evil/font.woff)'));
    assert.ok(!isValidFontFamily('Inter, url(evil)'));
  });

  test('javascript: in font-family rejected', () => {
    assert.ok(!isValidFontFamily('javascript:alert(1)'));
  });

  test('backslashes in font-family rejected', () => {
    assert.ok(!isValidFontFamily('Inter\\x41'));
    assert.ok(!isValidFontFamily('"\\022"'));
  });

  test('angle brackets in font-family rejected', () => {
    assert.ok(!isValidFontFamily('<script>'));
    assert.ok(!isValidFontFamily('Inter</style>'));
  });

  test('parens in font-family rejected', () => {
    assert.ok(!isValidFontFamily('Inter(evil)'));
  });

  test('end-to-end: url() in font-family → skipped with warning', () => {
    const json = {
      fontFamily: {
        injected: {
          $value: 'url(http://evil.com/x.woff)',
          $type: 'fontFamily',
        },
        body: { $value: 'Inter', $type: 'fontFamily' },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(stats.fonts, 1);
    assert.ok(!/url\(/i.test(nyx));
    assert.ok(!/evil/i.test(nyx));
    assert.ok(warnings.some((w) => /injected/.test(w)));
    assert.match(nyx, /body: Inter/);
  });
});

describe('v0.23.5 SEC: shadow validation', () => {
  test('valid shadow passes', () => {
    assert.ok(isValidShadow('0 4px 8px rgba(0,0,0,0.1)'));
    assert.ok(isValidShadow('0 2px 4px #000'));
    assert.ok(isValidShadow('inset 0 1px 2px #000'));
    assert.ok(isValidShadow('0 4px 8px 2px rgba(0,0,0,0.1)'));
  });

  test('shadow with url() rejected', () => {
    assert.ok(!isValidShadow('0 4px 8px url(evil)'));
  });

  test('shadow with javascript: rejected', () => {
    assert.ok(!isValidShadow('javascript:alert(1)'));
  });

  test('shadow with expression() rejected', () => {
    assert.ok(!isValidShadow('0 4px 8px expression(alert(1))'));
  });

  test('shadow with calc() in dimension rejected', () => {
    assert.ok(!isValidShadow('0 calc(4px+1px) 8px #000'));
  });

  test('end-to-end: shadow with injection → skipped', () => {
    const json = {
      shadow: {
        evil: { $value: 'javascript:alert(1)', $type: 'shadow' },
        md: {
          $value: { offsetX: 0, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.1)' },
          $type: 'shadow',
        },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(stats.shadows, 1);
    assert.ok(!/javascript/i.test(nyx));
    assert.ok(warnings.some((w) => /evil/.test(w)));
  });
});

describe('v0.23.5 SEC: border validation (helper)', () => {
  test('valid borders pass', () => {
    assert.ok(isValidBorder('1px solid #000'));
    assert.ok(isValidBorder('2px dashed red'));
  });

  test('border with url() rejected', () => {
    assert.ok(!isValidBorder('1px solid url(evil)'));
  });

  test('unknown border style rejected', () => {
    assert.ok(!isValidBorder('1px wobbly #000'));
  });
});

describe('v0.23.5 SEC: valid tokens still accepted (no false positives)', () => {
  test('realistic full import roundtrips cleanly', () => {
    const json = {
      color: {
        primary: { $value: '#8b5cf6', $type: 'color' },
        accent: { $value: 'rgba(236, 72, 153, 0.9)', $type: 'color' },
      },
      spacing: {
        md: { $value: '16px', $type: 'dimension' },
        lg: { $value: '2rem', $type: 'dimension' },
      },
      borderRadius: {
        md: { $value: '8px', $type: 'borderRadius' },
      },
      fontFamily: {
        body: {
          $value: ['Inter', 'Helvetica Neue', 'sans-serif'],
          $type: 'fontFamily',
        },
      },
      shadow: {
        card: {
          $value: { offsetX: 0, offsetY: 4, blur: 8, color: 'rgba(0,0,0,0.1)' },
          $type: 'shadow',
        },
      },
    };
    const { nyx, stats, warnings } = importFigmaTokens(json);
    assert.equal(
      warnings.length,
      0,
      `no warnings expected, got: ${warnings.join('; ')}`,
    );
    assert.equal(stats.colors, 2);
    assert.equal(stats.spacing, 2);
    assert.equal(stats.radius, 1);
    assert.equal(stats.fonts, 1);
    assert.equal(stats.shadows, 1);
    assert.match(nyx, /primary: #8b5cf6/);
    assert.match(nyx, /md: 16px/);
    assert.match(nyx, /body: Inter, "Helvetica Neue", sans-serif/);
  });
});
