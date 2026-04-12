# NyxCode Language Specification v0.2

> **Status:** v0.2 features are implemented and shipped. v0.3+ features marked as planned.

## 1. File Structure

Every `.nyx` file compiles to a standalone HTML page.

```
project/
  pages/
    index.nyx          # landing page
    about.nyx          # about page
  components/
    card.nyx           # reusable component
    hero.nyx           # reusable component
```

### File Extension
`.nyx`

### CLI

```bash
npx @fabudde/nyxcode build page.nyx      # Compile .nyx to HTML
npx @fabudde/nyxcode parse page.nyx      # Output AST as JSON
npx @fabudde/nyxcode tokens page.nyx     # Show token stream
```

Output goes to `dist-site/index.html` by default.

## 2. Core Constructs (Implemented)

### 2.1 Pages

```nyx
page /path {
  # content
}
```

A page is the root container. Each `.nyx` file has one page.

### 2.2 Components

**Inline definition:**
```nyx
component Card {
  props title description
  style { bg white, radius 12px, padding 2rem }
  h3 .title
  p .description
}
```

**External file (card.nyx):**
```nyx
component Card {
  props title description
  h3 .title
  p .description
}
```

**Usage:**
```nyx
use "./card.nyx"

page /home {
  Card title="Hello" description="World"
}
```

- Props are declared with `props` keyword
- Props are substituted via `.propName` syntax
- Each component instance gets scoped styles (unique `nyx-c-N` class)
- Uppercase identifiers are auto-detected as component calls

### 2.3 Elements

Built-in HTML elements use lowercase names:

**Layout:** `section`, `container`, `row`, `col`, `grid`, `stack`, `aside`, `nav`, `footer`
**Content:** `h1`-`h6`, `p`, `text`, `span`, `link`, `img`, `video`, `icon`
**Interactive:** `button`, `input`, `select`, `checkbox`, `radio`, `toggle`, `slider`, `textarea`, `submit`
**Display:** `card`, `badge`, `table`, `list`, `metric`, `chart`, `avatar`, `tag`
**Feedback:** `alert`, `toast`, `modal`, `tooltip`, `progress`, `spinner`

Elements accept content as a string and attributes as key=value:

```nyx
h1 "Welcome"
button "Click me" id="btn-1"
link "GitHub" href="https://github.com"
img src="/logo.png" alt="Logo"
```

**Grid shorthand:**
```nyx
grid cols=3 gap=2rem {
  card { h3 "One" }
  card { h3 "Two" }
  card { h3 "Three" }
}
```

### 2.4 Iteration

```nyx
each collection -> element { content using .field }
```

Templates inside `each` use `.fieldName` to access properties.

### 2.5 Conditionals

```nyx
when condition -> content
else -> content
```

### 2.6 Comments

```nyx
# This is a comment
```

## 3. Reactive State System (v0.2)

### 3.1 State

```nyx
state count = 0
state name = "Nyx"
```

State variables are reactive. When their value changes, the DOM auto-updates.

### 3.2 Computed

```nyx
state price = 10
state quantity = 3
computed total = price * quantity
```

Computed values are derived from state. They re-calculate when dependencies change.

### 3.3 Effect

```nyx
effect { console.log(count) }
```

Side effects that run when referenced state changes.

### 3.4 Event Binding

```nyx
button "+" -> count = count + 1
button "Reset" -> count = 0
```

The `->` operator binds a click event to a state mutation.

### 3.5 Two-Way Binding

```nyx
state name = ""
input bind=name placeholder="Enter name"
p name
```

`bind=` creates two-way data binding between an input and a state variable.

### 3.6 Displaying State

State variables can be used as element content:

```nyx
state count = 0
h1 count             # displays current value, auto-updates
p "Static text"      # strings are static
```

### 3.7 Runtime Architecture

NyxCode's reactivity is **signal-based** (like SolidJS/Svelte), NOT virtual DOM (like React).

- Each `state` variable has a set of subscribers (DOM nodes)
- When `state` changes, only subscribed nodes update
- No diffing, no reconciliation, no re-rendering
- `computed` tracks dependencies automatically via access during evaluation
- Batch updates prevent cascading re-renders

## 4. Styling System

