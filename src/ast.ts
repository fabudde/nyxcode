/**
 * NyxCode AST Node Types
 * 
 * The Abstract Syntax Tree represents the structure of a .nyx file.
 * Every construct in the language maps to exactly one node type.
 */

/** Base node — all AST nodes have a type and position */
export interface BaseNode {
  type: string;
  line: number;
  col: number;
}

/** Root node of a .nyx file */
export interface Program extends BaseNode {
  type: 'Program';
  body: TopLevelNode[];
}

export type TopLevelNode = PageNode | ComponentNode | ApiNode | TableNode | StoreNode | ThemeNode | SecurityNode | UseStatement | LayoutNode | ConfigNode | HookNode | MiddlewareNode | FootnotesStatement
  | PresetNode | HeadStatement | KeyframesNode | EveryNode | ActionNode | OnEventNode | EnvNode;

/** `keyframes name { 0% { ... } 50% { ... } 100% { ... } }` — top-level @keyframes definition (v0.25.0 #110) */
export interface KeyframesNode extends BaseNode {
  type: 'Keyframes';
  name: string;
  steps: Array<{ selector: string; properties: StyleProperty[] }>;
}

/** `page /path { ... }` */
export interface PageNode extends BaseNode {
  type: 'Page';
  path: string;
  body: Statement[];
  auth?: boolean;
}

/** `component Name { ... }` */
export interface ComponentNode extends BaseNode {
  type: 'Component';
  name: string;
  props: PropDef[];
  body: Statement[];
}

/** `api METHOD /path [auth] [guard=role] { ... }` */
export interface ApiNode extends BaseNode {
  type: 'Api';
  method: string;
  path: string;
  body: Statement[];
  auth?: boolean;
  guard?: string; // role name
  middleware?: string[]; // named middleware
}

/** `middleware name { before/after hooks }` */
export interface MiddlewareNode extends BaseNode {
  type: 'Middleware';
  name: string;
  body: string; // raw JS for Express middleware
}

/** `table name { ... }` */
export interface TableNode extends BaseNode {
  type: 'Table';
  name: string;
  columns: ColumnDef[];
}

/** `store name { ... }` */
export interface StoreNode extends BaseNode {
  type: 'Store';
  name: string;
  body: StoreField[];
}

/** `theme { ... }` or `theme dark { ... }` */
export interface ThemeNode extends BaseNode {
  type: 'Theme';
  sections: ThemeSection[];
  mode?: 'dark';         // If set, this is a dark-mode override theme
  preset?: string;       // v0.17.0 — `@theme "brutalist"` (preset name)
  name?: string;         // v0.23.0 — `@theme "brand-base" { ... }` (named theme, extractable as base)
  extends?: string;      // v0.23.0 — `@theme extends "./themes/base.nyx" { ... }` (inherits from named theme at path, token-merge only, not style-inheritance)
  /** v0.25.0 — `theme { body { bg #000; c #fff } }` — native body-level styles (#109) */
  body?: Array<{ name: string; value: string }>;
  /** v0.25.0 — `theme { selection { bg pink; c white } }` — native ::selection styles (#111) */
  selection?: Array<{ name: string; value: string }>;
  /** v0.25.0 — `theme { defaults { a { c #9b8ec4 } pre { font-family ... } } }` — element default styles wrapped in :where() for zero specificity (#112) */
  defaults?: Array<{ element: string; properties: Array<{ name: string; value: string }> }>;
}

/** `security { ... }` */
export interface SecurityNode extends BaseNode {
  type: 'Security';
  rules: SecurityRule[];
}

/** `use "./component.nyx"` — import third-party component */
export interface UseStatement extends BaseNode {
  type: 'Use';
  path: string;
  /** v0.30: package import mode */
  packageMode?: 'builtin' | 'npm';
  packageName?: string;
}

/** `layout { ... slot ... }` — wraps every page */
export interface LayoutNode extends BaseNode {
  type: 'Layout';
  body: Statement[];
}

// --- Statements (inside pages/components) ---

export type Statement =
  | DataStatement
  | EachStatement
  | WhenStatement
  | StyleBlock
  | FormStatement
  | AuthStatement
  | OnStatement
  | ElementNode
  | ValidateStatement
  | RespondStatement
  | LimitStatement
  | QueryStatement
  | StateStatement
  | EffectStatement
  | ComputedStatement
  | RawExpression
  | HeadStatement
  | AnimateStatement
  | PresetNode
  | ScriptStatement
  | FootnotesStatement
  | LetStatement
  | EmailStatement
  | ActionCallStatement;

/** `head { ... }` — inject into <head>: fonts, meta, raw CSS */
export interface HeadStatement extends BaseNode {
  type: 'Head';
  content: string; // Raw HTML to inject into <head>
}

/** `footnotes { 1 "..." 2 "..." }` — editorial footnote section. References use `[^N]` in text. */
export interface FootnotesStatement extends BaseNode {
  type: 'Footnotes';
  entries: Array<{ id: string; content: string }>;
}

