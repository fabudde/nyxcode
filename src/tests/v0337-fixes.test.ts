// @ts-nocheck
/**
 * v0.33.7 — Fixes for #156 (pipe validate undefined) and #157 (respond $var + dot spacing)
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parse } from '../index.js';
import { compileBackend } from '../backend-compiler.js';

function compilePipe(src) {
    const ast = parse(src);
    const tables = ast.body.filter(n => n.type === 'Table');
    const pipes = ast.body.filter(n => n.type === 'Pipe');
    return compileBackend(tables, [], null, [], [], [], [], [], null, [], [], pipes);
}

describe('#156: pipe validate rejects undefined fields', () => {
  it('validate is string uses == null || pattern', () => {
    const output = compilePipe(`pipe 'test' {
  on api POST /api/test auth
  validate $body.name is string
  respond 200 { ok: true }
}`);
    assert(output.includes('== null ||'), 'should use == null || for string validation');
    assert(!output.includes('!== undefined &&'), 'should NOT use !== undefined &&');
    assert(output.includes('is required and must be a string'), 'error message should say required');
  });

  it('validate is number uses == null || pattern', () => {
    const output = compilePipe(`pipe 'test' {
  on api POST /api/test auth
  validate $body.count is number
  respond 200 { ok: true }
}`);
    assert(output.includes('== null ||'), 'should use == null || for number validation');
    assert(output.includes('is required and must be a number'), 'error message should say required');
  });
});

describe('#157 bug 1: respond 200 $variable', () => {
  it('respond with $variable compiles to ctx reference', () => {
    const output = compilePipe(`pipe 'get-item' {
  on api GET /api/items/:id auth
  query "SELECT * FROM items WHERE id = $req.params.id" as item
  respond 200 $item
}`);
    assert(output.includes('ctx.item'), 'should reference ctx.item');
    assert(!output.includes('json({ ok: true })'), 'should NOT fall back to { ok: true }');
  });

  it('respond with $var[0] compiles to ctx.var[0]', () => {
    const output = compilePipe(`pipe 'get-first' {
  on api GET /api/items/:id auth
  query "SELECT * FROM items WHERE id = $req.params.id" as rows
  respond 200 $rows[0]
}`);
    assert(output.includes('ctx.rows[0]') || output.includes('ctx.rows[ 0 ]'), 
      'should reference ctx.rows[0]');
  });

  it('respond without var/body still defaults to { ok: true }', () => {
    const output = compilePipe(`pipe 'simple' {
  on api POST /api/test auth
  query "INSERT INTO items (name) VALUES ($body.name)"
  respond 201
}`);
    assert(output.includes('{ ok: true }'), 'bare respond should default to { ok: true }');
  });
});

describe('#157 bug 2: dot spacing cosmetic', () => {
  it('set with $result.lastInsertRowid has no spaces around dot', () => {
    const output = compilePipe(`pipe 'create' {
  on api POST /api/items auth
  query "INSERT INTO items (name) VALUES ($body.name)" as result
  set item_id = $result.lastInsertRowid
  respond 201 { id: $item_id }
}`);
    assert(!output.includes('result . last'), 'should NOT have spaces around dot');
    assert(output.includes('.lastInsertRowid'), 'should have clean dot access');
  });
});
