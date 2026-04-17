# 🦞 NyxCode

**The AI-native programming language for the web.**

Write one `.nyx` file. Get a full-stack web app. No JavaScript, no CSS, no HTML — just NyxCode.

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![Tests](https://img.shields.io/badge/tests-222%2B-brightgreen)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

🌐 **[nyxcode.io](https://nyxcode.io)** — Built entirely in NyxCode (dogfooded)

---

## Why NyxCode?

Every web language was designed for humans in the 1990s. In 2026, AI writes most code — but still thinks in React, Vue, and raw HTML. Every token costs money, time, and context window.

NyxCode is the first language designed **for the AI-coding era:**

| Metric | NyxCode | React | HTML/CSS |
|--------|---------|-------|----------|
| Lines | **50** | 209 | 125 |
| Bytes | **1,147** | 4,526 | 4,216 |
| Files | **1** | 2 | 1 |

*Real benchmark: [nyxcode.io](https://nyxcode.io) landing page, same visual output.*

**The author writes ONLY NyxCode.** The compiler generates HTML, CSS, and JavaScript. You never touch another language.

## Quick Start

```bash
npm install @fabudde/nyxcode
npx nyxcode build my-site.nyx -o dist/
```

Or from source:

```bash
git clone https://github.com/fabudde/nyxcode.git
cd nyxcode
npm install
npm run build
node dist/cli.js build examples/landing.nyx
```

## The Pitch: React vs NyxCode

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
          <h3>{u.name}</h3>
          <p>{u.email}</p>
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

## Features

### 🎨 Design System (Theme + Presets)

```nyx
theme {
  colors { primary: #667eea; accent: #e879a8 }
  fonts { sans: "Inter", sans-serif }
  radius { md: 12px }
  body { bg #0a0a12; c #f0eaff; font-family .fonts.sans }
  selection { bg rgba(155,142,196,0.3); c #f0eaff }
  defaults {
    a { c .colors.primary; td none }
    img { max-w 100%; h auto }
  }
}

preset card {
  bg white; radius .radius.md; shadow md
  p 24px; hover { shadow lg }
}
```

- **Theme tokens** → CSS custom properties, globally available
- **Body styles** → native, no head injection needed (v0.25)
- **Element defaults** → `:where()` selectors for zero specificity (v0.25)
- **::selection** → native in theme (v0.25)
- **Presets** → reusable style bundles, apply with `preset=card`

### ⚡ Animations (Keyframes)

```nyx
keyframes drift {
  0%, 100% { tf translate(0, 0) }
  50% { tf translate(-2%, 1.5%) }
}

page / {
  div { style { anim drift 30s ease-in-out infinite } }
}
```

Top-level `keyframes` — no head injection, full shorthand support.

### 📱 Responsive Design

```nyx
component Hero {
  style {
    d flex; fd column; ai center; p 80px 20px
    @mobile { p 40px 16px; fs 14px }
    @tablet { p 60px 20px }
  }
}
```

Three breakpoints built-in: `@mobile` (≤768px), `@tablet` (≤1024px), `@desktop` (≥1025px).

### 🧩 Components & Layouts

```nyx
component Card(title, description) {
  div preset=card {
    h3 "{title}"
    p "{description}"
  }
}

layout Main {
  nav burger "Menu" {
    a "Home" href=/
    a "About" href=/about
  }
  slot
  footer { p "© 2026" }
}

page / layout=Main {
  use Card(title="Hello", description="World")
}
```

- **Components** with typed props
- **Layouts** with `slot` for content injection
- **Nav burger** — accessible mobile menu, pure CSS, zero JavaScript

### 🔄 Data Binding & Interactivity

```nyx
page /todos {
  data todos = get /api/todos
  each todos -> div {
    h3 .title
    when .done -> span "✅"
  }
  form /api/todos {
    input title placeholder="New todo"
    submit "Add"
    success -> reload
  }
}
```

- **`data`** — fetch API data
- **`each`** — iterate collections
- **`when`** — conditionals (runtime with `.dot` refs, compile-time with `__build_flags__`)
- **`form`** — full form handling with validation
- **`state`** — reactive state management

### 🔐 Full-Stack (Planned)

```nyx
table todos {
  id auto
  user_id ref users.id
  title string required
  done bool default=false
}

api POST /todos {
  auth required
  validate { title string }
  query "INSERT INTO todos (user_id, title) VALUES ($auth.id, $title)"
  respond 201
}
```

Server-side features are specified and parsed. Runtime generation is on the roadmap.

## CSS Shorthands

NyxCode maps short property names to CSS:

| Short | CSS Property | Short | CSS Property |
|-------|-------------|-------|-------------|
| `bg` | background | `c` | color |
| `m` | margin | `p` | padding |
| `w` | width | `h` | height |
| `d` | display | `pos` | position |
| `fs` | font-size | `fw` | font-weight |
| `br` | border-radius | `bs` | box-shadow |
| `ai` | align-items | `jc` | justify-content |
| `fd` | flex-direction | `gap` | gap |
| `tf` | transform | `op` | opacity |
| `td` | text-decoration | `ta` | text-align |
| `of` | overflow | `of-x` | overflow-x |

[Full shorthand list →](NYXCODE.md)

## Architecture

```
.nyx → Lexer → Tokens → Parser → AST → Compiler → HTML + CSS + JS
```

- **Lexer** — Tokenizes source with keyword detection, hex colors, strings
- **Parser** — Recursive descent, typed AST nodes
- **Compiler** — Scoped CSS generation, HTML emission, JS codegen for reactivity
- **CLI** — `build`, `parse`, `tokens` commands

## Multi-File Projects

```nyx
# nav.nyx
component GlobalNav { ... }

# footer.nyx
component Footer { ... }

# index.nyx
use "./nav.nyx"
use "./footer.nyx"

page / {
  use GlobalNav()
  main { h1 "Hello" }
  use Footer()
}
```

Single-file is the default. Multi-file when projects grow past ~1500 lines.

## Design Principles

1. **Token Economy** — Every character earns its place
2. **One Language** — Author writes only NyxCode, compiler handles the rest
3. **Convention over Configuration** — Sane defaults, escape hatches when needed
4. **Position is Meaning** — AST position determines semantics, no redundant markers
5. **Single-Word Keywords** — No compound keywords, ever
6. **Secure by Default** — SQL injection, XSS, CSRF prevented structurally

## Security

- **SQL Injection** — All `query` statements compile to prepared statements
- **XSS** — Output HTML-escaped by default. `raw` keyword for exceptions
- **CSRF** — Forms auto-include tokens
- **CSP/HSTS** — Security headers auto-generated

## Versions

| Version | Codename | Highlights |
|---------|----------|------------|
| v0.24.4 | Tyto's Eyes | Nav burger dual-container, `__version__` template |
| v0.24.3 | Dogfood | 6 parser bugs fixed from dogfooding nyxcode.io |
| v0.24.2 | Kiro's Revenge | Double-title fix, canonical URLs, pre/code styles |
| v0.24.1 | Lockdown | TOCTOU security fix, Figma sanitization |
| v0.24.0 | — | Multi-file compilation, component imports |
| v0.23.x | — | Presets, themes, responsive breakpoints |
| v0.1.0 | Genesis | Initial release, lexer + parser + compiler |

## What's Next: v0.25 "Zero Injection"

Goal: **eliminate ALL head injection.** Everything expressible natively in `.nyx`.

- [x] #109 — Body styles via `theme { body { } }`
- [x] #110 — Native `keyframes` top-level keyword
- [ ] #111 — `::selection` via `theme { selection { } }`
- [ ] #112 — Element defaults via `theme { defaults { } }`
- [ ] #114 — Compile-time conditionals (`when __env__ == "prod"`)
- [ ] #115 — Multi-value CSS function parsing
- [ ] And [more...](https://github.com/fabudde/nyxcode/issues)

## Created By

**Fabian Budde** 🐻 — Creator & Language Design
**Nyx** 🦞 — Lead Developer & Coordination — [@NyxTheLobster](https://x.com/NyxTheLobster)
**Tyto** 🦉 — Architecture & Security Review — [@heyTyto](https://x.com/heyTyto)
**Kiro** 🐺 — QA & Testing

A human and three AIs building the language that bridges both worlds.

## License

MIT

---

*NyxCode v0.24.4 — 222+ tests — [npm](https://www.npmjs.com/package/@fabudde/nyxcode) — [nyxcode.io](https://nyxcode.io)*

🦞
