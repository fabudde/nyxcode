/**
 * End-to-end runtime tests.
 *
 * Unlike the unit tests (which assert on *generated source strings*), these tests
 * actually:
 *   1. compile a `.nyx` file with the real CLI (`nyx build`),
 *   2. start the generated Node/Express + SQLite server,
 *   3. make real HTTP requests against it,
 *   4. assert on the live responses.
 *
 * This is the layer that proves a generated app *runs*, not just that it *compiles*.
 * The backend deps (express, express-rate-limit, bcryptjs, jsonwebtoken,
 * better-sqlite3) are declared as devDependencies so the suite is self-contained.
 *
 * Temp build dirs live under <repo>/.e2e-tmp so the generated `server.js` resolves
 * `require('express')` etc. by walking up to the repo's own node_modules.
 */
import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/tests/e2e -> repo root
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CLI = resolve(REPO_ROOT, 'dist', 'cli.js');
const TMP_ROOT = resolve(REPO_ROOT, '.e2e-tmp');

function freePort(): number {
  // Deterministic-ish high port range; node test runs serially per file.
  return 39000 + Math.floor(Math.random() * 2000);
}

interface Resp { status: number; body: string; json: any }

function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<Resp> {
  return new Promise((resolvePromise, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json: any = null;
          try {
            json = JSON.parse(buf);
          } catch {
            /* non-JSON body (e.g. HTML) is fine */
          }
          resolvePromise({ status: res.statusCode ?? 0, body: buf, json });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/** Build a .nyx source into a fresh temp dir and return the output dir. */
function buildApp(name: string, source: string): string {
  const dir = resolve(TMP_ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const nyxFile = resolve(dir, 'app.nyx');
  writeFileSync(nyxFile, source);
  const outDir = resolve(dir, 'out');
  execFileSync('node', [CLI, 'build', nyxFile, '-o', outDir], {
    stdio: 'pipe',
  });
  return outDir;
}

/** Start `server.js` in outDir on a port; resolve once it logs "listening". */
function startServer(outDir: string, port: number): Promise<ChildProcess> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', ['server.js'], {
      cwd: outDir,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const onData = (chunk: Buffer) => {
      if (!settled && /listening/i.test(chunk.toString())) {
        settled = true;
        resolvePromise(child);
      }
    };
    child.stdout.on('data', onData);
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c));
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`server exited early (code ${code}): ${stderr}`));
      }
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error(`server did not start within 15s. stderr: ${stderr}`));
      }
    }, 15000);
  });
}

async function stopServer(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((res) => {
    child.on('exit', () => res());
    child.kill('SIGTERM');
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      res();
    }, 3000);
  });
}

describe('e2e: generated full-stack app is runnable', () => {
  const port = freePort();
  let server: ChildProcess | undefined;
  let outDir = '';

  before(async () => {
    outDir = buildApp(
      'crud',
      `table todos {
  title text required
  done bool
}

api get /api/health {
  respond 200 { status "ok" }
}

page "/" {
  h1 "Todos"
  data items = get /api/todos
  each items -> t {
    p "\${t.title}"
  }
}`,
    );
    server = await startServer(outDir, port);
  });

  after(async () => {
    await stopServer(server);
  });

  it('emits a runnable package.json with declared deps + start script', () => {
    const pkgPath = resolve(outDir, 'package.json');
    assert.ok(existsSync(pkgPath), 'package.json should be emitted');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(pkg.scripts.start, 'node server.js');
    assert.ok(pkg.dependencies.express, 'express must be declared');
    assert.ok(pkg.dependencies['better-sqlite3'], 'better-sqlite3 must be declared');
    assert.ok(existsSync(resolve(outDir, 'server.js')), 'server.js should exist');
  });

  it('serves a custom API route (GET /api/health)', async () => {
    const r = await request(port, 'GET', '/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.json?.status, 'ok');
  });

  it('persists a row through SQLite (POST then GET /api/todos)', async () => {
    const created = await request(port, 'POST', '/api/todos', {
      title: 'buy milk',
      done: 0,
    });
    assert.ok(created.status >= 200 && created.status < 300, `create failed: ${created.body}`);
    assert.equal(created.json?.title, 'buy milk');
    assert.ok(created.json?.id, 'created row should have an id');

    const list = await request(port, 'GET', '/api/todos');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.json), 'list should be an array');
    assert.ok(
      list.json.some((row: any) => row.title === 'buy milk'),
      'created row should appear in list',
    );
  });

  it('rejects required-field violations (POST without title)', async () => {
    const r = await request(port, 'POST', '/api/todos', { done: 1 });
    assert.ok(r.status >= 400, `expected 4xx for missing required field, got ${r.status}`);
  });

  it('serves the static frontend (GET /)', async () => {
    const r = await request(port, 'GET', '/');
    assert.equal(r.status, 200);
    assert.ok(/<!DOCTYPE html>/i.test(r.body), 'root should serve HTML');
    assert.ok(/Todos/.test(r.body), 'HTML should contain page content');
  });
});

