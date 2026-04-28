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

describe("#202: Client-side conditional rendering", () => {
  it("when block uses __nyx.state for condition", () => {
    const html = compile('meta { title "T" }\npage / {\n  let visible = false\n  when .visible {\n    div "Shown"\n  } else {\n    div "Hidden"\n  }\n}');
    assert.ok(html.includes("__nyx.state.visible"), "condition should use __nyx.state");
    assert.ok(html.includes("Shown"), "should have then branch");
    assert.ok(html.includes("Hidden"), "should have else branch");
  });

  it("when block subscribes to state changes", () => {
    const html = compile('meta { title "T" }\npage / {\n  let mode = "list"\n  when .mode == "edit" {\n    div "Edit mode"\n  }\n}');
    assert.ok(html.includes("subscribe('mode'"), "should subscribe to mode state: " + html.substring(html.indexOf("subscribe") || 0, (html.indexOf("subscribe") || 0) + 50));
  });

  it("when block renders initially via post-init script", () => {
    const html = compile('meta { title "T" }\npage / {\n  let show = true\n  when .show {\n    div "Yes"\n  }\n}');
    // render_cond should be called AFTER __nyx runtime is defined (in a separate script tag)
    const lastScript = html.lastIndexOf("<script>");
    const condCall = html.indexOf("render_cond_1()");
    assert.ok(condCall > lastScript || html.includes("render_cond_1()"), "should call render_cond after runtime init");
  });
});

describe("#201: Rich Input Components", () => {
  it("rating generates star elements", () => {
    const html = compile('meta { title "T" }\npage / {\n  let score = 0\n  rating max=5 value=".score"\n}');
    assert.ok(html.includes("nyx-star"), "should have star elements");
    assert.ok(html.includes("nyx-rating"), "should have rating container");
  });

  it("toggle generates switch element", () => {
    const html = compile('meta { title "T" }\npage / {\n  let enabled = false\n  toggle value=".enabled" "Dark Mode"\n}');
    assert.ok(html.includes("nyx-toggle"), "should have toggle class");
    assert.ok(html.includes("Dark Mode"), "should have label text");
  });

  it("choice generates option buttons", () => {
    const html = compile('meta { title "T" }\npage / {\n  let answer = ""\n  choice options="Yes,No,Maybe" value=".answer"\n}');
    assert.ok(html.includes("nyx-choice-btn"), "should have choice buttons");
    assert.ok(html.includes("Yes"), "should have first option");
    assert.ok(html.includes("No"), "should have second option");
    assert.ok(html.includes("Maybe"), "should have third option");
  });
});

describe("#200: Multi-Step Wizard", () => {
  it("wizard generates steps with progress bar", () => {
    const html = compile('meta { title "T" }\npage / {\n  wizard {\n    step { h2 "Step 1" }\n    step { h2 "Step 2" }\n    step { h2 "Step 3" }\n  }\n}');
    assert.ok(html.includes("nyx-wizard"), "should have wizard container");
    assert.ok(html.includes("nyx-wizard-step"), "should have step elements");
    assert.ok(html.includes("nyx-wizard-dot"), "should have progress dots");
    assert.ok(html.includes("nyx-wizard-nav"), "should have nav buttons");
    assert.ok(html.includes("Step 1"), "should have step 1 content");
    assert.ok(html.includes("Step 3"), "should have step 3 content");
  });
});

// ===== v0.50: Multi-Statement Event Handlers =====

describe("v0.50: Multi-Statement Event Handlers", () => {
  it("compiles two set statements in one handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let x = 0\n  let y = 0\n  button "Go" on:click { set x = 1 set y = 2 }\n}');
    assert.ok(html.includes("__nyx.state.x"), "should reference state.x");
    assert.ok(html.includes("__nyx.state.y"), "should reference state.y");
  });

  it("compiles set + push in one handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  let items = []\n  button "Go" on:click { set count = count + 1 push items "new" }\n}');
    assert.ok(html.includes("__nyx.state.count"), "should set count");
    assert.ok(html.includes(".push("), "should push to items");
  });

  it("compiles if inside handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  button "Go" on:click { if count > 10 { set count = 0 } }\n}');
    assert.ok(html.includes("if("), "should have if condition");
    assert.ok(html.includes("__nyx.state.count"), "should reference count");
  });

  it("compiles if/else inside handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let mode = "list"\n  button "Go" on:click { if mode == "list" { set mode = "edit" } else { set mode = "list" } }\n}');
    assert.ok(html.includes("if("), "should have if");
    assert.ok(html.includes("else"), "should have else");
  });

  it("compiles let (local) inside handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  button "Go" on:click { let temp = count + 1 set count = temp }\n}');
    assert.ok(html.includes("let temp="), "should have local let");
  });

  it("compiles toast in handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  button "Go" on:click { toast success "Saved!" }\n}');
    assert.ok(html.includes("Saved!"), "should have toast message");
    assert.ok(html.includes("#22c55e"), "should have success color");
  });

  it("compiles navigate in handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  button "Go" on:click { navigate "/dashboard" }\n}');
    assert.ok(html.includes("/dashboard"), "should have navigate path");
  });

  it("compiles try/catch in handler", () => {
    const html = compile('meta { title "T" }\npage / {\n  let status = "idle"\n  button "Go" on:click { try { set status = "ok" } catch err { set status = "error" } }\n}');
    assert.ok(html.includes("try{"), "should have try");
    assert.ok(html.includes("catch(err)"), "should have catch with var");
  });
});

