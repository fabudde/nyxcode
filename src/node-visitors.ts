/**
 * Node Visitor Registry — Maps AST node types to their compilation handlers.
 * 
 * Instead of a growing switch statement, new node types register their visitor here.
 * Each visitor receives the compiler instance (for state access) and the statement node.
 * 
 * Usage in compiler.ts:
 *   import { NODE_VISITORS } from './node-visitors.js';
 *   const visitor = NODE_VISITORS.get(stmt.type);
 *   if (visitor) return visitor(this, stmt);
 * 
 * Adding a new node type:
 *   1. Define handler in the relevant sub-module (e.g., form-compiler.ts)
 *   2. Register: NODE_VISITORS.set('MyNewNode', (ctx, stmt) => compileMyNewNode(ctx, stmt));
 *   3. Done — no switch statement to modify
 * 
 * NOTE: This is introduced incrementally. The switch in compileStatement() still works
 * and handles all existing types. New features SHOULD use this pattern.
 */

import type { Statement } from './ast.js';

// The visitor function type — receives compiler context (as any for now) and returns HTML string
export type NodeVisitor = (compiler: any, stmt: Statement) => string;

/** Registry of node type → visitor function */
export const NODE_VISITORS: Map<string, NodeVisitor> = new Map();

/**
 * Register a visitor for a node type.
 * Call this from sub-modules to extend the compiler without modifying compiler.ts.
 */
export function registerVisitor(nodeType: string, visitor: NodeVisitor): void {
  NODE_VISITORS.set(nodeType, visitor);
}
