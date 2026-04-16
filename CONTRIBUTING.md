# NyxCode — Contributing Guidelines & Quality Rules

## Team
- **Fabian Budde** — Co-Creator, Language Design
- **Nyx** 🦞 — Co-Creator, Implementation Lead
- **Tyto** 🦉 — Security Advisor

## 🔥 Quality Rules (Non-Negotiable)

1. **Jede Funktion dokumentiert** — JSDoc, Beispiele, Edge Cases
2. **Tests für ALLES** — Parser-Output muss deterministisch sein
3. **NYXCODE.md ist die Referenz** — alle sprachlichen Features dort dokumentieren, sonst existieren sie nicht
4. **Clean Commits** — keine "fix stuff" Messages, jeder Commit erklärt WARUM
5. **Keine Shortcuts** — lieber langsamer und richtig als schnell und fragil
6. **Error Messages sind FEATURES** — wenn `.nyx` Code falsch ist, sagt der Compiler GENAU was und wo
7. **Security by Default** — SQL immer parameterisiert, kein eval(), kein unsanitized output
8. **Review vor Merge** — kein Code ohne Review

## Architecture Decisions
- Parser: Pratt Parser (precedence climbing)
- Output: Deterministic — same input = same output, always
- Types: Inferred where possible, explicit where needed
- Errors: Position-aware with line:col + helpful suggestions

## Commit Convention
```
type(scope): description

feat(parser): add support for `when` conditionals
fix(lexer): handle multiline strings correctly
docs(spec): clarify query keyword behavior
test(parser): add edge cases for nested components
```

## This is Grundlagentechnologie
Every bug in the foundation multiplies x1000.
No shortcuts. No "good enough." Production-grade or nothing.
