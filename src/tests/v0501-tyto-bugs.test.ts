import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

function compile(src: string): string {
  const tokens = new Lexer(src).tokenize();
  const ast = new Parser(tokens).parse();
  return new Compiler().compile(ast).html;
}

describe('v0.50.1 — Tyto Bug Report #207', () => {
  it('Bug 1: push + semicolon should not merge into push() call', () => {
    const src = `
page home {
  let items = []
  let newItem = ""
  input bind=newItem
  button "Add" {
    on click -> { push items newItem; set newItem = "" }
  }
  each items -> item {
    p "{item}"
  }
}
`;
    const html = compile(src);
    // The push should NOT have a semicolon inside it
    assert.ok(!html.includes('.push(newItem ;'), 'semicolon should not be inside push() variant 1');
    assert.ok(!html.includes('.push(newItem;'), 'semicolon should not be inside push() variant 2');
    // Should have proper push followed by separate set
    assert.ok(html.includes('.push('), 'should have push call');
  });

  it('Bug 2: ${item} in each should not get extra $ prepended', () => {
    const src = `
page home {
  let items = ["Owl", "Wolf", "Lobster"]
  each items -> item {
    span "\${item}"
  }
}
`;
    const html = compile(src);
    // Should NOT have $${item} (double dollar)
    assert.ok(!html.includes('$${item}'), 'should not have double $ before {item}');
  });
});
