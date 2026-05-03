import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Lexer } from "../lexer.js";
import { Parser } from "../parser.js";
import { Compiler } from "../compiler.js";

function buildHTML(source: string): string {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

describe("Store v2 — Methods with Parameters", () => {
  it("should compile store methods with params", () => {
    const html = buildHTML(`
      store counter {
        count = 0
        increment() { set count count + 1 }
        add(amount) { set count count + amount }
      }
      page / { p "{counter.count}" }
    `);
    assert.ok(html.includes("counter.increment = function()"));
    assert.ok(html.includes("counter.add = function(amount)"));
    assert.ok(html.includes("__nyx.state['counter.count']"));
  });

  it("should compile methods with multiple params", () => {
    const html = buildHTML(`
      store math {
        result = 0
        calc(a, b) { set result a + b }
      }
      page / { p "{math.result}" }
    `);
    assert.ok(html.includes("math.calc = function(a, b)"));
  });
});

describe("Store v2 — Persist", () => {
  it("should add localStorage load for persist stores", () => {
    const html = buildHTML(`
      store settings persist {
        darkMode = true
        lang = "de"
      }
      page / { p "{settings.darkMode}" }
    `);
    assert.ok(html.includes("(persistent)"), "should mark as persistent");
    assert.ok(html.includes("localStorage.getItem"), "should load from localStorage");
    assert.ok(html.includes("localStorage.setItem"), "should save to localStorage");
  });

  it("should NOT add localStorage for non-persist stores", () => {
    const html = buildHTML(`
      store counter {
        count = 0
      }
      page / { p "{counter.count}" }
    `);
    assert.ok(!html.includes("localStorage"), "should not have localStorage");
  });
});

describe("Store v2 — $reset and $patch", () => {
  it("should generate $reset method", () => {
    const html = buildHTML(`
      store counter {
        count = 0
        name = "test"
      }
      page / { p "{counter.count}" }
    `);
    assert.ok(html.includes("counter.$reset = function()"));
    assert.ok(html.includes("batchUpdate"));
  });

  it("should generate $patch method", () => {
    const html = buildHTML(`
      store user {
        name = ""
        age = 0
      }
      page / { p "{user.name}" }
    `);
    assert.ok(html.includes("user.$patch = function(obj)"));
  });
});

describe("Store v2 — Backward Compatibility", () => {
  it("should still support legacy arrow actions", () => {
    const html = buildHTML(`
      store counter {
        count = 0
        increment -> { count = count + 1 }
      }
      page / { p "{counter.count}" }
    `);
    assert.ok(html.includes("counter.increment = function()"));
  });

  it("should still support computed values", () => {
    const html = buildHTML(`
      store cart {
        items = []
        computed total = items.length
      }
      page / { p "{cart.total}" }
    `);
    assert.ok(html.includes("defineComputed"));
  });
});
