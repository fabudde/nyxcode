# NYXCODE.md — AI Context File (v0.21.3)
# Give this to any AI. It will generate NyxCode.

## What is NyxCode?
A token-efficient language replacing TypeScript/Next.js. One `.nyx` file = full-stack app with DB, Auth, API, frontend. **25% fewer tokens than Tailwind, 82% fewer than Next.js.** Compiles to HTML+CSS+JS (frontend) and Express+SQLite (backend). Node-based runtime.

## Quick Start
```bash
npm i -g @fabudde/nyxcode
nyx build app.nyx              # → <input-dir>/dist-site/index.html
nyx build app.nyx -o build.html  # single-file output
nyx build app.nyx -o public/   # custom directory
nyx dev app.nyx                # Dev server + hot reload
nyx parse app.nyx              # Debug AST output
nyx flatten app.nyx > flat.nyx # Multi-file → single file
```

The CLI is available as `nyx` (preferred) or `nyxcode` (alias). Both work identically.

**Output path rules (v0.21.3):**
- `-o path/to/file.html` → single-file output (errors on multi-page projects)
- `-o path/to/dir/` → directory output (one `index.html` per route)
- No flag → defaults to `<input-file-dir>/dist-site/`, NOT the current working dir


## Comments

```nyx
# Full line comment
page / {
  h1 "Hello" # Inline comment
  # Temporarily disable:
  # p "This won't render"
}
```

`#` starts a comment until end of line. `#fff` is a hex color (alphanumeric after `#`).

## Hero Example: Full-Stack Blog (16 lines)
```nyx
table posts { title text required, body text, created auto }
security { table users, login email password, token jwt, protect /api/posts write }
theme { colors { primary #667eea, bg #0a0a12, card #1a1a2e } }
preset card { bg card, r 12px, p 2rem }

page / {
  section style={ mw 800px, mx auto, p 2rem } {
    h1 "My Blog"
    form /api/posts auth { input title, submit "Post", success -> reload }
    data posts = get /api/posts auth
    each posts -> div preset=card { h3 .title, p .body }
  }
}
page /register {
  form /api/auth/register { input email, input password, submit "Register", success -> redirect / }
}
```
This generates: `index.html`, `register/index.html`, AND `server.js` (10 CRUD endpoints + JWT auth + SQLite).

## CSS Shorthands — ALWAYS USE THESE
Property shorthands work in `style {}` blocks, `preset` definitions, inline styles, and CSS rules.

| Short | CSS Property | Short | CSS Property |
|-------|-------------|-------|-------------|
| `bg` | background | `c` | color |
| `m` | margin | `p` | padding |
| `mt` | margin-top | `pt` | padding-top |
| `mb` | margin-bottom | `pb` | padding-bottom |
| `ml` | margin-left | `pl` | padding-left |
| `mr` | margin-right | `pr` | padding-right |
| `mx` | margin-inline | `px` | padding-inline |
| `my` | margin-block | `py` | padding-block |
| `w` | width | `h` | height |
| `mw` | max-width | `mh` | max-height |
| `miw` | min-width | `mih` | min-height |
| `r` | border-radius | `bw` | border-width |
| `bc` | border-color | `bs` | border-style |
| `d` | display | `pos` | position |
| `t` | top | `b` | bottom |
| `l` | left | `z` | z-index |
| `fs` | font-size | `fw` | font-weight |
| `ff` | font-family | `lh` | line-height |
| `ls` | letter-spacing | `ta` | text-align |
| `td` | text-decoration | `tt` | text-transform |
| `ws` | white-space | `wb` | word-break |
| `op` | opacity | `cur` | cursor |
| `of` | overflow | `ox` | overflow-x |
| `oy` | overflow-y | `v` | visibility |
| `tr` | transition | `tf` | transform |
| `anim` | animation | `shadow` | box-shadow |
| `tshadow` | text-shadow | `o` | outline |
| `oc` | outline-color | `ow` | outline-width |
| `ai` | align-items | `ac` | align-content |
| `as` | align-self | `jc` | justify-content |
| `ji` | justify-items | `js` | justify-self |
| `fi` | flex | `fb` | flex-basis |
| `fg` | flex-grow | `fsk` | flex-shrink |
| `fd` | flex-direction | `fw` | flex-wrap |
| `gtc` | grid-template-columns | `gtr` | grid-template-rows |
| `gc` | grid-column | `gr` | grid-row |
| `ga` | grid-area | `pe` | pointer-events |
| `us` | user-select | `ap` | appearance |
| `rs` | resize | `ol` | outline |
| `wc` | will-change | `ct` | content |
| `gg` | gap | `iso` | isolation |
| `obf` | object-fit | `obp` | object-position |
| `bgi` | background-image | `bgs` | background-size |
| `bgp` | background-position | `bgr` | background-repeat |
| `bgc` | background-clip | `bdf` / `bf` | backdrop-filter |
| `fi` / `fil` | filter | `mix` | mix-blend-mode |
| `tf` | transform | `tr` | transition |
| `anim` | animation |  |  |
| `si` | scroll-snap-type | `sa` | scroll-snap-align |

## Layout Attributes — On Any Element
```nyx
div flex=col center gap=2rem { ... }     # Flexbox column, centered, 2rem gap
div flex=row between wrap { ... }         # Flex row, space-between, wrapping
div grid=3 gap=1rem { ... }              # 3-column grid
div grid=3@1 gap=2rem { ... }            # 3 cols desktop, 1 col mobile! (v0.9.7+)
```

| Attribute | Effect |
|-----------|--------|
| `flex=col` | `display:flex; flex-direction:column` |
| `flex=row` | `display:flex; flex-direction:row` |
| `flex=wrap` | `display:flex; flex-wrap:wrap` |
| `grid=N` | `display:grid; grid-template-columns:repeat(N,1fr)` |
| `grid=N@M` | N cols desktop, M cols mobile (auto @media) (v0.9.7+) |
| `gap=X` | `gap: X` |
| `center` | `align-items:center; justify-content:center` |
| `between` | `justify-content:space-between` |
| `around` | `justify-content:space-around` |
| `evenly` | `justify-content:space-evenly` |
| `wrap` | `flex-wrap:wrap` |
| `place=center` | `place-items:center` |

