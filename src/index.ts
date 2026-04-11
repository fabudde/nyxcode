/**
 * NyxCode — Main Entry Point
 * 
 * Public API for parsing .nyx files into ASTs.
 */

export { Lexer } from './lexer.js';
export { Parser } from './parser.js';
export * from './ast.js';
export * from './tokens.js';

import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Program } from './ast.js';

/**
 * Parse a NyxCode source string into an AST.
 * 
 * @param source - Raw .nyx source code
 * @returns Program AST node
 * 
 * @example
 * ```ts
 * import { parse } from 'nyxcode';
 * 
 * const ast = parse(`
 *   page / {
 *     h1 "Hello, NyxCode"
 *   }
 * `);
 * 
 * console.log(JSON.stringify(ast, null, 2));
 * ```
 */
export function parse(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}
