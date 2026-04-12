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
  HeadStatement, AnimateStatement,
} from './ast.js';

/** Set of tags that are recognized as built-in elements */
const ELEMENT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'text', 'span', 'link', 'img', 'video', 'icon',
  'button', 'input', 'select', 'checkbox', 'radio', 'toggle', 'slider', 'textarea',
  'card', 'badge', 'table', 'list', 'metric', 'chart', 'avatar', 'tag',
  'alert', 'toast', 'modal', 'tooltip', 'progress', 'spinner',
  'row', 'col', 'grid', 'stack', 'container', 'section', 'aside', 'nav', 'footer',
  'slot', 'submit',
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
      case TokenType.Use: return this.parseUse();
      case TokenType.EOF: return null;
      default:
        throw this.error(`Unexpected token '${token.value}' at top level. Expected: page, component, api, table, store, theme, or security.`);
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
    const path = this.consumeIdentifier(); // /users/:id
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: 'Api', method, path, body, line: start.line, col: start.col };
  }

  private parseTable(): TableNode {
    const start = this.consume(TokenType.Table);
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);

    const columns: ColumnDef[] = [];
    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      const colName = this.consumeIdentifier();
      const constraints: string[] = [];

      // Read type and constraints until next identifier or }
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        if (next.type === TokenType.Identifier && !this.isConstraintKeyword(next.value)) {
          break; // Next column name
        }
        if (next.type === TokenType.Identifier || next.type === TokenType.Equals || next.type === TokenType.Number) {
          constraints.push(this.advance().value);
          // Handle default=value
          if (constraints[constraints.length - 1] === 'default' && this.check(TokenType.Equals)) {
            this.advance(); // =
            constraints.push('=' + this.advance().value);
          }
        } else {
          break;
        }
      }

      const colType = constraints.shift() || 'string';
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
        const value = this.advance().value; // Could be color, font name, size
        entries[key] = value;
        if (this.check(TokenType.Comma)) this.advance();
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
      const name = this.consumeIdentifier();
      let value = '';
      while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
        const next = this.peek();
        if (next.type === TokenType.Identifier && !value) {
          value = this.advance().value;
        } else {
          break;
        }
      }
      rules.push({ name, value });
    }

    this.consume(TokenType.RightBrace);
    return { type: 'Security', rules, line: start.line, col: start.col };
  }

  private parseUse(): UseStatement {
    const start = this.consume(TokenType.Use);
    const path = this.consume(TokenType.String).value;
    return { type: 'Use', path, line: start.line, col: start.col };
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

    return { type: 'Data', name, typeAnnotation, source, line: start.line, col: start.col };
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

    if (this.check(TokenType.LeftBrace)) {
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

    return { kind, value, body };
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

    this.consume(TokenType.Arrow);
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
      this.consume(TokenType.Arrow);
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

    while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
      if (this.check(TokenType.At)) {
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
      } else if (this.peek().value === 'hover') {
        // Hover block
        this.advance();
        this.consume(TokenType.LeftBrace);
        hover = [];
        while (!this.check(TokenType.RightBrace) && !this.isAtEnd()) {
          hover.push(this.parseStyleProperty());
        }
        this.consume(TokenType.RightBrace);
      } else {
        properties.push(this.parseStyleProperty());
      }
    }

    this.consume(TokenType.RightBrace);
    return { type: 'Style', raw, properties, responsive, hover, line: start.line, col: start.col };
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
  ]);

  private parseStyleProperty(): StyleProperty {
    const name = this.consumeIdentifier();
    let value = '';
    let parenDepth = 0; // Track parentheses for rgba(), linear-gradient(), etc.

    // Consume value tokens until we hit:
    // - comma OUTSIDE parens (property separator in single-line blocks)
    // - } (end of style block) — only at depth 0
    // - @ (responsive block)
    // - another CSS property name (multi-line separator) — only at depth 0
    // - 'hover' keyword
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
      if (next.type === TokenType.Comma) { this.advance(); break; }
      if (next.value === 'hover') break;
      // If we see an identifier that's a known CSS property, it's the NEXT property
      if (next.type === TokenType.Identifier && Parser.CSS_PROPERTIES.has(next.value) && value.length > 0) break;
      // Handle hyphenated identifiers like "text-align" - consume as one
      value += (value ? ' ' : '') + this.advance().value;
      // Check for hyphenated continuation
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
    const name = this.consumeIdentifier();
    this.consume(TokenType.LeftBrace);
    const body = this.parseBody();
    this.consume(TokenType.RightBrace);

    return { type: 'Form', name, body, line: start.line, col: start.col };
  }

  private parseAuth(): AuthStatement {
    const start = this.consume(TokenType.Auth);
    const level = this.consumeIdentifier();
    return { type: 'Auth', level, line: start.line, col: start.col };
  }

  private parseOn(): OnStatement {
    const start = this.consume(TokenType.On);
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
        action += (action ? ' ' : '') + this.advance().value;
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
          rules.push(this.advance().value);
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
        TokenType.Form, TokenType.Auth, TokenType.On, TokenType.Validate,
        TokenType.Respond, TokenType.Limit, TokenType.Query, TokenType.Else,
        TokenType.State, TokenType.Effect, TokenType.Computed,
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
      // Check if next is a new statement — but for components, key=value is NOT a new statement
      if (this.isStatementStart()) {
        if (isComponentCall && this.peekAt(1)?.type === TokenType.Equals) {
          // This is an attribute of the component, not a new statement
        } else {
          break;
        }
      }
      const next = this.peek();

      // String content: h1 "Hello"
      if (next.type === TokenType.String) {
        content = { type: 'StringLiteral', value: this.advance().value, line: next.line, col: next.col };
      }
      // Property access: .name
      else if (next.type === TokenType.Dot) {
        this.advance();
        const path = '.' + this.consumeIdentifier();
        content = { type: 'PropertyAccess', path, line: next.line, col: next.col };
      }
      // Attribute: key=value or key="complex value" (including keyword tokens like style=)
      else if ((next.type === TokenType.Identifier || next.type === TokenType.Style || next.type === TokenType.Auth || next.type === TokenType.Form) && this.peekAt(1)?.type === TokenType.Equals) {
        const name = this.advance().value;
        this.advance(); // =
        const valToken = this.peek();
        if (valToken.type === TokenType.String) {
          attributes.push({ name, value: this.advance().value });
        } else {
          attributes.push({ name, value: this.advance().value });
        }
      }
      // Identifier after element: could be content reference (state/computed var) or shorthand attribute
      else if (next.type === TokenType.Identifier && !ELEMENT_TAGS.has(next.value) && !this.isKeyword(next)) {
        // If no content yet, treat first lone identifier as content reference
        if (!content && !this.peekAt(1)?.type?.toString().includes('Equals')) {
          content = { type: 'Identifier', name: this.advance().value, line: next.line, col: next.col } as any;
        } else {
          attributes.push({ name: this.advance().value, value: 'true' });
        }
      }
      // Children block: { ... }
      else if (next.type === TokenType.LeftBrace) {
        this.advance();
        children = this.parseBody();
        this.consume(TokenType.RightBrace);
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
            action += (action ? ' ' : '') + this.advance().value;
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

    // Identifier
    if (token.type === TokenType.Identifier) {
      this.advance();
      return { type: 'Identifier', name: token.value, line: token.line, col: token.col };
    }

    throw this.error(`Unexpected token '${token.value}' in expression`);
  }

  // --- Helpers ---

  private parseProps(): PropDef[] {
    const props: PropDef[] = [];
    while (this.check(TokenType.Identifier)) {
      const name = this.consumeIdentifier();
      const optional = this.check(TokenType.Question);
      if (optional) this.advance();
      props.push({ name, optional });
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
    return ['required', 'unique', 'auto', 'default', 'ref'].includes(value);
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(`[NyxCode Parser Error] ${message} at line ${token.line}:${token.col}`);
  }
}
