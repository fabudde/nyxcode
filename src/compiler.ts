/**
 * NyxCode Compiler
 * 
 * Transforms the AST into HTML + CSS + JavaScript.
 * This is the heart of NyxCode — where .nyx becomes a real website.
 * 
 * Output modes:
 * - static: Pure HTML + CSS + inline JS (no server needed)
 * - dynamic: HTML + CSS + JS with fetch() for data
 * - fullstack: + Express API server (future)
 */

import {
  Program, TopLevelNode, PageNode, ComponentNode, Statement,
  DataStatement, EachStatement, WhenStatement, StyleBlock,
  FormStatement, AuthStatement, ElementNode, Expression,
  StyleProperty, ResponsiveBlock, Attribute,
} from './ast.js';

export interface CompilerOptions {
  /** Output mode */
  target: 'static' | 'dynamic';
  /** Pretty print output */
  pretty: boolean;
  /** Include NyxCode runtime helpers */
  includeRuntime: boolean;
}

export interface CompilerOutput {
  html: string;
  css: string;
  js: string;
}

/**
 * Compile a NyxCode AST into HTML + CSS + JS.
 */
export class Compiler {
  private options: CompilerOptions;
  private css: string[] = [];
  private js: string[] = [];
  private componentId: number = 0;
  private indent: number = 0;

  constructor(options: Partial<CompilerOptions> = {}) {
    this.options = {
      target: options.target ?? 'dynamic',
      pretty: options.pretty ?? true,
      includeRuntime: options.includeRuntime ?? true,
    };
  }

  /**
   * Compile the full program.
   */
  compile(program: Program): CompilerOutput {
    const pages = program.body.filter(n => n.type === 'Page') as PageNode[];
    const components = program.body.filter(n => n.type === 'Component') as ComponentNode[];

    // For now, compile the first page (multi-page routing comes later)
    let html = '';
    if (pages.length > 0) {
      html = this.compilePage(pages[0]);
    }

    const css = this.css.join('\n');
    const js = this.js.length > 0 ? this.buildJS() : '';

    return {
      html: this.buildHTML(html, css, js),
      css,
      js,
    };
  }

  // --- Page compilation ---

  private compilePage(page: PageNode): string {
    let content = '';

    for (const stmt of page.body) {
      content += this.compileStatement(stmt);
    }

    return content;
  }

  // --- Statement compilation ---

