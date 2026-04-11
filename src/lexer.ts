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

      // Strings
      if (ch === '"') {
        this.readString();
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

  private readString(): void {
    const startLine = this.line;
    const startCol = this.col;
    this.advance(); // consume opening "

    let value = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
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

    this.advance(); // consume closing "
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

    // Handle units (rem, px, etc.)
    if (!this.isAtEnd() && this.isAlpha(this.peek())) {
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
      if (ch === '/' || this.isAlphaNumeric(ch) || ch === ':' || ch === '*' || ch === '_') {
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
