/**
 * v0.39.0 Feature: #189 Array/Object Literals
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Compiler } from "../compiler.js";
import { Lexer } from "../lexer.js";
import { Parser } from "../parser.js";

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

function parse(src: string): any {
  const tokens = new Lexer(src).tokenize();
  return new Parser(tokens).parse();
}

describe("#189: Array/Object Literals — Parser", () => {
  it("parses array literal in let statement", () => {
    const ast = parse('meta { title "T" }\npage / {\n  let items = [1, 2, 3]\n  h1 "T"\n}');
    const page = ast.body.find((n: any) => n.type === "Page");
    const state = page.body.find((s: any) => s.type === "State" && s.name === "items");
    assert.ok(state, "should create State node for array");
    assert.ok(state.initialValue.includes("["), "should have array: " + state.initialValue);
  });

  it("parses object literal in let statement", () => {
    const ast = parse('meta { title "T" }\npage / {\n  let cfg = { theme: "dark" }\n  h1 "T"\n}');
    const page = ast.body.find((n: any) => n.type === "Page");
    const state = page.body.find((s: any) => s.type === "State" && s.name === "cfg");
    assert.ok(state, "should create State node for object");
    assert.ok(state.initialValue.includes("{"), "should have object: " + state.initialValue);
  });

  it("preserves string quotes in array literals", () => {
    const ast = parse('meta { title "T" }\npage / {\n  let tags = ["hello", "world"]\n  h1 "T"\n}');
    const page = ast.body.find((n: any) => n.type === "Page");
    const state = page.body.find((s: any) => s.type === "State" && s.name === "tags");
    assert.ok(state.initialValue.includes('"hello"'), "should quote strings: " + state.initialValue);
  });

  it("preserves string quotes in object literals", () => {
    const ast = parse('meta { title "T" }\npage / {\n  let cfg = { name: "Nyx", age: 1 }\n  h1 "T"\n}');
    const page = ast.body.find((n: any) => n.type === "Page");
    const state = page.body.find((s: any) => s.type === "State" && s.name === "cfg");
    assert.ok(state.initialValue.includes('"Nyx"'), "should quote strings in objects: " + state.initialValue);
  });
});

describe("#189: Array/Object Literals — Frontend Compilation", () => {
  it("array literal becomes reactive state", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = ["a", "b"]\n  h1 "T"\n}');
    assert.ok(html.includes('"a"') && html.includes('"b"'), "should have array values in state");
  });

  it("object literal becomes reactive state", () => {
    const html = compile('meta { title "T" }\npage / {\n  let cfg = { x: "yes" }\n  h1 "T"\n}');
    assert.ok(html.includes('"yes"'), "should have object values in state");
  });
});

describe("#184: set — Variable Reassignment", () => {
  it("parses set statement", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi POST /api/t {\n  let x = 0\n  set x = 5\n  respond 200 { x: x }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const setNode = api.body.find((s: any) => s.type === "Set");
    assert.ok(setNode, "should create Set node");
    assert.equal(setNode.target, "x");
    assert.equal(setNode.expr, "5");
  });

  it("parses set with dot notation", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi POST /api/t {\n  let user = { name: "A" }\n  set user.name = "B"\n  respond 200 { user: user }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const setNode = api.body.find((s: any) => s.type === "Set");
    assert.ok(setNode, "should create Set node for dot notation");
    assert.equal(setNode.target, "user.name");
  });

  it("parses set with arithmetic expression", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi POST /api/t {\n  let count = 0\n  set count = count + 1\n  respond 200 { count: count }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const setNode = api.body.find((s: any) => s.type === "Set");
    assert.ok(setNode);
    assert.equal(setNode.expr, "count + 1");
  });
});

describe("#189: push/pop/shift — Array Mutations", () => {
  it("parses push statement", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi POST /api/t {\n  let items = []\n  push items "hello"\n  respond 200 { items: items }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const pushNode = api.body.find((s: any) => s.type === "ArrayMutation" && s.op === "push");
    assert.ok(pushNode, "should create ArrayMutation push node");
    assert.equal(pushNode.target, "items");
    assert.equal(pushNode.value, '"hello"');
  });

  it("parses pop statement", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi POST /api/t {\n  let items = [1, 2, 3]\n  pop items\n  respond 200 { items: items }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const popNode = api.body.find((s: any) => s.type === "ArrayMutation" && s.op === "pop");
    assert.ok(popNode, "should create ArrayMutation pop node");
    assert.equal(popNode.target, "items");
    assert.equal(popNode.value, undefined);
  });
});