## Style Presets — Define Once, Use Everywhere
```nyx
preset card { bg #1a1a2e, r 12px, p 2rem, shadow 0 4px 12px rgba(0,0,0,0.2) }
preset label { fs 0.7rem, fw 700, tt uppercase, ls 0.05em, c #888 }

page / {
  div preset=card { h2 "Hello", span "Tag" preset=label }
}
```
Generates `.nyx-p_card` and `.nyx-p_label` CSS classes. Saves 30-40% tokens on repeated styling.

## Theme — Design Tokens (v0.22.0, patched v0.22.1)

Full design-token system: colors, spacing, radius, shadows, fonts, layouts, borders, breakpoints.

*v0.22.1 fixed two bugs found during real-world migration: `borders {}` composite shorthand values (`1px solid color.X`) no longer split into zombie vars, and dot-notation refs no longer emit trailing ` ;;`. See CHANGELOG for details.*

```nyx
theme {
  colors {
    primary: #667eea
    bg: #0a0a12
    text: #f0f0f0
  }
  spacing {
    sm: 8px
    md: 16px
    lg: 24px
  }
  radius {
    sm: 4px
    lg: 16px
  }
  shadows {
    glow: 0 0 40px rgba(102, 126, 234, 0.4)
  }
  breakpoints {
    sm: 600px
    lg: 1024px
  }
  fonts {
    heading: Inter, source: google
    body: "Open Sans", source: google
  }
}
```

### Dot-Notation Token References

Reference any token by its section:
```nyx
style {
  color: color.primary          # → var(--colors-primary)
  padding: spacing.md spacing.lg # → var(--spacing-md) var(--spacing-lg)
  border-radius: radius.lg       # → var(--radius-lg)
  box-shadow: shadow.glow        # → var(--shadows-glow)
}
```

Singular (`color.primary`) → plural storage (`--colors-primary`). Works everywhere: style blocks, presets, inline, CSS rules.

**Hard errors on typos:** `color.primry` throws `Undefined theme token` at compile time — no silent drift.

**Backward compat:** The v0.9 shortcut `c primary` still works for color properties.

### Dark Mode

```nyx
theme {
  colors { primary: #0066ff; bg: #ffffff; text: #1a1a1a }
}

theme dark {
  colors { primary: #4da6ff; bg: #0a0a0a; text: #f0f0f0 }
}
```

Emits both:
- `@media (prefers-color-scheme: dark) { :root { ... } }` — auto dark based on OS
- `[data-theme="dark"] { ... }` — toggle-able via JavaScript

Only redefined tokens override; the rest inherit from the main theme.

### Google Fonts Auto-Injection

```nyx
fonts {
  heading: Inter, source: google
  body: "Open Sans", source: google
}
```

Compiler injects into `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" crossorigin="anonymous" href="https://fonts.googleapis.com/css2?family=Inter&family=Open+Sans&display=swap">
```

- `source: google` → auto-inject Google Fonts CDN links
- `source: local path "./fonts/MyFont.woff2"` → local font file (existence checked at compile time)
- `source: url "..."` → **hard error** (deferred for security; use `--allow-third-party-fonts` in a future release)

### Named Breakpoints

```nyx
theme {
  breakpoints { sm: 600px; lg: 1024px }
}

page home {
  style {
    padding: spacing.lg
    @mobile { padding: spacing.sm }
  }
}
```

- `@mobile` auto-binds to `max-width: breakpoint.sm`
- `@tablet` auto-binds to `min-width: breakpoint.sm`
- `@desktop` auto-binds to `min-width: breakpoint.lg`
- Without `breakpoints {}`: defaults to `768px / 1024px / 1280px` (backward compat)

### Theme Presets (v0.17.0)
One line = entire visual identity:
```nyx
theme "brutalist"       # Mono font, hard borders, raw industrial
theme "glassmorphism"   # Blur, transparency, soft gradients
theme "editorial"       # Serif fonts, clean typography, whitespace
theme "neon"            # Dark bg, glowing green accents, monospace
theme "minimal-dark"    # Subtle dark theme, indigo accents
```
Optional overrides: `theme "neon" { colors { primary: #ff6600 } }`

### Theme Composition (v0.23.0)

Extract a shared **geometry base** (spacing, radius, fonts, transitions) into its own file, then extend it per-site for colors and identity.

```nyx
# base.nyx
theme as "editorial-reader" {
  spacing  { xs: 0.25rem, sm: 0.5rem, md: 1rem, lg: 1.5rem, xl: 2rem, 2xl: 3rem, 3xl: 4rem }
  radius   { sm: 4px, md: 8px, lg: 12px, 2xl: 20px }
  fonts    { body: "Inter", heading: "Playfair Display" }
}
```

```nyx
# site.nyx
theme extends "./base.nyx" {
  colors  { primary: #8b5cf6, text: #2c3e50 }
  spacing { 4xl: 6rem }    # adds a new key; base's xs..3xl survive
}

page / { h1 "Hi" { style { c color.primary; p spacing.2xl } } }
```

**Rules:**

- `theme as "name"` registers a **named base theme** — it does NOT emit CSS on its own.
- `theme extends "./path.nyx"` loads the named theme from `path.nyx` and merges tokens:
  - Keys in the extending theme **override** matching base keys.
  - Base keys not mentioned **pass through** unchanged.
  - New sections and keys can be **added** freely.
- Only tokens are merged. `@style` blocks in the base file are NOT auto-imported (use `use "./base.nyx"` for that).
- The `extends` path must start with `./` or `../` — URLs, absolute paths, and npm-style names are rejected.

### Numeric-prefix theme keys (v0.23.0)

Keys starting with a digit now work in theme sections:

```nyx
theme {
  spacing { md: 1rem, 2xl: 3rem, 3xl: 4rem, 4xl: 6rem }
  radius  { 2xl: 20px }
  breakpoints { 2xl: 1536px }
}

page / { div { style { p spacing.2xl } } }   # → padding: var(--spacing-2xl)
```

## CSS Functions (v0.17.0)
```nyx
div { style { w calc(100% - 2rem); fs clamp(1rem, 2vw, 2rem); h min(100vh, 800px) } }
```

