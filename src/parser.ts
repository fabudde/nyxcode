/**
 * NyxCode Parser
 *
 * Transforms a token stream into an Abstract Syntax Tree (AST).
 * Uses recursive descent parsing — simple, predictable, debuggable.
 *
 * Grammar (simplified):
 *   Program     → TopLevel* EOF
 *   TopLevel    → Page | Component | Api | Table | Store | Theme | Security
 *   Page        → 'page' PATH '{' Statement* '}'
 *   Component   → 'component' NAME '{' Statement* '}'
 *   Statement   → Data | Each | When | Style | Form | Auth | On | Element
 */

import { Token, TokenType } from "./tokens.js";
import { resolveTailwindClass } from "./tailwind-compat.js";
import { COLUMN_TYPES, COLUMN_CONSTRAINTS } from "./compiler-context.js";
import {
  Program,
  TopLevelNode,
  PageNode,
  ComponentNode,
  ApiNode,
  TableNode,
  StoreNode,
  ThemeNode,
  Statement,
  DataStatement,
  DataSource,
  EachStatement,
  WhenStatement,
  StyleBlock,
  StyleProperty,
  FormStatement,
  AuthStatement,
  OnStatement,
  ElementNode,
  Attribute,
  Expression,
  PropertyAccess,
  StringLiteral,
  NumberLiteral,
  StoreAccess,
  Identifier as IdentNode,
  PropDef,
  ColumnDef,
  StoreField,
  ThemeSection,
  ValidateStatement,
  ValidateField,
  RespondStatement,
  LimitStatement,
  QueryStatement,
  ResponsiveBlock,
  SecurityNode,
  SecurityRule,
  StateStatement,
  EffectStatement,
  ComputedStatement,
  UseStatement,
  HeadStatement,
  AnimateStatement,
  PseudoElementBlock,
  LayoutNode,
  KeyframesNode,
  ScriptStatement,
  FormAction,
  ConfigNode,
  EnvVar,
  HookNode,
  MiddlewareNode,
  PipeNode,
  PipeStep,
  PipeTrigger,
  PipeValidateCheck,
  PipeValidateField,
  FnNode,
  FnParam,
  FnStatement,
  FnMatchStatement,
  MatchArm,
  TypeNode,
  TypeField,
  TestNode,
  TestAssertion,
} from "./ast.js";

/** Set of tags that are recognized as built-in elements */
const ELEMENT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "text",
  "span",
  "link",
  "img",
  "picture",
  "video",
  "audio",
  "source",
  "track",
  "iframe",
  "button",
  "input",
  "select",
  "option",
  "optgroup",
  "checkbox",
  "radio",
  "toggle",
  "slider",
  "textarea",
  "card",
  "badge",
  "table",
  "list",
  "metric",
  "chart",
  "avatar",
  "tag",
  "alert",
  "toast",
  "modal",
  "tooltip",
  "progress",
  "spinner",
  "div",
  "row",
  "col",
  "grid",
  "stack",
  "container",
  "section",
  "aside",
  "nav",
  "footer",
  "header",
  "main",
  "article",
  "figure",
  "figcaption",
  "ul",
  "ol",
  "li",
  "a",
  "label",
  "form",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "small",
  "sup",
  "sub",
  "details",
  "summary",
  "canvas",
  "slot",
  "submit",
  "br",
  "hr",
  // SVG elements (#62)
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "use",
  "symbol",
  "marker",
  "mask",
  "clipPath",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "feGaussianBlur",
  "feColorMatrix",
  "feBlend",
  "feOffset",
  "feMerge",
  "feMergeNode",
  "feFlood",
  "feComposite",
  "feMorphology",
  "feTurbulence",
  "feDisplacementMap",
  "pattern",
  "image",
  "foreignObject",
  "title",
  "desc",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "mpath",
  "tspan",
  "textPath",
  "switch",
]);

const CSS_SHORTHANDS = new Set([
  "bg",
  "bgc",
  "bgi",
  "bgs",
  "bgp",
  "bgr",
  "r",
  "radius",
  "shadow",
  "tshadow",
  "op",
  "z",
  "pos",
  "t",
  "l",
  "b",
  "p",
  "pt",
  "pr",
  "pb",
  "pl",
  "px",
  "py",
  "m",
  "mt",
  "mr",
  "mb",
  "ml",
  "mx",
  "my",
  "gap",
  "gg",
  "w",
  "h",
  "minw",
  "maxw",
  "minh",
  "maxh",
  "mw",
  "mh",
  "miw",
  "mih",
  "fs",
  "fw",
  "ff",
  "lh",
  "ls",
  "ta",
  "td",
  "tt",
  "ws",
  "wb",
  "c",
  "border",
  "bt",
  "bb",
  "bl",
  "bc",
  "bw",
  "bs",
  "ai",
  "jc",
  "ac",
  "as",
  "fd",
  "fg",
  "fb",
  "fsk",
  "gc",
  "gr",
  "gtc",
  "gtr",
  "ga",
  "d",
  "of",
  "ox",
  "oy",
  "v",
  "cur",
  "tf",
  "tr",
  "anim",
  "fi",
  "pe",
  "us",
  "ap",
  "rs",
  "ol",
  "wc",
  "ct",
  "iso",
  "obf",
  "obp",
  "bf",
  "fil",
  "mix",
  "si",
  "sa",
  "ji",
  "js",
  "oc",
  "ow",
  "o",
  // Issue #118 — Missing CSS shorthands (v0.25.2)
  "cv",
  "sb",
  "osb",
  "osbx",
  "osby",
  "smt",
  "tof",
  "hy",
  "caret",
  "acc",
  "cs",
  "ar",
  "ind",
  "bv",
  "ps",
  "pso",
  "to",
  "trs",
  "wm",
  "dir",
  // Full CSS names that are common
  "background",
  "color",
  "padding",
  "margin",
  "width",
  "height",
  "display",
  "position",
  "top",
  "bottom",
  "left",
  "right",
  "font-size",
  "font-weight",
  "border-radius",
  "opacity",
  "overflow",
  "transition",
  "transform",
  "animation",
  "cursor",
  "box-shadow",
]);

/**
 * Issue #114 — Does an Expression subtree reference any `__xxx__` identifier?
 *
 * We mark `when` as compile-time if ANY identifier in the condition matches
 * `^__\w+__$`. This keeps things simple (mixed conditions are the user's bug)
 * and keeps runtime `when` (dot-refs, state, stores) untouched.
 */
export function isCompileTimeIdent(name: string): boolean {
  return /^__\w+__$/.test(name);
}

