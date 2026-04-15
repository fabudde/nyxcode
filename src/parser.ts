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

import { Token, TokenType } from './tokens.js';
import {
  Program, TopLevelNode, PageNode, ComponentNode, ApiNode,
  TableNode, StoreNode, ThemeNode, Statement, DataStatement,
  DataSource, EachStatement, WhenStatement, StyleBlock, StyleProperty,
  FormStatement, AuthStatement, OnStatement, ElementNode, Attribute,
  Expression, PropertyAccess, StringLiteral, NumberLiteral, StoreAccess,
  Identifier as IdentNode, PropDef, ColumnDef, StoreField,
  ThemeSection, ValidateStatement, ValidateField, RespondStatement,
  LimitStatement, QueryStatement, ResponsiveBlock, SecurityNode, SecurityRule,
  StateStatement, EffectStatement, ComputedStatement, UseStatement,
  HeadStatement, AnimateStatement, PseudoElementBlock, LayoutNode,
  ScriptStatement, FormAction, ConfigNode, EnvVar, HookNode,
} from './ast.js';

/** Set of tags that are recognized as built-in elements */
const ELEMENT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'text', 'span', 'link', 'img', 'video',
  'button', 'input', 'select', 'checkbox', 'radio', 'toggle', 'slider', 'textarea',
  'card', 'badge', 'table', 'list', 'metric', 'chart', 'avatar', 'tag',
  'alert', 'toast', 'modal', 'tooltip', 'progress', 'spinner',
  'div', 'row', 'col', 'grid', 'stack', 'container', 'section', 'aside', 'nav', 'footer', 'header', 'main', 'article', 'figure', 'figcaption', 'ul', 'ol', 'li', 'a', 'label', 'form', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'strong', 'em', 'small', 'sup', 'sub', 'details', 'summary',
  'slot', 'submit', 'br', 'hr',
]);

const CSS_SHORTHANDS = new Set([
  'bg', 'bgc', 'bgi', 'bgs', 'bgp', 'bgr', 'r', 'radius', 'shadow', 'tshadow',
  'op', 'z', 'pos', 'p', 'pt', 'pr', 'pb', 'pl', 'px', 'py',
  'm', 'mt', 'mr', 'mb', 'ml', 'mx', 'my', 'gap', 'gg',
  'w', 'h', 'minw', 'maxw', 'minh', 'maxh', 'mw', 'mh', 'miw', 'mih',
  'fs', 'fw', 'ff', 'lh', 'ls', 'ta', 'td', 'tt', 'ws', 'wb', 'c',
  'border', 'bt', 'bb', 'bl', 'bc', 'bw', 'bs',
  'ai', 'jc', 'ac', 'as', 'fd', 'fg', 'fb', 'fsk',
  'gc', 'gr', 'gtc', 'gtr', 'ga',
  'd', 'of', 'ox', 'oy', 'v', 'cur',
  'tf', 'tr', 'anim', 'fi',
  'pe', 'us', 'ap', 'rs', 'ol', 'wc', 'ct', 'iso',
  'obf', 'obp', 'bf', 'fil', 'mix', 'si', 'sa',
  'ji', 'js', 'oc', 'ow', 'o',
  // Full CSS names that are common
  'background', 'color', 'padding', 'margin', 'width', 'height',
  'display', 'position', 'top', 'bottom', 'left', 'right',
  'font-size', 'font-weight', 'border-radius', 'opacity', 'overflow',
  'transition', 'transform', 'animation', 'cursor', 'box-shadow',
]);


export class Parser {
  private tokens: Token[];
  private pos: number = 0;

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

