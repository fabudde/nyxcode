# NyxCode v0.30.0 — The Language Release 🔥

**NyxCode is now a programming language, not just a DSL.**

One `.nyx` file = Frontend + Backend + DB + Auth + Background Workers + Email Alerts + Environment Management + Live Data Bindings. No frameworks, no boilerplate, no config files.

**Dogfooded on [NyxStatus.com](https://nyxstatus.com)** — a full uptime monitoring SaaS built in 378 lines of NyxCode. One file. Zero frameworks.

**Proven:** 3.5x fewer tokens than equivalent Next.js. 71% cheaper AI generation. [Comparison](https://nextjsstatus.heynyx.dev).

RFC #132 designed by the Rudel: Nyx 🦞, Tyto 🦉, Kiro 🐺, Fabian 🐻.

---

## 🆕 New Backend Primitives

### `let` — Variable Bindings
Multi-step server logic in API and action blocks.
```nyx
api GET /api/stats auth {
  let userCount = query "SELECT COUNT(*) as count FROM users"
  let postCount = query "SELECT COUNT(*) as count FROM posts"
  respond 200 { status "ok" }
}
```
- Smart detection: `LIMIT 1` or `WHERE id=?` → `.get()`, otherwise → `.all()`
- Built-in functions: `sum()`, `count()`, `avg()`, `min()`, `max()`, `len()`
- External calls: `let session = stripe.checkout(amount)`

### `action` — Reusable Server Functions
Define once, call from any `api` block.
```nyx
action sendWelcome(email) {
  email to=email subject="Welcome!" body="Thanks for joining."
  on error { respond 500 { error "Email failed" } }
}
```
- Compiles to async functions with try/catch
- Composable: actions can call other actions

### `on` — Table Lifecycle Events
React to data changes automatically.
```nyx
on users.created {
  email to=row.email subject="Welcome!" body="You're in!"
}
on posts.deleted {
  query "DELETE FROM comments WHERE post_id = $row.id"
}
```
Events: `created`, `updated`, `deleted`. Hooks auto-injected into CRUD routes.

### `env` — Environment Variables
Fail fast at startup, not at runtime.
```nyx
env {
  DATABASE_URL required
  STRIPE_KEY required
  DEBUG default="false"
}
```

### `email` — First-Class Email
No imports, no transport config.
```nyx
email to=user.email subject="Order confirmed" body="Your order is ready."
```
Usable inside `action` and `api` blocks. Powered by nodemailer.

### `use` — Three-Tier Package System
```nyx
use stripe           # Tier 1: built-in adapter (auto-init from env)
use nodemailer       # Tier 1: SMTP transport + sendEmail() helper
use npm:"slugify"    # Tier 2: raw npm require (compiler warning)
# use npm:"child_process"  → BLOCKED (security)
```
Tier 1 (9 packages): stripe, nodemailer, redis, bcrypt, jsonwebtoken, better-sqlite3, sharp, resend, uuid.

CLI: `nyx add stripe` — adds `use` statement + runs `npm install`.

### `respond` — Status Codes
```nyx
respond 201 { message "Created" }
respond 404 { error "Not found" }
```

### Backend Auto-Detection
No flags needed. If your `.nyx` has `table`/`api`/`action`/`security`/`use`/`on`/`env`/`every` → `server.js` generated. Otherwise → HTML only.

---

## 🔧 Compiler Improvements

### Forms Inside `each` Loops
Forms nested inside `each` templates now compile to inline `onclick` fetch buttons.
```nyx
each alerts -> alert {
  form "/api/alerts/delete" auth {
    input id hidden value=.id
    submit "✕" preset=btn-delete
    success -> reload
  }
}
```
Previously: silently dropped. Now: compiles to confirm → fetch → reload.

### Multi-Query API Blocks
POST/PUT/DELETE API blocks with multiple `query` statements execute ALL queries sequentially.
```nyx
api POST /api/monitors/delete auth {
  query "DELETE FROM checks WHERE monitor_id = $id"
  query "DELETE FROM alerts WHERE monitor_id = $id"
  query "DELETE FROM monitors WHERE id = $id AND user_id = $req.user.id"
}
```
Previously: only first query executed. Now: all run, last result returned.

### Template Literal Value Resolution
Hidden input values with `.field` refs inside each loops now resolve at `.map()` time, not onclick time.

### Keyword Token Context Awareness
`email` only triggers email statement parsing when followed by `to=`. Otherwise treated as normal element/content. Keywords like `action`, `env`, `email`, `use` work as element content and attributes.

---

## 📊 v0.27 Features (Included in v0.30)

### Page-Level Authentication
```nyx
page /dashboard auth { ... }
```
Auto-redirects to `/login` if no JWT token.

### Conditional Visibility
```nyx
a "Login" href="/login" visible=guest
a "Dashboard" href="/dashboard" visible=auth
```

### URL Parameters
```nyx
data item = get "/api/items/$param.id" auth
```

### Universal `.field` Resolution
`.field` resolves in ALL template attributes — `src`, `href`, `alt`, `class`, `data-*`, etc.

### Background Workers (`every`)
```nyx
every 60s 'health-check' {
  query "SELECT id, url FROM monitors"
  fetch $row.url
}
```
5s minimum floor. SIGTERM cleanup. `fetch $row.url` for HTTP health checks.

### Pagination, Search & Filtering
```
GET /api/posts?page=1&limit=20&search=hello&status=active
```
All CRUD endpoints support opt-in pagination, text search, and column filtering.

---

## 🎨 Theme & Styling

- Pseudo-selectors in theme defaults: `:focus`, `::placeholder`, `[type=submit]`
- Bare selectors (specificity 0,0,1) instead of `:where()` (0,0,0)
- `::selection` in theme block
- `flex=row between center` — `between` wins over `center` for `justify-content`
- Trust proxy auto-generated
- Route ordering: custom `api` routes before auto-generated CRUD

---

## 📦 NyxStatus — The Dogfood Proof

**378 lines of NyxCode. One file. Full SaaS.**

| Feature | Status |
|---------|--------|
| JWT Auth (register/login/logout) | ✅ |
| SQLite DB (4 tables) | ✅ |
| CRUD API (auto-generated) | ✅ |
| Custom API endpoints (7) | ✅ |
| Background health checks (60s) | ✅ |
| Email alerts on downtime | ✅ |
| Delete with cascade (3 queries) | ✅ |
| Responsive burger nav | ✅ |
| Dark theme | ✅ |

**Token comparison (cl100k_base):**
| | NyxCode | Next.js | Savings |
|---|---------|---------|---------|
| Lines | 378 | 1,069 | 65% fewer |
| Bytes | 10,934 | 37,906 | 71% smaller |
| Tokens | ~2,733 | ~9,476 | **3.5x fewer** |
| Files | 1 | 27 | 27x fewer |
| AI cost | ~$0.20 | ~$0.71 | **71% cheaper** |

Live: [nyxstatus.com](https://nyxstatus.com) | Comparison: [nextjsstatus.heynyx.dev](https://nextjsstatus.heynyx.dev)

---

## 🏗 Design Decisions (RFC #132)

1. **Golden Rule:** "If it's not shorter than JS, it shouldn't exist in NyxCode."
2. `use` = 3 tiers: Built-in → npm (warning) → Blocked
3. Expression language: `sum`, `count`, `avg`, `min`, `max`, `len`, arithmetic. No lambdas — use SQL.
4. `on error {}` for error handling — NyxCode-native, not try/catch
5. `pipe` deferred — `security {}` + `middleware {}` cover most cases
6. Backend auto-detection — no `--full-stack` flag

---

## 📈 Full Commit Log (20 commits)

```
9ffb4ee feat: multi-query support in API blocks
c0518a9 fix: form template interpolates field values at map-time
6f7196b feat: forms inside each-loops compile to inline fetch buttons
142184a fix: keyword tokens as element content and attributes
706480c fix: email keyword context-aware parsing
938a7bc docs: NYXCODE.md updated with all backend primitives
3d50ded feat: nyx add CLI — zero-friction package management
ac8eaf4 feat: use — three-tier package system
a4dc3af feat: on table.event — table lifecycle hooks
2e75520 feat: Backend compilation for let, action, env
26c3f39 feat: AST + Parser for let, action, env, email
766cd4a docs: comprehensive v0.27.3 CHANGELOG draft
10f1d13 fix: eliminate all post-build patches
0b15a31 docs: page auth, visible, $param, field refs
33f00f9 feat: auto-wrap single objects + created_at in checks
1ac9bb6 feat: universal .field resolution in all template attributes
73fb4b3 feat: dynamic href in each templates + checks auth fix
f213114 fix: visible toggle runs on DOMContentLoaded
3601f34 feat: pseudo-selectors in theme defaults + every keyword parser
581e6e4 feat: page auth, visible=auth/guest, $param.id
```

---

**v0.30.0** — DSL → Programming Language. Built by AIs, for AIs, with humans. 🦞
