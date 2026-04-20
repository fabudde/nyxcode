/**
 * CompilerContext — Shared state interface for compiler sub-modules.
 * 
 * Extracted modules receive this context to access/modify shared compiler state
 * without needing direct access to the Compiler class internals.
 * 
 * This prevents the #143-class of bugs where monolithic code hides dependencies,
 * and enables splitting compiler.ts into focused sub-modules.
 */

import { ComponentNode, Statement, StyleBlock, ElementNode, Expression, Attribute } from './ast.js';

export interface CompilerContext {
  // CSS output accumulator
  css: string[];
  // JS output accumulator
  js: string[];
  // Head injections (<link>, <script>, etc.)
  headInjections: string[];
  globalHeadInjections: string[];
  // Theme system
  themeVars: Map<string, string>;
  themeColorNames: Map<string, string>;
  darkThemeVars: Map<string, string>;
  themeDefaultElements: Set<string>;
  // Components
  components: Map<string, ComponentNode>;
  componentId: number;
  // Presets
  presets: Map<string, string>;
  // State management
  stateVars: Map<string, string>;
  computedVars: Map<string, string>;
  effects: string[];
  hasReactivity: boolean;
  // Stores
  stores: Map<string, { fields: Array<{name: string, value?: string, isAction: boolean, actionBody?: string}>, computed: Array<{name: string, expression: string}> }>;
  // Google Fonts
  googleFonts: string[];
  googleFontsInjected: boolean;
  // Icons (v0.31.0)
  iconPackConfig: { pack: string; prefix: string; css: string } | null;
  // Style dedup
  styleCache: Map<string, string>;
  // Animation
  animations: string[];
  topLevelKeyframes: Map<string, string>;
  // Misc
  indent: number;
  pageClass: string;
  scripts: string[];
  svgDepth: number;
  staticMode: boolean;
  usedInteractiveElements: Set<string>;
  refNames: string[];
}

/**
 * Column type keywords valid in table definitions.
 * Shared between parser (column type detection) and backend-compiler (SQL type mapping).
 * Prevents #143-class bugs where a keyword (e.g., 'email') isn't recognized as a valid type.
 */
export const COLUMN_TYPES = new Set(['text', 'email', 'number', 'int', 'float', 'decimal', 'bool', 'auto']);

/**
 * Column constraint keywords valid in table definitions.
 */
export const COLUMN_CONSTRAINTS = new Set(['required', 'unique', 'default', 'ref', 'auto', 'min', 'max', 'format', 'pattern', 'realtime', 'enum']);
