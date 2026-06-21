/**
 * v0.54 — auth-aware UI: `visible=auth/guest` toggle script (single-page) + `logout`.
 *
 * Bugs found while debugging "login looks like it does nothing":
 *  - `visible="auth"/"guest"` emitted the data attribute but the runtime toggle
 *    script was only injected on the multi-page path — single-page apps showed
 *    elements unconditionally, so there was no visible logged-in/out state.
 *  - There was no native way to log out.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Lexer } from '../lexer.js';
import { Compiler } from '../compiler.js';

function compile(src: string) {
  return new Compiler().compile(new Parser(new Lexer(src).tokenize()).parse());
}

describe('v0.54: visible=auth/guest', () => {
  it('injects the token-based toggle script on a single-page app', () => {
    const { html } = compile(
      `page / {\n  a "Sign in" href="/login" visible="guest"\n  span "Hi" visible="auth"\n}`,
    );
    assert.ok(html.includes('[data-visible]'), 'toggle script must be injected');
    assert.ok(html.includes("localStorage.getItem(\"token\")"), 'toggle keys off the JWT');
    assert.ok(/data-visible="guest"/.test(html), 'guest element tagged');
    assert.ok(/data-visible="auth"/.test(html), 'auth element tagged');
  });

  it('auth elements start hidden (revealed only when a token exists)', () => {
    const { html } = compile(`page / {\n  span "Hi" visible="auth"\n}`);
    assert.ok(/data-visible="auth" style="display:none"/.test(html), 'auth hidden by default');
  });
});

describe('v0.54: logout action', () => {
  it('clears the token and redirects home', () => {
    const { html } = compile(`page / {\n  button "Out" on:click { logout }\n}`);
    assert.ok(html.includes("removeItem('token')"), 'should clear the JWT');
    assert.ok(html.includes("window.location.href='/'"), 'should go home');
  });

  it('logout to a custom path', () => {
    const { html } = compile(`page / {\n  button "Out" on:click { logout "/login" }\n}`);
    assert.ok(html.includes("window.location.href='/login'"), 'should honor the path');
  });
});
