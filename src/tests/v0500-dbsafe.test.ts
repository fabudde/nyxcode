import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { compileBackend } from '../backend-compiler.js';

function parse(src: string) {
  return new Parser(new Lexer(src).tokenize()).parse();
}

describe('v0.50.0 — __dbSafe auto-serialize for SQLite', () => {
  it('should wrap $body params in .run() with __dbSafe() but not .get()', () => {
    const src = `
table forms { title text required }

api POST /api/forms/:slug/respond {
  query "SELECT * FROM forms WHERE slug = $params.slug" -> found
  query "INSERT INTO responses (form_id, answers) VALUES ($found.id, $body.answers)"
}
`;
    const ast = parse(src);
    const tables = ast.body.filter((n: any) => n.type === 'Table');
    const apis = ast.body.filter((n: any) => n.type === 'Api');
    const output = compileBackend(tables as any, apis as any);
    
    // SELECT (.get) should NOT have __dbSafe
    assert.ok(output.includes('.get(__dbSafe(req.params.slug))'), 'SELECT params should use __dbSafe for consistency');
    
    // INSERT (.run) SHOULD have __dbSafe
    assert.ok(output.includes('__dbSafe(found.id)'), 'INSERT params should be wrapped');
    assert.ok(output.includes('__dbSafe(req.body.answers)'), 'body params should be wrapped');
  });

  it('wraps all body params in INSERT .run()', () => {
    const src = `
table items { name text required, count number }

api POST /api/items {
  query "INSERT INTO items (name, count) VALUES ($body.name, $body.count)"
}
`;
    const ast = parse(src);
    const tables = ast.body.filter((n: any) => n.type === 'Table');
    const apis = ast.body.filter((n: any) => n.type === 'Api');
    const output = compileBackend(tables as any, apis as any);
    
    assert.ok(output.includes('__dbSafe(req.body.name)'), 'body.name wrapped');
    assert.ok(output.includes('__dbSafe(req.body.count)'), 'body.count wrapped');
  });
});