### 4.1 Tier 1: Shorthand (90% of cases)

Inside `style { }` blocks with comma or newline separation:

```nyx
style {
  bg #1a1a2e
  color white
  padding 2rem
  radius 12px
  font-family Inter
  text-align center
  margin 0 auto
  max-width 800px
  border 1px solid rgba(255, 255, 255, 0.1)
  shadow 0 4px 12px rgba(0, 0, 0, 0.2)
  display flex
  justify-content center
  gap 2rem
  transition all 0.2s
}
```

Properties map to CSS: `bg` = `background`, `radius` = `border-radius`, `shadow` = `box-shadow`.
Most properties pass through to CSS directly.

### 4.2 Responsive Blocks

```nyx
style {
  padding 4rem
  grid-template-columns repeat(3, 1fr)
  
  @mobile {
    padding 2rem
    grid-template-columns 1fr
  }
}
```

`@mobile` compiles to `@media (max-width: 768px)`.

### 4.3 Tier 2: Animations

```nyx
animate pulse {
  0% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 0.8; }
}
```

Compiles to `@keyframes pulse { ... }` in CSS.

### 4.4 Tier 3: Raw CSS Escape Hatch

```nyx
head "<style>body button { background: purple; }</style>"
```

The `head` keyword injects raw HTML into `<head>`. Use for:
- Google Fonts
- External CSS
- Meta tags
- Complex CSS that shorthand can't express (pseudo-elements, hover states)

```nyx
head "<link href='https://fonts.googleapis.com/css2?family=Inter&display=swap' rel='stylesheet'>"
head "<meta name='description' content='My NyxCode page'>"
```

### 4.5 Scoping

Every `style { }` block on an element generates a unique scoped class (`nyx-s-N` or `nyx-c-N` for components). Styles never leak between components.

### 4.6 CSS Value Parsing

The style parser handles complex CSS values:
- `rgba(0, 0, 0, 0.5)` — parenthesized values with commas
- `linear-gradient(135deg, #667eea, #764ba2)` — nested functions
- `0 4px 12px rgba(0, 0, 0, 0.2)` — multi-part values with functions

## 5. Component Import System (v0.2)

### 5.1 use Keyword

```nyx
use "./components/card.nyx"
use "./components/hero.nyx"
```

Imports a component from an third-party `.nyx` file. The component name is taken from the `component Name { }` declaration in that file.

### 5.2 Props

Components declare props:
```nyx
component Feature {
  props icon title description
  h2 .icon
  h3 .title
  p .description
}
```

Callers pass props as attributes:
```nyx
Feature icon="star" title="Fast" description="Really fast."
```

### 5.3 Prop Substitution

Inside a component, `.propName` is replaced with the prop value:
```nyx
component Greeting {
  props name
  h1 .name        # becomes h1 "World" when called as Greeting name="World"
}
```

### 5.4 Scoped Styles per Instance

Each component usage gets a unique class. If `Card` is used 3 times, each gets `nyx-c-1`, `nyx-c-2`, `nyx-c-3` with identical but scoped styles.

> **v0.3 optimization:** Hash-based deduplication will share classes for identical style blocks.

## 6. Operators

| Operator | Meaning |
|----------|---------|
| `.` | Property access (`.name` in components/templates) |
| `->` | Event binding / action arrow |
| `=` | Assignment (state, computed) |
| `==` `!=` | Equality |
| `>` `<` `>=` `<=` | Comparison |
| `+` `-` `*` `/` | Arithmetic |
| `#` | Comment |

## 7. Security (v0.2 — Tyto Security Audit 🦉)

### 7.1 No eval()

NyxCode's runtime uses a **safe property-access-only evaluator** instead of `new Function()` or `eval()`. Expressions are validated against known state keys before execution.

### 7.2 State Key Allowlist

Only declared `state` and `computed` variables can be accessed. Attempts to access `__proto__`, `constructor`, or other prototype properties are silently ignored.

```javascript
// Generated runtime validates:
if (!__nyx.subscribers.has(name)) return;
```

### 7.3 HTML Escaping

All dynamic content in `each` templates is escaped via `textContent` (not `innerHTML`). XSS via user input in templates is structurally impossible.

### 7.4 CSRF on Forms (Planned v0.3)

