import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// Issue #114 — Compile-time `when __xxx__ ...` blocks.
//
// Semantics:
//  - `when` whose condition references any `__double_underscore__` identifier
//    is evaluated at BUILD time using the compiler's `buildVars` option (fed
//    from `nyx build ... --define KEY=VALUE`).
//  - If the condition is true → children are emitted verbatim.
//  - If false → children are stripped entirely (no wrapper, no JS).
//  - `when .dotRef ...` stays RUNTIME (unchanged JS generation).

function compile(src: string, buildVars: Record<string, string> = {}): { html: string; js: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler({ pretty: true, buildVars }).compile(ast);
  return { html: out.html, js: out.js };
}

describe('v0.26.0: #114 compile-time `when __xxx__`', () => {
  test('`when __env__ == "production"` with env=production → children included', () => {
    const src = `
      page / {
        when __env__ == "production" {
          div { text "analytics_marker" }
        }
        div { text "always" }
      }
    `;
    const { html } = compile(src, { env: 'production' });
    assert.match(html, /analytics_marker/);
    assert.match(html, /always/);
  });

  test('`when __env__ == "production"` with env=development → children stripped', () => {
    const src = `
      page / {
        when __env__ == "production" {
          div { text "analytics_marker" }
        }
        div { text "always" }
      }
    `;
    const { html } = compile(src, { env: 'development' });
    assert.ok(!/analytics_marker/.test(html), 'analytics_marker should be stripped');
    assert.match(html, /always/);
  });

  test('`when __debug__` truthy → included', () => {
    const src = `
      page / {
        when __debug__ {
          div { text "Debug mode active" }
        }
      }
    `;
    const { html } = compile(src, { debug: 'true' });
    assert.match(html, /Debug mode active/);
  });

  test('`when __debug__` not defined → stripped', () => {
    const src = `
      page / {
        when __debug__ {
          div { text "Debug mode active" }
        }
        div { text "hello" }
      }
    `;
    const { html } = compile(src, {}); // __debug__ not defined
    assert.ok(!/Debug mode active/.test(html), 'debug block should be stripped');
    assert.match(html, /hello/);
  });

  test('falsy string values ("" / "0" / "false") are treated as falsy', () => {
    const src = `
      page / {
        when __flag__ {
          div { text "FLAG ON" }
        }
      }
    `;
    for (const v of ['', '0', 'false']) {
      const { html } = compile(src, { flag: v });
      assert.ok(!/FLAG ON/.test(html), `flag=${JSON.stringify(v)} should be falsy`);
    }
  });

  test('`when __env__ != "production"` with env=dev → included', () => {
    const src = `
      page / {
        when __env__ != "production" {
          div { text "dev-only banner" }
        }
      }
    `;
    const { html } = compile(src, { env: 'dev' });
    assert.match(html, /dev-only banner/);
  });

  test('multiple `when` blocks evaluated independently', () => {
    const src = `
      page / {
        when __env__ == "production" { div { text "PROD" } }
        when __debug__ { div { text "DEBUG" } }
        when __beta__ == "true" { div { text "BETA" } }
      }
    `;
    const { html } = compile(src, { env: 'production', beta: 'true' });
    assert.match(html, /PROD/);
    assert.ok(!/DEBUG/.test(html), 'debug (undefined) should be stripped');
    assert.match(html, /BETA/);
  });

  test('nested `when` blocks: both conditions must be true', () => {
    const src = `
      page / {
        when __env__ == "production" {
          when __analytics__ == "enabled" {
            div { text "GA_MARKER" }
          }
        }
      }
    `;
    // Both true
    assert.match(
      compile(src, { env: 'production', analytics: 'enabled' }).html,
      /GA_MARKER/,
    );
    // Outer false → inner stripped even though inner would pass
    assert.ok(
      !/GA_MARKER/.test(compile(src, { env: 'dev', analytics: 'enabled' }).html),
      'outer false should skip inner',
    );
    // Inner false → stripped
    assert.ok(
      !/GA_MARKER/.test(compile(src, { env: 'production', analytics: 'off' }).html),
      'inner false should skip',
    );
  });

  test('`when __env__ ... else ...` branch selection', () => {
    const src = `
      page / {
        when __env__ == "production" {
          div { text "PROD BUILD" }
        } else {
          div { text "DEV BUILD" }
        }
      }
    `;
    assert.match(compile(src, { env: 'production' }).html, /PROD BUILD/);
    assert.ok(!/DEV BUILD/.test(compile(src, { env: 'production' }).html));
    assert.match(compile(src, { env: 'development' }).html, /DEV BUILD/);
    assert.ok(!/PROD BUILD/.test(compile(src, { env: 'development' }).html));
  });

  test('runtime `when .role == "admin"` is NOT affected (still generates JS)', () => {
    const src = `
      page / {
        state role = "admin"
        when .role == "admin" {
          div { text "admin panel" }
        }
      }
    `;
    const { html, js } = compile(src);
    // Runtime when wraps content in a div id="cond_N" and emits render_* JS.
    assert.match(html, /id="cond_\d+"/, 'runtime when should emit wrapper div');
    assert.match(js, /function render_cond_\d+/, 'runtime when should emit JS');
    assert.match(js, /__nyx\.state\.role == "admin"/);
  });

  test('compile-time when produces NO wrapper div and NO runtime JS', () => {
    const src = `
      page / {
        when __env__ == "production" {
          div { text "prod" }
        }
      }
    `;
    const { html, js } = compile(src, { env: 'production' });
    assert.ok(!/id="cond_/.test(html), 'compile-time when must NOT emit cond_ wrapper');
    assert.ok(!/function render_cond_/.test(js), 'compile-time when must NOT emit runtime JS');
    assert.match(html, /prod/);
  });

  test('compile-time when (false branch) produces no output and no runtime JS', () => {
    const src = `
      page / {
        when __env__ == "production" {
          div { text "SHOULD NOT APPEAR" }
        }
      }
    `;
    const { html, js } = compile(src, { env: 'development' });
    assert.ok(!/SHOULD NOT APPEAR/.test(html));
    assert.ok(!/id="cond_/.test(html));
    assert.ok(!/function render_cond_/.test(js));
  });

  test('--define CLI flag passes through correctly', () => {
    // Locate the CLI in dist/ relative to this compiled test file.
    const here = dirname(fileURLToPath(import.meta.url));
    const cli = resolve(here, '..', 'cli.js'); // dist/cli.js
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-cti-'));
    try {
      const input = join(tmp, 'app.nyx');
      writeFileSync(input, [
        'page / {',
        '  when __env__ == "production" {',
        '    div { text "PROD" }',
        '  }',
        '  when __env__ != "production" {',
        '    div { text "DEV" }',
        '  }',
        '  div { text "always" }',
        '}',
        '',
      ].join('\n'));

      const outFile = join(tmp, 'out.html');
      const res = spawnSync(
        process.execPath,
        [cli, 'build', input, '-o', outFile, '--define', 'env=production'],
        { encoding: 'utf-8' },
      );
      assert.equal(res.status, 0, `CLI exit non-zero: ${res.stderr}\n${res.stdout}`);
      const html = readFileSync(outFile, 'utf-8');
      assert.match(html, /PROD/, 'production branch should be included');
      assert.ok(!/>DEV</.test(html) && !/text.*DEV/.test(html) && !html.includes('>DEV<'),
        'dev branch should be stripped');
      assert.match(html, /always/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('--define=key=value (eq-form) also works', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const cli = resolve(here, '..', 'cli.js');
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-cti-eq-'));
    try {
      const input = join(tmp, 'app.nyx');
      writeFileSync(input, [
        'page / {',
        '  when __debug__ { div { text "DEBUGMARK" } }',
        '}',
        '',
      ].join('\n'));
      const outFile = join(tmp, 'out.html');
      const res = spawnSync(
        process.execPath,
        [cli, 'build', input, '-o', outFile, '--define=debug=true'],
        { encoding: 'utf-8' },
      );
      assert.equal(res.status, 0, res.stderr);
      const html = readFileSync(outFile, 'utf-8');
      assert.match(html, /DEBUGMARK/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('bare `--define key` (no value) defaults to truthy', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const cli = resolve(here, '..', 'cli.js');
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-cti-bare-'));
    try {
      const input = join(tmp, 'app.nyx');
      writeFileSync(input, [
        'page / {',
        '  when __debug__ { div { text "BAREMARK" } }',
        '}',
        '',
      ].join('\n'));
      const outFile = join(tmp, 'out.html');
      const res = spawnSync(
        process.execPath,
        [cli, 'build', input, '-o', outFile, '--define', 'debug'],
        { encoding: 'utf-8' },
      );
      assert.equal(res.status, 0, res.stderr);
      const html = readFileSync(outFile, 'utf-8');
      assert.match(html, /BAREMARK/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