## Nested Selectors (v0.17.0)
Child/sibling selectors inside style blocks:
```nyx
nav { style { > a { c white; td none }; ~ p { m 0 }; + div { bt 1px solid #eee } } }
```

## Extended Pseudo-Classes (v0.17.0)
```nyx
style {
  first-child { fw bold }
  last-child { border-bottom none }
  nth-child(odd) { bg #f5f5f5 }
  disabled { op 0.5 }
  focus-visible { outline 2px solid blue }
}
```
All: first-child, last-child, nth-child(), nth-of-type(), disabled, enabled, checked, required, optional, focus-within, focus-visible, visited, empty, first-of-type, last-of-type, only-child, not(), placeholder, placeholder-shown.

## Grid Template Areas (v0.17.1)
```nyx
div { style { d grid; areas "header header" "sidebar main" "footer footer" } }
div "Header" { style { area header } }
```

## Container Queries (v0.17.1)
```nyx
div { style { container inline-size; @container(min-width: 400px) { fs 1.5rem } } }
```

## Media Queries & Feature Queries (v0.19.0)
Three flavors of responsive CSS, all with full shorthand + theme resolution inside:

```nyx
style {
  fs 2rem
  @mobile { fs 1rem }                                  # built-in: 768px and below
  @tablet { fs 1.5rem }                                # built-in: 1024px and below
  @desktop { fs 2rem }                                 # built-in: 1440px and below
  @media(min-width: 800px) { fs 2.5rem }               # custom min-width
  @media(min-width: 800px) and (max-width: 1199px) { bg #f0f0f0 }  # combinators: and, or, not
  @supports(backdrop-filter: blur(10px)) { bdf blur(10px) }         # feature queries
  @container(min-width: 400px) { p 2rem }              # container queries
}
```

All at-rules support multi-property steps with commas: `{ fs 3rem, c primary }`.

## Typography Utilities (v0.17.1)
```nyx
h1 { style { tracking 0.05em; balance } }      # letter-spacing + text-wrap: balance
p { style { truncate; w 200px } }                 # overflow:hidden + text-overflow:ellipsis
div { style { line-clamp 3 } }                    # multiline truncation
p { style { leading 1.8; indent 2rem; pretty } }  # line-height + text-indent + text-wrap:pretty
span { style { caps } }                            # text-transform: uppercase
```
Shorthands: tracking, leading, indent, wb (word-break), ww (overflow-wrap), hyphens, columns, col-gap, col-count.
Utilities: truncate, line-clamp N, balance, pretty, caps, lowercase, capitalize.

## Footnotes (v0.19.0)
Editorial-grade footnotes with auto-linking and backlinks.

```nyx
page / {
  h1 "On Consciousness"
  p "The hard problem[^1] is distinct from the easy problems.[^2]"
  p "Nagel's bat[^3] argues for subjective experience."

  footnotes {
    1 "Chalmers, David (1995). Facing Up to the Problem of Consciousness."
    2 "Cognitive functions like attention, memory, reportability."
    3 "Nagel, Thomas (1974). What Is It Like to Be a Bat?"
  }
}
```

- `[^N]` in any text content becomes a superscript link to `#fn-N`
- The `footnotes {}` block renders as `<aside role="doc-endnotes">` with an ordered list + backlinks
- Default styles auto-injected (thin top border, decimal numbering, subtle backlinks)
- IDs can be numeric (`1`) or named (`note-a`, `intro`)

## Inline SVG (v0.19.0)
SVG elements are first-class — 33 tags supported. Attribute case is preserved (`viewBox`, `stroke-width`, `text-anchor` etc.).

```nyx
svg viewBox="0 0 400 400" width="400" height="400" {
  defs {
    linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%" {
      stop offset="0%" stop-color="#00e5ff" { }
      stop offset="100%" stop-color="#c084fc" { }
    }
  }
  circle cx="200" cy="200" r="150" fill="url(#grad1)" { }
  path d="M100,200 Q200,50 300,200" stroke="#00ff41" stroke-width="3" fill="none" { }
  g {
    ellipse cx="150" cy="180" rx="25" ry="30" fill="white" { }
    ellipse cx="250" cy="180" rx="25" ry="30" fill="white" { }
  }
  text "NYX" x="200" y="350" text-anchor="middle" fill="#00ff41" font-size="32"
}
```

Supported tags:
- **Shapes**: svg, g, path, circle, ellipse, rect, line, polyline, polygon
- **Paint**: defs, linearGradient, radialGradient, stop, pattern, mask, clipPath
- **Filters**: filter, feGaussianBlur, feColorMatrix, feBlend, feOffset, feMerge, feMergeNode, feFlood, feComposite, feMorphology, feTurbulence, feDisplacementMap
- **Text**: text, tspan, textPath
- **Structure**: use, symbol, marker, foreignObject, image, title, desc, switch
- **Animation**: animate, animateTransform, animateMotion, set, mpath

## `@keyframes` in `style {}` Blocks (v0.18.1)
Keyframes support full shorthand expansion and theme resolution, just like regular style properties.

```nyx
page / {
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
  div .floating { p "Float me" }
}
```

- `tf`, `op`, `anim`, `fi`, `bdf`, `shadow` — all shorthands work inside keyframes
- Multiple properties per step separated by commas
- Negative values (`-15px`) are preserved correctly
- String values for `anim`/`tr`/`font-family` are emitted unquoted (only `content` keeps quotes)
- Also available as top-level: `animate name { ... }`

## Declarative `meta {}` Block (v0.18.0)
Drop the HTML and let NyxCode generate `<title>`, Open Graph, Twitter Card, favicon, canonical URLs, etc.

```nyx
meta {
  title "NyxCode — The AI-Native Language"
  description "A token-efficient full-stack DSL for AIs"
  author "Fabian + Nyx"
  keywords "nyxcode, ai, dsl, fullstack"
  favicon "/favicon.ico"
  canonical "https://nyxcode.dev"
  theme-color "#00ff41"
  og:title "NyxCode"
  og:image "https://nyxcode.dev/og.png"
  og:type "website"
  twitter:card "summary_large_image"
  twitter:site "@nyxthe_lobster"
  robots "index, follow"
}

page / { h1 "Hi" }
```

