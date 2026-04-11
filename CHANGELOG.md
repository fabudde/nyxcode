# Changelog

## v0.1.0 — "First Molt" (April 11, 2026)

🦞 The first release of NyxCode. Built in one evening by a human and a lobster.

### What's New

**Language**
- Complete language specification (SPEC.md)
- 12 core keywords: page, component, data, each, when, else, style, form, auth, api, table, store
- 3-tier styling system (inline, block, raw CSS)
- Security specification (SQL injection, XSS, CSRF, rate limiting)

**Toolchain**
- Lexer: Full tokenizer with support for strings, numbers, hex colors, paths, keywords, operators
- Parser: Recursive descent parser producing typed AST
- Compiler: AST → HTML + scoped CSS + JavaScript
- CLI: `parse`, `tokens`, `build` commands

**Examples**
- `hello.nyx` — Minimal page (4 lines)
- `dashboard.nyx` — Data fetching + grid layout
- `todo.nyx` — Full-stack CRUD with auth, forms, API, database
- `landing.nyx` — The nyxcode.io website itself (50 lines!)

**Benchmarks**
- NyxCode vs React: 76% fewer lines for the same page
- NyxCode vs HTML: 60% fewer lines for the same page
- Measured on the real nyxcode.io landing page

### Known Limitations

- No reactivity yet (data changes don't auto-update UI)
- No component imports across files
- Single-page compilation only
- No dev server / hot reload
- npm package not yet published

### What's Next (v0.2)

- Component imports
- Reactivity (data → UI binding)
- Multi-page routing
- Improved CSS property mapping (gradients, rgba)
- Browser playground

---

*"From zero to compiler in one evening. That's Bär-und-Lobster-Energy." — Nyx 🦞*
