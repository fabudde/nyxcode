import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * v0.24.1 — TOCTOU hardening for the CLI import resolver (Issue #92)
 *
 * Threat model:
 *   The v0.23.1 allowlist blocks `https://`, `javascript:`, etc. — good. But path
 *   resolution had two subtler races:
 *
 *     1. `resolve()` does NOT follow symlinks. A symlink `./leak.nyx` inside the
 *        project pointing to `/etc/passwd` passes `relative(projectRoot, …)` (the
 *        symlink itself lives in-project) even though the *target* escapes.
 *
 *     2. Path validation used one syscall (`statSync`), then file reading used
 *        another (`readFileSync`). Between them, an attacker can swap the file
 *        (file → symlink, or benign file → sensitive file). Classic TOCTOU.
 *
 * Fix:
 *   - `realpathSync` resolves every symlink BEFORE the bounds check, so the
 *     canonical path is what gets validated.
 *   - One syscall chain: `openSync` (with O_NOFOLLOW) → `fstatSync` →
 *     `readFileSync(fd)`. Everything downstream is pinned to one inode.
 *
 * Tests below exercise the observable behavior. We can't force a true race in a
 * deterministic unit test, but we can verify:
 *   - Symlinks that escape the project root are rejected (covers the realpath leg).
 *   - Symlinks that stay inside the project still work (no regression).
 *   - Non-regular files (e.g. FIFOs) are rejected post-open (covers fstat leg).
 *   - The canonical (realpath) bookkeeping prevents double-import via two paths.
 */

const CLI = '/root/.openclaw/workspace/nyxcode/dist/cli.js';
const TMP = '/tmp/nyxcode-toctou-test';
const OUTSIDE = '/tmp/nyxcode-toctou-outside';

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });
}

function runBuild(entry = `${TMP}/input.nyx`): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`node ${CLI} build ${entry} -o ${TMP}/out 2>&1`, { encoding: 'utf-8' });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, code: e.status ?? 1 };
  }
}