/** `animate name { from { ... } to { ... } }` — @keyframes */
export interface AnimateStatement extends BaseNode {
  type: 'Animate';
  name: string;
  content: string; // Raw keyframe CSS
}

/** `data varname = get/query/post ...` */
export interface DataStatement extends BaseNode {
  type: 'Data';
  name: string;
  typeAnnotation?: string;
  source: DataSource;
  loadingBlock?: Statement[];
  errorBlock?: Statement[];
  emptyBlock?: Statement[];
  errorHandlers?: { status: number | '*'; action: string }[];
}

export interface DataSource {
  kind: 'get' | 'post' | 'query' | 'patch' | 'delete' | 'live';
  value: string; // URL or SQL string
  body?: Record<string, string>;
  auth?: boolean; // include JWT Bearer token
}

/** `each collection -> element { ... }` */
export interface EachStatement extends BaseNode {
  type: 'Each';
  collection: string;
  alias?: string;
  element: string;
  body: Statement[];
}

/** `when condition -> content` */
export interface WhenStatement extends BaseNode {
  type: 'When';
  condition: Expression;
  body: Statement[];
  elseBody?: Statement[];
  /**
   * Issue #114 — Compile-time `when` with `__double_underscore__` identifiers.
   * When true, the compiler evaluates `condition` at build time using `buildVars`
   * and emits either `body` or `elseBody` verbatim (no JS, no runtime check).
   * Parser sets this flag when any identifier inside `condition` matches
   * `__word__`. Regular runtime `when` (with dot-refs / state / stores) leaves
   * this unset.
   */
  compileTime?: boolean;
}

/** `style { ... }` */
export interface StyleBlock extends BaseNode {
  type: 'Style';
  raw: boolean;
  properties: StyleProperty[];
  responsive?: ResponsiveBlock[];
  hover?: StyleProperty[];
  focus?: StyleProperty[];
  active?: StyleProperty[];
  pseudoElements?: PseudoElementBlock[];
  cssRules?: CssRule[];
}

export interface PseudoElementBlock {
  selector: string; // 'before' | 'after'
  properties: StyleProperty[];
}

export interface StyleProperty {
  name: string;
  value: string;
}

export interface ResponsiveBlock {
  breakpoint: string; // 'mobile' | 'tablet' | 'desktop'
  properties: StyleProperty[];
}

export interface CssRule {
  selector: string;
  properties: StyleProperty[];
  /** If present, this is an @keyframes rule with step-based properties (supports shorthand expansion). */
  keyframeName?: string;
  keyframeSteps?: Array<{ selector: string; properties: StyleProperty[] }>;
  /** If present, this is an at-rule wrapper (e.g. @media, @supports, @container) that contains
   *  regular style properties which should go through full shorthand/theme resolution. */
  atRulePrelude?: string;  // e.g. "@media (min-width: 800px)" — written verbatim before the `{`
}

/** `form /api/path auth { ... success -> reload }` */
export interface FormStatement extends BaseNode {
  type: 'Form';
  name: string;       // legacy compat
  action?: string;    // URL path like /api/posts
  auth?: boolean;     // include JWT token
  body: Statement[];
  onSuccess?: FormAction;
  onError?: FormAction;
  errorHandlers?: { status: number | '*'; action: string }[];
}

export interface FormAction {
  kind: 'reload' | 'redirect' | 'clear' | 'toast';
  value?: string; // redirect path or toast message
}

/** `script { ... }` — raw JS block, no escaping */
export interface PresetNode {
  type: 'Preset';
  name: string;
  styles: Array<{name: string; value: string}>;
  line: number;
  col: number;
}

export interface ScriptStatement extends BaseNode {
  type: 'Script';
  content: string;
}

/** `auth required|admin|none` */
export interface AuthStatement extends BaseNode {
  type: 'Auth';
  level: string;
}

/** `on event -> action` */
export interface OnStatement extends BaseNode {
  type: 'On';
  event: string;
  action: string;
}

/** `validate { ... }` */
export interface ValidateStatement extends BaseNode {
  type: 'Validate';
  fields: ValidateField[];
}

export interface ValidateField {
  name: string;
  rules: string[];
}

/** `respond code { ... }` */
export interface RespondStatement extends BaseNode {
  type: 'Respond';
  status: number;
  body?: Record<string, string> | string;
}

/** `limit 10/min` */
export interface LimitStatement extends BaseNode {
  type: 'Limit';
  value: string;
}

/** `query "SQL"` (standalone in API) */
export interface QueryStatement extends BaseNode {
  type: 'Query';
  sql: string;
}

/** HTML-like elements: h1, p, button, card, etc. */
export interface ElementNode extends BaseNode {
  type: 'Element';
  tag: string;
  content?: string | Expression;
  attributes: Attribute[];
  children: Statement[];
}

