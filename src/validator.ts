/**
 * NyxCode Validator
 *
 * Runs BEFORE the compiler to catch errors early with helpful messages.
 * Performs static analysis on the AST — does NOT modify it.
 *
 * Errors block compilation. Warnings are advisory.
 */

import {
  Program, PageNode, ComponentNode, Statement,
  ElementNode, LayoutNode, UseStatement, StyleBlock, StyleProperty,
} from './ast.js';

const ELEMENT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'text', 'span', 'link', 'img', 'video', 'audio', 'source', 'track', 'iframe', 'canvas', 'icon',
  'button', 'input', 'select', 'option', 'optgroup', 'checkbox', 'radio', 'toggle', 'slider', 'textarea',
  'card', 'badge', 'table', 'list', 'metric', 'chart', 'avatar', 'tag',
  'alert', 'toast', 'modal', 'tooltip', 'progress', 'spinner',
  'row', 'col', 'grid', 'stack', 'container', 'section', 'aside', 'nav', 'footer',
  'slot', 'submit', 'br', 'hr', 'div', 'main', 'article', 'header', 'figure', 'figcaption', 'ul', 'ol', 'li', 'a', 'label', 'form', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'pre', 'code', 'strong', 'em', 'small', 'sup', 'sub', 'details', 'summary',
  'div', 'main', 'header', 'article', 'ul', 'ol', 'li', 'a', 'form',
  'label', 'pre', 'code', 'blockquote', 'hr', 'br', 'strong', 'em',
  'small', 'sup', 'sub', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  'details', 'summary', 'mark', 'abbr', 'cite', 'time', 'address',
  'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  // SVG elements (#62)
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'defs', 'use', 'symbol', 'marker', 'mask', 'clipPath',
  'linearGradient', 'radialGradient', 'stop',
  'filter', 'feGaussianBlur', 'feColorMatrix', 'feBlend', 'feOffset', 'feMerge', 'feMergeNode', 'feFlood', 'feComposite', 'feMorphology', 'feTurbulence', 'feDisplacementMap',
  'pattern', 'image', 'foreignObject', 'title', 'desc',
  'animate', 'animateTransform', 'animateMotion', 'set', 'mpath',
  'tspan', 'textPath', 'switch',
]);

export interface ValidationError {
  message: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
  suggestion?: string;
}

interface Loc {
  line: number;
  col: number;
}

