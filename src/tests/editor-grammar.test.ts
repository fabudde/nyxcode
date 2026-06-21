/**
 * Guards the VS Code editor integration assets so broken JSON or a missing
 * grammar can't ship silently.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/tests -> repo root
const REPO_ROOT = resolve(__dirname, '..', '..');
const VSCODE = resolve(REPO_ROOT, 'editors', 'vscode');

function readJSON(p: string): any {
  return JSON.parse(readFileSync(p, 'utf8'));
}

describe('editor: VS Code extension assets', () => {
  it('extension manifest registers the .nyx language + grammar', () => {
    const pkg = readJSON(resolve(VSCODE, 'package.json'));
    const langs = pkg.contributes?.languages ?? [];
    assert.ok(
      langs.some((l: any) => l.id === 'nyxcode' && l.extensions?.includes('.nyx')),
      'should register nyxcode language for .nyx',
    );
    const grammars = pkg.contributes?.grammars ?? [];
    assert.ok(
      grammars.some((g: any) => g.scopeName === 'source.nyx'),
      'should register the source.nyx grammar',
    );
  });

  it('TextMate grammar is valid JSON with required fields', () => {
    const g = readJSON(resolve(VSCODE, 'syntaxes', 'nyxcode.tmLanguage.json'));
    assert.equal(g.scopeName, 'source.nyx');
    assert.ok(Array.isArray(g.patterns) && g.patterns.length > 0, 'patterns required');
    assert.ok(g.repository?.keywords, 'keywords repository required');
  });

  it('grammar highlights the v0.53 ?? and ?. operators', () => {
    const raw = readFileSync(
      resolve(VSCODE, 'syntaxes', 'nyxcode.tmLanguage.json'),
      'utf8',
    );
    assert.ok(/nullish/.test(raw), 'grammar should scope ?? as nullish');
    assert.ok(/optional/.test(raw), 'grammar should scope ?. as optional');
  });

  it('language-configuration.json is valid JSON', () => {
    const cfg = readJSON(resolve(VSCODE, 'language-configuration.json'));
    assert.equal(cfg.comments.lineComment, '//');
    assert.ok(Array.isArray(cfg.brackets));
  });

  it('every regex in the grammar compiles', () => {
    const g = readJSON(resolve(VSCODE, 'syntaxes', 'nyxcode.tmLanguage.json'));
    const checkNode = (node: any) => {
      if (!node || typeof node !== 'object') return;
      for (const key of ['match', 'begin', 'end']) {
        if (typeof node[key] === 'string') {
          assert.doesNotThrow(
            () => new RegExp(node[key]),
            `invalid regex in "${key}": ${node[key]}`,
          );
        }
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(checkNode);
        else if (typeof v === 'object') checkNode(v);
      }
    };
    checkNode(g);
  });
});