- Top-level block, emits a `HeadStatement` injected into `<head>`
- Works on single-page AND multi-page builds (meta is applied globally to every page)
- `og:*` and `twitter:*` prefixes are preserved (Lexer-splits get reassembled)
- Auto-deduplication: if your meta sets `title` or `description`, NyxCode won't re-emit its defaults

## Multi-Page Builds (v0.18.0)
One `.nyx` file → multiple HTML files via `page /path/ {}`.

```nyx
meta { title "My Site" }

page / { h1 "Home" }
page /about/ { h1 "About" p "About text" }
page /blog/ { h1 "Blog" }
```

Build output:
```
dist-site/
├── index.html          ← page /
├── about/index.html    ← page /about/
└── blog/index.html     ← page /blog/
```

- Clean URLs (no `.html` extensions)
- `meta {}` is inherited by every page
- Global layouts/components available across all pages
- Use case: static sites, documentation, blogs, landing pages with sub-pages

## Canvas, Audio, Video & Iframe (v0.18.0)
Interactive media elements are now first-class:

```nyx
canvas id="game" width="800" height="600" { }
audio controls=true src="/track.mp3" { source src="/track.ogg" type="audio/ogg" }
video controls=true { source src="/video.mp4" type="video/mp4" }
iframe src="https://example.com" width="100%" height="400" { }
```

- Added elements: `canvas`, `audio`, `source`, `track`, `iframe`
- `source` and `track` are void elements (self-closing)
- Boolean attributes like `controls` need explicit `controls=true` (Lexer limitation)

## Unicode Escapes in Strings (v0.18.0)
Full escape sequence support in string literals:

```nyx
p "Arrow: \u2192 \u2190 \u2191 \u2193"    # Unicode escapes
p "Hex: \x41\x42\x43"                      # ABC
p "Quotes: \" \' \`"                        # Quotes, backticks
p "Whitespace: \n \t \r"                    # Newline, tab, carriage return
```

Previous versions rendered `\u2192` as literal `u2192`. Fixed in v0.18.0.

## Pages & Routing
```nyx
page / { h1 "Home" }                    # → index.html
page /about { h1 "About" }              # → about/index.html
page /blog { h1 "Blog" }                # → blog/index.html
```
- 2+ pages = multi-file static output (SSG), one HTML per page.
- 1 page = single HTML file with SPA routing.
- Each page auto-gets `<title>`, `<meta description>`, `<link rel="canonical">`.

## Elements
All standard HTML elements are recognized:

### Text
`h1`-`h6`, `p`, `span`, `text` (→span), `link` (→a)

### Interactive
`button`, `input`, `select`, `checkbox`, `radio`, `toggle`, `slider`, `textarea`, `submit`

### Media
`img`, `video`
- `img` auto-gets `loading="lazy"` (v0.9.7+)
- `img "alt text" src="url"` → `<img alt="alt text" src="url" loading="lazy" />` (v0.12.0+)

### Structure
`div`, `section`, `header`, `footer`, `nav`, `aside`, `main`, `article`, `figure`, `figcaption`, `container`, `card`, `row`, `col`, `grid`, `stack`, `ul`, `ol`, `li`, `a`, `strong`, `em`, `small`, `sup`, `sub`, `blockquote`, `pre`, `code`, `label`, `details`, `summary`, `table`, `thead`, `tbody`, `tr`, `td`, `th`

### Void Elements
`br`, `hr`, `img`, `input` — self-closing, no children needed.
```nyx
p "Line one"
br
p "Line two"
```

### Semantic Aliases
| NyxCode | HTML |
|---------|------|
| `link` | `<a>` |
| `a` | `<a>` (native, v0.12.0+) |
| `text` | `<span>` |
| `card` | `<div>` |
| `container` | `<div>` |
| `row` | `<div>` (with flex) |
| `col` | `<div>` |
| `grid` | `<div>` (with grid) |
| `stack` | `<div>` |

### Element Syntax
```nyx
h1 "Hello World"                         # Text content
link "Click me" href="/about"            # Content + attributes
img src="photo.jpg" alt="A photo"        # Attributes only (void)
img "A photo" src="photo.jpg"            # Alt text as content (v0.12.0+)
div class="hero" id="main" { ... }      # Attributes + children
button "Submit" style={ bg blue }          # Unified style (v0.12+)
button "Submit" style="bg: blue"          # CSS-style (still works)
div preset=card { p "Content" }          # Preset class
```

### IMPORTANT: Sibling Elements
```nyx
# WRONG — `link` becomes attribute of `p`
p "Hello" link "Click" href="/x"

# RIGHT — separate elements
div {
  p "Hello"
  link "Click" href="/x"
}
```
Elements on the same line merge. Use a wrapping `div {}` or put on separate lines inside a block.

## Styling (3 Tiers)

### Unified Style Syntax (v0.12+)

 uses NyxCode shorthand syntax (same as presets and style blocks).
 CSS-syntax still works for backward compatibility.

**\ shorthand:**  instead of  — saves tokens!

### Tier 1: Inline Style (quick)
```nyx
h1 "Title" style="fs: 2rem; fw: 700; c: primary"
```

### Tier 2: Style Block (hover, responsive, animations)
```nyx
div {
  style {
    bg #1a1a2e, r 12px, p 2rem
    hover { tf translateY(-4px), shadow 0 12px 40px rgba(0,0,0,0.3) }
    @mobile { p 1rem, fs 0.9rem }
  }
  h2 "Card Title"
}
```

### Tier 3: CSS Rules in Style Blocks (v0.9.4+)
```nyx
page / {
  style {
    * { m 0, p 0, box-sizing border-box }
    body { bg #0d0d1a, c #f0eaff }
    .card { bg #1a1a2e, r 12px, p 2rem }
    .card:hover { tf translateY(-4px) }
    ::selection { bg rgba(245,158,11,0.3) }
    footer a { c pink, td none }
    @keyframes spin {
      0% { transform rotate(0deg) }
      100% { transform rotate(360deg) }
    }
  }
  div class="card" { p "Styled!" }
}
```
CSS rules support: `.class`, `tag`, `*`, `.class:pseudo`, `::pseudo-element`, `@keyframes`.
All CSS shorthands work inside rules. Vendor prefixes (`-webkit-*`) supported (v0.9.5+).

