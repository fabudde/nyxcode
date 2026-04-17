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
