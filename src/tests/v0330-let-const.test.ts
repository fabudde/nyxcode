import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.33.0 — let (reactive variables) + const (non-reactive constants) + ${} interpolation

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

function compileToHTML(src: string): string {
  return compile(src).html;
}

// ================================================================
// let — reactive page-local variables
// ================================================================
describe('let — reactive variables', () => {

  test('let with string value creates reactive state', () => {
    const html = compileToHTML(`
      page '/' {
        let name = "Nyx"
        p "Hello"
      }
    `);
    // Should contain the reactive runtime
    assert.ok(html.includes('__nyx'), 'should include reactive runtime');
    assert.ok(html.includes("createState('name'"), 'should create state for name');
  });

  test('let with number value creates reactive state', () => {
    const html = compileToHTML(`
      page '/' {
        let count = 0
        p "Counter"
      }
    `);
    assert.ok(html.includes("createState('count', 0)"), 'should create state for count with value 0');
  });

  test('let with boolean value creates reactive state', () => {
    const html = compileToHTML(`
      page '/' {
        let active = true
        p "Status"
      }
    `);
    assert.ok(html.includes("createState('active', true)"), 'should create state for active');
  });

  test('let with array value creates reactive state', () => {
    const html = compileToHTML(`
      page '/' {
        let items = ["apple", "banana"]
        p "List"
      }
    `);
    assert.ok(html.includes("createState('items'"), 'should create state for items array');
  });

  test('multiple let declarations work together', () => {
    const html = compileToHTML(`
      page '/' {
        let name = "Nyx"
        let count = 42
        let active = false
        p "Hello"
      }
    `);
    assert.ok(html.includes("createState('name'"), 'should have name state');
    assert.ok(html.includes("createState('count', 42)"), 'should have count state');
    assert.ok(html.includes("createState('active', false)"), 'should have active state');
  });

});

// ================================================================
// ${} interpolation — template strings with reactive vars
// ================================================================
describe('${} interpolation', () => {

  test('${var} in string content creates template binding', () => {
    const html = compileToHTML(`
      page '/' {
        let name = "Nyx"
        p "Hello \${name}!"
      }
    `);
    // Should create a data-nyx-tpl binding
    assert.ok(html.includes('data-nyx-tpl'), 'should have template binding');
    assert.ok(html.includes('state.name'), 'should reference state.name');
  });

  test('{var} interpolation (without $) still works', () => {
    const html = compileToHTML(`
      page '/' {
        let count = 0
        p "Count: {count}"
      }
    `);
    assert.ok(html.includes('data-nyx-tpl'), 'should have template binding');
    assert.ok(html.includes('state.count'), 'should reference state.count');
  });

  test('multiple variables in one template', () => {
    const html = compileToHTML(`
      page '/' {
        let first = "Nyx"
        let last = "Lobster"
        p "Name: \${first} \${last}"
      }
    `);
    assert.ok(html.includes('state.first'), 'should reference first');
    assert.ok(html.includes('state.last'), 'should reference last');
  });

  test('store access in ${} interpolation works', () => {
    const html = compileToHTML(`
      store user {
        name = "Nyx"
      }
      page '/' {
        p "Hello \${user.name}!"
      }
    `);
    assert.ok(html.includes('data-nyx-tpl'), 'should have template binding');
    assert.ok(html.includes('state.user.name'), 'should reference store state');
  });

});

// ================================================================
// const — non-reactive compile-time constants
// ================================================================
describe('const — non-reactive constants', () => {

  test('const with string value is inlined', () => {
    const html = compileToHTML(`
      page '/' {
        const title = "My App"
        h1 "\${title}"
      }
    `);
    // Const should be inlined at compile time — no reactive binding
    assert.ok(html.includes('My App'), 'should inline const value');
    assert.ok(!html.includes('data-nyx-tpl') || !html.includes('state.title'), 'should NOT create reactive binding for const');
  });

  test('const with number value', () => {
    const html = compileToHTML(`
      page '/' {
        const version = 42
        p "Version"
      }
    `);
    // Should not create reactive state
    assert.ok(!html.includes("createState('version'"), 'should NOT create reactive state for const');
  });

  test('const does not trigger reactive runtime when alone', () => {
    const html = compileToHTML(`
      page '/' {
        const label = "Hello"
        p "World"
      }
    `);
    // No reactive runtime needed for const-only
    assert.ok(!html.includes('__nyx'), 'should NOT include reactive runtime for const-only');
  });

  test('const and let can coexist', () => {
    const html = compileToHTML(`
      page '/' {
        const label = "Counter"
        let count = 0
        h1 "\${label}"
        p "Count: \${count}"
      }
    `);
    // label should be inlined, count should be reactive
    assert.ok(html.includes('Counter'), 'const should be inlined');
    assert.ok(html.includes("createState('count'"), 'let should create reactive state');
  });

});

// ================================================================
// XSS Safety — auto-escape in interpolation
// ================================================================
describe('XSS auto-escape', () => {

  test('textContent-based binding is inherently XSS-safe', () => {
    const html = compileToHTML(`
      page '/' {
        let name = "<script>alert(1)</script>"
        p name
      }
    `);
    // Should use data-nyx-bind with textContent (not innerHTML)
    assert.ok(html.includes('data-nyx-bind'), 'should use safe binding');
    // The runtime uses el.textContent which never parses HTML
    assert.ok(html.includes('el.textContent = val'), 'runtime should use textContent');
  });

});

// ================================================================
// Backwards compatibility
// ================================================================
describe('backwards compatibility', () => {

  test('state keyword still works', () => {
    const html = compileToHTML(`
      page '/' {
        state count = 0
        p "Counter"
      }
    `);
    assert.ok(html.includes("createState('count', 0)"), 'state should still work');
  });

  test('store keyword still works', () => {
    const html = compileToHTML(`
      store cart {
        total = 0
      }
      page '/' {
        p "Cart"
      }
    `);
    assert.ok(html.includes("createState('cart.total'"), 'store should still work');
  });

  test('let in api context still produces Let node for backend', () => {
    // Backend let with query should produce 'Let' node (not 'State')
    const src = `
      api GET '/items' {
        let result = query "SELECT * FROM items"
        respond 200
      }
    `;
    const ast = new Parser(new Lexer(src).tokenize()).parse();
    assert.ok(ast, 'backend let should parse');
    const apiNode = ast.body.find((n: any) => n.type === 'Api');
    assert.ok(apiNode, 'should have API node');
    const letStmt = (apiNode as any).body.find((s: any) => s.type === 'Let');
    assert.ok(letStmt, 'should have Let statement (not State) for query');
    assert.equal(letStmt.value.kind, 'query', 'should be a query let');
  });

});
