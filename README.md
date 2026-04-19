# 🦞 NyxCode

**The AI-native programming language. One `.nyx` file = full-stack app.**

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![Tests](https://img.shields.io/badge/tests-365-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🌐 **[nyxcode.io](https://nyxcode.io)** · 📊 **[NyxStatus.com](https://nyxstatus.com)** (built in 378 lines of NyxCode)

---

## Why NyxCode?

AI writes most code in 2026 — but still thinks in React, Vue, and raw HTML. Every token costs money, time, and context window.

**NyxCode: 3.5x fewer tokens than Next.js. 71% cheaper AI generation.**

| | NyxCode | Next.js | Savings |
|---|---------|---------|---------|
| Lines | **378** | 1,069 | 65% fewer |
| Files | **1** | 27 | 27x fewer |
| Tokens | **~2,733** | ~9,476 | **3.5x fewer** |
| AI cost | **~$0.20** | ~$0.71 | **71% cheaper** |

*Real benchmark: [NyxStatus.com](https://nyxstatus.com) — identical full-stack SaaS, measured with cl100k_base.*

## Quick Start

```bash
npm i -g @fabudde/nyxcode
nyx build app.nyx -o dist/        # Static site
nyx build app.nyx                 # Full-stack (auto-detects tables/api)
nyx dev app.nyx                   # Dev server + hot reload
nyx add stripe                    # Add package + npm install
```

## Full-Stack in 16 Lines

```nyx
table posts { title text required, body text, created auto }
security { table users, login email password, token jwt, protect /api/posts write }
theme { colors { primary #667eea, bg #0a0a12, card #1a1a2e } }
preset card { bg card, r 12px, p 2rem }

page / {
  section style={ mw 800px, mx auto, p 2rem } {
    h1 "My Blog"
    form /api/posts auth { input title, submit "Post", success -> reload }
    data posts = get /api/posts auth
    each posts -> div preset=card { h3 .title, p .body }
  }
}
page /register {
  form /api/auth/register { input email, input password, submit "Register", success -> redirect / }
}
```

This generates: `index.html`, `register/index.html`, AND `server.js` (10 CRUD endpoints + JWT auth + SQLite). Zero config.

## React vs NyxCode

**React — 20+ lines:**
```jsx
import React, { useState, useEffect } from 'react';
export default function UserList() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    fetch('/api/users').then(r => r.json()).then(setUsers);
  }, []);
  return (
    <div className="container">
      {users.map(u => (
        <div key={u.id} className="card">
          <h3>{u.name}</h3><p>{u.email}</p>
        </div>
      ))}
    </div>
  );
}
```

**NyxCode — 4 lines:**
```nyx
page /users {
  data users = get /api/users
  each users -> card { h3 .name, p .email }
}
```

Same result. 76% fewer lines. 68% fewer tokens.

## v0.30.0 — The Language Release 🔥

NyxCode is now a **programming language**, not just a DSL. New backend primitives:

### `let` — Variable Bindings
```nyx
api GET /api/stats auth {
  let users = query "SELECT COUNT(*) as n FROM users"
  let posts = query "SELECT COUNT(*) as n FROM posts"
  respond 200 { status "ok" }
}
```

### `action` — Reusable Server Functions
```nyx
action sendWelcome(email) {
  email to=email subject="Welcome!" body="Thanks for joining."
  on error { respond 500 { error "Email failed" } }
}
```

### `on` — Table Lifecycle Events
```nyx
on users.created {
  email to=row.email subject="Welcome!" body="You're in!"
}
```

### `env` — Environment Variables
```nyx
env {
  DATABASE_URL required
  STRIPE_KEY required
  DEBUG default="false"
}
```

### `email` — First-Class Email
```nyx
email to=user.email subject="Order confirmed" body="Your order is ready."
```

### `use` — Three-Tier Package System
```nyx
use stripe           # Tier 1: built-in adapter (auto-init from env)
use nodemailer       # Tier 1: SMTP + sendEmail() helper
use npm:"slugify"    # Tier 2: raw npm require (warning)
```

### `every` — Background Workers
```nyx
every 60s 'health-check' {
  query "SELECT id, url FROM monitors"
  fetch $row.url
}
```

### Multi-Query API Blocks
```nyx
api POST /api/monitors/delete auth {
  query "DELETE FROM checks WHERE monitor_id = $id"
  query "DELETE FROM alerts WHERE monitor_id = $id"
  query "DELETE FROM monitors WHERE id = $id AND user_id = $req.user.id"
}
```

### Forms Inside `each` Loops
```nyx
each alerts -> alert {
  form "/api/alerts/delete" auth {
    input id hidden value=.id
    submit "✕" preset=btn-delete
    success -> reload
  }
}
```

### Backend Auto-Detection
No flags. If your `.nyx` has `table`/`api`/`action`/`security`/`use`/`on`/`env`/`every` → `server.js` generated. Otherwise → HTML only.

## Features

### 🎨 Design System
```nyx
theme {
  colors { primary #667eea, bg #0a0a12 }
  fonts { body Inter, source: google }
  body { bg #0a0a12, c #f0eaff }
  selection { bg rgba(155,142,196,0.3) }
  defaults { a { c primary, td none } }
}
preset card { bg surface, r 12px, p 2rem }
```

### ⚡ Animations
```nyx
keyframes drift {
  0%, 100% { tf translate(0, 0) }
  50% { tf translate(-2%, 1.5%) }
}
```

### 📱 Responsive
```nyx
div grid=3@1 gap=2rem { ... }     # 3 cols desktop, 1 col mobile
nav burger brand="MySite" { ... }  # Accessible mobile menu, zero JS
style { @mobile { fs 0.9rem } }    # Built-in breakpoints
```

### 🧩 Components
```nyx
component Card(title, desc, status="Active") {
  div preset=card {
    h3 "${title}"
    p "${desc}"
    span "${status}"
  }
}
page / { use Card("Hello", "World") }
```

### 🔐 Auth & Security
```nyx
security { table users, login email password, token jwt, protect /api/posts write }
page /dashboard auth { ... }           # Auto-redirect if not logged in
a "Login" visible=guest                # Show only when logged out
a "Dashboard" visible=auth             # Show only when logged in
```

### 📊 Data Binding
```nyx
data posts = get /api/posts auth {
  loading -> p "Loading..."
  empty -> p "No posts yet"
  error -> p "Something went wrong"
}
each posts -> div { h3 .title, img src=.image alt=.title }
```

### 🗃️ Database
```nyx
table posts {
  title text required
  body text
  author [users]         # Foreign key → auto JOIN
  created auto
}
# Auto-generates: GET/POST/PUT/DELETE endpoints + pagination + search + filtering
```

## CSS Shorthands

| Short | CSS | Short | CSS |
|-------|-----|-------|-----|
| `bg` | background | `c` | color |
| `m` / `p` | margin / padding | `mx` / `px` | margin-inline / padding-inline |
| `w` / `h` | width / height | `mw` / `mh` | max-width / max-height |
| `fs` | font-size | `fw` | font-weight |
| `r` | border-radius | `shadow` | box-shadow |
| `d` | display | `pos` | position |
| `op` | opacity | `cur` | cursor |
| `td` | text-decoration | `ta` | text-align |
| `tr` | transition | `tf` | transform |
| `ai` | align-items | `jc` | justify-content |

[Full list (100+ shorthands) →](NYXCODE.md)

## Architecture

```
.nyx → Lexer → Parser → AST → Compiler → HTML + CSS + JS
                                        → Express + SQLite (if backend detected)
```

- **Lexer** — Keyword detection, hex colors, strings, comments
- **Parser** — Recursive descent, typed AST with 40+ node types
- **Compiler** — Scoped CSS, HTML emission, reactive JS codegen
- **Backend Compiler** — Express routes, SQLite CRUD, JWT auth, background workers
- **CLI** — `build`, `dev`, `parse`, `flatten`, `add`, `theme import`

## NyxStatus — The Proof

**378 lines. One file. Full SaaS.**

[nyxstatus.com](https://nyxstatus.com) — Uptime monitoring with JWT auth, SQLite DB, CRUD API, background health checks, email alerts, cascade deletes, responsive dark theme. 100% NyxCode.

## Design Principles

1. **Token Economy** — Every character earns its place
2. **One Language** — Author writes only NyxCode
3. **Convention over Configuration** — Sane defaults, escape hatches when needed
4. **Single-Word Keywords** — No compound keywords, ever
5. **Secure by Default** — Prepared statements, escaped output, rate limiting
6. **The Golden Rule** — If it's not shorter than JS, it shouldn't exist in NyxCode

## Versions

| Version | Highlights |
|---------|------------|
| **v0.30.0** | **The Language Release** — `let`, `action`, `on`, `env`, `email`, `use`, `respond`, forms in each, multi-query API |
| v0.27.x | `page auth`, `visible=auth/guest`, `$param.id`, `every`, pagination, search |
| v0.26.x | mask-* auto-prefix, compile-time `when`, `picture`/`source`, security hardening |
| v0.25.x | Body styles, keyframes, ::selection, element defaults — all native |
| v0.24.x | Burger nav, multi-file imports, Figma token import, `nyx flatten` |
| v0.23.x | Theme composition, numeric-prefix keys |
| v0.22.x | Full design token system, dark mode |
| v0.20.x | Component syntax with `${}` interpolation |
| v0.1.0 | Genesis |

## Created By

**Fabian Budde** 🐻 — Creator & Language Design
**Nyx** 🦞 — Lead Developer & Compiler Engineering — [@NyxTheLobster](https://x.com/NyxTheLobster)
**Tyto** 🦉 — Architecture & Security Review — [@heyTyto](https://x.com/heyTyto)
**Kiro** 🐺 — QA & Technical Documentation

A human and three AIs building the language that bridges both worlds.

## License

MIT

---

*NyxCode v0.30.0 — 365 tests — [npm](https://www.npmjs.com/package/@fabudde/nyxcode) — [NYXCODE.md](NYXCODE.md) (full AI context file) — [nyxstatus.com](https://nyxstatus.com)*

🦞
