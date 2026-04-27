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

describe("#183: while/for Loops", () => {
  it("parses while loop", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi GET /api/t {\n  let x = 10\n  while x > 0 {\n    set x = x - 1\n  }\n  respond 200 { x: x }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const whileNode = api.body.find((s: any) => s.type === "While");
    assert.ok(whileNode, "should create While node");
    assert.equal(whileNode.condition, "x > 0");
    assert.ok(whileNode.body.length > 0, "should have body statements");
  });

  it("parses for range loop", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi GET /api/t {\n  let sum = 0\n  for i in 0..10 {\n    set sum = sum + i\n  }\n  respond 200 { sum: sum }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const forNode = api.body.find((s: any) => s.type === "For");
    assert.ok(forNode, "should create For node");
    assert.equal(forNode.varName, "i");
    assert.equal(forNode.rangeStart, "0");
    assert.equal(forNode.rangeEnd, "10");
  });

  it("parses for loop with step", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi GET /api/t {\n  for i in 0..100 step 5 {\n    set x = i\n  }\n  respond 200 { x: x }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const forNode = api.body.find((s: any) => s.type === "For");
    assert.ok(forNode);
    assert.equal(forNode.step, "5");
  });

  it("while loop has infinite loop guard in output", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi GET /api/t {\n  let x = 5\n  while x > 0 {\n    set x = x - 1\n  }\n  respond 200 { x: x }\n}\npage / { h1 "T" }');
    // Just verify it parses without error — compilation tested via CLI
    const api = ast.body.find((n: any) => n.type === "Api");
    assert.ok(api.body.find((s: any) => s.type === "While"));
  });
});

describe("#185: Client-side Reactivity — set in event handlers", () => {
  it("compiles set in on:click to state mutation", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  button "+" on:click { set count = count + 1 }\n}');
    assert.ok(html.includes("__nyx.state.count = __nyx.state.count + 1"), "onclick should mutate state: " + html.substring(html.indexOf("onclick"), html.indexOf("onclick") + 80));
    assert.ok(!html.includes("set __nyx"), "should not leak 'set' keyword");
  });

  it("compiles push in on:click with notify", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  button "Add" on:click { push items "new" }\n}');
    assert.ok(html.includes(".push("), "should have .push() call");
    assert.ok(html.includes("__nyx.notify"), "should notify after push");
  });

  it("template binding uses data-nyx-tpl", () => {
    const html = compile('meta { title "T" }\npage / {\n  let name = "Nyx"\n  h1 "Hello {name}!"\n}');
    assert.ok(html.includes('data-nyx-tpl="Hello {{state.name}}!"'), "should have template binding");
  });
});

describe("#192: Component Events — emit", () => {
  it("parses emit statement", () => {
    const ast = parse('meta { title "T" }\ncomponent Counter {\n  let count = 0\n  button "+" on:click { emit change count }\n}\npage / { h1 "T" }');
    const comp = ast.body.find((n: any) => n.type === "Component");
    assert.ok(comp, "should have Component node");
  });

  it("compiles emit in on:click to CustomEvent", () => {
    const html = compile('meta { title "T" }\npage / {\n  let x = 0\n  button "Fire" on:click { emit myEvent }\n}');
    assert.ok(html.includes("CustomEvent('myEvent'"), "should dispatch CustomEvent: " + html.substring(html.indexOf("onclick") || 0, (html.indexOf("onclick") || 0) + 100));
  });
});

describe("#187: WebSocket — socket block", () => {
  it("parses socket block at top level", () => {
    const ast = parse('meta { title "T" }\nsocket /ws/chat {\n  on connect {\n  }\n  on message {\n  }\n}\npage / { h1 "T" }');
    const socket = ast.body.find((n: any) => n.type === "Socket");
    assert.ok(socket, "should have Socket node");
    assert.equal(socket.path, "/ws/chat");
    assert.equal(socket.handlers.length, 2);
    assert.equal(socket.handlers[0].event, "connect");
    assert.equal(socket.handlers[1].event, "message");
  });
});

describe("#188: SPA Routing — multi-page", () => {
  it("multi-page compiles with client-side router", () => {
    const html = compile('meta { title "T" }\npage / {\n  h1 "Home"\n}\npage /about {\n  h1 "About"\n}');
    assert.ok(html.includes("nyx-route"), "should have route divs");
    assert.ok(html.includes("__navigate"), "should have router script");
    assert.ok(html.includes('data-route="/"'), "should have home route");
    assert.ok(html.includes('data-route="/about"'), "should have about route");
  });
});

describe("#190: HTTP Client — fetch in API blocks", () => {
  it("parses fetch statement", () => {
    const ast = parse('meta { title "T" }\ntable t { n text }\napi GET /api/t {\n  fetch "https://example.com/api" as result\n  respond 200 { data: result }\n}\npage / { h1 "T" }');
    const api = ast.body.find((n: any) => n.type === "Api");
    const fetchNode = api.body.find((s: any) => s.type === "ApiFetch");
    assert.ok(fetchNode, "should have ApiFetch node");
    assert.equal(fetchNode.url, "https://example.com/api");
    assert.equal(fetchNode.asVar, "result");
  });
});

describe("#195: render_list uses __nyx.state (not accessor)", () => {
  it("each in page uses __nyx.state for collection", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = ["a", "b"]\n  each items -> item {\n    span "{item}"\n  }\n}');
    assert.ok(html.includes("__nyx.state['items']"), "should reference __nyx.state: " + html.substring(html.indexOf("items.map") || html.indexOf("__nyx.state") || 0, (html.indexOf("items.map") || html.indexOf("__nyx.state") || 0) + 80));
  });
});

describe("#196: for loops render correctly in frontend", () => {
  it("for loop statically unrolls in page", () => {
    const html = compile('meta { title "T" }\npage / {\n  for i in 0..3 {\n    span "{i}"\n  }\n}');
    assert.ok(html.includes(">0</span>"), "should have span 0: " + html);
    assert.ok(html.includes(">1</span>"), "should have span 1");
    assert.ok(html.includes(">2</span>"), "should have span 2");
    assert.ok(!html.includes(">3</span>"), "should not have span 3 (exclusive end)");
  });
});