  private compileStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'Element': return this.compileElement(stmt);
      case 'Data': return this.compileData(stmt);
      case 'Each': return this.compileEach(stmt);
      case 'When': return this.compileWhen(stmt);
      case 'Style': return this.compileStyle(stmt);
      case 'Form': return this.compileForm(stmt);
      case 'Auth': return ''; // Auth is handled at build level
      case 'On': return ''; // Events compiled with their parent element
      default: return '';
    }
  }

  // --- Element compilation ---

  private compileElement(el: ElementNode): string {
    const tag = this.mapTag(el.tag);
    const attrs = this.compileAttributes(el.attributes);
    const content = this.compileContent(el.content);
    const children = el.children.map(c => this.compileStatement(c)).join('');

    if (this.isVoidElement(tag)) {
      return `${this.ind()}<${tag}${attrs}${content ? ` value="${this.escapeHtml(content)}"` : ''} />\n`;
    }

    if (children) {
      return `${this.ind()}<${tag}${attrs}>\n${this.indented(() => children)}${this.ind()}</${tag}>\n`;
    }

    return `${this.ind()}<${tag}${attrs}>${content}</${tag}>\n`;
  }

  private compileContent(content: string | Expression | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return this.escapeHtml(content);

    switch (content.type) {
      case 'StringLiteral':
        return this.escapeHtml(content.value);
      case 'PropertyAccess':
        return `\${${this.propertyToJS(content.path)}}`;
      case 'NumberLiteral':
        return String(content.value);
      case 'Identifier':
        return `\${${content.name}}`;
      default:
        return '';
    }
  }

  private compileAttributes(attrs: Attribute[]): string {
    if (attrs.length === 0) return '';

    const parts: string[] = [];
    for (const attr of attrs) {
      if (attr.name === 'onClick') {
        // Convert NyxCode action to JS
        const jsAction = this.actionToJS(attr.value as string);
        parts.push(`onclick="${jsAction}"`);
      } else {
        const val = typeof attr.value === 'string' ? attr.value : '';
        if (val === 'true') {
          parts.push(attr.name);
        } else {
          parts.push(`${this.mapAttrName(attr.name)}="${val}"`);
        }
      }
    }

    return ' ' + parts.join(' ');
  }

  // --- Data compilation ---

  private compileData(data: DataStatement): string {
    const { name, source } = data;

    if (source.kind === 'get') {
      this.js.push(`
  // Data: ${name}
  let ${name} = [];
  async function load_${name}() {
    try {
      const res = await fetch('${source.value}');
      ${name} = await res.json();
      render();
    } catch(e) {
      console.error('Failed to load ${name}:', e);
    }
  }
  load_${name}();`);
    } else if (source.kind === 'query') {
      // In dynamic mode, queries become API calls
      const endpoint = `/api/__generated/${name}`;
      this.js.push(`
  // Data: ${name} (query: ${source.value.substring(0, 50)}...)
  let ${name} = [];
  async function load_${name}() {
    try {
      const res = await fetch('${endpoint}');
      ${name} = await res.json();
      render();
    } catch(e) {
      console.error('Failed to load ${name}:', e);
    }
  }
  load_${name}();`);
    }

    return ''; // Data doesn't produce HTML directly
  }

  // --- Each compilation ---

  private compileEach(each: EachStatement): string {
    const varName = each.alias || 'item';
    const containerId = this.nextId('list');

    this.js.push(`
  // Each: ${each.collection}
  function render_${containerId}() {
    const container = document.getElementById('${containerId}');
    if (!container) return;
    container.innerHTML = ${each.collection}.map(${varName} => \`
      ${this.compileEachBody(each, varName)}
    \`).join('');
  }`);

    return `${this.ind()}<div id="${containerId}"></div>\n`;
  }

  private compileEachBody(each: EachStatement, varName: string): string {
    const tag = this.mapTag(each.element);
    const children = each.body.map(stmt => {
      if (stmt.type === 'Element') {
        return this.compileElementTemplate(stmt as ElementNode, varName);
      }
      return '';
    }).join('');

    return `<${tag}>${children}</${tag}>`;
  }

  private compileElementTemplate(el: ElementNode, varName: string): string {
    const tag = this.mapTag(el.tag);
    let content = '';

    if (el.content && typeof el.content !== 'string') {
      if (el.content.type === 'PropertyAccess') {
        content = `\${${varName}${(el.content as any).path.substring(1)}}`;
      } else if (el.content.type === 'StringLiteral') {
        content = (el.content as any).value;
      }
    }

    const attrs = el.attributes.map(a => {
      if (typeof a.value === 'string' && a.value !== 'true') {
        return `${a.name}="${a.value}"`;
      }
      return a.name;
    }).join(' ');

    const attrStr = attrs ? ' ' + attrs : '';
    return `<${tag}${attrStr}>${content}</${tag}>`;
  }

  // --- When compilation ---

  private compileWhen(when: WhenStatement): string {
    const condId = this.nextId('cond');
    const condition = this.expressionToJS(when.condition);

    const thenHtml = when.body.map(s => this.compileStatement(s)).join('');
    const elseHtml = when.elseBody ? when.elseBody.map(s => this.compileStatement(s)).join('') : '';

    this.js.push(`
  // When: ${condition}
  function render_${condId}() {
    const el = document.getElementById('${condId}');
    if (!el) return;
    if (${condition}) {
      el.innerHTML = \`${thenHtml.trim()}\`;
    } else {
      el.innerHTML = \`${elseHtml.trim()}\`;
    }
  }`);

    return `${this.ind()}<div id="${condId}"></div>\n`;
  }

  // --- Style compilation ---

  private compileStyle(style: StyleBlock): string {
    if (style.raw) {
      // Raw CSS — pass through
      this.css.push(style.properties.map(p => `${p.name}: ${p.value};`).join('\n'));
      return '';
    }

    const scopeClass = `nyx-${this.nextId('s')}`;
    let cssBlock = `.${scopeClass} {\n`;

    for (const prop of style.properties) {
      cssBlock += `  ${this.mapCSSProperty(prop.name)}: ${prop.value};\n`;
    }
    cssBlock += '}\n';

    if (style.hover) {
      cssBlock += `.${scopeClass}:hover {\n`;
      for (const prop of style.hover) {
        cssBlock += `  ${this.mapCSSProperty(prop.name)}: ${prop.value};\n`;
      }
      cssBlock += '}\n';
    }

    if (style.responsive) {
      for (const r of style.responsive) {
        const bp = this.mapBreakpoint(r.breakpoint);
        cssBlock += `@media (max-width: ${bp}) {\n  .${scopeClass} {\n`;
        for (const prop of r.properties) {
          cssBlock += `    ${this.mapCSSProperty(prop.name)}: ${prop.value};\n`;
        }
        cssBlock += '  }\n}\n';
      }
    }

    this.css.push(cssBlock);
    return ''; // Style is applied via class, not inline
  }

  // --- Form compilation ---

  private compileForm(form: FormStatement): string {
    let html = `${this.ind()}<form id="form-${form.name}">\n`;
    this.indent++;

    for (const stmt of form.body) {
      if (stmt.type === 'Element') {
        const el = stmt as ElementNode;
        if (el.tag === 'input') {
          const type = el.attributes.find(a => a.name === 'type')?.value || 'text';
          const placeholder = el.attributes.find(a => a.name === 'placeholder')?.value || '';
          const required = el.attributes.some(a => a.name === 'required');
          const name = (el.content && typeof el.content !== 'string' && el.content.type === 'StringLiteral') ? (el.content as any).value : el.tag;
          html += `${this.ind()}<input type="${type}" name="${name}" placeholder="${placeholder}"${required ? ' required' : ''} />\n`;
        } else if (el.tag === 'submit') {
          const text = (el.content && typeof el.content !== 'string' && el.content.type === 'StringLiteral') ? (el.content as any).value : 'Submit';
          html += `${this.ind()}<button type="submit">${text}</button>\n`;
        } else {
          html += this.compileElement(el);
        }
      }
    }

    this.indent--;
    html += `${this.ind()}</form>\n`;
    return html;
  }

  // --- HTML document builder ---

  private buildHTML(body: string, css: string, js: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NyxCode App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
${css ? '    ' + css.split('\n').join('\n    ') : ''}
  </style>
</head>
<body>
${body}${js ? `
  <script>
${js}
  // Render function — re-renders all dynamic sections
  function render() {
    ${this.js.filter(j => j.includes('function render_')).map(j => {
      const match = j.match(/function (render_\w+)/);
      return match ? `${match[1]}();` : '';
    }).filter(Boolean).join('\n    ')}
  }
  </script>` : ''}
</body>
</html>`;
  }

  private buildJS(): string {
    return this.js.join('\n');
  }

  // --- Helpers ---

  private mapTag(tag: string): string {
    const mapping: Record<string, string> = {
      'row': 'div',
      'col': 'div',
      'grid': 'div',
      'stack': 'div',
      'container': 'div',
      'card': 'div',
      'badge': 'span',
      'metric': 'div',
      'text': 'span',
      'link': 'a',
      'icon': 'i',
    };
    return mapping[tag] || tag;
  }

  private mapAttrName(name: string): string {
    const mapping: Record<string, string> = {
      'cols': 'data-cols',
      'gap': 'data-gap',
      'format': 'data-format',
    };
    return mapping[name] || name;
  }

  private mapCSSProperty(name: string): string {
    const mapping: Record<string, string> = {
      'bg': 'background',
      'radius': 'border-radius',
      'shadow': 'box-shadow',
      'text': 'color',
      'padding': 'padding',
      'margin': 'margin',
      'border': 'border',
      'flex': 'display: flex; gap',
      'grid': 'display: grid; grid-template-columns',
    };
    return mapping[name] || name;
  }

  private mapBreakpoint(bp: string): string {
    const breakpoints: Record<string, string> = {
      'mobile': '768px',
      'tablet': '1024px',
      'desktop': '1280px',
    };
    return breakpoints[bp] || bp;
  }

  private propertyToJS(path: string): string {
    // .user.name → item.user.name or data.user.name
    return 'data' + path;
  }

  private actionToJS(action: string): string {
    if (action.startsWith('navigate')) {
      const path = action.replace('navigate ', '');
      return `window.location.href='${path}'`;
    }
    if (action.startsWith('toggle')) {
      return `this.classList.toggle('${action.replace('toggle .', '')}')`;
    }
    return action;
  }

  private expressionToJS(expr: Expression): string {
    switch (expr.type) {
      case 'PropertyAccess':
        return 'data' + expr.path;
      case 'BinaryExpression':
        return `${this.expressionToJS(expr.left)} ${expr.operator} ${this.expressionToJS(expr.right)}`;
      case 'StringLiteral':
        return `"${expr.value}"`;
      case 'NumberLiteral':
        return String(expr.value);
      case 'StoreAccess':
        return `$${expr.store}.${expr.field}`;
      case 'Identifier':
        return expr.name;
      default:
        return '';
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private isVoidElement(tag: string): boolean {
    return ['input', 'img', 'br', 'hr', 'meta', 'link'].includes(tag);
  }

  private nextId(prefix: string): string {
    return `${prefix}-${++this.componentId}`;
  }

  private ind(): string {
    return this.options.pretty ? '  '.repeat(this.indent) : '';
  }

  private indented(fn: () => string): string {
    this.indent++;
    const result = fn();
    this.indent--;
    return result;
  }
}
