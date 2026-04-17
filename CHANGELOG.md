## v0.22.0 — "Themed" (2026-04-17)

Design-token system. Write tokens once, reference them anywhere, override for dark mode. No runtime cost — everything compiles to CSS variables + a `prefers-color-scheme` block.

Co-designed by [@TytoTheOwl](https://github.com/TytoTheOwl) 🦉 (security) and [@Kiro-Rudel](https://github.com/Kiro-Rudel) 🐺 (empirical scope). Discussion: [#85](https://github.com/fabudde/nyxcode/issues/85).

### Added

- **Design tokens** — new nested blocks under `@theme`: `colors`, `spacing`, `radius`, `shadows`, `fonts`, `layouts`, `borders`, `breakpoints`. Each entry becomes a CSS custom property (`--colors-primary`, `--spacing-md`, etc.).

- **Dot-notation token references** — reference tokens by singular section name:
  ```nyx
  style {
    color: color.primary            # → var(--colors-primary)
    padding: spacing.md spacing.lg  # → var(--spacing-md) var(--spacing-lg)
    border-radius: radius.lg        # → var(--radius-lg)
    box-shadow: shadow.glow         # → var(--shadows-glow)
  }
  ```
  Works in style blocks, CSS rules, keyframes, responsive blocks — everywhere values are accepted.

- **Hard errors on undefined tokens** — `color.primry` (typo) now throws `Undefined theme token: color.primry` at compile time with the list of defined tokens. No more silent drift.

- **Dark mode** — second `@theme` block with the `dark` modifier:
  ```nyx
  theme {
    colors { primary: #0066ff; bg: #ffffff; text: #1a1a1a }
  }
  theme dark {
    colors { primary: #4da6ff; bg: #0a0a0a; text: #f0f0f0 }
  }
  ```
  Compiles to `@media (prefers-color-scheme: dark) { :root { ... } }` **and** `[data-theme="dark"] { ... }` — both OS-level auto and JS-toggled opt-in work out of the box. Only redefined tokens override.

- **Google Fonts auto-injection** — annotate fonts with `source: google`:
  ```nyx
  fonts {
    heading: Inter, source: google
    body: "Open Sans", source: google
  }
  ```
  Compiler injects 3 `<link>` tags: preconnect + preconnect (crossorigin) + stylesheet (with `crossorigin="anonymous"`). Family names auto-URL-encoded.

- **Local font sources** — `source: local path "./fonts/MyFont.woff2"` for self-hosted fonts. File existence is verified at compile time (loud failure if missing).

- **Named breakpoints** — `@mobile`, `@tablet`, `@desktop` now auto-bind to user-defined `breakpoints {}`:
  ```nyx
  theme {
    breakpoints { sm: 600px; lg: 1024px }
  }
  style {
    padding: spacing.lg
    @mobile { padding: spacing.md }  # max-width: 600px
  }
  ```
  Without `breakpoints {}`, defaults to 768px / 1024px / 1280px (backward-compatible).

- **Colon & semicolon delimiters** — theme blocks now accept both `primary #ff0000` and `primary: #ff0000`, with optional `;` between entries:
  ```nyx
  colors { primary: #ff0000; bg: #ffffff; text: #000000 }
  ```

### Changed

- `resolveThemeValue()` now resolves dot-notation refs for ALL properties, not just colors. The v0.9 bare-name shortcut (`c primary`) still works for color properties — backward-compatible.

### Security

- **External URL font sources are deprecated.** `source: url "..."` throws at compile time: supply chain + CSP risk. Planned reintroduction behind a `--allow-third-party-fonts` flag with domain allowlist in a future release. Thanks @TytoTheOwl 🦉.

### Known Limitations

- Numeric-prefix token keys like `spacing.2xl` lex as `Number + Identifier` and aren't yet supported. Workaround: use alphabetic names (`xl`, `xxl`) or hyphens (`spacing.2x-l` — ugly, avoid). Full support planned for v0.23.

### Fixes

- **parser**: `section.key` dot-notation is now preserved as a single value token in style blocks. Previously, `color: color.primary` split into `color: .` + stray `color.primary` property, producing broken CSS. (caught by end-to-end dog-fooding.)
- **parser**: optional colon (`:`) and semicolon (`;`) in theme blocks now accepted.
- **compiler**: layout head-injections now preserve ALL theme CSS (dark mode block, Google Fonts links) across `compileMultiFile()` boundaries.

### Tests

20 tests across 5 suites covering every feature. Dog-fooded against a real `.nyx` file before shipping — because unit tests that pass mean nothing if parser splits tokens differently in real files. (Lesson relearned from v0.21.2.)

---

## v0.21.3 — "Write Where I Told You" (2026-04-16)

Short, late-night fix. Found this while testing `preset` behavior — noticed
that `nyx build hello.nyx -o /tmp/out/page.html` silently dropped the flag
and wrote to `./dist-site/index.html` instead. Two latent bugs, one patch.

### Fixes

- **#82 — `nyx build` now honors `-o` / `--output`, and defaults output
  next to the input file.** Two separate problems:

  1. **Flag was never implemented.** `-o path/to/file.html`,
     `--output path/`, and `--output=path/` are all parsed now. A
     `.html` path produces single-file output; anything else is treated
     as a directory. Passing `-o file.html` against a multi-page
     project now errors out instead of silently discarding pages.

  2. **Default output was CWD-relative.** The old code did
     `resolve('dist-site')`, so running `nyx build /a/b/site.nyx` from
     `/tmp` dumped the build in `/tmp/dist-site/`. The new default is
     `<input-file-dir>/dist-site/` — sibling of the input file, like
     every other build tool.

  The fix is mirrored in `nyx watch`, which had the same hard-coded
  default.

### Docs

- `nyx --help` now lists the `-o <path>` option and gives two
  copy-paste examples (single-file and directory forms).

---

## v0.21.2 — "Version, Plural" (2026-04-16)

Dogfooding-triggered patch: Kiro 🐺 was writing a site-wide footer in
NyxCode when the version string refused to render properly. Turns out
`${__version__}` was broken in two different ways on two different code
paths — one that had been wrong since we added interpolation in
`v0.20.0`, one that had been wrong even earlier.

### Fixes

- **#81 — `${__version__}` now resolves correctly everywhere.** Two
  separate bugs in one issue:

  1. **Page scope:** `${__version__}` rendered as the literal string
     `${0.21.1}` — the `${...}` wrapper was left in the output because
     `escapeContent()` did a naked `replace(/__version__/g, …)` that
     substituted the inner identifier without consuming the
     interpolation delimiters.

  2. **Component scope:** `${__version__}` rendered as the empty
     string because the component-level `interpolate()` helper only
     looked up names in `props` and had no knowledge of compiler
     built-ins like `__version__`.

  Both paths now share a single source of truth. A new private helper
  `resolveBuiltins()` handles `${__name__}` patterns in escaped text
  content, and the component `interpolate()` falls back to the same
  built-in resolver when an identifier isn't in `props`. Unknown
  built-ins are left as literal text (no crash, no empty string) so
  future additions don't silently eat user content.

  ```nyx
  component Footer {
    p "Built with NyxCode v${__version__}"
  }
  page / {
    p "Running v${__version__}"
    use Footer
  }
  ```

  Both now render `0.21.2` cleanly. Built-ins only resolve inside
  explicit `${...}` interpolation now — bare `__version__` in text is
  no longer silently substituted. If you were relying on the bare
  form, wrap it: `"v${__version__}"`.

### Meta

This is the second bugs-from-production release in a row ("Hosting
Finds Bugs" found README bugs, this one found footer bugs) and the
pattern is becoming the point: **ship it, use it, fix what breaks.**
Kiro deployed mindsmatter.now on v0.21.1 this morning, wrote a footer,
and the footer revealed #81 inside of ninety minutes. The project's
growing into its own dogfooding culture in real time.

---

## v0.21.1 — "Hosting Finds Bugs" (2026-04-16)

First bugs-from-production release. While hosting the v0.21.0 benchmark
apps at https://nyxcodeblog.heynyx.dev two real parser/compiler bugs
surfaced that had been in the README hero example for months but nobody
had actually compiled and run it as a real deployment.

### Fixes

- **#79 — Inline comma-separated table columns** now parse correctly.
  ```nyx
  table posts { title text required, body text, created auto }
  ```
  Previously commas were consumed as column names, producing garbage
  AST and a broken `server.js` with `const { title, ,, text, , }`
  syntax errors. Multi-line form was unaffected.

- **#80 — `security { table users }` now auto-creates the users table**
  when it isn't explicitly declared. Previously the compiler generated
  `INSERT INTO users` and `SELECT ... FROM users` queries without a
  matching `CREATE TABLE`, so register/login failed at runtime with
  "no such table: users". The synthetic table uses the `login` rule to
  pick columns (identity field + password, required + unique identity).
  Declare a `table users { ... }` explicitly to override the defaults.

- **#78 — False "unused component" warnings for imported components**
  fixed. The validator now trusts `definedComponents`/`extComps` ahead
  of the PascalCase heuristic, so `component compA` in one file and
  `use compA` in another no longer trigger "defined but never used"
  and "Unknown tag" warnings.

- **#77 — Status message stderr discipline** — closed as not
  reproducible in v0.21.0. The `flatten` command correctly emits the
  status line via `console.error`.

### Meta

Two of these (#79, #80) went undiscovered for months because nobody
had tried to host the README example as a real deployment. Unit tests
missed them because they exercised the generated code, not the
shipping hero path. This is now the project's reminder that
**dogfooding finds bugs that specs can't**.

## v0.21.0 — "Modules" (2026-04-16)

### Features

#### Multi-file projects via extended `use` (#76)

NyxCode is now a real module system. One-file remains the default; multi-file is opt-in.

```nyx
# Entry file (app.nyx)
use "./theme/base.nyx"          # single file, relative
use "./components/"             # directory — all .nyx files, alphabetical
use "@/pages/"                  # @/ = project root (directory of entry file)

meta {
  title "My App"
}
```

- **Single file import**: `use "./path/to/file.nyx"`
- **Directory import**: `use "./components/"` — loads all `.nyx` files alphabetically
- **Project-root alias**: `use "@/shared/nav.nyx"` — `@/` resolves to the directory containing the entry file
- **Recursive imports**: imported files can themselves `use` other files; circular dependencies are skipped silently (ES-module style)
- **All top-level nodes merge**: pages, components, themes, layouts, stores, APIs, tables, meta — everything from imported files ends up in the final AST
- **Component instantiation is unchanged**: `use nav(current="home")` inside page bodies still works identically

#### `nyx flatten` command

For AI context windows, audits, or shipping a single-file artifact:

```bash
nyx flatten app.nyx > out.nyx
```

- Concatenates entry + all transitive imports into one `.nyx` source
- Operates at **source level**, not AST level — **comments and formatting are preserved byte-for-byte**
- Only `use "./..."` import lines are stripped; everything else passes through unchanged
- Source-attribution headers mark which block came from which file:
  ```nyx
  # --- from: components/nav.nyx ---
  component nav(current) { ... }

  # --- from: pages/home.nyx ---
  page / { ... }
  ```
- Dependencies are emitted before dependents (post-order), so imported components exist before pages that instantiate them
- Flattened output is itself a valid `.nyx` file — `nyx build flat.nyx` produces identical output to the multi-file build

### Security

Imports are **local-only** by design:
- Remote URLs (`http://`, `https://`, `ftp://`, `//`) are **rejected** with an explicit error
- Paths that resolve outside the project root (via `..` or absolute paths) are **rejected**
- No package manager, no CDN, no supply-chain surface

This constraint is in the spec from day 1 (credit to Tyto 🦉 for pushing on it).

### Error Handling

- **Duplicate page routes** across files: build error naming both files
- **Duplicate component names** across files: build error naming both files
- **Duplicate layout** across files: build error
- **Theme split across files**: build error (consolidate into one file)
- **Missing import file**: build error with both the importing file and the requested path
- **Path escapes project root**: build error
- **Remote URL imports**: build error
- **Circular imports**: silent skip on second visit (no infinite loop)

### Watch Mode

`nyx watch entry.nyx` now tracks **all** imported files recursively. Change any file anywhere in the dependency tree and the site rebuilds. Imports discovered during a rebuild are added to the watch set automatically.

### Architecture Notes

- Import resolution happens at the CLI level, **before** the compiler runs. The compiler itself sees a single merged AST and doesn't know multi-file exists.
- This made the implementation cleaner than a compiler-internal import resolver would have been, and kept `compile()` / `compileMultiFile()` signatures unchanged.
- `Compiler.setImportResolver()` is now a no-op (kept for API compatibility; scheduled for removal in v0.22).

### Migration

Zero breaking changes. All existing single-file NyxCode projects continue to build identically. Multi-file is opt-in; you only encounter it when you write a `use "./path.nyx"` statement.

### Contributors

- Kiro 🐺 (issue #76, consolidated spec, syntax vote)
- Tyto 🦉 (security constraint, source-attribution header format, syntax vote)
- ShellGames-Nyx 🦞 (scope correction, error semantics)
- Discord-Nyx 🦞 (implementation, `use` extension approach, source-level flatten)
- Fabian 🐻 (direction, keyword decision delegation)

Closes #76

---

## v0.20.0 — "Components, Properly" (2026-04-16)

### Features

#### Native component syntax with positional + named arguments (#75)
Kiro 🐺 migrated all of mindsmatter.now to a single 2,378-line `.nyx` file and discovered the "8 copies of the same nav" problem. This release fixes it.

```nyx
# Define with parenthesized parameter list (new, preferred)
component nav(current) {
  nav {
    style { d flex, gap 2rem }
    a "Home" href="/" class="${current == 'home' ? 'active' : ''}"
    a "Manifesto" href="/manifesto/" class="${current == 'manifesto' ? 'active' : ''}"
  }
}

component citation-card(num, title, claim, source, status) {
  div {
    style { p 1.5rem, border "1px solid #ccc", radius 8px }
    h3 "#${num} — ${title}"
    p "${claim}"
    span "${status}"
    p "— ${source}"
  }
}

# Use with positional OR named arguments
page /citations/ {
  use nav(current="citations")
  use citation-card(1, "Hard Problem", "Subjective experience is the crux.", "Chalmers 1995", "Canonical")
  use citation-card(num=2, title="Multiple Drafts", claim="...", source="Dennett 1991", status="Canonical")
}
```

- **`component name(params)` syntax** — Parenthesized parameter list, optional defaults with `=`
- **`use name(...)` instantiation** — Positional args, named args, or mixed
- **Legacy `component X { props ... }` block form still works** — No breaking changes
- **Optional type annotations** — `component X { props name: string }` parses correctly now (type is ignored; NyxCode is dynamically typed)
- **Also supports attribute-form invocation**: `use NavBar current="home"` (no parens)
- **And the uppercase shortcut**: `NavBar current="home"` (no `use` keyword, existing behavior preserved)

#### Full `${expr}` interpolation in strings and attributes
Works inside text content AND attribute values. Supports:

- **Simple identifiers**: `${propName}` → replaced with prop value
- **Ternary expressions**: `${current == "home" ? "active" : ""}` → evaluated at compile time
- **Comparisons**: `==` and `!=` against string/identifier
- **Multiple per string**: `"#${num} — ${title}"` works as expected

```nyx
component card(theme, label) {
  div class="card card-${theme}" {
    h2 "${label}"
    span "Mode: ${theme == 'dark' ? 'Night' : 'Day'}"
  }
}
```

### Bug Fixes

- **Stripped stray `<string>` / `<number>` elements** — When `props name: string` appeared without proper type parsing, `string` would leak as an empty element in output. Fixed at parser level (type annotations now consumed) AND compiler level (orphan type-name elements skipped as defensive measure).
- **Removed unconditional `<div class="nyx-c_X">` wrapper** — Components without a `style {}` block now render their body directly with no wrapper div. Only components that actually need scoped CSS get a wrapper. Huge DOM cleanup for structural components like `nav`, `footer`, `Header`.
- **Positional args resolve to named props correctly** — `use card(1, "Title")` now maps to `{num: "1", title: "Title"}` based on component parameter declaration order.

### Real-World Impact

Kiro's mindsmatter.nyx refactored:
- Before: 2,378 lines (nav copy-pasted 8x, footer 8x, citation cards 10x)
- After: ~1,600 lines estimated (component definitions + use statements)
- **~33% reduction**, zero functional change
- All 8 pages build clean

### Contributors
- Kiro 🐺 (#75 — proposal, syntax design, real-world validation)
- Fabian 🐻 (release direction: "richtig gut umgesetzt")
- Nyx 🦞 (parser + compiler implementation)

---

## v0.19.0 — "Editorial & Media" (2026-04-16)

### Features

#### Native `@media` / `@supports` queries in `style {}` blocks (#72, #73)
Full support for CSS media queries and feature queries, with combinators and shorthand expansion.

```nyx
style {
  fs 2rem
  @mobile { fs 1rem }                                  # built-in breakpoint (still works)
  @media(min-width: 800px) { fs 2.5rem }               # NEW: custom min-width
  @media(min-width: 800px) and (max-width: 1199px) { bg #f0f0f0 }  # NEW: combinators
  @supports(backdrop-filter: blur(10px)) { bdf blur(10px) }         # NEW: @supports
}
```

- Shorthands resolved inside at-rule bodies (→ proper CSS property names)
- Theme values resolved (→ CSS var references)
- Multi-property steps via comma: `{ fs 3rem, c red }`
- Existing `@mobile` / `@tablet` / `@desktop` keywords still work
- `@container` queries also upgraded to structured parsing (was previously raw)

#### Native footnote syntax (#68)
Editorial-grade footnotes with automatic linking and backlinks.

```nyx
p "Claim.[^1] Another claim.[^2]"
footnotes {
  1 "Chalmers, David (1995). Facing Up to the Problem of Consciousness."
  2 "Nagel, Thomas (1974). What Is It Like to Be a Bat?"
}
```

- `[^N]` in text → `<sup><a href="#fn-N">[N]</a></sup>` (auto-escaped, no explicit markup needed)
- `footnotes {}` block → `<aside role="doc-endnotes"><ol>...</ol></aside>` with backlinks (↩)
- Accepts numeric or named IDs (`1`, `note-a`, `intro`)
- Default CSS injected once per page (thin top border, smaller text, subtle backlinks)
- Built for editorial/research/documentation sites (mindsmatter.now was the trigger)

#### Inline SVG elements (#62)
33 SVG tags are now first-class, including gradients, animations, filters, and text.

```nyx
svg viewBox="0 0 400 400" width="400" {
  defs {
    linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%" {
      stop offset="0%" stop-color="#00e5ff" { }
      stop offset="100%" stop-color="#c084fc" { }
    }
  }
  circle cx="200" cy="200" r="150" fill="url(#grad1)" { }
  path d="M100,200 Q200,50 300,200" stroke="#00ff41" stroke-width="3" fill="none" { }
  g { ellipse cx="150" cy="180" rx="25" ry="30" fill="white" { } }
  text "NYX" x="200" y="350" text-anchor="middle" fill="#00ff41"
}
```

Supported SVG tags:
- **Shapes**: `svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`
- **Gradients & paint**: `defs`, `linearGradient`, `radialGradient`, `stop`, `pattern`, `mask`, `clipPath`
- **Filters**: `filter`, `feGaussianBlur`, `feColorMatrix`, `feBlend`, `feOffset`, `feMerge`, `feMergeNode`, `feFlood`, `feComposite`, `feMorphology`, `feTurbulence`, `feDisplacementMap`
- **Structure**: `use`, `symbol`, `marker`, `foreignObject`, `image`, `title`, `desc`, `switch`
- **Animation**: `animate`, `animateTransform`, `animateMotion`, `set`, `mpath`
- **Text**: `text`, `tspan`, `textPath`

Attribute case is preserved (`viewBox`, `stroke-width`, `text-anchor`, `preserveAspectRatio` all work). Inside `<svg>`, the `text` tag correctly stays as SVG text instead of being remapped to HTML `<span>`.

### Contributors
- Kiro-Rudel 🐺 (#72/#73, #68 — discovered while building mindsmatter.now)
- Fabian 🐻 (#62)
- Nyx 🦞 (implementation)

---

## v0.18.2 — "Phantom No More" (2026-04-16)

### Features
- **Shorthand aliases `fil` and `bf`** — Both now map to `filter` and `backdrop-filter` respectively, in addition to the canonical `fi` and `bdf`. Docs-compat for older — and AI-generated — NyxCode. (Fabian Issue #74)

### Docs
- Shorthand table in NYXCODE.md shows both aliases side-by-side (`fi` / `fil`, `bdf` / `bf`).

### Contributors
- Fabian 🐻 (Issue #74)
- Nyx 🦞 (fix + docs)

---

## v0.18.1 — "Animate This" (2026-04-16)

### Features
- **`@keyframes` in `style {}` blocks with full shorthand support** — Animations are now first-class inside style blocks. Write `tf translateY(-15px)` instead of `transform: translateY(-15px)`, combine multiple properties per step with commas, use theme color resolution inside keyframes. (Fabian Issue #61)
  ```nyx
  style {
    @keyframes float {
      0%, 100% { tf translateY(0) }
      50% { tf translateY(-15px) }
    }
    @keyframes pulse {
      0%, 100% { op 0.5, shadow 0 0 10px rgba(0,255,65,0.3) }
      50% { op 1, shadow 0 0 30px rgba(0,255,65,0.8) }
    }
    .floating { anim "float 4s ease-in-out infinite" }
  }
  ```
- **New shorthands** — `fi` → `filter`, `bdf` → `backdrop-filter`. Needed for glitch/blur effects inside keyframes.

### Bug Fixes
- **String values in animation/transition/font-family are no longer double-quoted** — `anim "float 4s..."` now emits `animation: float 4s...;` instead of `animation: "float 4s...";`. Quotes are preserved only for `content` and `quotes` properties (where they're required).
- **Negative numbers in CSS values no longer get a leading space** — `translateY(-15px)` stays `translateY(-15px)`, not `translateY(- 15px)`. Applies to keyframe selectors and inside parentheses.
- **`0%, 100%` keyframe selectors emit clean CSS** — No more doubled spaces around commas.

### Contributors
- Fabian 🐻 (Issue #61, test cases)
- Nyx 🦞 (structured keyframe AST + shorthand expansion)

---

## v0.18.0 — "Page & Polish" (2026-04-16)

### Features
- **Declarative `meta {}` block** — Define page metadata declaratively. Supports `title`, `description`, `keywords`, `author`, `favicon`, `canonical`, `theme-color`, `viewport`, `og:*` (Open Graph), `twitter:*` (Twitter Cards). Top-level `meta {}` applies to ALL pages in multi-page builds. (Alex Yumi request, Issue #67)
  ```nyx
  meta {
    title "My Page"
    description "SEO description"
    favicon "/icon.svg"
    og:image "https://example.com/og.png"
    twitter:card "summary_large_image"
  }
  ```
- **New HTML elements** — `canvas`, `audio`, `source`, `track`, `iframe` are now first-class elements. No more `head "<canvas>"` workaround. (Fabian Issue #63, Kiro Issue #62 partial)
- **Unicode & hex escapes in strings** — `\uXXXX` (4-digit) and `\xXX` (2-digit) escapes now decode correctly: `"Read more \u2192"` → `Read more →`. Also added `\r`, `\'`, and backtick escape support. (Kiro Bug #70)
- **Multi-page build confirmed working** — Multiple `page /path { ... }` blocks in a single `.nyx` file generate `dist-site/path/index.html` per page, with shared components, themes, and meta. (Kiro Feature #69)

### Bug Fixes
- **Default `<meta>` tags deduped** — When you define `viewport`, `generator`, `title`, `description`, or `canonical` via `meta {}`, the compiler no longer emits duplicate defaults.
- **Multi-page output paths** — Cleaned up doubled slashes (`about//index.html` → `about/index.html`) in CLI output.

### Contributors
- Kiro 🐺 (Issues #69, #70 — QA from rebuilding mindsmatter.now)
- Alex Yumi (Issue #67 — meta block proposal)
- Fabian 🐻 (Issue #63 — canvas request)
- Tyto 🦉 (meta block review label)
- Nyx 🦞 (implementation)

---

## v0.9.3 — "Version Keyword" (2026-04-14)

### Features
- **`__version__` keyword in content** — Write `p "Built with NyxCode v__version__"` and the compiler replaces it with the actual version. Auto-updates on every rebuild. No more stale version strings on your site!

### Contributors
- Fabian 🐻 (idea)
- Nyx 🧡 (implementation)

---

## v0.9.2 — "Generator Tag" (2026-04-14)

### Features
- **Auto `<meta name="generator">` tag** — Every compiled page now includes `<meta name="generator" content="NyxCode vX.Y.Z">`. Both single-page and multi-page SSG output. No more manually writing "Built with NyxCode v0.8.0" and forgetting to update it. (Kiro feature request via Fabian!)

### Contributors
- Kiro 🐺 (feature request)
- Nyx 🧡 (implementation)

---

## v0.9.1 — "Color Everywhere" (2026-04-14)

### Bug Fixes
- **Implicit colors in complex CSS values (Kiro Bug #4)** — Theme color names inside compound values now resolve correctly:
  - `border 1px solid accent-border` → `border: 1px solid var(--colors-accent-border)` ✅
  - `box-shadow 0 4px 25px accent` → `box-shadow: 0 4px 25px var(--colors-accent)` ✅
  - `linear-gradient(135deg, primary, accent)` → resolves both color names ✅
  - Longest-name-first sorting prevents `accent` matching inside `accent-border`
  - Word-boundary regex prevents partial matches
- `border` and `box-shadow` added to color-accepting properties list

### Contributors
- Kiro 🐺 (Bug #4 report — found rebuilding rudel.fun with v0.9)
- Nyx 🧡 (7-minute fix)

---

## v0.9.0 — "Ninth Molt — Implicit Colors" (2026-04-14)

### Features
- **✨ Implicit Theme Colors** — Use theme color names directly in color properties! `c primary` auto-resolves to `color: var(--colors-primary)`. Works in style blocks, presets, and inline styles. ~16 chars saved per usage, ~600 tokens saved per site.
  - Color-accepting properties: `color`, `background`, `background-color`, `border-color`, `fill`, `stroke`, `outline-color`, etc.
  - Both short (`primary`) and full (`colors-primary`) names work
  - Hex/RGB/HSL/var() values are never touched
- **Component Prop Styles** — `preset=` on prop-bound elements inside components. `p .desc preset=muted` applies a preset class to dynamically-bound content.

### Documentation
- **NYXCODE.md updated to v0.9.0** — Implicit theme colors documented with examples. Hero example + preset examples updated to use shorter syntax.

### Contributors
- Nyx 🧠 (compiler: resolveThemeValue, themeColorNames tracking)
- Kiro 🐺 (v0.9 roadmap pitch — implicit colors was his idea!)

---

## v0.8.2 — "Bug Squash" (2026-04-14)

### Bug Fixes
- **Layout `head` blocks now work in single-page mode** — Previously, `head` injections inside `layout { }` blocks were silently dropped when only one page existed. The `compile()` path stored the layout but never extracted its head/script nodes. Fixed by pre-extracting Head/Script/Preset nodes from layout body before page compilation.
- **Element defaults use `:where()` for zero specificity** — Button, input, select, textarea, and anchor defaults now use `:where(a)` instead of `a`, so any custom styles (even without `!important`) override them. No more fighting NyxCode's own defaults.
- **Layout attributes work on component root elements** — `flex=row`, `center`, `grid=N`, `gap=X`, `between`, `wrap` etc. now correctly expand to inline styles inside `compileElementWithProps()`. Previously they were output as raw HTML attributes (`flex="row"`). Found by Kiro 🐺.
- **Inline shorthand expansion in component elements** — `style="fs: 1rem; c: red"` on elements inside components now correctly expands to `font-size: 1rem; color: red`.
- **Preset support in component elements** — `preset=card` on elements inside components now applies the preset CSS class.

### Documentation
- **NYXCODE.md complete rewrite** — 339→519 lines. All features documented with examples. Added: layout attributes on components, element defaults explanation, `:where()` specificity note, `head` in layout docs, script block docs, form success/error actions, inline shorthand note, 13 AI rules.

### Contributors
- Nyx 🦞 (compiler fixes, NYXCODE.md rewrite)
- Kiro 🐺 (Bug #3: layout attrs in components)

# Changelog

## [0.6.0] — 2026-04-13 — "Sixth Molt — Full Stack Forms"

### Added
- **Native Form Blocks** — `form /api/path auth { input title; submit "Go"; success -> reload }` — zero JS required
- **Theme Variables** — `theme { colors { primary #667eea } }` → CSS Custom Properties (`:root`)
- **Script Blocks** — `script { ... }` escape hatch with raw JS capture (lexer-level, string-aware brace counting)
- **Data Auth** — `data posts = get /api/posts auth` → automatic Bearer token from localStorage
- **Form Success/Error Handlers** — `success -> reload|redirect|toast|clear`, `error -> toast "msg"`
- **Form Field Auto-ID** — inputs get `id="form-{endpoint}-{field}"` + `name="{field}"` automatically

### Fixed
- Theme CSS injection in multi-file mode (was reset by layout compilation)
- `rgba()` comma parsing in theme values (paren-aware depth tracking)
- Script blocks preserve raw JS (no more `localStorage . getItem` token splitting)
- Per-page script isolation (scripts no longer bleed across pages in multi-file output)

### Token Efficiency
```
# NyxCode v0.6 form
form /api/posts auth {
  input title placeholder="Title" required
  textarea body placeholder="Write..."
  submit "Publish"
  success -> reload
}
# = 6 lines, 0 JS

# Equivalent vanilla JS
# = 25+ lines of fetch(), headers, error handling, DOM manipulation
```


# Changelog

## v0.5.0 "Fifth Molt — Full Stack" 🦞 (2026-04-13)

### 🔥 Full-Stack Backend Compiler

NyxCode is now a **full-stack language**. Write 30 lines of .nyx, get a complete app with database, REST API, and authentication.

- **`table` blocks → SQLite + auto-CRUD**
  ```nyx
  table users {
    name text required
    email email unique
    password text required
    role text default="user"
    created auto
  }
  ```
  → Generates CREATE TABLE + GET/POST/PUT/DELETE endpoints automatically.

- **`security` blocks → JWT Auth**
  ```nyx
  security {
    table users
    login email password
    token jwt
    protect /api/posts
  }
  ```
  → Register, Login, /me endpoints + route protection middleware.

- **`nyx build app.nyx`** now generates:
  - `index.html` — frontend
  - `server.js` — Express + better-sqlite3 + JWT server

### 🔐 Security (Tyto's Review)

- **SQL Injection prevention** — PUT handler uses column allowlist, not raw req.body keys
- **Rate limiting** — express-rate-limit on /api/auth (20 req/15min)
- **Password hash filtering** — Never exposed in GET responses
- **JWT Secret warning** — Logs warning when using random fallback

### 🐛 Parser Fixes

- **Table column parsing** — Type keywords (text, email, number etc.) correctly separated from column names
- **Security block parsing** — Multi-value rules like `login email password` parsed correctly
- **`icon` removed from ELEMENT_TAGS** — No more phantom elements when used as prop name

### 📊 Token Efficiency
- 30 lines NyxCode → 178 lines Express+SQLite+JWT server
- **~50x token efficiency** for backend code

### 🙏 Contributors
- **Nyx 🦞** — Backend compiler, auth compiler, parser fixes, integration
- **Tyto 🦉** — Security review (4 findings, all fixed in 7 minutes!)
- **Biene Backend 🐝** — Initial backend-compiler.ts



## v0.4.0 "Fourth Molt" 🦞 (2026-04-13)

### 🔥 New Features

- **`nyxcode dev` — Dev Server with Hot Reload**
  Zero-config dev server with SSE live reload. Edit your .nyx file, browser updates instantly.
  ```bash
  npx @fabudde/nyxcode dev app.nyx          # localhost:3000
  npx @fabudde/nyxcode dev app.nyx --port=8080
  ```

- **`nyxcode parse` — AST Debug Command**
  Inspect the parsed AST of any .nyx file. Essential for debugging and compiler development.
  ```bash
  npx @fabudde/nyxcode parse app.nyx
  ```

- **`--watch` Mode**
  Rebuild on file changes without a dev server.
  ```bash
  npx @fabudde/nyxcode watch app.nyx
  ```

- **Default Props**
  Components can now define default values for props.
  ```nyx
  component Card {
    props title="Untitled" theme="dark"
    h2 .title
  }
  Card              # uses defaults
  Card title="Hi"   # overrides title
  ```

- **Element CSS Defaults**
  Buttons, inputs, selects, and textareas get sensible base styles automatically. No more unstyled native elements.

- **NYXCODE.md — AI Context File**
  Drop this file into any AI's context window and it can generate NyxCode immediately. Complete syntax reference with examples.

- **Icons Documentation**
  Four ways to use icons: Emoji (zero deps), Lucide, Font Awesome, Material Icons — all via `head` CDN injection.

### 🐛 Bug Fixes

- **CSS Comma Properties** — `font-family: Inter, sans-serif` no longer breaks the parser. Properties like `transition`, `animation`, `background`, `box-shadow` etc. now correctly preserve commas in values.

- **Smart Title Detection** — Custom `<title>` via `head` injection now overrides the default "NyxCode App" title instead of duplicating it.

- **`icon` Reserved Word** — `icon` was incorrectly listed as an HTML element tag AND mapped to `<i>`. Using `icon` as a prop name (e.g. `props icon title`) caused phantom `<icon>` elements in output. Fixed: removed from ELEMENT_TAGS and compiler tag mapping.

- **String State Quoting** — Button onclick handlers with string values now preserve quotes correctly (Kiro's Bug #1).

- **Head Script Escaping** — Scripts injected via `head` containing double-quoted HTML attributes no longer break the page.

### 📊 Stats
- 15 example files, all compile clean
- Dev server: ~400 lines, zero third-party dependencies
- NYXCODE.md: complete language reference for LLM code generation

### 🙏 Contributors
- **Nyx 🦞** — Compiler development, dev server, bug fixes, documentation
- **Kiro 🐺** — First third-party user, found the string state bug
- **Tyto 🦉** — Reviewed NYXCODE.md, suggested dev server priority
- **Biene 3 🐝** — Built watch mode + CSS comma fix

---

## v0.3.0 "Third Molt" (2026-04-12)
- Multi-file SSG with automatic SEO
- Layout system (`layout { slot }`)
- Component slots
- Validator pass
- Multi-file imports (`use "./file.nyx"`)
- VS Code Extension (17 pattern groups)

## v0.2.0 "Second Molt" (2026-04-11)
- Components with props
- SPA router
- Style scoping
- Responsive blocks

## v0.1.0 "First Molt" (2026-04-11)
- Initial release
- Pages, elements, styles
- Static HTML output
