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
  HeadStatement, AnimateStatement, LayoutNode, StoreNode, KeyframesNode,
} from './ast.js';

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nearestMatches, didYouMean } from './suggest.js';

let NYXCODE_VERSION = '0.0.0';
try {
  const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  NYXCODE_VERSION = JSON.parse(readFileSync(pkgPath, 'utf-8')).version;
} catch {
  NYXCODE_VERSION = '0.16.4'; // fallback
}

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
  // v0.24.0 nav-burger: one CSS block per breakpoint, emitted once per build.
  private burgerBreakpointsEmitted: Set<string> = new Set();
  private computedVars: Map<string, string> = new Map(); // name -> expression
  private refNames: string[] = [];
  private stores: Map<string, { fields: Array<{name: string, value?: string, isAction: boolean, actionBody?: string}>, computed: Array<{name: string, expression: string}> }> = new Map();
  private effects: string[] = [];
  private hasReactivity: boolean = false;
  private components: Map<string, ComponentNode> = new Map();
  private importResolver?: (path: string) => Program | null;
  private headInjections: string[] = [];
  private globalHeadInjections: string[] = []; // From top-level `meta {}` or `head "..."` blocks — shared across all pages
  private themeVars: Map<string, string> = new Map();
  private darkThemeVars: Map<string, string> = new Map(); // dark mode overrides
  // v0.23.0 — registry of named base themes: `@theme as "name" { ... }`
  private namedThemes: Map<string, any[]> = new Map();
  // v0.23.0 — current source file path (used to resolve `@theme extends "./..."`)
  private currentSourcePath: string | null = null;
  private googleFonts: string[] = []; // Google Font family names to inject
  private googleFontsInjected: boolean = false; // prevent double injection
  private themeColorNames: Map<string, string> = new Map(); // value name → full CSS var name (e.g. 'primary' → 'colors-primary')
  private presets: Map<string, string> = new Map(); // preset name → CSS class name
  private scripts: string[] = [];
  private animations: string[] = [];
  // v0.25.0 #110 — top-level `keyframes name { ... }` blocks. Shared across all pages
  // (NOT reset per-page) because the syntax is a program-level declaration.
  private topLevelKeyframes: Map<string, string> = new Map(); // name -> complete @keyframes CSS block
  private footnotesStyleInjected: boolean = false;
  private svgDepth: number = 0;  // Tracks nesting inside <svg> so SVG-specific tags (text, title) aren't remapped to HTML (#62)
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
    // v0.23.0: named themes (`theme as "name"`) must be processed first so that extending
    // themes can resolve against them. Light/dark/extends/preset all come after.
    const themes = program.body.filter(n => n.type === 'Theme');
    const namedThemeNodes = themes.filter((t: any) => t.name);
    const regularThemeNodes = themes.filter((t: any) => !t.name);
    for (const theme of namedThemeNodes) this.compileTheme(theme);
    for (const theme of regularThemeNodes) this.compileTheme(theme);
    // Save all theme-related head injections (light :root, dark mode, Google Fonts)
    const themeHeadInjections = [...this.headInjections];

    // v0.25.0 #110 — process top-level `keyframes name { ... }` blocks.
    // Placed after themes so theme tokens resolve inside keyframe values, and
    // before pages so they appear in the CSS output ahead of page styles.
    for (const node of program.body) {
      if (node.type === 'Keyframes') this.processTopLevelKeyframes(node as KeyframesNode);
    }

    // Process preset blocks
    for (const node of program.body) {
      if (node.type === 'Preset') this.compilePreset(node as any);
    }

    // Process store blocks — global reactive state across pages
    for (const node of program.body) {
      if (node.type === 'Store') this.processStore(node as any);
    }

    // Collect top-level `meta {}` (parsed as Head) nodes — apply to ALL pages
    for (const node of program.body) {
      if (node.type === 'Head') {
        this.globalHeadInjections.push((node as HeadStatement).content);
      }
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
      // Prepend all theme head injections (light :root, dark mode, Google Fonts)
      layoutHeadInjections.unshift(...themeHeadInjections);
      layoutInteractiveElements = new Set(this.usedInteractiveElements);
    } else {
      // BUG #90 fix: when there is NO layout, theme head injections (:root {}, dark mode,
      // Google Fonts) were dropped for multi-page builds. Each page would reset headInjections
      // to just layoutHeadInjections (empty) + globalHeadInjections, losing the theme <style>
      // block. Result: all var(--colors-*) references resolved to browser defaults.
      //
      // Fix: when no layout, seed layoutHeadInjections with the theme injections so every page
      // inherits them. Single-page builds previously worked by accident (theme injections were
      // still in this.headInjections from compileTheme and never reset before emit).
      layoutHeadInjections = [...themeHeadInjections];
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
      this.headInjections = [...layoutHeadInjections, ...this.globalHeadInjections]; // Start with layout + global (top-level meta/head) injections
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

    // Process theme blocks — named first so extends can resolve them (v0.23.0)
    for (const node of program.body) {
      if (node.type === 'Theme' && (node as any).name) this.compileTheme(node);
    }
    for (const node of program.body) {
      if (node.type === 'Theme' && !(node as any).name) this.compileTheme(node);
    }

    // v0.25.0 #110 — top-level `keyframes name { ... }` blocks (after themes, before styles).
    for (const node of program.body) {
      if (node.type === 'Keyframes') this.processTopLevelKeyframes(node as KeyframesNode);
    }

    // Process preset blocks
    for (const node of program.body) {
      if (node.type === 'Preset') this.compilePreset(node as any);
    }

    // Process store blocks — global reactive state
    for (const node of program.body) {
      if (node.type === 'Store') this.processStore(node as any);
    }

    // Collect top-level `meta {}` and `head` nodes — they apply to ALL pages
    for (const node of program.body) {
      if (node.type === 'Head') {
        this.globalHeadInjections.push((node as HeadStatement).content);
      }
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

    // Prepend global head injections (from top-level `meta {}`) before page compilation
    // so they appear in the final <head>.
    if (this.globalHeadInjections.length > 0) {
      this.headInjections.push(...this.globalHeadInjections);
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

    // Issue #97: dedupe singleton meta tags so page-level `meta {}` overrides site-level.
    const dedupedInjections = this.dedupeHeadInjections(this.headInjections);
    const headExtra = dedupedInjections.length > 0 ? '\n  ' + dedupedInjections.join('\n  ') : '';
    const topLevelKfCSS = this.topLevelKeyframes.size > 0 ? '\n    ' + [...this.topLevelKeyframes.values()].join('\n    ').trimEnd() : '';
    const animCSS = (this.animations.length > 0 ? '\n    ' + this.animations.join('\n    ') : '') + topLevelKfCSS;
    const elementDefaults = this.buildElementDefaults();

    // Dedup defaults against user-provided meta {} tags
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(headExtra);
    const hasGenerator = /<meta[^>]+name=["']generator["']/i.test(headExtra);
    const hasTitle = headExtra.includes('<title>');
    const hasDescription = /<meta[^>]+name=["']description["']/i.test(headExtra);
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(headExtra);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">${hasViewport ? '' : '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">'}${hasGenerator ? '' : `\n  <meta name="generator" content="NyxCode v${NYXCODE_VERSION}">`}${hasTitle ? '' : `\n  <title>NyxCode - ${this.escapeHtml(pageTitle)}</title>`}${hasDescription ? '' : `\n  <meta name="description" content="NyxCode documentation - ${this.escapeHtml(pageTitle)}">`}` + headExtra + `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :where(body) { font-family: system-ui, -apple-system, sans-serif; }` + animCSS + elementDefaults + `
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
  </script>` : '') + (this.scripts.length > 0 ? `\n<script>${this.refNames.length > 0 ? 'const refs=new Proxy({},{get:(_,n)=>document.getElementById("__nyx_ref_"+n)});' : ''}${this.scripts.join(';')}</script>` : '') + `
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
      case 'Script': {
        const sc = (stmt as ScriptStatement).content;
        if (sc.startsWith('__nyx_onMount:')) {
          this.scripts.push(`document.addEventListener('DOMContentLoaded',()=>{${sc.slice(14)}})`);
        } else if (sc.startsWith('__nyx_onDestroy:')) {
          this.scripts.push(`window.addEventListener('beforeunload',()=>{${sc.slice(16)}})`);
        } else {
          this.scripts.push(sc);
        }
        return '';
      }
      case 'Preset': this.compilePreset(stmt as any); return '';
      case 'Auth': return ''; // Auth is handled at build level
      case 'On': return ''; // Events compiled with their parent element
      case 'State': return this.compileState(stmt as StateStatement);
      case 'Effect': return this.compileEffect(stmt as EffectStatement);
      case 'Computed': return this.compileComputed(stmt as ComputedStatement);
      case 'Head': this.headInjections.push((stmt as HeadStatement).content); return '';
      case 'Animate': this.animations.push(`@keyframes ${(stmt as AnimateStatement).name} { ${(stmt as AnimateStatement).content} }`); return '';
      case 'Footnotes': return this.compileFootnotes(stmt as any);
      default: return '';
    }
  }

  /** Render `footnotes { 1 "..." }` block to an <ol> with backlinks. (#68) */
  private compileFootnotes(stmt: { entries: Array<{ id: string; content: string }> }): string {
    if (!stmt.entries.length) return '';
    // Register scoped CSS for footnote styling once
    if (!this.footnotesStyleInjected) {
      this.css.push(`.nyx-footnotes{margin-top:3rem;padding-top:1.5rem;border-top:1px solid currentColor;font-size:0.875rem;opacity:0.85}
.nyx-footnotes ol{list-style:decimal;padding-left:1.5rem}
.nyx-footnotes li{margin-bottom:0.5rem}
.nyx-footnotes a.nyx-fnback{margin-left:0.4em;text-decoration:none;opacity:0.6}
.nyx-footnotes a.nyx-fnback:hover{opacity:1}
.nyx-fnref a{text-decoration:none}`);
      this.footnotesStyleInjected = true;
    }
    const items = stmt.entries.map(e => {
      const content = this.escapeContent(e.content);
      return `<li id="fn-${e.id}">${content} <a href="#fnref-${e.id}" class="nyx-fnback" aria-label="Back to reference">↩</a></li>`;
    }).join('\n');
    return `<aside class="nyx-footnotes" role="doc-endnotes"><ol>${items}</ol></aside>`;
  }

  // --- Element compilation ---

  private compileElement(el: ElementNode): string {
    // Track SVG nesting so 'text', 'title', 'filter' etc. inside SVG don't get HTML-remapped (#62)
    const enteringSvg = el.tag === 'svg';
    if (enteringSvg) this.svgDepth++;
    try {
      return this._compileElementBody(el);
    } finally {
      if (enteringSvg) this.svgDepth--;
    }
  }

  private _compileElementBody(el: ElementNode): string {
    // In layout mode: replace slot with page content at ANY depth
    if (el.tag === 'slot' && this.layoutSlotContent !== null) {
      return this.layoutSlotContent;
    }

    // Check if this element is a component invocation (e.g., Header title="My App")
    if (this.components.has(el.tag)) {
      return this.compileComponentUsage(el);
    }

    // ===== v0.24.0: nav burger =====
    // Intercept `<nav>` elements that carry a `burger` attribute and rewrite
    // them into a zero-JS <details>/<summary>/<nav> collapsible pattern.
    // Spec consolidation: Issue #96, reviewed by Kiro (design) + Tyto (a11y).
    if (el.tag === 'nav' && el.attributes.some(a => a.name === 'burger')) {
      return this.compileBurgerNav(el);
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
      const colVal = cols?.value || '3';
      if (typeof colVal === 'string' && colVal.includes('@')) {
        const [desktop, mobile] = colVal.split('@');
        extraStyles.push(`display:grid`, `grid-template-columns:repeat(${desktop},1fr)`);
        const respClass = `nyx-r_${this.nextId('r')}`;
        const mobileCols = /^\d+$/.test(mobile) ? `repeat(${mobile},1fr)` : mobile;
        this.css.push(`@media(max-width:768px){.${respClass}{grid-template-columns:${mobileCols}!important}}`);
        if (!scopeClass) { scopeClass = respClass; } else { scopeClass += ' ' + respClass; }
      } else {
        extraStyles.push(`display:grid`, `grid-template-columns:repeat(${colVal},1fr)`);
      }
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
        // Responsive shorthand: grid=3@1 → 3 cols desktop, 1 col mobile
        if (v.includes('@')) {
          const [desktop, mobile] = v.split('@');
          if (/^\d+$/.test(desktop)) extraStyles.push(`grid-template-columns:repeat(${desktop},1fr)`);
          else extraStyles.push(`grid-template-columns:${desktop}`);
          // Generate responsive class
          const respClass = `nyx-r_${this.nextId('r')}`;
          const mobileCols = /^\d+$/.test(mobile) ? `repeat(${mobile},1fr)` : mobile;
          this.css.push(`@media(max-width:768px){.${respClass}{grid-template-columns:${mobileCols}!important}}`);
          if (!scopeClass) { scopeClass = respClass; } else { scopeClass += ' ' + respClass; }
        } else if (/^\d+$/.test(v)) extraStyles.push(`grid-template-columns:repeat(${v},1fr)`);
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

    // Auto-inject loading="lazy" on img elements (unless explicitly set)
    if (tag === 'img' && !nonPresetAttrs.some(a => a.name === 'loading')) {
      nonPresetAttrs.push({ name: 'loading', value: 'lazy' });
    }

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

    // Handle template bindings: content with __NYX_TPL: (mixed text + reactive vars)
    if (content.startsWith('__NYX_TPL:')) {
      const tpl = content.replace('__NYX_TPL:', '');
      // Escape for HTML attribute (double-encode the template markers)
      const attrSafe = tpl.replace(/"/g, '&quot;');
      return `${this.ind()}<${tag}${attrs} data-nyx-tpl="${attrSafe}"></${tag}>\n`;
    }

    if (this.isVoidElement(tag)) {
      const contentAttr = tag === 'img' ? 'alt' : 'value';
      return `${this.ind()}<${tag}${attrs}${content ? ` ${contentAttr}="${this.escapeHtml(content)}"` : ''} />\n`;
    }

    if (children) {
      return `${this.ind()}<${tag}${attrs}>\n${this.indented(() => children)}${this.ind()}</${tag}>\n`;
    }

    return `${this.ind()}<${tag}${attrs}>${content}</${tag}>\n`;
  }

  /**
   * v0.24.0: Compile a `<nav burger>` element into a zero-JS collapsible.
   *
   * Input AST:   `<nav burger [=<breakpoint>] [icon="..."] [aria-label="..."]> ... </nav>`
   * Output HTML: `<details class="nx-burger">
   *                 <summary aria-label="Toggle menu">
   *                   <span class="nx-burger-closed">Menu|icon</span>
   *                   <span class="nx-burger-open" aria-hidden="true">Close</span>
   *                 </summary>
   *                 <nav aria-label="Main navigation"> ...children... </nav>
   *               </details>`
   *
   * Responsive CSS (once per build):
   *   - `<summary>` is hidden above the burger breakpoint; inner `<nav>` is always visible.
   *   - `<summary>` is shown below the breakpoint; inner `<nav>` only when `details[open]`.
   *
   * State-correct labels (Tyto 🦉 catch): the summary label stays neutral
   * ("Toggle menu"), while two spans flip via CSS `[open]` so visible and
   * screen-reader users both see accurate state.
   *
   * Spec: Issue #96. Design review: @Kiro-Rudel. A11y/security: @Alex-Yumi (Tyto).
   */
  private compileBurgerNav(el: ElementNode): string {
    // ----- Parse the burger attributes -----
    const burgerAttr = el.attributes.find(a => a.name === 'burger')!;
    const iconAttr   = el.attributes.find(a => a.name === 'icon');
    const navAriaAttr = el.attributes.find(a => a.name === 'aria-label');
    const sumAriaAttr = el.attributes.find(a => a.name === 'summary-aria-label');
    const openLabelAttr = el.attributes.find(a => a.name === 'open-label');

    // Breakpoint: `burger` (bare) defaults to 768px; `burger=<token>` looks up theme.breakpoints
    let breakpointPx = 768;
    const burgerVal = typeof burgerAttr.value === 'string' ? burgerAttr.value : '';
    if (burgerVal && burgerVal !== 'true') {
      const themed = this.themeVars.get('breakpoints-' + burgerVal);
      if (themed) {
        // Strip units ("768px" -> 768)
        const n = parseInt(String(themed), 10);
        if (!isNaN(n)) breakpointPx = n;
      } else {
        // v0.23.3-style did-you-mean for unknown breakpoint tokens
        const available: string[] = [];
        for (const k of this.themeVars.keys()) {
          if (k.startsWith('breakpoints-')) available.push(k.substring('breakpoints-'.length));
        }
        if (available.length > 0) {
          const matches = nearestMatches(burgerVal, available, 1);
          const hint = matches.length > 0
            ? ` Did you mean '${matches[0]}'?`
            : ` Available: ${available.join(', ')}.`;
          throw new Error(`nav burger: unknown breakpoint '${burgerVal}'.${hint}`);
        } else {
          throw new Error(
            `nav burger: breakpoint '${burgerVal}' requires theme.breakpoints.${burgerVal} to be defined. ` +
            `Either add it to your @theme or use the default bare 'burger' attribute (768px).`
          );
        }
      }
    }

    // Nested-nav warning (Kiro 🐺 point A): if a child <nav> exists, likely mistake
    const hasNestedNav = el.children.some(c =>
      c.type === 'Element' && (c as ElementNode).tag === 'nav'
    );
    if (hasNestedNav) {
      // Emit as HTML comment to surface in built output; also console.warn at compile time.
      console.warn(
        `\x1b[33m⚠️  nav burger contains a nested <nav>. The inner <nav> will render verbatim — probably not what you want.\x1b[0m`
      );
    }

    // Icon / label values (sanitized for HTML content). `icon` replaces the
    // "Menu" text of the closed-state span; defaults to visible text "Menu".
    const closedLabel = iconAttr && typeof iconAttr.value === 'string'
      ? this.escapeHtml(iconAttr.value)
      : 'Menu';
    const openLabel = openLabelAttr && typeof openLabelAttr.value === 'string'
      ? this.escapeHtml(openLabelAttr.value)
      : 'Close';
    const summaryAria = sumAriaAttr && typeof sumAriaAttr.value === 'string'
      ? this.escapeHtml(sumAriaAttr.value)
      : 'Toggle menu';
    const navAria = navAriaAttr && typeof navAriaAttr.value === 'string'
      ? this.escapeHtml(navAriaAttr.value)
      : 'Main navigation';

    // ----- Emit the responsive CSS once per breakpoint -----
    // We use a stable class name (`nx-burger`) plus a unique id per breakpoint
    // so multiple `nav burger` elements with different breakpoints coexist.
    const bpKey = `nx-burger-bp-${breakpointPx}`;
    if (!this.burgerBreakpointsEmitted.has(bpKey)) {
      this.burgerBreakpointsEmitted.add(bpKey);
      // Base: everything is hidden; the inner <nav> is only visible at desktop sizes
      // or when <details> is open on mobile.
      const baseCss =
        `.nx-burger-desktop{display:flex;gap:1.5rem;align-items:center}` +
        `.nx-burger-mobile{display:none}` +
        `.nx-burger-mobile>summary{cursor:pointer;list-style:none;user-select:none}` +
        `.nx-burger-mobile>summary::-webkit-details-marker{display:none}` +
        `.nx-burger-mobile>nav{display:flex;gap:1.5rem;align-items:center}` +
        `.${bpKey}>summary{}` +
        // Dual-span state-correct labels (Tyto)
        `.nx-burger-mobile .nx-burger-open{display:none}` +
        `.nx-burger-mobile[open] .nx-burger-closed{display:none}` +
        `.nx-burger-mobile[open] .nx-burger-open{display:inline}`;
      this.css.push(baseCss);

      // Responsive: below breakpoint, show summary, hide nav unless open.
      // Body-scroll-lock (Issue #98): when the burger is open at mobile sizes,
      // lock scroll on html+body so the background doesn't scroll on iOS Safari.
      // Zero-JS — pure CSS via `:has()` (95%+ browser support, required for iOS 15.4+).
      // Both `html` and `body` get `overflow:hidden` because iOS Safari needs html
      // locked to fully stop rubber-band scrolling; `overscroll-behavior:contain`
      // prevents scroll-chaining into the body when the nav itself overflows.
      const respCss =
        `@media(max-width:${breakpointPx}px){` +
        `.nx-burger-desktop{display:none}` +
        `.nx-burger-mobile{display:block}` +
        `.${bpKey}>summary{display:inline-block;padding:.5rem 1rem}` +
        `.${bpKey}>nav{display:none;flex-direction:column;gap:1rem;padding:1rem}` +
        `.${bpKey}[open]>nav{display:flex}` +
        `html:has(.${bpKey}[open]),body:has(.${bpKey}[open]){overflow:hidden;overscroll-behavior:contain}` +
        `}`;
      this.css.push(respCss);
    }

    // ----- Compile children (the links inside the nav) -----
    // We strip attributes that we've already consumed on the outer <nav>
    // so they don't leak into the rewritten markup.
    const CONSUMED = new Set(['burger', 'icon', 'aria-label', 'summary-aria-label', 'open-label']);
    const passthroughAttrs = el.attributes.filter(a => !CONSUMED.has(a.name));

    // Render inner nav children (anchors etc.) at an extra indent
    this.indent += 2;
    const innerChildren = el.children
      .filter(c => c.type !== 'Style')
      .map(c => this.compileStatement(c))
      .join('');
    this.indent -= 2;

    // Also support an optional user-provided style block on the burger nav
    let scopeClass = '';
    const styleChild = el.children.find(c => c.type === 'Style') as StyleBlock | undefined;
    if (styleChild) {
      scopeClass = `nyx-${this.nextId('s')}`;
      this.compileStyleWithClass(styleChild, scopeClass);
    }

    const detailsClasses = ['nx-burger', bpKey, scopeClass].filter(Boolean).join(' ');
    const passthroughStr = this.compileAttributes(passthroughAttrs);

    return (
      // Desktop: plain div with links (no details/summary needed)
      `${this.ind()}<div class="nx-burger-desktop">\n` +
      innerChildren +
      `${this.ind()}</div>\n` +
      // Mobile: details/summary for zero-JS toggle
      `${this.ind()}<details class="${detailsClasses} nx-burger-mobile"${passthroughStr}>\n` +
      `${this.ind()}  <summary aria-label="${summaryAria}">` +
      `<span class="nx-burger-closed">${closedLabel}</span>` +
      `<span class="nx-burger-open" aria-hidden="true">${openLabel}</span>` +
      `</summary>\n` +
      `${this.ind()}  <nav aria-label="${navAria}">\n` +
      innerChildren +
      `${this.ind()}  </nav>\n` +
      `${this.ind()}</details>\n`
    );
  }

  private compileStyleWithClass(style: StyleBlock, className: string): void {
    let cssBlock = `.${className} {\n`;
    for (const prop of style.properties) {
      cssBlock += this.compilePropToCSS(prop);
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

    // CSS Rules: .class { props }, tag { props }, @keyframes (structured), @media/@container/@supports (structured)
    if (style.cssRules) {
      for (const rule of style.cssRules) {
        if (rule.selector === '__raw__') {
          cssBlock += rule.properties[0].value + '\n';
        } else if (rule.selector === '__keyframes__' && rule.keyframeName && rule.keyframeSteps) {
          cssBlock += this.buildKeyframesCSS(rule.keyframeName, rule.keyframeSteps);
        } else if (rule.selector === '__atrule__' && rule.atRulePrelude) {
          cssBlock += this.buildAtRuleCSS(rule.atRulePrelude, rule.properties, `.${className}`);
        } else {
          const selfElements = ['body', 'html'];
          const isSelf = rule.selector.startsWith(':') || rule.selector.startsWith('>') || rule.selector.startsWith('~') || rule.selector.startsWith('+') || selfElements.includes(rule.selector);
          cssBlock += isSelf && selfElements.includes(rule.selector) ? `${rule.selector}.${className} {\n` : `.${className}${isSelf ? '' : ' '}${rule.selector} {\n`;
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

  /** Build `@media/@container/@supports PRELUDE { SELECTOR { props } }` with shorthand + theme resolution. */
  private buildAtRuleCSS(prelude: string, properties: StyleProperty[], innerSelector: string): string {
    let css = `${prelude} {\n  ${innerSelector} {\n`;
    for (const prop of properties) {
      const expanded = this.expandUtility(prop.name, prop.value);
      if (expanded) {
        for (const e of expanded) {
          css += `    ${e.name}: ${e.value};\n`;
        }
      } else {
        const cp = this.mapCSSProperty(prop.name);
        css += `    ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
      }
    }
    css += `  }\n}\n`;
    return css;
  }

  /**
   * Register a top-level `keyframes name { ... }` block (v0.25.0 #110).
   * Throws on duplicate names across the whole program.
   */
  private processTopLevelKeyframes(node: KeyframesNode): void {
    if (this.topLevelKeyframes.has(node.name)) {
      throw new Error(`[NyxCode Compiler Error] Duplicate keyframes name '${node.name}' at line ${node.line}:${node.col}. Each keyframes block must have a unique name.`);
    }
    const css = this.buildKeyframesCSS(node.name, node.steps);
    this.topLevelKeyframes.set(node.name, css);
  }

  /** Build `@keyframes NAME { 0% { ... } 50% { ... } }` CSS with shorthand + theme resolution. */
  private buildKeyframesCSS(name: string, steps: Array<{ selector: string; properties: StyleProperty[] }>): string {
    let css = `@keyframes ${name} {\n`;
    for (const step of steps) {
      css += `  ${step.selector} {\n`;
      for (const prop of step.properties) {
        // Use expandUtility (shorthand combos like 'px 1rem') first
        const expanded = this.expandUtility(prop.name, prop.value);
        if (expanded) {
          for (const e of expanded) {
            css += `    ${e.name}: ${e.value};\n`;
          }
        } else {
          const cp = this.mapCSSProperty(prop.name);
          css += `    ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
        }
      }
      css += `  }\n`;
    }
    css += `}\n`;
    return css;
  }

  private compileContent(content: string | Expression | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return this.escapeContent(content);

    switch (content.type) {
      case 'StringLiteral': {
        // Check for {varName} interpolation patterns referencing state/computed/store vars
        const interpolationPattern = /\{(\w+(?:\.\w+)?)\}/g;
        let match: RegExpExecArray | null;
        const bindings: Array<{full: string, expr: string}> = [];
        while ((match = interpolationPattern.exec(content.value)) !== null) {
          const varRef = match[1];
          const dotParts = varRef.split('.');
          if (dotParts.length === 2 && this.stores.has(dotParts[0])) {
            bindings.push({ full: match[0], expr: `state.${dotParts[0]}.${dotParts[1]}` });
          } else if (this.stateVars.has(varRef)) {
            bindings.push({ full: match[0], expr: `state.${varRef}` });
          } else if (this.computedVars.has(varRef)) {
            bindings.push({ full: match[0], expr: `computed.${varRef}` });
          }
        }
        if (bindings.length > 0) {
          this.hasReactivity = true;
          // Build template: "Count: {count}" -> __NYX_TPL:Count: {{state.count}}
          let tpl = this.escapeContent(content.value);
          for (const b of bindings) {
            tpl = tpl.replace(b.full, `{{${b.expr}}}`);
          }
          return `__NYX_TPL:${tpl}`;
        }
        return this.escapeContent(content.value);
      }
      case 'PropertyAccess':
        return `\${${this.propertyToJS(content.path)}}`;
      case 'NumberLiteral':
        return String(content.value);
      case 'StoreAccess':
        // Store field binding: user.name -> reactive bind to store state
        if (this.stores.has(content.store)) {
          this.hasReactivity = true;
          return `__NYX_BIND:state.${content.store}.${content.field}`;
        }
        return `\${${content.store}.${content.field}}`;
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
      if (attr.name.startsWith('on') && attr.name[2] >= 'A' && attr.name[2] <= 'Z') {
        // Event handler: onClick, onKeydown, onSubmit, etc.
        const eventType = attr.name.slice(2).toLowerCase(); // onClick -> click
        const rawValue = attr.value as string;
        
        // Parse modifiers: __mods:prevent,ctrl,z:action
        let modifiers: string[] = [];
        let actionStr = rawValue;
        if (rawValue.startsWith('__mods:')) {
          const parts2 = rawValue.slice(7).split(':');
          modifiers = parts2[0].split(',');
          actionStr = parts2.slice(1).join(':');
        }
        
        const jsAction = this.actionToJS(actionStr);
        
        // Build event handler with modifiers
        const KEY_MODIFIERS = new Set(['ctrl', 'alt', 'shift', 'meta']);
        const PREVENT_MODIFIERS = new Set(['prevent', 'stop', 'self', 'once']);
        
        let handler = '';
        const conditions: string[] = [];
        let wrappers: string[] = [];
        
        for (const mod of modifiers) {
          if (mod === 'prevent') wrappers.push('event.preventDefault()');
          else if (mod === 'stop') wrappers.push('event.stopPropagation()');
          else if (KEY_MODIFIERS.has(mod)) conditions.push(`event.${mod}Key`);
          else if (mod === 'enter') conditions.push(`event.key==='Enter'`);
          else if (mod === 'escape' || mod === 'esc') conditions.push(`event.key==='Escape'`);
          else if (mod === 'tab') conditions.push(`event.key==='Tab'`);
          else if (mod === 'space') conditions.push(`event.key===' '`);
          else if (mod === 'up') conditions.push(`event.key==='ArrowUp'`);
          else if (mod === 'down') conditions.push(`event.key==='ArrowDown'`);
          else if (mod === 'left') conditions.push(`event.key==='ArrowLeft'`);
          else if (mod === 'right') conditions.push(`event.key==='ArrowRight'`);
          else if (mod === 'delete') conditions.push(`event.key==='Delete'`);
          else if (mod === 'backspace') conditions.push(`event.key==='Backspace'`);
          else if (/^[a-z]$/.test(mod)) conditions.push(`event.key==='${mod}'`); // single letter
        }
        
        if (wrappers.length > 0 || conditions.length > 0) {
          handler = wrappers.join(';');
          if (conditions.length > 0) {
            handler += (handler ? ';' : '') + `if(${conditions.join('&&')}){${jsAction}}`;
          } else {
            handler += (handler ? ';' : '') + jsAction;
          }
        } else {
          handler = jsAction;
        }
        
        // Escape for HTML attribute
        handler = handler.replace(/"/g, "'");
        parts.push(`on${eventType}="${handler}"`);
      } else if (attr.name === 'ref') {
        // Element ref: ref=myDiv -> id="__nyx_ref_myDiv"
        const refName = typeof attr.value === 'string' ? attr.value : '';
        parts.push(`id="__nyx_ref_${refName}"`);
        if (!this.refNames) this.refNames = [];
        this.refNames.push(refName);
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

  private compileErrorHandlers(handlers?: { status: number | '*'; action: string }[]): string {
    if (!handlers || handlers.length === 0) return '';
    const cases: string[] = [];
    let defaultCase = '';
    for (const h of handlers) {
      const action = this.errorActionToJS(h.action);
      if (h.status === '*') {
        defaultCase = action;
      } else {
        cases.push(`if(e.status===${h.status}){${action}}`);
      }
    }
    let code = cases.join(' else ');
    if (defaultCase) {
      code += (code ? ' else ' : '') + `{${defaultCase}}`;
    }
    return code;
  }

  private compileFormErrorHandlers(form: FormStatement): string {
    if (!form.errorHandlers || form.errorHandlers.length === 0) return '';
    const cases: string[] = [];
    let defaultCase = '';
    for (const h of form.errorHandlers) {
      const action = this.errorActionToJS(h.action);
      if (h.status === '*') {
        defaultCase = `{${action};return}`;
      } else {
        cases.push(`if(r.status===${h.status}){${action};return}`);
      }
    }
    let code = cases.join(' else ');
    if (defaultCase) code += (code ? ' else ' : '') + defaultCase;
    return code;
  }

  private errorActionToJS(action: string): string {
    if (action.startsWith('redirect ')) {
      const url = action.slice(9).replace(/"/g, '');
      return `window.location.href='${url}'`;
    } else if (action.startsWith('toast ')) {
      const msg = action.slice(6).replace(/"/g, '');
      return `alert('${msg}')`;
    } else if (action.startsWith('show ')) {
      return `console.error(${action.slice(5)})`;
    } else {
      return action; // raw JS
    }
  }

  private compileData(data: DataStatement): string {
    const { name, source } = data;
    const hasStates = data.loadingBlock || data.errorBlock || data.emptyBlock;
    const loadingId = hasStates ? this.nextId('dl') : '';
    const errorId = hasStates ? this.nextId('de') : '';
    const emptyId = hasStates ? this.nextId('dm') : '';

    if (source.kind === 'get' || source.kind === 'query') {
      const url = source.kind === 'query' ? `/api/__generated/${name}` : source.value;
      this.js.push(`
  // Data: ${name}
  let ${name} = [];
  let ${name}__loading = true;
  let ${name}__error = null;
  async function load_${name}() {
    ${name}__loading = true;
    ${name}__error = null;
    ${hasStates ? `if(document.getElementById('${loadingId}'))document.getElementById('${loadingId}').style.display='';` : ''}
    ${hasStates ? `if(document.getElementById('${errorId}'))document.getElementById('${errorId}').style.display='none';` : ''}
    try {
      const headers = {};
      ${source.auth ? "const tk=localStorage.getItem('token');if(tk)headers['Authorization']='Bearer '+tk;" : ''}
      const res = await fetch('${url}', { headers });
      if(!res.ok){var _e=new Error('HTTP '+res.status);_e.status=res.status;throw _e;}
      ${name} = await res.json();
      ${name}__loading = false;
      ${hasStates ? `if(document.getElementById('${loadingId}'))document.getElementById('${loadingId}').style.display='none';` : ''}
      ${hasStates ? `if(document.getElementById('${emptyId}'))document.getElementById('${emptyId}').style.display=${name}.length===0?'':'none';` : ''}
      render();
    } catch(e) {
      ${name}__loading = false;
      ${name}__error = e.message;
      console.error('Failed to load ${name}:', e);
      ${hasStates ? `if(document.getElementById('${loadingId}'))document.getElementById('${loadingId}').style.display='none';` : ''}
      ${hasStates ? `if(document.getElementById('${errorId}'))document.getElementById('${errorId}').style.display='';` : ''}
      ${this.compileErrorHandlers(data.errorHandlers)}
    }
  }
  load_${name}();`);
    }

    if (source.kind === 'live') {
      const url = source.value;
      // Extract table name from URL: /api/messages -> messages
      const tableName = url.split('/').pop() || name;
      this.js.push(`
  // Live Data: ${name} (WebSocket)
  let ${name} = [];
  let ${name}__loading = true;
  let ${name}__error = null;
  async function load_${name}() {
    ${name}__loading = true;
    try {
      const headers = {};
      ${source.auth ? "const tk=localStorage.getItem('token');if(tk)headers['Authorization']='Bearer '+tk;" : ''}
      const res = await fetch('${url}', { headers });
      if(!res.ok) throw new Error('HTTP '+res.status);
      ${name} = await res.json();
      ${name}__loading = false;
      render();
    } catch(e) {
      ${name}__error = e.message;
      ${name}__loading = false;
    }
  }
  load_${name}();
  // WebSocket live updates
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws_${name} = new WebSocket(wsProto + '//' + location.host + '?table=${tableName}');
  ws_${name}.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.event === 'insert') { ${name}.push(msg.row); render(); }
    else if (msg.event === 'delete') { ${name} = ${name}.filter(r => r.id !== msg.id); render(); }
    else if (msg.event === 'update') { ${name} = ${name}.map(r => r.id === msg.row.id ? msg.row : r); render(); }
  };`);
    }

    // Generate loading/error/empty HTML blocks
    let html = '';
    if (data.loadingBlock) {
      const loadingHtml = data.loadingBlock.map(s => this.compileStatement(s)).join('');
      html += `<div id="${loadingId}">${loadingHtml}</div>\n`;
    }
    if (data.errorBlock) {
      const errorHtml = data.errorBlock.map(s => this.compileStatement(s)).join('');
      html += `<div id="${errorId}" style="display:none">${errorHtml}</div>\n`;
    }
    if (data.emptyBlock) {
      const emptyHtml = data.emptyBlock.map(s => this.compileStatement(s)).join('');
      html += `<div id="${emptyId}" style="display:none">${emptyHtml}</div>\n`;
    }
    return html;
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
    // If body has a single component, don't wrap in extra tag
    const children = each.body.map(stmt => {
      if (stmt.type === 'Element') {
        return this.compileElementTemplate(stmt as ElementNode, varName);
      }
      return '';
    }).join('');

    // If the each element is a component, children already contain the full HTML
    if (each.body.length === 1 && each.body[0].type === 'Element' && this.components.has((each.body[0] as any).tag)) {
      return children;
    }

    const tag = this.mapTag(each.element);
    return `<${tag}>${children}</${tag}>`;
  }

  private compileElementTemplate(el: ElementNode, varName: string): string {
    // Check if tag is a component — if so, inline it with prop substitution
    if (this.components.has(el.tag)) {
      return this.compileComponentTemplate(el, varName);
    }

    const tag = this.mapTag(el.tag);
    let content = this.resolveTemplateContent(el.content, varName);

    const attrs = this.resolveTemplateAttrs(el.attributes, varName);
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

  private toOptionalChain(path: string): string {
    // .author.name → .author?.name (optional chaining for nested access)
    const parts = path.split('.');
    if (parts.length <= 2) return path; // .title → no change needed
    // .author.name → .author?.name
    return parts[0] + '.' + parts.slice(1).join('?.');
  }

  private resolveTemplateContent(content: any, varName: string): string {
    if (!content) return '';
    if (typeof content === 'string') return this.escapeContent(content);
    if (content.type === 'PropertyAccess') {
      return `\${${varName}${this.toOptionalChain(content.path)}}`;
    }
    if (content.type === 'StringLiteral') return content.value;
    if (content.type === 'Identifier') return `\${${content.name}}`;
    return '';
  }

  private resolveTemplateAttrs(attributes: any[], varName: string): string {
    return attributes.map(a => {
      if (typeof a.value === 'string' && a.value !== 'true') {
        // Resolve .field references in attribute values
        let val = a.value;
        if (val.startsWith('.')) {
          val = `\${${varName}${this.toOptionalChain(val)}}`;
        }
        if (a.name === 'preset') return `class="nyx-p_${a.value}"`;
        if (a.name === 'style') {
          const expanded = this.expandInlineShorthands(val);
          return `style="${expanded}"`;
        }
        return `${a.name}="${val}"`;
      }
      return a.name;
    }).join(' ');
  }

  private compileComponentTemplate(el: ElementNode, varName: string): string {
    const comp = this.components.get(el.tag)!;
    // Build prop map from attributes
    const props = new Map<string, string>();
    for (const attr of el.attributes) {
      if (typeof attr.value === 'string') {
        if (attr.value.startsWith('.')) {
          props.set(attr.name, `\${${varName}${this.toOptionalChain(attr.value)}}`);
        } else {
          props.set(attr.name, attr.value);
        }
      }
    }
    // Also handle content as slot
    const slotContent = this.resolveTemplateContent(el.content, varName);

    // Inline component body with prop substitution
    let html = '';
    for (const stmt of comp.body) {
      if (stmt.type === 'Element') {
        html += this.compileComponentElementTemplate(stmt as ElementNode, props, varName, slotContent);
      }
    }
    return html;
  }

  private compileComponentElementTemplate(el: ElementNode, props: Map<string, string>, varName: string, slotContent: string): string {
    const tag = this.mapTag(el.tag);
    let content = '';

    if (el.content) {
      if (typeof el.content === 'string') {
        content = el.content;
      } else if (el.content.type === 'StringLiteral') {
        content = (el.content as any).value;
      } else if (el.content.type === 'Identifier') {
        const name = (el.content as any).name;
        content = props.has(name) ? props.get(name)! : name;
      } else if (el.content.type === 'PropertyAccess') {
        const propName = (el.content as any).object;
        const path = (el.content as any).path;
        if (propName && props.has(propName)) {
          // If the prop itself is a template var, resolve the path
          content = props.get(propName)!;
        } else {
          content = `\${${varName}${path}}`;
        }
      }
    }

    // Resolve attributes with props
    const attrs = el.attributes.map(a => {
      if (typeof a.value === 'string' && a.value !== 'true') {
        let val = a.value;
        if (props.has(val)) val = props.get(val)!;
        if (a.name === 'preset') return `class="nyx-p_${val}"`;
        if (a.name === 'style') {
          const expanded = this.expandInlineShorthands(val);
          return `style="${expanded}"`;
        }
        return `${a.name}="${val}"`;
      }
      return a.name;
    }).join(' ');

    const attrStr = attrs ? ' ' + attrs : '';

    const children = el.children.map(c => {
      if (c.type === 'Element') {
        return this.compileComponentElementTemplate(c as ElementNode, props, varName, slotContent);
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
        } else if (rule.selector === '__keyframes__' && rule.keyframeName && rule.keyframeSteps) {
          cssBlock += this.buildKeyframesCSS(rule.keyframeName, rule.keyframeSteps);
        } else if (rule.selector === '__atrule__' && rule.atRulePrelude) {
          cssBlock += this.buildAtRuleCSS(rule.atRulePrelude, rule.properties, `.${scopeClass}`);
        } else {
          const selfElems = ['body', 'html'];
          const isSelfScope = rule.selector.startsWith(':') || rule.selector.startsWith('>') || rule.selector.startsWith('~') || rule.selector.startsWith('+') || selfElems.includes(rule.selector);
          cssBlock += isSelfScope && selfElems.includes(rule.selector) ? `${rule.selector}.${scopeClass} {\n` : `.${scopeClass}${isSelfScope ? '' : ' '}${rule.selector} {\n`;
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

  
  // Built-in theme presets (#59)
  private static THEME_PRESETS: Record<string, string> = {
    'brutalist': `:root{--colors-bg:#fff;--colors-text:#000;--colors-primary:#000;--colors-accent:#ff0000;--colors-surface:#fff;--colors-muted:#666;--fonts-body:ui-monospace,SFMono-Regular,monospace;--fonts-heading:ui-monospace,SFMono-Regular,monospace;--spacing-base:1rem;--radius:0px}body{background:var(--colors-bg);color:var(--colors-text);font-family:var(--fonts-body)}h1,h2,h3,h4,h5,h6{font-family:var(--fonts-heading);text-transform:uppercase;letter-spacing:0.05em;border-bottom:3px solid var(--colors-text)}a{color:var(--colors-text);text-decoration:underline;text-underline-offset:3px}button,input,select,textarea{font-family:inherit;border:2px solid var(--colors-text);border-radius:0;background:var(--colors-bg);color:var(--colors-text)}button:hover{background:var(--colors-text);color:var(--colors-bg)}img{filter:grayscale(20%)}`,
    'glassmorphism': `:root{--colors-bg:#0f0f1a;--colors-text:#e0e0ff;--colors-primary:#667eea;--colors-accent:#764ba2;--colors-surface:rgba(255,255,255,0.05);--colors-muted:rgba(255,255,255,0.5);--fonts-body:'Inter',system-ui,sans-serif;--fonts-heading:'Inter',system-ui,sans-serif;--spacing-base:1.25rem;--radius:16px}body{background:linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 50%,#16213e 100%);color:var(--colors-text);font-family:var(--fonts-body)}h1,h2,h3,h4,h5,h6{font-family:var(--fonts-heading);font-weight:700}section,div,article,aside,nav{background:var(--colors-surface);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius);padding:1.5rem}a{color:var(--colors-primary)}button{background:linear-gradient(135deg,var(--colors-primary),var(--colors-accent));color:#fff;border:none;border-radius:var(--radius);padding:0.75rem 1.5rem;font-weight:600;transition:transform 0.2s,box-shadow 0.2s}button:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(102,126,234,0.3)}input,select,textarea{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:var(--radius);color:var(--colors-text);padding:0.75rem}`,
    'editorial': `:root{--colors-bg:#faf9f6;--colors-text:#2d2d2d;--colors-primary:#c9a96e;--colors-accent:#8b4513;--colors-surface:#fff;--colors-muted:#8a8a8a;--fonts-body:'Georgia','Times New Roman',serif;--fonts-heading:'Georgia','Times New Roman',serif;--spacing-base:1.5rem;--radius:2px}body{background:var(--colors-bg);color:var(--colors-text);font-family:var(--fonts-body);line-height:1.8;max-width:720px;margin:0 auto;padding:2rem}h1{font-size:2.5rem;font-weight:400;letter-spacing:-0.02em;margin-bottom:0.5rem}h2{font-size:1.75rem;font-weight:400;border-bottom:1px solid var(--colors-muted);padding-bottom:0.5rem}h3{font-size:1.25rem;font-weight:600}p{margin-bottom:1.5rem}a{color:var(--colors-accent);text-decoration:none;border-bottom:1px solid transparent;transition:border-color 0.2s}a:hover{border-bottom-color:var(--colors-accent)}blockquote{border-left:3px solid var(--colors-primary);padding-left:1.5rem;font-style:italic;color:var(--colors-muted)}button{background:var(--colors-text);color:var(--colors-bg);border:none;padding:0.75rem 2rem;font-family:inherit;letter-spacing:0.05em;transition:opacity 0.2s}button:hover{opacity:0.85}img{border-radius:var(--radius)}`,
    'neon': `:root{--colors-bg:#0a0a0a;--colors-text:#e0e0e0;--colors-primary:#00ff88;--colors-accent:#ff00ff;--colors-surface:#111;--colors-muted:#666;--fonts-body:'JetBrains Mono',ui-monospace,monospace;--fonts-heading:system-ui,sans-serif;--spacing-base:1rem;--radius:8px}body{background:var(--colors-bg);color:var(--colors-text);font-family:var(--fonts-body)}h1,h2,h3{font-family:var(--fonts-heading);color:var(--colors-primary);text-shadow:0 0 10px rgba(0,255,136,0.5)}a{color:var(--colors-primary);text-decoration:none;text-shadow:0 0 8px rgba(0,255,136,0.3)}a:hover{color:var(--colors-accent);text-shadow:0 0 12px rgba(255,0,255,0.5)}button{background:transparent;color:var(--colors-primary);border:1px solid var(--colors-primary);border-radius:var(--radius);padding:0.75rem 1.5rem;font-family:inherit;text-transform:uppercase;letter-spacing:0.1em;transition:all 0.3s;box-shadow:0 0 5px rgba(0,255,136,0.2)}button:hover{background:var(--colors-primary);color:var(--colors-bg);box-shadow:0 0 20px rgba(0,255,136,0.4)}input,select,textarea{background:var(--colors-surface);border:1px solid rgba(0,255,136,0.3);border-radius:var(--radius);color:var(--colors-text);padding:0.75rem;font-family:inherit}input:focus,textarea:focus{border-color:var(--colors-primary);box-shadow:0 0 8px rgba(0,255,136,0.2);outline:none}`,
    'minimal-dark': `:root{--colors-bg:#1a1a1a;--colors-text:#e8e8e8;--colors-primary:#6366f1;--colors-accent:#a78bfa;--colors-surface:#242424;--colors-muted:#888;--fonts-body:system-ui,-apple-system,sans-serif;--fonts-heading:system-ui,-apple-system,sans-serif;--spacing-base:1rem;--radius:8px}body{background:var(--colors-bg);color:var(--colors-text);font-family:var(--fonts-body);line-height:1.6}h1,h2,h3,h4,h5,h6{font-family:var(--fonts-heading);font-weight:600}a{color:var(--colors-primary);text-decoration:none}a:hover{color:var(--colors-accent)}section,article,aside{background:var(--colors-surface);border-radius:var(--radius);padding:1.5rem;border:1px solid rgba(255,255,255,0.06)}button{background:var(--colors-primary);color:#fff;border:none;border-radius:var(--radius);padding:0.625rem 1.25rem;font-weight:500;transition:opacity 0.15s}button:hover{opacity:0.9}input,select,textarea{background:var(--colors-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius);color:var(--colors-text);padding:0.625rem}hr{border:none;border-top:1px solid rgba(255,255,255,0.08);margin:2rem 0}`,
  };

  /**
   * v0.23.0 — resolve `@theme extends "./base.nyx" { ...overrides }` into merged sections.
   *
   * Semantics: TOKEN-MERGE ONLY. Base file's @style blocks are NOT imported (use `use` for that).
   *
   * Rules:
   *   - `extendsPath` must be a relative path (already validated by parser)
   *   - Referenced file must be resolvable via importResolver
   *   - Referenced file must contain exactly one `@theme as "..." { ... }` block
   *   - Overrides replace base entries key-by-key within each section; unreferenced base sections pass through
   *   - Base's own `@theme extends "..."` is followed recursively (depth <= 8, cycle detection)
   */
  private resolveExtendsThemeSections(extendsPath: string, ownSections: any[], chain: string[] = []): any[] {
    if (chain.includes(extendsPath)) {
      throw new Error(`[NyxCode Compile Error] Circular @theme extends detected: ${[...chain, extendsPath].join(' → ')}`);
    }
    if (chain.length >= 8) {
      throw new Error(`[NyxCode Compile Error] @theme extends chain exceeds max depth of 8 (got ${chain.length + 1}: ${[...chain, extendsPath].join(' → ')})`);
    }
    // The CLI pre-flattens all files reached through `use` and `@theme extends` into a single
    // AST, so the named theme should already be in `this.namedThemes` (populated during the
    // first pass over Theme nodes). We look it up by matching the path's basename against
    // the namedThemes map as a fallback, but preferred path is: use the registered map.
    //
    // If not found: the user may have forgotten to declare the base as a named theme, or the
    // file path in `extends` does not resolve to a file that contains a named theme.
    if (this.namedThemes.size === 0) {
      throw new Error(`[NyxCode Compile Error] @theme extends "${extendsPath}" — no named themes are registered. Declare the base with \`theme as "name" { ... }\` in the referenced file.`);
    }
    // In v0.23, there is at most one named theme per file (enforced at parse time). Since the
    // CLI merges ASTs, we just use the single named theme available — or require the user to
    // disambiguate by naming if multiple. For simplicity and forward-compat, use the last one
    // registered (latest definition wins), but prefer a named theme whose name matches the
    // basename of the path (e.g. "base" for "./base.nyx" if name == "base").
    const basename = extendsPath.replace(/^.*[\/\\]/, '').replace(/\.nyx$/, '');
    let chosenName: string | null = null;
    for (const name of this.namedThemes.keys()) {
      if (name === basename) { chosenName = name; break; }
    }
    if (!chosenName) {
      // Fallback: if exactly one named theme exists, use it.
      if (this.namedThemes.size === 1) {
        chosenName = this.namedThemes.keys().next().value as string;
      } else {
        throw new Error(`[NyxCode Compile Error] @theme extends "${extendsPath}" — cannot determine which named theme to inherit from. Found ${this.namedThemes.size} named themes: ${Array.from(this.namedThemes.keys()).join(', ')}. Make the name match the file's basename (e.g. \`theme as "${basename}"\` for "${extendsPath}").`);
      }
    }
    const baseSections = this.namedThemes.get(chosenName) || [];
    return this.mergeThemeSections(baseSections, ownSections);
  }

  /**
   * Merge two lists of ThemeSection: for each section name, overlay own entries on base entries.
   * - Section in base only → keep as-is.
   * - Section in own only → append.
   * - Section in both → copy base entries, overlay own (own wins on key conflict).
   * fontsMeta is also merged at the section level for the `fonts` section.
   */
  private mergeThemeSections(baseSections: any[], ownSections: any[]): any[] {
    const out: any[] = [];
    const ownByName = new Map<string, any>();
    for (const s of ownSections) ownByName.set(s.name, s);
    const seen = new Set<string>();
    for (const baseSec of baseSections) {
      const ownSec = ownByName.get(baseSec.name);
      if (ownSec) {
        const mergedEntries = { ...(baseSec.entries || {}), ...(ownSec.entries || {}) };
        const mergedFontsMeta = { ...(baseSec.fontsMeta || {}), ...(ownSec.fontsMeta || {}) };
        const merged: any = { name: baseSec.name, entries: mergedEntries };
        if (Object.keys(mergedFontsMeta).length > 0) merged.fontsMeta = mergedFontsMeta;
        out.push(merged);
        seen.add(baseSec.name);
      } else {
        out.push(baseSec);
      }
    }
    for (const ownSec of ownSections) {
      if (!seen.has(ownSec.name)) out.push(ownSec);
    }
    return out;
  }

  private compileTheme(theme: any): void {
    // v0.23.0 — Named theme: `@theme as "brand-base" { ... }` only registers, does not emit.
    if (theme.name) {
      if (this.namedThemes.has(theme.name)) {
        throw new Error(`[NyxCode Compile Error] Named theme "${theme.name}" is already defined. Each name must be unique within a compilation unit.`);
      }
      this.namedThemes.set(theme.name, theme.sections || []);
      return;
    }

    // v0.23.0 — Extending theme: `@theme extends "./path.nyx" { ... }` loads base, merges tokens.
    if (theme.extends) {
      const resolvedSections = this.resolveExtendsThemeSections(theme.extends, theme.sections || []);
      // Replace theme.sections with merged result, then fall through to normal emission.
      theme = { ...theme, sections: resolvedSections, extends: undefined };
    }

    // Handle preset themes: theme "brutalist" etc.
    if (theme.preset && Compiler.THEME_PRESETS[theme.preset]) {
      this.headInjections.push('<style>' + Compiler.THEME_PRESETS[theme.preset] + '</style>');
      // Still process sections if any (overrides)
      if (!theme.sections || theme.sections.length === 0) return;
    }

    const isDark = theme.mode === 'dark';
    const targetVars = isDark ? this.darkThemeVars : this.themeVars;

    let fontCSS = '';
    for (const section of theme.sections) {
      if (section.name === 'fonts') {
        // Auto-apply fonts + generate CSS custom properties
        for (const [key, value] of Object.entries(section.entries)) {
          // Quote multi-word font names and process font stack
          const fontValue = this.processFontFamily('"' + (value as string) + '"');
          const fullKey = 'fonts-' + key;
          targetVars.set(fullKey, fontValue);
          if (!isDark) {
            if (key === 'heading') fontCSS += 'h1,h2,h3,h4,h5,h6{font-family:' + fontValue + ';}';
            if (key === 'body') fontCSS += 'body,p,span,li,td,label,input,textarea,select{font-family:' + fontValue + ';}';
          }
        }
        // Collect Google Font metadata for injection
        if (section.fontsMeta && !isDark) {
          for (const [key, meta] of Object.entries(section.fontsMeta)) {
            const fontMeta = meta as { family: string; source: string; localPath?: string };
            if (fontMeta.source === 'google') {
              // Extract the first word/quoted name as the family name
              const family = fontMeta.family.trim();
              if (family && !this.googleFonts.includes(family)) {
                this.googleFonts.push(family);
              }
            }
          }
        }
      } else {
        for (const [key, value] of Object.entries(section.entries)) {
          const fullKey = section.name + '-' + key;
          targetVars.set(fullKey, value as string);
          // Track color names for implicit resolution (e.g. 'primary' → 'colors-primary')
          if (!isDark) {
            this.themeColorNames.set(fullKey, fullKey);  // 'colors-primary' → 'colors-primary'
            this.themeColorNames.set(key, fullKey);      // 'primary' → 'colors-primary' (shorthand)
          }
        }
      }
    }

    if (isDark) {
      // Dark mode CSS: emit @media + [data-theme] blocks
      // Resolve dot-notation refs in dark values too (#86).
      if (this.darkThemeVars.size > 0) {
        let darkVarCSS = '';
        for (const [key, value] of this.darkThemeVars) {
          const resolved = this.resolveDotNotationRefs(value);
          darkVarCSS += '--' + key + ':' + resolved + ';';
        }
        const mediaCSS = '@media(prefers-color-scheme:dark){:root{' + darkVarCSS + '}}';
        const attrCSS = '[data-theme="dark"]{' + darkVarCSS + '}';
        this.headInjections.push('<style>' + mediaCSS + attrCSS + '</style>');
      }
      return;
    }

    // Generate CSS custom properties for main (light) theme.
    // Resolve dot-notation refs in values (e.g. `1px solid color.primary` → `1px solid var(--colors-primary)`)
    // so that composite tokens like `borders.divider: 1px solid color.subtle` work (#86).
    let css = '';
    if (this.themeVars.size > 0) {
      css = ':root{';
      for (const [key, value] of this.themeVars) {
        const resolved = this.resolveDotNotationRefs(value);
        css += '--' + key + ':' + resolved + ';';
      }
      css += '}';
    }
    // v0.25.0 (#109): native `theme { body { ... } }` block emits a real `body { }` CSS rule.
    // Goes AFTER :root (so vars are available) and BEFORE page-specific styles (page can override).
    if (theme.body && theme.body.length > 0) {
      const bodyProps = theme.body.map((s: any) => {
        const prop = this.mapCSSProperty(s.name);
        return prop + ': ' + this.resolveThemeValue(prop, s.value);
      }).join('; ');
      css += 'body{' + bodyProps + '}';
    }
    // v0.25.0 (#111): native `theme { selection { ... } }` block emits a real `::selection { }` CSS rule.
    // Goes AFTER :root + body so theme vars are available and page styles can still override.
    if (theme.selection && theme.selection.length > 0) {
      const selProps = theme.selection.map((s: any) => {
        const prop = this.mapCSSProperty(s.name);
        return prop + ': ' + this.resolveThemeValue(prop, s.value);
      }).join('; ');
      css += '::selection{' + selProps + '}';
    }
    // v0.25.0 (#112): native `theme { defaults { a { ... } pre { ... } } }` emits element
    // default styles wrapped in `:where()` for zero specificity, so local element styles
    // always override defaults without needing !important.
    if (theme.defaults && theme.defaults.length > 0) {
      for (const def of theme.defaults) {
        if (!def.properties || def.properties.length === 0) continue;
        const props = def.properties.map((p: any) => {
          const prop = this.mapCSSProperty(p.name);
          return prop + ': ' + this.resolveThemeValue(prop, p.value);
        }).join('; ');
        css += ':where(' + def.element + '){' + props + '}';
      }
    }
    if (fontCSS) css += fontCSS;
    if (css) {
      this.headInjections.push('<style>' + css + '</style>');
    }

    // Google Fonts injection (guard against double-injection)
    if (this.googleFonts.length > 0 && !this.googleFontsInjected) {
      this.googleFontsInjected = true;
      const families = this.googleFonts.map(f => 'family=' + f.replace(/\s+/g, '+')).join('&');
      this.headInjections.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
      this.headInjections.push('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
      this.headInjections.push('<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?' + families + '&display=swap">');
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
          const presetAttr = el.attributes.find((a: any) => a.name === 'preset');
          const styleAttr = el.attributes.find((a: any) => a.name === 'style');
          let btnAttrs = 'type="submit"';
          if (presetAttr) {
            btnAttrs += ` class="nyx-p_${presetAttr.value}"`;
          }
          if (styleAttr) {
            const expanded = this.expandInlineShorthands(styleAttr.value as string);
            btnAttrs += ` style="${expanded}"`;
          }
          html += `${this.ind()}<button ${btnAttrs}>${this.escapeContent(text)}</button>\n`;
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
        `var d=await r.json();if(r.ok){if(d.token)localStorage.setItem('token',d.token);${successCode}}else{${this.compileFormErrorHandlers(form)}msg.textContent=d.error||'Error';msg.style.color='#f06'}}` +
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

    // Style dedup: reuse class if identical style already emitted (ONLY if component has a style{})
    let scopeClass: string | null = null;
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
    }

    // Resolve positional args (__arg0, __arg1, ...) to named props
    for (let i = 0; i < comp.props.length; i++) {
      const posKey = `__arg${i}`;
      if (posKey in props && !(comp.props[i].name in props)) {
        props[comp.props[i].name] = props[posKey];
        delete props[posKey];
      }
    }

    // Compile children passed to this component (for slot substitution)
    let slotHtml = '';
    if (el.children.length > 0) {
      for (const child of el.children) {
        slotHtml += this.compileStatement(child);
      }
    }

    // Build body HTML. Wrapper div is only emitted when scopeClass exists (style{} was present).
    // This keeps component output clean when the component is just structural (#75).
    const emitWrapper = scopeClass !== null;
    let html = '';
    if (emitWrapper) {
      html += `${this.ind()}<div class="${scopeClass}">\n`;
      this.indent++;
    }

    for (const stmt of comp.body) {
      if (stmt.type === 'Style') continue; // Already handled
      // Slot: replace with children from parent invocation
      if (stmt.type === 'Element' && (stmt as ElementNode).tag === 'slot') {
        if (slotHtml) {
          html += slotHtml;
        }
        continue;
      }
      // Skip accidental element named exactly as a prop type (e.g. stray 'string', 'number')
      // This happens when the parser mis-tokenizes `props name: string` without Colon support on older versions.
      if (stmt.type === 'Element' && (stmt as ElementNode).children.length === 0 &&
          (stmt as ElementNode).attributes.length === 0 && !(stmt as ElementNode).content &&
          ['string', 'number', 'bool', 'boolean'].includes((stmt as ElementNode).tag)) {
        continue;
      }
      if (stmt.type === 'Element') {
        html += this.compileElementWithProps(stmt as ElementNode, props, slotHtml);
      } else {
        html += this.compileStatement(stmt);
      }
    }

    if (emitWrapper) {
      this.indent--;
      html += `${this.ind()}</div>\n`;
    }

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

    // Helper: resolve `${propName}` and `${expr}` interpolation (Kiro #75)
    // Supports simple identifiers AND ternaries like `${active == "home" ? "is-active" : ""}`
    // Built-ins like __version__ fall back to compiler globals when not in props (#81).
    const resolveBuiltin = (name: string): string | undefined => {
      if (name === '__version__') return NYXCODE_VERSION;
      return undefined;
    };
    const interpolate = (s: string): string => {
      return s.replace(/\$\{([^}]+)\}/g, (match, raw) => {
        const expr = raw.trim();
        // Simple identifier lookup (props first, built-ins second)
        if (/^[a-zA-Z_][\w]*$/.test(expr)) {
          if (expr in props) return props[expr];
          const builtin = resolveBuiltin(expr);
          if (builtin !== undefined) return builtin;
          return ''; // unknown identifier → empty (preserves v0.20 behavior for missing props)
        }
        // Ternary: `cond ? "a" : "b"` or `cond ? a : b`
        const tern = expr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
        if (tern) {
          const [, condRaw, thenRaw, elseRaw] = tern;
          const unwrap = (v: string) => {
            v = v.trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
            if (/^[a-zA-Z_][\w]*$/.test(v)) return props[v] ?? v;
            return v;
          };
          // Evaluate cond: supports `a == "b"`, `a != "b"`, `a`
          const eq = condRaw.match(/^(.+?)\s*(==|!=)\s*(.+)$/);
          let result = false;
          if (eq) {
            const [, lhs, op, rhs] = eq;
            const l = unwrap(lhs);
            const r = unwrap(rhs);
            result = op === '==' ? l === r : l !== r;
          } else {
            const v = unwrap(condRaw);
            result = !!v && v !== 'false' && v !== '0';
          }
          return result ? unwrap(thenRaw) : unwrap(elseRaw);
        }
        return '';
      });
    };

    let content = '';

    if (el.content) {
      if (typeof el.content === 'string') {
        content = this.escapeContent(interpolate(el.content));
      } else if (el.content.type === 'StringLiteral') {
        content = this.escapeContent(interpolate((el.content as any).value));
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
        // Exact-match dot prop: attr=.propName (legacy)
        for (const [propName, propVal] of Object.entries(props)) {
          if (val === '.' + propName) {
            val = propVal;
          }
        }
        // Full ${expr} interpolation (Kiro #75) — shares the ternary-aware helper
        if (typeof val === 'string') {
          val = interpolate(val);
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

  /**
   * Process a store block — register fields as namespaced state vars.
   * `store user { name = "" role = "guest" }` becomes:
   * - State vars: user.name, user.role (namespaced)
   * - Global JS object: __nyx_store_user with reactive properties
   */
  private processStore(store: StoreNode): void {
    const fields: Array<{name: string, value?: string, isAction: boolean, actionBody?: string}> = [];
    const computed: Array<{name: string, expression: string}> = [];

    for (const field of store.body) {
      if (field.isAction) {
        fields.push({ name: field.name, isAction: true, actionBody: field.actionBody });
      } else if (field.value?.startsWith('__computed:')) {
        // Computed field inside store
        const expr = field.value.replace('__computed:', '');
        computed.push({ name: field.name, expression: expr });
      } else {
        let val = field.value || '""';
        // Re-quote string values (parser strips quotes)
        if (val && val !== 'true' && val !== 'false' && val !== 'null' && val !== 'undefined'
            && !/^-?\d/.test(val) && !val.startsWith('[') && !val.startsWith('{') && !val.startsWith('"')) {
          val = JSON.stringify(val);
        }
        fields.push({ name: field.name, value: val, isAction: false });
      }
    }

    this.stores.set(store.name, { fields, computed });
    if (fields.length > 0) this.hasReactivity = true;
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

    // Store initialization — global reactive state objects
    for (const [storeName, store] of this.stores) {
      runtime += `\n  // Store: ${storeName}\n`;
      runtime += `  const ${storeName} = {};\n`;
      // Create state vars namespaced under store
      for (const field of store.fields) {
        if (!field.isAction) {
          const stateKey = `${storeName}.${field.name}`;
          runtime += `  __nyx.createState('${stateKey}', ${field.value || '""'});\n`;
          runtime += `  Object.defineProperty(${storeName}, '${field.name}', {\n`;
          runtime += `    get() { return __nyx.state['${stateKey}']; },\n`;
          runtime += `    set(v) { __nyx.state['${stateKey}'] = v; },\n`;
          runtime += `    enumerable: true\n`;
          runtime += `  });\n`;
        } else if (field.actionBody) {
          runtime += `  ${storeName}.${field.name} = function() { ${field.actionBody} };\n`;
        }
      }
      // Store computed values
      for (const comp of store.computed) {
        // Resolve field references within the store's own fields
        let resolvedExpr = comp.expression;
        for (const field of store.fields) {
          resolvedExpr = resolvedExpr.replace(new RegExp(`\\b${field.name}\\b`, 'g'), `__nyx.state['${storeName}.${field.name}']`);
        }
        runtime += `  __nyx.defineComputed('${storeName}.${comp.name}', () => ${resolvedExpr});\n`;
        runtime += `  Object.defineProperty(${storeName}, '${comp.name}', {\n`;
        runtime += `    get() { return __nyx.computedDefs['${storeName}.${comp.name}'](); },\n`;
        runtime += `    enumerable: true\n`;
        runtime += `  });\n`;
      }
      // Make store globally accessible
      runtime += `  window.__nyx_store_${storeName} = ${storeName};\n`;
    }

    // Computed values — resolve state var references to __nyx.state.X
    for (const [name, expr] of this.computedVars) {
      let resolvedExpr = expr;
      for (const [stateName] of this.stateVars) {
        resolvedExpr = resolvedExpr.replace(new RegExp(`\\b${stateName}\\b`, 'g'), `__nyx.state.${stateName}`);
      }
      runtime += `  __nyx.defineComputed('${name}', () => ${resolvedExpr});\n`;
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
        // Store fields: state.storeName.field -> __nyx.state['storeName.field']
        if (parts[0] === 'state' && parts.length === 3) {
          const key = parts[1] + '.' + parts[2];
          if (__nyx.subscribers.has(key)) return __nyx.state[key];
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

    // Bind template elements with data-nyx-tpl (mixed text + reactive vars)
    document.querySelectorAll('[data-nyx-tpl]').forEach(el => {
      const tpl = el.getAttribute('data-nyx-tpl');
      const update = () => {
        try {
          el.textContent = tpl.replace(/\{\{(\\w+(?:\\.\\w+)*)\}\}/g, (_, expr) => {
            const parts = expr.split('.');
            if (parts[0] === 'state' && parts.length === 2) return __nyx.state[parts[1]] ?? '';
            if (parts[0] === 'state' && parts.length === 3) return __nyx.state[parts[1]+'.'+parts[2]] ?? '';
            if (parts[0] === 'computed' && parts.length === 2) return __nyx.computed[parts[1]] ?? '';
            return '';
          });
        } catch(e) {}
      };
      // Subscribe to all state/computed vars in template
      for (const [name] of __nyx.subscribers) {
        if (tpl.includes('state.' + name) || tpl.includes(name)) {
          __nyx.subscribe(name, update);
        }
      }
      for (const name of Object.keys(__nyx.computedDefs)) {
        if (tpl.includes('computed.' + name)) {
          __nyx.subscribe('__computed_' + name, update);
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

    // Issue #97: dedupe singleton meta tags so page-level `meta {}` overrides site-level.
    const dedupedInjections = this.dedupeHeadInjections(this.headInjections);
    const headExtra = dedupedInjections.length > 0 ? '\n  ' + dedupedInjections.join('\n  ') : '';
    const topLevelKfCSS = this.topLevelKeyframes.size > 0 ? '\n    ' + [...this.topLevelKeyframes.values()].join('\n    ').trimEnd() : '';
    const animCSS = (this.animations.length > 0 ? '\n    ' + this.animations.join('\n    ') : '') + topLevelKfCSS;
    const elementDefaults = this.buildElementDefaults();

    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(headExtra);
    const hasGenerator = /<meta[^>]+name=["']generator["']/i.test(headExtra);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">${hasViewport ? '' : '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">'}${hasGenerator ? '' : `\n  <meta name="generator" content="NyxCode v${NYXCODE_VERSION}">`}
  ${headExtra.includes('<title>') ? '' : '<title>NyxCode App</title>'}${headExtra}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :where(body) { font-family: system-ui, -apple-system, sans-serif; }${animCSS}${elementDefaults}
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
${this.scripts.length > 0 ? '<script>' + (this.refNames.length > 0 ? 'const refs=new Proxy({},{get:(_,n)=>document.getElementById("__nyx_ref_"+n)});' : '') + this.scripts.join(';') + '</script>' : ''}
</body>
</html>`;
  }

  private buildJS(): string {
    return this.js.join('\n');
  }

  // --- Helpers ---

  private mapTag(tag: string): string {
    // Inside SVG, 'text' must stay as <text> not become <span>.
    if (this.svgDepth > 0 && tag === 'text') return 'text';
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
  private processFontFamily(value: string): string {
    // If value is a quoted string containing commas, split into font stack
    // e.g. "Playfair Display, serif" → "Playfair Display", serif
    const stripped = value.trim();
    if ((stripped.startsWith('"') && stripped.endsWith('"')) || 
        (stripped.startsWith("'") && stripped.endsWith("'"))) {
      const inner = stripped.slice(1, -1);
      if (inner.includes(',')) {
        return inner.split(',').map(s => {
          const t = s.trim();
          // Quote font names that contain spaces
          return t.includes(' ') ? `"${t}"` : t;
        }).join(', ');
      }
    }
    return value;
  }

  // Singular → plural mapping for dot-notation theme tokens.
  // Users write `color.primary`, internal storage uses `colors-primary`.
  private static readonly THEME_SECTION_PLURAL: Record<string, string> = {
    color: 'colors',
    shadow: 'shadows',
    font: 'fonts',
    layout: 'layouts',
    border: 'borders',
    // These are already plural in common usage — identity mapping
    spacing: 'spacing',
    radius: 'radius',
  };

  // All recognized dot-notation prefixes (singular form).
  // Handles both `spacing.md` and `spacing . md` (parser may insert spaces around `.`).
  private static readonly THEME_DOT_PREFIX_RE =
    /\b(color|spacing|radius|shadow|shadows|font|fonts|layout|layouts|border|borders)\s*\.\s*([a-z0-9][a-z0-9-]*)/g;

  /**
   * Resolve a `section.key` dot-notation token to `var(--plural-key)`.
   * Accepts pre-split prefix and key (regex capture groups).
   * Throws a hard compile error if the token isn't defined in themeVars.
   */
  private resolveDotToken(prefix: string, key: string): string {
    // Normalize: singular → plural (color → colors), already-plural stays
    const plural = Compiler.THEME_SECTION_PLURAL[prefix] ?? prefix;
    const fullKey = plural + '-' + key;

    if (this.themeVars.has(fullKey)) {
      return `var(--${fullKey})`;
    }

    // Not found — build a helpful error with Levenshtein-ranked suggestions.
    // Two-tier approach:
    //   1. If the prefix matches a known section (e.g. `color.`), rank keys
    //      within that section by edit distance on the local key only. This
    //      catches typos like `color.primry` → `color.primary`.
    //   2. If no close match in-section, widen the search to all theme keys
    //      globally (distance over the full dotted form). Handles cases
    //      where the user picked the wrong section entirely.
    const canonicalToken = prefix + '.' + key;
    const inSectionKeys: string[] = [];
    const allDottedKeys: string[] = [];
    for (const k of this.themeVars.keys()) {
      // themeVars stores flat keys like `colors-primary`, `spacing-md` etc.
      const dashIdx = k.indexOf('-');
      if (dashIdx < 0) continue;
      const section = k.slice(0, dashIdx);
      const localKey = k.slice(dashIdx + 1);
      // Reverse-lookup: find the canonical singular form for this section.
      let canonicalPrefix = section;
      for (const [sing, plur] of Object.entries(Compiler.THEME_SECTION_PLURAL)) {
        if (plur === section) { canonicalPrefix = sing; break; }
      }
      allDottedKeys.push(canonicalPrefix + '.' + localKey);
      if (section === plural) inSectionKeys.push(localKey);
    }

    let suggestions = nearestMatches(key, inSectionKeys, 3).map(
      (k2) => prefix + '.' + k2,
    );
    if (suggestions.length === 0) {
      suggestions = nearestMatches(canonicalToken, allDottedKeys, 3);
    }

    let msg = `Undefined theme token: ${canonicalToken}.`;
    const hint = didYouMean(suggestions);
    if (hint) msg += hint;
    throw new Error(`[NyxCode Compiler Error] ${msg}`);
  }

  /**
   * Replace all dot-notation theme refs in a value string.
   * E.g. "spacing.md 0" → "var(--spacing-md) 0"
   * Also handles parser-spaced form: "spacing . md" → "var(--spacing-md)"
   */
  private resolveDotNotationRefs(value: string): string {
    // Reset lastIndex for global regex reuse
    Compiler.THEME_DOT_PREFIX_RE.lastIndex = 0;
    if (!Compiler.THEME_DOT_PREFIX_RE.test(value)) return value;
    Compiler.THEME_DOT_PREFIX_RE.lastIndex = 0;
    return value.replace(Compiler.THEME_DOT_PREFIX_RE, (_match, prefix: string, key: string) =>
      this.resolveDotToken(prefix, key)
    );
  }

  private resolveThemeValue(cssProperty: string, value: string): string {
    if (cssProperty === 'font-family') return this.processFontFamily(value);

    // Phase 1: Resolve dot-notation tokens (works for ALL properties)
    if (this.themeVars.size > 0) {
      value = this.resolveDotNotationRefs(value);
    }

    // Phase 2: Implicit color-name resolution (backward compat — "primary" without dot prefix)
    if (this.themeColorNames.size === 0) return value;
    // Only resolve bare names for color-accepting properties
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


  // Typography utility expansions (#60)
  private expandUtility(name: string, value: string): {name: string, value: string}[] | null {
    switch (name) {
      case 'truncate':
        return [
          { name: 'overflow', value: 'hidden' },
          { name: 'text-overflow', value: 'ellipsis' },
          { name: 'white-space', value: 'nowrap' },
        ];
      case 'line-clamp':
        return [
          { name: 'display', value: '-webkit-box' },
          { name: '-webkit-line-clamp', value: value },
          { name: '-webkit-box-orient', value: 'vertical' },
          { name: 'overflow', value: 'hidden' },
        ];
      case 'caps':
        return [{ name: 'text-transform', value: value || 'uppercase' }];
      case 'lowercase':
        return [{ name: 'text-transform', value: 'lowercase' }];
      case 'capitalize':
        return [{ name: 'text-transform', value: 'capitalize' }];
      case 'balance':
        return [{ name: 'text-wrap', value: 'balance' }];
      case 'pretty':
        return [{ name: 'text-wrap', value: 'pretty' }];
      default:
        return null;
    }
  }

  
  // Compile a single style property to CSS string(s)
  private compilePropToCSS(prop: {name: string, value: string}): string {
    const expanded = this.expandUtility(prop.name, prop.value);
    if (expanded) {
      return expanded.map(e => `  ${e.name}: ${e.value};\n`).join('');
    }
    const cp = this.mapCSSProperty(prop.name);
    return `  ${cp}: ${this.resolveThemeValue(cp, prop.value)};\n`;
  }

  private mapCSSProperty(name: string): string {
    const mapping: Record<string, string> = {
      // Position
      't': 'top',
      'l': 'left',
      'b': 'bottom',
      
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
      'mw': 'max-width',
      'minh': 'min-height',
      'mih': 'min-height',
      'maxh': 'max-height',
      
      // Typography
      'fs': 'font-size',
      'fw': 'font-weight',
      'ff': 'font-family',
      'lh': 'line-height',
      'ls': 'letter-spacing',
      'ta': 'text-align',
      'td': 'text-decoration',
      // Typography shorthands (#60)
      'tracking': 'letter-spacing',
      'leading': 'line-height',
      'indent': 'text-indent',
      'wb': 'word-break',
      'ww': 'overflow-wrap',
      'hyphens': 'hyphens',
      // Grid areas (#56)
      'areas': 'grid-template-areas',
      'area': 'grid-area',
      'container': 'container-type',
      'container-name': 'container-name',
      'columns': 'columns',
      'col-gap': 'column-gap',
      'col-count': 'column-count',
      'col-rule': 'column-rule',
      'tt': 'text-transform',
      'ws': 'white-space',
      'c': 'color',
      
      // Borders
      'border': 'border',
      'bt': 'border-top',
      // Issue #100: `br` previously mapped to `border-right`, but every utility framework
      // (Tailwind, UnoCSS, Tachyons) uses it for `border-radius`. Users writing `br 6px`
      // expect rounded corners, not a right-side border. Semantic fix — `border-right`
      // is spelled out by anyone who actually means it.
      'br': 'border-radius',
      'brad': 'border-radius',
      'border-right': 'border-right',
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
      'fxw': 'flex-wrap',
      'fw2': 'flex-wrap',
      'fg': 'flex-grow',
      'fxs': 'flex-shrink',
      'fsk': 'flex-shrink',
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
      'ox': 'overflow-x',
      'ofx': 'overflow-x',
      // Issue #100: `of-x` / `of-y` weren't mapped, so `style { of-x auto }` on a <pre>
      // emitted literal `of-x: auto;` which browsers silently ignore. The styles looked
      // dropped; they were present but invalid. Added the hyphenated forms to match
      // how users actually write it (hyphens are first-class identifier chars in the lexer).
      'of-x': 'overflow-x',
      'oy': 'overflow-y',
      'ofy': 'overflow-y',
      'of-y': 'overflow-y',
      'v': 'visibility',
      'cur': 'cursor',
      'us': 'user-select',
      'pe': 'pointer-events',
      'ap': 'appearance',
      
      // Transforms & Transitions  
      'tf': 'transform',
      'tr': 'transition',
      'anim': 'animation',
      'fi': 'filter',
      'fil': 'filter',            // alias (docs compat, #74)
      'bdf': 'backdrop-filter',
      'bf': 'backdrop-filter',    // alias (docs compat, #74)
      
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
    // Handle unified style={ } syntax (prefixed with __nyx__)
    if (style.startsWith('__nyx__')) {
      style = style.slice(7); // strip prefix
    }
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
    // Use user-defined breakpoints from theme if available
    const userSm = this.themeVars.get('breakpoints-sm');
    const userLg = this.themeVars.get('breakpoints-lg');
    const userMd = this.themeVars.get('breakpoints-md');

    const breakpoints: Record<string, string> = {
      'mobile': userSm || '768px',
      'tablet': userMd || userLg || '1024px',
      'desktop': userLg || '1280px',
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
    // Normalize spaces around dots: "user . name" -> "user.name"
    action = action.replace(/\s*\.\s*/g, '.');
    // State mutations: count + 1, count - 1, name = "new"
    // Check if action references a store field
    for (const [storeName, store] of this.stores) {
      for (const field of store.fields) {
        if (!field.isAction && action.includes(`${storeName}.${field.name}`)) {
          if (action.includes('=')) {
            const [lhs, ...rhsParts] = action.split('=');
            const rhs = rhsParts.join('=').trim();
            const rhsResolved = this.resolveStateRefs(rhs);
            const rhsFinal = rhsResolved.replace(/"/g, "'");
            return `__nyx.state['${lhs.trim()}'] = ${rhsFinal}`;
          }
        }
      }
    }
    // Check if action references a state var
    for (const [name] of this.stateVars) {
      if (action.includes(name)) {
        if (action.includes('=')) {
          const [lhs, ...rhsParts] = action.split('=');
          const rhs = rhsParts.join('=').trim();
          const rhsResolved = this.resolveStateRefs(rhs);
          const rhsFinal = rhsResolved.replace(/"/g, "'");
          return `__nyx.state.${lhs.trim()} = ${rhsFinal}`;
        } else {
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
    // Resolve store field access: user.name -> __nyx.state['user.name']
    for (const [storeName, store] of this.stores) {
      for (const field of store.fields) {
        if (!field.isAction) {
          result = result.replace(new RegExp(`\\b${storeName}\\.${field.name}\\b`, 'g'), `__nyx.state['${storeName}.${field.name}']`);
        }
      }
      for (const comp of store.computed) {
        result = result.replace(new RegExp(`\\b${storeName}\\.${comp.name}\\b`, 'g'), `${storeName}.${comp.name}`);
      }
    }
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
        return `${expr.store}.${expr.field}`;
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

  /**
   * Deduplicate meta-style head tags (Issue #97).
   *
   * Site-level `meta {}` blocks are pushed to headInjections BEFORE page-level ones.
   * Without dedup, a page that overrides `title` or `og:image` would emit BOTH tags —
   * browsers pick the first, so site-level would silently win.
   *
   * Strategy: walk the injection list, extract a stable "key" from known singleton
   * tags (<title>, <meta name/property>, <link rel="canonical"|"icon">), and keep
   * only the LAST occurrence of each key. Non-keyed tags (<style>, <script>,
   * <link rel="stylesheet">, <link rel="preconnect">, etc.) are always kept —
   * losing a theme <style> block would be catastrophic.
   *
   * The injection strings produced by parseMeta() / buildMetaHtml() may contain
   * multiple tags separated by newlines, so we tokenize each injection into
   * individual tag lines before dedup.
   */
  private dedupeHeadInjections(injections: string[]): string[] {
    // Flatten: split each injection into individual <tag> lines so one `meta {}`
    // block producing 5 tags can be dedup'd tag-by-tag against other blocks.
    // We only split on newlines between top-level tags (not inside <style>/<script>
    // bodies, which are emitted as single-line strings by the theme/font code).
    type Entry = { key: string | null; html: string };
    const entries: Entry[] = [];

    for (const inj of injections) {
      // Theme <style>, Google Fonts <link>, etc. are always single-tag strings
      // without embedded newlines. Meta blocks join entries with '\n  ' (newline +
      // indent). Split on newline-followed-by-optional-whitespace-then-'<', but only
      // when the injection actually has embedded newlines between top-level tags.
      const hasInnerBreak = /\n\s*</.test(inj);
      const pieces = hasInnerBreak ? inj.split(/\n\s*(?=<)/) : [inj];
      for (const raw of pieces) {
        const piece = raw.trim();
        if (!piece) continue;
        entries.push({ key: this.headTagKey(piece), html: piece });
      }
    }

    // Last-wins dedup for keyed entries; keep all non-keyed entries in order.
    const lastIdx = new Map<string, number>();
    for (let i = 0; i < entries.length; i++) {
      const k = entries[i].key;
      if (k !== null) lastIdx.set(k, i);
    }

    const out: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const { key, html } = entries[i];
      if (key === null) { out.push(html); continue; }
      if (lastIdx.get(key) === i) out.push(html);
      // else: superseded by a later page-level override — drop it.
    }
    return out;
  }

  /**
   * Return a dedup key for singleton head tags, or null for tags that may repeat.
   * Keys: 'title', 'meta:name:<name>', 'meta:property:<prop>', 'link:canonical',
   *       'link:icon'.
   */
  private headTagKey(tag: string): string | null {
    if (/^<title[\s>]/i.test(tag)) return 'title';
    if (/^<meta\s/i.test(tag)) {
      const nameMatch = tag.match(/\sname=["']([^"']+)["']/i);
      if (nameMatch) return 'meta:name:' + nameMatch[1].toLowerCase();
      const propMatch = tag.match(/\sproperty=["']([^"']+)["']/i);
      if (propMatch) return 'meta:property:' + propMatch[1].toLowerCase();
      // <meta charset>, <meta http-equiv> — rare in user meta {} blocks; treat as non-dedup.
      return null;
    }
    if (/^<link\s/i.test(tag)) {
      const relMatch = tag.match(/\srel=["']([^"']+)["']/i);
      if (relMatch) {
        const rel = relMatch[1].toLowerCase();
        if (rel === 'canonical' || rel === 'icon' || rel === 'shortcut icon') {
          return 'link:' + rel;
        }
      }
      return null;
    }
    return null;
  }

  /**
   * Resolve built-in variables like `${__version__}` in any string.
   * Shared by page-level escapeContent() and component-level interpolate() (#81).
   */
  private resolveBuiltins(str: string): string {
    // First resolve ${__version__} syntax (#81)
    let result = str.replace(/\$\{(__\w+__)\}/g, (match, name) => {
      switch (name) {
        case '__version__': return NYXCODE_VERSION;
        default: return match; // unknown built-in → leave literal
      }
    });
    // Also resolve bare __version__ without ${} wrapper (#108)
    result = result.replace(/__version__/g, NYXCODE_VERSION);
    return result;
  }

  private escapeContent(str: string): string {
    // Resolve built-ins like ${__version__} before escaping (#81)
    let result = this.resolveBuiltins(str);
    // For text content between tags, quotes don't need escaping
    result = result
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Footnote references: [^1] → <sup><a href="#fn-1" id="fnref-1">[1]</a></sup> (#68)
    result = result.replace(/\[\^(\w+)\]/g, (_m, id) => {
      return `<sup class="nyx-fnref"><a href="#fn-${id}" id="fnref-${id}">[${id}]</a></sup>`;
    });
    return result;
  }

  private isVoidElement(tag: string): boolean {
    return ['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'track'].includes(tag);
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