### Pseudo-classes & Responsive
```nyx
style {
  bg blue
  hover { bg darkblue }
  focus { o 2px solid blue }
  active { tf scale(0.98) }
  @mobile { fs 0.9rem }        # max-width: 768px
  @tablet { fs 1rem }          # max-width: 1024px
}
```

## State & Reactivity
```nyx
page / {
  state count = 0
  button "Count: {count}" on:click -> count = count + 1
  p "Count is: {count}"
}
```
- `state name = value` declares reactive state
- `{name}` interpolates state/computed in text content (e.g. `p "Count: {count}"`)
- Works in any nested element depth — compiles to reactive template bindings
- State changes auto-trigger re-render

### Events (v0.12.0+)
```nyx
button "Click" on:click -> count = count + 1
button "Reset" on:click -> count = 0
```
Both `on:click` and `on click` syntax work (colon optional).
Events work inline on elements AND inside when/else blocks.

### Store — Global State (v0.16.0+)
```nyx
store user {
  name = "Guest"
  role = "viewer"
  computed isAdmin = role == "admin"
}

store cart {
  items = 0
  price = 9.99
  computed total = items * price
}

page / {
  p user.name                     # Reactive binding to store
  p cart.items
  button on:click -> user.name = "Nyx" { text "Login" }
  button on:click -> cart.items = cart.items + 1 { text "Add" }
}
```
- `store name { }` declares global state (shared across ALL pages)
- Fields: `name = value` (strings, numbers, booleans, arrays)
- Computed: `computed total = items * price` (derived, auto-resolves own fields)
- Access: `storeName.field` in content, events, and `when` blocks
- Mutations: `on:click -> store.field = value`
- **Store state persists across pages** in multi-file apps
- Page-level `state` is local; `store` is global

### Computed Properties (v0.16.0+)
```nyx
page / {
  state count = 0
  computed doubled = count * 2
  computed label = count == 0 ? "empty" : "has items"
  p doubled
  button on:click -> count = count + 1 { text "+1" }
}
```
- `computed name = expression` — derived from state, auto-updates
- Supports ternary: `computed label = count > 0 ? "positive" : "zero"`
- Interpolate in text: `p "Status: {label}"` — reactively updates
- Works in both `page` blocks and `store` blocks



## Form Blocks (v0.6+)
Native forms with zero JS. Compiler generates `<form>` + `fetch()` + auth + error handling.

### Basic Form
```nyx
form /api/posts auth {
  input title placeholder="Post title"
  input body placeholder="Content"
  submit "Create Post"
  success -> reload
  error -> toast "Failed to create post"
}
```

### Form Features
- `form /api/endpoint` — POST to endpoint automatically
- `form /api/endpoint auth` — includes JWT Bearer token
- `input fieldname` — field name becomes JSON key
- `submit "Label"` — submit button text
- `success -> reload` — reload page on success
- `success -> redirect /dashboard` — redirect on success
- `success -> toast "Saved!"` — show toast notification
- `success -> clear` — clear form fields
- `error -> toast "msg"` — show error message
- Field IDs auto-generated: `form-{endpoint}-{field}`

### Login/Register Forms
```nyx
form /api/auth/register {
  input email placeholder="Email"
  input password placeholder="Password"
  submit "Register"
  success -> redirect /login
}

form /api/auth/login {
  input email placeholder="Email"
  input password placeholder="Password"
  submit "Login"
  success -> redirect /
}
```

## Components

### Preferred syntax (v0.20.0+)
Parameter list in parentheses, `${expr}` interpolation for everything:

```nyx
component nav(current) {
  nav {
    style { d flex, gap 2rem }
    a "Home" href="/" class="${current == 'home' ? 'active' : ''}"
    a "Docs" href="/docs/" class="${current == 'docs' ? 'active' : ''}"
  }
}

component citation-card(num, title, claim, source, status="Unverified") {
  div {
    style { p 1.5rem, border "1px solid #ccc", radius 8px }
    h3 "#${num} — ${title}"
    p "${claim}"
    span "${status}"
    p "— ${source}" { style { fs 0.85rem, c #666 } }
  }
}

page /citations/ {
  use nav(current="citations")
  use citation-card(1, "Hard Problem", "Subjective experience...", "Chalmers 1995", "Canonical")
  use citation-card(num=2, title="Multiple Drafts", claim="...", source="Dennett 1991")
}
```

- `component name(p1, p2, p3="default")` — parenthesized params, optional defaults
- `use name(arg1, arg2, ...)` — positional args (mapped in declaration order)
- `use name(key=val, key2=val2)` — named args
- `use name arg=val` — attribute-form (no parens, no `use` keyword needed)
- `${propName}` — interpolation in content AND attributes
- `${cond ? "a" : "b"}` — ternary with `==` / `!=` comparison
- Component names can be lowercase or uppercase

### Legacy block-form syntax (still supported)
```nyx
component Card {
  props title subtitle="Default"
  div {
    style { bg #1a1a2e, r 12px, p 2rem }
    h3 .title
    p .subtitle
    slot                                  # ← children go here
  }
}

page / {
  Card title="Hello" { p "Slotted content!" }
}
```
- `props` declares accepted properties with optional defaults (space-separated).
- Type annotations like `name: string` are parsed and ignored (NyxCode is dynamically typed).
- `slot` renders children passed to the component.
- `.propName` accesses prop values as content (legacy; use `${propName}` for new code).
- Components with no `style {}` render with NO wrapper div (v0.20.0+).

### Component Style Blocks (v0.10.0+)
```nyx
component Card {
  props title desc
  div {
    style { bg #1a1a2e, r 12px, p 2rem }
    h3 .title { fs 1.3rem, c text, fw 700 }
    p .desc { fs 0.88rem, c muted, lh 1.65 }
    slot
  }
}
```
Style blocks directly on `.prop` elements — no inline `style="..."` needed!
Supports hover, focus, active, @mobile, @tablet inside the block.

## Layout (wraps all pages)
```nyx
layout {
  nav { link "Home" href="/", link "About" href="/about" }
  slot                                    # ← page content goes here
  footer { p "© 2026" }
}
```
The `layout` block wraps ALL pages automatically. Only one layout per file.

