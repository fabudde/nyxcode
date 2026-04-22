import { Lexer } from "./dist/lexer.js";
import { Parser } from "/root/.ocplatform/workspace/nyxcode/dist/parser.js";
import { compileBackend } from "./dist/backend-compiler.js";

const src = `api POST /api/chat {
  stream fetch "https://api.example.com/v1/chat" {
    method POST
    headers {
      Authorization: "Bearer " + $env.GEMINI_API_KEY
      Content-Type: "application/json"
    }
    body $body
  }
}

api POST /api/ask {
  let response = fetch "https://api.example.com" {
    method POST
    headers {
      Authorization: "Bearer " + $env.API_KEY
      X-Custom: "static-value"
    }
    body $body
  }
  respond 200 $response
}

page "/" { p "test" }`;

const ast = new Parser(new Lexer(src).tokenize()).parse();
const apis = ast.body.filter(n => n.type === "Api");
console.log("APIs:", apis.length);

// Check parsed headers
apis.forEach(a => {
  console.log(`\n${a.method} ${a.path} body types:`, a.body.map(s => s.type));
  a.body.forEach(s => {
    if (s.headers) console.log("  Headers:", s.headers);
    if (s.value && s.value.headers) console.log("  Let headers:", s.value.headers);
  });
});

const code = compileBackend(
  [], apis, undefined, [], ["/"], [], [], [], undefined, [], [], []
);

const lines = code.split("\n");
["chat", "ask"].forEach(name => {
  const idx = lines.findIndex(l => l.includes(`/api/${name}`));
  console.log(`\n=== /api/${name} ===`);
  for (let i = idx; i < Math.min(idx + 8, lines.length); i++) console.log(lines[i]);
});

console.log("\n=== CHECKS ===");
console.log("Bearer + env.GEMINI:", code.includes("Bearer ${process.env.GEMINI_API_KEY}"));
console.log("Bearer + env.API_KEY:", code.includes("Bearer ${process.env.API_KEY}"));
console.log("X-Custom static:", code.includes('"static-value"'));
