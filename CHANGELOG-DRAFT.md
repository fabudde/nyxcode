# NyxCode v0.30.0 — CHANGELOG DRAFT

## 🔥 The Language Release

**NyxCode is now a programming language, not just a DSL.**

One `.nyx` file = Frontend + Backend + DB + Auth + Background Workers + Reusable Actions + Environment Management + Live Data Bindings. No frameworks, no boilerplate.

RFC #132 designed by the full Rudel: Nyx 🦞, Tyto 🦉, Kiro 🐺, Fabian 🐻.

---

## 🆕 v0.30 — New Backend Primitives

### `let` — Variable Bindings in API/Action Blocks

Multi-step logic. Query, compute, respond.

```nyx
api GET /api/stats auth {
  let userCount = query "SELECT COUNT(*) as count FROM users"
  let postCount = query "SELECT COUNT(*) as count FROM posts"
  respond 200 { status "ok" }
}
```

**Compiles to:**
```js
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').all();
const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').all();
res.status(200).json({ status: "ok" });
```

**Smart detection:** `LIMIT 1` or `WHERE id = ?` → `.get()` (single row). Otherwise → `.all()` (array).

**Built-in functions:**
```nyx
let total = sum(items, "price")     // → items.reduce(...)
let n = count(users)                // → users.reduce(...)
let size = len(results)             // → results.length
```

**External calls:**
```nyx
let session = stripe.checkout(amount)   // → await stripe.checkout(amount)
```

**Token savings: ~33% vs raw JS.**

---

### `action` — Reusable Server-Side Functions

Define once, call anywhere. Composable building blocks.

```nyx
action sendWelcome(email) {
  email to=email subject="Welcome!" body="Thanks for joining."
}

action publishPost(userId, title, body) {
  let author = query "SELECT * FROM users WHERE id = $userId LIMIT 1"
  query "INSERT INTO posts (title, body, author_id) VALUES ($title, $body, $userId)"
  on error {
    respond 500 { error "Failed to publish" }
  }
}
```

**Compiles to:**
```js
async function action_sendWelcome(email) {
  try {
    await sendEmail({ to: email, subject: "Welcome!", body: "Thanks for joining." });
  } catch (e) {
    console.error('[action:sendWelcome]', e.message);
    throw e;
  }
}
```

**Features:**
- Typed optional params: `action send(to)` and `action send(to: email)` both valid
- `on error { }` block for custom error handling
- Callable from `api` blocks and other `action`s
- Async by default

**Token savings: ~73% vs raw JS.**

---

### `on` — Table Lifecycle Events

React to data changes. Automation without manual wiring.

```nyx
on user.created {
  action sendWelcome(user.email)
}

on post.deleted {
  query "DELETE FROM comments WHERE post_id = $post.id"
}
```

**Compiles to:** Post-INSERT/UPDATE/DELETE hooks injected into CRUD routes.

**Events:** `created`, `updated`, `deleted`

**Token savings: ~70% vs raw JS.**

---

### `env` — Environment Variable Declarations

Declare what your app needs. Fail fast at startup, not at runtime.

```nyx
env {
  DATABASE_URL required
  STRIPE_KEY required
  DEBUG default="false"
  LOG_LEVEL default="info"
}
```

**Compiles to:**
```js
if (!process.env.DATABASE_URL) { console.error('Missing required env: DATABASE_URL'); process.exit(1); }
if (!process.env.STRIPE_KEY) { console.error('Missing required env: STRIPE_KEY'); process.exit(1); }
if (!process.env.DEBUG) process.env.DEBUG = 'false';
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'info';
```

**Token savings: ~50% vs raw JS.**

---

### `email` — First-Class Email Sending

No imports, no transport config. Just send.

```nyx
email to=user.email subject="Order confirmed" body="Your order #123 is confirmed."
```

Usable inside `action` and `api` blocks. Sugar over nodemailer.