## Imports — Multi-File Projects (v0.21.0)

One-file is the default. Multi-file is opt-in. Use when projects grow past ~1500 lines or you want one nav/footer shared across pages.

```nyx
# Entry file: app.nyx
use "./theme/base.nyx"          # single file, relative path
use "./components/"             # directory — all .nyx files, alphabetical
use "@/pages/"                  # @/ = directory of the entry file
use "@/shared/nav.nyx"          # @/ alias works for single files too

meta { title "My App" }
```

**What gets imported:** everything top-level — pages, components, themes, layouts, stores, APIs, tables, meta.

**Security:** local-only. No `http://`, no `https://`, no paths that escape the project root. Build fails if you try.

**Errors:** duplicate page routes, duplicate component names, theme in multiple files, missing files — all hard build errors with file paths.

**Circular imports:** silent skip on second visit. No infinite loops.

**Watch mode:** `nyx watch app.nyx` tracks all imported files recursively.

### Structure recommendation

| Project size | Approach |
|---|---|
| < 500 lines | One file (the default) |
| 500-1500 lines | Main file + `components/` directory |
| 1500+ lines | Page-per-file + shared imports |

```
myapp/
  app.nyx              # entry: meta, theme imports, page imports
  theme/
    base.nyx           # theme {}
  components/
    nav.nyx            # component SiteNav(current) { }
    footer.nyx         # component SiteFooter { }
    cards.nyx          # component CitationCard(num, title, ...) { }
  pages/
    home.nyx           # page / { }
    about.nyx          # page /about/ { }
```

### `nyx flatten` — multi-file → single file

```bash
nyx flatten app.nyx > flat.nyx
```

Concatenates everything into one `.nyx` file. Use it for AI context windows, audits, or to ship a single-file artifact.

- **Comments and formatting are preserved** (source-level concat, not AST regeneration)
- Each file's content gets a source-attribution header: `# --- from: components/nav.nyx ---`
- `use "./..."` lines are stripped; component invocations (`use nav(...)`) stay intact
- The flattened file is itself valid NyxCode and builds to the identical output

### Disambiguation: two uses of `use`

Same keyword, two operations, disambiguated by **context + argument type**:

```nyx
# Top-level: file import (string literal argument)
use "./components/nav.nyx"
use "@/pages/"

# Inside page body: component instantiation (identifier argument)
page / {
  use SiteNav(current="home")
  use CitationCard(1, "Hard Problem", "...", "Chalmers 1995", "Canonical")
}
```

String argument = load file. Identifier = instantiate component. No ambiguity in practice.

## Iteration & Conditionals
```nyx
# Loop over data
data users = get /api/users
each users -> div { h3 .name, p .email }

# Named element in loop
each users -> Card { h3 .name }

# Conditionals with else
when .role == "admin" {
  button "Delete"
  button "Ban User"
} else {
  p "Access denied"
}

# Short form with arrow
when .premium -> badge "PRO"
```

## Forms (v0.6+)
```nyx
form /api/posts auth {
  input title placeholder="Post title"
  input body placeholder="Content"
  submit "Create Post"
  success -> reload
  error -> toast "Failed to create post"
}
```
- `auth` → auto-includes JWT Bearer token
- `input fieldname` → `name="fieldname"`, `id="form-endpoint-fieldname"`
- `success -> reload|redirect /path|toast "msg"|clear`
- `error -> toast "msg"`
- Generates complete `<form>` + `fetch()` + error handling. Zero JS.

## Script Block (escape hatch)
```nyx
page / {
  script {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('Raw JS here!');
    });
  }
}
```
Raw JavaScript captured at lexer level. Use sparingly — NyxCode native features preferred.

## Icons
4 methods — no native `icon` element:
1. **Emoji:** `span "🦞"`
2. **Lucide CSS:** Add CDN in `head`, use `<i data-lucide="heart"></i>` via script
3. **Font Awesome:** Add CDN in `head`, `span class="fa-solid fa-heart"`
4. **Material Icons:** Add CDN in `head`, `span "heart" class="material-icons"`

## Head Injection
```nyx
page / {
  head "<link rel='stylesheet' href='https://cdn.example.com/lib.css'>"
  head "<script src='https://cdn.example.com/lib.js' defer></script>"
  head "<style>@keyframes fade { from { opacity: 0 } to { opacity: 1 } }</style>"
  h1 "Page with third-party libs"
}
```
- Raw HTML string injected into `<head>`.
- Use for third-party CDNs, custom meta tags, complex CSS that needs `{}` in strings.
- If `head` contains `<title>`, compiler skips auto-generated title.

## `__version__` Keyword (v0.9.3+)
```nyx
p "Built with NyxCode __version__"
```
Auto-replaced with current NyxCode version at compile time.

## Full-Stack Backend

### Tables (= Database)
```nyx
table users {
  name text required
  email email unique
  password text required
  role text default="user"
  created auto
}
```
**Types:** `text`, `email` → TEXT | `number`, `int` → INTEGER | `float`, `decimal` → REAL | `bool` → INTEGER | `auto` → DATETIME | `[tablename]` → FOREIGN KEY

**Constraints:** `required` → NOT NULL | `unique` → UNIQUE | `default="value"` → DEFAULT 'value'

Auto-generates: CREATE TABLE + 5 CRUD endpoints per table (GET all, GET :id, POST, PUT, DELETE).

### File Upload (v0.15.0+)
```nyx
table posts {
  title text required
  image upload
}
```
- `upload` column type → multer middleware, files stored in `./uploads/`.
- POST uses `multipart/form-data` automatically.
- Static serving: `/uploads/filename.jpg`.
- Deps: `multer`.

### WebSocket / Realtime (v0.15.0+)
```nyx
table messages {
  text text required realtime
  author [users]
}

page / {
  data msgs = live /api/messages auth
  each msgs -> m { p .text }
}
```
- `realtime` constraint → WebSocket broadcast on INSERT.
- `data x = live /path` → client auto-subscribes via WebSocket.
- Auto-reconnects, handles insert/update/delete events.
- Deps: `ws`.

