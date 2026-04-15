/**
 * NyxCode Lexer
 * 
 * Transforms raw .nyx source code into a stream of tokens.
 * Handles strings, numbers, identifiers, keywords, operators,
 * and path literals (e.g., /dashboard/users/:id).
 */

import { Token, TokenType, KEYWORDS } from './tokens.js';

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  private tokens: Token[] = [];

  constructor(source: string) {
    this.source = source;
  }

  /**
   * Tokenize the entire source and return all tokens.
   * @returns Array of tokens ending with EOF
   */
  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.skipWhitespace();
      if (this.isAtEnd()) break;

      const ch = this.peek();

      // Hex colors (#fff, #0a0a0f) vs comments (# text)
      if (ch === '#') {
        const next = this.peekNext();
        if (next && (this.isAlphaNumeric(next))) {
          this.readHexColor();
        } else {
          this.skipLineComment();
        }
        continue;
      }

      // Newlines (significant for some constructs)
      if (ch === '\n') {
        this.advance();
        this.line++;
        this.col = 1;
        continue;
      }

      // Strings (double or single quotes)
      if (ch === '"' || ch === "'") {
        this.readString(ch);
        continue;
      }

      // Hex colors (#fff, #0a0a0f)
      if (ch === '#') {
        this.readHexColor();
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Path literals (starts with / followed by alpha or :)
      if (ch === '/' && this.pos > 0 && this.canStartPath()) {
        this.readPath();
        continue;
      }

      // Identifiers and keywords
      if (this.isAlpha(ch) || ch === '_') {
        this.readIdentifier();
        continue;
      }

      // Operators and punctuation
      this.readOperator();
    }

    this.tokens.push({ type: TokenType.EOF, value: '', line: this.line, col: this.col });
    return this.tokens;
  }

  // --- Character helpers ---

  private peek(): string {
    return this.source[this.pos];
  }

  private peekNext(): string | undefined {
    return this.source[this.pos + 1];
  }

  private advance(): string {
    const ch = this.source[this.pos];
    this.pos++;
    this.col++;
    return ch;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9';
  }

  private isAlpha(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  private isAlphaNumeric(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === '-';
  }

  // --- Skip helpers ---

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
      } else {
        break;
      }
    }
  }

  private skipLineComment(): void {
    while (!this.isAtEnd() && this.peek() !== '\n') {
      this.advance();
    }
  }

  // --- Token readers ---

  private readString(quote: string = '"'): void {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // consume opening quote

    let value = '';
    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === '\\') {
        this.advance(); // consume backslash
        const escaped = this.advance();
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '"': value += '"'; break;
          case '\\': value += '\\'; break;
          default: value += escaped;
        }
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.col = 0;
        }
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw this.error(`Unterminated string`, startLine, startCol);
    }

    this.advance(); // consume closing quote
    this.tokens.push({ type: TokenType.String, value, line: startLine, col: startCol });
  }

  private readHexColor(): void {
    const startCol = this.col;
    let value = this.advance(); // consume #

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()))) {
      value += this.advance();
    }

    this.tokens.push({ type: TokenType.Identifier, value, line: this.line, col: startCol });
  }

  private readNumber(): void {
    const startCol = this.col;
    let value = '';

    while (!this.isAtEnd() && (this.isDigit(this.peek()) || this.peek() === '.')) {
      value += this.advance();
    }

    // Handle units (rem, px, vh, %, etc.)
    if (!this.isAtEnd() && this.peek() === '%') {
      value += this.advance();
    } else if (!this.isAtEnd() && this.isAlpha(this.peek())) {
      while (!this.isAtEnd() && this.isAlpha(this.peek())) {
        value += this.advance();
      }
    }

    this.tokens.push({ type: TokenType.Number, value, line: this.line, col: startCol });
  }

  private canStartPath(): boolean {
    const next = this.peekNext();
    if (!next) return false;
    return this.isAlpha(next) || next === ':' || next === '*';
  }

  private readPath(): void {
    const startCol = this.col;
    let value = '';

    // Consume path segments: /foo/bar/:id
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === '/' || this.isAlphaNumeric(ch) || ch === ':' || ch === '*' || ch === '_' || ch === '-' || ch === '.') {
        value += this.advance();
      } else {
        break;
      }
    }

    this.tokens.push({ type: TokenType.Identifier, value, line: this.line, col: startCol });
  }

  private readIdentifier(): void {
    const startCol = this.col;
    let value = '';

    while (!this.isAtEnd() && (this.isAlphaNumeric(this.peek()) || this.peek() === '_')) {
      value += this.advance();
    }

    // Check if it's a keyword
    const type = KEYWORDS[value] ?? TokenType.Identifier;
    
    // Special: script keyword — capture raw content between { and matching }
    if (type === TokenType.Script) {
      // Skip whitespace
      while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) {
        if (this.source[this.pos] === '\n') this.line++;
        this.pos++;
      }
      if (this.pos < this.source.length && this.source[this.pos] === '{') {
        this.pos++; // skip opening {
        let depth = 1;
        let raw = '';
        while (this.pos < this.source.length && depth > 0) {
          const ch = this.source[this.pos];
          // Skip regex literals (e.g., /"/g — don't confuse the quote inside)
          if (ch === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] !== '/' && this.source[this.pos + 1] !== '*') {
            // Heuristic: if prev non-whitespace char is not an identifier/number/), it's a regex
            let prevIdx = raw.length - 1;
            while (prevIdx >= 0 && /\s/.test(raw[prevIdx])) prevIdx--;
            const prevCh = prevIdx >= 0 ? raw[prevIdx] : '';
            const isRegex = !prevCh || /[=(:,;!&|?{+\-~^%<>\[]/.test(prevCh);
            if (isRegex) {
              raw += ch; // opening /
              this.pos++;
              while (this.pos < this.source.length && this.source[this.pos] !== '/') {
                if (this.source[this.pos] === '\\') {
                  raw += this.source[this.pos]; this.pos++;
                  if (this.pos < this.source.length) { raw += this.source[this.pos]; this.pos++; }
                  continue;
                }
                if (this.source[this.pos] === '\n') break; // regex can't span lines
                raw += this.source[this.pos];
                this.pos++;
              }
              if (this.pos < this.source.length && this.source[this.pos] === '/') {
                raw += this.source[this.pos]; this.pos++; // closing /
                while (this.pos < this.source.length && /[gimsuy]/.test(this.source[this.pos])) {
                  raw += this.source[this.pos]; this.pos++; // flags
                }
              }
              continue;
            }
          }
          // Skip string literals (don't count braces inside strings)
          if (ch === "'" || ch === '"' || ch === '`') {
            const quote = ch;
            raw += ch;
            this.pos++;
            while (this.pos < this.source.length && this.source[this.pos] !== quote) {
              if (this.source[this.pos] === '\\') {
                raw += this.source[this.pos];
                this.pos++;
                if (this.pos < this.source.length) {
                  raw += this.source[this.pos];
                  this.pos++;
                }
                continue;
              }
              // Template literal ${...} — skip the expression (may contain braces)
              if (quote === '`' && this.source[this.pos] === '$' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '{') {
                raw += this.source[this.pos]; // $
                this.pos++;
                raw += this.source[this.pos]; // {
                this.pos++;
                let tmplDepth = 1;
                while (this.pos < this.source.length && tmplDepth > 0) {
                  if (this.source[this.pos] === '{') tmplDepth++;
                  else if (this.source[this.pos] === '}') tmplDepth--;
                  if (tmplDepth > 0) {
                    if (this.source[this.pos] === '\n') this.line++;
                    raw += this.source[this.pos];
                    this.pos++;
                  }
                }
                if (this.pos < this.source.length) {
                  raw += this.source[this.pos]; // closing }
                  this.pos++;
                }
                continue;
              }
              if (this.source[this.pos] === '\n') this.line++;
              raw += this.source[this.pos];
              this.pos++;
            }
            if (this.pos < this.source.length) {
              raw += this.source[this.pos]; // closing quote
              this.pos++;
            }
            continue;
          }
          // Skip multi-line comments /* ... */
          if (ch === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '*') {
            raw += ch;
            this.pos++;
            raw += this.source[this.pos]; // *
            this.pos++;
            while (this.pos < this.source.length) {
              if (this.source[this.pos] === '*' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '/') {
                raw += this.source[this.pos];
                this.pos++;
                raw += this.source[this.pos];
                this.pos++;
                break;
              }
              if (this.source[this.pos] === '\n') this.line++;
              raw += this.source[this.pos];
              this.pos++;
            }
            continue;
          }
          // Skip single-line comments
          if (ch === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '/') {
            while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
              raw += this.source[this.pos];
              this.pos++;
            }
            continue;
          }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { this.pos++; break; }
          }
          if (ch === '\n') this.line++;
          raw += ch;
          this.pos++;
        }
        this.tokens.push({ type: TokenType.Script, value: raw.trim(), line: this.line, col: startCol });
        return;
      }
    }
    
    // Special: middleware keyword — capture raw block content (like script blocks)
    // This ensures backticks, template literals, regex etc. are handled correctly
    if (value === 'middleware') {
      this.tokens.push({ type: TokenType.Identifier, value, line: this.line, col: startCol });
      // Read identifier (middleware name)
      while (this.pos < this.source.length && /\s/.test(this.source[this.pos]) && this.source[this.pos] !== '\n') {
        this.pos++; this.col++;
      }
      const nameStart = this.pos;
      let mwName = '';
      while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.pos])) {
        mwName += this.source[this.pos]; this.pos++; this.col++;
      }
      if (mwName) {
        this.tokens.push({ type: TokenType.Identifier, value: mwName, line: this.line, col: startCol + (nameStart - (this.pos - mwName.length)) });
      }
      // Skip whitespace to opening brace
      while (this.pos < this.source.length && /\s/.test(this.source[this.pos])) {
        if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
        this.pos++; this.col++;
      }
      if (this.pos < this.source.length && this.source[this.pos] === '{') {
        this.pos++; this.col++; // skip opening {
        let depth = 1;
        let raw = '';
        while (this.pos < this.source.length && depth > 0) {
          const ch = this.source[this.pos];
          // Skip string/template literals
          if (ch === "'" || ch === '"' || ch === '`') {
            const quote = ch;
            raw += ch; this.pos++; this.col++;
            while (this.pos < this.source.length && this.source[this.pos] !== quote) {
              if (this.source[this.pos] === '\\') {
                raw += this.source[this.pos]; this.pos++; this.col++;
                if (this.pos < this.source.length) { raw += this.source[this.pos]; this.pos++; this.col++; }
                continue;
              }
              if (quote === '`' && this.source[this.pos] === '$' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '{') {
                raw += this.source[this.pos]; this.pos++; this.col++;
                raw += this.source[this.pos]; this.pos++; this.col++;
                let tmplDepth = 1;
                while (this.pos < this.source.length && tmplDepth > 0) {
                  if (this.source[this.pos] === '{') tmplDepth++;
                  else if (this.source[this.pos] === '}') tmplDepth--;
                  if (tmplDepth > 0) { if (this.source[this.pos] === '\n') { this.line++; this.col = 0; } raw += this.source[this.pos]; this.pos++; this.col++; }
                }
                if (this.pos < this.source.length) { raw += this.source[this.pos]; this.pos++; this.col++; }
                continue;
              }
              if (this.source[this.pos] === '\n') { this.line++; this.col = 0; }
              raw += this.source[this.pos]; this.pos++; this.col++;
            }
            if (this.pos < this.source.length) { raw += this.source[this.pos]; this.pos++; this.col++; }
            continue;
          }
          if (ch === '{') depth++;
          else if (ch === '}') { depth--; if (depth === 0) { this.pos++; this.col++; break; } }
          if (ch === '\n') { this.line++; this.col = 0; }
          raw += ch; this.pos++; this.col++;
        }
        // Emit as: LeftBrace, Script (raw body), RightBrace — parser can read it
        this.tokens.push({ type: TokenType.LeftBrace, value: '{', line: this.line, col: startCol });
        this.tokens.push({ type: TokenType.Script, value: raw.trim(), line: this.line, col: startCol });
        this.tokens.push({ type: TokenType.RightBrace, value: '}', line: this.line, col: startCol });
      }
      return;
    }

    this.tokens.push({ type, value, line: this.line, col: startCol });
  }

  private readOperator(): void {
    const startCol = this.col;
    const ch = this.advance();

    switch (ch) {
      case '{': this.emit(TokenType.LeftBrace, ch, startCol); break;
      case '}': this.emit(TokenType.RightBrace, ch, startCol); break;
      case '(': this.emit(TokenType.LeftParen, ch, startCol); break;
      case ')': this.emit(TokenType.RightParen, ch, startCol); break;
      case '[': this.emit(TokenType.LeftBracket, ch, startCol); break;
      case ']': this.emit(TokenType.RightBracket, ch, startCol); break;
      case ',': this.emit(TokenType.Comma, ch, startCol); break;
      case ':': this.emit(TokenType.Colon, ch, startCol); break;
      case '@': this.emit(TokenType.At, ch, startCol); break;
      case '$': this.emit(TokenType.Dollar, ch, startCol); break;
      case '?': this.emit(TokenType.Question, ch, startCol); break;
      case '&': this.emit(TokenType.Ampersand, ch, startCol); break;
      case '|': this.emit(TokenType.Pipe, ch, startCol); break;
      case '/': this.emit(TokenType.Slash, ch, startCol); break;

      case '.':
        if (this.peek() === '.') {
          this.advance();
          this.emit(TokenType.DotDot, '..', startCol);
        } else {
          this.emit(TokenType.Dot, ch, startCol);
        }
        break;

      case '-':
        if (this.peek() === '>') {
          this.advance();
          this.emit(TokenType.Arrow, '->', startCol);
        } else {
          // Negative number or identifier with dash
          this.emit(TokenType.Identifier, '-', startCol);
        }
        break;

      case '=':
        if (this.peek() === '=') {
          this.advance();
          this.emit(TokenType.DoubleEquals, '==', startCol);
        } else {
          this.emit(TokenType.Equals, '=', startCol);
        }
        break;

      case '!':
        if (this.peek() === '=') {
          this.advance();
          this.emit(TokenType.NotEquals, '!=', startCol);
        } else {
          this.emit(TokenType.Bang, '!', startCol);
        }
        break;

      case '<':
        if (this.peek() === '=') {
          this.advance();
          this.emit(TokenType.LessEquals, '<=', startCol);
        } else {
          this.emit(TokenType.LessThan, '<', startCol);
        }
        break;

      case '>':
        if (this.peek() === '=') {
          this.advance();
          this.emit(TokenType.GreaterEquals, '>=', startCol);
        } else {
          this.emit(TokenType.GreaterThan, '>', startCol);
        }
        break;

      case '+':
      case '%':
      case ';':
      case '*':
        this.emit(TokenType.Identifier, ch, startCol); break;

      default:
        throw this.error(`Unexpected character: '${ch}'`, this.line, startCol);
    }
  }

  private emit(type: TokenType, value: string, col: number): void {
    this.tokens.push({ type, value, line: this.line, col });
  }

  private error(message: string, line: number, col: number): Error {
    return new Error(`[NyxCode Lexer Error] ${message} at line ${line}:${col}`);
  }
}
