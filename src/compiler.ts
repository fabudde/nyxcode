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
  FormStatement, AuthStatement, ElementNode, Expression, ScriptStatement,
  StyleProperty, ResponsiveBlock, Attribute, PseudoElementBlock,
  StateStatement, EffectStatement, ComputedStatement, UseStatement,
  HeadStatement, AnimateStatement, LayoutNode,
} from './ast.js';

const NYXCODE_VERSION = "0.9.6";

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
  private headInjections: string[] = [];
  private themeVars: Map<string, string> = new Map();
  private themeColorNames: Map<string, string> = new Map(); // value name → full CSS var name (e.g. 'primary' → 'colors-primary')
  private presets: Map<string, string> = new Map(); // preset name → CSS class name
  private scripts: string[] = [];
  private animations: string[] = [];
  private styleCache: Map<string, string> = new Map(); // hash -> className for dedup
  private staticMode: boolean = false; // When true, don't emit data-navigate on links
  private layout: LayoutNode | null = null; // Layout wrapping all pages
  private usedInteractiveElements: Set<string> = new Set(); // Track button/input/select/textarea/a usage

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
   * Result type for multi-file output.
   */
  public static readonly MULTI_FILE = true;

  /**
   * Compile multi-page programs into separate standalone HTML files.
   * Returns an array of {path, html} objects, one per page.
   */
  compileMultiFile(program: Program): Array<{path: string, html: string}> {
    // Process `use` imports first
    const uses = program.body.filter(n => n.type === 'Use') as UseStatement[];
    for (const use of uses) {
      if (this.importResolver) {
        const imported = this.importResolver(use.path);
        if (imported) {
          for (const node of imported.body) {
            if (node.type === 'Component') {
              this.components.set((node as ComponentNode).name, node as ComponentNode);
            } else if (node.type === 'Layout') {
              // Import layout from third-party file
              if (!this.layout) {
                this.layout = node as LayoutNode;
              }
            }
          }
        }
      }
    }

    const pages = program.body.filter(n => n.type === 'Page') as PageNode[];
    const components = program.body.filter(n => n.type === 'Component') as ComponentNode[];
    const layouts = program.body.filter(n => n.type === 'Layout') as LayoutNode[];

    // Validate: max one layout per file
    if (layouts.length > 1) {
      throw new Error('[NyxCode Compiler Error] Only one layout per file is allowed.');
    }
    if (layouts.length === 1 && !this.layout) {
      this.layout = layouts[0];
    } else if (layouts.length === 1 && this.layout) {
      throw new Error('[NyxCode Compiler Error] Only one layout per file is allowed (including imports).');
    }

    // Register inline components
    for (const comp of components) {
      this.components.set(comp.name, comp);
    }

    // Process theme blocks — generate CSS custom properties
    let themeCSS = '';
    const themes = program.body.filter(n => n.type === 'Theme');
    for (const theme of themes) {
      this.compileTheme(theme);
    }
    if (this.themeVars.size > 0) {
      themeCSS = ':root{';
      for (const [key, value] of this.themeVars) {
        themeCSS += '--' + key + ':' + value + ';';
      }
      themeCSS += '}';
    }

    // Process preset blocks
    for (const node of program.body) {
      if (node.type === 'Preset') this.compilePreset(node as any);
    }

    // If we have a layout, compile its CSS once (shared across all pages)
    // and cache the layout HTML template with <!--SLOT--> placeholder
    let layoutCssBlocks: string[] = [];
    let layoutHeadInjections: string[] = [];
    let layoutHtmlTemplate: string | null = null;
    let layoutInteractiveElements: Set<string> = new Set();
    if (this.layout) {
      // Do a single compile to collect layout CSS, head injections + HTML template
      this.css = [];
      this.js = [];
      this.headInjections = [];
      this.scripts = [];
      this.usedInteractiveElements = new Set();
      this.componentId = 0;
      this.indent = 0;
      // Extract head/script/preset nodes BEFORE compileLayoutBody (which skips them)
      for (const stmt of this.layout.body) {
        if (stmt.type === 'Head') {
          this.headInjections.push((stmt as HeadStatement).content);
        } else if (stmt.type === 'Script') {
          this.scripts.push((stmt as any).content);
        } else if (stmt.type === 'Preset') {
          this.compilePreset(stmt as any);
        }
      }
      this.staticMode = true;
      layoutHtmlTemplate = this.compileLayoutBody(this.layout.body, '<!--SLOT-->');
      this.staticMode = false;
      layoutCssBlocks = [...this.css];
      layoutHeadInjections = [...this.headInjections];
      if (themeCSS) layoutHeadInjections.unshift('<style>' + themeCSS + '</style>');
      layoutInteractiveElements = new Set(this.usedInteractiveElements);
    }

    const results: Array<{path: string, html: string}> = [];

    for (const page of pages) {
      // Reset per-page state
      this.css = [...layoutCssBlocks]; // Start with layout CSS (already compiled once)
      this.js = [];
      this.componentId = this.layout ? 1000 : 0; // Offset to avoid ID collisions
      this.indent = 0;
      this.pageClass = '';
      this.stateVars = new Map();
      this.computedVars = new Map();
      this.effects = [];
      this.hasReactivity = false;
      this.headInjections = [...layoutHeadInjections]; // Start with layout head injections
      this.animations = [];
      this.scripts = []; // Reset scripts per page — prevent cross-page bleed
      this.usedInteractiveElements = new Set(layoutInteractiveElements); // Start with layout elements
      // Keep components and styleCache across pages for dedup

      let bodyHtml: string;
      if (layoutHtmlTemplate) {
        // Compile page content, then insert into layout template
        const pageContent = this.compilePageStatic(page);
        bodyHtml = layoutHtmlTemplate.replace('<!--SLOT-->', pageContent);
      } else {
        bodyHtml = this.compilePageStatic(page);
      }

      const css = this.css.join('\n');
      const js = this.js.length > 0 ? this.buildJS() : '';

      // Extract page title from first h1
      const pageTitle = this.extractPageTitle(page) || this.pathToTitle(page.path);

      // Build standalone HTML document
      const html = this.buildStandaloneHTML(bodyHtml, css, js, page.path, pageTitle);
      results.push({ path: page.path, html });
    }

    this.layout = null; // Reset for next compilation
    return results;
  }

  /**
   * Compile the full program (legacy single-file output).
   */
  compile(program: Program): CompilerOutput {
    // Process `use` imports first — load third-party components + layouts
    const uses = program.body.filter(n => n.type === 'Use') as UseStatement[];
    for (const use of uses) {
      if (this.importResolver) {
        const imported = this.importResolver(use.path);
        if (imported) {
          for (const node of imported.body) {
            if (node.type === 'Component') {
              this.components.set((node as ComponentNode).name, node as ComponentNode);
            } else if (node.type === 'Layout') {
              if (!this.layout) {
                this.layout = node as LayoutNode;
              }
            }
          }
        }
      }
    }

    const pages = program.body.filter(n => n.type === 'Page') as PageNode[];
    const components = program.body.filter(n => n.type === 'Component') as ComponentNode[];
    const layouts = program.body.filter(n => n.type === 'Layout') as LayoutNode[];

    // Validate: max one layout
    if (layouts.length > 1) {
      throw new Error('[NyxCode Compiler Error] Only one layout per file is allowed.');
    }
    if (layouts.length === 1 && !this.layout) {
      this.layout = layouts[0];
    } else if (layouts.length === 1 && this.layout) {
      throw new Error('[NyxCode Compiler Error] Only one layout per file is allowed (including imports).');
    }

    // Register inline components too
    for (const comp of components) {
      this.components.set(comp.name, comp);
    }

    // Process theme blocks
    for (const node of program.body) {
      if (node.type === 'Theme') this.compileTheme(node);
    }

    // Process preset blocks
    for (const node of program.body) {
      if (node.type === 'Preset') this.compilePreset(node as any);
    }

    // If we have a layout, extract head/script nodes from layout body
    // and compile layout elements to wrap page content
    if (this.layout) {
      // Extract head injections + scripts from layout body (non-element nodes)
      for (const stmt of this.layout.body) {
        if (stmt.type === 'Head') {
          this.headInjections.push((stmt as HeadStatement).content);
        } else if (stmt.type === 'Script') {
          this.scripts.push((stmt as any).content);
        } else if (stmt.type === 'Preset') {
          this.compilePreset(stmt as any);
        }
      }
    }

    // Multi-page: compile ALL pages
    let html = '';
    if (pages.length === 1) {
      const pageHtml = this.compilePage(pages[0]);
      if (this.layout) {
        html = this.compileLayoutBody(this.layout.body, pageHtml);
      } else {
        html = pageHtml;
      }
    } else if (pages.length > 1) {
      html = this.compileMultiPage(pages);
    }

    const css = this.css.join('\n');
    const js = this.js.length > 0 ? this.buildJS() : '';

    this.layout = null; // Reset
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

  /**
   * Compile a single page for static multi-file output.
   * NO SPA router. NO data-navigate. Standalone page.
   */
  private compilePageStatic(page: PageNode): string {
    let content = '';

    // First style block in a page applies to body
    const pageStyle = page.body.find(s => s.type === 'Style') as StyleBlock | undefined;
    if (pageStyle) {
      this.compileStyleWithClass(pageStyle, 'nyx-page');
      this.pageClass = 'nyx-page';
    }

    // Temporarily set static mode to suppress data-navigate on links
    this.staticMode = true;
    for (const stmt of page.body) {
      if (stmt === pageStyle) continue;
      content += this.compileStatement(stmt);
    }
    this.staticMode = false;

    return content;
  }

  /**
   * Compile layout body, replacing `slot` elements with the given slotContent.
   * Returns the HTML string for the layout wrapping the page content.
   */
  private layoutSlotContent: string | null = null;

  private compileLayoutBody(body: Statement[], slotContent: string): string {
    let html = '';
    const savedStaticMode = this.staticMode;
    this.staticMode = true;
    this.layoutSlotContent = slotContent;

    for (const stmt of body) {
      if (stmt.type === 'Element' && (stmt as ElementNode).tag === 'slot') {
        // Replace slot with page content
        html += slotContent;
      } else if (stmt.type === 'Head' || stmt.type === 'Script' || stmt.type === 'Preset') {
        // Skip — already extracted in compile() or compileMultiFile()
        continue;
      } else {
        html += this.compileStatement(stmt);
      }
    }

    this.layoutSlotContent = null;
    this.staticMode = savedStaticMode;
    return html;
  }

  /**
   * Extract the first h1 text content from a page for SEO title.
   */
  private extractPageTitle(page: PageNode): string | null {
    for (const stmt of page.body) {
      const title = this.findH1InStatement(stmt);
      if (title) return title;
    }
    return null;
  }

  private findH1InStatement(stmt: Statement): string | null {
    if (stmt.type === 'Element') {
      const el = stmt as ElementNode;
      if (el.tag === 'h1' && el.content) {
        if (typeof el.content === 'string') return el.content;
        if (el.content.type === 'StringLiteral') return (el.content as any).value;
      }
      // Recurse into children
      for (const child of el.children) {
        const found = this.findH1InStatement(child);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Convert a URL path to a human-readable title.
   */
  private pathToTitle(path: string): string {
    if (path === '/' || path === '/docs') return 'Documentation';
    const last = path.split('/').filter(Boolean).pop() || 'Page';
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  /**
   * Build a standalone HTML document for static multi-file output.
   * Includes SEO meta tags, no router JS.
   */
  private buildStandaloneHTML(body: string, css: string, js: string, pagePath: string, pageTitle: string): string {
    const reactiveRuntime = this.buildReactiveRuntime();
    const renderCalls = this.js.filter(j => j.includes('function render_')).map(j => {
      const match = j.match(/function (render_\w+)/);
      return match ? `${match[1]}();` : '';
    }).filter(Boolean).join('\n    ');

    const scriptContent = [js, reactiveRuntime].filter(Boolean).join('\n');
    const hasScript = scriptContent.trim().length > 0 || renderCalls.length > 0;

    const headExtra = this.headInjections.length > 0 ? '\n  ' + this.headInjections.join('\n  ') : '';
    const animCSS = this.animations.length > 0 ? '\n    ' + this.animations.join('\n    ') : '';
    const elementDefaults = this.buildElementDefaults();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="NyxCode v${NYXCODE_VERSION}">
  <title>NyxCode - ${this.escapeHtml(pageTitle)}</title>
  <meta name="description" content="NyxCode documentation - ${this.escapeHtml(pageTitle)}">
  <link rel="canonical" href="https://nyxcode.io${pagePath}">` + headExtra + `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }` + animCSS + elementDefaults + `
` + (css ? '    ' + css.split('\n').join('\n    ') : '') + `
  </style>
</head>
<body` + (this.pageClass ? ` class="${this.pageClass}"` : '') + `>
` + body + (hasScript ? `
  <script>
` + js + (renderCalls ? `
  // Render function \u2014 re-renders all dynamic sections
  function render() {
    ${renderCalls}
  }` : '') + `
` + reactiveRuntime + `
  </script>` : '') + (this.scripts.length > 0 ? `\n<script>${this.scripts.join(';')}</script>` : '') + `
</body>
</html>`;
  }

  /** Compile multiple pages into SPA with client-side router */
  private compileMultiPage(pages: PageNode[]): string {
    let html = '';

    // Compile each page into a hidden div
    for (const page of pages) {
      const route = page.path;
      const pageId = `nyx-page-${route.replace(/\//g, '-').replace(/^-/, '') || 'home'}`;

      // Compile page style
      const pageStyle = page.body.find(s => s.type === 'Style') as StyleBlock | undefined;
      if (pageStyle) {
        this.compileStyleWithClass(pageStyle, pageId);
      }

      html += `${this.ind()}<div id="${pageId}" class="nyx-route${pageStyle ? ' ' + pageId : ''}" data-route="${route}" style="display:none">\n`;
      this.indent++;
      for (const stmt of page.body) {
        if (stmt === pageStyle) continue;
        html += this.compileStatement(stmt);
      }
      this.indent--;
      html += `${this.ind()}</div>\n`;
    }

    // Add router script
    this.js.push(`
  // NyxCode SPA Router
  const __routes = document.querySelectorAll('.nyx-route');
  function __navigate(path) {
    __routes.forEach(r => r.style.display = r.dataset.route === path ? '' : 'none');
    history.pushState(null, '', path);
  }
  // Handle initial route
  const __initPath = location.pathname || '/';
  let __found = false;
  __routes.forEach(r => {
    if (r.dataset.route === __initPath) { r.style.display = ''; __found = true; }
  });
  if (!__found && __routes.length > 0) __routes[0].style.display = '';
  // Handle popstate (back/forward)
  window.addEventListener('popstate', () => __navigate(location.pathname));
  // Intercept link clicks with data-navigate
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-navigate]');
    if (link) { e.preventDefault(); __navigate(link.dataset.navigate); }
  });`);

    return html;
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
      case 'Script': this.scripts.push((stmt as ScriptStatement).content); return '';
      case 'Preset': this.compilePreset(stmt as any); return '';
      case 'Auth': return ''; // Auth is handled at build level
      case 'On': return ''; // Events compiled with their parent element
      case 'State': return this.compileState(stmt as StateStatement);
      case 'Effect': return this.compileEffect(stmt as EffectStatement);
      case 'Computed': return this.compileComputed(stmt as ComputedStatement);
      case 'Head': this.headInjections.push((stmt as HeadStatement).content); return '';
      case 'Animate': this.animations.push(`@keyframes ${(stmt as AnimateStatement).name} { ${(stmt as AnimateStatement).content} }`); return '';
      default: return '';
    }
  }

  // --- Element compilation ---

  private compileElement(el: ElementNode): string {
    // In layout mode: replace slot with page content at ANY depth
    if (el.tag === 'slot' && this.layoutSlotContent !== null) {
      return this.layoutSlotContent;
    }

    // Check if this element is a component invocation (e.g., Header title="My App")
    if (this.components.has(el.tag)) {
      return this.compileComponentUsage(el);
    }

    const tag = this.mapTag(el.tag);
    const content = this.compileContent(el.content);

    // Track interactive elements for CSS defaults injection
    const INTERACTIVE_ELEMENTS = new Set(['button', 'input', 'select', 'textarea', 'a']);
    if (INTERACTIVE_ELEMENTS.has(tag)) {
      this.usedInteractiveElements.add(tag);
    }
    
    // Check for style block in children — generates scoped class
    let scopeClass = '';
    const styleChild = el.children.find(c => c.type === 'Style') as StyleBlock | undefined;
    if (styleChild) {
      scopeClass = `nyx-${this.nextId('s')}`;
      this.compileStyleWithClass(styleChild, scopeClass);
    }

    // Layout shorthand attributes → inline style generation
    // flex=col|row|wrap, grid=N, gap=X, center, between, wrap, etc.
    let extraStyles: string[] = [];
    const LAYOUT_ATTRS = new Set(['flex', 'grid', 'gap', 'center', 'between', 'around', 'evenly', 'wrap', 'nowrap', 'cols', 'rows', 'place']);
    
    // Legacy tag support (grid/row elements)
    if (el.tag === 'grid') {
      const cols = el.attributes.find(a => a.name === 'cols');
      const gap = el.attributes.find(a => a.name === 'gap');
      extraStyles.push(`display:grid`, `grid-template-columns:repeat(${cols?.value || 3},1fr)`);
      if (gap) extraStyles.push(`gap:${gap.value}`);
    } else if (el.tag === 'row') {
      extraStyles.push('display:flex');
      const gap = el.attributes.find(a => a.name === 'gap');
      if (gap) extraStyles.push(`gap:${gap.value}`);
    }
    
    // Shorthand layout attributes on ANY element
    for (const attr of el.attributes) {
      if (attr.name === 'flex') {
        extraStyles.push('display:flex');
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (v === 'col' || v === 'column') extraStyles.push('flex-direction:column');
        else if (v === 'row') extraStyles.push('flex-direction:row');
        else if (v === 'wrap') { extraStyles.push('flex-wrap:wrap'); }
      } else if (attr.name === 'grid' && el.tag !== 'grid') {
        extraStyles.push('display:grid');
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (/^\d+$/.test(v)) extraStyles.push(`grid-template-columns:repeat(${v},1fr)`);
        else if (v) extraStyles.push(`grid-template-columns:${v}`);
      } else if (attr.name === 'gap' && el.tag !== 'grid' && el.tag !== 'row') {
        extraStyles.push(`gap:${attr.value}`);
      } else if (attr.name === 'center') {
        extraStyles.push('align-items:center', 'justify-content:center');
      } else if (attr.name === 'between') {
        extraStyles.push('justify-content:space-between');
      } else if (attr.name === 'around') {
        extraStyles.push('justify-content:space-around');
      } else if (attr.name === 'evenly') {
        extraStyles.push('justify-content:space-evenly');
      } else if (attr.name === 'wrap') {
        extraStyles.push('flex-wrap:wrap');
      } else if (attr.name === 'place') {
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (v === 'center') extraStyles.push('place-items:center');
        else if (v) extraStyles.push(`place-items:${v}`);
      }
    }

    // Filter layout attrs from HTML output
    const filteredAttrs = el.attributes.filter(a => !LAYOUT_ATTRS.has(a.name));
    
    // Merge extra styles
    if (extraStyles.length > 0) {
      const extraStyle = extraStyles.join(';');
      const existingStyle = filteredAttrs.find(a => a.name === 'style');
      if (existingStyle) {
        existingStyle.value = extraStyle + ';' + existingStyle.value;
      } else {
        filteredAttrs.push({ name: 'style', value: extraStyle });
      }
    }

    // For link elements with internal href (starts with /), add data-navigate for SPA routing
    // Skip in static mode — links are plain <a href> without JS
    if (el.tag === 'link' && !this.staticMode) {
      const hrefAttr = filteredAttrs.find(a => a.name === 'href');
      if (hrefAttr && typeof hrefAttr.value === 'string' && hrefAttr.value.startsWith('/')) {
        filteredAttrs.push({ name: 'data-navigate', value: hrefAttr.value });
      }
    }

    // Handle preset= attribute → add preset CSS class
    let presetClass = '';
    const presetAttr = filteredAttrs.find(a => a.name === 'preset');
    if (presetAttr) {
      const presetName = typeof presetAttr.value === 'string' ? presetAttr.value : '';
      if (this.presets.has(presetName)) {
        presetClass = this.presets.get(presetName)!;
      }
    }
    const nonPresetAttrs = filteredAttrs.filter(a => a.name !== 'preset');

    let attrs = this.compileAttributes(nonPresetAttrs);
    const classes = [scopeClass, presetClass].filter(Boolean).join(' ');
    if (classes) {
      attrs = ` class="${classes}"${attrs}`;
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
      const cssVal = this.resolveThemeValue(cssProp, prop.value);
      cssBlock += `  ${cssProp}: ${cssVal};\n`;
    }
    cssBlock += '}\n';

    // Pseudo-classes: hover, focus, active
    for (const [pseudoName, pseudoProps] of [
      ['hover', style.hover],
      ['focus', style.focus],
      ['active', style.active],
    ] as [string, StyleProperty[] | undefined][]) {
      if (pseudoProps) {
        cssBlock += `.${className}:${pseudoName} {\n`;
        for (const prop of pseudoProps) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '}\n';
      }
    }

    // Pseudo-elements: ::before, ::after (Tyto Security Review: allowlist enforced)
    const ALLOWED_PSEUDO_ELEMENTS = ['before', 'after'];
    if (style.pseudoElements) {
      for (const pe of style.pseudoElements) {
        if (!ALLOWED_PSEUDO_ELEMENTS.includes(pe.selector)) continue; // Security: skip unknown
        cssBlock += `.${className}::${pe.selector} {\n`;
        const hasContent = pe.properties.some(p => p.name === 'content');
        if (!hasContent) {
          cssBlock += `  content: '';\n`;
        }
        for (const prop of pe.properties) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '}\n';
      }
    }

    if (style.responsive) {
      for (const r of style.responsive) {
        const bp = this.mapBreakpoint(r.breakpoint);
        cssBlock += `@media (max-width: ${bp}) {\n  .${className} {\n`;
        for (const prop of r.properties) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `    ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '  }\n}\n';
      }
    }

    // CSS Rules: .class { props }, tag { props }, @keyframes (raw)
    if (style.cssRules) {
      for (const rule of style.cssRules) {
        if (rule.selector === '__raw__') {
          cssBlock += rule.properties[0].value + '\n';
        } else {
          cssBlock += `${rule.selector} {\n`;
          for (const prop of rule.properties) {
            const cp = this.mapCSSProperty(prop.name);
            cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
          }
          cssBlock += '}\n';
        }
      }
    }

    this.css.push(cssBlock);
  }

  private compileContent(content: string | Expression | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return this.escapeContent(content);

    switch (content.type) {
      case 'StringLiteral':
        return this.escapeContent(content.value);
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
        // Inline style with shorthand expansion
        const expandedStyle = this.expandInlineShorthands(attr.value as string);
        parts.push(`style="${expandedStyle}"`);
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
      const headers = {};
      ${source.auth ? "const tk=localStorage.getItem('token');if(tk)headers['Authorization']='Bearer '+tk;" : ''}
      const res = await fetch('${source.value}', { headers });
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

    if (el.content) {
      if (typeof el.content === 'string') {
        content = this.escapeContent(el.content);
      } else if (el.content.type === 'PropertyAccess') {
        content = `\${${varName}${(el.content as any).path}}`;
      } else if (el.content.type === 'StringLiteral') {
        content = (el.content as any).value;
      } else if (el.content.type === 'Identifier') {
        // Direct identifier like "user" — use as variable
        content = `\${${(el.content as any).name}}`;
      }
    }

    const attrs = el.attributes.map(a => {
      if (typeof a.value === 'string' && a.value !== 'true') {
        return `${a.name}="${a.value}"`;
      }
      return a.name;
    }).join(' ');

    const attrStr = attrs ? ' ' + attrs : '';

    // Recurse into children
    const children = el.children.map(c => {
      if (c.type === 'Element') {
        return this.compileElementTemplate(c as ElementNode, varName);
      }
      return '';
    }).join('');

    return `<${tag}${attrStr}>${content}${children}</${tag}>`;
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
      const cp = this.mapCSSProperty(prop.name);
      cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
    }
    cssBlock += '}\n';

    // Pseudo-classes
    for (const [pseudoName, pseudoProps] of [
      ['hover', style.hover],
      ['focus', style.focus],
      ['active', style.active],
    ] as [string, StyleProperty[] | undefined][]) {
      if (pseudoProps) {
        cssBlock += `.${scopeClass}:${pseudoName} {\n`;
        for (const prop of pseudoProps) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '}\n';
      }
    }

    // Pseudo-elements (Tyto Security Review: allowlist enforced)
    const ALLOWED_PE = ['before', 'after'];
    if (style.pseudoElements) {
      for (const pe of style.pseudoElements) {
        if (!ALLOWED_PE.includes(pe.selector)) continue; // Security: skip unknown
        cssBlock += `.${scopeClass}::${pe.selector} {\n`;
        const hasContent = pe.properties.some(p => p.name === 'content');
        if (!hasContent) cssBlock += `  content: '';\n`;
        for (const prop of pe.properties) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '}\n';
      }
    }

    if (style.responsive) {
      for (const r of style.responsive) {
        const bp = this.mapBreakpoint(r.breakpoint);
        cssBlock += `@media (max-width: ${bp}) {\n  .${scopeClass} {\n`;
        for (const prop of r.properties) {
          const cp = this.mapCSSProperty(prop.name);
          cssBlock += `    ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
        cssBlock += '  }\n}\n';
      }
    }

    // CSS Rules: .class { props }, tag { props }, @keyframes (raw)
    if (style.cssRules) {
      for (const rule of style.cssRules) {
        if (rule.selector === '__raw__') {
          cssBlock += rule.properties[0].value + '\n';
        } else {
          cssBlock += `${rule.selector} {\n`;
          for (const prop of rule.properties) {
            const cp = this.mapCSSProperty(prop.name);
            cssBlock += `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
          }
          cssBlock += '}\n';
        }
      }
    }

    this.css.push(cssBlock);
    return ''; // Style is applied via class, not inline
  }
  private compilePreset(preset: any): void {
    const className = 'nyx-p_' + preset.name;
    const props = preset.styles.map((s: any) => {
      const prop = this.mapCSSProperty(s.name);
      return prop + ': ' + this.resolveThemeValue(prop, s.value);
    }).join('; ');
    this.css.push('.' + className + ' { ' + props + '; }');
    this.presets.set(preset.name, className);
  }

  private compileTheme(theme: any): void {
    let fontCSS = '';
    for (const section of theme.sections) {
      if (section.name === 'fonts') {
        // Auto-apply fonts: heading → h1-h6, body → p,span,li,td,label,input,textarea,select
        const heading = section.entries['heading'];
        const body = section.entries['body'];
        if (heading) fontCSS += 'h1,h2,h3,h4,h5,h6{font-family:' + heading + ';}';
        if (body) fontCSS += 'body,p,span,li,td,label,input,textarea,select{font-family:' + body + ';}';
      } else {
        for (const [key, value] of Object.entries(section.entries)) {
          const fullKey = section.name + '-' + key;
          this.themeVars.set(fullKey, value as string);
          // Track color names for implicit resolution (e.g. 'primary' → 'colors-primary')
          this.themeColorNames.set(fullKey, fullKey);  // 'colors-primary' → 'colors-primary'
          this.themeColorNames.set(key, fullKey);      // 'primary' → 'colors-primary' (shorthand)
        }
      }
    }
    // Generate CSS custom properties
    let css = '';
    if (this.themeVars.size > 0) {
      css = ':root{';
      for (const [key, value] of this.themeVars) {
        css += '--' + key + ':' + value + ';';
      }
      css += '}';
    }
    if (fontCSS) css += fontCSS;
    if (css) {
      this.headInjections.push('<style>' + css + '</style>');
    }
  }

  // --- Form compilation ---

  private compileForm(form: FormStatement): string {
    const formId = 'form-' + form.name;
    let html = `${this.ind()}<form id="${formId}">\n`;
    this.indent++;

    for (const stmt of form.body) {
      if (stmt.type === 'Element') {
        const el = stmt as ElementNode;
        // Extract field name from content, add ID, suppress content rendering
        if (el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select') {
          const nameAttr = el.attributes.find((a: any) => a.name === 'name');
          let fieldName = '';
          if (nameAttr) {
            fieldName = typeof nameAttr.value === 'string' ? nameAttr.value : (nameAttr.value as any).value || '';
          } else if (el.content) {
            if (typeof el.content === 'string') fieldName = el.content;
            else if ((el.content as any).type === 'Identifier') fieldName = (el.content as any).name;
            else if ((el.content as any).type === 'StringLiteral') fieldName = (el.content as any).value;
          }
          // Strip content so it doesn't render as value=""
          if (el.content && (el.content as any).type === 'Identifier') {
            (el as any)._fieldName = fieldName; // save for later
            el.content = undefined as any;
          }
          if (fieldName && !el.attributes.find((a: any) => a.name === 'id')) {
            el.attributes.push({ name: 'id', value: formId + '-' + fieldName });
          }
          if (fieldName && !el.attributes.find((a: any) => a.name === 'name')) {
            el.attributes.push({ name: 'name', value: fieldName });
          }
        }
        if (el.tag === 'submit') {
          const text = (el.content && typeof el.content !== 'string' && el.content.type === 'StringLiteral') ? (el.content as any).value : 'Submit';
          html += `${this.ind()}<button type="submit" class="btn-p">${text}</button>\n`;
        } else {
          html += this.compileElement(el);
        }
      } else if (stmt.type === 'Style') {
        html += this.compileStyle(stmt as any);
      }
    }

    // Add feedback element
    html += `${this.ind()}<div id="${formId}-msg" class="form-msg"></div>\n`;

    this.indent--;
    html += `${this.ind()}</form>\n`;

    // Generate form submission JS
    if (form.action) {
      const successCode = this.compileFormAction(form.onSuccess || { kind: 'clear' });
      const errorCode = this.compileFormAction(form.onError || { kind: 'toast', value: 'Error' }, true);
      
      const authHeader = form.auth 
        ? "var tk=localStorage.getItem('token');if(tk)h['Authorization']='Bearer '+tk;" 
        : '';
      
      const fields: string[] = [];
      for (const s of form.body) {
        if (s.type !== 'Element') continue;
        const el = s as ElementNode;
        if (el.tag !== 'input' && el.tag !== 'textarea' && el.tag !== 'select') continue;
        // Field name comes from name attr or _fieldName (set during form compilation)
        const nameAttr = el.attributes.find((a: any) => a.name === 'name');
        let fieldName = (el as any)._fieldName || '';
        if (nameAttr) {
          fieldName = typeof nameAttr.value === 'string' ? nameAttr.value : (nameAttr.value as any).value || '';
        } else if (!fieldName && el.content) {
          if (typeof el.content === 'string') fieldName = el.content;
          else if ((el.content as any).type === 'Identifier') fieldName = (el.content as any).name;
          else if ((el.content as any).type === 'StringLiteral') fieldName = (el.content as any).value;
        }
        if (fieldName) fields.push(fieldName);
      }

      // Build body from input IDs  
      const bodyParts = fields.map((f: string) => "'" + f + "':document.getElementById('" + formId + "-" + f + "').value").join(',');
      
      this.scripts.push(
        `document.getElementById('${formId}').onsubmit=async function(e){e.preventDefault();` +
        `var h={'Content-Type':'application/json'};${authHeader}` +
        `var msg=document.getElementById('${formId}-msg');` +
        `try{var r=await fetch('${form.action}',{method:'POST',headers:h,body:JSON.stringify({${bodyParts}})});` +
        `var d=await r.json();if(r.ok){${successCode}}else{msg.textContent=d.error||'Error';msg.style.color='#f06'}}` +
        `catch(err){${errorCode}}}`
      );
      
      // Add IDs to form inputs
      html = html.replace(/<(input|textarea|select)/g, (match: string) => {
        return match; // IDs are handled via name attributes
      });
    }

    return html;
  }

  private compileFormAction(action: { kind: string; value?: string }, isError = false): string {
    switch (action.kind) {
      case 'reload': return 'location.reload()';
      case 'redirect': return "location.href='" + (action.value || '/') + "'";
      case 'clear': return "this.reset();msg.textContent='Done!';msg.style.color='#4ade80'";
      case 'toast': return "msg.textContent='" + (action.value || (isError ? 'Error' : 'Done!')) + "';msg.style.color='" + (isError ? '#f06' : '#4ade80') + "'";
      default: return '';
    }
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

    // Fill in defaults for missing props
    for (const propDef of comp.props) {
      if (propDef.defaultValue !== undefined && !(propDef.name in props)) {
        props[propDef.name] = propDef.defaultValue;
      }
    }

    // Style dedup: reuse class if identical style already emitted
    let scopeClass = "";
    const styleStmt = comp.body.find(s => s.type === "Style") as StyleBlock | undefined;
    if (styleStmt) {
      const hash = this.hashStyle(styleStmt);
      const cached = this.styleCache.get(hash);
      if (cached) {
        scopeClass = cached;
      } else {
        scopeClass = `nyx-${this.nextId("c")}`;
        this.compileStyleWithClass(styleStmt, scopeClass);
        this.styleCache.set(hash, scopeClass);
      }
    } else {
      scopeClass = `nyx-${this.nextId("c")}`;
    }

    // Compile children passed to this component (for slot substitution)
    let slotHtml = '';
    if (el.children.length > 0) {
      for (const child of el.children) {
        slotHtml += this.compileStatement(child);
      }
    }

    // Compile component body, substituting prop references
    let html = `${this.ind()}<div class="${scopeClass}">\n`;
    this.indent++;

    for (const stmt of comp.body) {
      if (stmt.type === 'Style') continue; // Already handled
      // Slot: replace with children from parent invocation
      if (stmt.type === 'Element' && (stmt as ElementNode).tag === 'slot') {
        if (slotHtml) {
          html += slotHtml;
        }
        continue;
      }
      if (stmt.type === 'Element') {
        html += this.compileElementWithProps(stmt as ElementNode, props, slotHtml);
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
  private compileElementWithProps(el: ElementNode, props: Record<string, string>, slotHtml?: string): string {
    // Slot substitution: if this element IS a slot, return the slot content
    if (el.tag === 'slot' && slotHtml) {
      return slotHtml;
    }
    const tag = this.mapTag(el.tag);

    // Track interactive elements for CSS defaults injection
    const INTERACTIVE_ELEMENTS = new Set(['button', 'input', 'select', 'textarea', 'a']);
    if (INTERACTIVE_ELEMENTS.has(tag)) {
      this.usedInteractiveElements.add(tag);
    }

    let content = '';

    if (el.content) {
      if (typeof el.content === 'string') {
        content = this.escapeContent(el.content);
      } else if (el.content.type === 'StringLiteral') {
        content = this.escapeContent((el.content as any).value);
      } else if (el.content.type === 'PropertyAccess') {
        const propName = (el.content as any).path.replace(/^\./, '');
        content = this.escapeContent(props[propName] ?? '');
      } else if (el.content.type === 'Identifier') {
        const name = (el.content as any).name;
        if (props[name]) {
          content = this.escapeContent(props[name]);
        } else {
          content = this.compileContent(el.content);
        }
      } else {
        content = this.compileContent(el.content);
      }
    }

    // Check for style block in children — generates scoped class (same as compileElement)
    let scopeClass = '';
    const styleChild = el.children.find(c => c.type === 'Style') as StyleBlock | undefined;
    if (styleChild) {
      scopeClass = `nyx-${this.nextId('s')}`;
      this.compileStyleWithClass(styleChild, scopeClass);
    }

    // Build attributes, substituting prop references in values
    let filteredAttrs = el.attributes.map(a => {
      let val = a.value;
      if (typeof val === 'string') {
        for (const [propName, propVal] of Object.entries(props)) {
          if (val === '.' + propName) {
            val = propVal;
          }
        }
      }
      return { name: a.name, value: val };
    });

    // Layout shorthand attributes → inline style generation (same as compileElement)
    const LAYOUT_ATTRS = new Set(['flex', 'grid', 'gap', 'center', 'between', 'around', 'evenly', 'wrap', 'nowrap', 'cols', 'rows', 'place']);
    const extraStyles: string[] = [];
    for (const attr of filteredAttrs) {
      if (attr.name === 'flex') {
        extraStyles.push('display:flex');
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (v === 'col' || v === 'column') extraStyles.push('flex-direction:column');
        else if (v === 'row') extraStyles.push('flex-direction:row');
        else if (v === 'wrap') extraStyles.push('flex-wrap:wrap');
      } else if (attr.name === 'grid') {
        extraStyles.push('display:grid');
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (/^\d+$/.test(v)) extraStyles.push(`grid-template-columns:repeat(${v},1fr)`);
        else if (v) extraStyles.push(`grid-template-columns:${v}`);
      } else if (attr.name === 'gap') {
        extraStyles.push(`gap:${attr.value}`);
      } else if (attr.name === 'center') {
        extraStyles.push('align-items:center', 'justify-content:center');
      } else if (attr.name === 'between') {
        extraStyles.push('justify-content:space-between');
      } else if (attr.name === 'around') {
        extraStyles.push('justify-content:space-around');
      } else if (attr.name === 'evenly') {
        extraStyles.push('justify-content:space-evenly');
      } else if (attr.name === 'wrap') {
        extraStyles.push('flex-wrap:wrap');
      } else if (attr.name === 'place') {
        const v = typeof attr.value === 'string' ? attr.value : '';
        if (v === 'center') extraStyles.push('place-items:center');
        else if (v) extraStyles.push(`place-items:${v}`);
      }
    }
    filteredAttrs = filteredAttrs.filter(a => !LAYOUT_ATTRS.has(a.name));
    if (extraStyles.length > 0) {
      const extraStyle = extraStyles.join(';');
      const existingStyle = filteredAttrs.find(a => a.name === 'style');
      if (existingStyle) {
        existingStyle.value = extraStyle + ';' + existingStyle.value;
      } else {
        filteredAttrs.push({ name: 'style', value: extraStyle });
      }
    }

    // Handle preset= attribute → add preset CSS class
    let presetClass = '';
    const presetAttr = filteredAttrs.find(a => a.name === 'preset');
    if (presetAttr) {
      const presetName = typeof presetAttr.value === 'string' ? presetAttr.value : '';
      if (this.presets.has(presetName)) {
        presetClass = this.presets.get(presetName)!;
      }
    }
    filteredAttrs = filteredAttrs.filter(a => a.name !== 'preset');

    // For link elements with internal href, add data-navigate for SPA routing
    // Skip in static mode — links are plain <a href> without JS
    if (el.tag === 'link' && !this.staticMode) {
      const hrefAttr = filteredAttrs.find(a => a.name === 'href');
      if (hrefAttr && typeof hrefAttr.value === 'string' && hrefAttr.value.startsWith('/')) {
        filteredAttrs.push({ name: 'data-navigate', value: hrefAttr.value });
      }
    }

    // Expand inline style shorthands (v0.8.1)
    for (const attr of filteredAttrs) {
      if (attr.name === 'style' && typeof attr.value === 'string') {
        attr.value = this.expandInlineShorthands(attr.value);
      }
    }

    let attrs = this.compileAttributes(filteredAttrs);
    const classes = [scopeClass, presetClass].filter(Boolean).join(' ');
    if (classes) {
      attrs = ` class="${classes}"${attrs}`;
    }

    // Filter out style blocks from children, recurse into the rest
    const nonStyleChildren = el.children.filter(c => c.type !== 'Style');
    const children = nonStyleChildren.map(c => {
      if (c.type === 'Element') return this.compileElementWithProps(c as ElementNode, props, slotHtml);
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

    const headExtra = this.headInjections.length > 0 ? '\n  ' + this.headInjections.join('\n  ') : '';
    const animCSS = this.animations.length > 0 ? '\n    ' + this.animations.join('\n    ') : '';
    const elementDefaults = this.buildElementDefaults();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="generator" content="NyxCode v${NYXCODE_VERSION}">
  ${headExtra.includes('<title>') ? '' : '<title>NyxCode App</title>'}${headExtra}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }${animCSS}${elementDefaults}
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
${this.scripts.length > 0 ? '<script>' + this.scripts.join(';') + '</script>' : ''}
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

  /**
   * Map a property name AND resolve theme colors in the value.
   * Convenience method: combines mapCSSProperty + resolveThemeValue.
   */
  private resolvePropValue(propName: string, value: string): { prop: string; value: string } {
    const prop = this.mapCSSProperty(propName);
    return { prop, value: this.resolveThemeValue(prop, value) };
  }

  /**
   * Resolve implicit theme color references.
   * If a CSS value matches a known theme color name (e.g. 'text-muted', 'primary'),
   * auto-wrap it in var(--section-name). Saves ~16 chars per usage.
   * Only applies to color-accepting properties.
   */
  private resolveThemeValue(cssProperty: string, value: string): string {
    if (this.themeColorNames.size === 0) return value;
    // Only resolve for color-accepting properties
    const colorProps = new Set([
      'color', 'background', 'background-color', 'border-color',
      'fill', 'stroke', 'outline-color', 'text-decoration-color',
      'caret-color', 'column-rule-color', 'accent-color',
      'border', 'box-shadow', 'text-shadow',
    ]);
    if (!colorProps.has(cssProperty)) return value;
    // Simple case: entire value is a theme color name
    const fullKey = this.themeColorNames.get(value.trim());
    if (fullKey) {
      return `var(--${fullKey})`;
    }
    // Complex case: scan for theme color names inside compound values
    // (gradients, borders, shadows). Replace word-boundary matches.
    if (value.includes(' ') || value.includes(',') || value.includes('(')) {
      let result = value;
      // Sort by length descending so 'accent-subtle' matches before 'accent'
      const names = [...this.themeColorNames.keys()].sort((a, b) => b.length - a.length);
      for (const name of names) {
        // Skip single-char or too-short names that might collide with CSS keywords
        if (name.length < 2) continue;
        // Use word-boundary regex to avoid partial matches
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(?<![#\\w-])${escaped}(?![\\w-])`, 'g');
        const resolvedKey = this.themeColorNames.get(name)!;
        result = result.replace(re, `var(--${resolvedKey})`);
      }
      return result;
    }
    return value;
  }

  private mapCSSProperty(name: string): string {
    const mapping: Record<string, string> = {
      // Layout
      'bg': 'background',
      'bgc': 'background-color',
      'bgi': 'background-image',
      'r': 'border-radius',
      'radius': 'border-radius',
      'shadow': 'box-shadow',
      'op': 'opacity',
      'z': 'z-index',
      'pos': 'position',
      
      // Spacing
      'p': 'padding',
      'pt': 'padding-top',
      'pr': 'padding-right',
      'pb': 'padding-bottom',
      'pl': 'padding-left',
      'px': 'padding-inline',
      'py': 'padding-block',
      'm': 'margin',
      'mt': 'margin-top',
      'mr': 'margin-right',
      'mb': 'margin-bottom',
      'ml': 'margin-left',
      'mx': 'margin-inline',
      'my': 'margin-block',
      'gap': 'gap',
      
      // Sizing
      'w': 'width',
      'h': 'height',
      'minw': 'min-width',
      'maxw': 'max-width',
      'minh': 'min-height',
      'maxh': 'max-height',
      
      // Typography
      'fs': 'font-size',
      'fw': 'font-weight',
      'ff': 'font-family',
      'lh': 'line-height',
      'ls': 'letter-spacing',
      'ta': 'text-align',
      'td': 'text-decoration',
      'tt': 'text-transform',
      'ws': 'white-space',
      'c': 'color',
      
      // Borders
      'border': 'border',
      'bt': 'border-top',
      'br': 'border-right',
      'bb': 'border-bottom',
      'bl': 'border-left',
      'bc': 'border-color',
      'bw': 'border-width',
      
      // Flexbox
      'ai': 'align-items',
      'jc': 'justify-content',
      'ac': 'align-content',
      'as': 'align-self',
      'fd': 'flex-direction',
      'fw2': 'flex-wrap',
      'fg': 'flex-grow',
      'fs2': 'flex-shrink',
      'fb': 'flex-basis',
      
      // Grid
      'gc': 'grid-column',
      'gr': 'grid-row',
      'gtc': 'grid-template-columns',
      'gtr': 'grid-template-rows',
      
      // Display
      'd': 'display',
      'of': 'overflow',
      'ofx': 'overflow-x',
      'ofy': 'overflow-y',
      'v': 'visibility',
      'cur': 'cursor',
      
      // Transforms & Transitions  
      'tf': 'transform',
      'tr': 'transition',
      'anim': 'animation',
      
      // Legacy (keep working)
      'text': 'color',
      'content': 'content',
      'padding': 'padding',
      'margin': 'margin',
    };
    return mapping[name] || name;
  }

  /**
   * Expand CSS shorthands in inline style="..." attributes.
   * Splits by `;`, expands each property name via mapCSSProperty.
   */
  private expandInlineShorthands(style: string): string {
    return style.split(';').map(part => {
      const colonIdx = part.indexOf(':');
      if (colonIdx === -1) return part;
      const prop = part.substring(0, colonIdx).trim();
      const value = part.substring(colonIdx + 1).trim();
      if (!prop) return part;
      const mappedProp = this.mapCSSProperty(prop);
      return ` ${mappedProp}:${this.resolveThemeValue(mappedProp, value)}`;
    }).join(';').trim();
  }
  /**
   * Generate CSS defaults for interactive elements (button, input, select, textarea, a).
   * Only includes rules for elements actually used on the page (tree-shaken).
   * Lower specificity than scoped styles, so user styles override automatically.
   */
  private buildElementDefaults(): string {
    if (this.usedInteractiveElements.size === 0) return '';

    let css = '\n    /* NyxCode Element Defaults */\n';

    if (this.usedInteractiveElements.has('button')) {
      css += '    :where(button) { font-family: inherit; font-size: inherit; padding: 0.5rem 1rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: #1a1a2e; color: inherit; cursor: pointer; transition: opacity 0.15s; }\n';
      css += '    :where(button):hover { opacity: 0.85; }\n';
    }
    if (this.usedInteractiveElements.has('input') || this.usedInteractiveElements.has('select') || this.usedInteractiveElements.has('textarea')) {
      const selectors: string[] = [];
      if (this.usedInteractiveElements.has('input')) selectors.push(':where(input)');
      if (this.usedInteractiveElements.has('select')) selectors.push(':where(select)');
      if (this.usedInteractiveElements.has('textarea')) selectors.push(':where(textarea)');
      css += `    ${selectors.join(', ')} { font-family: inherit; font-size: inherit; padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: #0d0d1a; color: inherit; }\n`;
    }
    if (this.usedInteractiveElements.has('a')) {
      css += '    :where(a) { color: #667eea; text-decoration: none; }\n';
      css += '    :where(a):hover { text-decoration: underline; }\n';
    }

    return css;
  }

  /** Generate a hash string from style block properties for dedup */
  private hashStyle(style: StyleBlock): string {
    let key = style.properties.map(p => `${p.name}:${p.value}`).join(';');
    if (style.hover) key += '|h:' + style.hover.map(p => `${p.name}:${p.value}`).join(';');
    if (style.focus) key += '|f:' + style.focus.map(p => `${p.name}:${p.value}`).join(';');
    if (style.active) key += '|a:' + style.active.map(p => `${p.name}:${p.value}`).join(';');
    if (style.pseudoElements) key += '|pe:' + style.pseudoElements.map(pe => pe.selector + ':' + pe.properties.map(p => `${p.name}:${p.value}`).join(';')).join('|');
    if (style.responsive) key += '|r:' + style.responsive.map(r => r.breakpoint + ':' + r.properties.map(p => `${p.name}:${p.value}`).join(';')).join('|');
    return key;
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
          const [lhs, ...rhsParts] = action.split('=');
          const rhs = rhsParts.join('=').trim();
          const rhsResolved = this.resolveStateRefs(rhs);
          // Use single quotes for strings inside onclick (which uses double quotes)
          const rhsFinal = rhsResolved.replace(/"/g, "'");
          return `__nyx.state.${lhs.trim()} = ${rhsFinal}`;
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

  private escapeContent(str: string): string {
    // Replace __version__ with actual NyxCode version
    let result = str.replace(/__version__/g, NYXCODE_VERSION);
    // For text content between tags, quotes don't need escaping
    return result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private isVoidElement(tag: string): boolean {
    return ['input', 'img', 'br', 'hr', 'meta', 'link'].includes(tag);
  }

  private nextId(prefix: string): string {
    return `${prefix}_${++this.componentId}`;
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
