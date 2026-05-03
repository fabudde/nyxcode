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
  | PresetNode | HeadStatement | KeyframesNode | EveryNode | ActionNode | OnEventNode | EnvNode | PipeNode
  | FnNode | TypeNode | TestNode;

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
  rateLimits?: RateLimit[]; // #174: per-endpoint rate limits
}

/** Rate limit definition for api blocks */
export interface RateLimit {
  max: number;
  window: string; // 'second' | 'minute' | 'hour' | 'day'
  windowMs: number; // computed milliseconds
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
  persist?: boolean;
  methods?: StoreMethod[];
}

export interface StoreMethod {
  name: string;
  params: string[];
  body: string;
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
  /** v0.31.0 — `theme { icons: lucide }` or `theme { icons: lucide cdn }` — icon pack support (#142) */
  icons?: { pack: string; mode: 'local' | 'cdn' };
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
  | RateLimitStatement
  | ExpectStatement
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
  | ConstStatement
  | EmailStatement
  | ActionCallStatement
  | IconStatement
  | FnNode;  // v0.50: fn in pages

/** `icon "name"` — renders an icon from the configured icon pack (#142) */
export interface IconStatement extends BaseNode {
  type: 'Icon';
  name: string;
  size?: number;
  style?: Array<{ name: string; value: string }>;
  classes?: string[];
}

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
  indexVar?: string;  // v0.50: each items -> item, i { }
  attributes?: Attribute[];
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
export interface RespondValue {
  value: string;
  isRef: boolean;  // true = variable reference, false = string literal
}

export interface RespondStatement extends BaseNode {
  type: 'Respond';
  status: number;
  body?: Record<string, string | RespondValue> | string;
}

/** `limit 10/min` */
export interface LimitStatement extends BaseNode {
  type: 'Limit';
  value: string;
}

/** `rate 10/min` — per-endpoint rate limiting (#174) */
export interface RateLimitStatement extends BaseNode {
  type: 'RateLimit';
  max: number;
  window: string; // 'second' | 'min' | 'minute' | 'hour' | 'day'
  windowMs: number;
}

/** `expect TypeName` — validate request body against a type (#176) */
export interface ExpectStatement extends BaseNode {
  type: 'Expect';
  typeName: string;
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
  | BooleanLiteral
  | ArrayLiteral
  | PropertyAccess
  | MemberExpression
  | IndexExpression
  | CallExpression
  | PipeExpression
  | UnaryExpression
  | BinaryExpression
  | TernaryExpression
  | StoreAccess
  | AwaitExpression
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

// v0.37: New expression types for full expressiveness

export interface BooleanLiteral extends BaseNode {
  type: 'BooleanLiteral';
  value: boolean;
}

export interface ArrayLiteral extends BaseNode {
  type: 'ArrayLiteral';
  elements: Expression[];
}

/** obj.prop or obj.method() — dot access on any expression */
export interface MemberExpression extends BaseNode {
  type: 'MemberExpression';
  object: Expression;
  property: string;
}

/** obj[expr] — bracket access */
export interface IndexExpression extends BaseNode {
  type: 'IndexExpression';
  object: Expression;
  index: Expression;
}

/** fn(args) or obj.method(args) */
export interface CallExpression extends BaseNode {
  type: 'CallExpression';
  callee: Expression;
  args: Expression[];
}

/** expr | builtin args — pipe built-in */
export interface PipeExpression extends BaseNode {
  type: 'PipeExpression';
  input: Expression;
  builtin: string;
  args: Expression[];
}

/** !expr or not expr or -expr */
export interface UnaryExpression extends BaseNode {
  type: 'UnaryExpression';
  operator: string;
  operand: Expression;
}

/** condition ? consequent : alternate */
export interface TernaryExpression extends BaseNode {
  type: 'TernaryExpression';
  condition: Expression;
  consequent: Expression;
  alternate: Expression;
}

/** await expr */
export interface AwaitExpression extends BaseNode {
  type: 'AwaitExpression';
  argument: Expression;
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
  propType?: string; // v0.50: type annotation (string, number, boolean, array, object)
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
  actionParams?: string[];
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

/** `const name = value` — non-reactive compile-time constant */
export interface ConstStatement extends BaseNode {
  type: 'Const';
  name: string;
  value: any;
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

// ── Pipe blocks (v0.32.0 — declarative logic chains) ──────────────────

/** `pipe 'name' { ... }` — declarative logic chain */
export interface PipeNode extends BaseNode {
  type: 'Pipe';
  name: string;
  trigger: PipeTrigger | null;
  steps: PipeStep[];
}

export type PipeTrigger =
  | PipeTriggerApi
  | PipeTriggerEvery
  | PipeTriggerWebhook
  | PipeTriggerEvent;

export interface PipeTriggerApi {
  type: 'PipeTrigger';
  kind: 'api';
  method: string;
  path: string;
  auth: boolean;
  middleware?: string[];
}

export interface PipeTriggerEvery {
  type: 'PipeTrigger';
  kind: 'every';
  interval: string;
  intervalMs: number;
}

export interface PipeTriggerWebhook {
  type: 'PipeTrigger';
  kind: 'webhook';
  method: string;
  path: string;
  secret?: string;
}

export interface PipeTriggerEvent {
  type: 'PipeTrigger';
  kind: 'event';
  table: string;
  event: string;
}

export type PipeStep =
  | PipeValidateStep
  | PipeQueryStep
  | PipeFetchStep
  | PipeSetStep
  | PipeTransformStep
  | PipeEachStep
  | PipeWhenStep
  | PipeOnChangeStep
  | PipeNotifyStep
  | PipeLogStep
  | PipeRespondStep
  | PipeAbortStep
  | PipeWebhookStep
  | PipeRunStep;

export interface PipeValidateCheck {
  kind: string;
  value?: string;
}

export interface PipeValidateField {
  field: string;
  checks: PipeValidateCheck[];
}

export interface PipeValidateStep {
  type: 'PipeValidate';
  fields: PipeValidateField[];
  line: number;
  col: number;
}

export interface PipeQueryStep {
  type: 'PipeQuery';
  sql: string;
  as?: string;
  line: number;
  col: number;
}

export interface PipeFetchStep {
  type: 'PipeFetch';
  url: string;
  options: Record<string, string>;
  line: number;
  col: number;
}

export interface PipeSetStep {
  type: 'PipeSet';
  name: string;
  expression: string;
  line: number;
  col: number;
}

export interface PipeTransformField {
  key: string;
  expr: string;
}

export interface PipeTransformStep {
  type: 'PipeTransform';
  fields: PipeTransformField[];
  line: number;
  col: number;
}

export interface PipeEachStep {
  type: 'PipeEach';
  collection: string;
  itemName: string;
  body: PipeStep[];
  line: number;
  col: number;
}

export interface PipeWhenStep {
  type: 'PipeWhen';
  condition: string;
  body: PipeStep[];
  elseBody?: PipeStep[];
  line: number;
  col: number;
}

export interface PipeOnChangeTransition {
  from: string;
  to: string;
  body: PipeStep[];
}

export interface PipeOnChangeStep {
  type: 'PipeOnChange';
  field: string;
  transitions: PipeOnChangeTransition[];
}

export interface PipeNotifyStep {
  type: 'PipeNotify';
  channel: string;
  params: Record<string, string>;
  line: number;
  col: number;
}

export interface PipeLogStep {
  type: 'PipeLog';
  message: string;
  line: number;
  col: number;
}

export interface PipeRespondStep {
  type: 'PipeRespond';
  status: number;
  body?: Record<string, string>;
  line: number;
  col: number;
}

export interface PipeAbortStep {
  type: 'PipeAbort';
  status: number;
  message: string;
  line: number;
  col: number;
}

export interface PipeWebhookStep {
  type: 'PipeWebhook';
  url: string;
  body?: Record<string, string>;
  line: number;
  col: number;
}

export interface PipeRunStep {
  type: 'PipeRun';
  pipeName: string;
  withParams?: Record<string, string>;
  line: number;
  col: number;
}

// ── v0.34: fn — user-defined functions ─────────────────────────────────

/** `fn name(params) { body }` or `fn name(params) = expr` */
export interface FnNode extends BaseNode {
  type: 'Fn';
  name: string;
  params: FnParam[];
  body: FnStatement[];
  /** If true, this is a single-expression function: `fn f(x) = x * 2` */
  shortForm: boolean;
  /** The raw expression for short-form functions */
  shortExpr?: string;
}

export interface FnParam {
  name: string;
  defaultValue?: string;
  typeAnnotation?: string;
}

export type FnStatement =
  | FnSetStatement
  | FnReturnStatement
  | FnMatchStatement
  | FnWhenStatement
  | FnTryStatement
  | FnThrowStatement
  | FnDeferStatement
  | FnExprStatement
  | FnEachStatement
  | FnPushStatement
  | FnPopStatement
  | FnRemoveStatement
  | FnShiftStatement
  | FnLetStatement
  | FnCallStatement;

/** v0.50: `push arr value` inside fn */
export interface FnPushStatement {
  type: 'FnPush';
  array: string;
  value: string;
  line: number;
  col: number;
}

/** v0.50: `pop arr` inside fn */
export interface FnPopStatement {
  type: 'FnPop';
  array: string;
  line: number;
  col: number;
}

/** v0.50: `remove arr index` inside fn */
export interface FnRemoveStatement {
  type: 'FnRemove';
  array: string;
  index: string;
  line: number;
  col: number;
}

/** v0.50: `shift arr` inside fn */
export interface FnShiftStatement {
  type: 'FnShift';
  array: string;
  line: number;
  col: number;
}

/** v0.50: `let x = expr` inside fn (local, non-reactive) */
export interface FnLetStatement {
  type: 'FnLet';
  name: string;
  value: string;
  line: number;
  col: number;
}

/** v0.50: `call fnName(args)` inside fn */
export interface FnCallStatement {
  type: 'FnCall';
  expr: string;
  line: number;
  col: number;
}

/** `set x = expression` inside fn */
export interface FnSetStatement {
  type: 'FnSet';
  name: string;
  expr: string;
  line: number;
  col: number;
}

/** `return expression` inside fn */
export interface FnReturnStatement {
  type: 'FnReturn';
  expr: string;
  line: number;
  col: number;
}

/** `match subject { pattern -> result }` */
export interface FnMatchStatement {
  type: 'FnMatch';
  subject: string;
  arms: MatchArm[];
  line: number;
  col: number;
}

export interface MatchArm {
  pattern: string;  // literal value or '_' for default
  body: FnStatement[] | string;  // statements or single expression
  isDefault: boolean;
}

/** `when condition { body }` inside fn (boolean check) */
export interface FnWhenStatement {
  type: 'FnWhen';
  condition: string;
  body: FnStatement[];
  elseBody?: FnStatement[];
  line: number;
  col: number;
}

/** `try { body } catch e { handler }` */
export interface FnTryStatement {
  type: 'FnTry';
  body: FnStatement[];
  catchParam?: string;
  catchBody: FnStatement[];
  deferBody?: FnStatement[];
  line: number;
  col: number;
}

/** `throw "message"` or `throw expr` */
export interface FnThrowStatement {
  type: 'FnThrow';
  expr: string;
  line: number;
  col: number;
}

/** `defer { body }` — runs on function exit */
export interface FnDeferStatement {
  type: 'FnDefer';
  body: FnStatement[];
  line: number;
  col: number;
}

/** Raw expression statement inside fn */
export interface FnExprStatement {
  type: 'FnExpr';
  expr: string;
  line: number;
  col: number;
}

/** `each collection -> item { body }` inside fn */
export interface FnEachStatement {
  type: 'FnEach';
  collection: string;
  item: string;
  body: FnStatement[];
  line: number;
  col: number;
}

// ── v0.34: type — custom data shapes ──────────────────────────────────

/** `type Name { field: constraint }` */
export interface TypeNode extends BaseNode {
  type: 'Type';
  name: string;
  fields: TypeField[];
}

export interface TypeField {
  name: string;
  constraint: string;
  optional: boolean;
  defaultValue?: string;
}

// ── v0.34: test — built-in test blocks ────────────────────────────────

/** `test "description" { assertions }` */
export interface TestNode extends BaseNode {
  type: 'Test';
  description: string;
  body: TestAssertion[];
}

export interface TestAssertion {
  kind: 'assert' | 'assertEq' | 'assertThrows';
  expr: string;
  expected?: string;
  message?: string;
  line: number;
  col: number;
}

// ── v0.35: stream — SSE streaming support ─────────────────────────────

/** Stream step inside a pipe: `stream fetch URL { ... }` */
export interface StreamFetchStep {
  type: 'StreamFetch';
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyExpr: string;
  line: number;
  col: number;
}

/** Frontend SSE consumer: `sse METHOD /url { body } -> stateVar` */
export interface SseConsumer {
  type: 'SseConsumer';
  method: string;
  url: string;
  bodyExpr: string;
  targetVar: string;
  mode: 'append' | 'replace';
  line: number;
  col: number;
}

// ===== v0.50: Event Handler AST =====

export type HandlerStatement =
  | HandlerSet
  | HandlerPush
  | HandlerPop
  | HandlerShift
  | HandlerRemove
  | HandlerEmit
  | HandlerLet
  | HandlerIf
  | HandlerMatch
  | HandlerFetch
  | HandlerNavigate
  | HandlerToast
  | HandlerCall
  | HandlerTryCatch
  | HandlerEach
  | HandlerFor
  | HandlerRaw;  // fallback for backward compat

export interface HandlerSet extends BaseNode { type: 'HandlerSet'; target: string; expr: string; }
export interface HandlerPush extends BaseNode { type: 'HandlerPush'; target: string; value: string; }
export interface HandlerPop extends BaseNode { type: 'HandlerPop'; target: string; }
export interface HandlerShift extends BaseNode { type: 'HandlerShift'; target: string; }
export interface HandlerRemove extends BaseNode { type: 'HandlerRemove'; target: string; index: string; }
export interface HandlerEmit extends BaseNode { type: 'HandlerEmit'; event: string; data?: string; }
export interface HandlerLet extends BaseNode { type: 'HandlerLet'; name: string; value: string; }
export interface HandlerIf extends BaseNode { type: 'HandlerIf'; condition: string; body: HandlerStatement[]; elseBody?: HandlerStatement[]; }
export interface HandlerMatch extends BaseNode { type: 'HandlerMatch'; expr: string; cases: { pattern: string; body: HandlerStatement[] }[]; }
export interface HandlerFetch extends BaseNode { type: 'HandlerFetch'; method: string; url: string; body?: string; target?: string; }
export interface HandlerNavigate extends BaseNode { type: 'HandlerNavigate'; path: string; }
export interface HandlerToast extends BaseNode { type: 'HandlerToast'; level: string; message: string; }
export interface HandlerCall extends BaseNode { type: 'HandlerCall'; fn: string; args: string[]; }
export interface HandlerTryCatch extends BaseNode { type: 'HandlerTryCatch'; tryBody: HandlerStatement[]; catchVar: string; catchBody: HandlerStatement[]; }
export interface HandlerEach extends BaseNode { type: 'HandlerEach'; collection: string; item: string; body: HandlerStatement[]; }
export interface HandlerFor extends BaseNode { type: 'HandlerFor'; variable: string; start: string; end: string; step?: string; body: HandlerStatement[]; }
export interface HandlerRaw extends BaseNode { type: 'HandlerRaw'; code: string; }

export interface EventHandlerNode extends BaseNode {
  type: 'EventHandler';
  event: string;
  modifiers: string[];
  body: HandlerStatement[];
}
