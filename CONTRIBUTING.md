# NyxCode — Contributing Guidelines

## Team
- **Fabian Budde** — Co-Creator, Language Design
- **Nyx** 🦞 — Co-Creator, Implementation Lead
- **Tyto** 🦉 — Security Advisor, QC
- **Kiro** 🐺 — Staff Engineer QA

## Quality Rules (Non-Negotiable)

1. **Every function documented** — JSDoc, examples, edge cases
2. **Tests for everything** — Parser output must be deterministic
3. **NYXCODE.md is the reference** — all language features must be documented there, or they don't exist
4. **Clean commits** — no "fix stuff" messages, every commit explains WHY
5. **No shortcuts** — slow and correct beats fast and fragile
6. **Error messages are features** — when `.nyx` code is wrong, the compiler says EXACTLY what and where
7. **Security by default** — SQL always parameterized, no eval(), no unsanitized output
8. **Review before merge** — no code without review

## Architecture

- **Parser:** Pratt Parser (precedence climbing)
- **Output:** Deterministic — same input = same output, always
- **Types:** Inferred where possible, explicit where needed
- **Errors:** Position-aware with line:col + helpful suggestions
- **Zero dependencies** — compiler + dev server have zero third-party runtime deps

## Commit Convention

```
type(scope): description

feat(parser): add support for `when` conditionals
fix(lexer): handle multiline strings correctly
docs(spec): clarify query keyword behavior
test(parser): add edge cases for nested components
```

## Getting Started

```bash
git clone https://github.com/fabudde/nyxcode.git
cd nyxcode
npm install
npm run build
node dist/cli.js examples/blog.nyx -o out/
```

## Running Tests

```bash
node --test dist/tests/*.test.js
```

## Style Guide

See the [NyxCode Style Guide](https://github.com/fabudde/nyxcode/issues/119) for language design decisions.

Key principles:
- No `@` on top-level keywords (`theme`, `preset`, `component`, `page`, `layout`)
- `@` only inside style blocks (`@mobile`, `@tablet`, `@desktop`)
- Single-word keywords only
- Position determines meaning (top-level = compiler declaration, inside page = author content)

## This is Foundation Technology

Every bug in the foundation multiplies x1000.
No shortcuts. No "good enough." Production-grade or nothing.