function hasCompileTimeIdentifier(expr: any): boolean {
  if (!expr || typeof expr !== "object") return false;
  if (
    expr.type === "Identifier" &&
    typeof expr.name === "string" &&
    isCompileTimeIdent(expr.name)
  ) {
    return true;
  }
  if (expr.type === "BinaryExpression") {
    return (
      hasCompileTimeIdentifier(expr.left) ||
      hasCompileTimeIdentifier(expr.right)
    );
  }
  // StringLiteral / NumberLiteral / PropertyAccess / StoreAccess — no nested expressions to scan
  return false;
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private braceStack: { line: number; col: number; context: string }[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  /**
   * Parse all tokens into a Program AST node.
   */
  parse(): Program {
    const body: TopLevelNode[] = [];

    while (!this.isAtEnd()) {
      const node = this.parseTopLevel();
      if (node) body.push(node);
    }

    return { type: "Program", body, line: 1, col: 1 };
  }

  // --- Top-level constructs ---

  private parseTopLevel(): TopLevelNode | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Page:
        return this.parsePage();
      case TokenType.Component:
        return this.parseComponent();
      case TokenType.Api:
        return this.parseApi();
      case TokenType.Table:
        return this.parseTable();
      case TokenType.Store:
        return this.parseStore();
      case TokenType.Theme:
        return this.parseTheme();
      case TokenType.Security:
        return this.parseSecurity();
      case TokenType.Config:
        return this.parseConfig();
      case TokenType.Before:
        return this.parseHook("before");
      case TokenType.After:
        return this.parseHook("after");
      case TokenType.Use:
        return this.parseUse() as any;
      case TokenType.Layout:
        return this.parseLayout();
      case TokenType.Preset:
        return this.parsePreset() as any;
      case TokenType.Keyframes:
        return this.parseTopLevelKeyframes() as any;
      case TokenType.Action:
        return this.parseAction();
      case TokenType.Env:
        return this.parseEnv();
      case TokenType.On:
        return this.parseOnEvent();
      case TokenType.Every:
        return this.parseEvery() as any;
      case TokenType.PipeBlock:
        return this.parsePipeBlock();
      case TokenType.Fn:
        return this.parseFnDeclaration();
      case TokenType.Type:
        return this.parseTypeDeclaration();
      case TokenType.Test:
        return this.parseTestBlock();
      case TokenType.Identifier:
        if (token.value === "middleware") return this.parseMiddleware();
        if (token.value === "meta") return this.parseMeta() as any;
        if (token.value === "footnotes") return this.parseFootnotes() as any;
        throw this.error(
          `Unexpected identifier '${token.value}' at top level.`,
        );
      case TokenType.EOF:
        return null;
      default:
        throw this.error(
          `Unexpected token '${token.value}' at top level. Expected: page, component, api, table, store, theme, security, layout, middleware, or preset.`,
        );
    }
  }

  private parsePage(): PageNode {
    const start = this.consume(TokenType.Page);
    const path = this.consumeIdentifier(); // path like /dashboard
    // v0.27.0 — page /dashboard auth { } marks page as requiring authentication
    let auth = false;
    if (this.check(TokenType.Auth)) {
      this.advance();
      auth = true;
    }
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: "Page", path, body, auth, line: start.line, col: start.col };
  }

  // v0.27.0 — `every 60s 'label' { ... }` background workers
  private parseEvery(): any {
    const start = this.consume(TokenType.Every);
    // Parse interval: 30s, 5m, 1h, etc.
    const intervalToken = this.advance();
    const interval = intervalToken.value;
    // Parse interval to milliseconds
    const match = interval.match(/^(\d+)(s|m|h)$/);
    if (!match)
      throw this.error(
        `Invalid interval '${interval}'. Use format: 30s, 5m, 1h`,
      );
    const num = parseInt(match[1]);
    const unit = match[2];
    const multiplier = unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000;
    const intervalMs = num * multiplier;
    if (intervalMs < 5000)
      throw this.error(`Interval must be at least 5s (got ${interval})`);
    // Optional label
    let label: string | undefined;
    if (this.check(TokenType.String)) {
      label = this.advance().value;
    }
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return {
      type: "Every",
      interval,
      intervalMs,
      label,
      body,
      line: start.line,
      col: start.col,
    };
  }

  // v0.32.0 — `pipe 'name' { ... }` declarative logic chains
  private parsePipeBlock(): PipeNode {
    const start = this.consume(TokenType.PipeBlock);
    // Parse pipe name (required string)
    const name = this.consume(TokenType.String).value;
    this.consume(TokenType.LeftBrace);
    // Parse pipe steps
    let trigger: PipeTrigger | null = null;
    const steps: PipeStep[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Skip newlines
      while (this.check(TokenType.Newline)) this.advance();
      if (this.check(TokenType.RightBrace)) break;
      const step = this.parsePipeStep();
      if (step) {
        if (step.type === "PipeTrigger") {
          trigger = step as any as PipeTrigger;
        } else {
          steps.push(step as PipeStep);
        }
      }
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "Pipe",
      name,
      trigger,
      steps,
      line: start.line,
      col: start.col,
    };
  }

  private parsePipeStep():
    | PipeStep
    | { type: "PipeTrigger"; [key: string]: any }
    | { type: "PipeOnChange"; [key: string]: any }
    | null {
    const token = this.peek();
    // on — trigger definitions
    if (token.type === TokenType.On) {
      return this.parsePipeTrigger();
    }
    // validate
    if (token.type === TokenType.Validate) {
      return this.parsePipeValidate();
    }
    // query
    if (token.type === TokenType.Query) {
      return this.parsePipeQuery();
    }
    // respond
    if (token.type === TokenType.Respond) {
      return this.parsePipeRespond();
    }
    // each
    if (token.type === TokenType.Each) {
      return this.parsePipeEach();
    }
    // when
    if (token.type === TokenType.When) {
      return this.parsePipeWhen();
    }
    // stream fetch — SSE streaming (v0.35)
    if (token.type === TokenType.Stream) {
      return this.parseStreamFetch();
    }
    // Identifier-based steps: set, transform, fetch, log, notify, abort, webhook, run
    if (token.type === TokenType.Identifier) {
      switch (token.value) {
        case "set":
          return this.parsePipeSet();
        case "transform":
          return this.parsePipeTransform();
        case "fetch":
          return this.parsePipeFetch();
        case "log":
          return this.parsePipeLog();
        case "notify":
          return this.parsePipeNotify();
        case "abort":
          return this.parsePipeAbort();
        case "webhook":
          return this.parsePipeWebhook();
        case "run":
          return this.parsePipeRun();
      }
    }
    // Skip unknown tokens
    this.advance();
    return null;
  }

  // Parse trigger: on api POST /path [auth] | on every 30s | on webhook POST /path [secret=$KEY] | on event table.created
  private parsePipeTrigger():
    | { type: "PipeTrigger"; [key: string]: any }
    | { type: "PipeOnChange"; [key: string]: any } {
    this.consume(TokenType.On);
    const kindToken = this.peek();
    // on api METHOD /path [auth]
    if (kindToken.type === TokenType.Api) {
      this.advance(); // consume 'api'
      const method = this.consumeIdentifier().toUpperCase();
      const path = this.consumeIdentifier();
      let auth = false;
      if (this.check(TokenType.Auth)) {
        this.advance();
        auth = true;
      }
      // Optional [middleware] bracket
      const middlewareNames: string[] = [];
      if (this.check(TokenType.LeftBracket)) {
        this.advance();
        while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
          middlewareNames.push(this.consumeIdentifier());
          if (this.check(TokenType.Comma)) this.advance();
        }
        this.consume(TokenType.RightBracket);
      }
      return {
        type: "PipeTrigger",
        kind: "api",
        method,
        path,
        auth,
        middleware: middlewareNames.length > 0 ? middlewareNames : undefined,
      };
    }
    // on every Xs
    if (kindToken.type === TokenType.Every) {
      this.advance(); // consume 'every'
      const intervalToken = this.advance();
      const interval = intervalToken.value;
      const match = interval.match(/^(\d+)(s|m|h)$/);
      if (!match)
        throw this.error(
          `Invalid interval '${interval}'. Use format: 30s, 5m, 1h`,
        );
      const num = parseInt(match[1]);
      const unit = match[2];
      const multiplier = unit === "s" ? 1000 : unit === "m" ? 60000 : 3600000;
      const intervalMs = num * multiplier;
      return { type: "PipeTrigger", kind: "every", interval, intervalMs };
    }
    // on webhook POST /path [secret=$KEY]
    if (
      kindToken.type === TokenType.Identifier &&
      kindToken.value === "webhook"
    ) {
      this.advance(); // consume 'webhook'
      const method = this.consumeIdentifier().toUpperCase();
      const path = this.consumeIdentifier();
      let secret: string | undefined;
      if (this.check(TokenType.LeftBracket)) {
        this.advance();
        while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
          const key = this.consumeIdentifier();
          if (key === "secret" && this.check(TokenType.Equals)) {
            this.advance(); // =
            // Handle $VARNAME (Dollar + Identifier)
            if (this.check(TokenType.Dollar)) {
              let val = this.advance().value;
              if (this.check(TokenType.Identifier)) {
                val += this.advance().value;
              }
              secret = val;
            } else {
              secret = this.advance().value;
            }
          }
          if (this.check(TokenType.Comma)) this.advance();
        }
        this.consume(TokenType.RightBracket);
      }
      return { type: "PipeTrigger", kind: "webhook", method, path, secret };
    }
    // on event table.eventname
    if (
      kindToken.type === TokenType.Identifier &&
      kindToken.value === "event"
    ) {
      this.advance(); // consume 'event'
      const tableName = this.consumeIdentifier();
      this.consume(TokenType.Dot);
      const event = this.consumeIdentifier();
      return { type: "PipeTrigger", kind: "event", table: tableName, event };
    }
    // on change $field { ... }
    if (
      kindToken.type === TokenType.Identifier &&
      kindToken.value === "change"
    ) {
      this.advance(); // consume 'change'
      // Handle $field (Dollar + Identifier)
      let field = this.advance().value;
      if (field === "$" && this.check(TokenType.Identifier))
        field += this.advance().value;
      this.consume(TokenType.LeftBrace);
      const transitions: Array<{ from: string; to: string; body: PipeStep[] }> =
        [];
      // Parse: old -> new { steps }
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        while (this.check(TokenType.Newline)) this.advance();
        if (this.check(TokenType.RightBrace)) break;
        const from = this.advance().value;
        this.consume(TokenType.Arrow); // ->
        const to = this.advance().value;
        this.consume(TokenType.LeftBrace);
        const body: PipeStep[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          const s = this.parsePipeStep();
          if (s && s.type !== "PipeTrigger") body.push(s as PipeStep);
        }
        this.consume(TokenType.RightBrace);
        transitions.push({ from, to, body });
      }
      this.consume(TokenType.RightBrace);
      return { type: "PipeOnChange", field, transitions };
    }
    throw this.error(`Unknown pipe trigger kind '${kindToken.value}'`);
  }

  // validate $body.field is email|url|number|string [min=X] [max=X]
  private parsePipeValidate(): PipeStep {
    this.consume(TokenType.Validate);
    const fields: PipeValidateField[] = [];
    // Parse multiple field validations until we hit a non-validate statement
    while (this.check(TokenType.Dollar)) {
      let fieldName = this.advance().value; // '$'
      // Consume the identifier part after $
      if (!this.isAtEnd() && !this.check(TokenType.Newline)) {
        fieldName += this.advance().value; // e.g. 'body'
      }
      // Handle $body.field with dot notation
      while (this.check(TokenType.Dot)) {
        this.advance();
        fieldName += "." + this.advance().value;
      }
      const checks: PipeValidateCheck[] = [];
      // 'is' keyword
      if (this.check(TokenType.Identifier) && this.peek().value === "is") {
        this.advance(); // consume 'is'
        // Parse check types separated by |
        const checkType = this.consumeIdentifier();
        checks.push({ kind: checkType });
        while (this.check(TokenType.Pipe)) {
          this.advance(); // |
          checks.push({ kind: this.consumeIdentifier() });
        }
      }
      // Optional [min=X] [max=X] constraints
      if (this.check(TokenType.LeftBracket)) {
        this.advance();
        while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
          const key = this.consumeIdentifier();
          if (this.check(TokenType.Equals)) {
            this.advance();
            const val = this.advance().value;
            checks.push({ kind: key, value: val });
          }
          if (this.check(TokenType.Comma)) this.advance();
        }
        this.consume(TokenType.RightBracket);
      }
      fields.push({ field: fieldName, checks });
    }
    return {
      type: "PipeValidate",
      fields,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // query "SQL with $var interpolation"
  private parsePipeQuery(): PipeStep {
    this.consume(TokenType.Query);
    const sql = this.consume(TokenType.String).value;
    // Optional 'as varname'
    let asVar: string | undefined;
    if (
      (this.check(TokenType.Identifier) || this.check(TokenType.As)) &&
      this.peek().value === "as"
    ) {
      this.advance();
      asVar = this.consumeIdentifier();
    }
    return {
      type: "PipeQuery",
      sql,
      as: asVar,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // fetch $url [timeout=Xs] [method=GET] [body={...}] [as varname]
  private parsePipeFetch(): PipeStep {
    this.advance(); // consume 'fetch'
    // Handle $variable (Dollar + Identifier) or string URL
    let url = this.advance().value;
    if (url === "$" && this.check(TokenType.Identifier)) {
      url += this.advance().value;
      // Handle $body.url
      while (this.check(TokenType.Dot)) {
        this.advance();
        url += "." + this.advance().value;
      }
    }
    const options: Record<string, string> = {};
    // Parse optional bracketed options
    if (this.check(TokenType.LeftBracket)) {
      this.advance();
      while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
        const key = this.consumeIdentifier();
        if (this.check(TokenType.Equals)) {
          this.advance();
          options[key] = this.advance().value;
        }
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightBracket);
    }
    // Optional 'as varname'
    if (
      (this.check(TokenType.Identifier) || this.check(TokenType.As)) &&
      this.peek().value === "as"
    ) {
      this.advance();
      options.as = this.consumeIdentifier();
    }
    return {
      type: "PipeFetch",
      url,
      options,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  /** Parse: `fetch "url" { method, headers, body }` — non-streaming HTTP request in api blocks */
  private parseApiFetch(): any {
    const start = this.advance(); // consume 'fetch'
    let url = this.advance().value;
    if (url === "$" && this.check(TokenType.Identifier)) {
      url = "$" + this.advance().value;
      while (this.check(TokenType.Dot)) {
        this.advance();
        url += "." + this.advance().value;
      }
    }
    let method = "GET";
    const headers: Record<string, string> = {};
    let bodyExpr = "";
    let asVar = "fetchResult";
    if (this.check(TokenType.LeftBrace)) {
      this.consume(TokenType.LeftBrace);
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.peek();
        if (key.type === TokenType.Identifier && key.value === "method") {
          this.advance();
          method = this.advance().value;
        } else if (
          key.type === TokenType.Identifier &&
          key.value === "headers"
        ) {
          this.advance();
          this.consume(TokenType.LeftBrace);
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            while (this.check(TokenType.Newline)) this.advance();
            if (this.check(TokenType.RightBrace)) break;
            const hKey = this.consumeIdentifier();
            if (this.check(TokenType.Colon)) this.advance();
            let hVal = "";
            while (
              !this.check(TokenType.RightBrace) &&
              !this.isAtEnd() &&
              !this.check(TokenType.Newline)
            ) {
              if (
                this.check(TokenType.Identifier) &&
                this.peekAt(1)?.type === TokenType.Colon
              )
                break;
              const t = this.peek();
              if (t.type === TokenType.Dollar) {
                hVal += this.advance().value;
                if (this.check(TokenType.Identifier))
                  hVal += this.advance().value;
                while (this.check(TokenType.Dot)) {
                  hVal += this.advance().value;
                  if (this.check(TokenType.Identifier))
                    hVal += this.advance().value;
                }
              } else {
                hVal += this.advance().value;
              }
            }
            headers[hKey] = hVal.trim();
          }
          this.consume(TokenType.RightBrace);
        } else if (key.type === TokenType.Identifier && key.value === "body") {
          this.advance();
          bodyExpr = this.collectPipeExpr(true, false);
        } else if (key.type === TokenType.Newline) {
          this.advance();
        } else {
          this.advance();
        }
      }
      this.consume(TokenType.RightBrace);
    }
    // Optional: `as varname`
    if (
      (this.check(TokenType.Identifier) || this.check(TokenType.As)) &&
      this.peek().value === "as"
    ) {
      this.advance();
      asVar = this.consumeIdentifier();
    }
    return {
      type: "ApiFetch",
      url,
      method,
      headers,
      bodyExpr,
      asVar,
      line: start.line,
      col: start.col,
    };
  }

  /** Parse: `file "path"` — read file contents at runtime */
  private parseApiFile(): any {
    const start = this.advance(); // consume 'file'
    const path = this.consume(TokenType.String).value;
    return { type: "ApiFile", path, line: start.line, col: start.col };
  }

  private parseStreamFetch(): any {
    const start = this.consume(TokenType.Stream);
    // Expect 'fetch' identifier after 'stream'
    const fetchKw = this.advance();
    if (fetchKw.value !== "fetch") {
      throw this.error("Expected 'fetch' after 'stream'");
    }
    // URL (string or $variable)
    let url = this.advance().value;
    if (url === "$" && this.check(TokenType.Identifier)) {
      url = "$" + this.advance().value;
      while (this.check(TokenType.Dot)) {
        this.advance();
        url += "." + this.advance().value;
      }
    }
    // Parse { method, headers, body } block
    let method = "POST";
    const headers: Record<string, string> = {};
    let bodyExpr = "";
    if (this.check(TokenType.LeftBrace)) {
      this.consume(TokenType.LeftBrace);
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.peek();
        if (key.type === TokenType.Identifier && key.value === "method") {
          this.advance();
          method = this.advance().value;
        } else if (
          key.type === TokenType.Identifier &&
          key.value === "headers"
        ) {
          this.advance();
          this.consume(TokenType.LeftBrace);
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            while (this.check(TokenType.Newline)) this.advance();
            if (this.check(TokenType.RightBrace)) break;
            const hKey = this.consumeIdentifier();
            if (this.check(TokenType.Colon)) this.advance();
            let hVal = "";
            while (
              !this.check(TokenType.RightBrace) &&
              !this.isAtEnd() &&
              !this.check(TokenType.Newline)
            ) {
              if (
                this.check(TokenType.Identifier) &&
                this.peekAt(1)?.type === TokenType.Colon
              )
                break;
              const t = this.peek();
              if (t.type === TokenType.Dollar) {
                hVal += this.advance().value;
                if (this.check(TokenType.Identifier))
                  hVal += this.advance().value;
                while (this.check(TokenType.Dot)) {
                  hVal += this.advance().value;
                  if (this.check(TokenType.Identifier))
                    hVal += this.advance().value;
                }
              } else {
                hVal += this.advance().value;
              }
            }
            headers[hKey] = hVal.trim();
          }
          this.consume(TokenType.RightBrace);
        } else if (key.type === TokenType.Identifier && key.value === "body") {
          this.advance();
          bodyExpr = this.collectPipeExpr(true, false);
        } else if (key.type === TokenType.Newline) {
          this.advance();
        } else {
          this.advance();
        }
      }
      this.consume(TokenType.RightBrace);
    }
    return {
      type: "StreamFetch",
      url,
      method,
      headers,
      bodyExpr,
      line: start.line,
      col: start.col,
    };
  }

  // Helper: collect expression tokens, merging $ with following identifier
  private collectPipeExpr(
    stopAtBrace: boolean = true,
    stopAtNewline: boolean = true,
  ): string {
    let expr = "";
    while (!this.isAtEnd()) {
      if (stopAtBrace && this.check(TokenType.RightBrace)) break;
      if (stopAtNewline && this.check(TokenType.Newline)) break;
      const t = this.peek();
      // Stop at keywords that start new pipe steps
      if (
        t.type === TokenType.On ||
        t.type === TokenType.Validate ||
        t.type === TokenType.Query ||
        t.type === TokenType.Respond ||
        t.type === TokenType.Each ||
        t.type === TokenType.When ||
        (t.type === TokenType.Identifier &&
          [
            "set",
            "transform",
            "fetch",
            "log",
            "notify",
            "abort",
            "webhook",
            "run",
          ].includes(t.value))
      ) {
        break;
      }
      if (t.type === TokenType.Dollar) {
        expr += t.value;
        this.advance();
      } else if (t.type === TokenType.String) {
        expr += '"' + t.value + '" ';
        this.advance();
      } else if (t.type === TokenType.Dot) {
        // No spaces around dots for clean property access (ctx.result.lastInsertRowid)
        expr = expr.trimEnd() + t.value;
        this.advance();
      } else {
        // No leading space if previous char is a dot
        if (expr.endsWith(".")) {
          expr += t.value + " ";
        } else {
          expr += t.value + " ";
        }
        this.advance();
      }
    }
    return expr.trim();
  }

  // set varname = expression
  private parsePipeSet(): PipeStep {
    this.advance(); // consume 'set'
    const name = this.consumeIdentifier();
    this.consume(TokenType.Equals);
    const expression = this.collectPipeExpr();
    return {
      type: "PipeSet",
      name,
      expression,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // transform { key: $var, key2: $var * 1.19 }
  private parsePipeTransform(): PipeStep {
    this.advance(); // consume 'transform'
    this.consume(TokenType.LeftBrace);
    const fields: Array<{ key: string; expr: string }> = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      while (this.check(TokenType.Newline) || this.check(TokenType.Comma))
        this.advance();
      if (this.check(TokenType.RightBrace)) break;
      const key = this.consumeIdentifier();
      this.consume(TokenType.Colon);
      // Collect value expression tokens (merge $ with identifier)
      let expr = "";
      while (
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.Comma) &&
        !this.check(TokenType.Newline) &&
        !this.isAtEnd()
      ) {
        const t = this.peek();
        if (t.type === TokenType.Dollar) {
          expr += t.value;
          this.advance();
        } else if (t.type === TokenType.String) {
          expr += '"' + t.value + '" ';
          this.advance();
        } else {
          expr += t.value + " ";
          this.advance();
        }
      }
      fields.push({ key, expr: expr.trim() });
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "PipeTransform",
      fields,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // each $collection as item { steps }
  private parsePipeEach(): PipeStep {
    this.consume(TokenType.Each);
    // Handle $collection (Dollar + Identifier)
    let collection = this.advance().value;
    if (collection === "$" && this.check(TokenType.Identifier)) {
      collection += this.advance().value;
    }
    let itemName = "item";
    if (
      (this.check(TokenType.Identifier) || this.check(TokenType.As)) &&
      this.peek().value === "as"
    ) {
      this.advance(); // consume 'as'
      itemName = this.consumeIdentifier();
    }
    this.consume(TokenType.LeftBrace);
    const body: PipeStep[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const step = this.parsePipeStep();
      if (step && step.type !== "PipeTrigger") body.push(step as PipeStep);
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "PipeEach",
      collection,
      itemName,
      body,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // when $condition { steps } [else { steps }]
  private parsePipeWhen(): PipeStep {
    this.consume(TokenType.When);
    // Collect condition tokens until {
    let condition = "";
    while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
      const t = this.peek();
      if (t.type === TokenType.Dollar) {
        // Merge $ with following identifier
        condition += t.value;
        this.advance();
      } else if (t.type === TokenType.String) {
        condition += '"' + t.value + '" ';
        this.advance();
      } else {
        condition += t.value + " ";
        this.advance();
      }
    }
    this.consume(TokenType.LeftBrace);
    const body: PipeStep[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const step = this.parsePipeStep();
      if (step && step.type !== "PipeTrigger") body.push(step as PipeStep);
    }
    this.consume(TokenType.RightBrace);
    let elseBody: PipeStep[] | undefined;
    if (this.check(TokenType.Else)) {
      this.advance(); // consume 'else'
      this.consume(TokenType.LeftBrace);
      elseBody = [];
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const step = this.parsePipeStep();
        if (step && step.type !== "PipeTrigger")
          elseBody.push(step as PipeStep);
      }
      this.consume(TokenType.RightBrace);
    }
    return {
      type: "PipeWhen",
      condition: condition.trim(),
      body,
      elseBody,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // notify email to=$var subject="..." body="..."
  // notify sms to=$var message="..."
  // notify webhook to=$url body={...}
  private parsePipeNotify(): PipeStep {
    this.advance(); // consume 'notify'
    const channel = this.consumeIdentifier(); // email | sms | webhook
    const params: Record<string, string> = {};
    // Parse key=value pairs
    while (this.check(TokenType.Identifier) || this.check(TokenType.Dollar)) {
      const key = this.consumeIdentifier();
      if (this.check(TokenType.Equals)) {
        this.advance();
        if (this.check(TokenType.String)) {
          params[key] = this.advance().value;
        } else if (this.check(TokenType.LeftBrace)) {
          // Inline object
          params[key] = JSON.stringify(this.consumePipeInlineObject());
        } else if (this.check(TokenType.Dollar)) {
          // Handle $variable
          let val = this.advance().value;
          if (this.check(TokenType.Identifier)) val += this.advance().value;
          while (this.check(TokenType.Dot)) {
            this.advance();
            val += "." + this.advance().value;
          }
          params[key] = val;
        } else {
          params[key] = this.advance().value;
        }
      }
    }
    return {
      type: "PipeNotify",
      channel,
      params,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // log "message with $var interpolation"
  private parsePipeLog(): PipeStep {
    this.advance(); // consume 'log'
    const message = this.consume(TokenType.String).value;
    return {
      type: "PipeLog",
      message,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // respond 201 { key: $var } OR respond 200 $variable OR respond 200 $var[0]
  private parsePipeRespond(): PipeStep {
    this.consume(TokenType.Respond);
    let status = 200;
    if (this.check(TokenType.Number)) {
      status = parseInt(this.advance().value);
    }
    let body: Record<string, string> | undefined;
    let varRef: string | undefined;
    if (this.check(TokenType.LeftBrace)) {
      body = this.consumePipeInlineObject();
    } else if (this.check(TokenType.Dollar)) {
      // respond 200 $variable or $variable[0] or $variable.field
      this.advance(); // consume $
      let ref = "$" + this.advance().value; // $varname
      // Handle dot access: $var.field
      while (this.check(TokenType.Dot)) {
        this.advance(); // consume .
        ref += "." + this.advance().value;
      }
      // Handle array access: $var[0]
      if (this.check(TokenType.LeftBracket)) {
        this.advance(); // consume [
        ref += "[" + this.advance().value + "]";
        if (this.check(TokenType.RightBracket)) this.advance(); // consume ]
      }
      varRef = ref;
    }
    return {
      type: "PipeRespond",
      status,
      body,
      varRef,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // abort 400 "error message"
  private parsePipeAbort(): PipeStep {
    this.advance(); // consume 'abort'
    let status = 400;
    if (this.check(TokenType.Number)) {
      status = parseInt(this.advance().value);
    }
    let message = "Error";
    if (this.check(TokenType.String)) {
      message = this.advance().value;
    }
    return {
      type: "PipeAbort",
      status,
      message,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // webhook "url" [body={...}]
  private parsePipeWebhook(): PipeStep {
    this.advance(); // consume 'webhook'
    const url = this.consume(TokenType.String).value;
    let body: Record<string, string> | undefined;
    if (this.check(TokenType.LeftBracket)) {
      this.advance();
      while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
        const key = this.consumeIdentifier();
        if (key === "body" && this.check(TokenType.Equals)) {
          this.advance();
          body = this.consumePipeInlineObject();
        }
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightBracket);
    }
    return {
      type: "PipeWebhook",
      url,
      body,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // run pipe 'other-pipe' [with { key: $var }]
  private parsePipeRun(): PipeStep {
    this.advance(); // consume 'run'
    // Expect 'pipe' keyword
    if (this.check(TokenType.PipeBlock)) {
      this.advance();
    }
    const pipeName = this.consume(TokenType.String).value;
    let withParams: Record<string, string> | undefined;
    if (this.check(TokenType.Identifier) && this.peek().value === "with") {
      this.advance();
      withParams = this.consumePipeInlineObject();
    }
    return {
      type: "PipeRun",
      pipeName,
      withParams,
      line: this.peek().line,
      col: this.peek().col,
    } as any;
  }

  // Helper: consume { key: value, key2: value2 } as a raw key-value map
  private consumePipeInlineObject(): Record<string, string> {
    this.consume(TokenType.LeftBrace);
    const obj: Record<string, string> = {};
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      while (this.check(TokenType.Newline) || this.check(TokenType.Comma))
        this.advance();
      if (this.check(TokenType.RightBrace)) break;
      const key = this.consumeIdentifier();
      this.consume(TokenType.Colon);
      // Collect value expression (merge $ with following identifier)
      let val = "";
      while (
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.Comma) &&
        !this.check(TokenType.Newline) &&
        !this.isAtEnd()
      ) {
        const t = this.peek();
        if (t.type === TokenType.Dollar) {
          val += t.value;
          this.advance();
        } else if (t.type === TokenType.String) {
          val += '"' + t.value + '" ';
          this.advance();
        } else {
          val += t.value + " ";
          this.advance();
        }
      }
      obj[key] = val.trim();
    }
    this.consume(TokenType.RightBrace);
    return obj;
  }

  private parseOnEvent(): any {
    const start = this.consume(TokenType.On);
    // on table.event { body }
    const tableName = this.consumeIdentifier();
    this.consume(TokenType.Dot);
    const event = this.consumeIdentifier();
    if (!["created", "updated", "deleted"].includes(event)) {
      throw this.error(
        `Invalid event '${event}'. Must be created, updated, or deleted.`,
      );
    }
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return {
      type: "OnEvent",
      table: tableName,
      event,
      body,
      line: start.line,
      col: start.col,
    };
  }

  private parseAction(): any {
    const start = this.consume(TokenType.Action);
    const name = this.consumeIdentifier();
    // Parse params: action name(param1, param2: type)
    const params: Array<{ name: string; paramType?: string }> = [];
    if (this.check(TokenType.LeftParen)) {
      this.advance(); // (
      while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
        const pname = this.consumeIdentifier();
        let paramType: string | undefined;
        if (this.check(TokenType.Colon)) {
          this.advance(); // :
          paramType = this.consumeIdentifier();
        }
        params.push({ name: pname, paramType });
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightParen);
    }
    this.consume(TokenType.LeftBrace);
    const body: any[] = [];
    let errorHandler: any[] | undefined;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.On) && this.peekNext()?.value === "error") {
        this.advance(); // on
        this.advance(); // error
        this.consume(TokenType.LeftBrace);
        errorHandler = this.parseBody();
        this.consume(TokenType.RightBrace);
      } else {
        body.push(...this.parseBody());
      }
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "Action",
      name,
      params,
      body,
      errorHandler,
      line: start.line,
      col: start.col,
    };
  }

  private parseEnv(): any {
    const start = this.consume(TokenType.Env);
    this.consume(TokenType.LeftBrace);
    const vars: Array<{
      name: string;
      required: boolean;
      defaultValue?: string;
    }> = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      while (this.check(TokenType.Newline)) this.advance();
      if (this.check(TokenType.RightBrace)) break;
      const varName = this.consumeIdentifier();
      let required = false;
      let defaultValue: string | undefined;
      if (
        this.check(TokenType.Identifier) &&
        this.peek().value === "required"
      ) {
        this.advance();
        required = true;
      } else if (
        this.check(TokenType.Identifier) &&
        this.peek().value === "default"
      ) {
        this.advance();
        if (this.check(TokenType.Equals)) this.advance();
        defaultValue = this.advance().value;
      }
      vars.push({ name: varName, required, defaultValue });
    }
    this.consume(TokenType.RightBrace);
    return { type: "Env", vars, line: start.line, col: start.col };
  }

  private parseComponent(): ComponentNode {
    const start = this.consume(TokenType.Component);
    const name = this.consumeIdentifier();

    // NEW (v0.20.0): Support `component nav(active, theme="light")` syntax (Kiro #75)
    // Keeps backwards-compat with `component NavBar { props ... }` block form.
    let props: PropDef[] = [];
    if (this.check(TokenType.LeftParen)) {
      this.advance(); // (
      while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
        const pname = this.consumeIdentifier();
        let optional = false;
        let defaultValue: string | undefined;
        if (this.check(TokenType.Question)) {
          this.advance();
          optional = true;
        }
        if (this.check(TokenType.Equals)) {
          this.advance();
          if (this.check(TokenType.String)) defaultValue = this.advance().value;
          else if (this.check(TokenType.Number))
            defaultValue = this.advance().value;
          else defaultValue = this.advance().value;
          optional = true;
        }
        props.push({ name: pname, optional, defaultValue });
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightParen);
    }

    this.consume(TokenType.LeftBrace);

    // Legacy block-form: `component X { props name?: type = default ... }`
    if (this.check(TokenType.Props)) {
      this.advance();
      props = [...props, ...this.parseProps()];
    }

    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return {
      type: "Component",
      name,
      props,
      body,
      line: start.line,
      col: start.col,
    };
  }

  private parseApi(): ApiNode {
    const start = this.consume(TokenType.Api);
    const method = this.consumeIdentifier().toUpperCase(); // GET, POST, etc.
    const path = this.consumeIdentifier(); // /api/stats

    // Check for optional 'auth' and 'guard=role' keywords before {
    let auth = false;
    let guard: string | undefined;

    let middlewareNames: string[] = [];
    while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.LeftBracket)) {
        this.advance(); // [
        while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
          middlewareNames.push(this.consumeIdentifier());
          if (this.check(TokenType.Comma)) this.advance();
        }
        if (this.check(TokenType.RightBracket)) this.advance(); // ]
      } else if (this.check(TokenType.Auth)) {
        this.advance();
        auth = true;
      } else if (
        this.check(TokenType.Identifier) &&
        this.peek().value === "guard"
      ) {
        this.advance(); // consume 'guard'
        if (this.check(TokenType.Equals)) {
          this.advance(); // consume '='
          guard = this.advance().value;
          auth = true; // guard implies auth
        }
      } else {
        break;
      }
    }

    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return {
      type: "Api",
      method,
      path,
      body,
      auth,
      guard,
      middleware: middlewareNames.length > 0 ? middlewareNames : undefined,
      line: start.line,
      col: start.col,
    } as any;
  }

  private parseHook(timing: "before" | "after"): HookNode {
    const start = this.advance(); // consume before/after
    const method = this.consumeIdentifier().toUpperCase();
    const path = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return {
      type: "Hook",
      timing,
      method,
      path,
      body,
      line: start.line,
      col: start.col,
    };
  }

  private parseMiddleware(): MiddlewareNode {
    const start = this.advance(); // consume 'middleware'
    const name = this.consumeIdentifier();
    // Lexer captures raw block content (handles backticks, template literals, etc.)
    this.consume(TokenType.LeftBrace);
    let body = "";
    // Check if lexer gave us a raw Script token (new path) or individual tokens (legacy)
    if (this.check(TokenType.Script)) {
      body = this.advance().value;
    } else {
      // Fallback: token-by-token (for cases without backticks)
      let depth = 1;
      while (depth > 0 && !this.isAtEnd()) {
        const t = this.advance();
        if (t.type === TokenType.LeftBrace) {
          depth++;
          body += "{ ";
        } else if (t.type === TokenType.RightBrace) {
          depth--;
          if (depth === 0) break;
          body += "} ";
        } else if (t.type === TokenType.String) {
          body += '"' + t.value + '" ';
        } else {
          body += t.value + " ";
        }
      }
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "Middleware",
      name,
      body: body.trim(),
      line: start.line,
      col: start.col,
    };
  }

  private parseConfig(): ConfigNode {
    const start = this.consume(TokenType.Config);
    this.consume(TokenType.LeftBrace);

    const envVars: EnvVar[] = [];
    let cors: { origins: string[] } | undefined;

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const kw = this.consumeIdentifier();

      if (kw === "env") {
        const name = this.consumeIdentifier();
        let required = false;
        let defaultValue: string | undefined;

        // Parse modifiers: required, default=value
        while (
          this.check(TokenType.Identifier) &&
          !this.check(TokenType.RightBrace)
        ) {
          const mod = this.peek().value;
          if (mod === "required") {
            this.advance();
            required = true;
          } else if (mod === "default") {
            this.advance();
            if (this.check(TokenType.Equals)) {
              this.advance();
              defaultValue = this.advance().value;
            }
          } else {
            break;
          }
        }

        envVars.push({ name, required, defaultValue });
      } else if (kw === "cors") {
        // cors * or cors https://myapp.com
        const origin = this.consume(TokenType.String).value;
        cors = { origins: [origin] };
      }
    }

    this.consume(TokenType.RightBrace);
    return { type: "Config", envVars, cors, line: start.line, col: start.col };
  }

  private parseTable(): TableNode {
    const start = this.consume(TokenType.Table);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    const columns: ColumnDef[] = [];
    const typeKeywords = COLUMN_TYPES;
    const constraintKeywords = COLUMN_CONSTRAINTS;

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Skip optional commas between columns (supports both inline and multi-line styles).
      // Issue #79: `table posts { title text required, body text, created auto }` previously
      // treated the `,` as a column name because consumeIdentifier() falls through to any token.
      while (this.check(TokenType.Comma)) this.advance();
      if (this.check(TokenType.RightBrace) || this.isAtEnd()) break;

      const colName = this.consumeIdentifier();
      let colType = "text"; // default type
      const constraints: string[] = [];

      // Next token should be the TYPE (text, email, number, etc.) or a table ref [tablename]
      if (
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.Comma) &&
        !this.isAtEnd()
      ) {
        const next = this.peek();
        if (next.type === TokenType.LeftBracket) {
          // Foreign key reference: [tablename]
          this.advance(); // consume [
          const refName = this.consumeIdentifier();
          this.consume(TokenType.RightBracket);
          colType = `[${refName}]`;
        } else if (this.isColumnType(next, typeKeywords)) {
          colType = this.advance().value;
        } else if (next.type === TokenType.Identifier) {
          colType = this.advance().value;
        }
      }

      // Rest are constraints until we hit the next column name, comma, or end
      while (
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.Comma) &&
        !this.isAtEnd()
      ) {
        const next = this.peek();
        if (
          next.type === TokenType.Identifier &&
          constraintKeywords.has(next.value)
        ) {
          const kw = this.advance().value;
          // Handle key=value pairs: min=3, max=500, format=email, default="user", pattern="^[a-z]+$"
          if (this.check(TokenType.Equals)) {
            this.advance(); // =
            const val = this.advance().value;
            constraints.push(kw + "=" + val);
          } else {
            constraints.push(kw);
          }
        } else {
          break; // Next column name or unknown token
        }
      }

      columns.push({ name: colName, type: colType, constraints });
    }

    this.consume(TokenType.RightBrace);
    return { type: "Table", name, columns, line: start.line, col: start.col };
  }

  private parseStore(): StoreNode {
    const start = this.consume(TokenType.Store);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    const body: StoreField[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const fieldToken = this.peek();
      let visibility: "public" | "private" = "public";

      if (fieldToken.value === "private" || fieldToken.value === "public") {
        visibility = fieldToken.value as "public" | "private";
        this.advance();
      }

      // Skip optional 'state' keyword inside store (just syntactic sugar)
      if (this.peek().type === TokenType.State) this.advance();
      // Handle 'computed' keyword inside store
      if (this.peek().type === TokenType.Computed) {
        this.advance();
        const compName = this.consumeIdentifier();
        this.consume(TokenType.Equals);
        let expr = "";
        let parenDepth = 0;
        while (!this.isAtEnd()) {
          const next = this.peek();
          if (next.type === TokenType.RightBrace && parenDepth === 0) break;
          if (next.type === TokenType.LeftParen) parenDepth++;
          if (next.type === TokenType.RightParen) parenDepth--;
          // Stop at next field declaration
          if (
            parenDepth === 0 &&
            (next.type === TokenType.State ||
              next.type === TokenType.Computed ||
              (next.type === TokenType.Identifier &&
                this.peekAt(1)?.type === TokenType.Equals))
          )
            break;
          const tok = this.advance();
          if (tok.type === TokenType.String) {
            expr += '"' + tok.value + '"';
          } else {
            expr += tok.value;
          }
        }
        body.push({
          name: compName,
          visibility,
          value: "__computed:" + expr.trim(),
          isAction: false,
        });
        continue;
      }

      const fieldName = this.consumeIdentifier();

      if (this.check(TokenType.Arrow)) {
        // Action: name -> { ... }
        this.advance(); // ->
        const actionBody = this.consumeBlock();
        body.push({ name: fieldName, visibility, isAction: true, actionBody });
      } else if (this.check(TokenType.Equals)) {
        // Field: name = value
        this.advance(); // =
        const value = this.advance().value;
        body.push({ name: fieldName, visibility, value, isAction: false });
      } else {
        body.push({ name: fieldName, visibility, isAction: false });
      }
    }

    this.consume(TokenType.RightBrace);
    return { type: "Store", name, body, line: start.line, col: start.col };
  }

  /**
   * v0.23.0 — consumes a theme section key, allowing numeric-prefix identifiers like `2xl`, `3xl`, `4xl`.
   * The lexer already merges `2xl` into a single Number token with string value `"2xl"`. We accept
   * that as a key if the value matches /^[0-9]+[a-zA-Z][a-zA-Z0-9_-]*$/.
   */
  private consumeThemeSectionKey(): string {
    const tok = this.peek();
    if (
      tok.type === TokenType.Number &&
      typeof tok.value === "string" &&
      /^[0-9]+[a-zA-Z][a-zA-Z0-9_-]*$/.test(tok.value)
    ) {
      this.advance();
      return tok.value;
    }
    return this.consumeIdentifier();
  }

  private parseTheme(): ThemeNode {
    const start = this.consume(TokenType.Theme);

    // v0.23.0 — `@theme as "name" { ... }` registers a named theme (extractable as base)
    let themeName: string | undefined;
    let themeExtends: string | undefined;
    if (
      (this.check(TokenType.Identifier) || this.check(TokenType.As)) &&
      this.peek().value === "as"
    ) {
      this.advance(); // consume 'as'
      if (!this.check(TokenType.String)) {
        throw this.error(
          'Expected string literal after `@theme as`, e.g. `@theme as "brand-base" { ... }`',
        );
      }
      themeName = this.advance().value;
    } else if (
      this.check(TokenType.Identifier) &&
      this.peek().value === "extends"
    ) {
      this.advance(); // consume 'extends'
      if (!this.check(TokenType.String)) {
        throw this.error(
          'Expected relative path string after `@theme extends`, e.g. `@theme extends "./base.nyx" { ... }`',
        );
      }
      const extPath = this.advance().value;
      if (!extPath.startsWith("./") && !extPath.startsWith("../")) {
        throw this.error(
          `@theme extends requires a relative file path starting with './' or '../', got: "${extPath}". Abstract names, URLs, and npm-style references are not allowed (supply-chain safety).`,
        );
      }
      themeExtends = extPath;
    }

    // Theme preset: theme "brutalist" (no braces needed)
    if (this.check(TokenType.String)) {
      const preset = this.advance().value;
      // Allow optional override block: theme "brutalist" { colors { ... } }
      const sections: ThemeSection[] = [];
      if (this.check(TokenType.LeftBrace)) {
        this.advance();
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          // Parse section inline
          const sectionName = this.consumeIdentifier();
          this.consume(TokenType.LeftBrace);
          const entries: Record<string, string> = {};
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            const key = this.consumeThemeSectionKey();
            // Skip optional colon after key (CSS habit: "primary: #fff")
            if (this.check(TokenType.Colon)) this.advance();
            let val = "";
            if (this.peek().type === TokenType.String)
              val = this.advance().value;
            else
              while (
                !this.check(TokenType.RightBrace) &&
                !this.check(TokenType.Identifier) &&
                !this.isAtEnd()
              )
                val += this.advance().value;
            entries[key] = val.trim();
          }
          this.consume(TokenType.RightBrace);
          sections.push({ name: sectionName, entries });
        }
        this.consume(TokenType.RightBrace);
      }
      return {
        type: "Theme",
        preset,
        sections,
        line: start.line,
        col: start.col,
      } as any;
    }

    // Check for dark mode variant: theme dark { ... }
    let mode: "dark" | undefined;
    if (this.check(TokenType.Identifier) && this.peek().value === "dark") {
      this.advance(); // consume 'dark'
      mode = "dark";
    }

    this.consume(TokenType.LeftBrace);

    const sections: ThemeSection[] = [];
    let bodyStyles: Array<{ name: string; value: string }> | undefined;
    let selectionStyles: Array<{ name: string; value: string }> | undefined;
    let defaultsList:
      | Array<{
          element: string;
          properties: Array<{ name: string; value: string }>;
        }>
      | undefined;
    let iconsConfig: { pack: string; mode: "local" | "cdn" } | undefined;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const sectionName = this.consumeIdentifier();

      // v0.31.0 — `icons: lucide` or `icons: lucide cdn` (#142)
      // Parsed as key-value, NOT a section with braces.
      if (sectionName === "icons") {
        if (this.check(TokenType.Colon)) this.advance(); // skip optional colon
        const pack = this.advance().value; // lucide, phosphor, tabler, etc.
        let iconMode: "local" | "cdn" = "local";
        if (this.check(TokenType.Identifier) && this.peek().value === "cdn") {
          this.advance();
          iconMode = "cdn";
        }
        // Skip optional trailing semicolon
        if (this.check(TokenType.Identifier) && this.peek().value === ";")
          this.advance();
        iconsConfig = { pack, mode: iconMode };
        continue;
      }

      this.consume(TokenType.LeftBrace);

      // v0.25.0 — `defaults { a { c #9b8ec4; td none } pre { ... } }` (#112)
      // Each sub-block is an element name; properties are parsed as native CSS
      // (preserving quoted strings for font-family stacks, commas for font stacks,
      // semicolons as property separators) and emitted by the compiler wrapped
      // in `:where(el) { ... }` so specificity stays at 0.
      if (sectionName === "defaults") {
        const defs: Array<{
          element: string;
          properties: Array<{ name: string; value: string }>;
        }> = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.peek().type !== TokenType.Identifier) break;
          // Eat stray leading semicolons between element blocks
          if (this.peek().value === ";") {
            this.advance();
            continue;
          }
          let element = this.advance().value;
          // v0.27.0 — support pseudo-selectors in defaults: input:focus, input::placeholder, etc.
          while (
            this.peek().type === TokenType.Colon ||
            (this.peek().value === ":" && !this.check(TokenType.LeftBrace))
          ) {
            element += this.advance().value; // : or ::
            if (this.peek().type === TokenType.Identifier) {
              element += this.advance().value; // focus, placeholder, etc.
            }
          }
          this.consume(TokenType.LeftBrace);
          const props: Array<{ name: string; value: string }> = [];
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            if (this.peek().type !== TokenType.Identifier) break;
            // Eat stray leading semicolons (lexed as Identifier ";")
            if (this.peek().value === ";") {
              this.advance();
              continue;
            }
            let prop = this.advance().value;
            // Vendor prefix rescue: `-webkit-foo` lexes as `-` + ident + ...
            if (prop === "-" && this.check(TokenType.Identifier)) {
              prop = "-" + this.advance().value;
            }
            // Glue subsequent `-ident` pairs (font-family, -webkit-font-smoothing, ...)
            while (
              this.peek()?.value === "-" &&
              this.peekAt(1)?.type === TokenType.Identifier
            ) {
              this.advance();
              prop = prop + "-" + this.advance().value;
            }
            // Optional colon (CSS habit)
            if (this.check(TokenType.Colon)) this.advance();
            const value = this.collectDefaultsValue();
            // Trailing `;` (lexed as Identifier ";")
            if (this.check(TokenType.Identifier) && this.peek().value === ";")
              this.advance();
            if (value) props.push({ name: prop, value });
          }
          this.consume(TokenType.RightBrace);
          if (props.length > 0) defs.push({ element, properties: props });
        }
        this.consume(TokenType.RightBrace);
        defaultsList = (defaultsList || []).concat(defs);
        continue;
      }

      // v0.25.0 — `body { ... }` / `selection { ... }` sections: parse as native CSS properties.
      // `body`      → emits a real `body { }` rule (#109).
      // `selection` → emits a real `::selection { }` rule (#111).
      if (sectionName === "body" || sectionName === "selection") {
        const styles: Array<{ name: string; value: string }> = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.peek().type !== TokenType.Identifier) break;
          let prop = this.advance().value;
          // Handle vendor prefixes: `-webkit-font-smoothing` lexes as `-` + ident + ...
          if (prop === "-" && this.check(TokenType.Identifier)) {
            prop = "-" + this.advance().value;
          }
          // Glue subsequent `-ident` pairs onto the property name (font-family, -webkit-font-smoothing, etc.)
          while (
            this.peek()?.value === "-" &&
            this.peekAt(1)?.type === TokenType.Identifier
          ) {
            this.advance(); // consume '-'
            prop = prop + "-" + this.advance().value;
          }
          // Skip optional colon (CSS habit: `bg: #000`)
          if (this.check(TokenType.Colon)) this.advance();
          const value = this.collectCSSValue();
          // Skip optional trailing semicolon (lexed as Identifier ";")
          if (this.check(TokenType.Identifier) && this.peek().value === ";")
            this.advance();
          if (value) styles.push({ name: prop, value });
        }
        this.consume(TokenType.RightBrace);
        if (sectionName === "body") {
          bodyStyles = (bodyStyles || []).concat(styles);
        } else {
          selectionStyles = (selectionStyles || []).concat(styles);
        }
        continue;
      }

      const entries: Record<string, string> = {};
      const fontsMeta: Record<
        string,
        {
          family: string;
          source: "google" | "local" | "stack";
          localPath?: string;
        }
      > = {};
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.consumeThemeSectionKey();
        // Skip optional colon after key (CSS habit: "primary: #fff")
        if (this.check(TokenType.Colon)) this.advance();
        // If next is a string literal, use directly
        if (this.peek().type === TokenType.String) {
          let strVal = this.advance().value;
          let strValLastLine = this.tokens[this.pos - 1].line;
          // Bug #91 fix (v0.23.2): for fonts, a comma-separated font-stack continuation must be
          // captured as part of THIS entry, not treated as a new key. Collect additional stack
          // parts until we hit (a) a newline followed by a known font-key, (b) `}`, or (c) EOF.
          // Stop at `source` too (handled below).
          const FONT_KEYS = new Set([
            "heading",
            "body",
            "mono",
            "code",
            "display",
            "ui",
            "sans",
            "serif",
          ]);
          while (sectionName === "fonts" && this.check(TokenType.Comma)) {
            // CRITICAL lookahead: if the token AFTER the comma is a known font-key followed
            // by a colon, this comma separates TWO entries, not a font-stack. Do NOT consume
            // the comma — let the outer loop handle it.
            const la1 = this.tokens[this.pos + 1]; // token after comma (doesn't exist? bail)
            const la2 = this.tokens[this.pos + 2]; // token after that
            if (
              la1 &&
              la1.type === TokenType.Identifier &&
              FONT_KEYS.has(la1.value) &&
              la2 &&
              la2.type === TokenType.Colon
            ) {
              // Comma separates entries: `body: "Inter", heading: "Playfair"`
              this.advance(); // consume comma
              break;
            }
            this.advance(); // consume comma
            const la = this.peek();
            if (la.type === TokenType.Identifier && la.value === "source")
              break;
            if (la.type === TokenType.RightBrace) break;
            // Collect one stack entry: a sequence of identifiers/strings on the current logical line.
            const stackParts: string[] = [];
            while (
              !this.check(TokenType.RightBrace) &&
              !this.check(TokenType.Comma) &&
              !this.isAtEnd()
            ) {
              const t = this.peek();
              if (t.type === TokenType.Identifier && t.value === "source")
                break;
              if (
                t.type === TokenType.Identifier &&
                FONT_KEYS.has(t.value) &&
                t.line > strValLastLine &&
                stackParts.length > 0
              )
                break;
              if (
                t.type === TokenType.Identifier &&
                FONT_KEYS.has(t.value) &&
                t.line > strValLastLine &&
                stackParts.length === 0
              ) {
                // Peek ahead: if after this identifier we find a `:`, it's definitely a new key.
                const next = this.tokens[this.pos + 1];
                if (next && next.type === TokenType.Colon) break;
              }
              stackParts.push(t.value);
              strValLastLine = t.line;
              this.advance();
            }
            if (stackParts.length > 0) {
              strVal += ", " + stackParts.join(" ");
            }
          }
          // For non-font sections: single trailing comma is still accepted.
          if (sectionName !== "fonts" && this.check(TokenType.Comma))
            this.advance();
          // For fonts: check for trailing `source: google` after string value + stack
          if (
            sectionName === "fonts" &&
            this.check(TokenType.Identifier) &&
            this.peek().value === "source"
          ) {
            this.advance(); // consume 'source'
            if (this.check(TokenType.Colon)) this.advance();
            const sourceType = this.consumeIdentifier();
            if (sourceType === "url") {
              const urlVal = this.check(TokenType.String)
                ? this.advance().value
                : "<unknown>";
              throw new Error(
                `[NyxCode Parser Error] External URL font sources are deprecated for security. ` +
                  `Use source: google or source: local path "..." instead. (line ${start.line})`,
              );
            } else if (sourceType === "google") {
              fontsMeta[key] = {
                family: strVal.split(",")[0].trim(),
                source: "google",
              };
            } else if (sourceType === "local") {
              if (
                this.check(TokenType.Identifier) &&
                this.peek().value === "path"
              )
                this.advance();
              const localPath = this.check(TokenType.String)
                ? this.advance().value
                : "";
              fontsMeta[key] = {
                family: strVal.split(",")[0].trim(),
                source: "local",
                localPath,
              };
            }
          }
          entries[key] = strVal;
          continue;
        }
        if (sectionName === "fonts") {
          // Fonts (non-string, e.g. `heading: Georgia, serif`).
          // Bug #91 fix (v0.23.2): comma-separated stacks must be collected as ONE entry.
          // Stop on: semicolon, `}`, newline-followed-by-new-key, or `source:` meta.
          const FONT_KEYS = new Set([
            "heading",
            "body",
            "mono",
            "code",
            "display",
            "ui",
            "sans",
            "serif",
          ]);
          const stackEntries: string[] = [];
          let currentParts: string[] = [];
          let lastTokLine = this.peek().line;
          const flushPart = () => {
            if (currentParts.length) {
              stackEntries.push(currentParts.join(" "));
              currentParts = [];
            }
          };
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            // Semicolons end the entry
            if (this.check(TokenType.Identifier) && this.peek().value === ";") {
              this.advance();
              break;
            }
            // Comma: flush current part, continue collecting next stack entry
            if (this.check(TokenType.Comma)) {
              this.advance();
              flushPart();
              continue;
            }
            // New-line + known font-key followed by `:` → next entry
            const t = this.peek();
            if (
              t.type === TokenType.Identifier &&
              FONT_KEYS.has(t.value) &&
              t.line > lastTokLine &&
              currentParts.length === 0
            ) {
              const next = this.tokens[this.pos + 1];
              if (next && next.type === TokenType.Colon) break;
            }
            // `source` keyword terminates stack collection (meta follows)
            if (
              t.type === TokenType.Identifier &&
              t.value === "source" &&
              (currentParts.length > 0 || stackEntries.length > 0)
            ) {
              break;
            }
            // New-line + known font-key when we already have content → previous entry ends
            if (
              t.type === TokenType.Identifier &&
              FONT_KEYS.has(t.value) &&
              t.line > lastTokLine &&
              (currentParts.length > 0 || stackEntries.length > 0)
            ) {
              const next = this.tokens[this.pos + 1];
              if (next && next.type === TokenType.Colon) break;
            }
            currentParts.push(this.advance().value);
            lastTokLine = t.line;
          }
          flushPart();
          // Preserve back-compat: single-entry stack gets space-joined (old semantic); multi-entry uses CSS `, `.
          const rawValue =
            stackEntries.length <= 1
              ? stackEntries[0] || ""
              : stackEntries.join(", ");

          // Check for trailing `source: google` / `source: local path "..."` / `source: url "..."`
          if (
            this.check(TokenType.Identifier) &&
            this.peek().value === "source"
          ) {
            this.advance(); // consume 'source'
            // Skip optional colon
            if (this.check(TokenType.Colon)) this.advance();
            const sourceType = this.consumeIdentifier();
            if (sourceType === "url") {
              // Hard error: third-party URL font sources are deprecated
              const urlVal = this.check(TokenType.String)
                ? this.advance().value
                : "<unknown>";
              throw new Error(
                `[NyxCode Parser Error] External URL font sources are deprecated for security. ` +
                  `Use source: google or source: local path "..." instead. (line ${start.line})`,
              );
            } else if (sourceType === "google") {
              fontsMeta[key] = { family: rawValue.trim(), source: "google" };
            } else if (sourceType === "local") {
              // Expect: path "..."
              if (
                this.check(TokenType.Identifier) &&
                this.peek().value === "path"
              ) {
                this.advance(); // consume 'path'
              }
              const localPath = this.check(TokenType.String)
                ? this.advance().value
                : "";
              fontsMeta[key] = {
                family: rawValue.trim(),
                source: "local",
                localPath,
              };
            } else {
              fontsMeta[key] = { family: rawValue.trim(), source: "stack" };
            }
          }

          entries[key] = rawValue;
        } else {
          // Colors/shadows/borders/radius/spacing/layouts/breakpoints: multi-word values supported.
          // Value continues until: `;`, `,`, `}`, OR next token is an Identifier on a NEW LINE.
          // This lets `divider: 1px solid color.border-subtle` span multiple words
          // while still allowing `primary: #fff\n  secondary: #000` to separate entries.
          //
          // Bug #86 fix: previously any identifier after value started = break → broke composite values.
          let parts: string[] = [];
          let parenDepth = 0;
          // Track line of the last consumed value token
          let lastValueLine = this.peek().line;
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            if (this.check(TokenType.LeftParen)) {
              parenDepth++;
              const t = this.advance();
              parts.push(t.value);
              lastValueLine = t.line;
              continue;
            }
            if (this.check(TokenType.RightParen)) {
              parenDepth--;
              const t = this.advance();
              parts.push(t.value);
              lastValueLine = t.line;
              continue;
            }
            if (parenDepth > 0) {
              const t = this.advance();
              parts.push(t.value);
              lastValueLine = t.line;
              continue;
            }
            if (this.check(TokenType.Comma)) {
              this.advance();
              break;
            }
            // Semicolons act as separators (lexed as Identifier with value ";")
            if (this.check(TokenType.Identifier) && this.peek().value === ";") {
              this.advance();
              break;
            }
            // NEW LINE heuristic: if next token starts a new key on a different line than
            // the last value token, AND we already have parts, stop.
            // v0.23.0: numeric-prefix keys like `2xl` come through as a single Number token
            // with a string value matching /^\d+[a-z]/ — treat those as key starts too.
            if (parts.length > 0 && this.peek().line > lastValueLine) {
              const t = this.peek();
              if (t.type === TokenType.Identifier) break;
              if (
                t.type === TokenType.Number &&
                typeof t.value === "string" &&
                /^[0-9]+[a-zA-Z]/.test(t.value)
              ) {
                break;
              }
            }
            const tok = this.advance();
            parts.push(tok.value);
            lastValueLine = tok.line;
          }
          // Join with spaces between alphabetic tokens; preserve tight-join for `color.primary`, `#fff`, numbers with units.
          // Strategy: join all parts with single space, then collapse spaces around `.` (so `color . primary` → `color.primary`).
          let joined = parts.join(" ");
          // Collapse spaces around dots: `foo . bar` → `foo.bar`
          joined = joined.replace(/\s*\.\s*/g, ".");
          // Tighten hex colors and units: the lexer emits `#` and hex as separate or joined tokens;
          // but numbers followed by units (e.g., `1 px`) should be `1px`. Handle common units:
          joined = joined.replace(
            /(\d)\s+(px|rem|em|%|vw|vh|fr|ms|s|deg|rad|turn)\b/g,
            "$1$2",
          );
          // Bug #102 fix: Normalize whitespace around parens and commas so CSS function
          // values like `rgba(20, 20, 37, 0.6)` and `linear-gradient(135deg, #e00, #a55)`
          // are preserved instead of emitted as `rgba ( 20 , 20 , 37 , 0.6 )` — browsers
          // silently ignore the malformed form with a space before `(`.
          // Safe because at parenDepth===0 the parser already breaks on commas, so any
          // `(`, `)`, or `,` in `parts` is guaranteed to be inside balanced parens.
          joined = joined.replace(/\s*\(\s*/g, "("); // `rgba ( 20` → `rgba(20`
          joined = joined.replace(/\s*\)/g, ")"); // `0.6 )` → `0.6)`
          joined = joined.replace(/\s*,\s*/g, ", "); // `20 , 20` → `20, 20`
          entries[key] = joined.trim();
        }
      }

      this.consume(TokenType.RightBrace);
      const section: ThemeSection = { name: sectionName, entries };
      if (Object.keys(fontsMeta).length > 0) section.fontsMeta = fontsMeta;
      sections.push(section);
    }

    this.consume(TokenType.RightBrace);
    const node: ThemeNode = {
      type: "Theme",
      sections,
      line: start.line,
      col: start.col,
    };
    if (mode) node.mode = mode;
    if (themeName) node.name = themeName;
    if (themeExtends) node.extends = themeExtends;
    if (bodyStyles && bodyStyles.length > 0) node.body = bodyStyles;
    if (selectionStyles && selectionStyles.length > 0)
      node.selection = selectionStyles;
    if (defaultsList && defaultsList.length > 0) node.defaults = defaultsList;
    if (iconsConfig) node.icons = iconsConfig;
    if (node.mode && (node.name || node.extends)) {
      throw this.error(
        "`@theme dark` cannot be combined with `as` or `extends`. Dark mode is a per-theme variant; declare it separately.",
      );
    }
    return node;
  }

  private parseSecurity(): SecurityNode {
    const start = this.consume(TokenType.Security);
    this.consume(TokenType.LeftBrace);

    const rules: SecurityRule[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Rule name: identifier or path like /api/posts
      let name = "";
      if (this.peek().value.startsWith("/")) {
        name = this.advance().value;
      } else {
        name = this.consumeIdentifier();
      }
      // Collect ALL values on this line (space-separated identifiers/paths)
      const values: string[] = [];
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        // Stop if next token looks like a new rule name (known keywords)
        const ruleKeywords = [
          "table",
          "login",
          "token",
          "protect",
          "hash",
          "session",
        ];
        if (
          values.length > 0 &&
          next.type === TokenType.Identifier &&
          ruleKeywords.includes(next.value)
        )
          break;
        if (values.length > 0 && next.value.startsWith("/")) break;
        if (
          next.type === TokenType.Identifier ||
          next.type === TokenType.String
        ) {
          const val = this.advance().value;
          // Handle key=value pairs like role=admin
          if (this.check(TokenType.Equals)) {
            this.advance(); // =
            const rhs = this.advance().value;
            values.push(val + "=" + rhs);
          } else {
            values.push(val);
          }
        } else if (next.value.startsWith("/")) {
          values.push(this.advance().value);
        } else {
          break;
        }
      }
      rules.push({ name, value: values.join(" ") });
    }

    this.consume(TokenType.RightBrace);
    return { type: "Security", rules, line: start.line, col: start.col };
  }

  /**
   * Parse `use "./component.nyx"` (import)
   * OR `use componentName(arg1, arg2, key=val)` (component invocation — Kiro #75)
   * OR `use componentName arg1="x" arg2="y"` (attribute form, also component invocation)
   */
  private parseUse(): UseStatement | ElementNode {
    const start = this.consume(TokenType.Use);

    // Form 1: `use "./path.nyx"` — import
    if (this.check(TokenType.String)) {
      const path = this.advance().value;
      return { type: "Use", path, line: start.line, col: start.col };
    }

    // Form 1b: `use npm:"package"` — Tier 2 raw npm import (v0.30)
    if (this.check(TokenType.Identifier) && this.peek().value === "npm") {
      this.advance(); // consume 'npm'
      if (this.check(TokenType.Colon)) this.advance(); // consume ':'
      const pkgName = this.consume(TokenType.String).value;
      return {
        type: "Use",
        path: pkgName,
        packageMode: "npm",
        packageName: pkgName,
        line: start.line,
        col: start.col,
      };
    }

    // Form 1c: `use stripe` — Tier 1 built-in adapter (v0.30)
    const TIER1_PACKAGES = [
      "stripe",
      "nodemailer",
      "redis",
      "bcrypt",
      "jsonwebtoken",
      "better-sqlite3",
      "sharp",
      "resend",
      "uuid",
    ];
    const BLOCKED_PACKAGES = [
      "child_process",
      "fs",
      "eval",
      "vm",
      "cluster",
      "worker_threads",
      "dgram",
      "net",
      "tls",
      "http2",
    ];
    if (
      this.check(TokenType.Identifier) &&
      TIER1_PACKAGES.includes(this.peek().value)
    ) {
      const pkgName = this.advance().value;
      return {
        type: "Use",
        path: pkgName,
        packageMode: "builtin",
        packageName: pkgName,
        line: start.line,
        col: start.col,
      };
    }

    // Form 2/3: `use componentName(...)` or `use componentName key=val`
    const name = this.consumeIdentifier();
    const attributes: Attribute[] = [];
    let posIndex = 0;

    if (this.check(TokenType.LeftParen)) {
      this.advance(); // (
      while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
        // Each arg: either `key=value` or positional `value`
        if (
          this.check(TokenType.Identifier) &&
          this.peekAt(1)?.type === TokenType.Equals
        ) {
          const key = this.advance().value;
          this.advance(); // =
          const tok = this.advance();
          attributes.push({ name: key, value: String(tok.value) });
        } else {
          const tok = this.advance();
          attributes.push({
            name: `__arg${posIndex++}`,
            value: String(tok.value),
          });
        }
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightParen);
    } else {
      // Attribute form: `use Name key=val key2=val2`
      while (
        this.check(TokenType.Identifier) &&
        this.peekAt(1)?.type === TokenType.Equals
      ) {
        const key = this.advance().value;
        this.advance(); // =
        const tok = this.advance();
        attributes.push({ name: key, value: String(tok.value) });
      }
    }

    // Return a ComponentInvocation element — compiler will resolve it via this.components map
    return {
      type: "Element",
      tag: name,
      attributes,
      children: [],
      line: start.line,
      col: start.col,
    } as ElementNode;
  }

  private parseLayout(): LayoutNode {
    const start = this.consume(TokenType.Layout);
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return { type: "Layout", body, line: start.line, col: start.col };
  }

  /**
   * Parse `head "..."` — raw HTML string injected into <head>.
   * Use for fonts, meta tags, third-party CSS.
   * Example: head "<link href='https://fonts.googleapis.com/...' rel='stylesheet'>"
   */
  private parseIcon(): import("./ast").IconStatement {
    const start = this.advance(); // consume 'icon'
    const name = this.consume(TokenType.String).value;
    let size: number | undefined;
    let style: Array<{ name: string; value: string }> | undefined;
    let classes: string[] | undefined;
    // Parse optional attributes: size=24, style={ c red; fs 2rem }, class="extra"
    while (
      (this.check(TokenType.Identifier) &&
        (this.peek().value === "size" || this.peek().value === "class")) ||
      this.check(TokenType.Style)
    ) {
      const attr = this.advance().value; // 'size', 'style', or 'class'
      if (this.check(TokenType.Equals)) this.advance(); // consume =
      if (attr === "size") {
        size = parseInt(this.advance().value, 10);
      } else if (attr === "style" && this.check(TokenType.LeftBrace)) {
        this.advance(); // consume {
        style = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.peek().type !== TokenType.Identifier) break;
          const prop = this.advance().value;
          if (this.check(TokenType.Colon)) this.advance();
          // Collect value tokens until semicolon or right brace
          let val = "";
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            const t = this.peek();
            // Semicolons separate properties
            if (t.type === TokenType.Identifier && t.value === ";") {
              this.advance();
              break;
            }
            // Next identifier on same/new line that looks like a property name → stop
            if (
              val &&
              t.type === TokenType.Identifier &&
              /^[a-z]/.test(t.value) &&
              this.peekAt(1)?.type !== TokenType.RightBrace
            ) {
              // Peek: if followed by a value token or colon, this is a new property
              const next = this.peekAt(1);
              if (
                next &&
                (next.type === TokenType.Colon ||
                  next.type === TokenType.Identifier ||
                  next.type === TokenType.Number ||
                  (next.value && next.value.startsWith("#")))
              )
                break;
            }
            val += (val ? " " : "") + this.advance().value;
          }
          if (val) style.push({ name: prop, value: val });
        }
        this.consume(TokenType.RightBrace); // consume style closing }
      } else if (attr === "class") {
        classes = this.advance().value.split(/\s+/);
      }
    }
    return {
      type: "Icon",
      name,
      size,
      style,
      classes,
      line: start.line,
      col: start.col,
    };
  }

  private parseHead(): HeadStatement {
    const start = this.consume(TokenType.Head);
    const content = this.consume(TokenType.String).value;
    return { type: "Head", content, line: start.line, col: start.col };
  }

  /**
   * Parse `meta { title "..."; description "..."; og:image "..." }`
   * Declarative page metadata — compiles to <title>, <meta>, <link> tags.
   * Supports: title, description, keywords, author, favicon, canonical, theme-color,
   *   viewport, robots, og:*, twitter:*
   * Output: HeadStatement with injected HTML.
   */
  private parseMeta(): HeadStatement {
    const start = this.consume(TokenType.Identifier); // 'meta'
    this.consume(TokenType.LeftBrace);

    const entries: Array<{ key: string; value: string }> = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Parse key — may be "og", then ":", then "title" (reassemble)
      if (!this.check(TokenType.Identifier)) {
        this.advance(); // skip unknown
        continue;
      }
      let key = this.advance().value;
      // Handle og:title, twitter:card, etc.
      while (
        this.check(TokenType.Colon) &&
        this.peekAt(1)?.type === TokenType.Identifier
      ) {
        this.advance(); // :
        key += ":" + this.advance().value;
      }
      // Handle hyphenated keys like theme-color (lexer may produce separate tokens)
      // In NyxCode lexer, 'theme-color' is a single identifier, so no special handling needed.

      // Value must be a string literal
      if (!this.check(TokenType.String)) {
        throw this.error(`Expected string value for meta key '${key}'.`);
      }
      const value = this.advance().value;
      entries.push({ key, value });

      // Optional comma or newline between entries
      while (this.check(TokenType.Comma)) this.advance();
    }

    this.consume(TokenType.RightBrace);

    const content = this.buildMetaHtml(entries);
    return { type: "Head", content, line: start.line, col: start.col };
  }

  /**
   * Parse `footnotes { 1 "Source text" 2 "Another source" }` — editorial footnote block (#68).
   * References in text use `[^N]` syntax (handled in compiler's escapeContent).
   */
  private parseFootnotes(): import("./ast").FootnotesStatement {
    const start = this.consume(TokenType.Identifier); // 'footnotes'
    this.consume(TokenType.LeftBrace);

    const entries: Array<{ id: string; content: string }> = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Accept either a number (1, 2, 3) or an identifier (note-a, intro, etc.) as the id
      const idTok = this.advance();
      if (
        idTok.type === TokenType.Identifier ||
        idTok.type === TokenType.Number ||
        idTok.type === TokenType.String
      ) {
        const id = String(idTok.value);
        // Followed by a string literal as the content
        if (!this.check(TokenType.String)) {
          throw this.error(`Expected string content after footnote id '${id}'`);
        }
        const content = this.advance().value;
        entries.push({ id, content });
      }
    }
    this.consume(TokenType.RightBrace);

    return { type: "Footnotes", entries, line: start.line, col: start.col };
  }

  /** Compile meta entries to <head> HTML. Escapes attribute values. */
  private buildMetaHtml(
    entries: Array<{ key: string; value: string }>,
  ): string {
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const parts: string[] = [];
    for (const { key, value } of entries) {
      const v = esc(value);
      if (key === "title") {
        parts.push(`<title>${v}</title>`);
      } else if (key === "favicon") {
        // Infer type from extension
        const ext = (value.split(".").pop() || "").toLowerCase();
        const typeMap: Record<string, string> = {
          svg: "image/svg+xml",
          png: "image/png",
          ico: "image/x-icon",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
        };
        const type = typeMap[ext];
        parts.push(
          `<link rel="icon"${type ? ` type="${type}"` : ""} href="${v}">`,
        );
      } else if (key === "canonical") {
        parts.push(`<link rel="canonical" href="${v}">`);
      } else if (key.startsWith("og:")) {
        parts.push(`<meta property="${key}" content="${v}">`);
      } else if (key.startsWith("twitter:")) {
        parts.push(`<meta name="${key}" content="${v}">`);
      } else {
        // description, keywords, author, viewport, theme-color, robots, generator, etc.
        parts.push(`<meta name="${key}" content="${v}">`);
      }
    }
    return parts.join("\n  ");
  }

  /**
   * Parse `animate name { ... }` — @keyframes definition.
   * Content between { } is raw CSS keyframe body.
   * Reconstructs proper CSS formatting from tokens.
   */
  private parseAnimate(): AnimateStatement {
    const start = this.consume(TokenType.Animate);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    let content = "";
    let depth = 1;
    let lastType = "";
    while (!this.isAtEnd() && depth > 0) {
      const tok = this.advance();
      if (tok.type === TokenType.LeftBrace) {
        depth++;
        content += "{ ";
        lastType = "{";
      } else if (tok.type === TokenType.RightBrace) {
        depth--;
        if (depth > 0) {
          content += "} ";
          lastType = "}";
        }
      } else if (tok.value === ":") {
        content += ": ";
        lastType = ":";
      } else if (tok.value === ";") {
        content += "; ";
        lastType = ";";
      } else if (tok.type === TokenType.Comma) {
        content += ", ";
        lastType = ",";
      } else {
        // Don't add space after { or : or ( or numbers (for 50% etc)
        if (lastType === "{" || lastType === ":" || lastType === "(") {
          content += tok.value;
        } else if (tok.type === TokenType.LeftParen) {
          content += tok.value;
          lastType = "(";
          continue;
        } else if (tok.type === TokenType.RightParen) {
          content += tok.value;
        } else if (tok.value === "%") {
          // Attach % directly to preceding number (50% not 50 %)
          content += tok.value;
        } else {
          content +=
            (content && lastType !== "{" && lastType !== ":" ? " " : "") +
            tok.value;
        }
        lastType = tok.type;
      }
    }
    return {
      type: "Animate",
      name,
      content: content.trim(),
      line: start.line,
      col: start.col,
    };
  }

  /**
   * Parse top-level `keyframes name { 0%, 100% { ... } 50% { ... } }` block (v0.25.0 #110).
   *
   * Structured parse — each step's properties go through `parseStyleProperty` so
   * they support CSS shorthand mappings (`tf`, `bg`, `c`, `op`, etc.) and theme tokens.
   *
   * Selector handling: `0%`, `100%`, `from`, `to`, or comma-separated lists like `0%, 100%`.
   * The lexer may emit `0%` as one Number token (its unit-handling treats `%` as a unit)
   * OR emit `0` + `%` as two tokens — we handle both shapes.
   */
  private parseTopLevelKeyframes(): KeyframesNode {
    const start = this.consume(TokenType.Keyframes);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    const steps: Array<{ selector: string; properties: StyleProperty[] }> = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Parse selector list until the next `{`.
      const selectorParts: string[] = [];
      while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
        const t = this.advance();
        if (t.type === TokenType.Comma) {
          selectorParts.push(",");
        } else if (t.value === "%") {
          // Attach `%` directly to the previous token (handles `0 %` → `0%`).
          if (selectorParts.length > 0) {
            selectorParts[selectorParts.length - 1] =
              selectorParts[selectorParts.length - 1] + "%";
          } else {
            selectorParts.push("%");
          }
        } else {
          selectorParts.push(t.value);
        }
      }
      const selector = selectorParts
        .join(" ")
        .replace(/\s*,\s*/g, ", ")
        .trim();

      this.consume(TokenType.LeftBrace);
      const stepProps: StyleProperty[] = [];
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        stepProps.push(this.parseStyleProperty());
      }
      this.consume(TokenType.RightBrace);

      steps.push({ selector, properties: stepProps });
    }
    this.consume(TokenType.RightBrace);

    return { type: "Keyframes", name, steps, line: start.line, col: start.col };
  }

  // --- Body parsing (statements inside { }) ---

  private parseBody(): Statement[] {
    const statements: Statement[] = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }

    return statements;
  }

  private parseStatement(): Statement | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Data:
        return this.parseData();
      case TokenType.Each:
        return this.parseEach();
      case TokenType.When:
        return this.parseWhen();
      case TokenType.Style:
        // Check if it's style="..." (attribute) or style { } (block)
        if (this.peekAt(1)?.type === TokenType.Equals) {
          return this.parseElement(); // treat as element attribute
        }
        return this.parseStyle();
      case TokenType.Form:
        return this.parseForm();
      case TokenType.Table:
        return this.parseElement(); // HTML <table> inside page body
      case TokenType.Script:
        return this.parseScript();
      case TokenType.Preset:
        return this.parsePreset();
      case TokenType.Auth:
        return this.parseAuth();
      case TokenType.On:
        return this.parseOn();
      case TokenType.Validate:
        return this.parseValidate();
      case TokenType.Respond:
        return this.parseRespond();
      case TokenType.Limit:
        return this.parseLimitStmt();
      case TokenType.Rate:
        return this.parseRateLimit();
      case TokenType.Expect:
        return this.parseExpect();
      case TokenType.Query:
        return this.parseQuery();
      case TokenType.Let:
        return this.parseLet();
      case TokenType.Const:
        return this.parseConst();
      // Email only as a statement when followed by to= (not inside elements like `input email`)
      case TokenType.Email:
        if (
          this.peekAt(1)?.type === TokenType.Identifier &&
          this.peekAt(1)?.value === "to"
        ) {
          return this.parseEmailStatement();
        }
        return this.parseElement();
      case TokenType.State:
        return this.parseState();
      case TokenType.Effect:
        return this.parseEffect();
      case TokenType.Computed:
        return this.parseComputed();
      case TokenType.Head:
        return this.parseHead();
      case TokenType.Animate:
        return this.parseAnimate();
      case TokenType.Use:
        return this.parseUse() as any;
      // v0.35: stream fetch in api blocks
      case TokenType.Stream:
        return this.parseStreamFetch() as any;
      case TokenType.Identifier:
      case TokenType.Identifier:
        // v0.35: fetch in api blocks (non-streaming)
        if (this.peek().value === "fetch") {
          return this.parseApiFetch() as any;
        }
        // v0.35: file "path" — read file at runtime
        if (this.peek().value === "file") {
          return this.parseApiFile() as any;
        }
        // v0.31.0 — icon element: `icon "name"` with optional size= and style= (#142)
        if (
          this.peek().value === "icon" &&
          this.peekAt(1)?.type === TokenType.String
        ) {
          return this.parseIcon();
        }
        // Meta block: meta { title "..."; description "..."; og:image "..." }
        if (
          this.peek().value === "meta" &&
          this.peekAt(1)?.type === TokenType.LeftBrace
        ) {
          return this.parseMeta();
        }
        // Footnotes block: footnotes { 1 "source" 2 "source" }
        if (
          this.peek().value === "footnotes" &&
          this.peekAt(1)?.type === TokenType.LeftBrace
        ) {
          return this.parseFootnotes();
        }
        // Lifecycle hooks: onMount { }, onDestroy { }
        if (
          (this.peek().value === "onMount" ||
            this.peek().value === "onDestroy") &&
          this.peekAt(1)?.type === TokenType.LeftBrace
        ) {
          const hookName = this.advance().value;
          // Find the Script token that the lexer captured for this block
          if (this.peek().type === TokenType.LeftBrace) {
            // Use consumeBlock but preserve string quotes
            this.advance(); // {
            let depth = 1;
            let body = "";
            while (depth > 0 && !this.isAtEnd()) {
              const t = this.advance();
              if (t.type === TokenType.LeftBrace) {
                depth++;
                body += "{ ";
              } else if (t.type === TokenType.RightBrace) {
                depth--;
                if (depth === 0) break;
                body += "} ";
              } else if (t.type === TokenType.String) {
                body += '"' + t.value + '" ';
              } else {
                body += t.value + " ";
              }
            }
            return {
              type: "Script",
              content: `__nyx_${hookName}:${body.trim()}`,
              line: this.tokens[this.pos - 1].line,
              col: this.tokens[this.pos - 1].col,
            } as ScriptStatement;
          }
          return this.parseElement();
        }
        return this.parseElement();
      case TokenType.Else:
        return null; // handled by parseWhen
      default:
        // Skip unknown tokens
        this.advance();
        return null;
    }
  }

  // --- Statement parsers ---

  private parseData(): DataStatement {
    const start = this.consume(TokenType.Data);
    const name = this.consumeIdentifier();

    let typeAnnotation: string | undefined;
    if (this.check(TokenType.Colon)) {
      this.advance(); // :
      typeAnnotation = this.consumeIdentifier();
    }

    this.consume(TokenType.Equals);

    const source = this.parseDataSource();

    // Optional { loading -> ..., error -> ..., empty -> ... } block
    let loadingBlock: Statement[] | undefined;
    let errorBlock: Statement[] | undefined;
    let emptyBlock: Statement[] | undefined;

    if (this.check(TokenType.LeftBrace)) {
      this.advance();
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        if (this.check(TokenType.Comma)) {
          this.advance();
          continue;
        }
        const keyword = this.peek();
        if (
          keyword.type === TokenType.Identifier &&
          ["loading", "error", "empty"].includes(keyword.value)
        ) {
          const which = this.advance().value;
          if (this.check(TokenType.Arrow)) this.advance(); // ->
          // Parse the block or single element
          if (this.check(TokenType.LeftBrace)) {
            this.advance();
            const body = this.parseBody();
            this.consume(TokenType.RightBrace);
            if (which === "loading") loadingBlock = body;
            else if (which === "error") errorBlock = body;
            else if (which === "empty") emptyBlock = body;
          } else {
            // Single element: loading -> p "Loading..."
            // Parse ONE element — consume tag + string content only, stop before next keyword
            const elemTag = this.consumeIdentifier();
            let elemContent: Expression | undefined;
            if (this.peek().type === TokenType.String) {
              elemContent = {
                type: "StringLiteral",
                value: this.advance().value,
                line: this.peek().line,
                col: this.peek().col,
              };
            }
            const elemNode: ElementNode = {
              type: "Element",
              tag: elemTag,
              content: elemContent,
              attributes: [],
              children: [],
              line: start.line,
              col: start.col,
            };
            if (which === "loading") loadingBlock = [elemNode];
            else if (which === "error") errorBlock = [elemNode];
            else if (which === "empty") emptyBlock = [elemNode];
          }
        } else {
          break;
        }
      }
      this.consume(TokenType.RightBrace);
    }

    // Parse optional catch handlers: catch 401 -> redirect "/login"
    const errorHandlers: { status: number | "*"; action: string }[] = [];
    while (this.check(TokenType.Identifier) && this.peek().value === "catch") {
      this.advance(); // consume 'catch'
      let status: number | "*";
      if (this.check(TokenType.Number)) {
        status = parseInt(this.advance().value);
      } else if (
        this.check(TokenType.Identifier) &&
        this.peek().value === "*"
      ) {
        this.advance();
        status = "*";
      } else if (this.peek().value === "*") {
        this.advance();
        status = "*";
      } else {
        status = "*";
      }
      if (this.check(TokenType.Arrow)) this.advance(); // ->
      let action = "";
      // Consume action tokens until next catch, closing brace, or next top-level statement
      // We must NOT use isStatementStart() here because action keywords like 'toast' are in ELEMENT_TAGS
      while (!this.isAtEnd()) {
        if (this.peek().type === TokenType.RightBrace) break;
        if (this.check(TokenType.Identifier) && this.peek().value === "catch")
          break;
        // Stop at known statement-starting KEYWORDS (not identifiers)
        const pt = this.peek().type;
        if (
          pt === TokenType.Data ||
          pt === TokenType.Each ||
          pt === TokenType.When ||
          pt === TokenType.Form ||
          pt === TokenType.State ||
          pt === TokenType.Style
        )
          break;
        // Stop at elements that are NOT catch-action keywords
        if (
          this.check(TokenType.Identifier) &&
          ELEMENT_TAGS.has(this.peek().value) &&
          !["redirect", "toast", "show", "reload", "clear"].includes(
            this.peek().value,
          ) &&
          action.length > 0
        )
          break;
        const tok = this.advance();
        if (tok.type === TokenType.String) action += '"' + tok.value + '" ';
        else action += tok.value + " ";
      }
      errorHandlers.push({ status, action: action.trim() });
    }

    return {
      type: "Data",
      name,
      typeAnnotation,
      source,
      loadingBlock,
      errorBlock,
      emptyBlock,
      errorHandlers: errorHandlers.length > 0 ? errorHandlers : undefined,
      line: start.line,
      col: start.col,
    };
  }

  private parseDataSource(): DataSource {
    const kindToken = this.advance();
    const kind = kindToken.value.toLowerCase() as DataSource["kind"];

    if (kind === "query") {
      const sql = this.consume(TokenType.String).value;
      return { kind: "query", value: sql };
    }

    // get/post/patch/delete — next token is the URL path
    // v0.27.0: accept quoted string for URLs with $param.X patterns
    let value: string;
    if (this.check(TokenType.String)) {
      value = this.advance().value;
    } else {
      value = this.consumeIdentifier();
    }
    let body: Record<string, string> | undefined;

    // Parse body { } only for POST/PATCH/DELETE — not GET (GET uses { } for loading/error/empty states)
    if (this.check(TokenType.LeftBrace) && kind !== "get" && kind !== "live") {
      this.advance();
      body = {};
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.consumeIdentifier();
        if (this.check(TokenType.Colon)) {
          this.advance();
          body[key] = this.advance().value;
        } else {
          body[key] = key; // shorthand: { name } = { name: name }
        }
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightBrace);
    }

    // Check for 'auth' keyword after path
    let auth = false;
    if (this.check(TokenType.Auth)) {
      this.advance();
      auth = true;
    } else if (
      this.check(TokenType.Identifier) &&
      this.peek().value === "auth"
    ) {
      this.advance();
      auth = true;
    }

    return { kind, value, body, auth };
  }

  private parseEach(): EachStatement {
    const start = this.consume(TokenType.Each);
    const collection = this.consumeIdentifier();

    let alias: string | undefined;
    if (this.peek().value === "as") {
      this.advance(); // 'as'
      alias = this.consumeIdentifier();
    }

    this.consume(TokenType.Arrow);
    const element = this.consumeIdentifier();

    // Parse optional attributes on the wrapper element (e.g. each items -> div preset=card flex=row { ... })
    const attributes: Attribute[] = [];
    while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
      const isAttrName =
        this.check(TokenType.Identifier) ||
        (this.peek().value && this.peekNext()?.value === "=");
      if (isAttrName && this.peekNext()?.value === "=") {
        const name = this.advance().value; // consume name (could be keyword token like 'preset')
        this.advance(); // =
        let value = "";
        if (this.check(TokenType.String)) {
          value = this.consume(TokenType.String).value;
        } else {
          value = this.advance().value;
          // Consume dotted paths like spacing.md, colors.primary
          while (this.check(TokenType.Dot)) {
            this.advance(); // .
            value += "." + this.advance().value;
          }
        }
        attributes.push({ name, value });
      } else if (this.check(TokenType.Identifier)) {
        // Bare attribute like 'center', 'between'
        const name = this.advance().value;
        attributes.push({ name, value: "true" });
      } else {
        break;
      }
    }

    let body: Statement[] = [];
    if (this.check(TokenType.LeftBrace)) {
      this.consume(TokenType.LeftBrace);
      body = this.parseBody();
      this.consume(TokenType.RightBrace);
    }

    return {
      type: "Each",
      collection,
      alias,
      element,
      attributes: attributes.length > 0 ? attributes : undefined,
      body,
      line: start.line,
      col: start.col,
    };
  }

  private parseWhen(): WhenStatement {
    const start = this.consume(TokenType.When);
    const condition = this.parseExpression();

    // Arrow is optional when followed by { }
    if (this.check(TokenType.Arrow)) {
      this.advance();
    }
    const body: Statement[] = [];

    if (this.check(TokenType.LeftBrace)) {
      this.consume(TokenType.LeftBrace);
      body.push(...this.parseBody());
      this.consume(TokenType.RightBrace);
    } else {
      const stmt = this.parseStatement();
      if (stmt) body.push(stmt);
    }

    let elseBody: Statement[] | undefined;
    if (this.check(TokenType.Else)) {
      this.advance(); // else
      if (this.check(TokenType.Arrow)) this.advance(); // optional arrow
      elseBody = [];
      if (this.check(TokenType.LeftBrace)) {
        this.consume(TokenType.LeftBrace);
        elseBody.push(...this.parseBody());
        this.consume(TokenType.RightBrace);
      } else {
        const stmt = this.parseStatement();
        if (stmt) elseBody.push(stmt);
      }
    }

    // Issue #114 — Compile-time `when`: if the condition references any
    // `__double_underscore__` identifier, mark the block so the compiler
    // evaluates it at build time using `--define` build vars.
    const compileTime = hasCompileTimeIdentifier(condition);

    return {
      type: "When",
      condition,
      body,
      elseBody,
      compileTime,
      line: start.line,
      col: start.col,
    };
  }

  private parseStyle(): StyleBlock {
    const start = this.consume(TokenType.Style);

    let raw = false;
    if (
      this.check(TokenType.Raw) ||
      (this.peek().type === TokenType.Identifier && this.peek().value === "raw")
    ) {
      raw = true;
      this.advance();
    }

    this.consume(TokenType.LeftBrace);

    const properties: StyleProperty[] = [];
    const responsive: ResponsiveBlock[] = [];
    let hover: StyleProperty[] | undefined;
    let focus: StyleProperty[] | undefined;
    let active: StyleProperty[] | undefined;
    const pseudoElements: PseudoElementBlock[] = [];

    const PSEUDO_CLASSES = new Set(["hover", "focus", "active"]);
    const EXTENDED_PSEUDO_CLASSES = new Set([
      "first-child",
      "last-child",
      "nth-child",
      "nth-of-type",
      "disabled",
      "enabled",
      "checked",
      "required",
      "optional",
      "focus-within",
      "focus-visible",
      "visited",
      "empty",
      "first-of-type",
      "last-of-type",
      "only-child",
      "not",
      "placeholder",
      "placeholder-shown",
    ]);
    const PSEUDO_ELEMENTS = new Set(["before", "after"]);
    const cssRules: Array<{
      selector: string;
      properties: StyleProperty[];
      keyframeName?: string;
      keyframeSteps?: Array<{ selector: string; properties: StyleProperty[] }>;
      atRulePrelude?: string;
    }> = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // CSS selector rule: .class { }, ::pseudo { }, tag { }
      if (
        this.check(TokenType.Dot) ||
        this.isCssSelectorStart() ||
        this.isCssPseudoSelector()
      ) {
        const selector = this.parseCssSelector();
        this.consume(TokenType.LeftBrace);
        const ruleProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          ruleProps.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
        cssRules.push({ selector, properties: ruleProps });
      } else if (this.check(TokenType.At)) {
        // Check: @keyframes → structured parse with shorthand support
        if (
          this.pos + 1 < this.tokens.length &&
          this.tokens[this.pos + 1].value === "keyframes"
        ) {
          this.advance(); // @
          this.advance(); // keyframes
          const animName = this.consumeIdentifier();
          this.consume(TokenType.LeftBrace);

          const steps: Array<{
            selector: string;
            properties: StyleProperty[];
          }> = [];

          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            // Parse selector: "0%", "50%", "from", "to", or "0%, 100%"
            const selectorParts: string[] = [];
            while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
              const t = this.advance();
              if (t.type === TokenType.Comma) {
                selectorParts.push(",");
              } else if (t.value === "%") {
                // Attach % directly to the previous token
                if (selectorParts.length > 0) {
                  selectorParts[selectorParts.length - 1] =
                    selectorParts[selectorParts.length - 1] + "%";
                }
              } else {
                selectorParts.push(t.value);
              }
            }
            const selector = selectorParts
              .join(" ")
              .replace(/\s*,\s*/g, ", ")
              .trim();

            this.consume(TokenType.LeftBrace);
            // Parse properties using regular parseStyleProperty (expands shorthands!)
            const kfProps: StyleProperty[] = [];
            while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
              kfProps.push(this.parseStyleProperty());
            }
            this.consume(TokenType.RightBrace);

            steps.push({ selector, properties: kfProps });
          }
          this.consume(TokenType.RightBrace);

          cssRules.push({
            selector: "__keyframes__",
            properties: [],
            keyframeName: animName,
            keyframeSteps: steps,
          });
        } else if (
          this.pos + 1 < this.tokens.length &&
          (this.tokens[this.pos + 1].value === "container" ||
            this.tokens[this.pos + 1].value === "media" ||
            this.tokens[this.pos + 1].value === "supports")
        ) {
          // Structured at-rule: @container(...), @media(...), @supports(...)
          // All wrap regular style properties — shorthands + theme colors get resolved.
          this.advance(); // @
          let prelude = "@" + this.advance().value; // 'container' | 'media' | 'supports'
          // Optionally a name before the parenthesis (@container foo(min-width: 400px))
          if (
            this.check(TokenType.Identifier) &&
            !this.check(TokenType.LeftParen)
          ) {
            prelude += " " + this.advance().value;
          }
          // Parse any number of space-separated parenthetical conditions + combinators (and, or, not)
          while (
            this.check(TokenType.LeftParen) ||
            (this.check(TokenType.Identifier) &&
              ["and", "or", "not"].includes(this.peek().value))
          ) {
            if (this.check(TokenType.Identifier)) {
              prelude += " " + this.advance().value;
              continue;
            }
            // Parenthesis group: (min-width: 800px) or (max-width: 1200px) etc.
            prelude += " (";
            this.advance(); // (
            let depth = 1;
            let first = true;
            while (depth > 0 && !this.isAtEnd()) {
              const t = this.peek();
              if (t.type === TokenType.LeftParen) {
                depth++;
                prelude += "(";
                this.advance();
                first = true;
                continue;
              }
              if (t.type === TokenType.RightParen) {
                depth--;
                this.advance();
                if (depth === 0) break;
                prelude += ")";
                continue;
              }
              if (t.type === TokenType.Colon) {
                prelude += ": ";
                this.advance();
                first = true;
                continue;
              }
              prelude += (first ? "" : " ") + this.advance().value;
              first = false;
            }
            prelude += ")";
          }
          this.consume(TokenType.LeftBrace);
          const atProps: StyleProperty[] = [];
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            atProps.push(this.parseStyleProperty());
          }
          this.consume(TokenType.RightBrace);
          cssRules.push({
            selector: "__atrule__",
            properties: atProps,
            atRulePrelude: prelude,
          });
        } else {
          // Responsive block: @mobile { ... }
          this.advance(); // @
          const breakpoint = this.consumeIdentifier();
          this.consume(TokenType.LeftBrace);
          const props: StyleProperty[] = [];
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            props.push(this.parseStyleProperty());
          }
          this.consume(TokenType.RightBrace);
          responsive.push({ breakpoint, properties: props });
        }
      } else if (PSEUDO_CLASSES.has(this.peek().value)) {
        // Pseudo-class block: hover { }, focus { }, active { }
        const name = this.advance().value;
        this.consume(TokenType.LeftBrace);
        const props: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          props.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
        if (name === "hover") hover = props;
        else if (name === "focus") focus = props;
        else if (name === "active") active = props;
      } else if (PSEUDO_ELEMENTS.has(this.peek().value)) {
        // Pseudo-element block: before { }, after { }
        const selector = this.advance().value;
        this.consume(TokenType.LeftBrace);
        const props: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          props.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
        pseudoElements.push({ selector, properties: props });
      } else if (
        this.peek().value === ">" ||
        this.peek().value === "~" ||
        this.peek().value === "+"
      ) {
        // Nested selector: > a { }, ~ p { }, + div { }
        const combinator = this.advance().value;
        let nestedSel = combinator + " ";
        while (
          !this.check(TokenType.LeftBrace) &&
          !this.check(TokenType.RightBrace) &&
          !this.isAtEnd()
        ) {
          const tok = this.advance();
          if (tok.type === TokenType.Colon) nestedSel += ":";
          else nestedSel += tok.value;
        }
        this.consume(TokenType.LeftBrace);
        const nestedProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          nestedProps.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
        cssRules.push({ selector: nestedSel.trim(), properties: nestedProps });
      } else if (
        this.peek().type === TokenType.Identifier &&
        EXTENDED_PSEUDO_CLASSES.has(this.peek().value)
      ) {
        let pseudoName = this.advance().value;
        let pseudoArgs = "";
        if (this.check(TokenType.LeftParen)) {
          this.advance();
          while (!this.check(TokenType.RightParen) && !this.isAtEnd())
            pseudoArgs += this.advance().value;
          this.advance();
        }
        const pseudoSel =
          ":" + pseudoName + (pseudoArgs ? "(" + pseudoArgs + ")" : "");
        this.consume(TokenType.LeftBrace);
        const pProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd())
          pProps.push(this.parseStyleProperty());
        this.consume(TokenType.RightBrace);
        cssRules.push({ selector: pseudoSel, properties: pProps });
      } else {
        properties.push(this.parseStyleProperty());
      }
    }

    this.consume(TokenType.RightBrace);
    return {
      type: "Style",
      raw,
      properties,
      responsive,
      hover,
      focus,
      active,
      pseudoElements: pseudoElements.length > 0 ? pseudoElements : undefined,
      cssRules: cssRules.length > 0 ? cssRules : undefined,
      line: start.line,
      col: start.col,
    };
  }

  /** Known CSS shorthand property names in NyxCode */
  private static CSS_PROPERTIES = new Set([
    // Full CSS property names
    "bg",
    "background",
    "color",
    "text",
    "padding",
    "margin",
    "border",
    "border-radius",
    "radius",
    "shadow",
    "box-shadow",
    "flex",
    "grid",
    "display",
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "width",
    "height",
    "max-width",
    "max-height",
    "min-width",
    "min-height",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "text-align",
    "text-decoration",
    "text-transform",
    "opacity",
    "overflow",
    "z-index",
    "cursor",
    "transition",
    "transform",
    "animation",
    "gap",
    "justify-content",
    "align-items",
    "flex-direction",
    "flex-wrap",
    "grid-template-columns",
    "margin-top",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "border-color",
    "border-width",
    "border-style",
    "border-top",
    "border-bottom",
    "border-left",
    "border-right",
    "outline",
    "outline-color",
    "outline-width",
    "outline-style",
    "list-style",
    "letter-spacing",
    "word-spacing",
    "white-space",
    "overflow-x",
    "overflow-y",
    "object-fit",
    "object-position",
    "background-color",
    "background-image",
    "background-size",
    "background-position",
    "text-shadow",
    "box-sizing",
    "vertical-align",
    "user-select",
    "pointer-events",
    "backdrop-filter",
    "filter",
    "grid-gap",
    "grid-template-rows",
    "grid-column",
    "grid-row",
    "place-items",
    "place-content",
    "align-content",
    "content",
    // NyxCode shorthands (must be here so style parser detects property boundaries)
    "bgc",
    "bgi",
    "bgs",
    "bgp",
    "bgr",
    "tshadow",
    "op",
    "z",
    "pos",
    "p",
    "pt",
    "pr",
    "pb",
    "pl",
    "px",
    "py",
    "m",
    "mt",
    "mr",
    "mb",
    "ml",
    "mx",
    "my",
    "gg",
    "w",
    "h",
    "minw",
    "maxw",
    "minh",
    "maxh",
    "mw",
    "mh",
    "miw",
    "mih",
    "fs",
    "fw",
    "ff",
    "lh",
    "ls",
    "ta",
    "td",
    "tt",
    "ws",
    "wb",
    "c",
    "bt",
    "bb",
    "bl",
    "bc",
    "bw",
    "bs",
    "r",
    "ai",
    "jc",
    "ac",
    "as",
    "fd",
    "fg",
    "fb",
    "fsk",
    "fxw",
    "fxs",
    "gc",
    "gr",
    "gtc",
    "gtr",
    "ga",
    "d",
    "of",
    "ox",
    "oy",
    "v",
    "cur",
    "tf",
    "tr",
    "anim",
    "fi",
    "pe",
    "us",
    "ap",
    "rs",
    "ol",
    "wc",
    "ct",
    "iso",
    // Typography utilities (#60)
    "tracking",
    "leading",
    "indent",
    "truncate",
    "line-clamp",
    "balance",
    "pretty",
    "caps",
    "lowercase",
    "capitalize",
    "columns",
    "col-gap",
    "col-count",
    "col-rule",
    "hyphens",
    "ww",
    // Grid areas + container (#55, #56)
    "areas",
    "area",
    "container",
    "container-name",
    "obf",
    "obp",
    "bf",
    "bdf",
    "fil",
    "mix",
    "si",
    "sa",
    "ji",
    "js",
    "oc",
    "ow",
    "o",
    "t",
    "l",
    "b",
    // Issue #118 — Missing CSS shorthands (v0.25.2)
    "cv",
    "sb",
    "osb",
    "osbx",
    "osby",
    "smt",
    "tof",
    "hy",
    "caret",
    "acc",
    "cs",
    "ar",
    "ind",
    "bv",
    "ps",
    "pso",
    "to",
    "trs",
    "wm",
    "dir",
  ]);

  /**
   * CSS properties whose values commonly contain commas as part of the value
   * (not as property separators). When parsing these properties, commas are
   * consumed as part of the value instead of ending the property.
   */
  private static COMMA_VALUE_PROPERTIES = new Set([
    // Full CSS property names
    "font-family",
    "font",
    "transition",
    "animation",
    "background",
    "background-image",
    "shadow",
    "box-shadow",
    "text-shadow",
    "grid-template-columns",
    "grid-template-rows",
    "grid-template-areas",
    "transform",
    "filter",
    "backdrop-filter",
    // v0.25.0 — Bug #115: Shorthands whose values can span multiple
    // comma-separated parts (e.g., two gradients, multiple shadows).
    // Without these, `bg radial-gradient(...), radial-gradient(...)` was
    // split on the top-level comma and the second gradient became its own
    // (invalid) property declaration.
    "bg",
    "bgi",
    "tshadow",
    "ff",
    "tr",
    "tf",
    "anim",
    "fi",
    "fil",
    "bdf",
    "bf",
    "gtc",
    "gtr",
  ]);

  /**
   * Check if current position looks like a CSS selector start.
   * Detects: tag-name followed by { or :pseudo {, but NOT CSS property names.
   */
  /**
   * Check for :: pseudo-element selectors at top of style block (e.g., ::selection { })
   */
  private isCssPseudoSelector(): boolean {
    if (!this.check(TokenType.Colon)) return false;
    // :: requires two colons
    if (
      this.pos + 1 >= this.tokens.length ||
      this.tokens[this.pos + 1].type !== TokenType.Colon
    )
      return false;
    // Then an identifier like 'selection', 'before', 'after', etc.
    if (
      this.pos + 2 >= this.tokens.length ||
      this.tokens[this.pos + 2].type !== TokenType.Identifier
    )
      return false;
    // Then eventually a {
    let i = this.pos + 3;
    while (
      i < this.tokens.length &&
      this.tokens[i].type !== TokenType.LeftBrace &&
      this.tokens[i].type !== TokenType.RightBrace
    )
      i++;
    return (
      i < this.tokens.length && this.tokens[i].type === TokenType.LeftBrace
    );
  }

  private isCssSelectorStart(): boolean {
    // Check: identifier followed by { or identifier:pseudo {
    // Accept Identifier OR keyword tokens that double as HTML tags (table, form, select)
    const tok = this.peek();
    const isIdent = tok.type === TokenType.Identifier;
    const isKeywordTag =
      tok.type === TokenType.Table || tok.type === TokenType.Form;
    if (!isIdent && !isKeywordTag) return false;
    const name = tok.value;
    // Known CSS element selectors that might appear in style blocks
    const CSS_SELECTORS = new Set([
      "html",
      "body",
      "main",
      "header",
      "footer",
      "nav",
      "section",
      "article",
      "aside",
      "div",
      "span",
      "p",
      "a",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "img",
      "button",
      "input",
      "select",
      "textarea",
      "table",
      "form",
      "label",
      "blockquote",
      "pre",
      "code",
      "details",
      "summary",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "figcaption",
      "figure",
      "strong",
      "em",
      "small",
      "sub",
      "sup",
      "mark",
      "del",
      "ins",
      "abbr",
      "cite",
      "dfn",
      "time",
      "var",
      "kbd",
      "samp",
      "video",
      "audio",
      "canvas",
      "svg",
      "path",
      "fieldset",
      "legend",
      "datalist",
      "progress",
      "meter",
      "dialog",
      "hr",
      "br",
      "*",
    ]);
    if (!CSS_SELECTORS.has(name)) return false;
    // Look ahead for { or space+{ pattern
    let i = this.pos + 1;
    while (
      i < this.tokens.length &&
      (this.tokens[i].type === TokenType.Identifier ||
        this.tokens[i].value === ":" ||
        this.tokens[i].value === "-")
    ) {
      i++;
    }
    return (
      i < this.tokens.length && this.tokens[i].type === TokenType.LeftBrace
    );
  }

  /**
   * Parse a CSS selector like: .class, .class:hover, .class:pseudo, tag, tag:pseudo
   * Consumes tokens until we hit LeftBrace.
   */
  private parseCssSelector(): string {
    let selector = "";
    while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
      const tok = this.advance();
      // Add space between identifier tokens, but not after . or : or -
      if (
        selector &&
        tok.type === TokenType.Identifier &&
        !selector.endsWith(".") &&
        !selector.endsWith(":") &&
        !selector.endsWith("-")
      ) {
        selector += " ";
      }
      selector += tok.value;
    }
    return selector.trim();
  }

  private parseStyleProperty(): StyleProperty {
    let name = this.consumeIdentifier();
    let value = "";
    let parenDepth = 0; // Track parentheses for rgba(), linear-gradient(), etc.

    // Vendor prefix fix: if name is just '-', consume next identifier (e.g., -webkit-background-clip)
    if (name === "-" && this.check(TokenType.Identifier)) {
      name = "-" + this.advance().value;
      // #181: Continue consuming hyphenated parts for full vendor-prefixed property name
      // e.g., -webkit + - + background + - + clip → -webkit-background-clip
      while (
        this.peek()?.value === "-" &&
        this.peekAt(1)?.type === TokenType.Identifier
      ) {
        this.advance(); // consume '-'
        name += "-" + this.advance().value; // consume identifier part
      }
    }

    // Skip optional colon after property name (CSS habit: "color: value" vs NyxCode "color value")
    if (this.check(TokenType.Colon)) {
      this.advance();
    }

    // Resolve the full property name (might be hyphenated, e.g., "font" + "-" + "family")
    let fullPropName = name;
    // Peek ahead: if next tokens form a hyphenated CSS property name suffix, DON'T consume here
    // (the hyphen handling below will build it). But for comma-value detection, we need to
    // check the resolved name. We do a lookahead to construct it.
    {
      let lookIdx = this.pos;
      let candidate = name;
      while (lookIdx + 1 < this.tokens.length) {
        const dashTok = this.tokens[lookIdx];
        const nextTok = this.tokens[lookIdx + 1];
        if (dashTok?.value === "-" && nextTok?.type === TokenType.Identifier) {
          candidate = candidate + "-" + nextTok.value;
          lookIdx += 2;
        } else {
          break;
        }
      }
      fullPropName = candidate;
    }

    // Determine if this property's value allows commas (e.g., font-family, transition)
    const allowCommasInValue = Parser.COMMA_VALUE_PROPERTIES.has(fullPropName);

    // Consume value tokens until we hit:
    // - comma OUTSIDE parens (property separator) — UNLESS property allows commas in value
    // - } (end of style block) — only at depth 0
    // - @ (responsive block)
    // - another CSS property name (multi-line separator) — only at depth 0
    // - pseudo-class/element keyword
    while (!this.isAtEnd()) {
      const next = this.peek();

      // Track parenthesis depth
      if (next.type === TokenType.LeftParen) {
        parenDepth++;
        value += (value ? "" : "") + this.advance().value;
        continue;
      }
      if (next.type === TokenType.RightParen) {
        parenDepth--;
        value += this.advance().value;
        continue;
      }

      // Inside parentheses: consume EVERYTHING (commas, numbers, identifiers, dots)
      if (parenDepth > 0) {
        if (next.type === TokenType.Comma) {
          value += this.advance().value + " "; // comma + space inside parens
        } else {
          const tok = this.advance();
          // Bug #101: `var(--name)` was being mangled to `var(- - name)` because
          // the calc()-style spacing below treated each `-` as a binary operator.
          // CSS custom properties always start with `--`, and a leading `-` on
          // an identifier (e.g. `-webkit-*` inside a function arg) is part of
          // the identifier — not a subtraction. Detect `--` as an atomic token
          // and glue it onto whatever identifier follows without adding spaces.
          if (tok.value === "-" && this.peek()?.value === "-") {
            this.advance(); // consume the 2nd '-'
            // Glue to next identifier (the custom-property name body).
            if (this.peek()?.type === TokenType.Identifier) {
              value += "--" + this.advance().value;
            } else {
              value += "--";
            }
            continue;
          }
          // Add spaces around +/- operators in calc() expressions — BUT only
          // when they're acting as binary operators. A `-` immediately after
          // `(` or `,` (i.e. at the start of an argument) is a unary sign,
          // e.g. `translate(-50%, -50%)` or `rgba(0, 0, 0, -0)`; those must
          // stick to the next token without a space.
          if (
            (tok.value === "-" || tok.value === "+") &&
            value.length > 0 &&
            !value.endsWith("(") &&
            !value.endsWith(", ") &&
            !value.endsWith(",")
          ) {
            value += " " + tok.value + " ";
          } else {
            // v0.25.0 — Bug #115: Inside parens, consecutive value tokens like
            // identifiers and numbers were glued together with no separator,
            // so `radial-gradient(ellipse at 15% 10%, ...)` came out as
            // `radial-gradient(ellipseat15%10%, ...)`. Insert a space between
            // adjacent identifier/number tokens; keep things tight after `(`,
            // after a `, ` separator, or when attaching a unit/sign.
            const needsSpace =
              value.length > 0 &&
              !value.endsWith("(") &&
              !value.endsWith(" ") &&
              !value.endsWith("-") &&
              !value.endsWith("+") &&
              (tok.type === TokenType.Identifier ||
                tok.type === TokenType.Number);
            value += (needsSpace ? " " : "") + tok.value;
          }
        }
        continue;
      }

      // Outside parentheses: normal rules
      if (next.type === TokenType.RightBrace || next.type === TokenType.At)
        break;

      // Issue #104: New-line property boundary detection.
      //
      // When the previous value ended with a function call like `rgba(...)` or
      // `linear-gradient(...)` and the next property on a new line uses a shorthand
      // that isn't in CSS_PROPERTIES (e.g., `bdf`, `bf`) or a vendor prefix (e.g.,
      // `-webkit-background-clip`), the parser would greedily merge the next
      // property's name into the previous property's value:
      //
      //     bg rgba(10, 10, 18, 0.7)
      //     bdf blur(20px)
      //
      // Before this fix that compiled to `background: rgba(...) bdf blur(20px);`.
      // The robust rule is: in NyxCode, one property per line. If we've already
      // accumulated value content, paren depth is balanced, and the next token
      // starts on a *later line* than the last consumed token, treat it as the
      // start of a new property.
      if (
        parenDepth === 0 &&
        value.length > 0 &&
        next.type === TokenType.Identifier
      ) {
        const prevTok = this.tokens[this.pos - 1];
        if (prevTok && next.line > prevTok.line) {
          break;
        }
      }
      // Semicolons act as property separators in style blocks (CSS habit).
      // Lexer emits ';' as an Identifier token with value ';'.
      // Bug #87 fix: previously this trailing ';' leaked into the value string,
      // producing `color: var(--x) ;;` (space + double semicolon) in output CSS.
      if (next.type === TokenType.Identifier && next.value === ";") {
        this.advance(); // consume ';'
        break;
      }
      // Stop at nested selector combinators (> ~ +)
      if (
        next.type === TokenType.GreaterThan ||
        next.value === "~" ||
        next.value === "+"
      )
        break;

      // Comma handling: depends on whether the property allows commas in its value
      if (next.type === TokenType.Comma) {
        if (allowCommasInValue) {
          // Check if what follows the comma is a known CSS property name (= new property)
          // or just a continuation of the value (e.g., "Inter, sans-serif")
          const afterComma = this.peekAt(1);
          const afterAfterComma = this.peekAt(2);
          if (afterComma && afterComma.type === TokenType.Identifier) {
            // Check if it's a hyphenated property: ident-ident
            let candidateProp = afterComma.value;
            if (afterAfterComma?.value === "-") {
              const thirdToken = this.peekAt(3);
              if (thirdToken?.type === TokenType.Identifier) {
                candidateProp = afterComma.value + "-" + thirdToken.value;
              }
            }
            if (Parser.CSS_PROPERTIES.has(candidateProp)) {
              // Next thing after comma IS a CSS property — comma is a separator
              this.advance(); // consume comma
              break;
            }
          }
          // Not a CSS property after comma — comma is part of the value.
          // v0.25.0 — Bug #115: Only append the comma here; the default token
          // handlers below insert a single leading space before the next token
          // (identifier/number/function name). Adding an extra ' ' here too
          // produced a double space: `rgba(...),  0 4px ...`.
          this.advance();
          value += ",";
          continue;
        } else {
          // Normal property: comma is always a separator
          this.advance();
          break;
        }
      }

      if (
        [
          "hover",
          "focus",
          "active",
          "before",
          "after",
          "first-child",
          "last-child",
          "disabled",
          "checked",
          "focus-within",
          "focus-visible",
          "placeholder",
          "empty",
          "visited",
        ].includes(next.value)
      )
        break;

      // Dot-notation theme references: ident.ident (e.g., color.primary, spacing.md)
      // Must be checked BEFORE the CSS property break — otherwise "color" in
      // "color.primary" triggers the property-boundary heuristic.
      if (
        next.type === TokenType.Identifier &&
        this.peekAt(1)?.type === TokenType.Dot &&
        this.peekAt(2)?.type === TokenType.Identifier
      ) {
        const ident1 = this.advance().value; // e.g. "color"
        this.advance(); // consume Dot
        const ident2 = this.advance().value; // e.g. "primary"
        // TODO: numeric-prefix keys like "2xl" would lex as Number("2") + Identifier("xl").
        // That combo isn't handled here yet — known limitation for a follow-up commit.
        value += (value ? " " : "") + ident1 + "." + ident2;
        continue;
      }

      // If we see an identifier that's a known CSS property, it's the NEXT property
      if (next.type === TokenType.Identifier && value.length > 0) {
        // Check for hyphenated property: e.g., 'border' + '-' + 'color' = 'border-color'
        const peek1 = this.peekAt(1);
        const peek2 = this.peekAt(2);
        if (peek1?.value === "-" && peek2?.type === TokenType.Identifier) {
          const hyphenated = next.value + "-" + peek2.value;
          if (Parser.CSS_PROPERTIES.has(hyphenated)) break;
        }
        if (Parser.CSS_PROPERTIES.has(next.value)) break;
      }
      // String tokens in style values: preserve quotes ONLY for `content` property
      // (other properties like animation, transition, font-family use unquoted strings)
      if (next.type === TokenType.String) {
        const strVal = this.advance().value;
        const needsQuotes =
          fullPropName === "content" || fullPropName === "quotes";
        value += (value ? " " : "") + (needsQuotes ? `"${strVal}"` : strVal);
        continue;
      }
      // Handle hyphenated identifiers and values
      const tok = this.advance();
      // Minus sign: attach to NEXT value (no space) if at start of value or after space
      if (tok.value === "-") {
        // Check if this is a negative value (next is a number) or hyphenated ident
        if (
          this.peek()?.type === TokenType.Number ||
          this.peek()?.type === TokenType.Identifier
        ) {
          value += (value ? " " : "") + "-" + this.advance().value;
          continue;
        }
        value += (value ? " " : "") + "-";
        continue;
      }
      // Percentage sign: attach to PREVIOUS number (no space)
      if (tok.value === "%") {
        value += "%";
        continue;
      }
      value += (value ? " " : "") + tok.value;
      // Check for hyphenated continuation (e.g., text-align, border-radius)
      if (
        this.peek()?.type === TokenType.Identifier &&
        this.peek()?.value === "-"
      ) {
        value += this.advance().value; // consume -
        if (this.peek()?.type === TokenType.Identifier) {
          value += this.advance().value; // consume next part
        }
      }
    }

    return { name, value: value.trim() };
  }

  private parseForm(): FormStatement {
    const start = this.consume(TokenType.Form);

    // Parse action URL or name
    let action: string | undefined;
    let name = "";

    // Next token is the name/path
    const nameOrPath = this.consumeIdentifier();
    if (nameOrPath.startsWith("/")) {
      action = nameOrPath;
      name = nameOrPath.replace(/^\//, "").replace(/\//g, "-");
    } else {
      name = nameOrPath;
    }

    // Check for 'auth' keyword before brace
    let auth = false;
    if (this.check(TokenType.Auth)) {
      this.advance();
      auth = true;
    } else if (
      this.check(TokenType.Identifier) &&
      this.peek().value === "auth"
    ) {
      this.advance();
      auth = true;
    }

    this.consume(TokenType.LeftBrace);

    // Parse body, extracting success/error handlers
    const body: Statement[] = [];
    let onSuccess: FormAction | undefined;
    let onError: FormAction | undefined;

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (
        this.check(TokenType.Identifier) &&
        (this.peek().value === "success" || this.peek().value === "error")
      ) {
        const handlerType = this.advance().value;
        this.consume(TokenType.Arrow);
        const actionKind = this.advance().value as FormAction["kind"];
        let actionValue: string | undefined;
        if (actionKind === "redirect" || actionKind === "toast") {
          actionValue = this.check(TokenType.String)
            ? this.consume(TokenType.String).value
            : this.consumeIdentifier();
        }
        const formAction: FormAction = { kind: actionKind, value: actionValue };
        if (handlerType === "success") onSuccess = formAction;
        else onError = formAction;
      } else {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      }
    }

    this.consume(TokenType.RightBrace);

    // Parse optional catch handlers after form closing brace
    const errorHandlers: { status: number | "*"; action: string }[] = [];
    while (this.check(TokenType.Identifier) && this.peek().value === "catch") {
      this.advance(); // consume 'catch'
      let status: number | "*";
      if (this.check(TokenType.Number)) {
        status = parseInt(this.advance().value);
      } else {
        if (this.peek().value === "*") this.advance();
        status = "*";
      }
      if (this.check(TokenType.Arrow)) this.advance(); // ->
      let catchAction = "";
      while (!this.isAtEnd()) {
        if (this.peek().type === TokenType.RightBrace) break;
        if (this.check(TokenType.Identifier) && this.peek().value === "catch")
          break;
        const pt = this.peek().type;
        if (
          pt === TokenType.Data ||
          pt === TokenType.Each ||
          pt === TokenType.When ||
          pt === TokenType.Form ||
          pt === TokenType.State ||
          pt === TokenType.Style
        )
          break;
        if (
          this.check(TokenType.Identifier) &&
          ELEMENT_TAGS.has(this.peek().value) &&
          !["redirect", "toast", "show", "reload", "clear"].includes(
            this.peek().value,
          ) &&
          catchAction.length > 0
        )
          break;
        const tok = this.advance();
        if (tok.type === TokenType.String)
          catchAction += '"' + tok.value + '" ';
        else catchAction += tok.value + " ";
      }
      errorHandlers.push({ status, action: catchAction.trim() });
    }

    return {
      type: "Form",
      name,
      action,
      auth,
      body,
      onSuccess,
      onError,
      errorHandlers: errorHandlers.length > 0 ? errorHandlers : undefined,
      line: start.line,
      col: start.col,
    };
  }

  /**
   * Parse `script { ... }` — raw JavaScript block.
   * Content between braces is raw JS, no escaping.
   */
  /**
   * Collect a CSS value from the token stream, handling:
   * - Function calls: var(), rgba(), calc()
   * - Comma-separated values inside parens
   * - String literals as complete values
   * Returns when it hits the next property name or closing brace.
   */
  private isCSSValueKeyword(name: string): boolean {
    const CSS_VALUES = new Set([
      "auto",
      "none",
      "inherit",
      "initial",
      "unset",
      "revert",
      "normal",
      "bold",
      "bolder",
      "lighter",
      "italic",
      "oblique",
      "center",
      "left",
      "right",
      "top",
      "bottom",
      "start",
      "end",
      "both",
      "hidden",
      "visible",
      "scroll",
      "clip",
      "fixed",
      "absolute",
      "relative",
      "sticky",
      "static",
      "flex",
      "grid",
      "block",
      "inline",
      "contents",
      "table",
      "solid",
      "dashed",
      "dotted",
      "double",
      "groove",
      "ridge",
      "inset",
      "outset",
      "collapse",
      "separate",
      "wrap",
      "nowrap",
      "contain",
      "cover",
      "fill",
      "stretch",
      "row",
      "column",
      "dense",
      "space",
      "round",
      "repeat",
      "no",
      "ease",
      "linear",
      "step",
      "transparent",
      "currentColor",
      "serif",
      "sans",
      "monospace",
      "cursive",
      "fantasy",
      "system",
      "pointer",
      "default",
      "text",
      "move",
      "grab",
      "grabbing",
      "uppercase",
      "lowercase",
      "capitalize",
      "underline",
      "overline",
      "line",
      "through",
      "baseline",
      "middle",
      "sub",
      "super",
      "break",
      "word",
      "all",
      "avoid",
      "ellipsis",
    ]);
    return CSS_VALUES.has(name);
  }

  /**
   * Collects a CSS value inside a `theme { defaults { el { ... } } }` property.
   * Stops at: `;` (Identifier token), `}`, a new Identifier on a later line, or EOF.
   * Preserves quoted strings for font-family stacks, keeps commas for stacks,
   * and handles nested parens. Used by #112 element defaults.
   */
  private collectDefaultsValue(): string {
    type Part = { kind: "token" | "string"; value: string };
    const parts: Part[] = [];
    let parenDepth = 0;
    let lastLine = this.peek().line;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const next = this.peek();
      if (next.type === TokenType.LeftParen) {
        parenDepth++;
        this.advance();
        parts.push({ kind: "token", value: "(" });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.RightParen) {
        parenDepth = Math.max(0, parenDepth - 1);
        this.advance();
        parts.push({ kind: "token", value: ")" });
        lastLine = next.line;
        continue;
      }
      if (parenDepth > 0) {
        if (next.type === TokenType.String) {
          this.advance();
          parts.push({ kind: "string", value: next.value });
          lastLine = next.line;
          continue;
        }
        parts.push({ kind: "token", value: this.advance().value });
        lastLine = next.line;
        continue;
      }
      // Semicolon terminates the value (lexed as Identifier ";")
      if (next.type === TokenType.Identifier && next.value === ";") break;
      // Commas are part of the value (font stacks etc.)
      if (next.type === TokenType.Comma) {
        this.advance();
        parts.push({ kind: "token", value: "," });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.String) {
        // New-line string after a value break = new property? Keep simple: a string
        // in this context is always value continuation (font-family "Inter").
        this.advance();
        parts.push({ kind: "string", value: next.value });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.Identifier && parts.length > 0) {
        const after = this.tokens[this.pos + 1];
        if (after && after.type === TokenType.LeftParen) {
          /* function call, continue */
        } else if (this.isCSSValueKeyword(next.value)) {
          /* value keyword, continue */
        } else if (parts[parts.length - 1].value === ",") {
          /* stack continuation */
        } else if (next.line === lastLine) {
          /* same line, continue */
        } else break; // new line + bare identifier = next property name
      }
      parts.push({ kind: "token", value: this.advance().value });
      lastLine = next.line;
    }
    let result = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const pv = p.kind === "string" ? '"' + p.value + '"' : p.value;
      if (i > 0) {
        const prev = parts[i - 1];
        const prevV =
          prev.kind === "string" ? '"' + prev.value + '"' : prev.value;
        const noSpace =
          pv === ")" ||
          pv === "," ||
          pv === "(" ||
          prevV === "(" ||
          prevV === "-" ||
          prevV === "--";
        if (!noSpace) result += " ";
      }
      result += pv;
    }
    return result.trim();
  }

  /**
   * Like collectCSSValue but stops at semicolons (lexed as Identifier ";").
   * Used inside preset blocks where "preset btn { bg red; c blue }" uses
   * semicolons as property separators on a single line.
   */
  private collectCSSValueUntilSemicolon(): string {
    type Part = { kind: "token" | "string"; value: string };
    const parts: Part[] = [];
    let parenDepth = 0;
    const startLine = this.peek().line;
    let lastLine = startLine;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const next = this.peek();
      // Stop at semicolons (they delimit properties in preset one-liners)
      if (next.type === TokenType.Identifier && next.value === ";") break;
      if (next.type === TokenType.LeftParen) {
        parenDepth++;
        this.advance();
        parts.push({ kind: "token", value: "(" });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.RightParen) {
        parenDepth = Math.max(0, parenDepth - 1);
        this.advance();
        parts.push({ kind: "token", value: ")" });
        lastLine = next.line;
        continue;
      }
      if (parenDepth > 0) {
        if (next.type === TokenType.String) {
          this.advance();
          parts.push({ kind: "string", value: next.value });
          lastLine = next.line;
          continue;
        }
        parts.push({ kind: "token", value: this.advance().value });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.Comma) {
        // Outside parens: comma MAY be a property delimiter (like semicolon)
        // Only break if next token after comma is a known CSS shorthand
        const afterComma = this.peekAt(1);
        if (
          afterComma &&
          afterComma.type === TokenType.Identifier &&
          CSS_SHORTHANDS.has(afterComma.value)
        ) {
          break; // Comma separates properties: bg red, p 1rem
        }
        this.advance();
        parts.push({ kind: "token", value: "," });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.String) {
        if (parts.length > 0 && next.line > lastLine) {
          const prevPart = parts[parts.length - 1];
          if (prevPart.value !== ",") break;
        }
        this.advance();
        parts.push({ kind: "string", value: next.value });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.Identifier && parts.length > 0) {
        const after = this.tokens[this.pos + 1];
        if (after && after.type === TokenType.LeftParen) {
          /* function call */
        } else if (this.isCSSValueKeyword(next.value)) {
          /* CSS value keyword */
        } else if (parts[parts.length - 1].value === ",") {
          /* after comma */
        } else if (next.line === lastLine) {
          /* same line */
        } else break;
      }
      parts.push({ kind: "token", value: this.advance().value });
      lastLine = next.line;
    }
    let result = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const pv = p.kind === "string" ? '"' + p.value + '"' : p.value;
      if (i > 0) {
        const prev = parts[i - 1];
        const prevV =
          prev.kind === "string" ? '"' + prev.value + '"' : prev.value;
        const currV = pv;
        const noSpace =
          currV === ")" ||
          currV === "," ||
          currV === "(" ||
          prevV === "(" ||
          prevV === "-" ||
          prevV === "--";
        if (!noSpace) result += " ";
      }
      result += pv;
    }
    return result.trim();
  }

  private collectCSSValue(): string {
    // Bug #105 fix (v0.24.3): values can contain commas (font-family stacks, multiple
    // shadows, gradient stops, etc.). End-of-value is determined by either a RightBrace
    // or a new identifier on a new line that looks like a property name (not a CSS value
    // keyword, not inside parens, not a function call).
    type Part = { kind: "token" | "string"; value: string };
    const parts: Part[] = [];
    let parenDepth = 0;
    const startLine = this.peek().line;
    let lastLine = startLine;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const next = this.peek();
      if (next.type === TokenType.LeftParen) {
        parenDepth++;
        this.advance();
        parts.push({ kind: "token", value: "(" });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.RightParen) {
        parenDepth = Math.max(0, parenDepth - 1);
        this.advance();
        parts.push({ kind: "token", value: ")" });
        lastLine = next.line;
        continue;
      }
      if (parenDepth > 0) {
        if (next.type === TokenType.String) {
          this.advance();
          parts.push({ kind: "string", value: next.value });
          lastLine = next.line;
          continue;
        }
        parts.push({ kind: "token", value: this.advance().value });
        lastLine = next.line;
        continue;
      }
      // Commas are part of the value (font stacks, multi-shadow, etc.)
      if (next.type === TokenType.Comma) {
        this.advance();
        parts.push({ kind: "token", value: "," });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.String) {
        // Strings are part of the value. Only break if this string starts a new
        // logical property (i.e. we already collected something AND the string
        // is on a new line AND it's not a continuation after a comma).
        if (parts.length > 0 && next.line > lastLine) {
          const prevPart = parts[parts.length - 1];
          if (prevPart.value !== ",") break;
        }
        this.advance();
        parts.push({ kind: "string", value: next.value });
        lastLine = next.line;
        continue;
      }
      if (next.type === TokenType.Identifier && parts.length > 0) {
        const after = this.tokens[this.pos + 1];
        // If next identifier is followed by (, it's a function call (rgba(), etc) — continue
        if (after && after.type === TokenType.LeftParen) {
          /* continue to push */
        }
        // If next identifier looks like a CSS value keyword, keep collecting
        else if (this.isCSSValueKeyword(next.value)) {
          /* continue to push */
        }
        // After a comma, any identifier is a continuation (next font in stack, etc.)
        else if (parts[parts.length - 1].value === ",") {
          /* continue to push */
        }
        // Same line as previous token — still part of this value
        // #124: Vendor-prefixed props on same line should start new property.
        // e.g. "-webkit-background-clip text -webkit-text-fill-color transparent"
        // The "-" token followed by an identifier like "webkit" signals a new prop.
        else if (
          next.line === lastLine &&
          next.value === "-" &&
          this.peekAt(1)?.type === TokenType.Identifier
        ) {
          // Check if this could be a vendor prefix like -webkit-, -moz-, etc.
          const maybeVendor = this.peekAt(1)?.value;
          if (
            maybeVendor === "webkit" ||
            maybeVendor === "moz" ||
            maybeVendor === "ms" ||
            maybeVendor === "o"
          ) {
            break; // new vendor-prefixed property — stop collecting
          }
          // Otherwise it's a negative value like "-1px" — continue
        } else if (next.line === lastLine) {
          /* continue to push */
        }
        // Otherwise new line + identifier = new property name — break
        else break;
      }
      parts.push({ kind: "token", value: this.advance().value });
      lastLine = next.line;
    }
    // Smart join: preserve quoted strings verbatim, space between word/number tokens,
    // no space around certain punctuation.
    let result = "";
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const pv = p.kind === "string" ? '"' + p.value + '"' : p.value;
      if (i > 0) {
        const prev = parts[i - 1];
        const prevV =
          prev.kind === "string" ? '"' + prev.value + '"' : prev.value;
        const currV = pv;
        // No space: before ), before ,, after (, before (, after -, after --
        const noSpace =
          currV === ")" ||
          currV === "," ||
          currV === "(" ||
          prevV === "(" ||
          prevV === "-" ||
          prevV === "--";
        if (!noSpace) result += " ";
      }
      result += pv;
    }
    return result.trim();
  }

  private parsePreset(): any {
    const start = this.consume(TokenType.Preset);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const styles: Array<{ name: string; value: string }> = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.peek().type !== TokenType.Identifier) break;
      let prop = this.advance().value;
      // Bug #103: vendor-prefixed properties like `-webkit-background-clip`
      // lex as `-` + `webkit` + `-` + `background` + `-` + `clip`. The leading
      // `-` is a standalone Identifier token, so without this rescue the
      // property name becomes just "-" and the rest of the line leaks into
      // the value ("-: webkit-background-clip text" in the output). Mirror
      // the guard that already exists in parseStyleProperty().
      if (prop === "-" && this.check(TokenType.Identifier)) {
        prop = "-" + this.advance().value;
      }
      // Property names may contain multiple hyphens (-webkit-background-clip,
      // grid-template-columns, etc.). Glue subsequent `-ident` pairs onto the
      // property name so the value collector starts at the true value.
      while (
        this.peek()?.value === "-" &&
        this.peekAt(1)?.type === TokenType.Identifier
      ) {
        this.advance(); // consume '-'
        prop = prop + "-" + this.advance().value;
      }
      const value = this.collectCSSValueUntilSemicolon();
      if (value) styles.push({ name: prop, value });
      // Skip semicolons and commas between properties
      while (
        (this.peek()?.type === TokenType.Identifier &&
          this.peek()?.value === ";") ||
        this.peek()?.type === TokenType.Comma
      ) {
        this.advance();
      }
    }
    this.consume(TokenType.RightBrace);
    return { type: "Preset", name, styles, line: start.line, col: start.col };
  }

  private parseScript(): ScriptStatement {
    const start = this.consume(TokenType.Script);
    // Lexer already captured raw content between { }, no brace consumption needed
    return {
      type: "Script",
      content: start.value,
      line: start.line,
      col: start.col,
    };
  }

  private parseAuth(): AuthStatement {
    const start = this.consume(TokenType.Auth);
    const level = this.consumeIdentifier();
    return { type: "Auth", level, line: start.line, col: start.col };
  }

  private parseOn(): OnStatement {
    const start = this.consume(TokenType.On);
    // Handle both "on click ->" and "on:click ->"
    if (this.check(TokenType.Colon)) this.advance(); // skip optional colon
    const event = this.consumeIdentifier();
    this.consume(TokenType.Arrow);

    // Collect the action as a string, handling inline { body }
    let action = "";
    while (!this.isAtEnd() && !this.isStatementStart()) {
      const cur = this.peek();
      if (cur.type === TokenType.LeftBrace) {
        action += " {";
        this.advance();
        let depth = 1;
        while (depth > 0 && !this.isAtEnd()) {
          const t = this.advance();
          if (t.type === TokenType.LeftBrace) depth++;
          else if (t.type === TokenType.RightBrace) {
            depth--;
            if (depth === 0) {
              action += " }";
              break;
            }
          }
          action += " " + t.value;
        }
      } else if (cur.type === TokenType.RightBrace) {
        break;
      } else {
        const tok = this.advance();
        if (tok.type === TokenType.String) {
          action += (action ? " " : "") + '"' + tok.value + '"';
        } else {
          action += (action ? " " : "") + tok.value;
        }
      }
    }

    return {
      type: "On",
      event,
      action: action.trim(),
      line: start.line,
      col: start.col,
    };
  }

  private parseValidate(): ValidateStatement {
    const start = this.consume(TokenType.Validate);
    this.consume(TokenType.LeftBrace);

    const fields: ValidateField[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const name = this.consumeIdentifier();
      const rules: string[] = [];

      while (
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.Comma) &&
        !this.isAtEnd()
      ) {
        const next = this.peek();
        if (next.type === TokenType.Identifier) {
          const kw = this.advance().value;
          // Handle key=value: format=email, min=10
          if (this.check(TokenType.Equals)) {
            this.advance(); // =
            const val = this.advance().value;
            rules.push(kw + "=" + val);
          } else {
            rules.push(kw);
          }
        } else {
          break;
        }
      }

      if (this.check(TokenType.Comma)) this.advance();
      fields.push({ name, rules });
    }

    this.consume(TokenType.RightBrace);
    return { type: "Validate", fields, line: start.line, col: start.col };
  }

  private parseRespond(): RespondStatement {
    const start = this.consume(TokenType.Respond);
    const status = parseInt(this.consume(TokenType.Number).value);

    let body:
      | Record<string, string | { value: string; isRef: boolean }>
      | string
      | undefined;
    if (this.check(TokenType.LeftBrace)) {
      this.advance();
      body = {};
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        while (this.check(TokenType.Newline)) this.advance();
        if (this.check(TokenType.RightBrace)) break;
        const key = this.consumeIdentifier();
        // v0.36: Support key: value syntax (colon optional)
        if (this.check(TokenType.Colon)) this.advance();
        if (this.check(TokenType.String)) {
          body[key] = this.consume(TokenType.String).value;
        } else if (this.check(TokenType.Number)) {
          body[key] = this.advance().value;
        } else if (
          this.check(TokenType.Identifier) &&
          (this.peek().value === "true" ||
            this.peek().value === "false" ||
            this.peek().value === "null")
        ) {
          body[key] = this.advance().value;
        } else if (this.check(TokenType.Dollar)) {
          let ref = this.advance().value;
          if (this.check(TokenType.Identifier)) ref += this.advance().value;
          while (this.check(TokenType.Dot)) {
            this.advance();
            ref += "." + this.consumeIdentifier();
          }
          body[key] = { value: ref, isRef: true };
        } else {
          let ref = this.consumeIdentifier();
          while (this.check(TokenType.Dot)) {
            this.advance();
            ref += "." + this.consumeIdentifier();
          }
          body[key] = { value: ref, isRef: true };
        }
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightBrace);
    } else if (this.check(TokenType.Dollar)) {
      // respond 200 $variable — forward variable directly
      let ref = this.advance().value;
      if (this.check(TokenType.Identifier)) ref += this.advance().value;
      while (this.check(TokenType.Dot)) {
        this.advance();
        ref += "." + this.consumeIdentifier();
      }
      body = { __varRef: ref } as any;
    } else if (this.check(TokenType.Dot)) {
      body = this.advance().value + this.consumeIdentifier();
    }

    return { type: "Respond", status, body, line: start.line, col: start.col };
  }

  private parseLimitStmt(): LimitStatement {
    const start = this.consume(TokenType.Limit);
    let value = "";
    while (
      !this.isAtEnd() &&
      !this.check(TokenType.RightBrace) &&
      !this.isStatementStart()
    ) {
      value += this.advance().value;
    }
    return {
      type: "Limit",
      value: value.trim(),
      line: start.line,
      col: start.col,
    };
  }

  // #174: rate limiting — `rate 10/min`, `rate 100/hour`, `rate 1000/day`
  private parseRateLimit(): any {
    const start = this.consume(TokenType.Rate);
    // Parse: number
    const maxToken = this.advance();
    const max = parseInt(maxToken.value, 10);
    if (isNaN(max))
      throw this.error(`rate: expected number, got '${maxToken.value}'`);

    // The lexer tokenizes `/min` as a single Identifier token (paths start with /)
    const unitToken = this.advance();
    const rawUnit = unitToken.value;
    // Strip leading / if present
    const unit = rawUnit.startsWith("/")
      ? rawUnit.slice(1).toLowerCase()
      : rawUnit.toLowerCase();

    const windowMap: Record<string, number> = {
      s: 1000,
      sec: 1000,
      second: 1000,
      min: 60000,
      minute: 60000,
      h: 3600000,
      hr: 3600000,
      hour: 3600000,
      d: 86400000,
      day: 86400000,
    };
    const windowMs = windowMap[unit];
    if (!windowMs)
      throw this.error(
        `rate: unknown time unit '${rawUnit}'. Use sec, min, hour, or day`,
      );

    return {
      type: "RateLimit",
      max,
      window: unit,
      windowMs,
      line: start.line,
      col: start.col,
    };
  }

  // #176: expect TypeName — validate request body against a type definition
  private parseExpect(): any {
    const start = this.consume(TokenType.Expect);
    const typeName = this.consumeIdentifier();
    return { type: "Expect", typeName, line: start.line, col: start.col };
  }

  private parseLet(): any {
    const start = this.consume(TokenType.Let);
    const name = this.consumeIdentifier();
    // Reserved name protection (v0.33.2)
    const RESERVED_LET = [
      "__nyx",
      "window",
      "document",
      "globalThis",
      "eval",
      "Function",
      "constructor",
      "prototype",
      "__proto__",
    ];
    if (
      name.startsWith("__nyx") ||
      name.startsWith("__") ||
      RESERVED_LET.includes(name)
    ) {
      throw this.error(
        `Reserved variable name '${name}' — names starting with '__' and JavaScript builtins are not allowed.`,
      );
    }
    this.consume(TokenType.Equals);

    // --- Frontend reactive let (simple values) → emits State node ---
    // String literal: let greeting = "Hello"
    if (this.check(TokenType.String)) {
      const val = this.advance();
      return {
        type: "State",
        name,
        initialValue: {
          type: "StringLiteral",
          value: val.value,
          line: val.line,
          col: val.col,
        },
        line: start.line,
        col: start.col,
      };
    }
    // Number literal: let count = 0
    if (this.check(TokenType.Number)) {
      const val = this.advance();
      return {
        type: "State",
        name,
        initialValue: {
          type: "NumberLiteral",
          value: parseFloat(val.value),
          line: val.line,
          col: val.col,
        },
        line: start.line,
        col: start.col,
      };
    }
    // Boolean: let active = true / false
    if (
      this.check(TokenType.Identifier) &&
      (this.peek().value === "true" || this.peek().value === "false")
    ) {
      const val = this.advance();
      return {
        type: "State",
        name,
        initialValue: val.value,
        line: start.line,
        col: start.col,
      };
    }
    // Array literal: let items = ["a", "b"]
    if (this.check(TokenType.LeftBracket)) {
      const arr = this.consumeArrayLiteral();
      return {
        type: "State",
        name,
        initialValue: arr,
        line: start.line,
        col: start.col,
      };
    }
    // Object literal: let config = { key: "value" }
    if (this.check(TokenType.LeftBrace)) {
      const obj = this.consumeObjectLiteral();
      return {
        type: "State",
        name,
        initialValue: obj,
        line: start.line,
        col: start.col,
      };
    }

    // --- Backend let (query, builtins, method calls) → emits Let node ---
    // let x = file "path"  (v0.36)
    if (this.check(TokenType.Identifier) && this.peek().value === "file") {
      this.advance(); // consume 'file'
      const path = this.consume(TokenType.String).value;
      return {
        type: "Let",
        name,
        value: { kind: "file", path },
        line: start.line,
        col: start.col,
      };
    }
    // let x = fetch "url" { ... }  (v0.36)
    if (this.check(TokenType.Identifier) && this.peek().value === "fetch") {
      this.advance(); // consume 'fetch'
      const url = this.consume(TokenType.String).value;
      let method = "GET";
      const headers: Record<string, string> = {};
      let bodyExpr = "";
      if (this.check(TokenType.LeftBrace)) {
        this.consume(TokenType.LeftBrace);
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          const key = this.peek();
          if (key.type === TokenType.Identifier && key.value === "method") {
            this.advance();
            method = this.advance().value;
          } else if (
            key.type === TokenType.Identifier &&
            key.value === "headers"
          ) {
            this.advance();
            this.consume(TokenType.LeftBrace);
            while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
              while (this.check(TokenType.Newline)) this.advance();
              if (this.check(TokenType.RightBrace)) break;
              const hKey = this.consumeIdentifier();
              if (this.check(TokenType.Colon)) this.advance();
              let hVal = "";
              while (
                !this.check(TokenType.RightBrace) &&
                !this.isAtEnd() &&
                !this.check(TokenType.Newline)
              ) {
                if (
                  this.check(TokenType.Identifier) &&
                  this.peekAt(1)?.type === TokenType.Colon
                )
                  break;
                const t = this.peek();
                if (t.type === TokenType.Dollar) {
                  hVal += this.advance().value;
                  if (this.check(TokenType.Identifier))
                    hVal += this.advance().value;
                  while (this.check(TokenType.Dot)) {
                    hVal += this.advance().value;
                    if (this.check(TokenType.Identifier))
                      hVal += this.advance().value;
                  }
                } else {
                  hVal += this.advance().value;
                }
              }
              headers[hKey] = hVal.trim();
            }
            this.consume(TokenType.RightBrace);
          } else if (
            key.type === TokenType.Identifier &&
            key.value === "body"
          ) {
            this.advance();
            bodyExpr = this.collectPipeExpr(true, false);
          } else if (key.type === TokenType.Newline) {
            this.advance();
          } else {
            this.advance();
          }
        }
        this.consume(TokenType.RightBrace);
      }
      return {
        type: "Let",
        name,
        value: { kind: "fetch", url, method, headers, bodyExpr },
        line: start.line,
        col: start.col,
      };
    }
    // let x = query "..."
    if (this.check(TokenType.Query)) {
      this.advance(); // consume 'query'
      const sql = this.consume(TokenType.String).value;
      return {
        type: "Let",
        name,
        value: { kind: "query", sql },
        line: start.line,
        col: start.col,
      };
    }
    // Built-in function: sum(x, "field")
    if (this.check(TokenType.Identifier)) {
      const fn = this.peek().value;
      if (["sum", "count", "avg", "min", "max", "len"].includes(fn)) {
        this.advance(); // consume function name
        this.consume(TokenType.LeftParen);
        const args: string[] = [];
        while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
          args.push(this.advance().value);
          if (this.check(TokenType.Comma)) this.advance();
        }
        this.consume(TokenType.RightParen);
        return {
          type: "Let",
          name,
          value: { kind: "builtin", fn, args },
          line: start.line,
          col: start.col,
        };
      }
      // Object.method(args) call: stripe.checkout(amount)
      const target = this.advance().value;
      if (this.check(TokenType.Dot)) {
        this.advance(); // .
        const method = this.consumeIdentifier();
        const args: string[] = [];
        if (this.check(TokenType.LeftParen)) {
          this.advance(); // (
          while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
            args.push(this.advance().value);
            if (this.check(TokenType.Comma)) this.advance();
          }
          this.consume(TokenType.RightParen);
        }
        return {
          type: "Let",
          name,
          value: { kind: "call", target, method, args },
          line: start.line,
          col: start.col,
        };
      }
      // Simple identifier → treat as State (reactive)
      return {
        type: "State",
        name,
        initialValue: target,
        line: start.line,
        col: start.col,
      };
    }
    // Fallback: treat as reactive state with raw value
    const expr = this.advance().value;
    return {
      type: "State",
      name,
      initialValue: expr,
      line: start.line,
      col: start.col,
    };
  }

  /**
   * Parse: `const name = value`
   * Non-reactive constant. Compiled to a plain JS const with no reactivity overhead.
   */
  private parseConst(): any {
    const start = this.consume(TokenType.Const);
    const name = this.consumeIdentifier();
    // Reserved name protection (v0.33.2)
    const RESERVED_CONST = [
      "__nyx",
      "window",
      "document",
      "globalThis",
      "eval",
      "Function",
      "constructor",
      "prototype",
      "__proto__",
    ];
    if (
      name.startsWith("__nyx") ||
      name.startsWith("__") ||
      RESERVED_CONST.includes(name)
    ) {
      throw this.error(
        `Reserved variable name '${name}' — names starting with '__' and JavaScript builtins are not allowed.`,
      );
    }
    this.consume(TokenType.Equals);

    let value: any;
    if (this.check(TokenType.String)) {
      value = { type: "StringLiteral", value: this.advance().value };
    } else if (this.check(TokenType.Number)) {
      value = {
        type: "NumberLiteral",
        value: parseFloat(this.advance().value),
      };
    } else if (
      this.check(TokenType.Identifier) &&
      (this.peek().value === "true" || this.peek().value === "false")
    ) {
      value = this.advance().value;
    } else if (this.check(TokenType.LeftBracket)) {
      value = this.consumeArrayLiteral();
    } else if (this.check(TokenType.LeftBrace)) {
      value = this.consumeObjectLiteral();
    } else {
      value = this.advance().value;
    }

    return { type: "Const", name, value, line: start.line, col: start.col };
  }

  private parseEmailStatement(): any {
    const start = this.consume(TokenType.Email);
    // email to=x subject=y body=z
    const attrs: Record<string, string> = {};
    while (this.check(TokenType.Identifier) && !this.isAtEnd()) {
      const key = this.advance().value;
      this.consume(TokenType.Equals);
      attrs[key] = this.advance().value;
    }
    return {
      type: "Email",
      to: attrs.to || "",
      subject: attrs.subject || "",
      body: attrs.body || "",
      template: attrs.template,
      line: start.line,
      col: start.col,
    };
  }

  private parseQuery(): QueryStatement {
    const start = this.consume(TokenType.Query);
    const sql = this.consume(TokenType.String).value;
    return { type: "Query", sql, line: start.line, col: start.col };
  }

  /**
   * Parse: `state name = value`
   * Reactive state variable. When mutated, all referencing DOM nodes update.
   */
  private parseState(): StateStatement {
    const start = this.consume(TokenType.State);
    const name = this.consumeIdentifier();
    this.consume(TokenType.Equals);

    // Parse initial value — could be string, number, array, or expression
    const token = this.peek();
    let initialValue: Expression | string;

    if (token.type === TokenType.String) {
      initialValue = {
        type: "StringLiteral",
        value: this.advance().value,
        line: token.line,
        col: token.col,
      };
    } else if (token.type === TokenType.Number) {
      initialValue = {
        type: "NumberLiteral",
        value: parseFloat(this.advance().value),
        line: token.line,
        col: token.col,
      };
    } else if (token.type === TokenType.LeftBracket) {
      // Array literal: [item1, item2]
      initialValue = this.consumeArrayLiteral();
    } else if (token.type === TokenType.LeftBrace) {
      // Object literal: { key: value }
      initialValue = this.consumeObjectLiteral();
    } else {
      // Identifier or expression
      initialValue = this.advance().value;
    }

    return {
      type: "State",
      name,
      initialValue,
      line: start.line,
      col: start.col,
    };
  }

  /**
   * Parse: `effect { ... }`
   * Side effect block. Dependencies auto-detected from referenced state vars.
   */
  private parseEffect(): EffectStatement {
    const start = this.consume(TokenType.Effect);
    const body = this.consumeBlock();
    return { type: "Effect", body, line: start.line, col: start.col };
  }

  /**
   * Parse: `computed name = expression`
   * Derived value that auto-updates when dependencies change.
   */
  private parseComputed(): ComputedStatement {
    const start = this.consume(TokenType.Computed);
    const name = this.consumeIdentifier();
    this.consume(TokenType.Equals);

    // Collect ALL tokens until newline-separated statement or closing brace
    // Must handle complex JS: __nyx.state.count, arr.length, obj.prop etc.
    let expression = "";
    let parenDepth = 0;
    while (!this.isAtEnd()) {
      const next = this.peek();
      // Stop at closing brace (end of parent block) unless inside parens
      if (next.type === TokenType.RightBrace && parenDepth === 0) break;
      // Stop at new element tags (h1, p, button, etc.) — these start new statements
      if (
        parenDepth === 0 &&
        next.type === TokenType.Identifier &&
        ELEMENT_TAGS.has(next.value)
      )
        break;
      // Stop at top-level keywords that start NEW statements (but NOT 'state' which can appear in expressions)
      if (
        parenDepth === 0 &&
        [
          TokenType.Data,
          TokenType.Each,
          TokenType.When,
          TokenType.Style,
          TokenType.Form,
          TokenType.Auth,
          TokenType.On,
          TokenType.Validate,
          TokenType.Script,
          TokenType.Respond,
          TokenType.Limit,
          TokenType.Query,
          TokenType.Else,
          TokenType.State,
          TokenType.Effect,
          TokenType.Computed,
          TokenType.Config,
          TokenType.Before,
          TokenType.After,
        ].includes(next.type) &&
        expression.length > 0 &&
        !expression.endsWith(".")
      )
        break;
      if (next.type === TokenType.LeftParen) parenDepth++;
      if (next.type === TokenType.RightParen) parenDepth--;
      const tok = this.advance();
      // Preserve string quotes in expressions (ternary, concatenation, etc.)
      if (tok.type === TokenType.String) {
        expression +=
          '"' + tok.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      } else {
        expression += tok.value;
      }
    }

    return {
      type: "Computed",
      name,
      expression: expression.trim(),
      line: start.line,
      col: start.col,
    };
  }

  /** Consume an array literal like [1, 2, 3] or ["a", "b"] */
  private consumeArrayLiteral(): string {
    let result = this.advance().value; // [
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      const t = this.advance();
      if (t.type === TokenType.LeftBracket) depth++;
      else if (t.type === TokenType.RightBracket) depth--;
      result += t.value;
      if (depth > 0 && t.type === TokenType.Comma) result += " ";
    }
    return result;
  }

  /** Consume an object literal like { key: value } */
  private consumeObjectLiteral(): string {
    let result = this.advance().value; // {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      const t = this.advance();
      if (t.type === TokenType.LeftBrace) depth++;
      else if (t.type === TokenType.RightBrace) depth--;
      if (depth > 0) result += t.value + " ";
    }
    result += "}";
    return result;
  }

  // Check if { } block looks like CSS properties (for shorthand style blocks)
  private looksLikeStyleBlock(): boolean {
    // Peek past { and check if first identifier is a CSS shorthand
    if (!this.check(TokenType.LeftBrace)) return false;
    const after = this.peekAt(1);
    if (!after) return false;
    if (after.type === TokenType.Identifier && CSS_SHORTHANDS.has(after.value))
      return true;
    // Also handle pseudo-classes like hover { }
    if (
      after.type === TokenType.Identifier &&
      ["hover", "focus", "active"].includes(after.value)
    )
      return true;
    return false;
  }

  // Parse { fs 1.3rem, c text } as a StyleBlock (without 'style' keyword)
  private parseStyleBlockInline(): StyleBlock {
    const start = this.peek();
    this.consume(TokenType.LeftBrace);

    const properties: StyleProperty[] = [];
    const responsive: ResponsiveBlock[] = [];
    let hover: StyleProperty[] | undefined;
    let focus: StyleProperty[] | undefined;
    let active: StyleProperty[] | undefined;

    const PSEUDO_CLASSES: Record<string, string> = {
      hover: "hover",
      focus: "focus",
      active: "active",
    };

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Skip commas
      if (this.check(TokenType.Comma)) {
        this.advance();
        continue;
      }

      // Responsive: @mobile { }, @tablet { }
      if (this.check(TokenType.At)) {
        this.advance();
        const bp = this.consumeIdentifier();
        this.consume(TokenType.LeftBrace);
        const respProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.check(TokenType.Comma)) {
            this.advance();
            continue;
          }
          const rp = this.parseStyleProperty();
          if (rp) respProps.push(rp);
        }
        this.consume(TokenType.RightBrace);
        responsive.push({ breakpoint: bp, properties: respProps });
        continue;
      }

      // Pseudo-class: hover { }, focus { }, active { }
      const name = this.peek().value;
      if (
        this.peek().type === TokenType.Identifier &&
        PSEUDO_CLASSES[name] &&
        this.peekAt(1)?.type === TokenType.LeftBrace
      ) {
        this.advance();
        this.consume(TokenType.LeftBrace);
        const pseudoProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.check(TokenType.Comma)) {
            this.advance();
            continue;
          }
          const pp = this.parseStyleProperty();
          if (pp) pseudoProps.push(pp);
        }
        this.consume(TokenType.RightBrace);
        if (name === "hover") hover = pseudoProps;
        else if (name === "focus") focus = pseudoProps;
        else if (name === "active") active = pseudoProps;
        continue;
      }

      // Regular property: bg red, fs 1.3rem
      const prop = this.parseStyleProperty();
      if (prop) properties.push(prop);
    }

    this.consume(TokenType.RightBrace);

    return {
      type: "Style",
      properties,
      responsive,
      hover,
      focus,
      active,
      raw: false,
      line: start.line,
      col: start.col,
    };
  }

  private parseElement(): ElementNode {
    const start = this.peek();
    const tag = this.consumeIdentifier();

    let content: string | Expression | undefined;
    const attributes: Attribute[] = [];
    let children: Statement[] = [];

    // For component invocations (uppercase tag), attributes take priority over statement detection
    const isComponentCall = tag[0] >= "A" && tag[0] <= "Z";

    // For input/textarea/select: first bare identifier is the field name, NOT a new element
    const FORM_FIELD_TAGS = new Set(["input", "textarea", "select"]);
    if (FORM_FIELD_TAGS.has(tag) && !content) {
      const next = this.peek();
      // Consume field name if: it's an identifier (or keyword token), NOT followed by = (attribute)
      // and NOT followed by { (element children), and NOT a string (that's handled below)
      if (
        next.type === TokenType.Identifier &&
        this.peekAt(1)?.type !== TokenType.Equals &&
        this.peekAt(1)?.type !== TokenType.LeftBrace
      ) {
        content = {
          type: "Identifier",
          name: this.advance().value,
          line: next.line,
          col: next.col,
        };
      }
    }

    // Parse content and attributes
    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      // Check if next is a new statement — but key=value is an attribute, NOT a new statement
      if (this.isStatementStart()) {
        if (this.peekAt(1)?.type === TokenType.Equals) {
          // This is an attribute (style="...", class="...", etc), not a new statement
        } else if (
          this.peek().type === TokenType.On &&
          (this.peekAt(1)?.type === TokenType.Colon ||
            this.peekAt(1)?.type === TokenType.Identifier)
        ) {
          // on:click or on click — inline event handler on element, not a new statement
          this.advance(); // consume 'on'
          if (this.check(TokenType.Colon)) this.advance(); // skip optional colon
          const eventName = this.consumeIdentifier();
          // Parse modifiers: on:click.prevent, on:keydown.ctrl.z, on:keydown.escape
          const modifiers: string[] = [];
          while (
            this.check(TokenType.Dot) &&
            this.peekAt(1)?.type === TokenType.Identifier
          ) {
            this.advance(); // .
            modifiers.push(this.consumeIdentifier());
          }
          if (this.check(TokenType.Arrow)) this.advance(); // ->
          let action = "";
          while (!this.isAtEnd() && !this.isStatementStart()) {
            const cur = this.peek();
            if (cur.type === TokenType.RightBrace) break;
            if (cur.type === TokenType.LeftBrace) {
              if (action.trim().length > 0) break; // Action complete — { starts element children
              action += " {";
              this.advance();
              let depth = 1;
              while (depth > 0 && !this.isAtEnd()) {
                const t = this.advance();
                if (t.type === TokenType.LeftBrace) depth++;
                else if (t.type === TokenType.RightBrace) {
                  depth--;
                  if (depth === 0) {
                    action += " }";
                    break;
                  }
                }
                // Merge compound operators: + = → +=, - = → -=, * = → *=, / = → /=
                else if (t.value === "=" && /[+\-*/]$/.test(action.trimEnd())) {
                  action = action.trimEnd() + "=";
                  continue;
                }
                // Preserve string quotes inside brace blocks
                if (t.type === TokenType.String) action += ' "' + t.value + '"';
                else action += " " + t.value;
              }
            } else {
              const tok = this.advance();
              if (tok.type === TokenType.String)
                action += (action ? " " : "") + '"' + tok.value + '"';
              else action += (action ? " " : "") + tok.value;
            }
          }
          const attrName =
            "on" + eventName.charAt(0).toUpperCase() + eventName.slice(1);
          const attrValue =
            modifiers.length > 0
              ? "__mods:" + modifiers.join(",") + ":" + action.trim()
              : action.trim();
          attributes.push({ name: attrName, value: attrValue });
          continue;
        } else {
          break;
        }
      }
      // v0.33.3: @event shorthand — @click, @submit, @keydown etc.
      if (
        this.check(TokenType.At) &&
        this.peekAt(1)?.type === TokenType.Identifier
      ) {
        this.advance(); // consume '@'
        const eventName = this.consumeIdentifier();
        // Parse modifiers: @click.prevent, @keydown.ctrl.z
        const modifiers: string[] = [];
        while (
          this.check(TokenType.Dot) &&
          this.peekAt(1)?.type === TokenType.Identifier
        ) {
          this.advance(); // .
          modifiers.push(this.consumeIdentifier());
        }
        if (this.check(TokenType.Arrow)) this.advance(); // -> (optional)
        let action = "";
        while (!this.isAtEnd() && !this.isStatementStart()) {
          const cur = this.peek();
          if (cur.type === TokenType.RightBrace) break;
          if (cur.type === TokenType.At) break; // next @event
          if (cur.type === TokenType.LeftBrace) {
            if (action.trim().length > 0) break;
            action += " {";
            this.advance();
            let depth = 1;
            while (depth > 0 && !this.isAtEnd()) {
              const t = this.advance();
              if (t.type === TokenType.LeftBrace) depth++;
              else if (t.type === TokenType.RightBrace) {
                depth--;
                if (depth === 0) {
                  action += " }";
                  break;
                }
              } else if (t.value === "=" && /[+\-*/]$/.test(action.trimEnd())) {
                action = action.trimEnd() + "=";
                continue;
              }
              // Preserve string quotes inside brace blocks
              if (t.type === TokenType.String) action += ' "' + t.value + '"';
              else action += " " + t.value;
            }
          } else {
            const tok = this.advance();
            if (tok.type === TokenType.String)
              action += (action ? " " : "") + '"' + tok.value + '"';
            else action += (action ? " " : "") + tok.value;
          }
        }
        const attrName =
          "on" + eventName.charAt(0).toUpperCase() + eventName.slice(1);
        const attrValue =
          modifiers.length > 0
            ? "__mods:" + modifiers.join(",") + ":" + action.trim()
            : action.trim();
        attributes.push({ name: attrName, value: attrValue });
        continue;
      }
      const next = this.peek();

      // String content: h1 "Hello"
      if (next.type === TokenType.String) {
        content = {
          type: "StringLiteral",
          value: this.advance().value,
          line: next.line,
          col: next.col,
        };
      }
      // v0.30: keyword tokens used as element content (input email, input action, etc.)
      else if (
        (next.type === TokenType.Email ||
          next.type === TokenType.Action ||
          next.type === TokenType.Let ||
          next.type === TokenType.Const ||
          next.type === TokenType.Env) &&
        this.peekAt(1)?.type !== TokenType.LeftBrace &&
        this.peekAt(1)?.type !== TokenType.LeftParen
      ) {
        content = {
          type: "Identifier",
          name: this.advance().value,
          line: next.line,
          col: next.col,
        };
      }
      // Property access: .name or .author.name (nested)
      else if (next.type === TokenType.Dot) {
        this.advance();
        let path = "." + this.consumeIdentifier();
        // Continue for nested: .author.name, .user.profile.avatar
        while (
          this.check(TokenType.Dot) &&
          this.peekAt(1)?.type === TokenType.Identifier
        ) {
          this.advance(); // .
          path += "." + this.consumeIdentifier();
        }
        // If we already had an Identifier content (e.g., "user"), combine into StoreAccess
        if (content && (content as any).type === "Identifier") {
          const storeName = (content as any).name;
          const field = path.substring(1); // remove leading dot
          content = {
            type: "StoreAccess",
            store: storeName,
            field,
            line: next.line,
            col: next.col,
          } as StoreAccess;
        } else {
          content = {
            type: "PropertyAccess",
            path,
            line: next.line,
            col: next.col,
          };
        }
      }
      // Attribute: key=value or key="complex value" (including keyword tokens like style=)
      // Attribute: key=value — handle keywords that can also be attribute names
      else if (
        (next.type === TokenType.Identifier ||
          next.type === TokenType.Style ||
          next.type === TokenType.Auth ||
          next.type === TokenType.Form ||
          next.type === TokenType.Data ||
          next.type === TokenType.State ||
          next.type === TokenType.Preset ||
          next.type === TokenType.Email ||
          next.type === TokenType.Action ||
          next.type === TokenType.Let ||
          next.type === TokenType.Const ||
          next.type === TokenType.Env ||
          next.type === TokenType.Type ||
          next.type === TokenType.Fn ||
          next.type === TokenType.Match ||
          next.type === TokenType.Test) &&
        this.peekAt(1)?.type === TokenType.Equals
      ) {
        const name = this.advance().value;
        this.advance(); // =
        const valToken = this.peek();
        if (name === "style" && valToken.type === TokenType.LeftBrace) {
          // style={ fs 1rem, c #fff } — unified NyxCode style syntax
          // Also supports multi-line: newlines act as separators (commas optional)
          this.advance(); // consume {
          const props: string[] = [];
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            let propName = this.advance().value;
            // #181: Handle vendor-prefixed properties (-webkit-*, -moz-*, -ms-*)
            if (
              propName === "-" &&
              this.peek()?.type === TokenType.Identifier
            ) {
              propName = "-" + this.advance().value;
              while (
                this.peek()?.value === "-" &&
                this.peekAt(1)?.type === TokenType.Identifier
              ) {
                this.advance(); // consume '-'
                propName += "-" + this.advance().value;
              }
            }
            let propVal = "";
            let parenD = 0;
            while (!this.isAtEnd()) {
              // Inside parens: consume everything (for calc, clamp, etc.)
              if (this.check(TokenType.LeftParen)) {
                parenD++;
                propVal += this.advance().value;
                continue;
              }
              if (this.check(TokenType.RightParen)) {
                parenD--;
                propVal += this.advance().value;
                continue;
              }
              if (parenD > 0) {
                const tok = this.advance();
                if (tok.type === TokenType.Comma) {
                  propVal += ", ";
                } else if (
                  (tok.value === "-" || tok.value === "+") &&
                  propVal.length > 0 &&
                  !propVal.endsWith("(")
                ) {
                  propVal += " " + tok.value + " ";
                } else {
                  // #141: Add space between tokens inside parens
                  // e.g. #1e6b8a 0% — without this, hex+percent merge
                  const needsSpace =
                    propVal.length > 0 &&
                    !propVal.endsWith("(") &&
                    !propVal.endsWith(", ");
                  propVal += (needsSpace ? " " : "") + tok.value;
                }
                continue;
              }
              // Outside parens: comma or } ends the property
              if (
                this.check(TokenType.Comma) ||
                this.check(TokenType.RightBrace)
              )
                break;
              // If we already have a value and the next token is a CSS shorthand, stop
              const nextTok = this.peek();
              if (
                propVal &&
                nextTok.type === TokenType.Identifier &&
                CSS_SHORTHANDS.has(nextTok.value)
              )
                break;
              propVal += (propVal ? " " : "") + this.advance().value;
            }
            if (this.check(TokenType.Comma)) this.advance();
            if (propName && propVal) {
              // Try Tailwind combo: e.g. propName="items", propVal="center" → "items-center"
              const twCombo = resolveTailwindClass(`${propName}-${propVal}`);
              if (twCombo) {
                for (const decl of twCombo)
                  props.push(decl.name + ": " + decl.value);
              } else {
                props.push(propName + ": " + propVal);
              }
            } else if (propName && !propVal) {
              // Valueless prop — check if it's a Tailwind utility class
              const tw = resolveTailwindClass(propName);
              if (tw) {
                for (const decl of tw)
                  props.push(decl.name + ": " + decl.value);
              }
              // If not Tailwind, silently drop (was already the behavior)
            }
          }
          if (this.check(TokenType.RightBrace)) this.advance();
          attributes.push({
            name: "style",
            value: "__nyx__" + props.join("; "),
          });
        } else if (valToken.type === TokenType.String) {
          attributes.push({ name, value: this.advance().value });
        } else {
          let val = this.advance().value;
          // Property access: .field or .field.subfield (e.g., title=.title, author=.author.name)
          if (val === "." && this.check(TokenType.Identifier)) {
            val += this.advance().value;
            while (
              this.check(TokenType.Dot) &&
              this.peekAt(1)?.type === TokenType.Identifier
            ) {
              val += this.advance().value; // .
              val += this.advance().value; // field
            }
          }
          // #139: Consume dotted paths after identifier (gap=spacing.md, color=colors.primary)
          while (
            this.check(TokenType.Dot) &&
            this.peekAt(1)?.type === TokenType.Identifier
          ) {
            val += this.advance().value; // .
            val += this.advance().value; // field
          }
          // Responsive shorthand: value@mobileValue (e.g., grid=3@1)
          if (
            this.check(TokenType.At) &&
            (this.peekAt(1)?.type === TokenType.Identifier ||
              this.peekAt(1)?.type === TokenType.Number)
          ) {
            val += this.advance().value; // @
            val += this.advance().value; // mobile value
          }
          attributes.push({ name, value: val });
        }
      }
      // $preset shorthand: $name → preset=name
      else if (next.type === TokenType.Dollar) {
        this.advance(); // consume $
        if (this.check(TokenType.Identifier)) {
          const presetName = this.advance().value;
          attributes.push({ name: "preset", value: presetName });
        }
      }
      // Identifier after element: could be content reference, boolean attribute, or layout shorthand
      else if (
        next.type === TokenType.Identifier &&
        !ELEMENT_TAGS.has(next.value) &&
        !this.isKeyword(next)
      ) {
        // Form handler keywords: success/error followed by -> are NOT attributes
        const FORM_HANDLERS = new Set(["success", "error"]);
        if (
          FORM_HANDLERS.has(next.value) &&
          this.tokens[this.pos + 1]?.type === TokenType.Arrow
        ) {
          break; // Let form parser handle these
        }
        // Layout shorthand booleans: center, between, around, evenly, wrap, nowrap
        // v0.24.0: 'burger' is a bare-attribute form on <nav> (Issue #96).
        //   `nav burger { ... }` → responsive collapsible nav.
        //   `nav burger=md { ... }` is handled by the key=value branch above.
        const LAYOUT_BOOLEANS = new Set([
          "center",
          "between",
          "around",
          "evenly",
          "wrap",
          "nowrap",
          "burger",
        ]);
        if (LAYOUT_BOOLEANS.has(next.value)) {
          attributes.push({ name: this.advance().value, value: "true" });
        }
        // If no content yet, treat first lone identifier as content reference
        else if (
          !content &&
          !this.peekAt(1)?.type?.toString().includes("Equals")
        ) {
          content = {
            type: "Identifier",
            name: this.advance().value,
            line: next.line,
            col: next.col,
          } as any;
        } else {
          attributes.push({ name: this.advance().value, value: "true" });
        }
      }
      // Children/Style block: { ... }
      else if (next.type === TokenType.LeftBrace) {
        // If element has .prop content and { } looks like style properties, parse as inline style block
        if (
          content &&
          (content as any).type === "PropertyAccess" &&
          this.looksLikeStyleBlock()
        ) {
          const styleBlock = this.parseStyleBlockInline();
          children = [styleBlock];
        } else {
          this.advance();
          children = this.parseBody();
          this.consume(TokenType.RightBrace);
        }
        break;
      }
      // Arrow (event on element): button "Go" -> navigate /home
      else if (next.type === TokenType.Arrow) {
        this.advance();
        let action = "";
        while (!this.isAtEnd() && !this.isStatementStart()) {
          const cur = this.peek();
          // LeftBrace after arrow: if action already has content, this is the element BODY, not part of the action
          if (cur.type === TokenType.LeftBrace) {
            if (action.trim().length > 0) {
              // Action is complete — { starts element children
              break;
            }
            // Otherwise it's an inline JS object in the action
            action += " {";
            this.advance();
            let depth = 1;
            while (depth > 0 && !this.isAtEnd()) {
              const t = this.advance();
              if (t.type === TokenType.LeftBrace) depth++;
              else if (t.type === TokenType.RightBrace) {
                depth--;
                if (depth === 0) {
                  action += " }";
                  break;
                }
              }
              action += " " + t.value;
            }
          } else if (cur.type === TokenType.RightBrace) {
            break; // end of parent block
          } else {
            const tok = this.advance();
            // Preserve quotes around string values so the compiler can generate correct JS
            if (tok.type === TokenType.String) {
              action += (action ? " " : "") + '"' + tok.value + '"';
            } else {
              action += (action ? " " : "") + tok.value;
            }
          }
        }
        attributes.push({ name: "onClick", value: action.trim() });
        // Don't break — continue loop so { } can be parsed as element children
        continue;
      }
      // Comma (sibling separator in inline)
      else if (next.type === TokenType.Comma) {
        this.advance();
        break;
      } else {
        break;
      }
    }

    return {
      type: "Element",
      tag,
      content,
      attributes,
      children,
      line: start.line,
      col: start.col,
    };
  }

  // --- Expression parsing ---

  private parseExpression(): Expression {
    return this.parseTernary();
  }

  /** Ternary: expr ? expr : expr */
  private parseTernary(): Expression {
    let expr = this.parsePipe();
    if (this.check(TokenType.Question)) {
      this.advance();
      const consequent = this.parsePipe();
      this.consume(TokenType.Colon);
      const alternate = this.parsePipe();
      expr = {
        type: "TernaryExpression",
        condition: expr,
        consequent,
        alternate,
        line: expr.line,
        col: expr.col,
      };
    }
    return expr;
  }

  /** Pipe: expr | builtin args */
  private parsePipe(): Expression {
    let expr = this.parseOr();
    while (this.check(TokenType.Pipe)) {
      this.advance();
      const builtin = this.consumeIdentifier();
      const args: Expression[] = [];
      // Collect pipe arguments: stop at pipe, comparison ops, logic ops, newline, brace, etc.
      while (
        !this.isAtEnd() &&
        !this.check(TokenType.Pipe) &&
        !this.check(TokenType.Newline) &&
        !this.check(TokenType.RightBrace) &&
        !this.check(TokenType.RightParen) &&
        !this.check(TokenType.RightBracket) &&
        !this.check(TokenType.Question) &&
        !this.check(TokenType.Colon) &&
        !this.check(TokenType.EOF) &&
        !this.isComparisonOp() &&
        !this.check(TokenType.And) &&
        !this.check(TokenType.Or) &&
        !this.check(TokenType.Ampersand) &&
        !this.check(TokenType.LeftBrace)
      ) {
        args.push(this.parsePrimary());
      }
      expr = {
        type: "PipeExpression",
        input: expr,
        builtin,
        args,
        line: expr.line,
        col: expr.col,
      };
    }
    // After pipe, allow comparison: items | len > 0
    if (this.isComparisonOp()) {
      const op = this.advance().value;
      const right = this.parseAddition();
      expr = {
        type: "BinaryExpression",
        left: expr,
        operator: op,
        right,
        line: expr.line,
        col: expr.col,
      };
    }
    return expr;
  }

  /** Or: expr or expr */
  private parseOr(): Expression {
    let left = this.parseAnd();
    while (
      this.check(TokenType.Or) ||
      (this.check(TokenType.Pipe) && this.peekAt(1)?.type === TokenType.Pipe)
    ) {
      this.advance();
      const right = this.parseAnd();
      left = {
        type: "BinaryExpression",
        left,
        operator: "or",
        right,
        line: left.line,
        col: left.col,
      };
    }
    return left;
  }

  /** And: expr and expr */
  private parseAnd(): Expression {
    let left = this.parseComparison();
    while (this.check(TokenType.And) || this.check(TokenType.Ampersand)) {
      this.advance();
      const right = this.parseComparison();
      left = {
        type: "BinaryExpression",
        left,
        operator: "and",
        right,
        line: left.line,
        col: left.col,
      };
    }
    return left;
  }

  /** Comparison: expr == != < > <= >= expr */
  private parseComparison(): Expression {
    let left = this.parseAddition();
    if (this.isComparisonOp()) {
      const op = this.advance().value;
      const right = this.parseAddition();
      left = {
        type: "BinaryExpression",
        left,
        operator: op,
        right,
        line: left.line,
        col: left.col,
      };
    }
    return left;
  }

  private isComparisonOp(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.DoubleEquals ||
      t === TokenType.NotEquals ||
      t === TokenType.LessThan ||
      t === TokenType.GreaterThan ||
      t === TokenType.LessEquals ||
      t === TokenType.GreaterEquals
    );
  }

  /** Addition: expr + - expr */
  private parseAddition(): Expression {
    let left = this.parseMultiplication();
    while (
      this.check(TokenType.Plus) ||
      this.check(TokenType.Minus) ||
      (this.check(TokenType.Identifier) && this.peek().value === "-")
    ) {
      const op = this.advance().value;
      const right = this.parseMultiplication();
      left = {
        type: "BinaryExpression",
        left,
        operator: op,
        right,
        line: left.line,
        col: left.col,
      };
    }
    return left;
  }

  /** Multiplication: expr * / % expr */
  private parseMultiplication(): Expression {
    let left = this.parseUnary();
    while (
      this.check(TokenType.Star) ||
      this.check(TokenType.Slash) ||
      this.check(TokenType.Percent)
    ) {
      const op = this.advance().value;
      const right = this.parseUnary();
      left = {
        type: "BinaryExpression",
        left,
        operator: op,
        right,
        line: left.line,
        col: left.col,
      };
    }
    return left;
  }

  /** Unary: not expr, !expr, -expr */
  private parseUnary(): Expression {
    if (this.check(TokenType.Not) || this.check(TokenType.Bang)) {
      const op = this.advance().value;
      const operand = this.parseUnary();
      return {
        type: "UnaryExpression",
        operator: op === "not" ? "!" : op,
        operand,
        line: operand.line,
        col: operand.col,
      };
    }
    if (
      this.check(TokenType.Minus) ||
      (this.check(TokenType.Identifier) && this.peek().value === "-")
    ) {
      const t = this.advance();
      const operand = this.parseUnary();
      return {
        type: "UnaryExpression",
        operator: "-",
        operand,
        line: t.line,
        col: t.col,
      };
    }
    return this.parsePostfix();
  }

  /** Postfix: member access, index access, function calls */
  private parsePostfix(): Expression {
    let expr = this.parsePrimary();
    while (true) {
      if (this.check(TokenType.Dot)) {
        this.advance();
        const prop = this.consumeIdentifier();
        // Check for method call: obj.method(args)
        if (this.check(TokenType.LeftParen)) {
          this.advance();
          const args: Expression[] = [];
          while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
            if (args.length > 0) this.consume(TokenType.Comma);
            args.push(this.parseExpression());
          }
          this.consume(TokenType.RightParen);
          const callee: Expression = {
            type: "MemberExpression",
            object: expr,
            property: prop,
            line: expr.line,
            col: expr.col,
          };
          expr = {
            type: "CallExpression",
            callee,
            args,
            line: expr.line,
            col: expr.col,
          };
        } else {
          expr = {
            type: "MemberExpression",
            object: expr,
            property: prop,
            line: expr.line,
            col: expr.col,
          };
        }
      } else if (this.check(TokenType.LeftBracket)) {
        this.advance();
        const index = this.parseExpression();
        this.consume(TokenType.RightBracket);
        expr = {
          type: "IndexExpression",
          object: expr,
          index,
          line: expr.line,
          col: expr.col,
        };
      } else if (
        this.check(TokenType.LeftParen) &&
        expr.type === "Identifier"
      ) {
        // function call: fn(args)
        this.advance();
        const args: Expression[] = [];
        while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
          if (args.length > 0) this.consume(TokenType.Comma);
          args.push(this.parseExpression());
        }
        this.consume(TokenType.RightParen);
        expr = {
          type: "CallExpression",
          callee: expr,
          args,
          line: expr.line,
          col: expr.col,
        };
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.peek();

    // Parenthesized expression: (expr)
    if (token.type === TokenType.LeftParen) {
      this.advance();
      const expr = this.parseExpression();
      this.consume(TokenType.RightParen);
      return expr;
    }

    // Array literal: [1, 2, 3]
    if (token.type === TokenType.LeftBracket) {
      this.advance();
      const elements: Expression[] = [];
      while (!this.check(TokenType.RightBracket) && !this.isAtEnd()) {
        if (elements.length > 0) this.consume(TokenType.Comma);
        elements.push(this.parseExpression());
      }
      this.consume(TokenType.RightBracket);
      return {
        type: "ArrayLiteral",
        elements,
        line: token.line,
        col: token.col,
      };
    }

    // Property access: .user.name (legacy syntax, keep for backwards compat)
    if (token.type === TokenType.Dot) {
      this.advance();
      let path = ".";
      path += this.consumeIdentifier();
      while (this.check(TokenType.Dot)) {
        this.advance();
        path += "." + this.consumeIdentifier();
      }
      return { type: "PropertyAccess", path, line: token.line, col: token.col };
    }

    // Store access: $theme.mode
    if (token.type === TokenType.Dollar) {
      this.advance();
      const store = this.consumeIdentifier();
      if (this.check(TokenType.Dot)) {
        this.consume(TokenType.Dot);
        const field = this.consumeIdentifier();
        return {
          type: "StoreAccess",
          store,
          field,
          line: token.line,
          col: token.col,
        };
      }
      // Just $name (pipe context variable)
      return {
        type: "Identifier",
        name: "$" + store,
        line: token.line,
        col: token.col,
      };
    }

    // Await expression
    if (token.type === TokenType.Await) {
      this.advance();
      const argument = this.parsePostfix();
      return {
        type: "AwaitExpression",
        argument,
        line: token.line,
        col: token.col,
      };
    }

    // String literal
    if (token.type === TokenType.String) {
      this.advance();
      return {
        type: "StringLiteral",
        value: token.value,
        line: token.line,
        col: token.col,
      };
    }

    // Number literal
    if (token.type === TokenType.Number) {
      this.advance();
      return {
        type: "NumberLiteral",
        value: parseFloat(token.value),
        line: token.line,
        col: token.col,
      };
    }

    // Boolean literals
    if (
      token.type === TokenType.Identifier &&
      (token.value === "true" || token.value === "false")
    ) {
      this.advance();
      return {
        type: "BooleanLiteral",
        value: token.value === "true",
        line: token.line,
        col: token.col,
      };
    }

    // Identifier (including keywords used as variable names in expressions)
    if (token.type === TokenType.Identifier || this.isKeywordToken(token)) {
      this.advance();
      return {
        type: "Identifier",
        name: token.value,
        line: token.line,
        col: token.col,
      };
    }

    throw this.error(`Unexpected token '${token.value}' in expression`);
  }

  // --- Helpers ---

  private parseProps(): PropDef[] {
    const props: PropDef[] = [];
    while (this.check(TokenType.Identifier)) {
      // Stop if the identifier is an element tag (it's the start of component body)
      if (ELEMENT_TAGS.has(this.peek().value)) break;
      // Stop if the identifier is uppercase (component invocation)
      if (this.peek().value[0] >= "A" && this.peek().value[0] <= "Z") break;
      const name = this.consumeIdentifier();
      let optional = this.check(TokenType.Question);
      if (optional) this.advance();
      // Optional type annotation `: string` — consumed and ignored (NyxCode is dynamically typed)
      if (this.check(TokenType.Colon)) {
        this.advance(); // :
        if (this.check(TokenType.Identifier)) this.advance(); // the type keyword (string, number, bool, etc.)
      }
      let defaultValue: string | undefined;
      // Check for default value: prop="value" or prop=123
      if (this.check(TokenType.Equals)) {
        this.advance(); // consume =
        if (this.check(TokenType.String)) defaultValue = this.advance().value;
        else if (this.check(TokenType.Number))
          defaultValue = this.advance().value;
        else defaultValue = this.advance().value;
        optional = true;
      }
      props.push({ name, optional, defaultValue });
    }
    return props;
  }

  private consumeBlock(): string {
    this.consume(TokenType.LeftBrace);
    let depth = 1;
    let body = "";
    while (depth > 0 && !this.isAtEnd()) {
      const t = this.advance();
      if (t.type === TokenType.LeftBrace) depth++;
      else if (t.type === TokenType.RightBrace) {
        depth--;
        if (depth === 0) break;
      }
      body += t.value + " ";
    }
    return body.trim();
  }

  private isKeywordToken(token: Token): boolean {
    // ALL keywords — allowed as identifiers in expression context (e.g. state page = "x"; when page == "x")
    const keywordTypes: Set<TokenType> = new Set([
      TokenType.Page,
      TokenType.Component,
      TokenType.Layout,
      TokenType.State,
      TokenType.Data,
      TokenType.Each,
      TokenType.When,
      TokenType.Else,
      TokenType.Form,
      TokenType.Table,
      TokenType.Auth,
      TokenType.Security,
      TokenType.On,
      TokenType.Theme,
      TokenType.Preset,
      TokenType.Validate,
      TokenType.Script,
      TokenType.Use,
      TokenType.Api,
      TokenType.Respond,
      TokenType.Query,
      TokenType.Head,
      TokenType.Style,
      TokenType.Store,
      TokenType.Raw,
      TokenType.Limit,
      TokenType.Animate,
      TokenType.Effect,
      TokenType.Computed,
      TokenType.Config,
      TokenType.Before,
      TokenType.After,
      TokenType.Let,
      TokenType.Const,
      TokenType.Env,
      TokenType.Email,
      TokenType.Fn,
      TokenType.Match,
      TokenType.Return,
      TokenType.Type,
      TokenType.Try,
      TokenType.Catch,
      TokenType.Defer,
      TokenType.Test,
      TokenType.Throw,
      TokenType.Stream,
    ]);
    return keywordTypes.has(token.type);
  }

  private peekNext(): Token | undefined {
    if (this.pos + 1 >= this.tokens.length) return undefined;
    return this.tokens[this.pos + 1];
  }

  private peek(): Token {
    return (
      this.tokens[this.pos] || {
        type: TokenType.EOF,
        value: "",
        line: 0,
        col: 0,
      }
    );
  }

  private peekAt(offset: number): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private advance(): Token {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  private consume(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      if (type === TokenType.RightBrace && token.type === TokenType.EOF) {
        // Scan backwards to find the most likely unclosed {
        let depth = 0;
        for (let i = this.pos - 1; i >= 0; i--) {
          const t = this.tokens[i];
          if (t.type === TokenType.RightBrace) depth++;
          else if (t.type === TokenType.LeftBrace) {
            if (depth === 0) {
              const ctx = i > 0 ? this.tokens[i - 1].value : "block";
              throw new Error(
                `[NyxCode Parser Error] Unclosed block: opened at line ${t.line}:${t.col} (${ctx}) — expected } before EOF`,
              );
            }
            depth--;
          }
        }
      }
      throw this.error(
        `Expected ${type}, got '${token.value}' (${token.type})`,
      );
    }
    // Track brace stack for better errors
    if (type === TokenType.LeftBrace) {
      const prev = this.tokens[this.pos - 1]; // token before { (the name/keyword)
      const ctx = prev ? prev.value : "block";
      this.braceStack.push({ line: token.line, col: token.col, context: ctx });
    } else if (type === TokenType.RightBrace && this.braceStack.length > 0) {
      this.braceStack.pop();
    }
    return this.advance();
  }

  private consumeIdentifier(): string {
    const token = this.peek();
    if (token.type === TokenType.Identifier || token.type in TokenType) {
      // Allow keywords used as identifiers in certain contexts
      if (
        token.type === TokenType.Identifier ||
        this.isContextualIdentifier(token)
      ) {
        this.advance();
        return token.value;
      }
    }
    // Accept any token as identifier in flexible contexts
    this.advance();
    return token.value;
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  /**
   * Checks if a token represents a valid column type in table definitions.
   * Handles the case where type keywords (like 'email') are lexed as their
   * own TokenType rather than Identifier. Prevents #143-class bugs for any
   * keyword that doubles as a column type.
   */
  private isColumnType(token: Token, typeKeywords: Set<string>): boolean {
    // Direct match: identifier whose value is a known type
    if (token.type === TokenType.Identifier && typeKeywords.has(token.value))
      return true;
    // Keyword tokens that are also valid column types (e.g., TokenType.Email → 'email')
    if (token.type !== TokenType.Identifier && typeKeywords.has(token.value))
      return true;
    return false;
  }

  private isBinaryOp(): boolean {
    const t = this.peek().type;
    return (
      t === TokenType.DoubleEquals ||
      t === TokenType.NotEquals ||
      t === TokenType.LessThan ||
      t === TokenType.GreaterThan ||
      t === TokenType.LessEquals ||
      t === TokenType.GreaterEquals ||
      t === TokenType.Ampersand ||
      t === TokenType.Pipe ||
      t === TokenType.Plus ||
      t === TokenType.Minus ||
      t === TokenType.Star ||
      t === TokenType.Slash ||
      t === TokenType.Percent ||
      t === TokenType.And ||
      t === TokenType.Or
    );
  }

  private isStatementStart(): boolean {
    const t = this.peek();
    return (
      t.type === TokenType.Data ||
      t.type === TokenType.Each ||
      t.type === TokenType.When ||
      t.type === TokenType.Style ||
      t.type === TokenType.Form ||
      t.type === TokenType.Auth ||
      t.type === TokenType.On ||
      t.type === TokenType.Validate ||
      t.type === TokenType.Respond ||
      t.type === TokenType.Limit ||
      t.type === TokenType.Query ||
      t.type === TokenType.Else ||
      t.type === TokenType.State ||
      t.type === TokenType.Effect ||
      t.type === TokenType.Computed ||
      t.type === TokenType.Head ||
      t.type === TokenType.Animate ||
      t.type === TokenType.Let ||
      t.type === TokenType.Const ||
      t.type === TokenType.Fn ||
      t.type === TokenType.Match ||
      t.type === TokenType.Test ||
      t.type === TokenType.Type ||
      t.type === TokenType.Return ||
      t.type === TokenType.Rate ||
      t.type === TokenType.Expect ||
      (t.type === TokenType.Identifier &&
        t.value === "footnotes" &&
        this.peekAt(1)?.type === TokenType.LeftBrace) ||
      (t.type === TokenType.Identifier &&
        t.value === "meta" &&
        this.peekAt(1)?.type === TokenType.LeftBrace) ||
      (t.type === TokenType.Identifier &&
        t.value === "icon" &&
        this.peekAt(1)?.type === TokenType.String) ||
      (t.type === TokenType.Identifier && ELEMENT_TAGS.has(t.value)) ||
      // Uppercase identifiers are component invocations (e.g., Card, Header)
      (t.type === TokenType.Identifier &&
        t.value[0] >= "A" &&
        t.value[0] <= "Z")
    );
  }

  private isKeyword(token: Token): boolean {
    return (
      token.type !== TokenType.Identifier &&
      token.type !== TokenType.String &&
      token.type !== TokenType.Number
    );
  }

  private isContextualIdentifier(token: Token): boolean {
    // Some keywords can be used as identifiers (e.g., 'required', 'admin')
    return true;
  }

  private isConstraintKeyword(value: string): boolean {
    // Type keywords AND constraint keywords — anything that's NOT a new column name
    return [
      "text",
      "email",
      "number",
      "int",
      "float",
      "decimal",
      "bool",
      "auto",
      "required",
      "unique",
      "default",
      "ref",
    ].includes(value);
  }

  // ── v0.34: fn — user-defined functions ─────────────────────────────

  private parseFnDeclaration(): FnNode {
    const start = this.consume(TokenType.Fn);
    const name = this.consumeIdentifier();
    const params: FnParam[] = [];
    if (this.check(TokenType.LeftParen)) {
      this.advance();
      while (!this.check(TokenType.RightParen) && !this.isAtEnd()) {
        const paramName = this.consumeIdentifier();
        let typeAnnotation: string | undefined;
        let defaultValue: string | undefined;
        if (this.check(TokenType.Colon)) {
          this.advance();
          typeAnnotation = this.consumeIdentifier();
        }
        if (this.check(TokenType.Equals)) {
          this.advance();
          if (this.check(TokenType.String))
            defaultValue = '"' + this.advance().value + '"';
          else if (this.check(TokenType.Number))
            defaultValue = this.advance().value;
          else defaultValue = this.advance().value;
        }
        params.push({ name: paramName, typeAnnotation, defaultValue });
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightParen);
    }
    if (this.check(TokenType.Equals)) {
      this.advance();
      const expr = this.consumeFnExpression();
      return {
        type: "Fn",
        name,
        params,
        body: [],
        shortForm: true,
        shortExpr: expr,
        line: start.line,
        col: start.col,
      };
    }
    this.consume(TokenType.LeftBrace);
    const body = this.parseFnBody();
    this.consume(TokenType.RightBrace);
    return {
      type: "Fn",
      name,
      params,
      body,
      shortForm: false,
      line: start.line,
      col: start.col,
    };
  }

  private parseFnBody(): FnStatement[] {
    const stmts: FnStatement[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const token = this.peek();
      if (token.type === TokenType.Identifier && token.value === "set") {
        this.advance();
        const setName = this.consumeIdentifier();
        this.consume(TokenType.Equals);
        const expr = this.consumeFnExpression();
        stmts.push({
          type: "FnSet",
          name: setName,
          expr,
          line: token.line,
          col: token.col,
        });
      } else if (token.type === TokenType.Return) {
        this.advance();
        const expr = this.consumeFnExpression();
        stmts.push({
          type: "FnReturn",
          expr,
          line: token.line,
          col: token.col,
        });
      } else if (token.type === TokenType.Match) {
        stmts.push(this.parseFnMatch());
      } else if (token.type === TokenType.When) {
        stmts.push(this.parseFnWhen());
      } else if (token.type === TokenType.Try) {
        stmts.push(this.parseFnTry());
      } else if (token.type === TokenType.Throw) {
        this.advance();
        const expr = this.consumeFnExpression();
        stmts.push({ type: "FnThrow", expr, line: token.line, col: token.col });
      } else if (
        token.type === TokenType.Identifier &&
        token.value === "defer"
      ) {
        this.advance();
        this.consume(TokenType.LeftBrace);
        const deferBody = this.parseFnBody();
        this.consume(TokenType.RightBrace);
        stmts.push({
          type: "FnDefer",
          body: deferBody,
          line: token.line,
          col: token.col,
        });
      } else if (token.type === TokenType.Each) {
        stmts.push(this.parseFnEach());
      } else {
        const expr = this.consumeFnExpression();
        if (expr)
          stmts.push({
            type: "FnExpr",
            expr,
            line: token.line,
            col: token.col,
          });
      }
    }
    return stmts;
  }

  private parseFnMatch(): FnMatchStatement {
    const start = this.consume(TokenType.Match);
    const subject = this.consumeFnExpression(true);
    const arms: MatchArm[] = [];
    this.consume(TokenType.LeftBrace);
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      let pattern: string;
      let isDefault = false;
      if (this.check(TokenType.Identifier) && this.peek().value === "_") {
        pattern = "_";
        isDefault = true;
        this.advance();
      } else if (this.check(TokenType.String)) {
        pattern = '"' + this.advance().value + '"';
      } else if (this.check(TokenType.Number)) {
        pattern = this.advance().value;
      } else {
        pattern = this.advance().value;
      }
      this.consume(TokenType.Arrow);
      if (this.check(TokenType.LeftBrace)) {
        this.advance();
        const armBody = this.parseFnBody();
        this.consume(TokenType.RightBrace);
        arms.push({ pattern, body: armBody, isDefault });
      } else {
        // Single expression arm — stop before next pattern or }
        const expr = this.consumeMatchArmExpression();
        arms.push({ pattern, body: expr, isDefault });
      }
    }
    this.consume(TokenType.RightBrace);
    return { type: "FnMatch", subject, arms, line: start.line, col: start.col };
  }

  /** Consume an expression inside a match arm. Stops before the next pattern (string/number/ident + ->) or } */
  private consumeMatchArmExpression(): string {
    let expr = "";
    let parenDepth = 0;
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (parenDepth === 0) {
        if (tok.type === TokenType.RightBrace) break;
        // Check if this is the start of a new match arm: pattern followed by ->
        if (
          (tok.type === TokenType.String ||
            tok.type === TokenType.Number ||
            (tok.type === TokenType.Identifier &&
              (tok.value === "_" || this.isMatchPattern(tok)))) &&
          this.peekAt(1)?.type === TokenType.Arrow
        ) {
          break; // New match arm starts here
        }
      }
      if (tok.type === TokenType.LeftParen) parenDepth++;
      if (tok.type === TokenType.RightParen) {
        if (parenDepth === 0) break;
        parenDepth--;
      }
      const t = this.advance();
      if (t.type === TokenType.String) {
        expr += '"' + t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      } else {
        if (
          expr.length > 0 &&
          !expr.endsWith("(") &&
          !expr.endsWith(".") &&
          t.value !== "." &&
          t.value !== "(" &&
          t.value !== ")" &&
          t.value !== ","
        )
          expr += " ";
        expr += t.value;
      }
    }
    return expr.trim();
  }

  private isMatchPattern(tok: Token): boolean {
    // Any identifier that's followed by -> could be a match pattern (like true, false, null, custom names)
    return tok.type === TokenType.Identifier;
  }

  private parseFnWhen(): FnStatement {
    const start = this.consume(TokenType.When);
    const condition = this.consumeFnExpression(true);
    this.consume(TokenType.LeftBrace);
    const body = this.parseFnBody();
    this.consume(TokenType.RightBrace);
    let elseBody: FnStatement[] | undefined;
    if (this.check(TokenType.Else)) {
      this.advance();
      this.consume(TokenType.LeftBrace);
      elseBody = this.parseFnBody();
      this.consume(TokenType.RightBrace);
    }
    return {
      type: "FnWhen",
      condition,
      body,
      elseBody,
      line: start.line,
      col: start.col,
    };
  }

  private parseFnTry(): FnStatement {
    const start = this.consume(TokenType.Try);
    this.consume(TokenType.LeftBrace);
    const body = this.parseFnBody();
    this.consume(TokenType.RightBrace);
    let catchParam: string | undefined;
    let catchBody: FnStatement[] = [];
    if (this.check(TokenType.Catch)) {
      this.advance();
      if (this.check(TokenType.Identifier)) catchParam = this.advance().value;
      this.consume(TokenType.LeftBrace);
      catchBody = this.parseFnBody();
      this.consume(TokenType.RightBrace);
    }
    return {
      type: "FnTry",
      body,
      catchParam,
      catchBody,
      line: start.line,
      col: start.col,
    };
  }

  private parseFnEach(): FnStatement {
    const start = this.consume(TokenType.Each);
    // Collection can be a complex expression — consume until we hit -> at top level
    let collection = "";
    let parenDepth = 0;
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (tok.type === TokenType.Arrow && parenDepth === 0) break;
      if (tok.type === TokenType.LeftParen) parenDepth++;
      if (tok.type === TokenType.RightParen) parenDepth--;
      const t = this.advance();
      if (t.type === TokenType.String) {
        collection += '"' + t.value + '"';
      } else {
        if (
          collection.length > 0 &&
          !collection.endsWith("(") &&
          !collection.endsWith(".") &&
          t.value !== "." &&
          t.value !== "(" &&
          t.value !== ")" &&
          t.value !== "[" &&
          t.value !== "]"
        ) {
          collection += " ";
        }
        collection += t.value;
      }
    }
    collection = collection.trim();
    this.consume(TokenType.Arrow);
    const item = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const body = this.parseFnBody();
    this.consume(TokenType.RightBrace);
    return {
      type: "FnEach",
      collection,
      item,
      body,
      line: start.line,
      col: start.col,
    };
  }

  private consumeFnExpression(stopAtBrace: boolean = false): string {
    let expr = "";
    let parenDepth = 0;
    let bracketDepth = 0;
    let braceDepth = 0;
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
        if (
          tok.type === TokenType.Return ||
          tok.type === TokenType.Match ||
          tok.type === TokenType.When ||
          tok.type === TokenType.Try ||
          tok.type === TokenType.Throw ||
          tok.type === TokenType.Each ||
          tok.type === TokenType.Catch ||
          tok.type === TokenType.Else
        )
          break;
        if (
          tok.type === TokenType.Identifier &&
          (tok.value === "set" || tok.value === "defer")
        )
          break;
        // Stop at top-level keywords (short-form fn expressions must end here)
        if (
          tok.type === TokenType.Fn ||
          tok.type === TokenType.Test ||
          tok.type === TokenType.Type ||
          tok.type === TokenType.Page ||
          tok.type === TokenType.Component ||
          tok.type === TokenType.Api ||
          tok.type === TokenType.Table ||
          tok.type === TokenType.Store ||
          tok.type === TokenType.PipeBlock ||
          tok.type === TokenType.Action ||
          tok.type === TokenType.Layout ||
          tok.type === TokenType.Theme ||
          tok.type === TokenType.Security ||
          tok.type === TokenType.Config ||
          tok.type === TokenType.Env ||
          tok.type === TokenType.Every ||
          tok.type === TokenType.Stream ||
          tok.type === TokenType.EOF
        )
          break;
        if (tok.type === TokenType.RightBrace) break;
        if (stopAtBrace && tok.type === TokenType.LeftBrace) break;
      }
      if (tok.type === TokenType.LeftParen) parenDepth++;
      if (tok.type === TokenType.RightParen) {
        if (parenDepth === 0) break;
        parenDepth--;
      }
      if (tok.type === TokenType.LeftBracket) bracketDepth++;
      if (tok.type === TokenType.RightBracket) {
        if (bracketDepth === 0) break;
        bracketDepth--;
      }
      if (tok.type === TokenType.LeftBrace) braceDepth++;
      if (tok.type === TokenType.RightBrace) {
        if (braceDepth === 0) break;
        braceDepth--;
      }
      const t = this.advance();
      if (t.type === TokenType.String) {
        expr += '"' + t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      } else {
        const needsSpace =
          expr.length > 0 &&
          !expr.endsWith("(") &&
          !expr.endsWith("[") &&
          !expr.endsWith(".");
        if (
          needsSpace &&
          !expr.endsWith(".") &&
          t.value !== "." &&
          t.value !== "(" &&
          t.value !== ")" &&
          t.value !== "[" &&
          t.value !== "]" &&
          t.value !== ","
        ) {
          expr += " ";
        }
        expr += t.value;
      }
    }
    return expr.trim();
  }

  // ── v0.34: type — custom data shapes ────────────────────────────────

  private parseTypeDeclaration(): TypeNode {
    const start = this.consume(TokenType.Type);
    const name = this.consumeIdentifier();
    const fields: TypeField[] = [];
    this.consume(TokenType.LeftBrace);
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const fieldName = this.consumeIdentifier();
      let optional = false;
      if (this.check(TokenType.Question)) {
        this.advance();
        optional = true;
      }
      this.consume(TokenType.Colon);
      const constraint = this.consumeIdentifier();
      let defaultValue: string | undefined;
      if (this.check(TokenType.Equals)) {
        this.advance();
        if (this.check(TokenType.String)) defaultValue = this.advance().value;
        else if (this.check(TokenType.Number))
          defaultValue = this.advance().value;
        else defaultValue = this.advance().value;
      }
      fields.push({ name: fieldName, constraint, optional, defaultValue });
      if (this.check(TokenType.Comma)) this.advance();
    }
    this.consume(TokenType.RightBrace);
    return { type: "Type", name, fields, line: start.line, col: start.col };
  }

  // ── v0.34: test — built-in test blocks ──────────────────────────────

  private parseTestBlock(): TestNode {
    const start = this.consume(TokenType.Test);
    const description = this.consume(TokenType.String).value;
    const body: TestAssertion[] = [];
    this.consume(TokenType.LeftBrace);
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const tok = this.peek();
      if (tok.type === TokenType.Identifier && tok.value === "assert") {
        this.advance();
        const expr = this.consumeTestExpression();
        body.push({ kind: "assert", expr, line: tok.line, col: tok.col });
      } else if (
        tok.type === TokenType.Identifier &&
        tok.value === "assertEq"
      ) {
        this.advance();
        // Collect expression tokens, respecting paren depth for commas
        const exprTokens: string[] = [];
        let parenD = 0;
        while (!this.isAtEnd()) {
          const p = this.peek();
          if (p.type === TokenType.LeftParen) parenD++;
          if (p.type === TokenType.RightParen) parenD--;
          // Only split on comma at top level (outside parens)
          if (p.type === TokenType.Comma && parenD === 0) break;
          if (p.type === TokenType.RightBrace && parenD <= 0) break;
          // Stop at next assertion keyword
          if (
            parenD === 0 &&
            p.type === TokenType.Identifier &&
            (p.value === "assert" ||
              p.value === "assertEq" ||
              p.value === "assertThrows")
          )
            break;
          const t = this.advance();
          exprTokens.push(
            t.type === TokenType.String ? '"' + t.value + '"' : t.value,
          );
        }
        let expected = "";
        if (this.check(TokenType.Comma)) {
          this.advance();
          expected = this.consumeTestExpression();
        }
        body.push({
          kind: "assertEq",
          expr: exprTokens.join(" "),
          expected,
          line: tok.line,
          col: tok.col,
        });
      } else if (
        tok.type === TokenType.Identifier &&
        tok.value === "assertThrows"
      ) {
        this.advance();
        const expr = this.consumeTestExpression();
        body.push({ kind: "assertThrows", expr, line: tok.line, col: tok.col });
      } else {
        this.advance();
      }
    }
    this.consume(TokenType.RightBrace);
    return {
      type: "Test",
      description,
      body,
      line: start.line,
      col: start.col,
    };
  }

  /** Consume expression inside test blocks — stops at assert/assertEq/assertThrows/} */
  private consumeTestExpression(): string {
    let expr = "";
    let parenDepth = 0;
    while (!this.isAtEnd()) {
      const tok = this.peek();
      if (parenDepth === 0) {
        if (tok.type === TokenType.RightBrace) break;
        if (
          tok.type === TokenType.Identifier &&
          (tok.value === "assert" ||
            tok.value === "assertEq" ||
            tok.value === "assertThrows")
        )
          break;
      }
      if (tok.type === TokenType.LeftParen) parenDepth++;
      if (tok.type === TokenType.RightParen) {
        if (parenDepth === 0) break;
        parenDepth--;
      }
      const t = this.advance();
      if (t.type === TokenType.String) {
        expr += '"' + t.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      } else {
        if (
          expr.length > 0 &&
          !expr.endsWith("(") &&
          !expr.endsWith(".") &&
          t.value !== "." &&
          t.value !== "(" &&
          t.value !== ")" &&
          t.value !== ","
        )
          expr += " ";
        expr += t.value;
      }
    }
    return expr.trim();
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(
      `[NyxCode Parser Error] ${message} at line ${token.line}:${token.col}`,
    );
  }
}
