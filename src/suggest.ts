/**
 * Lightweight suggestion helper: Levenshtein distance + top-k nearest picks.
 *
 * Used by compiler & parser to emit "Did you mean ...?" hints on unknown
 * identifiers (theme tokens, tag names, etc.). Kept dependency-free and
 * small — this runs on the happy path of error reporting, not inside
 * hot parsing loops.
 *
 * @since v0.23.3
 */

/**
 * Compute Levenshtein edit distance between two strings.
 * O(m*n) time, O(min(m,n)) space (single-row DP).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter string so the row is smaller
  if (a.length < b.length) {
    const t = a;
    a = b;
    b = t;
  }

  const n = a.length;
  const m = b.length;

  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = curr[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[m];
}

/**
 * Return up to `k` candidates from `pool` that are closest to `needle`,
 * ranked by edit distance ascending, then by lexicographic order for
 * stability. Candidates whose distance exceeds `maxDistance` are dropped.
 *
 * Default `maxDistance` scales with the needle length so that very long
 * tokens don't match arbitrary pool entries.
 */
export function nearestMatches(
  needle: string,
  pool: Iterable<string>,
  k = 3,
  maxDistance?: number,
): string[] {
  const limit =
    maxDistance ?? Math.max(2, Math.floor(needle.length / 3) + 1);
  const scored: Array<{ value: string; dist: number }> = [];
  for (const candidate of pool) {
    if (candidate === needle) continue;
    const d = levenshtein(needle, candidate);
    if (d <= limit) scored.push({ value: candidate, dist: d });
  }
  scored.sort((x, y) => {
    if (x.dist !== y.dist) return x.dist - y.dist;
    return x.value < y.value ? -1 : x.value > y.value ? 1 : 0;
  });
  return scored.slice(0, k).map((s) => s.value);
}

/**
 * Render a "Did you mean ...?" suffix, or empty string if no matches.
 * Wraps each candidate in backticks for diagnostic clarity.
 */
export function didYouMean(candidates: string[]): string {
  if (candidates.length === 0) return '';
  if (candidates.length === 1) return ` Did you mean \`${candidates[0]}\`?`;
  const quoted = candidates.map((c) => `\`${c}\``);
  const last = quoted.pop();
  return ` Did you mean ${quoted.join(', ')} or ${last}?`;
}

/**
 * Format a source-code snippet with line number, content, and a caret
 * positioned under the offending column. Designed for one-line call-site
 * diagnostics. Columns are 1-based (matching lexer convention).
 *
 * Example output:
 * ```
 *    12 | color primary #ff00gg
 *       |                ^
 * ```
 */
export function formatSourceFrame(
  source: string,
  line: number,
  col: number,
  opts: { context?: number } = {},
): string {
  if (!source) return '';
  const lines = source.split(/\r?\n/);
  if (line < 1 || line > lines.length) return '';

  const context = opts.context ?? 0;
  const firstLine = Math.max(1, line - context);
  const lastLine = Math.min(lines.length, line + context);
  const gutterWidth = String(lastLine).length;

  const out: string[] = [];
  for (let ln = firstLine; ln <= lastLine; ln++) {
    const gutter = String(ln).padStart(gutterWidth, ' ');
    out.push(`  ${gutter} | ${lines[ln - 1]}`);
    if (ln === line) {
      const caretPad = ' '.repeat(Math.max(0, col - 1));
      out.push(`  ${' '.repeat(gutterWidth)} | ${caretPad}^`);
    }
  }
  return out.join('\n');
}
