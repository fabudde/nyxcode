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
  StateStatement, EffectStatement, ComputedStatement, UseStatement,
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
  private pageClass: string = '';
  private stateVars: Map<string, string> = new Map(); // name -> initial value
  private computedVars: Map<string, string> = new Map(); // name -> expression
  private effects: string[] = [];
  private hasReactivity: boolean = false;
  private components: Map<string, ComponentNode> = new Map();
  private importResolver?: (path: string) => Program | null;

  constructor(options: Partial<CompilerOptions> = {}) {
    this.options = {
      target: options.target ?? 'dynamic',
      pretty: options.pretty ?? true,
      includeRuntime: options.includeRuntime ?? true,
    };
  }

  /**
   * Set a resolver function for `use` imports.
   * The resolver takes a path and returns a parsed Program, or null.
   */
  setImportResolver(resolver: (path: string) => Program | null): void {
    this.importResolver = resolver;
  }

  /**
   * Compile the full program.
   */
  compile(program: Program): CompilerOutput {
    // Process `use` imports first — load third-party components
    const uses = program.body.filter(n => n.type === 'Use') as UseStatement[];
    for (const use of uses) {
      if (this.importResolver) {
        const imported = this.importResolver(use.path);
        if (imported) {
          // Register all components from the imported file
          for (const node of imported.body) {
            if (node.type === 'Component') {
              this.components.set((node as ComponentNode).name, node as ComponentNode);
            }
          }
        }
      }
    }

    const pages = program.body.filter(n => n.type === 'Page') as PageNode[];
    const components = program.body.filter(n => n.type === 'Component') as ComponentNode[];

    // Register inline components too
    for (const comp of components) {
      this.components.set(comp.name, comp);
    }

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

    // First style block in a page applies to body
    const pageStyle = page.body.find(s => s.type === 'Style') as StyleBlock | undefined;
    if (pageStyle) {
      this.compileStyleWithClass(pageStyle, 'nyx-page');
      this.pageClass = 'nyx-page';
    }

    for (const stmt of page.body) {
      if (stmt === pageStyle) continue; // Already handled
      content += this.compileStatement(stmt);
    }

    return content;
  }

  // --- Statement compilation ---

  private compileStatement(stmt: Statement): string {
    switch (stmt.type) {
      case 'Element':
        // Skip elements that are just "style" with attributes (inline style artifacts)
        if ((stmt as ElementNode).tag === 'style' && (stmt as ElementNode).attributes.length > 0) {
          return '';
        }
        return this.compileElement(stmt as ElementNode);
      case 'Data': return this.compileData(stmt);
      case 'Each': return this.compileEach(stmt);
      case 'When': return this.compileWhen(stmt);
      case 'Style': return this.compileStyle(stmt);
      case 'Form': return this.compileForm(stmt);
      case 'Auth': return ''; // Auth is handled at build level
      case 'On': return ''; // Events compiled with their parent element
      case 'State': return this.compileState(stmt as StateStatement);
      case 'Effect': return this.compileEffect(stmt as EffectStatement);
      case 'Computed': return this.compileComputed(stmt as ComputedStatement);
      default: return '';
    }
  }

  // --- Element compilation ---

  private compileElement(el: ElementNode): string {
    // Check if this element is a component invocation (e.g., Header title="My App")
    if (this.components.has(el.tag)) {
      return this.compileComponentUsage(el);
    }

    const tag = this.mapTag(el.tag);
    const content = this.compileContent(el.content);
    
    // Check for style block in children — generates scoped class
    let scopeClass = '';
    const styleChild = el.children.find(c => c.type === 'Style') as StyleBlock | undefined;
    if (styleChild) {
      scopeClass = `nyx-${this.nextId('s')}`;
      this.compileStyleWithClass(styleChild, scopeClass);
    }

    // Handle layout elements (grid, row) — convert attrs to style
    let extraStyle = '';
    if (el.tag === 'grid') {
      const cols = el.attributes.find(a => a.name === 'cols');
      const gap = el.attributes.find(a => a.name === 'gap');
      extraStyle = `display:grid;grid-template-columns:repeat(${cols?.value || 3},1fr)`;
      if (gap) extraStyle += `;gap:${gap.value}`;
    } else if (el.tag === 'row') {
      extraStyle = 'display:flex';
      const gap = el.attributes.find(a => a.name === 'gap');
      if (gap) extraStyle += `;gap:${gap.value}`;
    }

    // Merge extra style with existing style attribute
    const filteredAttrs = el.attributes.filter(a => !['cols', 'gap'].includes(a.name));
    if (extraStyle) {
      const existingStyle = filteredAttrs.find(a => a.name === 'style');
      if (existingStyle) {
        existingStyle.value = extraStyle + ';' + existingStyle.value;
      } else {
        filteredAttrs.push({ name: 'style', value: extraStyle });
      }
    }

    let attrs = this.compileAttributes(filteredAttrs);
    if (scopeClass) {
      attrs = ` class="${scopeClass}"${attrs}`;
    }

    // Filter out style blocks from children rendering
    const nonStyleChildren = el.children.filter(c => c.type !== 'Style');
    const children = nonStyleChildren.map(c => this.compileStatement(c)).join('');

    // Handle reactive bindings: content starting with __NYX_BIND:
    if (content.startsWith('__NYX_BIND:')) {
      const bindExpr = content.replace('__NYX_BIND:', '');
      if (this.isVoidElement(tag)) {
        return `${this.ind()}<${tag}${attrs} data-nyx-bind="${bindExpr}" />\n`;
      }
      return `${this.ind()}<${tag}${attrs} data-nyx-bind="${bindExpr}"></${tag}>\n`;
    }

    if (this.isVoidElement(tag)) {
      return `${this.ind()}<${tag}${attrs}${content ? ` value="${this.escapeHtml(content)}"` : ''} />\n`;
    }

    if (children) {
      return `${this.ind()}<${tag}${attrs}>\n${this.indented(() => children)}${this.ind()}</${tag}>\n`;
    }

    return `${this.ind()}<${tag}${attrs}>${content}</${tag}>\n`;
  }

  private compileStyleWithClass(style: StyleBlock, className: string): void {
    let cssBlock = `.${className} {\n`;
    for (const prop of style.properties) {
      const cssProp = this.mapCSSProperty(prop.name);
      if (cssProp.includes(':')) {
        // Complex mapping like 'flex' -> 'display: flex; gap'
        cssBlock += `  ${cssProp}: ${prop.value};\n`;
      } else {
        cssBlock += `  ${cssProp}: ${prop.value};\n`;
      }
    }
    cssBlock += '}\n';

    if (style.hover) {
      cssBlock += `.${className}:hover {\n`;
      for (const prop of style.hover) {
        cssBlock += `  ${this.mapCSSProperty(prop.name)}: ${prop.value};\n`;
      }
      cssBlock += '}\n';
    }

    if (style.responsive) {
      for (const r of style.responsive) {
        const bp = this.mapBreakpoint(r.breakpoint);
        cssBlock += `@media (max-width: ${bp}) {\n  .${className} {\n`;
        for (const prop of r.properties) {
          cssBlock += `    ${this.mapCSSProperty(prop.name)}: ${prop.value};\n`;
        }
        cssBlock += '  }\n}\n';
      }
    }

    this.css.push(cssBlock);
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
        // Check if this references a state var — if so, use binding
        if (this.stateVars.has(content.name)) {
          return `__NYX_BIND:state.${content.name}`;
        }
        if (this.computedVars.has(content.name)) {
          return `__NYX_BIND:computed.${content.name}`;
        }
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
      } else if (attr.name === 'bind') {
        // Two-way binding: bind="stateName"
        const stateName = typeof attr.value === 'string' ? attr.value : '';
        parts.push(`data-nyx-model="${stateName}"`);
      } else if (attr.name === 'style') {
        // Inline style passthrough
        parts.push(`style="${attr.value}"`);
      } else if (attr.name === 'href') {
        parts.push(`href="${attr.value}"`);
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

  // --- Component compilation ---

  /**
   * Compile a component usage: `Header title="My App" logo="🦞"`
   * Inlines the component's body with props substituted.
   */
  private compileComponentUsage(el: ElementNode): string {
    const comp = this.components.get(el.tag)!;

    // Build props map from attributes
    const props: Record<string, string> = {};
    for (const attr of el.attributes) {
      props[attr.name] = typeof attr.value === 'string' ? attr.value : '';
    }

    // Generate scoped wrapper with component class
    const scopeClass = `nyx-${this.nextId('c')}`;

    // Compile component's style blocks
    for (const stmt of comp.body) {
      if (stmt.type === 'Style') {
        this.compileStyleWithClass(stmt as StyleBlock, scopeClass);
      }
    }

    // Compile component body, substituting prop references
    let html = `${this.ind()}<div class="${scopeClass}">\n`;
    this.indent++;

    for (const stmt of comp.body) {
      if (stmt.type === 'Style') continue; // Already handled
      if (stmt.type === 'Element') {
        html += this.compileElementWithProps(stmt as ElementNode, props);
      } else {
        html += this.compileStatement(stmt);
      }
    }

    this.indent--;
    html += `${this.ind()}</div>\n`;

    return html;
  }

  /**
   * Compile an element with prop substitution.
   * Replaces .propName with the actual prop value.
   */
  private compileElementWithProps(el: ElementNode, props: Record<string, string>): string {
    const tag = this.mapTag(el.tag);
    let content = '';

    if (el.content) {
      if (typeof el.content === 'string') {
        content = this.escapeHtml(el.content);
      } else if (el.content.type === 'StringLiteral') {
        content = this.escapeHtml((el.content as any).value);
      } else if (el.content.type === 'PropertyAccess') {
        // .title → props['title']
        const propName = (el.content as any).path.replace(/^\./, '');
        content = this.escapeHtml(props[propName] ?? '');
      } else if (el.content.type === 'Identifier') {
        // Check if it's a prop name
        const name = (el.content as any).name;
        if (props[name]) {
          content = this.escapeHtml(props[name]);
        } else {
          content = this.compileContent(el.content);
        }
      } else {
        content = this.compileContent(el.content);
      }
    }

    const attrs = this.compileAttributes(el.attributes);

    // Recurse into children
    const children = el.children.map(c => {
      if (c.type === 'Element') return this.compileElementWithProps(c as ElementNode, props);
      return this.compileStatement(c);
    }).join('');

    if (this.isVoidElement(tag)) {
      return `${this.ind()}<${tag}${attrs} />\n`;
    }
    if (children) {
      return `${this.ind()}<${tag}${attrs}>\n${this.indented(() => children)}${this.ind()}</${tag}>\n`;
    }
    return `${this.ind()}<${tag}${attrs}>${content}</${tag}>\n`;
  }

  // --- Reactivity compilation ---

  private compileState(state: StateStatement): string {
    this.hasReactivity = true;
    let initVal: string;

    if (typeof state.initialValue === 'string') {
      initVal = state.initialValue;
    } else if (state.initialValue.type === 'StringLiteral') {
      initVal = `"${(state.initialValue as any).value}"`;
    } else if (state.initialValue.type === 'NumberLiteral') {
      initVal = String((state.initialValue as any).value);
    } else {
      initVal = String(state.initialValue);
    }

    this.stateVars.set(state.name, initVal);
    return '';
  }

  private compileEffect(effect: EffectStatement): string {
    this.hasReactivity = true;
    this.effects.push(effect.body);
    return '';
  }

  private compileComputed(computed: ComputedStatement): string {
    this.hasReactivity = true;
    this.computedVars.set(computed.name, computed.expression);
    return '';
  }

  /**
   * Generate the reactive runtime.
   * Uses a simple signal-based system:
   * - State vars are wrapped in reactive getters/setters
   * - DOM nodes that reference state get a `data-nyx-bind` attribute
   * - On state change, all bound nodes re-evaluate their content
   */
  private buildReactiveRuntime(): string {
    if (!this.hasReactivity) return '';

    let runtime = `
  // === NyxCode Reactive Runtime v0.2 ===
  const __nyx = {
    state: {},
    subscribers: new Map(),
    batch: false,
    pending: new Set(),

    // Create a reactive state variable
    createState(name, initial) {
      let value = initial;
      this.subscribers.set(name, new Set());

      Object.defineProperty(this.state, name, {
        get: () => value,
        set: (newVal) => {
          if (value === newVal) return;
          value = newVal;
          // Notify subscribers
          if (this.batch) {
            this.pending.add(name);
          } else {
            this.notify(name);
          }
        }
      });
    },

    // Subscribe a DOM updater to a state variable
    subscribe(stateName, updater) {
      if (!this.subscribers.has(stateName)) this.subscribers.set(stateName, new Set());
      this.subscribers.get(stateName).add(updater);
    },

    // Notify all subscribers of a state change
    notify(name) {
      const subs = this.subscribers.get(name);
      if (subs) subs.forEach(fn => fn());
      // Also update computed values
      this.updateComputed();
    },

    // Batch multiple state changes (only re-render once)
    batchUpdate(fn) {
      this.batch = true;
      fn();
      this.batch = false;
      this.pending.forEach(name => this.notify(name));
      this.pending.clear();
    },

    // Computed values
    computed: {},
    computedDefs: {},

    defineComputed(name, fn) {
      this.computedDefs[name] = fn;
      Object.defineProperty(this.computed, name, { get: fn, enumerable: true });
    },

    updateComputed() {
      // Re-trigger subscribers that depend on computed
      for (const name of Object.keys(this.computedDefs)) {
        const subs = this.subscribers.get('__computed_' + name);
        if (subs) subs.forEach(fn => fn());
      }
    },

    // Effects
    effects: [],
    runEffects() {
      this.effects.forEach(fn => fn());
    }
  };
`;

    // Initialize state variables
    for (const [name, initVal] of this.stateVars) {
      runtime += `  __nyx.createState('${name}', ${initVal});\n`;
    }

    // Create convenience accessors (so users can write `count` not `__nyx.state.count`)
    runtime += `\n  // Convenience accessors\n`;
    for (const [name] of this.stateVars) {
      runtime += `  let ${name} = { get value() { return __nyx.state.${name}; }, set value(v) { __nyx.state.${name} = v; } };\n`;
    }

    // Computed values
    for (const [name, expr] of this.computedVars) {
      runtime += `  __nyx.defineComputed('${name}', () => ${expr});\n`;
    }

    // Effects
    for (const effect of this.effects) {
      runtime += `  __nyx.effects.push(() => { ${effect} });\n`;
    }

    // Bind DOM updates
    runtime += `
  // DOM Binding — auto-update elements when state changes
  function __nyxBind() {
    document.querySelectorAll('[data-nyx-bind]').forEach(el => {
      const expr = el.getAttribute('data-nyx-bind');
      // SECURITY: Safe expression evaluator — only allows property access (state.X, computed.X)
      // No new Function(), no eval(). Tyto's Security Review 2026-04-12 🦉🔒
      const safeEval = (expr) => {
        const parts = expr.split('.');
        if (parts[0] === 'state' && parts.length === 2 && __nyx.subscribers.has(parts[1])) {
          return __nyx.state[parts[1]];
        }
        if (parts[0] === 'computed' && parts.length === 2 && parts[1] in __nyx.computedDefs) {
          return __nyx.computed[parts[1]];
        }
        return '';
      };
      const update = () => {
        try {
          const val = safeEval(expr);
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.value = val;
          } else {
            el.textContent = val;
          }
        } catch(e) {}
      };
      // Subscribe to all state vars mentioned in expression
      for (const [name] of __nyx.subscribers) {
        if (expr.includes('state.' + name) || expr.includes(name)) {
          __nyx.subscribe(name, update);
        }
      }
      update(); // Initial render
    });

    // Bind inputs with data-nyx-model (two-way binding)
    document.querySelectorAll('[data-nyx-model]').forEach(el => {
      const name = el.getAttribute('data-nyx-model');
      if (!__nyx.subscribers.has(name)) return; // SECURITY: Reject unknown state keys (Tyto Review 🦉🔒)
      el.addEventListener('input', (e) => {
        __nyx.state[name] = e.target.value;
      });
      // Subscribe to keep input in sync
      __nyx.subscribe(name, () => {
        if (document.activeElement !== el) el.value = __nyx.state[name];
      });
      el.value = __nyx.state[name] ?? '';
    });

    // Bind each loops with data-nyx-each
    document.querySelectorAll('[data-nyx-each]').forEach(el => {
      const config = JSON.parse(el.getAttribute('data-nyx-each'));
      const template = el.getAttribute('data-nyx-template');
      const update = () => {
        const items = __nyx.state[config.collection] || [];
        const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        el.innerHTML = items.map((item, i) => {
          return template.replace(/\{\{(\w+)\}\}/g, (_, key) => esc(item[key] ?? item ?? ''));
        }).join('');
      };
      __nyx.subscribe(config.collection, update);
      update();
    });

    // Run initial effects
    __nyx.runEffects();
  }

  // Initialize when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __nyxBind);
  } else {
    __nyxBind();
  }
`;

    return runtime;
  }

  // --- HTML document builder ---

  private buildHTML(body: string, css: string, js: string): string {
    const reactiveRuntime = this.buildReactiveRuntime();
    const renderCalls = this.js.filter(j => j.includes('function render_')).map(j => {
      const match = j.match(/function (render_\w+)/);
      return match ? `${match[1]}();` : '';
    }).filter(Boolean).join('\n    ');

    const scriptContent = [js, reactiveRuntime].filter(Boolean).join('\n');
    const hasScript = scriptContent.trim().length > 0 || renderCalls.length > 0;

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
<body${this.pageClass ? ` class="${this.pageClass}"` : ''}>
${body}${hasScript ? `
  <script>
${js}${renderCalls ? `
  // Render function \u2014 re-renders all dynamic sections
  function render() {
    ${renderCalls}
  }` : ''}
${reactiveRuntime}
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
      'slot': 'div',
    };
    return mapping[tag] || tag;
  }

  private mapAttrName(name: string): string {
    const mapping: Record<string, string> = {
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
    // State mutations: count + 1, count - 1, name = "new"
    // Check if action references a state var
    for (const [name] of this.stateVars) {
      if (action.includes(name)) {
        // Convert "count + 1" to "__nyx.state.count = __nyx.state.count + 1"
        // Convert "count = 0" to "__nyx.state.count = 0"
        if (action.includes('=')) {
          const [lhs, rhs] = action.split('=').map(s => s.trim());
          const rhsResolved = this.resolveStateRefs(rhs);
          return `__nyx.state.${lhs.trim()} = ${rhsResolved}`;
        } else {
          // Shorthand: "count + 1" means increment
          const resolved = this.resolveStateRefs(action);
          return `__nyx.state.${name} = ${resolved}`;
        }
      }
    }
    return action;
  }

  /** Replace state var names in an expression with __nyx.state.name */
  private resolveStateRefs(expr: string): string {
    let result = expr;
    for (const [name] of this.stateVars) {
      // Replace standalone occurrences (not inside other words)
      result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), `__nyx.state.${name}`);
    }
    return result;
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
