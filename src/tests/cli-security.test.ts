import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

// v0.23.1 — CLI-level security: allowlist for import paths (use "..." and theme extends "...")
//
// Recommended by @TytoTheOwl 🦉: denylist of (https?|ftp|file|//) missed future schemes
// (javascript:, data:, ws:, wss:, ssh:, git:, s3:, gs:, etc.). Switched to an allowlist.

const CLI = '/root/.openclaw/workspace/nyxcode/dist/cli.js';
const TMP = '/tmp/nyxcode-sec-test';

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function runBuild(src: string): { stdout: string; stderr: string; code: number } {
  writeFileSync(`${TMP}/input.nyx`, src);
  try {
    const stdout = execSync(`node ${CLI} build ${TMP}/input.nyx -o ${TMP}/out 2>&1`, { encoding: 'utf-8' });
    return { stdout, stderr: '', code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, code: e.status ?? 1 };
  }
}

describe('v0.23.1: CLI import-path allowlist', () => {
  test('rejects http:// URLs', () => {
    setup();
    const r = runBuild(`use "http://evil.com/bad.nyx"\npage / { p "x" }`);
    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /only local relative/);
  });

  test('rejects https:// URLs', () => {
    setup();
    const r = runBuild(`use "https://evil.com/bad.nyx"\npage / { p "x" }`);
    assert.equal(r.code, 1);
  });

  test('rejects javascript: scheme (future-proof)', () => {
    setup();
    const r = runBuild(`use "javascript:alert(1)"\npage / { p "x" }`);
    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /only local relative/);
  });

  test('rejects data: scheme (future-proof)', () => {
    setup();
    const r = runBuild(`use "data:text/plain;base64,aGVsbG8="\npage / { p "x" }`);
    assert.equal(r.code, 1);
  });

  test('rejects ws:// scheme (future-proof)', () => {
    setup();
    const r = runBuild(`use "ws://server/bad.nyx"\npage / { p "x" }`);
    assert.equal(r.code, 1);
  });

  test('rejects protocol-relative //host/', () => {
    setup();
    const r = runBuild(`use "//evil.com/bad.nyx"\npage / { p "x" }`);
    assert.equal(r.code, 1);
  });

  test('rejects git+ssh:// (compound scheme)', () => {
    setup();
    const r = runBuild(`use "git+ssh://git@host/bad.nyx"\npage / { p "x" }`);
    assert.equal(r.code, 1);
  });

  test('accepts local relative ./component.nyx', () => {
    setup();
    writeFileSync(`${TMP}/comp.nyx`, `component Greet { h1 "Hi" }`);
    const r = runBuild(`use "./comp.nyx"\npage / { Greet }`);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  });

  test('theme extends also enforces allowlist', () => {
    setup();
    const r = runBuild(`theme extends "javascript:void(0)" { colors { x: #fff } }\npage / { p "x" }`);
    // Rejected at parse time (extends enforces relative path) — either way: non-zero exit
    assert.equal(r.code, 1);
  });
});