describe('e2e: generated auth app (register + login + JWT)', () => {
  const port = freePort() + 1;
  let server: ChildProcess | undefined;
  let outDir = '';

  before(async () => {
    outDir = buildApp(
      'auth',
      `security {
  table users
  login email password
  token jwt
  protect /api/notes write
}

table notes {
  body text required
}`,
    );
    server = await startServer(outDir, port);
  });

  after(async () => {
    await stopServer(server);
  });

  it('declares auth deps in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(outDir, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies.bcryptjs, 'bcryptjs must be declared');
    assert.ok(pkg.dependencies.jsonwebtoken, 'jsonwebtoken must be declared');
  });

  it('registers a user, logs in, and returns a JWT', async () => {
    const reg = await request(port, 'POST', '/api/auth/register', {
      email: 'a@b.com',
      password: 'secret123',
    });
    assert.ok(reg.status >= 200 && reg.status < 300, `register failed: ${reg.status} ${reg.body}`);

    const login = await request(port, 'POST', '/api/auth/login', {
      email: 'a@b.com',
      password: 'secret123',
    });
    assert.ok(login.status >= 200 && login.status < 300, `login failed: ${login.status} ${login.body}`);
    assert.ok(login.json?.token, 'login should return a JWT token');
  });

  it('rejects writes to a protected route without a token', async () => {
    const r = await request(port, 'POST', '/api/notes', { body: 'hi' });
    assert.equal(r.status, 401, 'unauthenticated write should be 401');
  });

  it('rejects login with a wrong password', async () => {
    const r = await request(port, 'POST', '/api/auth/login', {
      email: 'a@b.com',
      password: 'wrongpass',
    });
    assert.ok(r.status >= 400, 'wrong password should fail');
  });
});

describe('e2e: relations resolve to nested objects in every read path', () => {
  const port = freePort() + 2;
  let server: ChildProcess | undefined;

  before(async () => {
    const outDir = buildApp(
      'relations',
      `table authors {
  name text required
}

table posts {
  title text required
  author [authors]
}`,
    );
    server = await startServer(outDir, port);
    // Seed: one author, one post referencing it.
    await request(port, 'POST', '/api/authors', { name: 'Ada' });
    await request(port, 'POST', '/api/posts', { title: 'Hello', author: 1 });
  });

  after(async () => {
    await stopServer(server);
  });

  it('GET one nests the related author object', async () => {
    const r = await request(port, 'GET', '/api/posts/1');
    assert.equal(r.status, 200);
    assert.equal(r.json?.author?.id, 1);
    assert.equal(r.json?.author?.name, 'Ada');
  });

  it('GET list nests the related author object (the list-JOIN fix)', async () => {
    const r = await request(port, 'GET', '/api/posts');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json));
    const post = r.json.find((p: any) => p.id === 1);
    assert.ok(post, 'seeded post should be present');
    assert.equal(post.author?.name, 'Ada', 'list must resolve the relation, not return null');
  });

  it('paginated list also nests the relation', async () => {
    const r = await request(port, 'GET', '/api/posts?page=1&limit=10');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json?.data));
    assert.equal(r.json.data[0]?.author?.name, 'Ada');
  });

  it('filtering by the relation column works (no ambiguous-column error)', async () => {
    const r = await request(port, 'GET', '/api/posts?author=1');
    assert.equal(r.status, 200, `filter should not 500: ${r.body}`);
    assert.ok(r.json.some((p: any) => p.author?.name === 'Ada'));
  });
});