    return { type: 'Program', body, line: 1, col: 1 };
  }

  // --- Top-level constructs ---

  private parseTopLevel(): TopLevelNode | null {
    const token = this.peek();

    switch (token.type) {
      case TokenType.Page: return this.parsePage();
      case TokenType.Component: return this.parseComponent();
      case TokenType.Api: return this.parseApi();
      case TokenType.Table: return this.parseTable();
      case TokenType.Store: return this.parseStore();
      case TokenType.Theme: return this.parseTheme();
      case TokenType.Security: return this.parseSecurity();
      case TokenType.Config: return this.parseConfig();
      case TokenType.Before: return this.parseHook('before');
      case TokenType.After: return this.parseHook('after');
      case TokenType.Use: return this.parseUse();
      case TokenType.Layout: return this.parseLayout();
      case TokenType.Preset: return this.parsePreset() as any;
      case TokenType.EOF: return null;
      default:
        throw this.error(`Unexpected token '${token.value}' at top level. Expected: page, component, api, table, store, theme, security, layout, or preset.`);
    }
  }

  private parsePage(): PageNode {
    const start = this.consume(TokenType.Page);
    const path = this.consumeIdentifier(); // path like /dashboard
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: 'Page', path, body, line: start.line, col: start.col };
  }

  private parseComponent(): ComponentNode {
    const start = this.consume(TokenType.Component);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    let props: PropDef[] = [];
    if (this.check(TokenType.Props)) {
      this.advance(); // consume 'props'
      props = this.parseProps();
    }

    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: 'Component', name, props, body, line: start.line, col: start.col };
  }

  private parseApi(): ApiNode {
    const start = this.consume(TokenType.Api);
    const method = this.consumeIdentifier().toUpperCase(); // GET, POST, etc.
    const path = this.consumeIdentifier(); // /api/stats
    
    // Check for optional 'auth' keyword before {
    let auth = false;
    if (this.check(TokenType.Auth)) {
      this.advance();
      auth = true;
    }
    
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: 'Api', method, path, body, auth, line: start.line, col: start.col } as any;
  }



  private parseHook(timing: 'before' | 'after'): HookNode {
    const start = this.advance(); // consume before/after
    const method = this.consumeIdentifier().toUpperCase();
    const path = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return { type: 'Hook', timing, method, path, body, line: start.line, col: start.col };
  }

  private parseConfig(): ConfigNode {
    const start = this.consume(TokenType.Config);
    this.consume(TokenType.LeftBrace);
    
    const envVars: EnvVar[] = [];
    let cors: { origins: string[] } | undefined;
    
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const kw = this.consumeIdentifier();
      
      if (kw === 'env') {
        const name = this.consumeIdentifier();
        let required = false;
        let defaultValue: string | undefined;
        
        // Parse modifiers: required, default=value
        while (this.check(TokenType.Identifier) && !this.check(TokenType.RightBrace)) {
          const mod = this.peek().value;
          if (mod === 'required') {
            this.advance();
            required = true;
          } else if (mod === 'default') {
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
      } else if (kw === 'cors') {
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
    const typeKeywords = new Set(['text', 'email', 'number', 'int', 'float', 'decimal', 'bool', 'auto']);
    const constraintKeywords = new Set(['required', 'unique', 'default', 'ref', 'auto', 'min', 'max', 'format', 'pattern', 'enum']);

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const colName = this.consumeIdentifier();
      let colType = 'text'; // default type
      const constraints: string[] = [];

      // Next token should be the TYPE (text, email, number, etc.) or a table ref [tablename]
      if (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        if (next.type === TokenType.LeftBracket) {
          // Foreign key reference: [tablename]
          this.advance(); // consume [
          const refName = this.consumeIdentifier();
          this.consume(TokenType.RightBracket);
          colType = `[${refName}]`;
        } else if (next.type === TokenType.Identifier) {
          colType = this.advance().value;
        }
      }

      // Rest are constraints until we hit the next column name
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        if (next.type === TokenType.Identifier && constraintKeywords.has(next.value)) {
          const kw = this.advance().value;
          // Handle key=value pairs: min=3, max=500, format=email, default="user", pattern="^[a-z]+$"
          if (this.check(TokenType.Equals)) {
            this.advance(); // =
            const val = this.advance().value;
            constraints.push(kw + '=' + val);
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
    return { type: 'Table', name, columns, line: start.line, col: start.col };
  }

  private parseStore(): StoreNode {
    const start = this.consume(TokenType.Store);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    const body: StoreField[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const fieldToken = this.peek();
      let visibility: 'public' | 'private' = 'public';

      if (fieldToken.value === 'private' || fieldToken.value === 'public') {
        visibility = fieldToken.value as 'public' | 'private';
        this.advance();
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
    return { type: 'Store', name, body, line: start.line, col: start.col };
  }

  private parseTheme(): ThemeNode {
    const start = this.consume(TokenType.Theme);
    this.consume(TokenType.LeftBrace);

    const sections: ThemeSection[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const sectionName = this.consumeIdentifier();
      this.consume(TokenType.LeftBrace);

      const entries: Record<string, string> = {};
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.consumeIdentifier();
        // If next is a string literal, use directly
        if (this.peek().type === TokenType.String) {
          entries[key] = this.advance().value;
          if (this.check(TokenType.Comma)) this.advance();
          continue;
        }
        if (sectionName === 'fonts') {
          // Fonts: collect until comma, }, or known font key (heading/body/mono/code/display/ui)
          const FONT_KEYS = new Set(['heading', 'body', 'mono', 'code', 'display', 'ui', 'sans', 'serif']);
          let parts: string[] = [];
          while (!this.check(TokenType.RightBrace) && !this.check(TokenType.Comma) && !this.isAtEnd()) {
            // If this identifier is a known font key and we already have parts → new entry
            if (this.check(TokenType.Identifier) && parts.length > 0 && FONT_KEYS.has(this.peek().value)) {
              break;
            }
            parts.push(this.advance().value);
          }
          if (this.check(TokenType.Comma)) this.advance();
          entries[key] = parts.join(' ');
        } else {
          // Colors/other: simple single value (no multi-word needed)
          let parts: string[] = [];
          let parenDepth = 0;
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            if (this.check(TokenType.LeftParen)) { parenDepth++; parts.push(this.advance().value); continue; }
            if (this.check(TokenType.RightParen)) { parenDepth--; parts.push(this.advance().value); continue; }
            if (parenDepth > 0) { parts.push(this.advance().value); continue; }
            if (this.check(TokenType.Comma)) { this.advance(); break; }
            // If we have a value and next is an identifier, it's a new key
            if (parts.length > 0 && this.check(TokenType.Identifier)) break;
            parts.push(this.advance().value);
          }
          entries[key] = parts.join('');
        }
      }

      this.consume(TokenType.RightBrace);
      sections.push({ name: sectionName, entries });
    }

    this.consume(TokenType.RightBrace);
    return { type: 'Theme', sections, line: start.line, col: start.col };
  }

  private parseSecurity(): SecurityNode {
    const start = this.consume(TokenType.Security);
    this.consume(TokenType.LeftBrace);

    const rules: SecurityRule[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Rule name: identifier or path like /api/posts
      let name = '';
      if (this.peek().value.startsWith('/')) {
        name = this.advance().value;
      } else {
        name = this.consumeIdentifier();
      }
      // Collect ALL values on this line (space-separated identifiers/paths)
      const values: string[] = [];
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        // Stop if next token looks like a new rule name (known keywords)
        const ruleKeywords = ['table', 'login', 'token', 'protect', 'hash', 'session', 'role'];
        if (values.length > 0 && (next.type === TokenType.Identifier && ruleKeywords.includes(next.value))) break;
        if (values.length > 0 && next.value.startsWith('/')) break;
        if (next.type === TokenType.Identifier || next.type === TokenType.String) {
          values.push(this.advance().value);
        } else if (next.value.startsWith('/')) {
          values.push(this.advance().value);
        } else {
          break;
        }
      }
      rules.push({ name, value: values.join(' ') });
    }

    this.consume(TokenType.RightBrace);
    return { type: 'Security', rules, line: start.line, col: start.col };
  }

  private parseUse(): UseStatement {
    const start = this.consume(TokenType.Use);
    const path = this.consume(TokenType.String).value;
    return { type: 'Use', path, line: start.line, col: start.col };
  }

  private parseLayout(): LayoutNode {
    const start = this.consume(TokenType.Layout);
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);
    return { type: 'Layout', body, line: start.line, col: start.col };
  }

  /**
   * Parse `head "..."` — raw HTML string injected into <head>.
   * Use for fonts, meta tags, third-party CSS.
   * Example: head "<link href='https://fonts.googleapis.com/...' rel='stylesheet'>"
   */
  private parseHead(): HeadStatement {
    const start = this.consume(TokenType.Head);
    const content = this.consume(TokenType.String).value;
    return { type: 'Head', content, line: start.line, col: start.col };
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
    let content = '';
    let depth = 1;
    let lastType = '';
    while (!this.isAtEnd() && depth > 0) {
      const tok = this.advance();
      if (tok.type === TokenType.LeftBrace) { depth++; content += '{ '; lastType = '{'; }
      else if (tok.type === TokenType.RightBrace) { depth--; if (depth > 0) { content += '} '; lastType = '}'; } }
      else if (tok.value === ':') { content += ': '; lastType = ':'; }
      else if (tok.value === ';') { content += '; '; lastType = ';'; }
      else if (tok.type === TokenType.Comma) { content += ', '; lastType = ','; }
      else {
        // Don't add space after { or : or ( or numbers (for 50% etc)
        if (lastType === '{' || lastType === ':' || lastType === '(') {
          content += tok.value;
        } else if (tok.type === TokenType.LeftParen) {
          content += tok.value;
          lastType = '(';
          continue;
        } else if (tok.type === TokenType.RightParen) {
          content += tok.value;
        } else if (tok.value === '%') {
          // Attach % directly to preceding number (50% not 50 %)
          content += tok.value;
        } else {
          content += (content && lastType !== '{' && lastType !== ':' ? ' ' : '') + tok.value;
        }
        lastType = tok.type;
      }
    }
    return { type: 'Animate', name, content: content.trim(), line: start.line, col: start.col };
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
      case TokenType.Data: return this.parseData();
      case TokenType.Each: return this.parseEach();
      case TokenType.When: return this.parseWhen();
      case TokenType.Style:
        // Check if it's style="..." (attribute) or style { } (block)
        if (this.peekAt(1)?.type === TokenType.Equals) {
          return this.parseElement(); // treat as element attribute
        }
        return this.parseStyle();
      case TokenType.Form: return this.parseForm();
      case TokenType.Script: return this.parseScript();
      case TokenType.Preset: return this.parsePreset();
      case TokenType.Auth: return this.parseAuth();
      case TokenType.On: return this.parseOn();
      case TokenType.Validate: return this.parseValidate();
      case TokenType.Respond: return this.parseRespond();
      case TokenType.Limit: return this.parseLimitStmt();
      case TokenType.Query: return this.parseQuery();
      case TokenType.State: return this.parseState();
      case TokenType.Effect: return this.parseEffect();
      case TokenType.Computed: return this.parseComputed();
      case TokenType.Head: return this.parseHead();
      case TokenType.Animate: return this.parseAnimate();
      case TokenType.Identifier:
        return this.parseElement();
      case TokenType.Else: return null; // handled by parseWhen
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
        if (this.check(TokenType.Comma)) { this.advance(); continue; }
        const keyword = this.peek();
        if (keyword.type === TokenType.Identifier && ['loading', 'error', 'empty'].includes(keyword.value)) {
          const which = this.advance().value;
          if (this.check(TokenType.Arrow)) this.advance(); // ->
          // Parse the block or single element
          if (this.check(TokenType.LeftBrace)) {
            this.advance();
            const body = this.parseBody();
            this.consume(TokenType.RightBrace);
            if (which === 'loading') loadingBlock = body;
            else if (which === 'error') errorBlock = body;
            else if (which === 'empty') emptyBlock = body;
          } else {
            // Single element: loading -> p "Loading..."
            // Parse ONE element — consume tag + string content only, stop before next keyword
            const elemTag = this.consumeIdentifier();
            let elemContent: Expression | undefined;
            if (this.peek().type === TokenType.String) {
              elemContent = { type: 'StringLiteral', value: this.advance().value, line: this.peek().line, col: this.peek().col };
            }
            const elemNode: ElementNode = { type: 'Element', tag: elemTag, content: elemContent, attributes: [], children: [], line: start.line, col: start.col };
            if (which === 'loading') loadingBlock = [elemNode];
            else if (which === 'error') errorBlock = [elemNode];
            else if (which === 'empty') emptyBlock = [elemNode];
          }
        } else {
          break;
        }
      }
      this.consume(TokenType.RightBrace);
    }

    return { type: 'Data', name, typeAnnotation, source, loadingBlock, errorBlock, emptyBlock, line: start.line, col: start.col };
  }

  private parseDataSource(): DataSource {
    const kindToken = this.advance();
    const kind = kindToken.value.toLowerCase() as DataSource['kind'];

    if (kind === 'query') {
      const sql = this.consume(TokenType.String).value;
      return { kind: 'query', value: sql };
    }

    // get/post/patch/delete — next token is the URL path
    const value = this.consumeIdentifier();
    let body: Record<string, string> | undefined;

    // Parse body { } only for POST/PATCH/DELETE — not GET (GET uses { } for loading/error/empty states)
    if (this.check(TokenType.LeftBrace) && kind !== 'get') {
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
    } else if (this.check(TokenType.Identifier) && this.peek().value === 'auth') {
      this.advance();
      auth = true;
    }
    
    return { kind, value, body, auth };
  }

  private parseEach(): EachStatement {
    const start = this.consume(TokenType.Each);
    const collection = this.consumeIdentifier();

    let alias: string | undefined;
    if (this.peek().value === 'as') {
      this.advance(); // 'as'
      alias = this.consumeIdentifier();
    }

    this.consume(TokenType.Arrow);
    const element = this.consumeIdentifier();

    let body: Statement[] = [];
    if (this.check(TokenType.LeftBrace)) {
      this.consume(TokenType.LeftBrace);
      body = this.parseBody();
      this.consume(TokenType.RightBrace);
    }

    return { type: 'Each', collection, alias, element, body, line: start.line, col: start.col };
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

    return { type: 'When', condition, body, elseBody, line: start.line, col: start.col };
  }

  private parseStyle(): StyleBlock {
    const start = this.consume(TokenType.Style);

    let raw = false;
    if (this.check(TokenType.Raw) || (this.peek().type === TokenType.Identifier && this.peek().value === 'raw')) {
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

    const PSEUDO_CLASSES = new Set(['hover', 'focus', 'active']);
    const PSEUDO_ELEMENTS = new Set(['before', 'after']);
    const cssRules: Array<{selector: string, properties: StyleProperty[]}> = [];

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // CSS selector rule: .class { }, ::pseudo { }, tag { }
      if (this.check(TokenType.Dot) || this.isCssSelectorStart() || this.isCssPseudoSelector()) {
        const selector = this.parseCssSelector();
        this.consume(TokenType.LeftBrace);
        const ruleProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          ruleProps.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
        cssRules.push({ selector, properties: ruleProps });
      } else if (this.check(TokenType.At)) {
        // Check: @keyframes → raw CSS rule
        if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].value === 'keyframes') {
          // Collect @keyframes as raw CSS
          let raw = '';
          this.advance(); // @
          raw += '@';
          // Collect tokens until matching closing brace (nested braces!)
          let depth = 0;
          let started = false;
          while (!this.isAtEnd()) {
            const tok = this.advance();
            if (tok.type === TokenType.LeftBrace) { depth++; started = true; raw += ' {\n'; }
            else if (tok.type === TokenType.RightBrace) { depth--; raw += '}\n'; if (started && depth === 0) break; }
            else if (tok.type === TokenType.Comma) { raw += ', '; }
            else if (tok.type === TokenType.Colon) { raw += ': '; }
            else if (tok.type === TokenType.LeftParen) { raw += '('; }
            else if (tok.type === TokenType.RightParen) { raw += ')'; }
            else if (tok.value === '%' || tok.value === ';') { raw += tok.value + ' '; }
            else { raw += (raw.endsWith('(') || raw.endsWith('\n') || raw.endsWith('@') ? '' : ' ') + tok.value; }
          }
          cssRules.push({ selector: '__raw__', properties: [{ name: '__raw__', value: raw.trim() }] });
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
        if (name === 'hover') hover = props;
        else if (name === 'focus') focus = props;
        else if (name === 'active') active = props;
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
      } else {
        properties.push(this.parseStyleProperty());
      }
    }

    this.consume(TokenType.RightBrace);
    return {
      type: 'Style', raw, properties, responsive, hover, focus, active,
      pseudoElements: pseudoElements.length > 0 ? pseudoElements : undefined,
      cssRules: cssRules.length > 0 ? cssRules : undefined,
      line: start.line, col: start.col
    };
  }

  /** Known CSS shorthand property names in NyxCode */
  private static CSS_PROPERTIES = new Set([
    'bg', 'background', 'color', 'text', 'padding', 'margin', 'border',
    'border-radius', 'radius', 'shadow', 'box-shadow', 'flex', 'grid',
    'display', 'position', 'top', 'left', 'right', 'bottom',
    'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
    'font-family', 'font-size', 'font-weight', 'line-height',
    'text-align', 'text-decoration', 'text-transform',
    'opacity', 'overflow', 'z-index', 'cursor', 'transition',
    'transform', 'animation', 'gap', 'justify-content', 'align-items',
    'flex-direction', 'flex-wrap', 'grid-template-columns',
    'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border-color', 'border-width', 'border-style',
    'border-top', 'border-bottom', 'border-left', 'border-right',
    'outline', 'outline-color', 'outline-width', 'outline-style',
    'list-style', 'letter-spacing', 'word-spacing', 'white-space',
    'overflow-x', 'overflow-y', 'object-fit', 'object-position',
    'background-color', 'background-image', 'background-size', 'background-position',
    'text-shadow', 'box-sizing', 'vertical-align', 'user-select',
    'pointer-events', 'backdrop-filter', 'filter',
    'grid-gap', 'grid-template-rows', 'grid-column', 'grid-row',
    'place-items', 'place-content', 'align-content',
  ]);

  /**
   * CSS properties whose values commonly contain commas as part of the value
   * (not as property separators). When parsing these properties, commas are
   * consumed as part of the value instead of ending the property.
   */
  private static COMMA_VALUE_PROPERTIES = new Set([
    'font-family', 'font', 'transition', 'animation', 'background',
    'background-image', 'shadow', 'box-shadow', 'text-shadow',
    'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
    'transform', 'filter', 'backdrop-filter',
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
    if (this.pos + 1 >= this.tokens.length || this.tokens[this.pos + 1].type !== TokenType.Colon) return false;
    // Then an identifier like 'selection', 'before', 'after', etc.
    if (this.pos + 2 >= this.tokens.length || this.tokens[this.pos + 2].type !== TokenType.Identifier) return false;
    // Then eventually a {
    let i = this.pos + 3;
    while (i < this.tokens.length && this.tokens[i].type !== TokenType.LeftBrace && this.tokens[i].type !== TokenType.RightBrace) i++;
    return i < this.tokens.length && this.tokens[i].type === TokenType.LeftBrace;
  }

  private isCssSelectorStart(): boolean {
    // Check: identifier followed by { or identifier:pseudo {
    // Accept Identifier OR keyword tokens that double as HTML tags (table, form, select)
    const tok = this.peek();
    const isIdent = tok.type === TokenType.Identifier;
    const isKeywordTag = tok.type === TokenType.Table || tok.type === TokenType.Form;
    if (!isIdent && !isKeywordTag) return false;
    const name = tok.value;
    // Known CSS element selectors that might appear in style blocks
    const CSS_SELECTORS = new Set(['html', 'body', 'main', 'header', 'footer', 'nav', 'section', 'article', 'aside', 'div', 'span', 'p', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'button', 'input', 'select', 'textarea', 'table', 'form', 'label', 'blockquote', 'pre', 'code', 'details', 'summary', 'thead', 'tbody', 'tr', 'td', 'th', 'figcaption', 'figure', 'strong', 'em', 'small', 'sub', 'sup', 'mark', 'del', 'ins', 'abbr', 'cite', 'dfn', 'time', 'var', 'kbd', 'samp', 'video', 'audio', 'canvas', 'svg', 'path', 'fieldset', 'legend', 'datalist', 'progress', 'meter', 'dialog', 'hr', 'br', '*']);
    if (!CSS_SELECTORS.has(name)) return false;
    // Look ahead for { or space+{ pattern
    let i = this.pos + 1;
    while (i < this.tokens.length && (this.tokens[i].type === TokenType.Identifier || this.tokens[i].value === ':' || this.tokens[i].value === '-')) {
      i++;
    }
    return i < this.tokens.length && this.tokens[i].type === TokenType.LeftBrace;
  }

  /**
   * Parse a CSS selector like: .class, .class:hover, .class:pseudo, tag, tag:pseudo
   * Consumes tokens until we hit LeftBrace.
   */
  private parseCssSelector(): string {
    let selector = '';
    while (!this.check(TokenType.LeftBrace) && !this.isAtEnd()) {
      const tok = this.advance();
      // Add space between identifier tokens, but not after . or : or -
      if (selector && tok.type === TokenType.Identifier && !selector.endsWith('.') && !selector.endsWith(':') && !selector.endsWith('-')) {
        selector += ' ';
      }
      selector += tok.value;
    }
    return selector.trim();
  }

  private parseStyleProperty(): StyleProperty {
    let name = this.consumeIdentifier();
    let value = '';
    let parenDepth = 0; // Track parentheses for rgba(), linear-gradient(), etc.

    // Vendor prefix fix: if name is just '-', consume next identifier (e.g., -webkit-...)
    if (name === '-' && this.check(TokenType.Identifier)) {
      name = '-' + this.advance().value;
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
        if (dashTok?.value === '-' && nextTok?.type === TokenType.Identifier) {
          candidate = candidate + '-' + nextTok.value;
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
        value += (value ? '' : '') + this.advance().value;
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
          value += this.advance().value + ' '; // comma + space inside parens
        } else {
          value += this.advance().value;
        }
        continue;
      }

      // Outside parentheses: normal rules
      if (next.type === TokenType.RightBrace || next.type === TokenType.At) break;

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
            if (afterAfterComma?.value === '-') {
              const thirdToken = this.peekAt(3);
              if (thirdToken?.type === TokenType.Identifier) {
                candidateProp = afterComma.value + '-' + thirdToken.value;
              }
            }
            if (Parser.CSS_PROPERTIES.has(candidateProp)) {
              // Next thing after comma IS a CSS property — comma is a separator
              this.advance(); // consume comma
              break;
            }
          }
          // Not a CSS property after comma — comma is part of the value
          value += this.advance().value + ' ';
          continue;
        } else {
          // Normal property: comma is always a separator
          this.advance(); break;
        }
      }

      if (['hover', 'focus', 'active', 'before', 'after'].includes(next.value)) break;
      // If we see an identifier that's a known CSS property, it's the NEXT property
      if (next.type === TokenType.Identifier && value.length > 0) {
        // Check for hyphenated property: e.g., 'border' + '-' + 'color' = 'border-color'
        const peek1 = this.peekAt(1);
        const peek2 = this.peekAt(2);
        if (peek1?.value === '-' && peek2?.type === TokenType.Identifier) {
          const hyphenated = next.value + '-' + peek2.value;
          if (Parser.CSS_PROPERTIES.has(hyphenated)) break;
        }
        if (Parser.CSS_PROPERTIES.has(next.value)) break;
      }
      // String tokens in style values: preserve quotes (needed for CSS content property)
      if (next.type === TokenType.String) {
        const strVal = this.advance().value;
        value += (value ? ' ' : '') + `"${strVal}"`;
        continue;
      }
      // Handle hyphenated identifiers and values
      const tok = this.advance();
      // Minus sign: attach to NEXT value (no space) if at start of value or after space
      if (tok.value === '-') {
        // Check if this is a negative value (next is a number) or hyphenated ident
        if (this.peek()?.type === TokenType.Number || this.peek()?.type === TokenType.Identifier) {
          value += (value ? ' ' : '') + '-' + this.advance().value;
          continue;
        }
        value += (value ? ' ' : '') + '-';
        continue;
      }
      // Percentage sign: attach to PREVIOUS number (no space)
      if (tok.value === '%') {
        value += '%';
        continue;
      }
      value += (value ? ' ' : '') + tok.value;
      // Check for hyphenated continuation (e.g., text-align, border-radius)
      if (this.peek()?.type === TokenType.Identifier && this.peek()?.value === '-') {
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
    let name = '';
    
    // Next token is the name/path
    const nameOrPath = this.consumeIdentifier();
    if (nameOrPath.startsWith('/')) {
      action = nameOrPath;
      name = nameOrPath.replace(/^\//, '').replace(/\//g, '-');
    } else {
      name = nameOrPath;
    }
    
    // Check for 'auth' keyword before brace
    let auth = false;
    if (this.check(TokenType.Auth)) {
      this.advance();
      auth = true;
    } else if (this.check(TokenType.Identifier) && this.peek().value === 'auth') {
      this.advance();
      auth = true;
    }
    
    this.consume(TokenType.LeftBrace);
    
    // Parse body, extracting success/error handlers
    const body: Statement[] = [];
    let onSuccess: FormAction | undefined;
    let onError: FormAction | undefined;
    
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.Identifier) && (this.peek().value === 'success' || this.peek().value === 'error')) {
        const handlerType = this.advance().value;
        this.consume(TokenType.Arrow);
        const actionKind = this.advance().value as FormAction['kind'];
        let actionValue: string | undefined;
        if (actionKind === 'redirect' || actionKind === 'toast') {
          actionValue = this.check(TokenType.String) ? this.consume(TokenType.String).value : this.consumeIdentifier();
        }
        const formAction: FormAction = { kind: actionKind, value: actionValue };
        if (handlerType === 'success') onSuccess = formAction;
        else onError = formAction;
      } else {
        const stmt = this.parseStatement(); if (stmt) body.push(stmt);
      }
    }
    
    this.consume(TokenType.RightBrace);

    return { type: 'Form', name, action, auth, body, onSuccess, onError, line: start.line, col: start.col };
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
      'auto', 'none', 'inherit', 'initial', 'unset', 'revert',
      'normal', 'bold', 'bolder', 'lighter', 'italic', 'oblique',
      'center', 'left', 'right', 'top', 'bottom', 'start', 'end',
      'both', 'hidden', 'visible', 'scroll', 'clip',
      'fixed', 'absolute', 'relative', 'sticky', 'static',
      'flex', 'grid', 'block', 'inline', 'contents', 'table',
      'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset',
      'collapse', 'separate', 'wrap', 'nowrap',
      'contain', 'cover', 'fill', 'stretch',
      'row', 'column', 'dense',
      'space', 'round', 'repeat', 'no',
      'ease', 'linear', 'step',
      'transparent', 'currentColor',
      'serif', 'sans', 'monospace', 'cursive', 'fantasy', 'system',
      'pointer', 'default', 'text', 'move', 'grab', 'grabbing',
      'uppercase', 'lowercase', 'capitalize',
      'underline', 'overline', 'line', 'through',
      'baseline', 'middle', 'sub', 'super',
      'break', 'word', 'all', 'avoid',
      'ellipsis',
    ]);
    return CSS_VALUES.has(name);
  }

  private collectCSSValue(): string {
    // String literal = complete value
    if (this.peek().type === TokenType.String) {
      return this.advance().value;
    }
    let parts: string[] = [];
    let parenDepth = 0;
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const next = this.peek();
      if (next.type === TokenType.LeftParen) { parenDepth++; this.advance(); parts.push('('); continue; }
      if (next.type === TokenType.RightParen) { parenDepth = Math.max(0, parenDepth - 1); this.advance(); parts.push(')'); continue; }
      if (parenDepth > 0) { parts.push(this.advance().value); continue; }
      if (next.type === TokenType.Comma) { this.advance(); break; }
      if (next.type === TokenType.Identifier && parts.length > 0) {
        const after = this.tokens[this.pos + 1];
        // If next identifier is followed by (, it's a function call (rgba(), etc) — continue
        if (after && after.type === TokenType.LeftParen) { /* continue to push */ }
        // If next identifier looks like a CSS value keyword, keep collecting
        else if (this.isCSSValueKeyword(next.value)) { /* continue to push */ }
        // Otherwise it's likely a new property name — break
        else break;
      }
      parts.push(this.advance().value);
    }
    // Smart join: space between word/number tokens, no space around punctuation
    let result = '';
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        const prev = parts[i-1];
        const curr = parts[i];
        // No space: before ), before ,, after (, before (, after -
        const noSpace = curr === ')' || curr === ',' || curr === '(' || prev === '(' || prev === '-' || prev === '--';
        if (!noSpace) result += ' ';
      }
      result += parts[i];
    }
    return result.trim();
  }

  private parsePreset(): any {
    const start = this.consume(TokenType.Preset);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const styles: Array<{name: string; value: string}> = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.peek().type !== TokenType.Identifier) break;
      const prop = this.advance().value;
      const value = this.collectCSSValue();
      if (value) styles.push({ name: prop, value });
    }
    this.consume(TokenType.RightBrace);
    return { type: 'Preset', name, styles, line: start.line, col: start.col };
  }

  private parseScript(): ScriptStatement {
    const start = this.consume(TokenType.Script);
    // Lexer already captured raw content between { }, no brace consumption needed
    return { type: 'Script', content: start.value, line: start.line, col: start.col };
  }

    private parseAuth(): AuthStatement {
    const start = this.consume(TokenType.Auth);
    const level = this.consumeIdentifier();
    return { type: 'Auth', level, line: start.line, col: start.col };
  }

  private parseOn(): OnStatement {
    const start = this.consume(TokenType.On);
    // Handle both "on click ->" and "on:click ->"
    if (this.check(TokenType.Colon)) this.advance(); // skip optional colon
    const event = this.consumeIdentifier();
    this.consume(TokenType.Arrow);

    // Collect the action as a string, handling inline { body }
    let action = '';
    while (!this.isAtEnd() && !this.isStatementStart()) {
      const cur = this.peek();
      if (cur.type === TokenType.LeftBrace) {
        action += ' {';
        this.advance();
        let depth = 1;
        while (depth > 0 && !this.isAtEnd()) {
          const t = this.advance();
          if (t.type === TokenType.LeftBrace) depth++;
          else if (t.type === TokenType.RightBrace) {
            depth--;
            if (depth === 0) { action += ' }'; break; }
          }
          action += ' ' + t.value;
        }
      } else if (cur.type === TokenType.RightBrace) {
        break;
      } else {
        const tok = this.advance();
        if (tok.type === TokenType.String) {
          action += (action ? ' ' : '') + '"' + tok.value + '"';
        } else {
          action += (action ? ' ' : '') + tok.value;
        }
      }
    }

    return { type: 'On', event, action: action.trim(), line: start.line, col: start.col };
  }

  private parseValidate(): ValidateStatement {
    const start = this.consume(TokenType.Validate);
    this.consume(TokenType.LeftBrace);

    const fields: ValidateField[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const name = this.consumeIdentifier();
      const rules: string[] = [];

      while (!this.check(TokenType.RightBrace) && !this.check(TokenType.Comma) && !this.isAtEnd()) {
        const next = this.peek();
        if (next.type === TokenType.Identifier) {
          const kw = this.advance().value;
          // Handle key=value: format=email, min=10
          if (this.check(TokenType.Equals)) {
            this.advance(); // =
            const val = this.advance().value;
            rules.push(kw + '=' + val);
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
    return { type: 'Validate', fields, line: start.line, col: start.col };
  }

  private parseRespond(): RespondStatement {
    const start = this.consume(TokenType.Respond);
    const status = parseInt(this.consume(TokenType.Number).value);

    let body: Record<string, string> | string | undefined;
    if (this.check(TokenType.LeftBrace)) {
      this.advance();
      body = {};
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const key = this.consumeIdentifier();
        body[key] = this.consume(TokenType.String).value;
        if (this.check(TokenType.Comma)) this.advance();
      }
      this.consume(TokenType.RightBrace);
    } else if (this.check(TokenType.Dot)) {
      body = this.advance().value + this.consumeIdentifier();
    }

    return { type: 'Respond', status, body, line: start.line, col: start.col };
  }

  private parseLimitStmt(): LimitStatement {
    const start = this.consume(TokenType.Limit);
    let value = '';
    while (!this.isAtEnd() && !this.check(TokenType.RightBrace) && !this.isStatementStart()) {
      value += this.advance().value;
    }
    return { type: 'Limit', value: value.trim(), line: start.line, col: start.col };
  }

  private parseQuery(): QueryStatement {
    const start = this.consume(TokenType.Query);
    const sql = this.consume(TokenType.String).value;
    return { type: 'Query', sql, line: start.line, col: start.col };
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
      initialValue = { type: 'StringLiteral', value: this.advance().value, line: token.line, col: token.col };
    } else if (token.type === TokenType.Number) {
      initialValue = { type: 'NumberLiteral', value: parseFloat(this.advance().value), line: token.line, col: token.col };
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

    return { type: 'State', name, initialValue, line: start.line, col: start.col };
  }

  /**
   * Parse: `effect { ... }`
   * Side effect block. Dependencies auto-detected from referenced state vars.
   */
  private parseEffect(): EffectStatement {
    const start = this.consume(TokenType.Effect);
    const body = this.consumeBlock();
    return { type: 'Effect', body, line: start.line, col: start.col };
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
    let expression = '';
    let parenDepth = 0;
    while (!this.isAtEnd()) {
      const next = this.peek();
      // Stop at closing brace (end of parent block) unless inside parens
      if (next.type === TokenType.RightBrace && parenDepth === 0) break;
      // Stop at new element tags (h1, p, button, etc.) — these start new statements
      if (parenDepth === 0 && next.type === TokenType.Identifier && ELEMENT_TAGS.has(next.value)) break;
      // Stop at top-level keywords that start NEW statements (but NOT 'state' which can appear in expressions)
      if (parenDepth === 0 && [
        TokenType.Data, TokenType.Each, TokenType.When, TokenType.Style,
        TokenType.Form, TokenType.Auth, TokenType.On, TokenType.Validate, TokenType.Script,
        TokenType.Respond, TokenType.Limit, TokenType.Query, TokenType.Else,
        TokenType.State, TokenType.Effect, TokenType.Computed, TokenType.Config, TokenType.Before, TokenType.After,
      ].includes(next.type) && expression.length > 0 && !expression.endsWith('.')) break;
      if (next.type === TokenType.LeftParen) parenDepth++;
      if (next.type === TokenType.RightParen) parenDepth--;
      expression += this.advance().value;
    }

    return { type: 'Computed', name, expression: expression.trim(), line: start.line, col: start.col };
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
      if (depth > 0 && t.type === TokenType.Comma) result += ' ';
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
      if (depth > 0) result += t.value + ' ';
    }
    result += '}';
    return result;
  }

  
  // Check if { } block looks like CSS properties (for shorthand style blocks)
  private looksLikeStyleBlock(): boolean {
    // Peek past { and check if first identifier is a CSS shorthand
    if (!this.check(TokenType.LeftBrace)) return false;
    const after = this.peekAt(1);
    if (!after) return false;
    if (after.type === TokenType.Identifier && CSS_SHORTHANDS.has(after.value)) return true;
    // Also handle pseudo-classes like hover { }
    if (after.type === TokenType.Identifier && ['hover', 'focus', 'active'].includes(after.value)) return true;
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

    const PSEUDO_CLASSES: Record<string, string> = { 'hover': 'hover', 'focus': 'focus', 'active': 'active' };

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      // Skip commas
      if (this.check(TokenType.Comma)) { this.advance(); continue; }

      // Responsive: @mobile { }, @tablet { }
      if (this.check(TokenType.At)) {
        this.advance();
        const bp = this.consumeIdentifier();
        this.consume(TokenType.LeftBrace);
        const respProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.check(TokenType.Comma)) { this.advance(); continue; }
          const rp = this.parseStyleProperty();
          if (rp) respProps.push(rp);
        }
        this.consume(TokenType.RightBrace);
        responsive.push({ breakpoint: bp, properties: respProps });
        continue;
      }

      // Pseudo-class: hover { }, focus { }, active { }
      const name = this.peek().value;
      if (this.peek().type === TokenType.Identifier && PSEUDO_CLASSES[name] && this.peekAt(1)?.type === TokenType.LeftBrace) {
        this.advance();
        this.consume(TokenType.LeftBrace);
        const pseudoProps: StyleProperty[] = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          if (this.check(TokenType.Comma)) { this.advance(); continue; }
          const pp = this.parseStyleProperty();
          if (pp) pseudoProps.push(pp);
        }
        this.consume(TokenType.RightBrace);
        if (name === 'hover') hover = pseudoProps;
        else if (name === 'focus') focus = pseudoProps;
        else if (name === 'active') active = pseudoProps;
        continue;
      }

      // Regular property: bg red, fs 1.3rem
      const prop = this.parseStyleProperty();
      if (prop) properties.push(prop);
    }

    this.consume(TokenType.RightBrace);

    return {
      type: 'Style',
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
    const isComponentCall = tag[0] >= 'A' && tag[0] <= 'Z';

    // Parse content and attributes
    while (!this.isAtEnd() && !this.check(TokenType.RightBrace)) {
      // Check if next is a new statement — but key=value is an attribute, NOT a new statement
      if (this.isStatementStart()) {
        if (this.peekAt(1)?.type === TokenType.Equals) {
          // This is an attribute (style="...", class="...", etc), not a new statement
        } else if (this.peek().type === TokenType.On && (this.peekAt(1)?.type === TokenType.Colon || this.peekAt(1)?.type === TokenType.Identifier)) {
          // on:click or on click — inline event handler on element, not a new statement
          this.advance(); // consume 'on'
          if (this.check(TokenType.Colon)) this.advance(); // skip optional colon
          const eventName = this.consumeIdentifier();
          if (this.check(TokenType.Arrow)) this.advance(); // ->
          let action = '';
          while (!this.isAtEnd() && !this.isStatementStart()) {
            const cur = this.peek();
            if (cur.type === TokenType.RightBrace) break;
            if (cur.type === TokenType.LeftBrace) {
              action += ' {';
              this.advance();
              let depth = 1;
              while (depth > 0 && !this.isAtEnd()) {
                const t = this.advance();
                if (t.type === TokenType.LeftBrace) depth++;
                else if (t.type === TokenType.RightBrace) { depth--; if (depth === 0) { action += ' }'; break; } }
                action += ' ' + t.value;
              }
            } else {
              const tok = this.advance();
              if (tok.type === TokenType.String) action += (action ? ' ' : '') + '"' + tok.value + '"';
              else action += (action ? ' ' : '') + tok.value;
            }
          }
          attributes.push({ name: 'on' + eventName.charAt(0).toUpperCase() + eventName.slice(1), value: action.trim() });
          continue;
        } else {
          break;
        }
      }
      const next = this.peek();

      // String content: h1 "Hello"
      if (next.type === TokenType.String) {
        content = { type: 'StringLiteral', value: this.advance().value, line: next.line, col: next.col };
      }
      // Property access: .name or .author.name (nested)
      else if (next.type === TokenType.Dot) {
        this.advance();
        let path = '.' + this.consumeIdentifier();
        // Continue for nested: .author.name, .user.profile.avatar
        while (this.check(TokenType.Dot) && this.peekAt(1)?.type === TokenType.Identifier) {
          this.advance(); // .
          path += '.' + this.consumeIdentifier();
        }
        content = { type: 'PropertyAccess', path, line: next.line, col: next.col };
      }
      // Attribute: key=value or key="complex value" (including keyword tokens like style=)
      // Attribute: key=value — handle keywords that can also be attribute names
      else if ((next.type === TokenType.Identifier || next.type === TokenType.Style || next.type === TokenType.Auth || next.type === TokenType.Form || next.type === TokenType.Data || next.type === TokenType.State || next.type === TokenType.Preset) && this.peekAt(1)?.type === TokenType.Equals) {
        const name = this.advance().value;
        this.advance(); // =
        const valToken = this.peek();
        if (name === 'style' && valToken.type === TokenType.LeftBrace) {
          // style={ fs 1rem, c #fff } — unified NyxCode style syntax
          this.advance(); // consume {
          const props: string[] = [];
          while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
            const propName = this.advance().value;
            let propVal = '';
            while (!this.check(TokenType.Comma) && !this.check(TokenType.RightBrace) && !this.isAtEnd()) {
              propVal += (propVal ? ' ' : '') + this.advance().value;
            }
            if (this.check(TokenType.Comma)) this.advance();
            if (propName && propVal) props.push(propName + ': ' + propVal);
          }
          if (this.check(TokenType.RightBrace)) this.advance();
          attributes.push({ name: 'style', value: '__nyx__' + props.join('; ') });
        } else if (valToken.type === TokenType.String) {
          attributes.push({ name, value: this.advance().value });
        } else {
          let val = this.advance().value;
          // Property access: .field or .field.subfield (e.g., title=.title, author=.author.name)
          if (val === '.' && this.check(TokenType.Identifier)) {
            val += this.advance().value;
            while (this.check(TokenType.Dot) && this.peekAt(1)?.type === TokenType.Identifier) {
              val += this.advance().value; // .
              val += this.advance().value; // field
            }
          }
          // Responsive shorthand: value@mobileValue (e.g., grid=3@1)
          if (this.check(TokenType.At) && (this.peekAt(1)?.type === TokenType.Identifier || this.peekAt(1)?.type === TokenType.Number)) {
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
          attributes.push({ name: 'preset', value: presetName });
        }
      }
      // Identifier after element: could be content reference, boolean attribute, or layout shorthand
      else if (next.type === TokenType.Identifier && !ELEMENT_TAGS.has(next.value) && !this.isKeyword(next)) {
        // Form handler keywords: success/error followed by -> are NOT attributes
        const FORM_HANDLERS = new Set(['success', 'error']);
        if (FORM_HANDLERS.has(next.value) && this.tokens[this.pos + 1]?.type === TokenType.Arrow) {
          break; // Let form parser handle these
        }
        // Layout shorthand booleans: center, between, around, evenly, wrap, nowrap
        const LAYOUT_BOOLEANS = new Set(['center', 'between', 'around', 'evenly', 'wrap', 'nowrap']);
        if (LAYOUT_BOOLEANS.has(next.value)) {
          attributes.push({ name: this.advance().value, value: 'true' });
        }
        // If no content yet, treat first lone identifier as content reference
        else if (!content && !this.peekAt(1)?.type?.toString().includes('Equals')) {
          content = { type: 'Identifier', name: this.advance().value, line: next.line, col: next.col } as any;
        } else {
          attributes.push({ name: this.advance().value, value: 'true' });
        }
      }
      // Children/Style block: { ... }
      else if (next.type === TokenType.LeftBrace) {
        // If element has .prop content and { } looks like style properties, parse as inline style block
        if (content && (content as any).type === 'PropertyAccess' && this.looksLikeStyleBlock()) {
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
        let action = '';
        while (!this.isAtEnd() && !this.isStatementStart()) {
          const cur = this.peek();
          // Handle inline body { key } in arrow actions
          if (cur.type === TokenType.LeftBrace) {
            action += ' {';
            this.advance();
            let depth = 1;
            while (depth > 0 && !this.isAtEnd()) {
              const t = this.advance();
              if (t.type === TokenType.LeftBrace) depth++;
              else if (t.type === TokenType.RightBrace) {
                depth--;
                if (depth === 0) { action += ' }'; break; }
              }
              action += ' ' + t.value;
            }
          } else if (cur.type === TokenType.RightBrace) {
            break; // end of parent block
          } else {
            const tok = this.advance();
            // Preserve quotes around string values so the compiler can generate correct JS
            if (tok.type === TokenType.String) {
              action += (action ? ' ' : '') + '"' + tok.value + '"';
            } else {
              action += (action ? ' ' : '') + tok.value;
            }
          }
        }
        attributes.push({ name: 'onClick', value: action.trim() });
        break;
      }
      // Comma (sibling separator in inline)
      else if (next.type === TokenType.Comma) {
        this.advance();
        break;
      }
      else {
        break;
      }
    }

    return { type: 'Element', tag, content, attributes, children, line: start.line, col: start.col };
  }

  // --- Expression parsing ---

  private parseExpression(): Expression {
    const left = this.parsePrimary();

    // Binary expression: left op right
    if (this.isBinaryOp()) {
      const op = this.advance().value;
      const right = this.parsePrimary();
      return { type: 'BinaryExpression', left, operator: op, right, line: left.line, col: left.col };
    }

    return left;
  }

  private parsePrimary(): Expression {
    const token = this.peek();

    // Property access: .user.name
    if (token.type === TokenType.Dot) {
      this.advance();
      let path = '.';
      path += this.consumeIdentifier();
      while (this.check(TokenType.Dot)) {
        this.advance();
        path += '.' + this.consumeIdentifier();
      }
      return { type: 'PropertyAccess', path, line: token.line, col: token.col };
    }

    // Store access: $theme.mode
    if (token.type === TokenType.Dollar) {
      this.advance();
      const store = this.consumeIdentifier();
      this.consume(TokenType.Dot);
      const field = this.consumeIdentifier();
      return { type: 'StoreAccess', store, field, line: token.line, col: token.col };
    }

    // String literal
    if (token.type === TokenType.String) {
      this.advance();
      return { type: 'StringLiteral', value: token.value, line: token.line, col: token.col };
    }

    // Number literal
    if (token.type === TokenType.Number) {
      this.advance();
      return { type: 'NumberLiteral', value: parseFloat(token.value), line: token.line, col: token.col };
    }

    // Identifier (including keywords used as variable names in expressions)
    if (token.type === TokenType.Identifier || this.isKeywordToken(token)) {
      this.advance();
      return { type: 'Identifier', name: token.value, line: token.line, col: token.col };
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
      if (this.peek().value[0] >= 'A' && this.peek().value[0] <= 'Z') break;
      const name = this.consumeIdentifier();
      let optional = this.check(TokenType.Question);
      if (optional) this.advance();
      let defaultValue: string | undefined;
      // Check for default value: prop="value"
      if (this.check(TokenType.Equals)) {
        this.advance(); // consume =
        defaultValue = this.consume(TokenType.String).value;
      }
      props.push({ name, optional, defaultValue });
    }
    return props;
  }

  private consumeBlock(): string {
    this.consume(TokenType.LeftBrace);
    let depth = 1;
    let body = '';
    while (depth > 0 && !this.isAtEnd()) {
      const t = this.advance();
      if (t.type === TokenType.LeftBrace) depth++;
      else if (t.type === TokenType.RightBrace) {
        depth--;
        if (depth === 0) break;
      }
      body += t.value + ' ';
    }
    return body.trim();
  }

  private isKeywordToken(token: Token): boolean {
    // ALL keywords — allowed as identifiers in expression context (e.g. state page = "x"; when page == "x")
    const keywordTypes: Set<TokenType> = new Set([
      TokenType.Page, TokenType.Component, TokenType.Layout, TokenType.State,
      TokenType.Data, TokenType.Each, TokenType.When, TokenType.Else,
      TokenType.Form, TokenType.Table, TokenType.Auth, TokenType.Security,
      TokenType.On, TokenType.Theme, TokenType.Preset, TokenType.Validate,
      TokenType.Script, TokenType.Use, TokenType.Api, TokenType.Respond,
      TokenType.Query, TokenType.Head, TokenType.Style, TokenType.Store,
      TokenType.Raw, TokenType.Limit, TokenType.Animate, TokenType.Effect,
      TokenType.Computed, TokenType.Config, TokenType.Before, TokenType.After,
    ]);
    return keywordTypes.has(token.type);
  }

  private peekNext(): Token | undefined {
    if (this.pos + 1 >= this.tokens.length) return undefined;
    return this.tokens[this.pos + 1];
  }

  private peek(): Token {
    return this.tokens[this.pos] || { type: TokenType.EOF, value: '', line: 0, col: 0 };
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
      throw this.error(`Expected ${type}, got '${token.value}' (${token.type})`);
    }
    return this.advance();
  }

  private consumeIdentifier(): string {
    const token = this.peek();
    if (token.type === TokenType.Identifier || token.type in TokenType) {
      // Allow keywords used as identifiers in certain contexts
      if (token.type === TokenType.Identifier || this.isContextualIdentifier(token)) {
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

  private isBinaryOp(): boolean {
    const t = this.peek().type;
    return t === TokenType.DoubleEquals || t === TokenType.NotEquals ||
      t === TokenType.LessThan || t === TokenType.GreaterThan ||
      t === TokenType.LessEquals || t === TokenType.GreaterEquals ||
      t === TokenType.Ampersand || t === TokenType.Pipe;
  }

  private isStatementStart(): boolean {
    const t = this.peek();
    return t.type === TokenType.Data || t.type === TokenType.Each ||
      t.type === TokenType.When || t.type === TokenType.Style ||
      t.type === TokenType.Form || t.type === TokenType.Auth ||
      t.type === TokenType.On || t.type === TokenType.Validate ||
      t.type === TokenType.Respond || t.type === TokenType.Limit ||
      t.type === TokenType.Query || t.type === TokenType.Else ||
      t.type === TokenType.State || t.type === TokenType.Effect ||
      t.type === TokenType.Computed || t.type === TokenType.Head ||
      t.type === TokenType.Animate ||
      (t.type === TokenType.Identifier && ELEMENT_TAGS.has(t.value)) ||
      // Uppercase identifiers are component invocations (e.g., Card, Header)
      (t.type === TokenType.Identifier && t.value[0] >= 'A' && t.value[0] <= 'Z');
  }

  private isKeyword(token: Token): boolean {
    return token.type !== TokenType.Identifier && token.type !== TokenType.String &&
      token.type !== TokenType.Number;
  }

  private isContextualIdentifier(token: Token): boolean {
    // Some keywords can be used as identifiers (e.g., 'required', 'admin')
    return true;
  }

  private isConstraintKeyword(value: string): boolean {
    // Type keywords AND constraint keywords — anything that's NOT a new column name
    return ['text', 'email', 'number', 'int', 'float', 'decimal', 'bool', 'auto',
            'required', 'unique', 'default', 'ref'].includes(value);
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(`[NyxCode Parser Error] ${message} at line ${token.line}:${token.col}`);
  }
}