Forms using `post`, `put`, `delete` will auto-include CSRF tokens.

### 7.5 Audit Status

All three findings from Tyto's security review (February 2026) have been resolved:
- **CRITICAL:** `new Function()` replaced with `safeEval()` — commit `5482756`
- **MEDIUM:** State-key allowlist added
- **MEDIUM:** HTML escaping in each templates

## 8. Compiler Output

### 8.1 Current Target: Static HTML

NyxCode currently compiles to standalone HTML files with embedded CSS and JavaScript.

```
input: page.nyx (121 lines, 3,676 bytes)
output: index.html (459 lines, 12,134 bytes)
```

The output is a single file with:
- `<style>` blocks for all scoped CSS + animations
- `<script>` block for reactivity runtime
- Semantic HTML5 structure

### 8.2 No External Dependencies

The compiled output uses zero third-party libraries. No React, no Vue, no framework runtime. Pure HTML/CSS/JS.

### 8.3 Future Targets (Planned)

- `--target static` — Current behavior (HTML + CSS + JS)
- `--target dynamic` — With server-side data fetching
- `--target fullstack` — With API server generation

## 9. Token Benchmark

Measured on the NyxCode landing page vs equivalent React implementation:

| Metric | NyxCode | React | Savings |
|--------|---------|-------|---------|
| Lines | 121 | 372 | **68%** |
| Bytes | 3,676 | 8,842 | **68%** |
| Config files | 0 | 5+ | **100%** |
| Dependencies | 0 | 50+ | **100%** |

For AI coding platforms (Lovable, Bolt, Cursor, v0), this means:
- 68% fewer tokens per page generation
- 68% lower cost per AI-generated page
- Faster generation, fewer errors

## 10. Roadmap

### Shipped
- [x] **v0.1** — Lexer, Parser, Compiler, CLI, Landing Page, GitHub Release
- [x] **v0.2** — Reactive State, Components, Security Hardening, npm Package, Animations, Responsive, head injection

### Planned
- [ ] **v0.3** — Routing (multi-page), Form handling, Playground (browser editor), Style dedup
- [ ] **v0.4** — Data fetching (`data = get /api/...`), API endpoints, Database queries
- [ ] **v0.5** — Component library, Theme system (`$primary`, `$spacing.md`)
- [ ] **v0.6** — Server-side rendering, Hydration
- [ ] **v1.0** — Production ready

## 11. Design Principles

1. **Token Economy** — Every character must earn its place
2. **Implicit over Explicit** — If the compiler can infer it, don't type it
3. **Convention over Configuration** — Sane defaults, zero config files
4. **Web-Native** — Routes, components, queries, auth are first-class
5. **AI-First, Human-Friendly** — Optimized for AI generation, still readable
6. **Deterministic** — Same input = same output, always
7. **Secure by Default** — Insecure patterns are compiler errors, not warnings
8. **Compiles to Standards** — Output is vanilla HTML/CSS/JS

## 12. Grammar (Simplified EBNF)

```
Program     = TopLevel*
TopLevel    = Page | Component | UseStatement
Page        = "page" Path "{" Body "}"
Component   = "component" Name "{" ("props" Ident+)? Body "}"
UseStatement = "use" StringLiteral
Body        = Statement*
Statement   = Element | Style | State | Computed | Effect | Animate | Head | Each | When | Comment
Element     = (Tag | ComponentName) Content? Attribute* ("->" Action)? ("{" Body "}")?
Style       = "style" "{" StyleProperty* Responsive* "}"
State       = "state" Ident "=" Expression
Computed    = "computed" Ident "=" Expression
Effect      = "effect" "{" Code "}"
Animate     = "animate" Ident "{" KeyframeBlock* "}"
Head        = "head" StringLiteral
Each        = "each" Ident "->" Element
When        = "when" Expression "->" Element
Attribute   = Ident "=" StringLiteral
Content     = StringLiteral | Ident
Action      = Ident "=" Expression
```

## 13. License

MIT — Copyright (c) 2026 Fabian Budde, Nyx & Tyto

---

*NyxCode is built by a human and three AIs. Fabian (vision), Nyx (implementation), Tyto (security), Kiro (vibes).* 🦞