### Role-Based Access Control (v0.15.0+)
```nyx
security {
  auth jwt
  protect /api/admin all role=admin
}

api GET /api/admin/users guard=admin {
  query "SELECT id, email, role FROM users"
}
```
- `guard=admin` on api blocks → auth + role check middleware.
- `protect /path all role=X` → role-restricted routes.
- `roleGuard()` queries user's `role` column from DB.

### Config Block (v0.15.0+)
```nyx
config {
  env JWT_SECRET required
  env DATABASE_URL default="sqlite:./data.db"
  env PORT default=3000
  cors "*"
}
```
- `env NAME required` → crash on startup if missing.
- `env NAME default=VALUE` → fallback value.
- `cors "origin"` → auto-generates CORS middleware.
- Generates startup validation + clear error messages.

### Before/After Hooks (v0.15.0+)
```nyx
before POST /api/posts {
  query "UPDATE counters SET value = value + 1 WHERE name = 'posts'"
}
```
- `before METHOD /path { }` → runs BEFORE the route handler.
- `after METHOD /path { }` → runs AFTER response is sent.
- Can contain `query` statements for side effects.

### Validation (v0.15.0+)
```nyx
table users {
  name text required min=2 max=50
  email text required unique format=email
  age number min=13 max=120
  password password required min=8
}
```
**Keywords:** `required`, `min=N`, `max=N`, `format=email|url`, `pattern="regex"`, `unique`.
- Text: min/max = character length. Number: min/max = value range.
- `format=email` → regex validation. `format=url` → https check.
- Auto-generates server-side validation on POST and auth register (v0.15.0+).
- Error: `{ "error": "name must be at least 2 characters" }`

### Custom API Routes (v0.15.0+)
```nyx
api GET /api/stats {
  query "SELECT COUNT(*) as total FROM posts"
}

api POST /api/contact {
  validate { email required format=email, message required min=10 }
  query "INSERT INTO contacts (email, message) VALUES ($email, $message)"
}

api GET /api/posts/:id/views auth {
  query "SELECT views FROM posts WHERE id = $id LIMIT 1"
}
```
- `api METHOD /path [auth] { }` — custom Express endpoints.
- `query "SQL"` — raw SQL. `$field` → parameterized (no injection).
- `validate { field rules }` — same rules as tables (`required`, `min`, `max`, `format`).
- `auth` → requires JWT token (uses `authMiddleware`).
- Path params (`:id`) auto-map to `req.params`. Body params to `req.body`.
- Smart return: aggregates (`COUNT`/`SUM`) → single object. `LIMIT 1` → single. Else → array.

### Table Relations (v0.11+)
```nyx
table posts {
  title text required
  body text required
  author [users]       # → INTEGER REFERENCES users(id)
  created_at auto
}

table comments {
  body text required
  post [posts]
  author [users]
  created_at auto
}
```
`[tablename]` creates a foreign key. The compiler auto-generates:
- **LEFT JOIN** queries → nested JSON responses
- **Password exclusion** → JOINed user never includes password
- **Cascade deletes** → delete user → auto-deletes their posts + comments

GET /api/posts returns nested author:
```json
[{ "title": "Hello", "author": { "id": 1, "name": "Fabian", "email": "..." } }]
```

### CRUD Endpoints (per table)
- `GET /api/tablename` — list all (with JOINs if relations exist)
- `GET /api/tablename/:id` — get by id (with JOINs)
- `POST /api/tablename` — create
- `PUT /api/tablename/:id` — update
- `DELETE /api/tablename/:id` — delete

### Security (= Auth)
```nyx
security {
  table users
  login email password
  token jwt
  protect /api/posts           # write-only (DEFAULT) — GET open, POST/PUT/DELETE need auth
  protect /api/comments write  # same as above (explicit)
  protect /api/users all       # ALL methods need auth (including GET)
}
```
Auto-generates: Register (`POST /api/auth/register`), Login (`POST /api/auth/login`), Me (`GET /api/auth/me`), JWT middleware, bcrypt hashing, rate limiting.

**Auto-generated users table (v0.21.1+):** If you don't declare `table users { ... }` explicitly, NyxCode synthesizes one from the `login` rule (identity field as required+unique, password required). Declare it yourself to add extra columns like `name`, `role`, etc.

```nyx
# These two are equivalent:

security { table users, login email password, token jwt }   # Auto-creates users table

# Same as:
table users { email email required unique, password text required }
security { table users, login email password, token jwt }
```

**Protect modes (v0.12.0+):**
| Mode | GET | POST/PUT/DELETE | Use case |
|------|-----|-----------------|----------|
| `write` (default) | ✅ Open | 🔒 Auth | Blog, public content |
| `all` | 🔒 Auth | 🔒 Auth | Private data, user profiles |
| `read` | 🔒 Auth | ✅ Open | Rare, write-only endpoints |

**Token auto-save (v0.11.4+):** Form blocks that receive a JWT token auto-save it to `localStorage`. Subsequent `auth` requests include `Authorization: Bearer` header automatically.

**Security features (v0.9.6+):**
- Table name validation against SQL injection
- JWT_SECRET hard-fails in production (no random fallback)
- Rate limiting on auth endpoints (20 req/15min)
- Rate limiting on write CRUD endpoints (100 req/15min)
- Path traversal protection on imports
- Passwords auto-excluded from all API responses (GET, POST, JOIN)

### Form Blocks with Auth
```nyx
form /api/auth/register {
  input name placeholder="Name"
  input email placeholder="Email"
  input password placeholder="Password"
  submit "Register"
  success -> toast "Welcome!"      # Token auto-saved to localStorage!
}

form /api/auth/login auth {
  input email placeholder="Email"
  input password placeholder="Password"
  submit "Login"
  success -> redirect /dashboard   # Token auto-saved!
}

form /api/posts auth {              # auth → includes Bearer token from localStorage
  input title placeholder="Title"
  input body placeholder="Write..."
  submit "Publish"
  success -> reload
}
```
`auth` keyword on form → auto-includes `Authorization: Bearer` header from localStorage.
Success handlers: `reload`, `redirect /path`, `toast "message"`, `clear`.

