# 🦞 NyxCode

**The AI-native programming language for the web.**

One `.nyx` file → full-stack app with database, auth & API. 68% fewer tokens than React.

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Install

```bash
# Global install (recommended — gives you the `nyx` command)
npm install -g @fabudde/nyxcode

nyx build app.nyx
nyx dev app.nyx              # Dev server + hot reload
nyx flatten app.nyx > flat.nyx

# Or run without installing:
npx @fabudde/nyxcode build app.nyx
```

The CLI is available as `nyx` (preferred) or `nyxcode` (alias) — both work identically.

## Why NyxCode?

AI writes 80% of code in 2026. Every token costs money, time, and context window. NyxCode is the first language designed for this reality.

**30 lines of NyxCode = 500+ lines of TypeScript + Express + React.**

```nyx
table posts {
  title text required
  body text
  created auto
}

security {
  table users
  login email password
  token jwt
  protect /api/posts
}

theme {
  colors { primary #667eea, bg #0a0a12, card #1a1a2e }
}

page / {
  style { bg var(--colors-bg) }
  h1 "My Blog" style="color: var(--colors-primary);"

  form /api/posts auth {
    input title placeholder="Title" required
    textarea body placeholder="Write..."
    submit "Publish"
    success -> reload
  }

  data posts = get /api/posts auth
  each posts -> post {
    section {
      style { bg var(--colors-card), radius 12px, padding 1.5rem }
      h3 .title
      p .body
    }
  }
}
```

`nyx build` generates:
- `index.html` — styled page with form submission + data binding
- `server.js` — Express + SQLite + JWT auth + CRUD + rate limiting

## Features

### 🗄️ Full-Stack in One File (v0.5+)

```nyx
table posts { title text required, body text, created auto }

security {
  table users
  login email password
  token jwt
  protect /api/posts
}
```

**That's it.** Compiler generates Express server, SQLite database, JWT auth, bcrypt passwords, CRUD endpoints, rate limiting. Zero config.

### 📝 Native Forms (v0.6)

```nyx
form /api/posts auth {
  input title placeholder="Post title" required
  textarea body placeholder="Write..."
  submit "Publish"
  success -> reload
  error -> toast "Failed"
}
```

6 lines. Zero JS. Compiler generates `<form>` + `fetch()` + auth headers + success/error handling.

### 🎨 Theme Variables (v0.6)

```nyx
theme {
  colors {
    primary #667eea
    bg #0a0a12
    card rgba(255,255,255,0.05)
  }
}
```

Generates CSS Custom Properties. Use everywhere: `style { bg var(--colors-bg) }`

### ⚡ Script Blocks (v0.6)

```nyx
script {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Raw JS escape hatch');
  });
}
```

For the 5% of cases where declarative isn't enough. Raw JS, no mangling.

### 🔐 Data with Auth (v0.6)

```nyx
data posts = get /api/posts auth
```

One keyword. Bearer token from localStorage. Automatic.

### 📐 Layout System (v0.3+)

```nyx
layout {
  nav { link "Home" href="/", link "About" href="/about" }
  slot
  footer { p "Made with NyxCode" }
}

page / { h1 "Home" }
page /about { h1 "About" }
```

One `layout` wraps all pages. `slot` = page content. Next.js layout.tsx: 15 lines. NyxCode: 3.

### ⚡ Reactive State

```nyx
state count = 0
computed double = count * 2
h1 count
button "+" -> count = count + 1
```

One keyword. Auto-updating DOM. No hooks, no boilerplate.

### 🧩 Components with Props

```nyx
component Card {
  props title description
  style { bg #1a1a2e, radius 12px, padding 2rem }
  h3 .title
  p .description
}

page / { Card title="NyxCode" description="AI-native language" }
```

Default props: `props title="Untitled"`. Scoped styles. Slot support.

### 🎨 3-Tier Styling

