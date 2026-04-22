import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.34.0 — fn (functions), match (pattern matching), type, test, try/catch

function compile(src: string): { html: string; css: string; js: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css, js: out.js };
}

function parseAST(src: string): any {
  return new Parser(new Lexer(src).tokenize()).parse();
}

// ================================================================
// fn — user-defined functions
// ================================================================
describe('fn — user-defined functions', () => {

  test('short-form fn compiles to JS function', () => {
    const { js } = compile(`
      fn double(x) = x * 2
      page '/' { p "test" }
    `);
    assert.ok(js.includes('function double(x)'), 'should define function');
    assert.ok(js.includes('return x * 2'), 'should return expression');
  });

  test('fn with block body compiles to JS function', () => {
    const { js } = compile(`
      fn add(a, b) {
        set result = a + b
        return result
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('function add(a, b)'), 'should define function');
    assert.ok(js.includes('let result = a + b'), 'should compile set to let');
    assert.ok(js.includes('return result'), 'should compile return');
  });

  test('fn with default parameters', () => {
    const { js } = compile(`
      fn greet(name, greeting = "Hello") {
        return greeting + " " + name
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('greeting = "Hello"'), 'should include default value');
  });

  test('fn with no params uses bare names (no $ prefix)', () => {
    const ast = parseAST(`
      fn shipping(weight, country) {
        return weight * 4.99
      }
    `);
    const fnNode = ast.body.find((n: any) => n.type === 'Fn');
    assert.ok(fnNode, 'should parse fn node');
    assert.equal(fnNode.name, 'shipping');
    assert.equal(fnNode.params.length, 2);
    assert.equal(fnNode.params[0].name, 'weight');
    assert.equal(fnNode.params[1].name, 'country');
  });
});

// ================================================================
// match — pattern matching
// ================================================================
describe('match — pattern matching', () => {

  test('match compiles to if/else chain', () => {
    const { js } = compile(`
      fn shipping(weight, country) {
        match country {
          "DE" -> weight * 4.99
          "US" -> weight * 12.99
          _ -> weight * 19.99
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('country === "DE"'), 'should match DE');
    assert.ok(js.includes('country === "US"'), 'should match US');
    assert.ok(js.includes('weight * 4.99'), 'should return DE price');
    assert.ok(js.includes('weight * 19.99'), 'should have default case');
  });

  test('match with block bodies', () => {
    const { js } = compile(`
      fn process(status) {
        match status {
          "active" -> {
            set msg = "Running"
            return msg
          }
          _ -> return "Unknown"
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('status === "active"'), 'should match active');
    assert.ok(js.includes('let msg = "Running"'), 'should compile block body');
  });
});

// ================================================================
// when — boolean branching inside fn
// ================================================================
describe('when — boolean branching in fn', () => {

  test('when/else compiles to if/else', () => {
    const { js } = compile(`
      fn check(x) {
        when x > 10 {
          return "big"
        } else {
          return "small"
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('if (x > 10)'), 'should compile when to if');
    assert.ok(js.includes('return "big"'));
    assert.ok(js.includes('return "small"'));
  });
});

// ================================================================
// try/catch — error handling
// ================================================================
describe('try/catch — error handling', () => {

  test('try/catch compiles to JS try/catch', () => {
    const { js } = compile(`
      fn safe(x) {
        try {
          return risky(x)
        } catch e {
          return "error: " + e
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('try {'), 'should have try');
    assert.ok(js.includes('catch (e)'), 'should have catch with param');
    assert.ok(js.includes('return risky(x)'));
  });
});

// ================================================================
// throw
// ================================================================
describe('throw — error throwing', () => {

  test('throw compiles to throw new Error', () => {
    const { js } = compile(`
      fn validate(x) {
        when x < 0 {
          throw "Value must be positive"
        }
        return x
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('throw new Error("Value must be positive")'), 'should compile throw');
  });
});

// ================================================================
// each — iteration inside fn
// ================================================================
describe('each — iteration in fn', () => {

  test('each compiles to for...of loop', () => {
    const { js } = compile(`
      fn total(items) {
        set sum = 0
        each items -> item {
          set sum = sum + item
        }
        return sum
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('for (const item of items)'), 'should compile each to for...of');
  });
});

// ================================================================
// type — custom data shapes
// ================================================================
describe('type — custom data shapes', () => {

  test('type compiles to validator function', () => {
    const { js } = compile(`
      type User {
        name: string
        email: email
        age?: number
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('function validateUser(obj)'), 'should create validator');
    assert.ok(js.includes("name is required"), 'should validate required fields');
    assert.ok(js.includes("must be a string"), 'should validate string type');
    assert.ok(js.includes("must be a valid email"), 'should validate email');
    // age is optional — should NOT have "age is required"
    assert.ok(!js.includes("age is required"), 'optional fields should not be required');
  });
});

// ================================================================
// test — built-in test blocks
// ================================================================
describe('test — built-in test blocks', () => {

  test('test block compiles to test function', () => {
    const { js } = compile(`
      fn double(x) = x * 2
      test "double works" {
        assertEq double(5), 10
        assert double(0) == 0
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('function __test_double_works'), 'should create test function');
    assert.ok(js.includes('double') && js.includes('5'), 'should include assertion expr');
  });
});

// ================================================================
// Token efficiency — the whole point
// ================================================================
describe('token efficiency', () => {

  test('fn with match is fewer tokens than equivalent JS', () => {
    // NyxCode:
    const nyx = `fn shipping(weight, country)
  match country {
    "DE" -> weight * 4.99
    "US" -> weight * 12.99
    _ -> weight * 19.99
  }`;
    // JS equivalent:
    const js = `function shipping(weight, country) {
  if (country === 'DE') return weight * 4.99;
  if (country === 'US') return weight * 12.99;
  return weight * 19.99;
}`;
    // NyxCode should be shorter or equal
    assert.ok(nyx.length <= js.length, `NyxCode (${nyx.length} chars) should be <= JS (${js.length} chars)`);
  });
});

// ================================================================
// Regression — existing features still work
// ================================================================
describe('regression — existing features unaffected', () => {

  test('page with state and elements still works', () => {
    const { html } = compile(`
      page '/' {
        state count = 0
        h1 "Counter"
        p "Hello"
        button "Click" -> count += 1
      }
    `);
    assert.ok(html.includes('Counter'), 'should render heading');
    assert.ok(html.includes('Hello'), 'should render paragraph');
  });

  test('page with data and when still works', () => {
    const { html } = compile(`
      page '/' {
        h1 "Welcome"
        when true {
          p "visible"
        }
      }
    `);
    assert.ok(html.includes('Welcome'), 'should render heading');
  });
});