type LocMap = Map<string, Loc>;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [];
    for (let j = 0; j <= n; j++) {
      if (i === 0) { dp[i][j] = j; }
      else if (j === 0) { dp[i][j] = i; }
      else { dp[i][j] = 0; }
    }
  }
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function findSimilar(name: string, candidates: string[], maxDist: number = 2): string | null {
  let best: string | null = null;
  let bestDist = maxDist + 1;
  for (const c of candidates) {
    const d = levenshtein(name.toLowerCase(), c.toLowerCase());
    if (d > 0 && d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function walkStatements(
  body: Statement[],
  callback: (stmt: Statement) => void,
): void {
  for (const stmt of body) {
    callback(stmt);
    switch (stmt.type) {
      case 'Element': {
        const el = stmt as ElementNode;
        if (el.children.length > 0) {
          walkStatements(el.children, callback);
        }
        break;
      }
      case 'Each': {
        const each = stmt as any;
        if (each.body && each.body.length > 0) {
          walkStatements(each.body, callback);
        }
        break;
      }
      case 'When': {
        const when = stmt as any;
        if (when.body && when.body.length > 0) {
          walkStatements(when.body, callback);
        }
        if (when.elseBody && when.elseBody.length > 0) {
          walkStatements(when.elseBody, callback);
        }
        break;
      }
      case 'Form': {
        const form = stmt as any;
        if (form.body && form.body.length > 0) {
          walkStatements(form.body, callback);
        }
        break;
      }
    }
  }
}

function isComponentTag(tag: string): boolean {
  return tag.length > 0 && tag[0] >= 'A' && tag[0] <= 'Z';
}

function findSimilarTag(tag: string): string | null {
  return findSimilar(tag, Array.from(ELEMENT_TAGS));
}

export class Validator {
  validate(program: Program, importedComponents?: Set<string>): ValidationError[] {
    const errors: ValidationError[] = [];
    const definedComponents: LocMap = new Map();
    const importedPaths: string[] = [];
    const usedComponents: Set<string> = new Set();
    const pageRoutes: LocMap = new Map();
    const layouts: Loc[] = [];
    const extComps = importedComponents || new Set<string>();
    const allCompNames: string[] = [];

    for (const node of program.body) {
      if (node.type === 'Component') {
        const comp = node as ComponentNode;
        if (definedComponents.has(comp.name)) {
          const first = definedComponents.get(comp.name)!;
          errors.push({
            message: 'Duplicate component name "' + comp.name + '" (first defined at line ' + first.line + ':' + first.col + ')',
            line: comp.line, col: comp.col, severity: 'error',
          });
        } else {
          definedComponents.set(comp.name, { line: comp.line, col: comp.col });
        }
      } else if (node.type === 'Page') {
        const page = node as PageNode;
        if (pageRoutes.has(page.path)) {
          const first = pageRoutes.get(page.path)!;
          errors.push({
            message: 'Duplicate page route "' + page.path + '" (first defined at line ' + first.line + ':' + first.col + ')',
            line: page.line, col: page.col, severity: 'error',
          });
        } else {
          pageRoutes.set(page.path, { line: page.line, col: page.col });
        }
      } else if (node.type === 'Layout') {
        layouts.push({ line: node.line, col: node.col });
      } else if (node.type === 'Use') {
        importedPaths.push((node as UseStatement).path);
      }
    }

    for (const name of definedComponents.keys()) { allCompNames.push(name); }
    for (const name of extComps) { allCompNames.push(name); }

    if (layouts.length > 1) {
      for (let i = 1; i < layouts.length; i++) {
        errors.push({
          message: 'Multiple layouts: only one layout block is allowed per file (first at line ' + layouts[0].line + ':' + layouts[0].col + ')',
          line: layouts[i].line, col: layouts[i].col, severity: 'error',
        });
      }
    }

    if (layouts.length >= 1) {
      const layoutNode = program.body.find(n => n.type === 'Layout') as LayoutNode | undefined;
      if (layoutNode) {
        let hasSlot = false;
        walkStatements(layoutNode.body, (stmt: Statement) => {
          if (stmt.type === 'Element') {
            const el = stmt as ElementNode;
            if (el.tag === 'slot') { hasSlot = true; }
            if (isComponentTag(el.tag)) {
              usedComponents.add(el.tag);
              if (!definedComponents.has(el.tag) && !extComps.has(el.tag) && importedPaths.length === 0) {
                const suggestion = findSimilar(el.tag, allCompNames);
                errors.push({
                  message: 'Undefined component "' + el.tag + '"' + (suggestion ? ' (did you mean "' + suggestion + '"?)' : ''),
                  line: el.line, col: el.col, severity: 'error',
                  suggestion: suggestion || undefined,
                });
              }
            }
          }
        });
        if (!hasSlot) {
          errors.push({
            message: 'Layout block has no "slot" element — page content will have nowhere to render',
            line: layoutNode.line, col: layoutNode.col, severity: 'error',
          });
        }
      }
    }

    for (const node of program.body) {
      if (node.type === 'Page') {
        const page = node as PageNode;
        if (page.body.length === 0) {
          errors.push({
            message: 'Empty page "' + page.path + '" has no content',
            line: page.line, col: page.col, severity: 'warning',
          });
        }
        walkStatements(page.body, (stmt: Statement) => {
          this.checkStmt(stmt, 'page', errors, definedComponents, extComps, allCompNames, usedComponents, importedPaths);
        });
      } else if (node.type === 'Component') {
        const comp = node as ComponentNode;
        walkStatements(comp.body, (stmt: Statement) => {
          this.checkStmt(stmt, 'component', errors, definedComponents, extComps, allCompNames, usedComponents, importedPaths);
        });
      }
    }

    for (const [name, loc] of definedComponents) {
      if (!usedComponents.has(name)) {
        errors.push({
          message: 'Component "' + name + '" is defined but never used',
          line: loc.line, col: loc.col, severity: 'warning',
        });
      }
    }

    errors.sort((a, b) => {
      if (a.severity !== b.severity) { return a.severity === 'error' ? -1 : 1; }
      return a.line - b.line || a.col - b.col;
    });

    return errors;
  }

  private checkStmt(
    stmt: Statement,
    context: string,
    errors: ValidationError[],
    definedComponents: LocMap,
    extComps: Set<string>,
    allCompNames: string[],
    usedComponents: Set<string>,
    importedPaths: string[],
  ): void {
    if (stmt.type === 'Element') {
      const el = stmt as ElementNode;

      if (el.tag === 'slot' && context === 'page') {
        errors.push({
          message: '"slot" element used outside a layout or component block',
          line: el.line, col: el.col, severity: 'error',
        });
      }

      if (isComponentTag(el.tag)) {
        usedComponents.add(el.tag);
        if (!definedComponents.has(el.tag) && !extComps.has(el.tag)) {
          if (importedPaths.length === 0) {
            const suggestion = findSimilar(el.tag, allCompNames);
            errors.push({
              message: 'Undefined component "' + el.tag + '"' + (suggestion ? ' (did you mean "' + suggestion + '"?)' : ''),
              line: el.line, col: el.col, severity: 'error',
              suggestion: suggestion || undefined,
            });
          }
        }
      }

      if (!isComponentTag(el.tag) && !ELEMENT_TAGS.has(el.tag) && el.tag !== 'style') {
        const suggestion = findSimilarTag(el.tag);
        errors.push({
          message: 'Unknown tag "' + el.tag + '"' + (suggestion ? ' (did you mean "' + suggestion + '"?)' : ''),
          line: el.line, col: el.col, severity: 'warning',
          suggestion: suggestion || undefined,
        });
      }
    }

    if (stmt.type === 'Style') {
      const style = stmt as StyleBlock;
      this.checkDupStyles(style.properties, stmt.line, errors);
      if (style.hover) { this.checkDupStyles(style.hover, stmt.line, errors); }
      if (style.focus) { this.checkDupStyles(style.focus, stmt.line, errors); }
      if (style.active) { this.checkDupStyles(style.active, stmt.line, errors); }
    }
  }

  private checkDupStyles(props: StyleProperty[], blockLine: number, errors: ValidationError[]): void {
    const seen: Map<string, number> = new Map();
    for (let i = 0; i < props.length; i++) {
      const name = props[i].name;
      if (seen.has(name)) {
        errors.push({
          message: 'Duplicate style property "' + name + '" in style block (first at index ' + seen.get(name) + ')',
          line: blockLine, col: 1, severity: 'warning',
        });
      } else {
        seen.set(name, i);
      }
    }
  }
}