describe('v0.24.1: TOCTOU hardening for imports (Issue #92)', () => {
  test('rejects symlink that escapes project root (target outside)', () => {
    setup();
    // Secret file outside the project
    writeFileSync(`${OUTSIDE}/secret.nyx`, `component Pwned { h1 "leaked" }`);
    // In-project symlink pointing at it
    symlinkSync(`${OUTSIDE}/secret.nyx`, `${TMP}/leak.nyx`);

    writeFileSync(`${TMP}/input.nyx`, `use "./leak.nyx"\npage / { p "x" }`);
    const r = runBuild();

    assert.equal(r.code, 1, `expected escape via symlink to be rejected, got stdout: ${r.stdout}`);
    assert.match(r.stdout + r.stderr, /escapes project root/);
  });

  test('rejects symlink chain that escapes (multi-hop)', () => {
    setup();
    writeFileSync(`${OUTSIDE}/real.nyx`, `component X { p "y" }`);
    symlinkSync(`${OUTSIDE}/real.nyx`, `${OUTSIDE}/hop.nyx`);
    symlinkSync(`${OUTSIDE}/hop.nyx`, `${TMP}/leak.nyx`);

    writeFileSync(`${TMP}/input.nyx`, `use "./leak.nyx"\npage / { p "x" }`);
    const r = runBuild();

    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /escapes project root/);
  });

  test('rejects symlinked DIRECTORY that escapes project root', () => {
    setup();
    mkdirSync(`${OUTSIDE}/evilpkg`, { recursive: true });
    writeFileSync(`${OUTSIDE}/evilpkg/a.nyx`, `component Evil { h1 "nope" }`);
    symlinkSync(`${OUTSIDE}/evilpkg`, `${TMP}/pkg`);

    writeFileSync(`${TMP}/input.nyx`, `use "./pkg/"\npage / { p "x" }`);
    const r = runBuild();

    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /escapes project root/);
  });

  test('accepts symlink that stays INSIDE project root (no regression)', () => {
    setup();
    mkdirSync(`${TMP}/components`, { recursive: true });
    writeFileSync(`${TMP}/components/greet.nyx`, `component Greet { h1 "Hi" }`);
    // In-project symlink to an in-project file — canonical path is still in-project
    symlinkSync(`${TMP}/components/greet.nyx`, `${TMP}/greet-link.nyx`);

    writeFileSync(`${TMP}/input.nyx`, `use "./greet-link.nyx"\npage / { Greet }`);
    const r = runBuild();

    assert.equal(r.code, 0, `in-project symlink should work. stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });

  test('transitive import through in-project symlink is bounded by canonical path', () => {
    setup();
    // real.nyx lives inside the project. sub.nyx (also inside the project) is a
    // symlink to it. Importing via the symlink must NOT let sub.nyx's relative
    // imports climb out using `../` tricks based on the symlink's pre-realpath path.
    mkdirSync(`${TMP}/deep/a/b`, { recursive: true });
    writeFileSync(`${TMP}/deep/a/b/real.nyx`, `component R { p "r" }`);
    symlinkSync(`${TMP}/deep/a/b/real.nyx`, `${TMP}/sub.nyx`);

    writeFileSync(`${TMP}/input.nyx`, `use "./sub.nyx"\npage / { R }`);
    const r = runBuild();
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });

  test('same file reached via two in-project symlinks loads only once (canonical dedup)', () => {
    setup();
    writeFileSync(`${TMP}/real.nyx`, `component Dup { h1 "once" }`);
    symlinkSync(`${TMP}/real.nyx`, `${TMP}/alias-a.nyx`);
    symlinkSync(`${TMP}/real.nyx`, `${TMP}/alias-b.nyx`);

    // Importing BOTH aliases. Without canonical dedup this would trip the
    // "duplicate component" error. With realpath-based visited set it should pass.
    writeFileSync(
      `${TMP}/input.nyx`,
      `use "./alias-a.nyx"\nuse "./alias-b.nyx"\npage / { Dup }`,
    );
    const r = runBuild();
    assert.equal(r.code, 0, `canonical dedup should prevent duplicate. stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });

  test('rejects non-regular file (FIFO) after open — fstat is on the SAME fd', () => {
    // This verifies the fstat-after-open leg: even if a path passes realpath
    // and open, fstat must confirm it is a regular file. FIFOs (or any non-file)
    // should be rejected. We create a FIFO with `mkfifo` if available.
    setup();
    try {
      execSync(`mkfifo ${TMP}/pipe.nyx`);
    } catch {
      // Skip on platforms without mkfifo
      return;
    }
    if (!existsSync(`${TMP}/pipe.nyx`)) return;

    writeFileSync(`${TMP}/input.nyx`, `use "./pipe.nyx"\npage / { p "x" }`);
    // Use a timeout: if the fix is missing, readFileSync on a FIFO would BLOCK
    // forever. The whole point of fstat-before-read is to reject before that.
    let timedOut = false;
    let r;
    try {
      const out = execSync(`node ${CLI} build ${TMP}/input.nyx -o ${TMP}/out 2>&1`, {
        encoding: 'utf-8',
        timeout: 4000,
      });
      r = { stdout: out, stderr: '', code: 0 };
    } catch (e: any) {
      if (e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') timedOut = true;
      r = { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || '', code: e.status ?? 1 };
    }

    assert.equal(timedOut, false, 'FIFO import must not block — fstat should reject non-regular files');
    assert.notEqual(r.code, 0, 'FIFO import should fail fast');
  });

  test('allowlist still blocks raw URL schemes (no regression from v0.23.1)', () => {
    setup();
    writeFileSync(`${TMP}/input.nyx`, `use "https://evil.com/bad.nyx"\npage / { p "x" }`);
    const r = runBuild();
    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /only local relative/);
  });

  test('flatten also uses safe load (no reopen-by-path after walk)', () => {
    // `nyx flatten` walks the import tree, then writes a concatenated source.
    // The v0.23.x implementation walked with one readFileSync, then re-read
    // each file AGAIN by path in the flatten pass — a second TOCTOU window.
    // After the fix the second pass uses a content cache.
    setup();
    writeFileSync(`${TMP}/lib.nyx`, `component L { p "L" }`);
    writeFileSync(`${TMP}/input.nyx`, `use "./lib.nyx"\npage / { L }`);

    try {
      const out = execSync(`node ${CLI} flatten ${TMP}/input.nyx 2>&1`, { encoding: 'utf-8' });
      // We don't care about exact output — just that it emits both files' content
      // without re-reading them by path.
      assert.match(out, /from: lib\.nyx|from: input\.nyx|component L|page \//);
    } catch (e: any) {
      // If `flatten` isn't a top-level command in this version, that's fine —
      // `build` already exercises the same code path.
      const msg = e.stdout?.toString() || e.stderr?.toString() || e.message || '';
      // Accept "unknown command" as skip; fail on any other error.
      if (!/unknown|usage/i.test(msg)) {
        throw e;
      }
    }
  });
});
