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

export type TopLevelNode = PageNode | ComponentNode | ApiNode | TableNode | StoreNode | ThemeNode | SecurityNode;

/** `page /path { ... }` */
export interface PageNode extends BaseNode {
  type: 'Page';
  path: string;
  body: Statement[];
}

/** `component Name { ... }` */
export interface ComponentNode extends BaseNode {
  type: 'Component';
  name: string;
  props: PropDef[];
  body: Statement[];
}

/** `api METHOD /path { ... }` */
export interface ApiNode extends BaseNode {
  type: 'Api';
  method: string;
  path: string;
  body: Statement[];
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

/** `theme { ... }` */
export interface ThemeNode extends BaseNode {
  type: 'Theme';
  sections: ThemeSection[];
}

/** `security { ... }` */
export interface SecurityNode extends BaseNode {
  type: 'Security';
  rules: SecurityRule[];
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
  | RawExpression;

/** `data varname = get/query/post ...` */
export interface DataStatement extends BaseNode {
  type: 'Data';
  name: string;
  typeAnnotation?: string;
  source: DataSource;
}

export interface DataSource {
  kind: 'get' | 'post' | 'query' | 'patch' | 'delete';
  value: string; // URL or SQL string
  body?: Record<string, string>;
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
}

/** `style { ... }` */
export interface StyleBlock extends BaseNode {
  type: 'Style';
  raw: boolean;
  properties: StyleProperty[];
  responsive?: ResponsiveBlock[];
  hover?: StyleProperty[];
}

export interface StyleProperty {
  name: string;
  value: string;
}

export interface ResponsiveBlock {
  breakpoint: string; // 'mobile' | 'tablet' | 'desktop'
  properties: StyleProperty[];
}

/** `form name { ... }` */
export interface FormStatement extends BaseNode {
  type: 'Form';
  name: string;
  body: Statement[];
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

// --- Supporting types ---

export interface PropDef {
  name: string;
  optional: boolean;
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
}

export interface SecurityRule {
  name: string;
  value: string;
}
