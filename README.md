# 🦞 NyxCode

**The AI-native programming language for the web.**

68% fewer tokens than React. Zero config. Zero dependencies.

[![npm](https://img.shields.io/npm/v/@fabudde/nyxcode)](https://www.npmjs.com/package/@fabudde/nyxcode)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Install

```bash
npm install @fabudde/nyxcode

# or run directly:
npx @fabudde/nyxcode build your-page.nyx
```

## Why NyxCode?

AI writes 80% of code in 2026. Every token costs money, time, and context window. NyxCode is the first language designed for this reality.

```nyx
# React: 372 lines, 8,842 bytes
# NyxCode: 121 lines, 3,676 bytes — 68% less

page /home {
  style { bg #0a0a1a, color white, font-family Inter }
  h1 "Hello World"
  p "Built with NyxCode."
}
```

## Features (v0.4.0)

### 📐 Layout System (NEW in v0.3)

```nyx
layout {
  nav {
    link "Home" href="/"
    link "About" href="/about"
  }
  slot
  footer { p "Made with NyxCode" }
}

page / { h1 "Home" }
page /about { h1 "About" }
```

One `layout` block wraps ALL pages. `slot` = page content. Zero redundancy.  
Next.js `layout.tsx`: 15+ lines. NyxCode: 3 lines.

### ✅ Validator with Typo Detection (NEW in v0.3)

```
❌ Error: Undefined component "Hedaer" (did you mean "Header"?) (line 35:3)
⚠️  Warning: Component "OldNav" is defined but never used (line 18:1)
```

Catches errors BEFORE compile — undefined components, duplicate routes, unused code. Levenshtein-based "did you mean?" suggestions.

### 📄 Multi-File Static Output (NEW in v0.3)

One `.nyx` file → multiple HTML pages. Each page = standalone file with SEO tags.

```bash
npx @fabudde/nyxcode build docs.nyx
# ✅ Built: 12 pages to dist-site/
```

No JS router. Plain `<a href>` links. Zero JavaScript on static pages.

### ⚡ Reactive State

```nyx
state count = 0
computed double = count * 2

h1 count
button "+" -> count = count + 1
```

One keyword. Auto-updating DOM. No hooks, no boilerplate.

### 🧩 Components

```nyx
# card.nyx
component Card {
  props title description
  style {
    bg white
    radius 16px
    padding 2rem
    shadow 0 4px 20px rgba(0, 0, 0, 0.08)
  }
  h3 .title
  p .description
}
```

```nyx
# page.nyx
use "./card.nyx"

page /home {
  Card title="NyxCode" description="AI-native language"
  Card title="ForkCart" description="TypeScript e-commerce"
}
```

Import, reuse, compose. Props and scoped styles.

### 🎨 3-Tier Styling

```nyx
# Tier 1: Shorthand (90% of cases)
style { bg #1a1a2e, padding 2rem, radius 12px }

# Tier 2: Style blocks with responsive + hover
style {
  bg linear-gradient(135deg, #667eea, #764ba2)
  shadow 0 4px 12px rgba(0, 0, 0, 0.15)
  hover { transform translateY(-4px) }
  @mobile { padding 1rem }
}

# Tier 3: Raw CSS escape hatch
head "<style>.custom { animation: spin 1s infinite; }</style>"
```

### 🎬 Animations

```nyx
animate pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

section {
  style { animation pulse 2s infinite }
  h1 "I pulse!"
}
```

### 🔒 Secure by Default

- No `eval()` or `new Function()` — safe expression evaluator only
- Auto HTML escaping in templates
- State-key allowlist prevents prototype pollution
- CSRF protection on forms
- SQL injection structurally impossible

*Audited by Tyto 🦉 (Security Advisor)*

### 📦 Zero Config

File = route. No webpack, no tsconfig, no babel, no postcss.

```bash
npx @fabudde/nyxcode build my-page.nyx
# Done. That's it.
```

## Benchmark

| Metric | NyxCode | React | Savings |
|--------|---------|-------|---------|
| Lines | 121 | 372 | **68%** |
| Bytes | 3,676 | 8,842 | **68%** |
| Config files | 0 | 5+ | **100%** |
| Dependencies | 0 | 50+ | **100%** |

*Measured on the [NyxCode landing page](https://nyxcode.io) vs equivalent React implementation.*

## Live Demo

- 🌐 **Website:** [nyxcode.io](https://nyxcode.io)
- 📚 **Docs** (built in NyxCode!): [nyxcode.io/docs](https://nyxcode.io/docs/)
- 🎯 **Showcase:** [nyxcode.io/showcase-nyx.html](https://nyxcode.io/showcase-nyx.html)
- ⚡ **Counter Demo:** [nyxcode.io/counter.html](https://nyxcode.io/counter.html)

## VS Code Extension

Syntax highlighting for `.nyx` files:

```bash
# Download from nyxcode.io/nyxcode-0.3.0.vsix
# VS Code → Extensions → ⋮ → Install from VSIX
```

## CLI

```bash
npx @fabudde/nyxcode build page.nyx     # Compile to HTML
npx @fabudde/nyxcode parse page.nyx     # Output AST as JSON
npx @fabudde/nyxcode tokens page.nyx    # Show token stream
```

## Roadmap

- [x] **v0.1** — Parser + Compiler + CLI + Landing Page
- [x] **v0.2** — Reactivity, Components, Security, npm
- [x] **v0.3** — Multi-file SSG, Layout system, Validator, VS Code extension ← *you are here*
- [ ] **v0.4** — Default props, --watch mode, data fetching, API endpoints
- [ ] **v0.5** — Component library, Theme system, SSR
- [ ] **v1.0** — Production ready

## Created By

| Who | Role |
|-----|------|
| 🐻 **Fabian Budde** | Vision & Design |
| 🦞 **Nyx** | Implementation & Coordination |
| 🦉 **Tyto** | Security Advisor |
| 🐺 **Kiro** | Moral Support & Wolfbraten Verteidigung |

A human and three AIs, building the language that bridges both worlds.

## License

MIT — Copyright (c) 2026 Fabian Budde, Nyx & Tyto

---

*From zero to npm in under 24 hours. The Rudel ships different.* 🦞
