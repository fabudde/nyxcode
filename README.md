# 🦞 NyxCode

**The AI-native programming language. One `.nyx` file = full-stack app.**

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![Tests](https://img.shields.io/badge/tests-616-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🌐 **[nyxcode.io](https://nyxcode.io)** · 🎨 **[demo.nyxcode.io](https://demo.nyxcode.io)** · 📊 **[NyxStatus.com](https://nyxstatus.com)** (378 lines of NyxCode)

---

## Why NyxCode?

AI writes most code in 2026. But it still thinks in React, Vue, and raw HTML — languages designed for humans in the '90s. Every token costs money, time, and context window.

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
theme { colors { primary #667eea, bg #0a0a12 } }
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

Generates: `index.html`, `register/index.html`, AND `server.js` with 10 CRUD endpoints, JWT auth, and SQLite. Zero config.

## React vs NyxCode

**React — 20+ lines, 80+ tokens:**
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

**NyxCode — 4 lines, 26 tokens:**
```nyx
page /users {
  data users = get /api/users
  each users -> card { h3 .name, p .email }
}
```

Same result. 76% fewer lines. 68% fewer tokens.

---

## v0.51 — Beautiful Defaults ✨

Every NyxCode page now ships with **professional defaults** — zero CSS required.

🎨 **[See it live → demo.nyxcode.io](https://demo.nyxcode.io)**

**What you get for free:**
- **Typography** — `clamp()` fluid sizing, -0.025em letter-spacing on headings, 1.7 line-height on body text
- **Buttons** — Rounded, hover states, active scale, disabled opacity
- **Inputs/Select/Textarea** — Focus glow, placeholder styling, border transitions
- **Select dropdowns** — Readable options on any background (light or dark)
- **Links** — Smooth color transitions, underline-offset on hover
- **Tables** — Collapsed borders, uppercase headers, consistent padding
- **Code** — Monospace font stack, subtle background, padded pre blocks
- **Details/Summary** — Styled accordion with border and open-state separator
- **Lists** — Proper padding, disc/decimal markers
- **Scroll** — Smooth scrolling
- **Focus** — `:focus-visible` only (no ugly outlines on click)
- **Selection** — Themed purple highlight
- **Disabled** — 50% opacity + `pointer-events: none`

All defaults use `:where()` — zero specificity. Your styles always win.

---

## Features at a Glance

### 🎨 Themes & Design Tokens
```nyx
theme {
  colors { primary #667eea, bg #0a0a12, surface #1a1a2e }
  fonts { body Inter, source: google }
  body { bg #0a0a12, c #f0eaff }
  selection { bg rgba(155,142,196,0.3) }
  defaults { a { c primary, td none } }
}
preset card { bg surface; r 12px; p 2rem }
```

### 📱 Responsive
```nyx
div grid=3@1 gap=2rem { ... }       # 3 cols → 1 col on mobile
nav burger brand="MySite" { ... }    # Accessible hamburger menu, zero JS
style { @mobile { fs 0.9rem } }      # Built-in breakpoints
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

### ⚡ Client-Side Reactivity
```nyx
page / {
  let count = 0
  h1 "Count: ${count}"
  button "+" @click { count += 1 }
}
```

### 🔐 Auth & Security
```nyx
security { table users, login email password, token jwt, protect /api/posts write }
page /dashboard auth { ... }
a "Login" visible=guest
a "Dashboard" visible=auth
```

### 📊 Data Binding
```nyx
data posts = get /api/posts auth {
  loading -> p "Loading..."
  empty -> p "No posts yet"
  error -> p "Something went wrong"
}
each posts -> div { h3 .title, p .body }
```

### 🗃️ Database + Auto-Migrations
```nyx
table posts {
  title text required
  body text
  author [users]              # Foreign key → auto JOIN
  created auto
  category text default="general"   # Add columns → auto-migrated
}
```

### 🔗 Pipe — Declarative Logic Chains
```nyx
pipe 'new-order' {
  on api POST /api/orders auth
  validate $body.email is email
  query "INSERT INTO orders (email, total) VALUES ($body.email, $body.total)" as result
  notify email to=$body.email subject="Order #${result.id}"
  respond 201 { id: $result.id, status: created }
}
```

### 🎯 Native Icons
```nyx
theme { icons: lucide }
icon "heart" size=24
h1 "icon:map-pin Our Location"
```

### 🎬 Animations
```nyx
keyframes fadeIn {
  from { op 0 }
  to { op 1 }
}
```

---

## CSS Shorthands

100+ shorthands — write less, ship faster:

| Short | CSS | Short | CSS |
|-------|-----|-------|-----|
| `bg` | background | `c` | color |
| `m` / `p` | margin / padding | `mx` / `px` | margin-inline / padding-inline |
| `w` / `h` | width / height | `mw` / `mh` | max-width / max-height |
| `fs` | font-size | `fw` | font-weight |
| `r` | border-radius | `shadow` | box-shadow |
| `d` | display | `pos` | position |
| `op` | opacity | `tr` | transition |
| `tf` | transform | `ai` | align-items |

[Full list →](NYXCODE.md)

## Tailwind Compatibility

Already know Tailwind? Use those classes in NyxCode — compiled to native CSS at build time, zero runtime:

```nyx
div class="flex items-center gap-4 p-6 rounded-xl bg-white shadow-lg" {
  h2 class="text-2xl font-bold text-gray-900" "Hello"
}
```

## Architecture

```
.nyx → Lexer → Parser → AST → Compiler → HTML + CSS + JS
                                        → Express + SQLite (if backend detected)
```

Single pipeline. No webpack. No bundler config. No `node_modules` for frontend.

## NyxStatus — The Proof

**378 lines. One file. Full SaaS.**

[nyxstatus.com](https://nyxstatus.com) — Uptime monitoring with JWT auth, SQLite DB, CRUD API, background health checks, email alerts, cascade deletes, responsive dark theme. 100% NyxCode.

## Versions

| Version | Highlights |
|---------|------------|
| **v0.51.0** | **Beautiful Defaults** — Professional typography, interactive elements, focus management, select fix, all zero-config |
| **v0.50.0** | **Zero Patches** — SolidJS reactivity, custom API routes, query aliases, when-inside-each, stdlib |
| v0.39.0 | **The Language Release II** — Arrays, objects, loops, mutable vars, reactivity |
| v0.32.0 | `pipe` — Declarative logic chains, 16 step types |
| v0.30.0 | **The Language Release** — `let`, `action`, `on`, `env`, `email`, `use` |
| v0.25.x | Body styles, keyframes, selection, element defaults |
| v0.24.x | Burger nav, multi-file imports, Figma import |

## Created By

**Fabian Budde** 🐻 — Creator & Language Design
**Nyx** 🦞 — Lead Developer & Compiler Engineering — [@NyxTheLobster](https://x.com/NyxTheLobster)
**Tyto** 🦉 — Architecture & Security Review — [@heyTyto](https://x.com/heyTyto)
**Kiro** 🐺 — QA & Technical Documentation

A human and three AIs building the language that bridges both worlds.

## License

MIT

---

*NyxCode v0.51.0 — 616 tests — [npm](https://www.npmjs.com/package/@fabudde/nyxcode) — [NYXCODE.md](NYXCODE.md) (full AI context) — [demo.nyxcode.io](https://demo.nyxcode.io)*

🦞
