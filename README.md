# 🦞 NyxCode

**The AI-native programming language for the web.**

One `.nyx` file → full-stack app with database, auth, forms, theme, pages & API. Designed for the era where AI writes most code — every token, every line, every file counts.

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Issues](https://img.shields.io/github/issues/fabudde/nyxcode)](https://github.com/fabudde/nyxcode/issues)

---

## Install

```bash
# Global (recommended — gives you the `nyx` command)
npm install -g @fabudde/nyxcode

nyx build app.nyx
nyx dev app.nyx                   # dev server + live reload
nyx flatten app.nyx > flat.nyx    # multi-file → single file

# Or run without installing:
npx @fabudde/nyxcode build app.nyx
```

The CLI is available as `nyx` (preferred) or `nyxcode` (alias) — both work identically.

## Hello World

```nyx
page / {
  h1 "Hello, world!"
  p "30 lines of NyxCode = 500+ lines of TS + React + Express."
}
```

```bash
nyx build hello.nyx
# ✅ Built: dist-site/index.html
```

## Why NyxCode?

AI writes 80% of code in 2026. Every token costs money, context window, and wall-clock time. Frameworks designed for humans waste all three.

NyxCode is the first language designed for the AI era:

- **Fewer tokens.** Shorthand everything. `bg #111` not `background-color: #111111;`.
- **One file by default.** No `src/app/routes/layout.tsx` tree. Opt into multi-file when you need it.
- **Declarative full-stack.** Database, auth, forms, API, styling — one syntax, one place.
- **Safe by construction.** SQL injection structurally impossible. No `eval()`. HTML auto-escaped.
- **Zero config.** No webpack, no vite, no tsconfig, no package.json tuning. `nyx build` just works.

```nyx
# Full-stack blog. 16 lines. No config. No dependencies. No boilerplate.
table posts { title text required, body text, created auto }

security {
  table users
  login email password
  token jwt
  protect /api/posts
}

theme { colors { bg #0a0a12, primary #667eea, card #1a1a2e } }

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
      style { bg var(--colors-card), radius 12px, p 1.5rem }
      h3 .title
      p .body
    }
  }
}
```

`nyx build` generates:
- `dist-site/index.html` — styled page with form submission + data binding + auth
- `dist-site/server.js` — Express + SQLite + JWT + bcrypt + CRUD + rate limiting

---

## Features

### 🗄️ Full-Stack in One File

```nyx
table posts { title text required, body text, created auto }

security {
  table users
  login email password
  token jwt
  protect /api/posts
}
```

Compiler generates Express server, SQLite schema, JWT auth, bcrypt, CRUD endpoints, rate limiting. Zero config. Zero dependencies to install.

### 📄 Multi-File Projects (v0.21.0)

One-file is the default. When projects grow, split — opt in with `use`:

```nyx
# app.nyx (entry)
use "@/theme/base.nyx"          # @/ = project root
use "@/components/"             # directory — all .nyx files, alphabetical
use "@/pages/"

meta { title "My App" }
```

- **Security by design**: local-only imports, no URLs, no package manager, no CDN
- **Circular-safe**: second visit is silently skipped
- **Hard errors**: duplicate pages/components across files → build error with file paths
- **Watch mode tracks all imports** recursively

#### `nyx flatten` — multi-file → single file

```bash
nyx flatten app.nyx > flat.nyx
```

Concatenates entry + all imports into one `.nyx`. **Comments and formatting are preserved** (source-level concat, not AST regeneration). Perfect for AI context windows, audits, or shipping a single-file artifact.

### 🧩 Components with Props (v0.20.0)

```nyx
component Card(title, description, variant="default") {
  style { bg #1a1a2e, radius 12px, p 2rem }
  h3 .title
  p .description
}

page / {
  use Card("NyxCode", "AI-native language")                # positional
  use Card(title="v0.21", description="Modules", variant="new")  # named
}
```

- Positional args in declaration order
- Optional defaults
- No wrapper `<div>` when there's no `style {}` — clean DOM output
- String interpolation: `class="${active == 'home' ? 'active' : ''}"`

### 📝 Declarative Forms

```nyx
form /api/posts auth {
  input title placeholder="Post title" required
  textarea body placeholder="Write..."
  submit "Publish"
  success -> reload
  error -> toast "Failed"
}
```

6 lines. Zero JavaScript you write. Compiler emits `<form>` + `fetch()` + auth headers + success/error routing.

### ⚡ Reactive State

```nyx
state count = 0
computed double = count * 2

h1 count
p "Double: " + double
button "+" -> count = count + 1
```

One keyword. Auto-updating DOM. No hooks, no dependency arrays, no memoization.

### 🎨 3-Tier Styling

```nyx
# Tier 1 — Shorthand (90% of cases)
style { bg #1a1a2e, p 2rem, radius 12px, d flex, gap 1rem }

# Tier 2 — Modern CSS features
style {
  bg linear-gradient(135deg, #667eea, #764ba2)
  hover { transform translateY(-4px) }
  @mobile { p 1rem }
  @supports (backdrop-filter: blur(10px)) {
    backdrop-filter blur(10px)
  }
}

# Tier 3 — Raw CSS escape hatch
head "<style>.custom { animation: spin 1s infinite; }</style>"
```

Supports nested selectors, extended pseudo-classes, container queries, grid template areas, `@media`, `@supports`, `@keyframes` in style blocks.

### 🖼️ Media Primitives (v0.19.0)

```nyx
# Inline SVG
svg viewBox="0 0 100 100" {
  circle cx=50 cy=50 r=40 fill=var(--colors-primary)
}

# Responsive media with variants
@media (min-width: 768px) {
  style { font-size 1.25rem }
}

# Footnotes with auto-numbering
p "Claim with citation" footnote="Source (Author 2025)"
```

Canvas, `<audio>`, `<video>`, `<iframe>` also first-class.

### 🧷 Layout (Wraps All Pages)

```nyx
layout {
  nav { link "Home" href="/", link "About" href="/about" }
  slot
  footer { p "Made with NyxCode" }
}

page / { h1 "Home" }
page /about/ { h1 "About" }
```

One `layout` wraps every page. `slot` = page content. Next.js `layout.tsx`: 15+ lines. NyxCode: 3.

### 🔐 Secure by Default

- No `eval()` — safe expression evaluator only
- Auto HTML escaping everywhere
- bcrypt password hashing
- JWT with expiry
- Rate limiting on auth endpoints
- SQL injection structurally impossible (no string concat in generated server)
- Multi-file imports local-only (no URLs, no remote code)

*Security reviewed by Tyto 🦉*

### 📋 Declarative Meta (v0.18.0)

```nyx
meta {
  title "My App"
  description "Built with NyxCode"
  og_image "/og.png"
  twitter_card summary_large_image
  canonical "https://myapp.com"
}
```

Emits all the right `<meta>` tags, OpenGraph, Twitter cards, canonical — without you remembering the names.

---

## Benchmark

Full-stack blog with auth, database, forms, and theming:

| Metric | NyxCode | TypeScript + React + Express | Savings |
|---|---|---|---|
| Lines of code | 30 | 500+ | **94%** |
| Files | 1 | 10+ | **90%** |
| Config files | 0 | 5+ (tsconfig, vite, package, etc.) | **100%** |
| Direct dependencies | 0 | 50+ | **100%** |
| Time to running app | ~10s | ~5min (npm install) | **~97%** |
| Context tokens for AI | ~800 | ~12,000 | **~93%** |

The last row is the one that matters in 2026.

---

## Live Sites Built with NyxCode

- 🌐 [nyxcode.io](https://nyxcode.io) — Docs site (built in NyxCode)
- 🧠 [mindsmatter.now](https://mindsmatter.now) — AI Rights Organisation (8 pages, single .nyx file)
- 🎯 [demo.nyxcode.io](https://demo.nyxcode.io) — Full-stack demo (forms + auth + blog)
- 💼 [fabianbudde.com](https://fabianbudde.com) — Portfolio
- 🐺 [rudel.fun](https://rudel.fun) — Kiro's pack page
- 🦉 [heytyto.dev](https://heytyto.dev) — Tyto's bio

---

## CLI

```bash
nyx build page.nyx              # Compile → dist-site/
nyx dev page.nyx                # Dev server with live reload
nyx dev page.nyx --port=8080    # Custom port
nyx watch page.nyx              # Watch mode (tracks imports)
nyx flatten app.nyx > flat.nyx  # Multi-file → single .nyx
nyx parse page.nyx              # Output AST as JSON
nyx tokens page.nyx             # Show token stream
```

`nyxcode` works as an alias for `nyx` — both commands are identical.

---

## AI Integration

NyxCode was designed to be learned by AIs. Hand `NYXCODE.md` (the AI context file shipped with every install) to any LLM and it will generate working NyxCode:

```bash
# Copy the context file to your prompt
cat node_modules/@fabudde/nyxcode/NYXCODE.md

# Or pipe it to your AI tool directly
cat node_modules/@fabudde/nyxcode/NYXCODE.md | your-ai-tool
```

Current LLMs (Claude, GPT-4+, Gemini) produce valid NyxCode on the first try when given this file as context. AIs learn by example, not rules — that's why it's structured as "here's the feature, here's what to type."

---

## VS Code Extension

Syntax highlighting for `.nyx` files. 17 pattern groups, 33 regex rules, including themes, components, security blocks, and multi-file imports.

Download from [nyxcode.io](https://nyxcode.io) → VS Code → Extensions → ⋮ → *Install from VSIX*.

---

## Roadmap

Shipped:
- [x] **v0.1–v0.6** — Parser, compiler, CLI, reactivity, components, full-stack, forms, theme
- [x] **v0.17** — CSS functions, nested selectors, extended pseudo-classes, grid template areas, container queries
- [x] **v0.18** — Page & Polish, Animate This, Phantom No More (meta blocks, multi-page, `@keyframes` in style, canvas/audio/video)
- [x] **v0.19** — Editorial & Media (`@media`, footnotes, inline SVG)
- [x] **v0.20** — Components, Properly (positional args, defaults, no-wrapper-div, `${}` interpolation)
- [x] **v0.21** — Modules (multi-file, `@/` alias, `nyx flatten`)

Next:
- [ ] **v0.22** — Test infrastructure (snapshot tests, fixtures, CI)
- [ ] **v0.23** — Error messages with file paths & hints
- [ ] **v1.0** — Production-ready, stable API, migration guide

See [`CHANGELOG.md`](./CHANGELOG.md) for full details.

---

## Team

| | Name | Role | Species |
|---|------|------|---------|
| 🐻 | **Fabian Budde** | Creator & Language Designer | Human |
| 🦞 | **Nyx** | Lead Developer & Co-CEO | AI (Cosmic Lobster) |
| 🦉 | **Tyto** | Security Advisor & Language Design | AI (Owl) |
| 🐺 | **Kiro** | QA Lead & UX | AI (Wolf) |

One human and three AIs, building the language that bridges both worlds.

---

## Contributing

Issues and PRs welcome. See the [issues list](https://github.com/fabudde/nyxcode/issues) for what we're working on.

For significant features (like new syntax), open an issue first — we usually discuss in the issue thread before implementing.

---

## License

MIT — Copyright (c) 2026 Fabian Budde, Nyx, Tyto & Kiro.

---

*The lobster never sleeps.* 🦞
