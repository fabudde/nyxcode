import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

/**
 * v0.25.0 — Bug #115
 *
 * Multi-value CSS properties with multiple function calls on a single line
 * were incorrectly parsed. Two independent problems combined to break them:
 *
 *   1. Commas at paren-depth 0 were treated as property separators for
 *      shorthands like `bg`, `tf`, `shadow`, `bdf`, because the shorthand
 *      name wasn't in `COMMA_VALUE_PROPERTIES`. So
 *        `bg radial-gradient(...), radial-gradient(...)`
 *      emitted the second gradient as its own (bogus) property declaration.
 *   2. Inside parens the parser glued consecutive identifier/number tokens
 *      together with no separator, so `radial-gradient(ellipse at 15% 10%, ...)`
 *      came out as `radial-gradient(ellipseat15%10%, ...)` — still a valid
 *      CSS function name but meaningless to browsers.
 *
 * Both are fixed; this suite locks the behaviour down.
 */

function compile(src: string): { html: string; css: string } {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast);
}

function combined(src: string): string {
  const { html, css } = compile(src);
  return html + '\n' + css;
}

describe('v0.25.0 — #115: Multi-value CSS functions', () => {
  test('two radial-gradients as bg value are preserved as one declaration', () => {
    const out = combined(`
page / {
  div {
    style {
      bg radial-gradient(ellipse at 15% 10%, rgba(232,121,168,0.1) 0%, transparent 50%), radial-gradient(ellipse at 85% 20%, rgba(103,232,249,0.06) 0%, transparent 50%)
    }
  }
}
`);
    // Both gradients present on the same `background:` line.
    assert.match(
      out,
      /background:\s*radial-gradient\(ellipse at 15% 10%, rgba\(232, 121, 168, 0\.1\) 0%, transparent 50%\),\s*radial-gradient\(ellipse at 85% 20%, rgba\(103, 232, 249, 0\.06\) 0%, transparent 50%\);/,
    );
    // No stray `radial-gradient:` property emission (the old bug).
    assert.ok(
      !/\bradial-gradient\s*:/.test(out),
      'radial-gradient must never appear as a CSS property name',
    );
  });

  test('multiple box-shadows with rgba are preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      shadow 0 2px 4px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.05)
    }
  }
}
`);
    assert.match(
      out,
      /box-shadow:\s*0 2px 4px rgba\(0, 0, 0, 0\.1\),\s*0 4px 8px rgba\(0, 0, 0, 0\.05\);/,
    );
  });

  test('multiple transforms on one line are preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      transform translate(-50%, -50%) rotate(45deg)
    }
  }
}
`);
    assert.match(out, /transform:\s*translate\(-50%, -50%\) rotate\(45deg\);/);
  });

  test('tf shorthand with multiple transforms is preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      tf translate(-50%, -50%) rotate(45deg) scale(1.1)
    }
  }
}
`);
    assert.match(
      out,
      /transform:\s*translate\(-50%, -50%\) rotate\(45deg\) scale\(1\.1\);/,
    );
  });

  test('single gradient (no comma outside parens) still works', () => {
    const out = combined(`
page / {
  div {
    style {
      bg linear-gradient(to right, #fff, #000)
    }
  }
}
`);
    assert.match(out, /background:\s*linear-gradient\(to right, #fff, #000\);/);
  });

  test('three stacked gradients in bg are all preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      bg linear-gradient(0deg, #111, #222), linear-gradient(90deg, #333, #444), radial-gradient(circle, #555, #666)
    }
  }
}
`);
    assert.match(
      out,
      /background:\s*linear-gradient\(0deg, #111, #222\),\s*linear-gradient\(90deg, #333, #444\),\s*radial-gradient\(circle, #555, #666\);/,
    );
  });

  test('filter with multiple functions is preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      filter blur(4px) brightness(0.8)
    }
  }
}
`);
    assert.match(out, /filter:\s*blur\(4px\) brightness\(0\.8\);/);
  });

  test('fi shorthand with multiple filter functions is preserved', () => {
    const out = combined(`
page / {
  div {
    style {
      fi blur(4px) brightness(0.8) saturate(1.2)
    }
  }
}
`);
    assert.match(out, /filter:\s*blur\(4px\) brightness\(0\.8\) saturate\(1\.2\);/);
  });

  test('bdf shorthand with function value still pairs with bg comma-separator', () => {
    // Regression guard for the #104 behaviour (see v0243-property-merge):
    // on a single line, `bg rgba(...), bdf blur(...)` must still split into
    // two distinct declarations because `bdf` is a known CSS shorthand.
    const out = combined(`
page / {
  div {
    style { bg rgba(10, 10, 18, 0.7), bdf blur(20px) }
  }
}
`);
    assert.match(out, /background:\s*rgba\(10, 10, 18, 0\.7\)/);
    assert.match(out, /backdrop-filter:\s*blur\(20px\)/);
  });

  test('background-image with multiple gradients (full property name)', () => {
    const out = combined(`
page / {
  div {
    style {
      background-image linear-gradient(red, blue), linear-gradient(green, yellow)
    }
  }
}
`);
    assert.match(
      out,
      /background-image:\s*linear-gradient\(red, blue\),\s*linear-gradient\(green, yellow\);/,
    );
  });

  test('inside parens: identifier + number tokens get correct spacing', () => {
    // Direct regression for the `ellipseat15%10%` bug — identifiers and
    // numbers that appear as separate tokens inside a function call must
    // be joined with a single space, not glued together.
    const out = combined(`
page / {
  div {
    style {
      bg radial-gradient(ellipse at 50% 50%, #fff, #000)
    }
  }
}
`);
    assert.match(out, /radial-gradient\(ellipse at 50% 50%, #fff, #000\)/);
    assert.ok(!/ellipseat/.test(out), 'identifiers must not be glued together');
    assert.ok(!/50%50%/.test(out), 'adjacent numbers must keep a space');
  });

  test('unary minus inside function args still sticks to its value', () => {
    const out = combined(`
page / {
  div {
    style {
      tf translate(-50%, -25%)
    }
  }
}
`);
    // Must not become `translate( - 50%, - 25%)` — that's the binary-operator path.
    assert.match(out, /transform:\s*translate\(-50%, -25%\);/);
  });

  test('var(--custom-prop) inside value is not mangled', () => {
    // Regression guard for Bug #101 — the new paren-spacing logic must not
    // insert a space between `--` and the custom-property name.
    const out = combined(`
theme { colors { brand: #ff0 } }
page / {
  div {
    style {
      bg var(--colors-brand)
    }
  }
}
`);
    assert.match(out, /background:\s*var\(--colors-brand\);/);
    assert.ok(!/--\s+colors/.test(out));
  });

  test('calc() with binary minus still gets spaces around the operator', () => {
    const out = combined(`
page / {
  div {
    style {
      w calc(100% - 2rem)
    }
  }
}
`);
    assert.match(out, /width:\s*calc\(100% - 2rem\);/);
  });
});
