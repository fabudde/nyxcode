/**
 * Figma / W3C Design Tokens Community Group (DTCG) importer.
 *
 * Reads a JSON token file exported from Tokens Studio for Figma (or any
 * DTCG-compliant tool) and emits a NyxCode `@theme { ... }` block as text.
 *
 * Supported formats:
 *   - DTCG (W3C): nested groups with `{ "$value": ..., "$type": ... }` leaves
 *   - Tokens Studio legacy: same shape without `$` prefix (`value`, `type`)
 *
 * Supported token categories (mapped to NyxCode @theme sections):
 *   color          → colors
 *   dimension      → spacing (or radius when group name contains "radius")
 *   borderRadius   → radius
 *   spacing        → spacing
 *   fontFamily     → fonts
 *   shadow         → shadows
 *   typography     → fonts (composite; we extract fontFamily only)
 *
 * Nested groups use dash-joined path names (e.g. `color.brand.primary` →
 * `brand-primary`). Collisions are reported as warnings.
 *
 * @since v0.23.5
 */

export interface FigmaImportOptions {
  /** Theme block name (`theme as "name"`). Defaults to undefined = anonymous. */
  themeName?: string;
  /** If true, collapse a single top-level "global" group. Default: true. */
  unwrapGlobal?: boolean;
}

export interface ImportResult {
  /** The generated NyxCode source code. */
  nyx: string;
  /** Human-readable stats: token counts per section. */
  stats: Record<string, number>;
  /** Warnings emitted during conversion (unknown types, skipped composites). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// SECURITY: Input sanitization (Issue #95, Tyto 🦉 review 2026-04-17)
//
// External token files are untrusted. A malicious Figma/DTCG export could try
// to inject CSS payloads like `url(javascript:alert(1))`, `expression(...)`,
// or `<script>` fragments via font-family names. We validate every value with
// a strict per-type allowlist. Invalid tokens are SKIPPED (not rejected as a
// whole file) with a warning.
// ---------------------------------------------------------------------------

/** CSS named colors (CSS Color Module Level 4). */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black',
  'blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue',
  'darkcyan','darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki',
  'darkmagenta','darkolivegreen','darkorange','darkorchid','darkred','darksalmon',
  'darkseagreen','darkslateblue','darkslategray','darkslategrey','darkturquoise',
  'darkviolet','deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick',
  'floralwhite','forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod',
  'gray','green','greenyellow','grey','honeydew','hotpink','indianred','indigo',
  'ivory','khaki','lavender','lavenderblush','lawngreen','lemonchiffon','lightblue',
  'lightcoral','lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey',
  'lightpink','lightsalmon','lightseagreen','lightskyblue','lightslategray',
  'lightslategrey','lightsteelblue','lightyellow','lime','limegreen','linen','magenta',
  'maroon','mediumaquamarine','mediumblue','mediumorchid','mediumpurple',
  'mediumseagreen','mediumslateblue','mediumspringgreen','mediumturquoise',
  'mediumvioletred','midnightblue','mintcream','mistyrose','moccasin','navajowhite',
  'navy','oldlace','olive','olivedrab','orange','orangered','orchid','palegoldenrod',
  'palegreen','paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink',
  'plum','powderblue','purple','rebeccapurple','red','rosybrown','royalblue',
  'saddlebrown','salmon','sandybrown','seagreen','seashell','sienna','silver',
  'skyblue','slateblue','slategray','slategrey','snow','springgreen','steelblue',
  'tan','teal','thistle','tomato','turquoise','violet','wheat','white','whitesmoke',
  'yellow','yellowgreen',
  // Special keywords accepted in color positions
  'transparent','currentcolor',
]);

/** Allowed CSS dimension units (lengths + viewport + relative). */
const ALLOWED_UNITS: ReadonlySet<string> = new Set([
  'px','rem','em','%','vw','vh','ch','lh','cap',
]);

/** Allowed CSS border styles. */
const ALLOWED_BORDER_STYLES: ReadonlySet<string> = new Set([
  'none','hidden','dotted','dashed','solid','double','groove','ridge','inset','outset',
]);

/**
 * Detect obviously dangerous substrings that must never appear in any value,
 * regardless of section. Used as a belt-and-suspenders check alongside the
 * per-type allowlists.
 */
