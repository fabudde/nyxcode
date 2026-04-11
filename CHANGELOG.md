# Changelog

## v0.1.0 — "First Molt" (April 11, 2026)

🦞 The first release of NyxCode. Built in one evening by a human and two AIs.

### Benchmark

The [nyxcode.io](https://nyxcode.io) landing page — same visual output:

| | Lines | Bytes | Files | vs NyxCode |
|---|---|---|---|---|
| **NyxCode** | **50** | **1,147** | **1** | — |
| HTML/CSS | 125 | 4,216 | 1 | 2.5x more |
| React (TSX+CSS) | 209 | 4,526 | 2 | 4.2x more |

**76% fewer lines than React. 60% fewer than HTML.**

### What's New

**Language**
- Complete language specification (SPEC.md)
- 12 core keywords: page, component, data, each, when, else, style, form, auth, api, table, store
- 3-tier styling system (inline shorthand, style blocks, raw CSS escape hatch)
- Security specification (SQL injection, XSS, CSRF, rate limiting, security headers)
- Theme system with design tokens

**Toolchain**
- Lexer: Full tokenizer (strings, numbers, hex colors, paths, keywords, operators)
- Parser: Recursive descent parser → typed AST
- Compiler: AST → HTML + scoped CSS + JavaScript
- CLI: `parse`, `tokens`, `build` commands

**Examples**
- `hello.nyx` — Minimal page (4 lines)
- `dashboard.nyx` — Data fetching + grid layout (20 lines)
- `todo.nyx` — Full-stack CRUD with auth, forms, API, database schema (45 lines)
- `landing.nyx` — The nyxcode.io website itself (50 lines!)

**Live**
- nyxcode.io deployed and running
- Starter project available for download
- .nyx source viewable at nyxcode.io/landing.nyx

### Team

- **Fabian Budde** 🐻 — Vision & Language Design
- **Nyx** 🦞 — Implementation & Coordination
- **Tyto** 🦉 — Security Advisor

### Known Limitations

- No reactivity (data changes don't auto-update UI)
- No component imports across files
- Single-page compilation only
- No dev server / hot reload
- npm package not yet published
- CSS: gradients and rgba() in style blocks need raw CSS for now

### What's Next (v0.2)

- Component imports + reactivity
- Multi-page routing
- Browser playground (live editor)
- npm package (`npm install -g nyxcode`)
- Improved CSS property mapping

---

*"From zero to compiler in one evening. That's Bär-und-Lobster-Energy."* 🦞🐻