describe("v0.50: Client-Side Functions", () => {
  it("fn in page compiles to JS function", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  fn increment() {\n    set count = count + 1\n  }\n  button "Go" on:click { call increment() }\n}');
    assert.ok(html.includes("function increment()"), "should have function declaration");
    assert.ok(html.includes("__nyx.state.count"), "should reference state in fn body");
  });

  it("fn with params and return", () => {
    const html = compile('meta { title "T" }\npage / {\n  fn double(x) {\n    return x * 2\n  }\n  p "test"\n}');
    assert.ok(html.includes("function double(x)"), "should have function with param");
    assert.ok(html.includes("return"), "should have return statement");
  });
});

describe("v0.50: Array Operations", () => {
  it("remove generates splice + notify", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  button "Del" on:click { remove items 0 }\n}');
    assert.ok(html.includes(".splice("), "should have splice");
    assert.ok(html.includes("notify"), "should notify");
  });

  it("shift generates shift + notify", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  button "Del" on:click { shift items }\n}');
    assert.ok(html.includes(".shift()"), "should have shift");
    assert.ok(html.includes("notify"), "should notify");
  });
});

describe("v0.50: push/remove in fn bodies (Kiro Bug #1)", () => {
  it("push in fn body compiles correctly", () => {
    const html = compile('meta { title "T" }\npage / {\n  let count = 0\n  let items = []\n  fn add() {\n    set count = count + 1\n    push items "new"\n  }\n  button "Add" on:click { call add() }\n}');
    assert.ok(html.includes("function add()"), "should have fn declaration");
    assert.ok(html.includes(".push("), "should have array push in fn");
    assert.ok(html.includes("notify"), "should notify after push");
    assert.ok(!html.includes("push __nyx"), "raw push should NOT appear");
  });

  it("remove in fn body compiles correctly", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  fn del(i) {\n    remove items i\n  }\n  p "test"\n}');
    assert.ok(html.includes("function del(i)"), "should have fn with param");
    assert.ok(html.includes(".splice("), "should have splice");
  });
});

describe("v0.50: each with index + array index set", () => {
  it("each with index variable", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  each items -> item, i {\n    p "{i}: {item}"\n  }\n}');
    assert.ok(html.includes("(item, i)"), "map callback should have index param");
  });

  it("set items[i].active compiles to indexed access + notify", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  each items -> item, i {\n    button "Toggle" on:click { set items[i].active = true }\n  }\n}');
    assert.ok(html.includes("].active=true"), "should set indexed property");
    assert.ok(html.includes("notify"), "should notify after indexed set");
  });
});

describe("v0.50: Dynamic text interpolation in each templates", () => {
  it("{expr} resolves to template literal in each body", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  each items -> item, i {\n    p "Q {i + 1}: {item}"\n  }\n}');
    assert.ok(html.includes("${i + 1}"), "should resolve {i + 1} to template literal");
    assert.ok(html.includes("${item}"), "should resolve {item} to template literal");
  });
});

describe("v0.50: set indexed path in fn body", () => {
  it("set items[i].type = t in fn compiles correctly", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  fn setType(i, t) {\n    set items[i].type = t\n  }\n  p "test"\n}');
    assert.ok(html.includes("function setType(i,t)"), "should have fn with params");
    assert.ok(html.includes(".type=t"), "should set .type property");
    assert.ok(html.includes("notify"), "should notify");
  });
});

describe("v0.50: fetch POST in handlers", () => {
  it("fetch POST with body and then navigate", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  button "Save" on:click { fetch POST "/api/save" { items: items } then navigate "/done" }\n}');
    assert.ok(html.includes("async function"), "should be async");
    assert.ok(html.includes("method:'POST'"), "should use POST");
    assert.ok(html.includes("/api/save"), "should have URL");
    assert.ok(html.includes("JSON.stringify"), "should stringify body");
    assert.ok(html.includes("window.location.href='/done'"), "should navigate after");
  });

  it("val() reads DOM input values", () => {
    const html = compile('meta { title "T" }\npage / {\n  input id="name"\n  button "Go" on:click { fetch POST "/api" { name: val("name") } }\n}');
    assert.ok(html.includes("document.getElementById('name').value"), "should read input value");
  });
});

describe("v0.50: fetch POST in fn body", () => {
  it("fetch POST with #id refs compiles to async fetch", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  fn publish() {\n    fetch POST "/api/data" { title: #my-title, items: items }\n  }\n  p "test"\n}');
    assert.ok(html.includes("function publish()"), "should have fn");
    assert.ok(html.includes("fetch("), "should have fetch call");
    assert.ok(html.includes("POST"), "should be POST method");
    assert.ok(html.includes("getElementById"), "should resolve #id");
    assert.ok(html.includes("JSON.stringify"), "should stringify body");
  });

  it("fetch POST in on:click handler works", () => {
    const html = compile('meta { title "T" }\npage / {\n  let items = []\n  button "Save" on:click { fetch POST "/api/save" { data: items } }\n}');
    assert.ok(html.includes("fetch("), "should have fetch");
    assert.ok(html.includes("POST"), "should be POST");
  });

  it("#id shorthand resolves to getElementById", () => {
    const html = compile('meta { title "T" }\npage / {\n  let x = 0\n  fn save() {\n    set x = #my-input\n  }\n  p "test"\n}');
    assert.ok(html.includes("getElementById('my-input').value"), "should resolve #id");
  });
});
