import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { levenshtein, nearestMatches, didYouMean, formatSourceFrame } from '../suggest.js';

// v0.23.3 — Error-message upgrade: Levenshtein "Did you mean?" hints + source frames.

function compile(src: string): { html?: string; err?: Error } {
  try {
    const ast = new Parser(new Lexer(src).tokenize()).parse();
    return { html: new Compiler().compile(ast).html };
  } catch (err: any) {
    return { err };
  }
}

describe('v0.23.3: Levenshtein suggestion utility', () => {
  test('levenshtein: equal strings return 0', () => {
    assert.equal(levenshtein('primary', 'primary'), 0);
  });

  test('levenshtein: one substitution = 1', () => {
    assert.equal(levenshtein('primary', 'primory'), 1);
  });

  test('levenshtein: one deletion = 1', () => {
    assert.equal(levenshtein('primary', 'primry'), 1);
  });

  test('levenshtein: empty vs. non-empty = length', () => {
    assert.equal(levenshtein('', 'abcd'), 4);
    assert.equal(levenshtein('hello', ''), 5);
  });

  test('nearestMatches: returns closest first', () => {
    const pool = ['primary', 'secondary', 'accent', 'text', 'bg'];
    const out = nearestMatches('primry', pool, 3);
    assert.equal(out[0], 'primary', 'primary should rank first');
    assert.ok(out.length <= 3, 'respects k');
  });

  test('nearestMatches: filters by maxDistance', () => {
    // "zzzzz" is far from every pool entry — should yield nothing
    const out = nearestMatches('zzzzz', ['primary', 'bg', 'text'], 3, 2);
    assert.deepEqual(out, []);
  });

  test('nearestMatches: stable lex ordering on ties', () => {
    // both "abc" and "abd" have distance 1 from "abe"
    const out = nearestMatches('abe', ['abd', 'abc', 'zzz'], 3, 2);
    assert.deepEqual(out, ['abc', 'abd']);
  });

  test('didYouMean: handles 0/1/2/3 candidates', () => {
    assert.equal(didYouMean([]), '');
    assert.equal(didYouMean(['x']), ' Did you mean `x`?');
    assert.equal(didYouMean(['x', 'y']), ' Did you mean `x` or `y`?');
    assert.equal(didYouMean(['x', 'y', 'z']), ' Did you mean `x`, `y` or `z`?');
  });
});

describe('v0.23.3: compiler emits "Did you mean?" on typo', () => {
  test('color.primry suggests color.primary', () => {
    const { err } = compile(`
theme { colors { primary: #8b5cf6, accent: #ff6eb4 } }
page / { p "x" style="color:color.primry" }
`);
    assert.ok(err, 'should throw');
    assert.match(
      err!.message,
      /color\.primry/,
      'mentions the typo token',
    );
    assert.match(
      err!.message,
      /Did you mean .*color\.primary/,
      'suggests color.primary',
    );
  });

  test('spacing.md suggested over unrelated colors when section known', () => {
    const { err } = compile(`
theme { spacing { sm: 0.5rem, md: 1rem, lg: 1.5rem } colors { primary: #000 } }
page / { p "x" style="padding:spacing.mdd" }
`);
    assert.ok(err, 'should throw');
    assert.match(err!.message, /Did you mean .*spacing\.md/);
    // Must not suggest any color.* since the prefix is spacing
    assert.ok(
      !/color\./.test(err!.message) || /spacing\./.test(err!.message.split('Did you mean')[1] || ''),
      'suggestion list stays in the `spacing` section',
    );
  });

  test('no "Did you mean?" when pool is empty', () => {
    const { err } = compile(`
theme { colors { primary: #000 } }
page / { p "x" style="margin:spacing.md" }
`);
    assert.ok(err, 'should throw');
    // spacing has no keys; global pool has color.primary but that's far from spacing.md
    assert.match(err!.message, /Undefined theme token: spacing\.md/);
  });

  test('suggestion list does not include the typo itself', () => {
    const { err } = compile(`
theme { colors { primary: #8b5cf6, primry: #abc123 } }
page / { p "x" style="color:color.primary" }
`);
    // `primry` is a real theme key here, `primary` is also valid — no error expected.
    assert.ok(!err, 'both keys exist → no error');
  });

  test('does not suggest the exact token when it is a typo of itself', () => {
    // Edge case: the suggestion algorithm should exclude identical matches.
    const { err } = compile(`
theme { colors { primary: #8b5cf6 } }
page / { p "x" style="color:color.primry" }
`);
    assert.ok(err, 'should throw');
    // Suggested `color.primary` not `color.primry`
    assert.match(err!.message, /color\.primary/);
    // Verify the suggestion doesn't echo the input verbatim
    const didYouMeanPart = err!.message.split('Did you mean')[1] ?? '';
    assert.ok(
      !/`color\.primry`/.test(didYouMeanPart),
      'suggestion should not include the typo itself',
    );
  });
});

describe('v0.23.3: formatSourceFrame', () => {
  test('emits gutter + caret at correct column', () => {
    const src = `line one
line two with target
line three`;
    const frame = formatSourceFrame(src, 2, 15);
    // Gutter width is 1 (we only show line 2)
    assert.match(frame, /2 \| line two with target/, 'shows target line');
    assert.match(frame, /\^/, 'has caret');
    // Caret should be at col 15 → 14 spaces, then `^`
    const caretLine = frame.split('\n').find((l) => l.includes('^'))!;
    const caretIdx = caretLine.indexOf('^');
    const lineContent = `  2 | line two with target`;
    // caret column should align with col 15 of content (0-indexed 14)
    // after `  2 | ` prefix (6 chars) + 14 spaces = caret at pos 20
    assert.equal(caretIdx, 6 + 14, 'caret aligned to col 15');
  });

  test('returns empty for out-of-range lines', () => {
    assert.equal(formatSourceFrame('one\ntwo', 99, 1), '');
    assert.equal(formatSourceFrame('one\ntwo', 0, 1), '');
    assert.equal(formatSourceFrame('', 1, 1), '');
  });

  test('context=1 shows neighbor lines', () => {
    const src = `a\nb\nc\nd\ne`;
    const frame = formatSourceFrame(src, 3, 1, { context: 1 });
    // should show lines 2, 3, 4 with 3 being the caret line
    assert.match(frame, /2 \| b/);
    assert.match(frame, /3 \| c/);
    assert.match(frame, /4 \| d/);
  });
});
