/**
 * v0.53 — Nullish coalescing (`??`) and optional chaining (`?.`).
 *
 * Before v0.53 these JS-familiar operators only "worked" by accident inside
 * `${...}` interpolation (raw passthrough) but threw a parse error in real
 * expression contexts like `when`. Now they are first-class in the expression
 * grammar, so AI-generated code can rely on them everywhere.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { Lexer } from '../lexer.js';
import { TokenType } from '../tokens.js';

function tokenize(src: string) {
  return new Lexer(src).tokenize();
}
function parseAST(src: string) {
  return new Parser(tokenize(src)).parse();
}
function compile(src: string) {
  return new Compiler().compile(parseAST(src));
}
function tpl(html: string): string {
  const m = html.match(/data-nyx-tpl="([^"]*)"/);
  return m ? m[1] : '';
}

describe('v0.53: lexer tokens for ?? and ?.', () => {
  it('lexes ?? as a single QuestionQuestion token', () => {
    const toks = tokenize('a ?? b').filter((t) => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    assert.ok(toks.some((t) => t.type === TokenType.QuestionQuestion), 'should produce QuestionQuestion');
    assert.ok(!toks.some((t) => t.type === TokenType.Question), 'should not leave a bare Question');
  });

  it('lexes ?. as a single QuestionDot token', () => {
    const toks = tokenize('a?.b').filter((t) => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    assert.ok(toks.some((t) => t.type === TokenType.QuestionDot), 'should produce QuestionDot');
  });

  it('still lexes a ternary ? as a plain Question token', () => {
    const toks = tokenize('cond ? a : b').filter((t) => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    assert.ok(toks.some((t) => t.type === TokenType.Question), 'ternary ? must stay a Question');
    assert.ok(!toks.some((t) => t.type === TokenType.QuestionQuestion), 'ternary ? must not become ??');
    assert.ok(!toks.some((t) => t.type === TokenType.QuestionDot), 'ternary ? must not become ?.');
  });
});

describe('v0.53: parser support in real expression contexts', () => {
  it('?? parses to a BinaryExpression with operator "??" inside when', () => {
    const ast: any = parseAST('page "/" {\n  state n = 0\n  when n ?? 5 { div "x" }\n}');
    const when = ast.body[0].body.find((s: any) => s.type === 'When');
    assert.equal(when.condition.type, 'BinaryExpression');
    assert.equal(when.condition.operator, '??');
  });

  it('?. parses to a MemberExpression with optional: true', () => {
    const ast: any = parseAST('page "/" {\n  state u = 0\n  when u?.name { div "x" }\n}');
    const when = ast.body[0].body.find((s: any) => s.type === 'When');
    assert.equal(when.condition.type, 'MemberExpression');
    assert.equal(when.condition.optional, true);
  });

  it('a regular . stays a non-optional MemberExpression', () => {
    const ast: any = parseAST('page "/" {\n  state u = 0\n  when u.name { div "x" }\n}');
    const when = ast.body[0].body.find((s: any) => s.type === 'When');
    assert.equal(when.condition.type, 'MemberExpression');
    assert.ok(!when.condition.optional, 'plain . must not be optional');
  });

  it('?? no longer throws in when (regression vs pre-0.53 parse error)', () => {
    assert.doesNotThrow(() =>
      parseAST('page "/" {\n  state s = 0\n  when s ?? 0 { div "x" }\n}'),
    );
  });
});

describe('v0.53: compiler emits valid JS operators', () => {
  it('emits ?? in reactive interpolation', () => {
    const { html } = compile('page "/" {\n  state user = 0\n  p "${user ?? \'guest\'}"\n}');
    assert.ok(tpl(html).includes('??'), 'template should contain ?? operator');
    assert.ok(!html.includes('${user'), 'raw interpolation must be compiled away');
  });

  it('emits ?. in reactive interpolation', () => {
    const { html } = compile('page "/" {\n  state user = 0\n  p "${user?.name}"\n}');
    assert.ok(tpl(html).includes('?.'), 'template should contain ?. operator');
  });

  it('emits a combined u?.name ?? fallback', () => {
    const { html } = compile('page "/" {\n  state u = 0\n  p "${u?.name ?? \'anon\'}"\n}');
    const t = tpl(html);
    assert.ok(t.includes('?.') && t.includes('??'), 'should contain both operators');
  });

  it('generated ?? / ?. expressions are valid, evaluable JavaScript', () => {
    // Pull the template body and evaluate it against a fake state to prove the
    // emitted operators actually run (not just that the substring is present).
    const { html } = compile('page "/" {\n  state user = 0\n  p "${user?.name ?? \'anon\'}"\n}');
    const expr = tpl(html).replace(/^\{\{|\}\}$/g, '');
    const fn = new Function('state', `return (${expr});`);
    assert.equal(fn({ user: null }), 'anon');
    assert.equal(fn({ user: { name: 'Nyx' } }), 'Nyx');
  });
});