export interface Attribute {
  name: string;
  value: string | Expression;
}

// --- Expressions ---

export type Expression =
  | StringLiteral
  | NumberLiteral
  | PropertyAccess
  | BinaryExpression
  | StoreAccess
  | Identifier;

export interface StringLiteral extends BaseNode {
  type: 'StringLiteral';
  value: string;
}

export interface NumberLiteral extends BaseNode {
  type: 'NumberLiteral';
  value: number;
}

export interface PropertyAccess extends BaseNode {
  type: 'PropertyAccess';
  path: string; // e.g., ".user.name"
}

export interface BinaryExpression extends BaseNode {
  type: 'BinaryExpression';
  left: Expression;
  operator: string;
  right: Expression;
}

export interface StoreAccess extends BaseNode {
  type: 'StoreAccess';
  store: string;
  field: string;
}

export interface Identifier extends BaseNode {
  type: 'Identifier';
  name: string;
}

export interface RawExpression extends BaseNode {
  type: 'RawExpression';
  value: string;
}

/** `state name = initialValue` — reactive state variable */
export interface StateStatement extends BaseNode {
  type: 'State';
  name: string;
  initialValue: Expression | string;
}

/** `effect { ... }` — side effect that runs when dependencies change */
export interface EffectStatement extends BaseNode {
  type: 'Effect';
  body: string;
  dependencies?: string[]; // auto-detected from body
}

/** `computed name = expression` — derived reactive value */
export interface ComputedStatement extends BaseNode {
  type: 'Computed';
  name: string;
  expression: string;
}

// --- Supporting types ---

export interface PropDef {
  name: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ColumnDef {
  name: string;
  type: string;
  constraints: string[];
}

export interface StoreField {
  name: string;
  visibility: 'public' | 'private';
  value?: string;
  isAction: boolean;
  actionBody?: string;
}

export interface ThemeSection {
  name: string; // 'colors', 'fonts', 'spacing', etc.
  entries: Record<string, string>;
  fontsMeta?: Record<string, FontMeta>; // metadata for font entries (source, localPath)
}

export interface FontMeta {
  family: string;
  source: 'google' | 'local' | 'stack';
  localPath?: string;
}

/** `config { env JWT_SECRET required }` */
export interface ConfigNode extends BaseNode {
  type: 'Config';
  envVars: EnvVar[];
  cors?: CorsConfig;
}

export interface EnvVar {
  name: string;
  required: boolean;
  defaultValue?: string;
}

/** `before|after METHOD /path { ... }` */
export interface HookNode extends BaseNode {
  type: 'Hook';
  timing: 'before' | 'after';
  method: string;
  path: string;
  body: Statement[];
}

export interface EveryNode extends BaseNode {
  type: 'Every';
  interval: string;       // e.g. '30s', '5m', '1h'
  intervalMs: number;     // computed milliseconds
  label?: string;         // optional label
  timeout?: string;       // optional max runtime per tick
  body: Statement[];      // query/fetch/update statements
}

export interface CorsConfig {
  origins: string[];
}

export interface SecurityRule {
  name: string;
  value: string;
}

/** `action name(params) { body }` - reusable server-side function (v0.30) */
export interface ActionNode extends BaseNode {
  type: 'Action';
  name: string;
  params: ActionParam[];
  body: ActionStatement[];
  errorHandler?: ActionStatement[];
}

export interface ActionParam {
  name: string;
  paramType?: string;
}

export type ActionStatement = LetStatement | QueryStatement | RespondStatement | EmailStatement | ActionCallStatement | ValidateStatement;

/** `let x = query "..." | expression` - variable binding (v0.30) */
export interface LetStatement extends BaseNode {
  type: 'Let';
  name: string;
  value: LetExpression;
}

export type LetExpression = 
  | { kind: 'query'; sql: string }
  | { kind: 'call'; target: string; method: string; args: string[] }
  | { kind: 'builtin'; fn: string; args: string[] }
  | { kind: 'arithmetic'; expr: string };

/** `on table.event { body }` - table lifecycle hooks (v0.30) */
export interface OnEventNode extends BaseNode {
  type: 'OnEvent';
  table: string;
  event: 'created' | 'updated' | 'deleted';
  body: ActionStatement[];
}

/** `env { KEY required }` - env var declarations (v0.30) */
export interface EnvNode extends BaseNode {
  type: 'Env';
  vars: EnvVar[];
}

export interface EnvVar {
  name: string;
  required: boolean;
  defaultValue?: string;
}

/** `email to=x subject=y body=z` - first-class email (v0.30) */
export interface EmailStatement extends BaseNode {
  type: 'Email';
  to: string;
  subject: string;
  body: string;
  template?: string;
}

/** `actionName(args)` - call a defined action (v0.30) */
export interface ActionCallStatement extends BaseNode {
  type: 'ActionCall';
  name: string;
  args: string[];
}
