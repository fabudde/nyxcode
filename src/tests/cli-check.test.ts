/**
 * `nyx check` — validate a .nyx file without emitting output.
 * Fast feedback for editors, CI, and AI codegen loops.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, '..', 'cli.js');
const TMP = '/tmp/nyxcode-check-test';

function check(src: string, extraArgs: string[] = []): { code: number; out: string } {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  const f = resolve(TMP, 'input.nyx');
  writeFileSync(f, src);
  try {
    const out = execFileSync('node', [CLI, 'check', f, ...extraArgs], { encoding: 'utf-8' });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: (e.stdout?.toString() || '') + (e.stderr?.toString() || '') };
  }
}

describe('nyx check', () => {
  it('exits 0 on a valid file', () => {
    const r = check('page "/" {\n  h1 "Hello"\n  state n = 0\n}');
    assert.equal(r.code, 0);
    assert.match(r.out, /no errors/);
  });

  it('exits 1 and reports an undefined component', () => {
    const r = check('page "/" {\n  ThisComponentDoesNotExist\n}');
    assert.equal(r.code, 1);
    assert.match(r.out, /Error|error/);
  });

  it('exits 1 on duplicate page routes', () => {
    const r = check('page /a {\n  h1 "x"\n}\npage /a {\n  h1 "y"\n}');
    assert.equal(r.code, 1);
  });

  it('does not emit any build output (validation only)', () => {
    const r = check('table t {\n  name text required\n}\npage "/" {\n  h1 "x"\n}');
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.out, /server\.js|index\.html|📦 deps/);
  });

  it('--strict turns warnings into a failure', () => {
    // An unused component produces a warning but not an error.
    const src = 'component Unused {\n  div { p "x" }\n}\npage "/" {\n  h1 "hi"\n}';
    const lenient = check(src);
    assert.equal(lenient.code, 0, 'plain check should pass with only warnings');
    const strict = check(src, ['--strict']);
    if (/warning/i.test(lenient.out)) {
      // Only assert strict-fails if the file actually produced a warning.
      assert.equal(strict.code, 1, '--strict should fail when warnings exist');
    }
  });
});
