/**
 * v0.38.2 Bugfixes: #181 (background-clip + vendor prefix) + #172 (JWT persistence)
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { Compiler } from "../compiler.js";
import { Lexer } from "../lexer.js";
import { Parser } from "../parser.js";
import { compileAuth } from "../auth-compiler.js";

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

function getStyle(html: string, tag: string = "h1"): string {
  const match = html.match(new RegExp(`<${tag}[^>]*style="([^"]+)"`));
  return match?.[1] || "";
}

describe("#181: bgclip shorthand + vendor prefix", () => {
  it("bgclip maps to background-clip", () => {
    const html = compile(`page / {\n  h1 style={ bgclip text } "Test"\n}`);
    const style = getStyle(html);
    assert.ok(
      style.includes("background-clip"),
      `should contain background-clip, got: ${style}`,
    );
  });

  it("bgclip auto-prefixes with -webkit-background-clip", () => {
    const html = compile(`page / {\n  h1 style={ bgclip text } "Test"\n}`);
    const style = getStyle(html);
    assert.ok(
      style.includes("-webkit-background-clip"),
      `should contain -webkit-background-clip, got: ${style}`,
    );
  });

  it("-webkit-background-clip parses as property name", () => {
    const html = compile(
      `page / {\n  h1 style={ -webkit-background-clip text } "Test"\n}`,
    );
    const style = getStyle(html);
    assert.ok(
      style.includes("-webkit-background-clip"),
      `should preserve vendor prefix, got: ${style}`,
    );
    assert.ok(style.includes("text"), `value should be text, got: ${style}`);
    assert.ok(
      !style.includes("-:"),
      `should NOT produce broken -: prefix, got: ${style}`,
    );
  });

  it("-webkit-text-fill-color parses correctly", () => {
    const html = compile(
      `page / {\n  h1 style={ -webkit-text-fill-color transparent } "Test"\n}`,
    );
    const style = getStyle(html);
    assert.ok(
      style.includes("-webkit-text-fill-color"),
      `should contain full vendor property, got: ${style}`,
    );
    assert.ok(
      style.includes("transparent"),
      `should have transparent value, got: ${style}`,
    );
  });

  it("full gradient text pattern works", () => {
    const html = compile(
      `page / {\n  h1 style={ bg linear-gradient(135deg, #f59e0b, #fbbf24), bgclip text, c transparent } "Gradient"\n}`,
    );
    assert.ok(html.includes("linear-gradient"), "should have gradient");
    assert.ok(html.includes("background-clip"), "should have background-clip");
    assert.ok(html.includes("transparent"), "should have transparent");
  });

  it("bgc still maps to background-color (not broken)", () => {
    const html = compile(`page / {\n  div style={ bgc red } "Test"\n}`);
    const style = getStyle(html, "div");
    assert.ok(
      style.includes("background-color"),
      `bgc should still be background-color, got: ${style}`,
    );
  });

  it("-moz-appearance parses correctly", () => {
    const html = compile(`page / {\n  input style={ -moz-appearance none }\n}`);
    assert.ok(
      html.includes("-moz-appearance"),
      "should contain -moz-appearance",
    );
  });
});

describe("#172: JWT Secret persistence", () => {
  it("generated auth code uses file-based JWT secret", () => {
    const security = {
      type: "Security" as const,
      rules: [
        { name: "table", value: "users" },
        { name: "login", value: "email password" },
        { name: "token", value: "jwt" },
      ],
      line: 1,
      col: 1,
    };
    const tables = [
      {
        type: "Table" as const,
        name: "users",
        columns: [
          { name: "email", type: "email", constraints: [] },
          { name: "password", type: "text", constraints: [] },
        ],
        line: 1,
        col: 1,
      },
    ];
    const code = compileAuth(security as any, tables as any);
    assert.ok(
      code.includes(".jwt-secret"),
      `should reference .jwt-secret file`,
    );
    assert.ok(code.includes("readFileSync"), "should read from file");
    assert.ok(code.includes(".nyx-data"), "should use .nyx-data directory");
    assert.ok(!code.includes("nyx-dev-"), "should NOT have random dev secret");
  });
});
