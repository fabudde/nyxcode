import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';
import { compileBackend as _compileBackend } from '../backend-compiler.js';

function compile(src: string): { html: string; css: string; js: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  return new Compiler().compile(ast);
}

function parseAST(src: string): any {
  return new Parser(new Lexer(src).tokenize()).parse();
}

function compileBackend(src: string): string {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const tables = ast.body.filter((n: any) => n.type === "Table") as any[];
  const apis = ast.body.filter((n: any) => n.type === "Api") as any[];
  const pipes = ast.body.filter((n: any) => n.type === "Pipe") as any[];
  const pages = ast.body.filter((n: any) => n.type === "Page").map((p: any) => p.route);
  return _compileBackend(tables, apis, undefined, [], pages, [], [], [], undefined, [], [], pipes);
}

describe('stream fetch — parser', () => {

  test('parses stream fetch with URL and block', () => {
    const ast = parseAST(`
      pipe 'chat' {
        on api POST /api/chat auth
        stream fetch "https://api.openai.com/v1/chat/completions" {
          method POST
          body $body
        }
      }
      page '/' { p "test" }
    `);
    const pipe = ast.body.find((n: any) => n.type === 'Pipe');
    assert.ok(pipe, 'should parse pipe');
    const streamStep = pipe.steps.find((s: any) => s.type === 'StreamFetch');
    assert.ok(streamStep, 'should find StreamFetch step');
    assert.ok(streamStep.url.includes('openai.com'), 'should have correct URL');
    assert.equal(streamStep.method, 'POST');
  });

  test('parses stream fetch with $variable URL', () => {
    const ast = parseAST(`
      pipe 'proxy' {
        on api POST /api/proxy
        stream fetch $body.url {
          method POST
          body $body.payload
        }
      }
      page '/' { p "test" }
    `);
    const pipe = ast.body.find((n: any) => n.type === 'Pipe');
    const streamStep = pipe.steps.find((s: any) => s.type === 'StreamFetch');
    assert.ok(streamStep, 'should find StreamFetch');
    assert.equal(streamStep.url, '$body.url');
  });
});

describe('stream fetch — backend compiler', () => {

  test('generates SSE response headers', () => {
    const code = compileBackend(`
      pipe 'chat' {
        on api POST /api/chat auth
        stream fetch "https://api.openai.com/v1/chat/completions" {
          method POST
          body $body
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(code.includes('text/event-stream'), 'should set SSE content type');
    assert.ok(code.includes('no-cache'), 'should disable caching');
    assert.ok(code.includes('getReader'), 'should use ReadableStream reader');
    assert.ok(code.includes('[DONE]'), 'should send DONE event');
    assert.ok(code.includes('res.end()'), 'should end response');
  });
});

describe('SSE frontend helper', () => {

  test('SSE helper injected when stream is used', () => {
    const { js } = compile(`
      pipe 'chat' {
        on api POST /api/chat
        stream fetch "https://api.openai.com" {
          method POST
          body $body
        }
      }
      page '/' { p "test" }
    `);
    assert.ok(js.includes('__nyx_sse'), 'should inject SSE helper function');
  });

  test('SSE helper NOT injected when no stream used', () => {
    const { js } = compile(`
      page '/' {
        h1 "No streaming"
        p "Just a normal page"
      }
    `);
    assert.ok(!js.includes('__nyx_sse'), 'should NOT inject SSE helper');
  });
});

describe('SSE token efficiency', () => {
  test('stream fetch is more compact than JS equivalent', () => {
    const nyx = `pipe 'chat' {
  on api POST /api/chat auth
  stream fetch "https://api.openai.com/v1/chat/completions" {
    method POST
    body $body
  }
}`;
    const js = `app.post('/api/chat', authMiddleware, async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body)
  });
  const reader = resp.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write('data: ' + new TextDecoder().decode(value) + '\\n\\n');
  }
  res.end();
});`;
    assert.ok(nyx.length < js.length, `NyxCode (${nyx.length}) < JS (${js.length})`);
  });
});

describe('SSE regression — existing pipes', () => {
  test('normal pipe fetch still works', () => {
    const code = compileBackend(`
      pipe 'getData' {
        on api GET /api/data
        fetch "https://api.example.com/data"
        respond 200 $fetchResult
      }
      page '/' { p "test" }
    `);
    assert.ok(code.includes('/api/data'), 'should have route');
  });
});