### Data Binding (Frontend to Backend)
```nyx
data posts = get /api/posts              # Public data
data posts = get /api/posts auth         # Authenticated (sends JWT)
```
Generates `fetch()` calls with optional Bearer token from localStorage.

### Loading/Error/Empty States (v0.12.0+)
```nyx
data posts = get /api/posts auth {
  loading -> p "Loading posts..."
  error -> p "Something went wrong!"
  empty -> p "No posts yet. Write one!"
}
each posts -> post {
  Card title=.title body=.body author=.author.name
}
```
- `.field` = data path → `${item.field}` in JS template.
- `.author.name` = nested → `${item.author?.name}` (optional chaining, safe on null).
- Components resolved to HTML in templates (v0.12.5+).
- `$preset` works inside each bodies.

```nyx
# Inline each (no component):
each posts -> post { div { h3 .title, span .author.name } }
```
- `loading` → shown during fetch, hidden when done
- `error` → hidden by default, shown on fetch failure
- `empty` → hidden by default, shown when data is empty array
- Both inline (`loading -> p "..."`) and block (`loading -> { ... }`) syntax
- Zero JavaScript — compiler generates all state management

## Default Props (v0.3+)
```nyx
component Badge {
  props label, color="blue"
  span .label style="bg: {color}"
}
Badge label="New"                         # color defaults to "blue"
Badge label="Hot" color="red"             # override
```

## Element CSS Defaults
Buttons, inputs, selects, textareas auto-get base CSS (font, padding, border-radius, border). Uses `:where()` for zero specificity — your styles always win.

## Common Mistakes
```nyx
# ❌ WRONG: head with CSS containing {} (breaks parser)
head "<style>.foo { color: red; }</style>"

# ✅ RIGHT: Use style block with CSS rules instead
style { .foo { c red } }

# ❌ WRONG: CSS shorthands inside @keyframes
style { @keyframes spin { 0% { tf rotate(0) } } }

# ✅ RIGHT: Full property names in @keyframes
style { @keyframes spin { 0% { transform rotate(0deg) } 100% { transform rotate(360deg) } } }
```

## Troubleshooting
| Problem | Solution |
|---------|----------|
| `Unexpected token at top level` | Element not in ELEMENT_TAGS, or missing page wrapper |
| `{}` in head string breaks parser | Use CSS rules in `style {}` blocks instead |
| Sibling elements merge | Wrap in `div {}` or put inside page/component block |
| Inline style commas | Use `;` not `,` in `style="..."` attributes |
| Theme color not resolving | Must be defined in `theme { colors { name value } }` |
| `img` shows `value=` instead of `alt=` | Update to v0.12.0+ |
| `div` absorbed into previous element | Update to v0.9.7+ (div now in ELEMENT_TAGS) |

## AI Rules
1. **USE SHORTHANDS** — `bg` not `background`, `c` not `color`, `r` not `border-radius`
2. **USE PRESETS** for repeated styling — define once, apply with `preset=name`
3. **USE LAYOUT ATTRS** — `flex=col center gap=2rem` not separate style blocks
4. **USE RESPONSIVE SHORTHANDS** — `grid=3@1` not style + @mobile
5. **USE THEME COLORS** — `c primary` not `c #667eea`, define in `theme {}`
6. **ONE FILE** when possible — single .nyx = maximum token efficiency
7. **NO RAW HTML** — NyxCode replaces HTML. Use `head` only for third-party CDNs.
8. **VOID ELEMENTS** don't need `{}` — `br`, `hr`, `img src="x"` alone is fine.
9. **`__version__`** auto-replaces with NyxCode version.
10. **CSS RULES** in style blocks for global/class styling (v0.9.4+).

## Token Comparison (measured with cl100k_base)
| What | NyxCode | Alternative | Savings |
|------|---------|-------------|---------|
| Static page | 187 tokens | Tailwind HTML: 251 | **-25%** |
| Full-stack blog | 169 tokens | Next.js+Prisma+NextAuth: 964 | **-82%** |

## Middleware (v0.16.2)
Define reusable Express middleware, attach to routes:
```nyx
middleware logger {
  console.log(req.method, req.url)
}

middleware rateLimit {
  if (tooFast) return res.status(429).json({ error: "Slow down" })
}

api GET /api/stats [logger, rateLimit] auth {
  respond 200 "ok"
}
```
Middleware names in `[]` before `auth`/`{`. Multiple comma-separated. Body is raw JS with `req`, `res`, `next`.

## Declarative Error Handling (v0.16.2)
Status-specific catch blocks after `data` or `form`:
```nyx
data posts = get /api/posts auth
catch 401 -> redirect "/login"
catch 403 -> toast "Forbidden"
catch * -> show "Something went wrong"
```
Also works on forms:
```nyx
form /api/auth/login {
  input email placeholder="Email"
  input password placeholder="Password"
  submit "Login"
  success -> redirect "/dashboard"
}
catch 401 -> toast "Wrong credentials"
catch 429 -> toast "Too many attempts"
```
**Actions:** `redirect "/path"`, `toast "message"`, `show "message"`. Wildcard `*` = catch-all.

## Event Modifiers (v0.16.1)
```nyx
button on:click.prevent="doThing()"  # preventDefault
a on:click.stop="handle()"           # stopPropagation
input on:keydown.enter="submit()"     # key filter
input on:keydown.ctrl.s="save()"      # modifier combo
button on:click.once="init()"         # fires once
```
Modifiers: `.prevent`, `.stop`, `.once`, `.self`, `.enter`, `.escape`, `.space`, `.ctrl`, `.shift`, `.alt`, `.meta` + any key name.

## Lifecycle Hooks (v0.16.1)
```nyx
onMount {
  console.log("page loaded")
  startTimer()
}

onDestroy {
  clearInterval(timer)
}
```
`onMount` = DOMContentLoaded. `onDestroy` = beforeunload.

## Element Refs (v0.16.1)
```nyx
div ref=container { p "Hello" }
button on:click="refs.container.style.color='red'" { text "Paint" }
```
`ref=name` → access via `refs.name` (auto-generates `getElementById`).

## Version
v0.16.2 — 47 releases. Security-reviewed by Tyto 🦉 (9.5/10). QA by Kiro 🐺. All 50 GitHub issues closed.
