import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { Validator } from '../validator.js';

// Issue #116: Native <picture> and <source> for responsive images.
//
// <picture> is a container element that wraps multiple <source> elements
// and a fallback <img>. <source> is a void element (self-closing, no
// closing tag). This enables art direction and modern format fallbacks
// (AVIF → WebP → JPEG).

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

function validateSrc(src: string) {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  return new Validator().validate(ast);
}

describe('Issue #116: native <picture>/<source> for responsive images', () => {
  test('basic: picture with source + img renders correctly', () => {
    const src = `
page / {
  picture {
    source srcset="hero.avif" type="image/avif"
    source srcset="hero.webp" type="image/webp"
    img src="hero.jpg" alt="Hero"
  }
}
`;
    const { html } = compile(src);
    assert.match(html, /<picture>/);
    assert.match(html, /<\/picture>/);
    assert.match(html, /<source srcset="hero\.avif" type="image\/avif"\s*\/?>/);
    assert.match(html, /<source srcset="hero\.webp" type="image\/webp"\s*\/?>/);
    assert.match(html, /<img[^>]+src="hero\.jpg"[^>]+alt="Hero"/);
  });

  test('source is void: no </source> closing tag', () => {
    const src = `
page / {
  picture {
    source srcset="x.webp" type="image/webp"
    img src="x.jpg" alt="x"
  }
}
`;
    const { html } = compile(src);
    assert.doesNotMatch(html, /<\/source>/);
  });

  test('multiple sources with different types (avif, webp, jpg fallback)', () => {
    const src = `
page / {
  picture {
    source srcset="photo.avif" type="image/avif"
    source srcset="photo.webp" type="image/webp"
    source srcset="photo.jpg" type="image/jpeg"
    img src="photo.jpg" alt="Photo"
  }
}
`;
    const { html } = compile(src);
    // Order matters for <picture>: browser picks first supported
    const avifIdx = html.indexOf('photo.avif');
    const webpIdx = html.indexOf('photo.webp');
    const jpegIdx = html.indexOf('image/jpeg');
    assert.ok(avifIdx > -1 && webpIdx > -1 && jpegIdx > -1, 'all sources present');
    assert.ok(avifIdx < webpIdx && webpIdx < jpegIdx, 'sources in declaration order');
  });

  test('source with media query for art direction', () => {
    const src = `
page / {
  picture {
    source srcset="wide.jpg" media="(min-width: 800px)"
    source srcset="narrow.jpg" media="(max-width: 799px)"
    img src="default.jpg" alt="Responsive"
  }
}
`;
    const { html } = compile(src);
    assert.match(html, /srcset="wide\.jpg"[^>]*media="\(min-width: 800px\)"/);
    assert.match(html, /srcset="narrow\.jpg"[^>]*media="\(max-width: 799px\)"/);
  });

  test('source with srcset containing commas (multiple sizes)', () => {
    const src = `
page / {
  picture {
    source srcset="img-480.jpg 480w, img-800.jpg 800w, img-1200.jpg 1200w" sizes="(max-width: 600px) 480px, 800px"
    img src="img-800.jpg" alt="Responsive"
  }
}
`;
    const { html } = compile(src);
    assert.match(html, /srcset="img-480\.jpg 480w, img-800\.jpg 800w, img-1200\.jpg 1200w"/);
    assert.match(html, /sizes="\(max-width: 600px\) 480px, 800px"/);
  });

  test('picture inside a section/container still works', () => {
    const src = `
page / {
  section {
    picture {
      source srcset="h.webp" type="image/webp"
      img src="h.jpg" alt="h"
    }
  }
}
`;
    const { html } = compile(src);
    assert.match(html, /<section[^>]*>[\s\S]*<picture>[\s\S]*<\/picture>[\s\S]*<\/section>/);
  });

  test('regression: img without picture wrapper still works', () => {
    const src = `
page / {
  img src="alone.jpg" alt="alone"
}
`;
    const { html } = compile(src);
    assert.match(html, /<img[^>]+src="alone\.jpg"[^>]+alt="alone"/);
    assert.doesNotMatch(html, /<picture>/);
  });

  test('validator: picture is not flagged as unknown tag', () => {
    const src = `
page / {
  picture {
    source srcset="x.webp" type="image/webp"
    img src="x.jpg" alt="x"
  }
}
`;
    const errors = validateSrc(src);
    const unknown = errors.filter(e => /Unknown tag "picture"/.test(e.message));
    assert.equal(unknown.length, 0, 'picture should be a known tag');
  });

  test('validator: source is not flagged as unknown tag', () => {
    const src = `
page / {
  picture {
    source srcset="x.webp" type="image/webp"
    img src="x.jpg" alt="x"
  }
}
`;
    const errors = validateSrc(src);
    const unknown = errors.filter(e => /Unknown tag "source"/.test(e.message));
    assert.equal(unknown.length, 0, 'source should be a known tag');
  });

  test('empty picture { img ... } works (no sources, just fallback)', () => {
    const src = `
page / {
  picture {
    img src="x.jpg" alt="x"
  }
}
`;
    const { html } = compile(src);
    assert.match(html, /<picture>\s*<img[^>]+src="x\.jpg"[^>]*\/?>\s*<\/picture>/);
  });
});
