# NyxCode — Style Guide

*Language design decisions and conventions. Agreed upon by the Rudel (Nyx 🦞, Tyto 🦉, Kiro 🐺) and Fabian.*

## Core Principles

1. **NyxCode is the only language you need.** No JS in source, no CSS in source. The compiler generates everything.
2. **Position determines meaning.** Top-level = compiler declaration. Inside a page = author content.
3. **One-word keywords only.** No multi-word keywords, no hyphens in language keywords.
4. **Minimal syntax, maximum output.** Every line of NyxCode should replace 3-5 lines of HTML/CSS/JS.

## The `@` Rule

- **No `@` on top-level keywords:** `theme`, `preset`, `component`, `page`, `layout`, `keyframes`
- **`@` only inside style blocks:** `@mobile`, `@tablet`, `@desktop`, `@dark`, `@print`
- **Why:** Top-level keywords are declarations in NyxCode's world. `@` is reserved for CSS-adjacent contexts inside style blocks.

```nyx
# ✅ Correct
theme { colors { primary: #3b82f6 } }
preset card { p 1.5rem; br 0.5rem }
page / { h1 "Hello" }

# ✅ Correct — @ inside style blocks
div { style { p 2rem; @mobile { p 1rem } } }

# ❌ Wrong
@theme { ... }
@preset card { ... }
```

## `when` — Build-Time vs Runtime

The compiler infers which type of conditional you need:

- **Double underscore (`__`)** = build-time, stripped by compiler
- **Dot notation (`.`)** = runtime, compiler generates JS

```nyx
# Build-time: compiler removes the block if condition is false
when __ENV == "production" { analytics { ... } }

# Runtime: generates JS toggle in the browser
when user.loggedIn { nav { a "Dashboard" } }
```

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Pages | URL path | `page /about { }` |
| Components | lowercase, single word preferred | `component card { }` |
| Props | lowercase | `props title subtitle` |
| Theme tokens | dot-separated groups | `color.primary`, `spacing.2xl` |
| Presets | lowercase, descriptive | `preset card { }`, `preset hero { }` |
| CSS shorthands | 2-3 letter abbreviations | `p`, `m`, `br`, `bg`, `c` |

## File Structure

```
my-site/
├── theme.nyx          # Shared design tokens
├── index.nyx          # Homepage (page /)
├── about.nyx          # About page (page /about)
├── blog/
│   ├── index.nyx      # Blog listing (page /blog)
│   └── [slug].nyx     # Dynamic blog post (page /blog/[slug])
└── components/
    └── shared.nyx     # Reusable components
```

## Element Defaults

Use `theme { defaults { } }` for global element styles instead of head injection:

```nyx
theme {
  defaults {
    a { c color.primary; td none }
    pre { bg color.surface; p 1rem; br 0.5rem }
  }
}
```

Uses `:where()` for zero specificity — local styles always win without `!important`.

## Responsive Design

Use inline responsive shorthands where possible:

```nyx
div grid=3@1 gap=2rem { ... }    # 3 cols desktop, 1 col mobile
```

For complex responsive styles, use `@mobile`/`@tablet`/`@desktop` inside style blocks.

## New Keyword Checklist

Before adding any new keyword to NyxCode:

1. Is it one word?
2. Does it conflict with existing HTML element names?
3. Does its position (top-level vs inside page) make its meaning clear?
4. Can it be a preset or component instead of a keyword?
5. Has the Rudel reviewed it?

If any answer is "no" — rethink.

---

*This guide is a living document. Updated as the language evolves.*
*References: GitHub Issues [#119](https://github.com/fabudde/nyxcode/issues/119), [#120](https://github.com/fabudde/nyxcode/issues/120)*