function hasDangerousSubstring(s: string): boolean {
  const lower = s.toLowerCase();
  if (/[<>\\`\x00-\x1f]/.test(s)) return true;
  if (lower.includes('javascript:')) return true;
  if (lower.includes('data:')) return true;
  if (lower.includes('vbscript:')) return true;
  if (lower.includes('expression(')) return true;
  if (lower.includes('url(')) return true;
  if (lower.includes('@import')) return true;
  if (lower.includes('/*') || lower.includes('*/')) return true;
  // CSS var() is not a literal value — we emit our own var() wrappers in the
  // compiler; a token value containing var() would be a forwarding reference
  // that bypasses our theme system.
  if (/\bvar\s*\(/i.test(s)) return true;
  return false;
}

/**
 * Validate a single color value. Allowed:
 *   - #rgb, #rgba, #rrggbb, #rrggbbaa hex
 *   - rgb(...) / rgba(...) / hsl(...) / hsla(...) with numeric args only
 *   - CSS named colors (+ transparent, currentColor)
 */
export function isValidColor(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (hasDangerousSubstring(s)) return false;

  // Hex: #rgb | #rgba | #rrggbb | #rrggbbaa
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) {
    return true;
  }

  // rgb()/rgba()/hsl()/hsla() — args: numbers, percentages, commas, spaces,
  // slashes (for modern `rgb(r g b / a)` syntax), dots. Nothing else.
  const fnMatch = /^(rgb|rgba|hsl|hsla)\s*\(([^)]*)\)$/i.exec(s);
  if (fnMatch) {
    const args = fnMatch[2] ?? '';
    // No nested parens, no letters other than whitespace-safe; allow digits,
    // commas, spaces, dots, percent, minus, slash.
    if (/[^0-9,.\s%\-\/]/.test(args)) return false;
    return true;
  }

  // Named color
  if (CSS_NAMED_COLORS.has(s.toLowerCase())) return true;

  return false;
}

/**
 * Validate a single CSS dimension value: `0` or `<number><unit>`.
 * Rejects calc(), url(), expression(), var(), arithmetic, anything else.
 */
export function isValidDimension(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (hasDangerousSubstring(s)) return false;

  // Bare zero
  if (s === '0') return true;

  // <number><unit> — optional sign, optional decimal, unit required
  const m = /^(-?\d+(?:\.\d+)?|-?\.\d+)([a-zA-Z%]+)$/.exec(s);
  if (!m) return false;
  const unit = (m[2] ?? '').toLowerCase();
  return ALLOWED_UNITS.has(unit);
}

/**
 * Validate a font-family stack. Each family must be simple identifiers or
 * quoted strings with only safe characters.
 *
 * Allowed characters inside a family name: a-zA-Z0-9, space, hyphen.
 * Quotes (single or double) are permitted as wrappers.
 * Multiple families are separated by commas.
 */
export function isValidFontFamily(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (hasDangerousSubstring(s)) return false;

  // Split on commas not inside quotes. Good enough for our constrained grammar.
  const parts = splitFontFamilies(s);
  if (parts.length === 0) return false;
  for (const part of parts) {
    const p = part.trim();
    if (!p) return false;
    // Strip matching surrounding quotes
    let inner = p;
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
      inner = p.slice(1, -1);
    }
    // Inner must be a-zA-Z0-9, space, hyphen only. No quotes, no parens, no
    // backslashes, no digits-only garbage in the middle.
    if (!/^[a-zA-Z][a-zA-Z0-9\s-]*$/.test(inner)) return false;
  }
  return true;
}

function splitFontFamilies(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ',') {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Validate a shadow string: `[<dimension> <dimension> <dimension> (<dimension>)? <color>]`
 * with optional leading `inset`. We re-parse the composed string to ensure
 * no free-form text ever reaches the output.
 */
export function isValidShadow(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (hasDangerousSubstring(s)) return false;

  // Tokenize: split on top-level whitespace, but keep fn-call groups (e.g.
  // `rgba(0, 0, 0, 0.1)`) as one token.
  const tokens = splitShadowTokens(s);
  if (tokens.length < 3) return false;

  // Optional leading `inset`
  let i = 0;
  if (tokens[i]?.toLowerCase() === 'inset') i++;

  // offsetX, offsetY required
  if (!isValidDimension(tokens[i++] ?? '')) return false;
  if (!isValidDimension(tokens[i++] ?? '')) return false;

  // Remaining tokens: 0-2 dimensions (blur, spread), then a final color.
  // Color is always last.
  const remaining = tokens.slice(i);
  if (remaining.length === 0 || remaining.length > 3) return false;

  const colorTok = remaining[remaining.length - 1]!;
  if (!isValidColor(colorTok)) return false;

  for (let j = 0; j < remaining.length - 1; j++) {
    if (!isValidDimension(remaining[j]!)) return false;
  }
  return true;
}

function splitShadowTokens(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      depth--;
      buf += ch;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Validate a CSS border shorthand: `<width> <style> <color>` (each part
 * validated with its own allowlist). Order-tolerant.
 */
export function isValidBorder(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  if (!s) return false;
  if (hasDangerousSubstring(s)) return false;

  const tokens = splitShadowTokens(s);
  if (tokens.length !== 3) return false;

  let widthOk = false, styleOk = false, colorOk = false;
  for (const tok of tokens) {
    if (!widthOk && isValidDimension(tok)) { widthOk = true; continue; }
    if (!styleOk && ALLOWED_BORDER_STYLES.has(tok.toLowerCase())) { styleOk = true; continue; }
    if (!colorOk && isValidColor(tok)) { colorOk = true; continue; }
    return false;
  }
  return widthOk && styleOk && colorOk;
}

type Section = 'colors' | 'spacing' | 'radius' | 'fonts' | 'shadows';

interface NormalizedToken {
  section: Section;
  key: string;
  value: string;
}

const TYPE_TO_SECTION: Record<string, Section> = {
  color: 'colors',
  colors: 'colors',
  spacing: 'spacing',
  sizing: 'spacing',
  dimension: 'spacing',
  borderradius: 'radius',
  'border-radius': 'radius',
  radius: 'radius',
  fontfamily: 'fonts',
  'font-family': 'fonts',
  typography: 'fonts',
  boxshadow: 'shadows',
  'box-shadow': 'shadows',
  shadow: 'shadows',
};

function normalizeKey(seg: string): string {
  return seg
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatColor(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('#')) return v;
  if (/^[0-9a-fA-F]{3,8}$/.test(v)) return '#' + v;
  return v;
}

function formatDimension(raw: unknown): string {
  if (typeof raw === 'number') return raw === 0 ? '0' : `${raw}px`;
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && 'value' in (raw as any)) {
    const obj = raw as { value: unknown; unit?: string };
    const unit = obj.unit ?? 'px';
    const num = obj.value;
    if (typeof num === 'number') return num === 0 ? '0' : `${num}${unit}`;
    return `${num}${unit}`;
  }
  return String(raw);
}

function formatFontFamily(raw: unknown): string {
  const entries = Array.isArray(raw) ? raw : [raw];
  return entries
    .map((e) => {
      const s = String(e).trim();
      if (/\s/.test(s) && !/^["']/.test(s)) return `"${s}"`;
      return s;
    })
    .join(', ');
}

function formatShadow(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    const parts: string[] = [
      formatDimension(o.offsetX ?? 0),
      formatDimension(o.offsetY ?? 0),
      formatDimension(o.blur ?? 0),
    ];
    if (o.spread !== undefined && o.spread !== 0) {
      parts.push(formatDimension(o.spread));
    }
    if (o.color !== undefined) {
      parts.push(formatColor(String(o.color)));
    }
    return parts.join(' ');
  }
  return String(raw);
}

interface LeafRead {
  value: unknown;
  type?: string;
}

function readLeaf(node: any): LeafRead | null {
  if (node == null || typeof node !== 'object') return null;
  if ('$value' in node) {
    return { value: node.$value, type: node.$type };
  }
  if ('value' in node && 'type' in node) {
    return { value: node.value, type: node.type };
  }
  return null;
}

function walk(
  node: any,
  pathStack: string[],
  warnings: string[],
  out: NormalizedToken[],
): void {
  if (node == null || typeof node !== 'object') return;

  const leaf = readLeaf(node);
  if (leaf) {
    const explicitType = (leaf.type || '').toLowerCase();
    let section: Section | null = TYPE_TO_SECTION[explicitType] ?? null;
    if (!section) {
      const root = (pathStack[0] || '').toLowerCase();
      section = TYPE_TO_SECTION[root] ?? null;
      if (!section && explicitType === 'dimension') {
        const joined = pathStack.join('/').toLowerCase();
        section = /radius/.test(joined) ? 'radius' : 'spacing';
      }
    }
    // Radius heuristic even if type says "dimension" or "spacing"
    if (section === 'spacing') {
      const joined = pathStack.join('/').toLowerCase();
      if (/radius|border-radius|corner/.test(joined)) section = 'radius';
    }

    if (!section) {
      warnings.push(
        `Skipped token "${pathStack.join('.')}" — unknown type "${explicitType || 'unspecified'}"`,
      );
      return;
    }

    let rawValue: unknown = leaf.value;
    if (section === 'fonts') {
      if (rawValue && typeof rawValue === 'object' && 'fontFamily' in (rawValue as any)) {
        rawValue = (rawValue as any).fontFamily;
      }
    }

    let formatted: string;
    switch (section) {
      case 'colors':
        formatted = formatColor(String(rawValue));
        break;
      case 'spacing':
      case 'radius':
        formatted = formatDimension(rawValue);
        break;
      case 'fonts':
        formatted = formatFontFamily(rawValue);
        break;
      case 'shadows':
        formatted = formatShadow(rawValue);
        break;
    }

    // --- SECURITY GATE (Issue #95) ----------------------------------------
    // Validate the formatted output against a per-section allowlist. A single
    // bad token is skipped with a warning — we never abort the whole import.
    let securityOk = false;
    switch (section) {
      case 'colors':
        securityOk = isValidColor(formatted);
        break;
      case 'spacing':
      case 'radius':
        securityOk = isValidDimension(formatted);
        break;
      case 'fonts':
        securityOk = isValidFontFamily(formatted);
        break;
      case 'shadows':
        securityOk = isValidShadow(formatted);
        break;
    }
    if (!securityOk) {
      warnings.push(
        `Skipped token "${pathStack.join('.')}" — value failed ${section} validation (possible injection): ${JSON.stringify(formatted).slice(0, 80)}`,
      );
      return;
    }
    // ---------------------------------------------------------------------

    const skipFirst =
      pathStack.length > 1 &&
      TYPE_TO_SECTION[(pathStack[0] || '').toLowerCase()] === section;
    const segs = skipFirst ? pathStack.slice(1) : pathStack;
    const key = segs.map(normalizeKey).filter(Boolean).join('-');

    if (!key) {
      warnings.push(
        `Skipped token at path "${pathStack.join('.')}" — empty key after normalization`,
      );
      return;
    }

    out.push({ section, key, value: formatted });
    return;
  }

  for (const [k, child] of Object.entries(node)) {
    if (k.startsWith('$')) continue;
    walk(child, [...pathStack, k], warnings, out);
  }
}

function serialize(
  tokens: NormalizedToken[],
  opts: FigmaImportOptions,
): { nyx: string; stats: Record<string, number> } {
  const buckets: Record<Section, Array<{ key: string; value: string }>> = {
    colors: [],
    spacing: [],
    radius: [],
    fonts: [],
    shadows: [],
  };
  const seen: Record<Section, Set<string>> = {
    colors: new Set(),
    spacing: new Set(),
    radius: new Set(),
    fonts: new Set(),
    shadows: new Set(),
  };

  for (const t of tokens) {
    if (seen[t.section].has(t.key)) continue;
    seen[t.section].add(t.key);
    buckets[t.section].push({ key: t.key, value: t.value });
  }

  const stats: Record<string, number> = {};
  for (const key of Object.keys(buckets) as Section[]) {
    if (buckets[key].length > 0) stats[key] = buckets[key].length;
  }

  const lines: string[] = [];
  const header = opts.themeName
    ? `theme as "${opts.themeName}" {`
    : `theme {`;
  lines.push(header);

  for (const section of ['colors', 'spacing', 'radius', 'fonts', 'shadows'] as const) {
    const items = buckets[section];
    if (items.length === 0) continue;
    lines.push(`  ${section} {`);
    for (const { key, value } of items) {
      lines.push(`    ${key}: ${value}`);
    }
    lines.push(`  }`);
  }

  lines.push(`}`);
  return { nyx: lines.join('\n') + '\n', stats };
}

export function importFigmaTokens(
  json: unknown,
  opts: FigmaImportOptions = {},
): ImportResult {
  const options: FigmaImportOptions = { unwrapGlobal: true, ...opts };
  if (json == null || typeof json !== 'object') {
    return {
      nyx: '',
      stats: {},
      warnings: ['Input is not a JSON object — nothing to import.'],
    };
  }

  let root: any = json;
  if (options.unwrapGlobal) {
    const keys = Object.keys(root).filter((k) => !k.startsWith('$'));
    if (
      keys.length === 1 &&
      typeof root[keys[0]] === 'object' &&
      root[keys[0]] !== null &&
      !('$value' in root[keys[0]]) &&
      !('value' in root[keys[0]])
    ) {
      const onlyKey = keys[0].toLowerCase();
      if (!TYPE_TO_SECTION[onlyKey]) {
        root = root[keys[0]];
      }
    }
  }

  const warnings: string[] = [];
  const tokens: NormalizedToken[] = [];
  walk(root, [], warnings, tokens);

  if (tokens.length === 0) {
    warnings.push(
      'No recognized tokens found. Expected DTCG ($value/$type) or Tokens Studio (value/type) format.',
    );
    return { nyx: '', stats: {}, warnings };
  }

  const { nyx, stats } = serialize(tokens, options);
  return { nyx, stats, warnings };
}
