/**
 * NyxCode Validator
 *
 * Runs BEFORE the compiler to catch errors early with helpful messages.
 * Performs static analysis on the AST — does NOT modify it.
 *
 * Errors block compilation. Warnings are advisory.
 */
const ELEMENT_TAGS = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'text', 'span', 'link', 'img', 'picture', 'video', 'audio', 'source', 'track', 'iframe', 'canvas', 'icon',
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
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = [];
    for (let i = 0; i <= m; i++) {
        dp[i] = [];
        for (let j = 0; j <= n; j++) {
            if (i === 0) {
                dp[i][j] = j;
            }
            else if (j === 0) {
                dp[i][j] = i;
            }
            else {
                dp[i][j] = 0;
            }
        }
    }
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}
function findSimilar(name, candidates, maxDist = 2) {
    let best = null;
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
function walkStatements(body, callback) {
    for (const stmt of body) {
        callback(stmt);
        switch (stmt.type) {
            case 'Element': {
                const el = stmt;
                if (el.children.length > 0) {
                    walkStatements(el.children, callback);
                }
                break;
            }
            case 'Each': {
                const each = stmt;
                if (each.body && each.body.length > 0) {
                    walkStatements(each.body, callback);
                }
                break;
            }
            case 'When': {
                const when = stmt;
                if (when.body && when.body.length > 0) {
                    walkStatements(when.body, callback);
                }
                if (when.elseBody && when.elseBody.length > 0) {
                    walkStatements(when.elseBody, callback);
                }
                break;
            }
            case 'Form': {
                const form = stmt;
                if (form.body && form.body.length > 0) {
                    walkStatements(form.body, callback);
                }
                break;
            }
        }
    }
}
function isComponentTag(tag) {
    return tag.length > 0 && tag[0] >= 'A' && tag[0] <= 'Z';
}
function findSimilarTag(tag) {
    return findSimilar(tag, Array.from(ELEMENT_TAGS));
}
export class Validator {
    validate(program, importedComponents) {
        const errors = [];
        const definedComponents = new Map();
        const importedPaths = [];
        const usedComponents = new Set();
        const pageRoutes = new Map();
        const layouts = [];
        const extComps = importedComponents || new Set();
        const allCompNames = [];
        for (const node of program.body) {
            if (node.type === 'Component') {
                const comp = node;
                if (definedComponents.has(comp.name)) {
                    const first = definedComponents.get(comp.name);
                    errors.push({
                        message: 'Duplicate component name "' + comp.name + '" (first defined at line ' + first.line + ':' + first.col + ')',
                        line: comp.line, col: comp.col, severity: 'error',
                    });
                }
                else {
                    definedComponents.set(comp.name, { line: comp.line, col: comp.col });
                }
            }
            else if (node.type === 'Page') {
                const page = node;
                if (pageRoutes.has(page.path)) {
                    const first = pageRoutes.get(page.path);
                    errors.push({
                        message: 'Duplicate page route "' + page.path + '" (first defined at line ' + first.line + ':' + first.col + ')',
                        line: page.line, col: page.col, severity: 'error',
                    });
                }
                else {
                    pageRoutes.set(page.path, { line: page.line, col: page.col });
                }
            }
            else if (node.type === 'Layout') {
                layouts.push({ line: node.line, col: node.col });
            }
            else if (node.type === 'Use') {
                importedPaths.push(node.path);
            }
        }
        for (const name of definedComponents.keys()) {
            allCompNames.push(name);
        }
        for (const name of extComps) {
            allCompNames.push(name);
        }
        if (layouts.length > 1) {
            for (let i = 1; i < layouts.length; i++) {
                errors.push({
                    message: 'Multiple layouts: only one layout block is allowed per file (first at line ' + layouts[0].line + ':' + layouts[0].col + ')',
                    line: layouts[i].line, col: layouts[i].col, severity: 'error',
                });
            }
        }
        if (layouts.length >= 1) {
            const layoutNode = program.body.find(n => n.type === 'Layout');
            if (layoutNode) {
                let hasSlot = false;
                walkStatements(layoutNode.body, (stmt) => {
                    if (stmt.type === 'Element') {
                        const el = stmt;
                        if (el.tag === 'slot') {
                            hasSlot = true;
                        }
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
                const page = node;
                if (page.body.length === 0) {
                    errors.push({
                        message: 'Empty page "' + page.path + '" has no content',
                        line: page.line, col: page.col, severity: 'warning',
                    });
                }
                walkStatements(page.body, (stmt) => {
                    this.checkStmt(stmt, 'page', errors, definedComponents, extComps, allCompNames, usedComponents, importedPaths);
                });
            }
            else if (node.type === 'Component') {
                const comp = node;
                walkStatements(comp.body, (stmt) => {
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
            if (a.severity !== b.severity) {
                return a.severity === 'error' ? -1 : 1;
            }
            return a.line - b.line || a.col - b.col;
        });
        return errors;
    }
    checkStmt(stmt, context, errors, definedComponents, extComps, allCompNames, usedComponents, importedPaths) {
        if (stmt.type === 'Element') {
            const el = stmt;
            if (el.tag === 'slot' && context === 'page') {
                errors.push({
                    message: '"slot" element used outside a layout or component block',
                    line: el.line, col: el.col, severity: 'error',
                });
            }
            // A tag is a component if either:
            //   (a) it matches PascalCase convention (isComponentTag), OR
            //   (b) it's declared in definedComponents or imported via extComps.
            // Rule (b) ensures lower-case component names (e.g. `component compA`) are
            // still recognized as components, fixing false "unused" + "unknown tag"
            // warnings for cross-file imports (issue #78).
            const isKnownComponent = definedComponents.has(el.tag) || extComps.has(el.tag);
            if (isComponentTag(el.tag) || isKnownComponent) {
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
            else if (!ELEMENT_TAGS.has(el.tag) && el.tag !== 'style') {
                const suggestion = findSimilarTag(el.tag);
                errors.push({
                    message: 'Unknown tag "' + el.tag + '"' + (suggestion ? ' (did you mean "' + suggestion + '"?)' : ''),
                    line: el.line, col: el.col, severity: 'warning',
                    suggestion: suggestion || undefined,
                });
            }
        }
        if (stmt.type === 'Style') {
            const style = stmt;
            this.checkDupStyles(style.properties, stmt.line, errors);
            if (style.hover) {
                this.checkDupStyles(style.hover, stmt.line, errors);
            }
            if (style.focus) {
                this.checkDupStyles(style.focus, stmt.line, errors);
            }
            if (style.active) {
                this.checkDupStyles(style.active, stmt.line, errors);
            }
        }
    }
    checkDupStyles(props, blockLine, errors) {
        const seen = new Map();
        for (let i = 0; i < props.length; i++) {
            const name = props[i].name;
            if (seen.has(name)) {
                errors.push({
                    message: 'Duplicate style property "' + name + '" in style block (first at index ' + seen.get(name) + ')',
                    line: blockLine, col: 1, severity: 'warning',
                });
            }
            else {
                seen.set(name, i);
            }
        }
    }
}
//# sourceMappingURL=validator.js.map