/**
 * v0.54 — `success -> navigate "/path"` works in forms.
 *
 * Bug: forms only honoured `redirect`/`toast` success actions; `navigate` (the same
 * word event handlers use) was parsed without its value and dropped by the compiler,
 * so login/register forms stored the JWT but never redirected — looking broken.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { Lexer } from '../lexer.js';
import { Compiler } from '../compiler.js';

function compile(src: string) {
  return new Compiler().compile(new Parser(new Lexer(src).tokenize()).parse());
}

const LOGIN = `page /login {
  form /api/auth/login {
    input email
    input password
    submit "Sign in"
    success -> navigate "/"
  }
}`;

describe('v0.54: form success -> navigate', () => {
  it('emits a redirect on success (after storing the token)', () => {
    const { html } = compile(LOGIN);
    assert.ok(
      /if\(d\.token\)localStorage\.setItem\('token',d\.token\);location\.href='\/'/.test(html),
      'success should store token then navigate home',
    );
  });

  it('navigate to a custom path is honored', () => {
    const { html } = compile(LOGIN.replace('navigate "/"', 'navigate "/dashboard"'));
    assert.ok(html.includes("location.href='/dashboard'"), 'should redirect to /dashboard');
  });

  it('redirect (the original keyword) still works', () => {
    const { html } = compile(LOGIN.replace('navigate "/"', 'redirect "/home"'));
    assert.ok(html.includes("location.href='/home'"), 'redirect must still work');
  });
});