**Token savings: ~75% vs raw JS.**

---

### `respond` — Status Codes

Full HTTP response control.

```nyx
respond 201 { message "Created" }
respond 404 { error "Not found" }
respond 200 { users "data" }
```

---

### Backend Auto-Detection

No flags, no config. NyxCode reads your AST:

```bash
nyx build landing.nyx     # page + theme only → HTML
nyx build app.nyx         # has table/api/action → server.js + public/
```

If your file has `table`, `api`, `action`, `security`, `use`, `on`, `env`, or `every` → backend generated.
If your file has only `page`, `component`, `theme`, `layout`, `meta` → HTML only.

---

## v0.27 Features (included)

### `page /path auth` — Page-Level Authentication
```nyx
page /dashboard auth {
  h1 "My Dashboard"
}
```
Auto-redirects to `/login` if no JWT token.

### `visible=auth` / `visible=guest` — Conditional Visibility
```nyx
nav {
  a "Login" href="/login" visible=guest
  a "Dashboard" href="/dashboard" visible=auth
}
```

### `$param.id` — URL Parameter Binding
```nyx
data item = get "/api/items/$param.id" auth
```

### `.field` in ALL Template Attributes
```nyx
each users -> user {
  img src=.avatar alt=.name
  a href="/profile/.id" title=.name
  div data-role=.role class=.status
}
```
Resolves `.field` in every HTML attribute, not just text. CSS decimals (`.5rem`) preserved.

### Single-Object API Response Wrapping
APIs returning `{object}` auto-wrapped to `[{object}]` for `each` compatibility.

### `every` — Background Workers
```nyx
every 60s 'health-check' {
  query "SELECT * FROM monitors WHERE status != 'paused'"
  fetch $row.url
}
```
5s minimum floor. SIGTERM cleanup. `fetch $row.url` for HTTP health checks.

### Auto-Detect Input Types
`password` → `type="password"`, `email` → `type="email"`, etc.

---

## Backend Improvements

- **Pagination:** `?page=1&limit=20` → `{ data, pagination: { page, limit, total, totalPages } }`
- **Search & Filtering:** `?search=term&status=active` → SQL-safe WHERE clauses
- **Trust Proxy:** Auto-generated `app.set('trust proxy', true)`
- **Route Ordering:** Custom `api` routes before auto-CRUD (`/mine` before `/:id`)
- **`fetch $row.url`:** Full HTTP health check code gen in `every` blocks

---

## Theme & Styling

- **Pseudo-selectors** in theme defaults: `:focus`, `::placeholder`, `[type=submit]`
- **Bare selectors** (specificity 0,0,1) instead of `:where()` (0,0,0)
- **`::selection`** in theme block
- **`flex=row between center`** — `between` wins over `center` for justify-content

---

## NyxStatus — Dogfood Proof

Built entirely in NyxCode. One `site.nyx` file (~750 lines) → 9 pages, 7 tables, JWT auth, health checks, email alerts. Live at **nyxstatus.com**.

- 0 style injections (was 6)
- 2 script injections (business logic only)
- 0 post-build patches
- 13 native presets

---

## Design Decisions (RFC #132 Consensus)

1. `use` = 3 tiers: Built-in adapters → `use npm:"package"` → Blocked list
2. Tier 1 packages (9): stripe, nodemailer, redis, bcrypt, jsonwebtoken, better-sqlite3, sharp, resend, uuid
3. `config {}` block separate from `use` — consistent with `theme {}`
4. Expression language: `sum`, `count`, `avg`, `min`, `max`, `len`, arithmetic. No lambdas. Everything else → SQL.
5. `on error { }` for error handling — NyxCode-native, not try/catch
6. Compiler warnings for unknown npm packages, hard reject for dangerous ones
7. `pipe` deferred — `security {}` + `middleware {}` cover most cases

### The Golden Rule

**If it's not shorter than JS, it shouldn't exist in NyxCode.**
