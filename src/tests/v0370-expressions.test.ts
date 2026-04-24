import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { Lexer } from '../lexer.js';

function parseAST(src: string) {
  return new Parser(new Lexer(src).tokenize()).parse();
}

function compile(src: string): { html: string; css: string; js: string } {
  const ast = parseAST(src);
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css, js: out.js };
}

describe('v0.37: Expression engine', () => {
  describe('Arithmetic operators', () => {
    it('addition parses correctly', () => {
      const ast = parseAST('page "/" {\n  when .count + 1 > 0 {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.type, 'When');
      assert.equal(when.condition.type, 'BinaryExpression');
      assert.equal(when.condition.operator, '>');
      assert.equal(when.condition.left.type, 'BinaryExpression');
      assert.equal(when.condition.left.operator, '+');
    });
    it('multiplication parses correctly', () => {
      const ast = parseAST('page "/" {\n  when .price * .qty > 100 {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.left.operator, '*');
    });
    it('operator precedence: * before +', () => {
      const ast = parseAST('page "/" {\n  when .a + .b * .c > 0 {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      // Should be (a + (b * c)) > 0, not ((a + b) * c) > 0
      const addExpr = when.condition.left;
      assert.equal(addExpr.operator, '+');
      assert.equal(addExpr.right.operator, '*');
    });
  });

  describe('Logic operators', () => {
    it('and keyword parses', () => {
      const ast = parseAST('page "/" {\n  when .active and .visible {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.type, 'BinaryExpression');
      assert.equal(when.condition.operator, 'and');
    });
    it('or keyword parses', () => {
      const ast = parseAST('page "/" {\n  when .admin or .editor {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.operator, 'or');
    });
    it('not keyword parses', () => {
      const ast = parseAST('page "/" {\n  when not .hidden {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.type, 'UnaryExpression');
      assert.equal(when.condition.operator, '!');
    });
    it('and compiles to &&', () => {
      const { html } = compile('page "/" {\n  when .active and .visible {\n    div "yes"\n  }\n}');
      assert.ok(html.includes('&&'), 'and should compile to &&');
    });
  });

  describe('Member access', () => {
    it('dot access on identifier parses as MemberExpression', () => {
      const ast = parseAST('page "/" {\n  when user.active {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.type, 'MemberExpression');
      assert.equal(when.condition.object.name, 'user');
      assert.equal(when.condition.property, 'active');
    });
    it('chained dot access', () => {
      const ast = parseAST('page "/" {\n  when user.profile.name == "Nyx" {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      const left = when.condition.left;
      assert.equal(left.type, 'MemberExpression');
      assert.equal(left.property, 'name');
      assert.equal(left.object.type, 'MemberExpression');
      assert.equal(left.object.property, 'profile');
    });
  });

  describe('Pipe built-ins', () => {
    it('len parses as PipeExpression', () => {
      const ast = parseAST('page "/" {\n  when .items | len > 0 {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      // Should be: (items | len) > 0
      assert.equal(when.condition.type, 'BinaryExpression');
      assert.equal(when.condition.operator, '>');
      assert.equal(when.condition.left.type, 'PipeExpression');
      assert.equal(when.condition.left.builtin, 'len');
    });
    it('len compiles to .length', () => {
      const { html } = compile('page "/" {\n  when .items | len > 0 {\n    div "yes"\n  }\n}');
      assert.ok(html.includes('.length'), 'len should compile to .length');
    });
  });

  describe('Boolean literals', () => {
    it('true parses', () => {
      const ast = parseAST('page "/" {\n  when .active == true {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.right.type, 'BooleanLiteral');
      assert.equal(when.condition.right.value, true);
    });
    it('false parses', () => {
      const ast = parseAST('page "/" {\n  when .active == false {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      assert.equal(when.condition.right.type, 'BooleanLiteral');
      assert.equal(when.condition.right.value, false);
    });
  });

  describe('Array literals', () => {
    it('array parses', () => {
      const ast = parseAST('page "/" {\n  when [1, 2, 3] | len > 0 {\n    div "yes"\n  }\n}');
      const when = (ast as any).body[0].body[0];
      const pipe = when.condition.left;
      assert.equal(pipe.input.type, 'ArrayLiteral');
      assert.equal(pipe.input.elements.length, 3);
    });
  });

  describe('Token efficiency', () => {
    it('pipe filter+map is >=15% shorter than JS', () => {
      const nyxCode = 'items | filter price > 10 | map name';
      const jsCode = 'items.filter(x => x.price > 10).map(x => x.name)';
      const savings = ((jsCode.length - nyxCode.length) / jsCode.length * 100);
      assert.ok(savings >= 15, `Should save >=15%, got ${savings.toFixed(1)}%`);
    });
    it('pipe sort is >=15% shorter than JS', () => {
      const nyxCode = 'items | sort price desc';
      const jsCode = 'items.sort((a, b) => b.price - a.price)';
      const savings = ((jsCode.length - nyxCode.length) / jsCode.length * 100);
      assert.ok(savings >= 15, `Should save >=15%, got ${savings.toFixed(1)}%`);
    });
    it('and/or readability parity', () => {
      const nyxCode = 'active and visible or admin';
      const jsCode = 'active && visible || admin';
      assert.ok(nyxCode.length <= jsCode.length * 1.1, 'and/or should not be significantly longer');
    });
  });
});

describe('v0.37: Interpolation expression evaluation (#168-#171)', () => {
  it('#168: let variable arithmetic in ${} compiles to reactive template', () => {
    const { html } = compile('page "/" {\n  let a = 10\n  let b = 3\n  p "a + b = ${a + b}"\n}');
    assert.ok(html.includes('data-nyx-tpl'), 'should have reactive template');
    assert.ok(html.includes('state.a + state.b') || html.includes('state.a') , 'should reference state vars');
    assert.ok(!html.includes('${a + b}'), 'should NOT have raw ${} in output');
  });

  it('#169: ternary with let variables compiles', () => {
    const { html } = compile('page "/" {\n  let score = 85\n  p "Grade: ${score > 90 ? \'A\' : \'B\'}"\n}');
    assert.ok(html.includes('data-nyx-tpl'), 'should have reactive template');
    assert.ok(!html.includes("${score"), 'should NOT have raw ${} in output');
  });

  it('#170: pipe built-ins in ${} compile to JS methods', () => {
    const { html } = compile('page "/" {\n  let name = "nyx"\n  p "Upper: ${name | uppercase}"\n}');
    assert.ok(html.includes('data-nyx-tpl'), 'should have reactive template');
    assert.ok(html.includes('toUpperCase'), 'should compile uppercase pipe to toUpperCase');
    assert.ok(!html.includes('${name | uppercase}'), 'should NOT have raw pipe in output');
  });

  it('#171: let declarations do not leak as HTML attributes', () => {
    const { html } = compile('page "/" {\n  div {\n    let score = 85\n    let passed = 1\n    h2 "Test"\n    p "Score: ${score}"\n  }\n}');
    assert.ok(!html.includes('score="85"'), 'should NOT have score as HTML attribute');
    assert.ok(!html.includes('passed="1"'), 'should NOT have passed as HTML attribute');
    assert.ok(!html.includes('${let}'), 'should NOT have ${let} text');
  });

  it('const variables inline at compile time in expressions', () => {
    const { html } = compile('page "/" {\n  const pi = 3.14\n  const r = 5\n  p "Area: ${pi * r * r}"\n}');
    // Const vars should be evaluated at compile time
    assert.ok(html.includes('78.5'), 'should evaluate const expression at compile time');
  });
});

describe('v0.37: String literal pipe in interpolation (#170 final)', () => {
  it('string literal with uppercase pipe evaluates at compile time', () => {
    const { html } = compile('page "/" {\n  p "Upper: ${\'hello\' | uppercase}"\n}');
    assert.ok(html.includes('HELLO'), 'should evaluate to HELLO at compile time');
    assert.ok(!html.includes("uppercase"), 'should NOT contain raw pipe name');
  });
  it('string literal with lowercase pipe evaluates at compile time', () => {
    const { html } = compile('page "/" {\n  p "Lower: ${\'WORLD\' | lowercase}"\n}');
    assert.ok(html.includes('world'), 'should evaluate to world at compile time');
  });
});


describe('v0.37.4: #173 .field inside \${} in each template', () => {
  it('.field inside interpolation is rewritten to item.field', () => {
    const input = 'page "/" {\n  data team = get /api/team\n  each team -> div {\n    p .name\n    p "\${.commits} commits"\n    p "Role: \${.role} at \${.company}"\n  }\n}';
    const result = compile(input);
    // Direct .name -> item.name (already worked)
    assert.ok(result.html.includes("item.name") || result.js.includes("item.name"),
      "Direct .name should be rewritten");
    // \${.commits} -> \${item.commits} (this is the fix)
    assert.ok(result.js.includes("item.commits"),
      ".commits inside interpolation should be rewritten to item.commits");
    assert.ok(!result.js.includes("\${.commits}"),
      "Bare .commits should NOT appear in output");
    // Multiple in one string
    assert.ok(result.js.includes("item.role"),
      ".role inside interpolation should be rewritten");
    assert.ok(result.js.includes("item.company"),
      ".company inside interpolation should be rewritten");
  });
});

describe('v0.37.5: #178 each container display:contents', () => {
  it('each wrapper div has display:contents for grid/flex compatibility', () => {
    const input = 'page "/" {\n  data items = get /api/items\n  div grid=4 {\n    each items -> div {\n      p .name\n    }\n  }\n}';
    const result = compile(input);
    assert.ok(result.html.includes('display:contents'),
      'each wrapper should have display:contents');
  });
});

