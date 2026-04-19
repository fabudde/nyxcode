import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lexer } from '../lexer.js';
import { Parser } from '../parser.js';
import { Compiler } from '../compiler.js';

// v0.25.1 — Regression tests for Issue #122.
//
// After the v0.25.0 parser additions (body / selection / defaults theme sections),
// we assert that the original `key: value` theme token parsing still works AND
// that the new sections cleanly coexist with `colors`, `spacing`, `radius`, etc.
//
// Also covers:
//   - `defaults { ... }` inside theme parses cleanly (no stray `}`)
//   - CLI `-o build.html` flag routes output correctly
//   - Components with hyphenated names don't emit false unused/unknown warnings
//   - CLI `--version` prints only the version and exits

function compile(src: string): { html: string; css: string } {
  const ast = new Parser(new Lexer(src).tokenize()).parse();
  const out = new Compiler().compile(ast);
  return { html: out.html, css: out.css };
}

// Resolve dist/cli.js relative to THIS test file at runtime. Works whether the
// compiled test is at dist/tests/... or dist-site/..., and survives cwd changes.
const CLI_PATH = fileURLToPath(new URL('../cli.js', import.meta.url));

describe('v0.25.1: #122 theme token colon syntax — regression', () => {
  test('bg: #0f0d0a still emits --colors-bg:#0f0d0a', () => {
    const src = `
theme {
  colors {
    bg: #0f0d0a
    text: #e8e2d5
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /--colors-bg:\s*#0f0d0a/);
    assert.match(html, /--colors-text:\s*#e8e2d5/);
    // Must NOT contain the corrupted forms from the bug report
    assert.doesNotMatch(html, /--colors-bg::/);
    assert.doesNotMatch(html, /--colors-#0f0d0a/);
  });

  test('hyphenated keys with colon syntax: bg-elevated: #1a1612', () => {
    const src = `
theme {
  colors {
    bg: #0f0d0a
    bg-elevated: #1a1612
    text: #e8e2d5
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /--colors-bg:\s*#0f0d0a/);
    assert.match(html, /--colors-bg-elevated:\s*#1a1612/);
    assert.match(html, /--colors-text:\s*#e8e2d5/);
  });

  test('multiple sections (colors + spacing + radius) with colon syntax', () => {
    const src = `
theme {
  colors {
    bg: #0f0d0a
    text: #e8e2d5
  }
  spacing {
    xs: 4px
    sm: 8px
  }
  radius {
    sm: 4px
    md: 8px
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /--colors-bg:\s*#0f0d0a/);
    assert.match(html, /--colors-text:\s*#e8e2d5/);
    assert.match(html, /--spacing-xs:\s*4px/);
    assert.match(html, /--spacing-sm:\s*8px/);
    assert.match(html, /--radius-sm:\s*4px/);
    assert.match(html, /--radius-md:\s*8px/);
  });

  test('body + colors (colon syntax) coexist', () => {
    const src = `
theme {
  body {
    background: #000
    color: #fff
  }
  colors {
    bg: #0f0d0a
    bg-elevated: #1a1612
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /--colors-bg:\s*#0f0d0a/);
    assert.match(html, /--colors-bg-elevated:\s*#1a1612/);
    assert.match(html, /body\s*\{[^}]*background:\s*#000/);
    assert.match(html, /body\s*\{[^}]*color:\s*#fff/);
  });

  test('defaults + colors coexist (no parser error, both emit)', () => {
    const src = `
theme {
  colors { bg: #0a0a12 }
  defaults {
    a { c #9b8ec4; td none }
  }
}
page "/" { h1 "x" }
`;
    // Should not throw during parse/compile
    const { html } = compile(src);
    assert.match(html, /--colors-bg:\s*#0a0a12/);
    assert.match(html, /a\s*\{[^}]*color:\s*#9b8ec4/);
    assert.match(html, /a\s*\{[^}]*text-decoration:\s*none/);
  });

  test('body + selection + defaults + colors all coexist', () => {
    const src = `
theme {
  body {
    background: #000
    color: #fff
  }
  selection {
    background: #333
    color: #0f0
  }
  defaults {
    a { c #9b8ec4; td none }
    pre { fs 14px }
  }
  colors {
    bg: #0f0d0a
    bg-elevated: #1a1612
    text: #e8e2d5
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    // Theme vars still correct
    assert.match(html, /--colors-bg:\s*#0f0d0a/);
    assert.match(html, /--colors-bg-elevated:\s*#1a1612/);
    assert.match(html, /--colors-text:\s*#e8e2d5/);
    // Body styles
    assert.match(html, /body\s*\{[^}]*background:\s*#000/);
    assert.match(html, /body\s*\{[^}]*color:\s*#fff/);
    // ::selection
    assert.match(html, /::selection\s*\{[^}]*background:\s*#333/);
    assert.match(html, /::selection\s*\{[^}]*color:\s*#0f0/);
    // defaults
    assert.match(html, /a\s*\{[^}]*color:\s*#9b8ec4/);
    assert.match(html, /pre\s*\{[^}]*font-size:\s*14px/);
  });

  test('defaults block with multiple elements — all parse correctly', () => {
    const src = `
theme {
  defaults {
    a { c #9b8ec4; td none }
    pre { fs 14px }
    code { fs 13px }
    img { mw 100%; h auto }
  }
}
page "/" { h1 "x" }
`;
    const { html } = compile(src);
    assert.match(html, /a\s*\{[^}]*color:\s*#9b8ec4/);
    assert.match(html, /a\s*\{[^}]*text-decoration:\s*none/);
    assert.match(html, /pre\s*\{[^}]*font-size:\s*14px/);
    assert.match(html, /code\s*\{[^}]*font-size:\s*13px/);
    assert.match(html, /img\s*\{[^}]*max-width:\s*100%/);
    assert.match(html, /img\s*\{[^}]*height:\s*auto/);
  });
});

describe('v0.25.1: #122 hyphenated component names — no false warnings', () => {
  test('component species-card used via `use species-card(name="x")` emits no warnings', () => {
    // Validator is exported indirectly; run a full compile through parser + validator
    // by invoking CLI `build`, parsing output for warning markers.
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-v0251-'));
    const src = `
component species-card(name) {
  div { p "hello" }
}

page / {
  use species-card(name="Wolf")
}
`;
    const file = join(tmp, 'app.nyx');
    const out = join(tmp, 'out.html');
    writeFileSync(file, src, 'utf8');
    const stdout = execFileSync('node', [CLI_PATH, 'build', file, '-o', out], {
      encoding: 'utf8',
    });
    // No warnings about "unused" or "unknown tag"
    assert.doesNotMatch(stdout, /Component "species-card" is defined but never used/);
    assert.doesNotMatch(stdout, /Unknown tag "species-card"/);
    // Output exists — component rendered
    assert.ok(existsSync(out));
    const html = readFileSync(out, 'utf8');
    assert.match(html, /<div>[\s\S]*<p>hello<\/p>[\s\S]*<\/div>/);
    rmSync(tmp, { recursive: true, force: true });
  });

  test('multiple hyphenated components used via `use` — no false warnings', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-v0251-'));
    const src = `
component species-card(name) {
  div { h2 "{name}" }
}

component citation-card(ref) {
  div { p "{ref}" }
}

page / {
  use species-card(name="Wolf")
  use citation-card(ref="RFC1")
}
`;
    const file = join(tmp, 'app.nyx');
    const out = join(tmp, 'out.html');
    writeFileSync(file, src, 'utf8');
    const stdout = execFileSync('node', [CLI_PATH, 'build', file, '-o', out], {
      encoding: 'utf8',
    });
    assert.doesNotMatch(stdout, /is defined but never used/);
    assert.doesNotMatch(stdout, /Unknown tag/);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('v0.25.1: #122 CLI -o flag routes output to the given path', () => {
  test('`build file -o path/to/build.html` writes exactly that path', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'nyx-v0251-'));
    const src = `
theme { colors { bg: #0f0d0a } }
page / { h1 "hi" }
`;
    const file = join(tmp, 'app.nyx');
    const out = join(tmp, 'build.html');
    writeFileSync(file, src, 'utf8');
    execFileSync('node', [CLI_PATH, 'build', file, '-o', out], {
      encoding: 'utf8',
    });
    assert.ok(existsSync(out), `expected ${out} to exist`);
    // Must NOT also have created the default dist-site dir inside tmp
    assert.ok(!existsSync(join(tmp, 'dist-site')), 'dist-site/ should not be created when -o is given');
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe('v0.25.1: #122 CLI --version exits cleanly with just the version', () => {
  test('--version prints exactly `vX.Y.Z` and does not include usage help', () => {
    const stdout = execFileSync('node', [CLI_PATH, '--version'], { encoding: 'utf8' });
    // Must be a single version line — no "Usage:" block
    assert.doesNotMatch(stdout, /Usage:/);
    assert.doesNotMatch(stdout, /parse\s+<file\.nyx>/);
    assert.match(stdout, /^v\d+\.\d+\.\d+/);
  });

  test('-v behaves like --version', () => {
    const stdout = execFileSync('node', [CLI_PATH, '-v'], { encoding: 'utf8' });
    assert.doesNotMatch(stdout, /Usage:/);
    assert.match(stdout, /^v\d+\.\d+\.\d+/);
  });
});
