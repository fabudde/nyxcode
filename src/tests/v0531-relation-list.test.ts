/**
 * v0.53.1 — Relation list endpoints must JOIN.
 *
 * Bug: tables with a relation column (`author [authors]`) generated GET-one and
 * POST responses with the nested related object, but the GET-*list* endpoint used
 * `SELECT *` and then applied the nested-object mapper — which needs the joined
 * `__<col>_id` columns — so every related field came back as `null`.
 *
 * Fix: the list endpoint (default + paginated) uses the join-aware SELECT, and
 * WHERE/search columns are table-qualified to avoid ambiguity with the joined table.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Lexer } from '../lexer.js';
import { compileBackend } from '../backend-compiler.js';

function backend(src: string): string {
  const ast: any = new Parser(new Lexer(src).tokenize()).parse();
  const tables = ast.body.filter((n: any) => n.type === 'Table');
  return compileBackend(tables, [], undefined, [], [], [], [], [], undefined, [], [], [], []);
}

const REL_SRC = `table authors {
  name text required
}
table posts {
  title text required
  author [authors]
}`;

describe('v0.53.1: relation list endpoints JOIN', () => {
  const code = backend(REL_SRC);

  // Isolate the posts list handler (everything in the GET /api/posts handler).
  const listBlock = code.slice(
    code.indexOf("app.get('/api/posts'"),
    code.indexOf("app.get('/api/posts/:id'"),
  );

  it('list query LEFT JOINs the related table (not a bare SELECT *)', () => {
    assert.ok(
      /LEFT JOIN authors ON posts\.author = authors\.id/.test(listBlock),
      'list query should LEFT JOIN authors',
    );
    assert.ok(
      !/SELECT \* FROM posts/.test(listBlock),
      'list query must not use SELECT * for a table with relations',
    );
  });

  it('list query selects the join columns the mapper needs', () => {
    assert.ok(/authors\.id AS __author_id/.test(listBlock), 'must alias __author_id');
    assert.ok(/authors\.name AS __author_name/.test(listBlock), 'must alias __author_name');
    assert.ok(/\.map\(mapRow_posts\)/.test(listBlock), 'must map rows to nested objects');
  });

  it('WHERE/search columns are table-qualified to avoid ambiguity', () => {
    assert.ok(
      /'posts\.' \+ key \+ ' = \?'/.test(listBlock),
      'filter columns should be qualified with posts.',
    );
    assert.ok(
      /'posts\.' \+ c \+ ' LIKE \?'/.test(listBlock),
      'search columns should be qualified with posts.',
    );
  });

  it('tables WITHOUT relations still use plain SELECT * (no regression)', () => {
    const authorsBlock = code.slice(
      code.indexOf("app.get('/api/authors'"),
      code.indexOf("app.get('/api/authors/:id'"),
    );
    assert.ok(/SELECT \* FROM authors/.test(authorsBlock), 'non-relation list stays SELECT *');
    assert.ok(!/LEFT JOIN/.test(authorsBlock), 'non-relation list has no JOIN');
    // And columns are NOT qualified (byte-identical to pre-fix output).
    assert.ok(/filters\.push\(key \+ ' = \?'\)/.test(authorsBlock), 'unqualified filter preserved');
  });
});