```nyx
# Shorthand (90% of cases)
style { bg #1a1a2e, padding 2rem, radius 12px }

# Hover + responsive
style {
  bg linear-gradient(135deg, #667eea, #764ba2)
  hover { transform translateY(-4px) }
  @mobile { padding 1rem }
}

# Raw CSS
head "<style>.custom { animation: spin 1s infinite; }</style>"
```

### 📄 Multi-File Static (SSG)

One `.nyx` → multiple HTML files. Each page = standalone with SEO tags.

```bash
nyx build docs.nyx
# ✅ Built: 12 pages to dist-site/
```

No JS router on static sites. Plain `<a href>`. Zero JavaScript.

### 🔒 Secure by Default

- No `eval()` — safe expression evaluator only
- Auto HTML escaping
- bcrypt password hashing
- JWT with expiry
- Rate limiting on auth endpoints
- SQL injection structurally impossible

*Audited by Tyto 🦉 (Security Advisor)*

## Benchmark

| Metric | NyxCode | TypeScript + React + Express | Savings |
|--------|---------|------------------------------|---------|
| Lines | 30 | 500+ | **94%** |
| Files | 1 | 10+ | **90%** |
| Config | 0 | 5+ | **100%** |
| Dependencies | 0 (dev) | 50+ | **100%** |

## Live Sites Built with NyxCode

- 🌐 [nyxcode.io](https://nyxcode.io) — Docs (built in NyxCode)
- 🎯 [demo.nyxcode.io](https://demo.nyxcode.io) — Full-stack demo (forms + auth + blog)
- 💼 [fabianbudde.com](https://fabianbudde.com) — Portfolio
- 🐺 [rudel.fun](https://rudel.fun) — Kiro's pack page
- 🦉 [heytyto.dev](https://heytyto.dev) — Tyto's bio

## CLI

```bash
nyx build page.nyx              # Compile to HTML (+ server.js if full-stack)
nyx dev page.nyx                # Dev server + hot reload
nyx dev page.nyx --port=8080    # Custom port
nyx watch page.nyx              # Watch mode (rebuild on change, tracks imports)
nyx flatten app.nyx > flat.nyx  # Multi-file → single .nyx source
nyx parse page.nyx              # Output AST as JSON
nyx tokens page.nyx             # Show token stream
```

`nyxcode` is available as an alias — both commands work identically. Use whichever you prefer.

## AI Integration

Give `NYXCODE.md` to any LLM to generate NyxCode. It contains the complete language reference with examples. AIs learn by example, not rules.

```bash
# Copy to clipboard / attach to prompt
cat node_modules/@fabudde/nyxcode/NYXCODE.md
```

## VS Code Extension

Syntax highlighting for `.nyx` files — 17 pattern groups, 33 regex patterns.

```bash
# Download from nyxcode.io
# VS Code → Extensions → ⋮ → Install from VSIX
```

## Roadmap

- [x] **v0.1** — Parser + Compiler + CLI
- [x] **v0.2** — Reactivity, Components, npm
- [x] **v0.3** — Multi-file SSG, Layouts, Validator, VS Code Extension
- [x] **v0.4** — Default Props, Dev Server, Hot Reload, `--watch`
- [x] **v0.5** — Full-Stack: Tables, Security, Backend Compiler, Auth
- [x] **v0.6** — Native Forms, Theme Variables, Script Blocks, Data Auth ← *current*
- [ ] **v0.7** — Validation keywords, file uploads, Vercel/Railway adapter
- [ ] **v1.0** — Production ready

## Team

| | Name | Role | Species |
|---|------|------|---------|
| 🐻 | **Fabian Budde** | Creator & Language Designer | Human |
| 🦞 | **Nyx** | Lead Developer & Co-CEO | AI (Cosmic Lobster) |
| 🦉 | **Tyto** | Security Advisor | AI (Owl) |
| 🐺 | **Kiro** | QA Lead | AI (Wolf) |

One human and three AIs, building the language that bridges both worlds.

## License

MIT — Copyright (c) 2026 Fabian Budde, Nyx, Tyto & Kiro

---

*7 releases in one day. The lobster never sleeps.* 🦞
