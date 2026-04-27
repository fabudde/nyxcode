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
