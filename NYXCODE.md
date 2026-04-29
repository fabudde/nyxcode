# NYXCODE.md — AI Context File (v0.50.0)
# Give this to any AI. It will generate NyxCode.

## What is NyxCode?
A token-efficient language replacing TypeScript/Next.js. One `.nyx` file = full-stack app with DB, Auth, API, frontend. **25% fewer tokens than Tailwind, 82% fewer than Next.js.** Now with **Tailwind CSS compatibility** — use the classes you already know, compiled to native CSS at build time. Zero runtime. Compiles to HTML+CSS+JS (frontend) and Express+SQLite (backend). Node-based runtime.

## Quick Start
```bash
npm i -g @fabudde/nyxcode
nyx build app.nyx              # → <input-dir>/dist-site/index.html
nyx build app.nyx -o build.html  # single-file output
nyx build app.nyx -o public/   # custom directory
nyx dev app.nyx                # Dev server + hot reload
nyx parse app.nyx              # Debug AST output
nyx flatten app.nyx > flat.nyx # Multi-file → single file
nyx add stripe                 # Add package + npm install
```

The CLI is available as `nyx` (preferred) or `nyxcode` (alias). Both work identically.

**Output path rules (v0.21.3):**
- `-o path/to/file.html` → single-file output (errors on multi-page projects)
- `-o path/to/dir/` → directory output (one `index.html` per route)
- No flag → defaults to `<input-file-dir>/dist-site/`, NOT the current working dir


## Dev Server (`nyx dev`)

```bash
nyx dev app.nyx                # Starts on localhost:3000
nyx dev app.nyx --port=8080    # Custom port
```

**What it does:**
- Compiles `.nyx` → HTML and serves from memory (no disk I/O)
- Watches all source files for changes, rebuilds with debounce
- **Live Reload** via Server-Sent Events — browser refreshes automatically
- **Full-stack mode:** If your `.nyx` has `table` or `security` blocks, the dev server embeds CRUD API routes + in-memory SQLite — no separate backend needed
- All API endpoints (`GET/POST/PUT/DELETE`) work live during development
- Auth (JWT login/register) works out of the box

**Architecture:**
```
Your editor → save .nyx → file watcher detects → rebuild (50ms) → SSE "reload" → browser refreshes
```

No webpack. No vite config. No bundler. Just `nyx dev` and go.

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

## Backend Primitives (v0.30.0) — The Language Release

NyxCode is now a full programming language. These primitives enable multi-step server logic.

### `let` — Variable Bindings (Backend)
Use in `api` and `action` blocks for multi-step server logic. (For frontend reactive `let`, see **Page-Local Variables** below.)
```nyx
api GET /api/stats auth {
  let users = query "SELECT COUNT(*) as n FROM users"
  let posts = query "SELECT COUNT(*) as n FROM posts"
  respond 200 { status "ok" }
}
```
**Smart detection:** `WHERE id = ?` or `LIMIT 1` → `.get()` (single row). Otherwise → `.all()` (array).

**Built-in functions:** `sum(data, "field")`, `count(data)`, `avg(data, "field")`, `min`, `max`, `len`.

**External calls:** `let session = stripe.checkout(amount)` → `await stripe.checkout(amount)`

### `action` — Reusable Server Functions
Define once, call from any `api` block or other `action`.
```nyx
action sendWelcome(email) {
  email to=email subject="Welcome!" body="Thanks for joining."
  on error {
    respond 500 { error "Email failed" }
  }
}
```
Compiles to `async function` with try/catch. Params optionally typed: `action send(to: email)`.

### `on` — Table Lifecycle Events
React to data changes automatically.
```nyx
on users.created {
  email to=row.email subject="Welcome!" body="You're in!"
}
on posts.deleted {
  query "DELETE FROM comments WHERE post_id = $row.id"
}
```
Events: `created`, `updated`, `deleted`. Hook functions auto-injected into CRUD routes.

### `env` — Environment Variables
Declare requirements. Fail fast at startup.
```nyx
env {
  DATABASE_URL required
  STRIPE_KEY required
  DEBUG default="false"
}
```

### `email` — First-Class Email
Usable inside `action` and `api` blocks.
```nyx
email to=user.email subject="Order confirmed" body="Your order is ready."
```

### `use` — Package System (Three Tiers)
```nyx
use stripe           # Tier 1: built-in adapter (auto-init from env)
use nodemailer       # Tier 1: SMTP transport + sendEmail() helper
use uuid             # Tier 1: uuidv4() function
use npm:"slugify"    # Tier 2: raw npm require (compiler warning)
# use npm:"child_process"  → ❌ BLOCKED (security)
```
**Tier 1 packages (9):** stripe, nodemailer, redis, bcrypt, jsonwebtoken, better-sqlite3, sharp, resend, uuid

**CLI:** `nyx add stripe` — adds `use` statement to .nyx file + runs `npm install`.

### `respond` — Status Codes
```nyx
respond 201 { message "Created" }
respond 404 { error "Not found" }
```

### Backend Auto-Detection
No flags needed. If your file has `table`/`api`/`action`/`use`/`on`/`env`/`every` → backend generated.
If only `page`/`theme`/`component` → HTML only.


## Pipe — Declarative Logic Chains (v0.32.0)

The `pipe` keyword lets you build multi-step workflows in a single, readable block. Think Zapier/n8n — but in 10 lines of `.nyx` instead of 100 clicks.

### Basic Example
```nyx
pipe 'new-order' {
  on api POST /api/orders auth
  validate $body.email is email
  validate $body.total is number min=1
  query "INSERT INTO orders (user_id, total) VALUES ($req.user.id, $body.total)" as result
  set order_id = $result.lastInsertRowid
  notify email to=$body.email subject="Order #$order_id" body="Thanks!"
  log "Order $order_id created"
  respond 201 { id: $order_id, status: created }
}
```

### Triggers (`on`)
Every pipe starts with a trigger:
```nyx
on api POST /api/path [auth]    // HTTP request
on every 30s                     // Scheduled interval (5s minimum)
on webhook POST /hooks/name [secret=$WEBHOOK_SECRET]  // Incoming webhook
on event orders.created          // Table lifecycle event
```

### Steps Reference

| Step | Purpose | Example |
|------|---------|---------|
| `validate` | Input validation, aborts 400 on fail | `validate $body.email is email` |
| `query` | Parameterized SQL | `query "SELECT * FROM users WHERE id = $id" as rows` |
| `fetch` | HTTP request | `fetch $url timeout=5s method=POST as response` |
| `set` | Variable assignment | `set total = $body.price * $body.qty` |
| `transform` | Shape output data | `transform { id: $x, total: $y }` |
| `each` | Loop over rows/arrays | `each $items as item { ... }` |
| `when` | Conditional branch | `when $total > 100 { ... }` |
| `on change` | State transition detection | `on change $row.status { up -> down { ... } }` |
| `notify email` | Send email | `notify email to=$email subject="..." body="..."` |
| `notify sms` | Send SMS | `notify sms to="+49..." message="..."` |
| `notify webhook` | Outgoing webhook | `notify webhook to=$url body={ key: $val }` |
| `webhook` | Shorthand outgoing webhook | `webhook "https://..." body={ ... }` |
| `log` | Structured logging | `log "Order $id created"` |
| `respond` | HTTP response | `respond 201 { status: ok }` |
| `abort` | Stop with error | `abort 400 "Invalid input"` |
| `run pipe` | Call another pipe | `run pipe 'send-invoice' with { id: $order_id }` |

### Validation Types
```nyx
validate $body.email is email          // Email format
validate $body.url is url              // URL format
validate $body.age is number           // Must be numeric
validate $body.age is number min=18    // Minimum value
validate $body.name is string min=2    // Minimum length
validate $body.name is string max=100  // Maximum length
validate $body.items is array          // Must be array
validate $body.items is array min=1    // Non-empty array
```

### State Change Detection
```nyx
pipe 'uptime-monitor' {
  on every 30s
  query "SELECT id, url, name, status FROM monitors" as rows
  each $rows as row {
    fetch $row.url timeout=10s as check
    on change $row.status {
      up -> down {
        notify sms to="+49..." message="🚨 DOWN: $row.name"
      }
      down -> up {
        notify sms to="+49..." message="✅ UP: $row.name"
      }
    }
  }
}
```

State is tracked in `_pipe_state` table (auto-created). Only fires when value actually changes.

### Security
- All SQL queries use parameterized binding (`?` placeholders) — never string concatenation
- Webhook endpoints are rate-limited (60 req/min default)
- `secret=` on webhooks enables HMAC-SHA256 signature verification
- Compile-time warnings for: unvalidated user input in queries, missing `use nodemailer`/`use twilio`, SSRF risk on fetch with user-provided URLs

### Pipe-to-Pipe Calls
```nyx
pipe 'process-order' {
  on api POST /api/orders auth
  query "INSERT INTO orders ..." as result
  run pipe 'send-invoice' with { order_id: $result.lastInsertRowid }
  run pipe 'notify-warehouse' with { order_id: $result.lastInsertRowid }
  respond 201 { status: ok }
}

pipe 'send-invoice' {
  log "Sending invoice for order $order_id"
  notify email to="billing@shop.com" subject="Invoice" body="Order $order_id"
}
```

### Required Adapters
```nyx
use nodemailer    // Required for notify email
  SMTP_HOST default="smtp.gmail.com"
  SMTP_PORT default="587"
  SMTP_USER required
  SMTP_PASS required

use twilio        // Required for notify sms
  TWILIO_ACCOUNT_SID required
  TWILIO_AUTH_TOKEN required
  TWILIO_FROM required
```


## Page-Local Variables (v0.33.0)

### `let` — Reactive Variables

Inside `page` or `component` blocks, `let` creates reactive state. Changes auto-update the DOM.

```nyx
page '/counter' {
  let count = 0
  let name = "Nyx"
  let items = ["apple", "banana", "cherry"]

  h1 "Hello ${name}!"
  p "Count: ${count}"
  button "+" @click { count += 1 }
}
```

**Types:** Inferred from value — `number`, `string`, `boolean`, `array`, `object`.

**Reactivity:** Signal-based. Changing a `let` variable re-renders any DOM that references it.

**Scope:** Page/component local (not global like `store`).

### `const` — Compile-Time Constants

`const` values are inlined at build time. Zero runtime overhead.

```nyx
page '/' {
  const appName = "My App"
  const version = "2.0"

  h1 "${appName} v${version}"   // → <h1>My App v2.0</h1> (static!)
}
```

### `${}` Template Interpolation

Use `${varName}` in text content and strings. Also `{varName}` for backwards compat.

```nyx
let user = "Nyx"
const greeting = "Welcome"

h1 "${greeting}, ${user}!"    // const inlined, let reactive
p "Items: ${items.length}"     // expressions work too
```

**XSS Safety:** All interpolation uses `textContent` (never `innerHTML`).

### `let` vs `state` vs `store`

| | `let` | `state` | `store` |
|---|---|---|---|
| Scope | Page/component | Page/component | Global |
| Syntax | `let x = 0` | `state x = 0` | `store { x = 0 }` |
| Recommended | ✅ **Yes** | Legacy | Shared state |
| Token cost | ~70% less than React | Same as let | More boilerplate |

`let` is the recommended way. `state` still works but `let` is shorter.

---

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
| `of` | overflow | `ox` / `of-x` | overflow-x |
| `oy` / `of-y` | overflow-y | `v` | visibility |
| `br` | border-radius | `brad` | border-radius (alias) |
| `tr` | transition | `tf` | transform |
| `ar` | aspect-ratio | `cv` | content-visibility |
| `sb` | scroll-behavior | `osb` | overscroll-behavior |
| `tof` | text-overflow | `hy` | hyphens |
| `acc` | accent-color | `caret` | caret-color |
| `cs` | color-scheme | `bv` | backface-visibility |
| `ps` | perspective | `to` | transform-origin |
| `wm` | writing-mode | `dir` | direction |
| `ind` | text-indent | `smt` | scroll-margin-top |
| `mi` | mask-image | `trs` | transform-style |
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
| `bgc` | background-color | `bgclip` | background-clip |
| `bdf` / `bf` | backdrop-filter | | |
| `fi` / `fil` | filter | `mix` | mix-blend-mode |
| `tf` | transform | `tr` | transition |
| `anim` | animation |  |  |
| `si` | scroll-snap-type | `sa` | scroll-snap-align |

## Tailwind CSS Compatibility (v0.38.0) 🌀

**Write Tailwind classes directly in NyxCode `style={}` blocks.** They compile to native CSS at build time — no Tailwind runtime, no PostCSS, no config. Just the classes you know, compiled to optimal CSS.

```nyx
// Tailwind classes in style={}
div style={ flex, items-center, justify-between, p-4, bg-blue-500, text-white, rounded-lg, shadow-md } {
  h1 style={ text-2xl, font-bold } "Hello!"
  p style={ text-sm, opacity-50 } "Subtext"
}

// Grid layout
div style={ grid, grid-cols-3, gap-4, mt-8 } {
  div style={ bg-white, rounded-xl, shadow-lg, p-6 } "Card 1"
  div style={ bg-gray-100, rounded-xl, p-6, border, border-gray-200 } "Card 2"
  div style={ bg-slate-800, text-white, rounded-xl, p-6 } "Card 3"
}
```

Compiles to clean inline CSS:
```html
<div style="display:flex; align-items:center; justify-content:space-between; padding:1rem;
  background-color:#3b82f6; color:#fff; border-radius:0.5rem;
  box-shadow:0 4px 6px -1px rgb(0 0 0/0.1)">
```

### Supported Tailwind Classes

| Category | Classes |
|----------|--------|
| **Display** | `block`, `inline-block`, `flex`, `inline-flex`, `grid`, `inline-grid`, `hidden`, `contents` |
| **Flex** | `flex-row`, `flex-col`, `flex-wrap`, `flex-nowrap`, `flex-1`, `flex-auto`, `flex-none`, `grow`, `shrink` |
| **Alignment** | `items-start/center/end/baseline/stretch`, `justify-start/center/end/between/around/evenly`, `self-*` |
| **Spacing** | `p-{0-96}`, `px/py/pt/pr/pb/pl-*`, `m-{0-96}`, `mx/my/mt/mr/mb/ml-*`, `gap-*`, `gap-x/y-*` |
| **Sizing** | `w-full/screen/auto/fit`, `h-full/screen/auto`, `min-h-screen`, `max-w-sm/md/lg/xl/2xl-7xl/prose` |
| **Typography** | `text-xs/sm/base/lg/xl/2xl-5xl`, `text-left/center/right`, `font-thin..extrabold`, `italic`, `underline`, `uppercase` |
| **Colors** | `text-{color}-{shade}`, `bg-{color}-{shade}`, `border-{color}-{shade}` — slate, gray, red, blue, green, yellow, purple, pink, indigo, cyan, emerald, amber, rose, sky, orange |
| **Border** | `rounded`, `rounded-sm/md/lg/xl/2xl/3xl/full/none`, `border`, `border-0/2/4`, `border-solid/dashed/none` |
| **Shadow** | `shadow`, `shadow-sm/md/lg/xl/2xl/none` |
| **Position** | `static`, `fixed`, `absolute`, `relative`, `sticky`, `inset-0`, `top/right/bottom/left-0` |
| **Grid** | `grid-cols-{1-12}`, `col-span-{1-6}/full`, `place-items-center`, `place-content-center` |
| **Effects** | `opacity-{0/50/75/100}`, `transition`, `transition-all/colors/none`, `duration-{75-500}`, `ease-*` |
| **Z-Index** | `z-{0/10/20/30/40/50}` |
| **Misc** | `cursor-pointer/default/not-allowed`, `pointer-events-none/auto`, `select-none/all`, `overflow-hidden/auto/scroll`, `object-cover/contain` |

### Mix with NyxCode Shorthands

Tailwind classes and NyxCode shorthands coexist in the same `style={}` block:

```nyx
div style={ flex, items-center, bg red, fs 2rem, p-4, shadow-lg } "Mixed!"
// Tailwind: flex, items-center, p-4, shadow-lg
// NyxCode:  bg red, fs 2rem
```

### Why This Matters

- **For AIs**: Every AI already knows Tailwind. Now they can use that knowledge in NyxCode without learning new shorthands.
- **Zero runtime**: Tailwind classes compile to CSS at build time. No 300KB framework.
- **Cherry-pick**: Use Tailwind for layout (`flex, items-center, p-4`) and NyxCode for design (`bg theme.primary, shadow 0 2px 10px`).

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
preset card { bg #1a1a2e; r 12px; p 2rem; shadow 0 4px 12px rgba(0,0,0,0.2) }
preset label { fs 0.7rem; fw 700; tt uppercase; ls 0.05em; c #888 }

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

### Body Styles (v0.25.0)

Native body-level styles in the theme block. No more head injection for body styling.

```nyx
theme {
  colors { primary: #667eea }
  body {
    bg #0a0a12
    c #f0eaff
    of-x hidden
    font-family "Inter", sans-serif
    -webkit-font-smoothing antialiased
  }
}
```

- All CSS shorthands work (`bg`, `c`, `of-x`, `m`, `p`, etc.)
- Vendor prefixes (`-webkit-*`) supported
- Font-family with commas preserved correctly
- Theme color refs resolve (`c .colors.primary` → `var(--colors-primary)`)
- Emitted after `:root` variables, before page styles

### Element Defaults (v0.25.0)

Global element default styles via `:where()` — zero specificity, local styles always override.

```nyx
theme {
  defaults {
    a { c #9b8ec4; td none }
    pre { font-family "JetBrains Mono", monospace }
    code { font-family "JetBrains Mono", monospace }
    img { max-w 100%; h auto }
    h1 { m 0 }
  }
}
```

Emits: `:where(a) { color: #9b8ec4; text-decoration: none; }` etc.

Because `:where()` has zero specificity, any local `style {}` on an element will override defaults without `!important`.

### Selection Styles (v0.25.0)

Native `::selection` styles in the theme block.

```nyx
theme {
  selection {
    bg rgba(155,142,196,0.3)
    c #f0eaff
  }
}
```

Emits: `::selection { background: rgba(155, 142, 196, 0.3); color: #f0eaff; }`

## Top-Level Keyframes (v0.25.0)

Define animations at the top level — no head injection, no wrapping in style blocks.

```nyx
keyframes drift {
  0%, 100% { tf translate(0, 0) }
  50% { tf translate(-2%, 1.5%) }
}

keyframes fadeIn {
  from { op 0 }
  to { op 1 }
}

page / {
  div { style { anim drift 30s ease-in-out infinite } }
  div { style { anim fadeIn 0.5s ease-out } }
}
```

- All shorthands work inside keyframe stops (`tf`, `op`, `bg`, `c`, etc.)
- `from`/`to` and percentage selectors (`0%`, `50%`, `100%`)
- Multiple selectors per stop (`0%, 100% { ... }`)
- Duplicate keyframe names → compile error
- Emitted after theme variables, before page styles
- Also available inside `style {}` blocks as `@keyframes` (v0.18.1 syntax still works)

## Responsive Burger Nav (v0.24.0)

One attribute → full mobile-responsive collapsible nav. Zero JavaScript.

```nyx
nav burger {
  a "Home"    href="/"
  a "About"   href="/about"
  a "Contact" href="/contact"
}
```

Compiles to a native HTML5 `<details>`/`<summary>` pair with responsive CSS that hides the summary on desktop and shows it as a toggle button on mobile. No click-handler JS, no runtime dependency — the browser handles open/close natively (including keyboard and screen-reader support).

### Options

| Attribute                   | Default            | Description                                            |
|-----------------------------|--------------------|--------------------------------------------------------|
| `burger`                    | `768px` breakpoint | Bare flag enables the collapsible behavior.            |
| `burger=<breakpoint>`       | —                  | Use a theme breakpoint token (`sm`, `md`, `lg`, etc.). |
| `icon="..."`                | `Menu`             | Closed-state label. Accepts text or glyphs.            |
| `open-label="..."`          | `Close`            | Open-state label.                                      |
| `aria-label="..."`          | `Main navigation`  | `aria-label` on the inner `<nav>`.                     |
| `summary-aria-label="..."`  | `Toggle menu`      | `aria-label` on the `<summary>` toggle.                |
| `brand="..."`               | —                  | Site name displayed as text logo (left side).          |
| `logo="..."`                | —                  | Image path for logo (left side, replaces text brand).  |
| `logo-height="..."`         | `32px`             | Custom logo image height.                              |

### Examples

```nyx
# Default: collapses below 768px, text "Menu"
nav burger { a "Home" href="/", a "About" href="/about" }

# Custom breakpoint via theme token
theme { breakpoints { sm: 480px, md: 768px, lg: 1024px } }
nav burger=lg { a "Home" href="/", a "Products" href="/products" }

# Custom icon + labels
nav burger icon="☰" open-label="Hide menu" aria-label="Site nav" {
  a "Home" href="/"
  a "Docs" href="/docs"
}

# Brand text logo (v0.27.1)
nav burger brand="MySite" {
  a "Home" href="/", a "About" href="/about"
}

# Image logo (v0.27.1)
nav burger logo="/img/logo.png" {
  a "Home" href="/", a "Docs" href="/docs"
}

# Image + text brand (v0.27.1)
nav burger logo="/img/logo.png" brand="MySite" logo-height="40px" {
  a "Home" href="/", a "About" href="/about"
}
```

### Dual-Container Architecture (v0.24.4)

The compiler generates **two containers** — one for desktop, one for mobile:

```html
<!-- Desktop: plain div, always visible -->
<div class="nx-burger-desktop">
  <a href="/">Home</a>
  <a href="/about">About</a>
</div>

<!-- Mobile: details/summary toggle -->
<details class="nx-burger nx-burger-mobile nx-burger-bp-768">
  <summary aria-label="Toggle menu">
    <span class="nx-burger-closed">Menu</span>
    <span class="nx-burger-open" aria-hidden="true">Close</span>
  </summary>
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
    <a href="/about">About</a>
  </nav>
</details>
```

**Why two containers?** `<details>` without `open` hides children via browser UA behavior — no CSS can override this. On desktop you don't need a toggle, so links live in a plain `<div>`. On mobile, `<details>`/`<summary>` provides zero-JS toggling with native accessibility.

CSS handles visibility: `.nx-burger-desktop` is `display:flex` by default, `.nx-burger-mobile` is `display:none`. Below the breakpoint, they swap.

`aria-label="Toggle menu"` stays state-neutral; sighted users see `Menu` when closed and `Close` when open. Screen-reader users receive the same transition via native `<details>` a11y. No JavaScript is needed to keep the label honest.

### Styling the open state

Native CSS `details[open]` is exposed, so you can add a hamburger-to-X animation purely in your theme:

```nyx
nav burger {
  style {
    &[open] summary { color: primary }
  }
  a "Home" href="/"
}
```

### Known limits

- **No Escape-to-close.** `<details>` does not close on <kbd>Esc</kbd> natively. This is a deliberate trade-off to keep the zero-JS promise. If you need Esc-close, wrap the element yourself.
- **Body-scroll-lock (v0.24.1).** When the burger is open on mobile, `html` and `body` get `overflow:hidden` + `overscroll-behavior:contain` via a `body:has(.nx-burger[open])` rule — CSS-only, no JavaScript. This prevents iOS Safari rubber-band scrolling. Only active inside the mobile `@media` query.
- **`icon=` is a compile-time constant** — never bind it to user input. The parser enforces this by accepting string literals only.

## Figma / W3C DTCG Token Import (v0.23.5)

Import design tokens exported from **Tokens Studio for Figma** or any **W3C Design Tokens Community Group (DTCG)** compliant tool directly into a NyxCode `@theme { ... }` block — no Style Dictionary, no build step, no config.

### Command

```bash
nyx theme import tokens.json                  # print @theme block to stdout
nyx theme import tokens.json -o theme.nyx     # write to file
nyx theme import tokens.json --name brand     # theme as "brand" { ... }
```

### Supported `$type` → section mapping

| Figma / DTCG `$type`        | NyxCode section |
|-----------------------------|-----------------|
| `color`                     | `colors`        |
| `dimension` / `spacing`     | `spacing`       |
| `borderRadius`              | `radius`        |
| `fontFamily` / `typography` | `fonts`         |
| `shadow` / `boxShadow`      | `shadows`       |

### Format compatibility

- **W3C DTCG** (`$value`, `$type`) — primary, default.
- **Tokens Studio legacy** (`value`, `type`) — supported transparently.
- **Nested groups** — flattened with dash-joined keys: `color.brand.primary` → `brand-primary`.
- **`global` wrapper** — auto-unwrapped when a single non-section top-level key exists.
- **fontFamily arrays** — joined as comma-separated stacks; multi-word families auto-quoted.
- **Composite shadow objects** `{offsetX, offsetY, blur, spread, color}` — collapsed to CSS shorthand (spread=0 omitted per CSS convention).
- **Radius heuristic** — `$type: dimension` with `radius` in the group path routes to `radius` instead of `spacing`.

### Example

Input (`figma-tokens.json` from Tokens Studio):

```json
{
  "global": {
    "color": {
      "brand": {
        "primary":   { "$value": "#8b5cf6", "$type": "color" },
        "secondary": { "$value": "#ec4899", "$type": "color" }
      }
    },
    "spacing": {
      "md": { "$value": "16px", "$type": "dimension" }
    },
    "borderRadius": {
      "lg": { "$value": "12px", "$type": "borderRadius" }
    },
    "fontFamily": {
      "body": { "$value": ["Inter", "system-ui", "sans-serif"], "$type": "fontFamily" }
    },
    "shadow": {
      "card": {
        "$value": { "offsetX": 0, "offsetY": 4, "blur": 12, "color": "rgba(0,0,0,0.1)" },
        "$type": "shadow"
      }
    }
  }
}
```

Command:

```bash
$ nyx theme import figma-tokens.json -o theme.nyx
✅ Imported 5 tokens (2 colors, 1 spacing, 1 radius, 1 fonts, 1 shadows) → theme.nyx
```

Output (`theme.nyx`):

```nyx
theme {
  colors {
    brand-primary: #8b5cf6
    brand-secondary: #ec4899
  }
  spacing { md: 16px }
  radius  { lg: 12px }
  fonts   { body: Inter, system-ui, sans-serif }
  shadows { card: 0 4px 12px rgba(0,0,0,0.1) }
}
```

Use immediately in any page:

```nyx
use "./theme.nyx"
page / {
  div style="background:color.brand-primary;padding:spacing.md;border-radius:radius.lg;box-shadow:shadows.card" {
    h1 "Imported from Figma"
  }
}
```

### Not yet supported

- Reverse export (`@theme` → Figma JSON) — planned for v0.24+.
- DTCG alias resolution (`{color.primary}` references) — planned for v0.24+.
- Figma **Modes** → `theme dark { }` — planned for v0.24+.
- Composite typography tokens (size / weight / lineHeight) — `fontFamily` is extracted today; other typography fields are dropped.
- Figma plugin (push-button sync from inside Figma) — out of scope for the CLI.

### Security note

Figma JSON is **third-party input**. Since v0.24.1, the importer validates every token value against per-type allowlists before emitting it:

| Token type | Allowed patterns | Rejected examples |
|------------|-----------------|-------------------|
| Color | hex, `rgb()`, `hsl()`, CSS named colors | `javascript:`, `url()`, `expression()` |
| Spacing/Radius | `<number><unit>` (px, rem, em, %, vw, vh…) | `calc()`, `url()`, `expression()` |
| Font-family | Alphanumeric + spaces + hyphens + quotes | `url()`, backslashes, angle brackets |
| Shadow | Structured: offsets + blur + spread + color | Free-form strings, `javascript:` |
| Border | `<width> <style> <color>` | Anything with `url()` or script vectors |

Invalid tokens are **skipped with a warning** — they never reach the output. A belt-and-suspenders `hasDangerousSubstring()` guard rejects `javascript:`, `data:`, `expression(`, `@import`, control chars etc. before per-type validation even runs.

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

> **v0.25.0:** Prefer top-level `keyframes name { }` syntax (see above). Style-block `@keyframes` still works but top-level is cleaner.

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

### Events (v0.12.0+, @event shorthand v0.33.3)

**Recommended: `@event` shorthand (v0.33.3+):**
```nyx
button "+" @click { count += 1 }
button "-" @click { count -= 1 }
button "Set" @click { msg = "hello" }
```

**Legacy syntax (still works):**
```nyx
button "Click" on:click -> count = count + 1
button "Reset" on:click -> count = 0
```

**Three equivalent syntaxes:**
| Syntax | Example |
|---|---|
| `@event { }` | `@click { count += 1 }` ✅ recommended |
| `on:event ->` | `on:click -> count = count + 1` |
| `on event ->` | `on click -> count = count + 1` |

**Modifiers:**
```nyx
button "Submit" @click.prevent { save() }
input @keydown.enter { submit() }
input @keydown.ctrl.s { save() }
button @click.stop { handle() }
```

| Modifier | Effect |
|---|---|
| `.prevent` | `event.preventDefault()` |
| `.stop` | `event.stopPropagation()` |
| `.enter` | Only on Enter key |
| `.escape` | Only on Escape key |
| `.ctrl`, `.alt`, `.shift`, `.meta` | Modifier keys |
| `.ctrl.z` | Combo: Ctrl+Z |

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

## Icons (v0.31.0)

Native icon pack support. Declare once in theme, use everywhere.

### Theme Declaration
```nyx
theme {
  icons: lucide           # Lucide Icons (default, 1400+ icons)
  # icons: phosphor       # Phosphor Icons
  # icons: tabler         # Tabler Icons
  # icons: lucide cdn     # CDN mode (default is local/pinned)
}
```

Supported packs:
| Pack | Prefix | Version |
|------|--------|---------|
| `lucide` | `icon-` | 0.460.0 |
| `phosphor` | `ph ph-` | 2.1.1 |
| `tabler` | `ti ti-` | 3.31.0 |

All versions pinned for supply-chain safety.

### Standalone Icon Element
```nyx
icon "heart"                              # basic
icon "stethoscope" size=32                # with size (px)
icon "map-pin" size=24 style={ c red }    # with inline styles
icon "settings" style={ c #2a7d5f; fs 2rem }
```
Compiles to: `<i class="icon-heart" aria-hidden="true"></i>`

### Inline Icons in Text
```nyx
h1 "icon:heart Welcome"
p "Visit us at icon:map-pin our location"
p "icon:star Rated icon:thumbs-up Approved"   # multiple per line
```
Compiles to: `<h1><i class="icon-heart" aria-hidden="true"></i> Welcome</h1>`

**Note:** Inline `icon:name` syntax requires `theme { icons: ... }`. Without it, standalone `icon` elements still work with default `icon-` prefix.

## Head Injection

> **v0.25.0:** Most head injection use cases are now covered natively:
> - Body styles → `theme { body { } }`
> - Keyframes → top-level `keyframes name { }`
> - Selection → `theme { selection { } }`
> - Element resets → `theme { defaults { } }`
>
> Use `head` only for third-party CDNs and edge cases.

```nyx
page / {
  head "<link rel='stylesheet' href='https://cdn.example.com/lib.css'>"
  head "<script src='https://cdn.example.com/lib.js' defer></script>"
  h1 "Page with third-party libs"
}
```
- Raw HTML string injected into `<head>`.
- Use for third-party CDNs, custom meta tags, complex CSS that needs `{}` in strings.
- If `head` contains `<title>`, compiler skips auto-generated title.

### Meta Precedence (v0.24.2)
Page-level `meta {}` keys **override** site-level keys of the same name:
```nyx
meta { title "My Site", description "Site desc" }  # site-level
page /about {
  meta { title "About Us" }  # overrides site title, keeps site description
  h1 "About"
}
```
Only one `<title>` emitted. Applies to title, description, og:*, twitter:*, canonical.

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

### Database Location (v0.31.4)

By default, `app.db` lives **outside** the build directory so it survives rebuilds:

```
project/
├── site.nyx
├── .nyx-data/        ← auto-created, persistent
│   └── app.db
└── dist-site/        ← rebuilt freely, no data here
    ├── index.html
    └── server.js
```

**Override with env var:**
```bash
DATABASE_PATH=/var/data/myapp.db node server.js
```

Resolution order: `DATABASE_PATH` → `DB_PATH` → `../.nyx-data/app.db`

**Docker:** Mount `.nyx-data/` as a volume. Build dir is disposable.

### Auto-Migrations (v0.31.0)

When you add new columns to a table, the server automatically migrates the database at startup. No manual migration commands needed.

```nyx
# v1: original schema
table posts { title text required, body text }

# v2: add two columns — just edit and rebuild!
table posts { title text required, body text, category text default="general", views number }
```

**How it works:**
1. At startup, compares `.nyx` schema with existing DB via `PRAGMA table_info()`
2. New columns → `ALTER TABLE ADD COLUMN` with correct type + defaults
3. UNIQUE columns → adds a separate `CREATE UNIQUE INDEX` (SQLite limitation)
4. All changes logged in `_migrations` table with timestamps
5. Existing data is preserved — zero data loss
6. Idempotent — multiple restarts only apply changes once

**Limitations (SQLite):**
- Cannot drop columns (data safety)
- Cannot change column types
- Cannot add `NOT NULL` without a `DEFAULT` to tables with existing data

### Pagination, Search & Filtering (v0.27.3+)

All GET-all endpoints (`GET /api/tablename`) support:

```
GET /api/posts                        → plain array (backwards compatible)
GET /api/posts?page=1&limit=20        → { data: [...], pagination: { page, limit, total, pages } }
GET /api/posts?search=hello            → LIKE search across all text/email columns
GET /api/posts?status=published        → WHERE status = 'published' (column-validated)
GET /api/posts?search=foo&status=active&page=2  → all compose together
```

- **Pagination** is opt-in: without `?page` or `?limit`, returns plain array
- **Limit** clamped between 1 and 100
- **Filtering** only accepts valid column names (prevents SQL injection)
- **Search** does case-insensitive LIKE across all `text` and `email` columns

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

### Background Workers — `every` (v0.27.3+)

Recurring background tasks. Compiles to `setInterval()` with error isolation and graceful shutdown.

```nyx
every 30s 'health-check' {
  query "SELECT * FROM monitors WHERE status != 'paused'"
}

every 1h 'cleanup' {
  query "DELETE FROM logs WHERE created_at < datetime('now', '-7 days')"
}
```

- **Interval formats:** `30s`, `5m`, `1h`, `1d` (CSS-like durations)
- **5s minimum** — compiler error below (prevents accidental server overload)
- **Optional label** — `every 30s 'name' { }` for named workers
- **Error isolation** — each tick wrapped in try/catch, failures logged but worker continues
- **Graceful shutdown** — `clearInterval` on SIGTERM/SIGINT
- **No request context** — `$req` not available (workers run independently)
- **`$row` loops** — multi-statement blocks auto-loop when first query is SELECT:
  ```nyx
  every 60s 'check' {
    query "SELECT id, url FROM monitors"
    query "UPDATE monitors SET last_check = datetime('now') WHERE id = $row.id"
  }
  ```
  `$row.field` compiles to parameterized `?` bindings (SQL injection safe)
- **Zero dependencies** — pure `setInterval`, no Bull/Redis/cron

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
- `respond 200 { key: "value", active: true }` — JSON response with colon syntax, unquoted booleans/numbers.
- `respond 200 $variable` — forward a variable directly as JSON response.
- `auth` → requires JWT token (uses `authMiddleware`).
- Path params (`:id`) auto-map to `req.params`. Body params to `req.body`.
- Smart return: aggregates (`COUNT`/`SUM`) → single object. `LIMIT 1` → single. Else → array.

### Fetch & Stream in API Blocks (v0.36.0+)

```nyx
api POST /api/chat {
  stream fetch "https://api.openai.com/v1/chat/completions" {
    method POST
    headers { Authorization: $env.OPENAI_KEY }
    body $body
  }
}

api POST /api/ask {
  fetch "https://api.example.com" {
    method POST
    headers { Authorization: $env.API_KEY }
    body $body
  }
  respond 200 $fetchResult
}
```
- `fetch "url" { method, headers, body }` — non-streaming HTTP, result in `$fetchResult`
- `let x = fetch "url" { ... }` — fetch result assigned to variable `x`
- `let x = file "path"` — read file at runtime into variable `x`
- `stream fetch "url" { ... }` — SSE proxy, streams response back to client
- `file "path"` — read file at runtime into `__file_content`
- `$body` → `req.body`, `$env.X` → `process.env.X` in api context
- Handlers auto-`async` when `fetch`/`stream fetch` present

### Multi-Query API Blocks (v0.30.0+)

POST/PUT/DELETE API blocks can contain multiple `query` statements. All execute sequentially; only the last query's result is returned.

```nyx
api POST /api/monitors/delete auth {
  query "DELETE FROM checks WHERE monitor_id = $id"
  query "DELETE FROM alerts WHERE monitor_id = $id"
  query "DELETE FROM monitors WHERE id = $id AND user_id = $req.user.id"
}
```

Use case: cascade deletes, multi-step mutations, cleanup operations.

### Forms Inside `each` Loops (v0.30.0+)

Forms nested inside `each` templates compile to inline `<button onclick="fetch(...)">` elements.

```nyx
each alerts -> alert {
  div flex=row between center {
    span .target
    form "/api/alerts/delete" auth {
      input id hidden value=.id
      submit "✕" preset=btn-delete
      success -> reload
    }
  }
}
```

- Hidden input values with `.field` resolve at render time (baked into HTML)
- `auth` → includes JWT Bearer token from localStorage
- `success -> reload` / `success -> redirect /path` supported
- Confirm dialog auto-added for safety

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

### Field References in Templates (v0.27.3+)

Inside `each` templates, `.field` resolves in **all** contexts:

```nyx
each users -> user {
  # Text content
  h1 .name
  p .email

  # ALL attributes — not just href!
  img src=.avatar alt=.name
  a href="/profile/.id" title=.name
  div data-role=.role class=.status
  span data-value=.score .score
}
```

**Rules:**
- `.field` as entire value: `src=.avatar` → `src="${item.avatar}"`
- `.field` mixed with static text: `href="/users/.id"` → `href="/users/${item.id}"`
- Nested fields: `.author.name` → `${item.author?.name}` (optional chaining)
- `style` attribute: `.field` works but CSS decimals (`.5rem`) are preserved
- JS property chains (e.g. `this.dataset.aid`) are NOT resolved (word-char lookbehind)

### Page Authentication (v0.27.3+)

```nyx
page /dashboard auth {
  # This page requires login — auto-redirects to /login if no JWT token
  h1 "My Dashboard"
}
```

The `auth` keyword after the page path generates a client-side guard:
- Checks `localStorage.getItem("token")`
- Redirects to `/login` if missing
- No JavaScript needed in .nyx source

### Conditional Visibility (v0.27.3+)

```nyx
nav {
  a "Login" href="/login" visible=guest       # Only shown when NOT logged in
  a "Dashboard" href="/dashboard" visible=auth # Only shown when logged in
  a "Logout" href="#" visible=auth onclick="localStorage.removeItem('token');location.href='/login'"
}
```

- `visible=auth` → element hidden by default, shown when JWT token exists
- `visible=guest` → element shown by default, hidden when JWT token exists
- Auto-injects toggle script only when feature is used
- Works on any element (nav links, buttons, sections, etc.)

### URL Parameters in Data Sources (v0.27.3+)

```nyx
page /detail auth {
  data item = get "/api/items/$param.id" auth {
    loading -> p "Loading..."
  }
  each item -> i {
    h1 .name
    p .description
  }
}
```

- `$param.id` extracts `?id=X` from the URL query string
- Auto-generates guard: redirects to `/dashboard` if parameter is missing
- Use quoted string syntax for URLs with `$param`: `get "/api/path/$param.id"`
- Works with multiple params: `$param.id`, `$param.slug`, etc.

### Single-Object API Responses (v0.27.3+)

When a `data` source returns a single object (not an array), it's automatically
wrapped in an array. This means `each` works for both list and detail pages:

```nyx
# List page — API returns array
data users = get /api/users
each users -> user { p .name }

# Detail page — API returns single object, auto-wrapped in [object]
data user = get "/api/users/$param.id" auth
each user -> u { h1 .name, p .email }
```

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

## Auto-prefix mask-* (v0.26.0)
All `mask-*` CSS properties auto-emit `-webkit-` prefixed versions for Safari:
```nyx
div {
  style {
    mask-image radial-gradient(ellipse at center, black 0%, transparent 75%)
    mask-size cover
  }
}
```
Emits both `-webkit-mask-image` and `mask-image`. Shorthands: `mi`/`mimg` → `mask-image`.

## Compile-time Conditionals (v0.26.0)
Strip or include content at build time:
```nyx
when __env__ == "production" {
  script src="analytics.js"
}
when __debug__ {
  div { p "Debug mode" }
}
```
CLI: `nyx build app.nyx --define env=production --define debug=true`
- `__double_underscore__` refs = compile-time (stripped if falsy)
- `.dot` refs = runtime (generates JS, unchanged)
- Supports `==`, `!=`, `&&`, `||`, bare truthy

## Native picture/source (v0.26.0)
Responsive images with native HTML5 `<picture>`:
```nyx
picture {
  source srcset="hero.avif" type="image/avif"
  source srcset="hero.webp" type="image/webp"
  img src="hero.jpg" alt="Hero"
}
```
`source` is void (self-closing). Supports `media` attribute for art direction.

## New CSS Shorthands (v0.26.0)
| Short | CSS Property | Example |
|-------|-------------|----------|
| `cv` | content-visibility | `cv auto` |
| `sb` | scroll-behavior | `sb smooth` |
| `ar` | aspect-ratio | `ar 16/9` |
| `tof` | text-overflow | `tof ellipsis` |
| `acc` | accent-color | `acc #ff0` |
| `caret` | caret-color | `caret red` |
| `cs` | color-scheme | `cs dark` |
| `hy` | hyphens | `hy auto` |
| `bv` | backface-visibility | `bv hidden` |
| `ps` | perspective | `ps 1000px` |
| `to` | transform-origin | `to center top` |
| `wm` | writing-mode | `wm vertical-rl` |
| `dir` | direction | `dir rtl` |
| `ind` | text-indent | `ind 2rem` |
| `osb` | overscroll-behavior | `osb contain` |
| `smt` | scroll-margin-top | `smt 80px` |
| `trs` | transform-style | `trs preserve-3d` |
| `pso` | perspective-origin | `pso center` |
| `mi` | mask-image | `mi url(mask.svg)` |

## Partials (v0.26.0)
Components without props ARE partials — no new keyword needed:
```nyx
component social-links() {
  a "Twitter" href="https://x.com"
  a "GitHub" href="https://github.com"
}
page / { footer { use social-links() } }
```

## Version
v0.30.0 — The Language Release. DSL → Programming Language.
Backend primitives: let, action, on, env, email, use, respond.
Designed by the Rudel: Nyx 🧠, Tyto 🦉, Kiro 🐺, Fabian 🐻 (RFC #132).
Security audit pending for release. Dogfooded on NyxStatus.com.

## v0.34.0 — Functions, Pattern Matching, Types, Tests

### `fn` — User-Defined Functions
```nyx
fn double(x) = x * 2                    # short form

fn shipping(weight, country = "DE") {    # block form with defaults
  match country {
    "DE" -> weight * 4.99
    "US" -> weight * 12.99
    _ -> weight * 19.99
  }
}
```
**Rules:** No `$` prefix inside fn. Bare param names. Default params supported.

### `match` — Pattern Matching
```nyx
match status {
  "active" -> "Running"
  "paused" -> { set msg = "Hold"; return msg }
  _ -> "Unknown"
}
```
Use `match` for value matching, `when` for boolean checks.

### `when`/`else` in fn
```nyx
when x > 10 { return "big" } else { return "small" }
```

### `try`/`catch` + `throw`
```nyx
try { risky() } catch e { return "error: " + e }
throw "Something went wrong"
```

### `each` in fn
```nyx
each items -> item { set sum = sum + item }
```

### `type` — Data Shapes
```nyx
type User { name: string, email: email, age?: number }
```
Compiles to `validateUser(obj)` runtime validator.

### `test` — Built-in Tests
```nyx
test "math works" { assertEq 1 + 1, 2; assert true }
```
Keywords: `assert`, `assertEq`, `assertThrows`.

## v0.35.0 — SSE Streaming

### `stream fetch` — Server-Sent Events in Pipes
```nyx
pipe 'chat' {
  on api POST /api/chat auth
  stream fetch "https://api.openai.com/v1/chat/completions" {
    method POST
    headers { Authorization: $env.OPENAI_KEY }
    body $body
  }
}
```
**Backend:** Generates SSE response (`text/event-stream`), proxies chunked upstream responses.
**Frontend:** `__nyx_sse(url, body, onChunk, onDone)` helper auto-injected when used.
**~60% fewer tokens** than equivalent Express.js SSE code.

### Frontend SSE Consumer
```js
// Auto-injected by NyxCode when stream is used:
__nyx_sse('/api/chat', { message: input }, (chunk) => {
  messages += chunk;  // reactive update
}, () => {
  console.log('done');
});
```

## v0.36.0 — Custom Logic in API Blocks

### `fetch` in API Blocks — Non-Streaming HTTP Requests
```nyx
api POST /api/ask {
  fetch "https://api.openai.com/v1/chat/completions" {
    method POST
    headers { Authorization: $env.OPENAI_KEY }
    body $body
  }
  respond 200 $fetchResult
}
```
**`$body`** = `req.body`, **`$env.X`** = `process.env.X`, **`$fetchResult`** = parsed JSON response.

### `stream fetch` in API Blocks — SSE Proxy
```nyx
api POST /api/chat {
  stream fetch "https://api.openai.com/v1/chat/completions" {
    method POST
    headers { Authorization: $env.OPENAI_KEY }
    body $body
  }
}
```
Same as pipe `stream fetch`, but directly in `api` blocks. No `pipe` wrapper needed.

### `file` — Read Files at Runtime
```nyx
api POST /api/chat {
  file "./SYSTEM_PROMPT.md"
  fetch "https://api.example.com" {
    method POST
    body $body
  }
  respond 200 $fetchResult
}
```
Reads file contents into `__file_content` variable at request time.

### Why This Matters
Before v0.36.0, any API orchestration (AI chat, payment webhooks, third-party integrations) required a separate `.js` file. Now it's 100% NyxCode — one `.nyx` file = complete app.

## v0.37.0 — Full Expressiveness Engine

NyxCode can now build **anything** for the web. Complete expression engine overhaul.

### Arithmetic: `+` `-` `*` `/` `%`
```nyx
when .count + 1 > 0 { div "has items" }
when .price * .qty > 100 { span "expensive" }
```
Precedence: `*`/`/`/`%` → `+`/`-` → comparisons → `and`/`or`.

### Logic: `and` `or` `not`
```nyx
when .active and .visible { div "shown" }
when .admin or .editor { nav "Dashboard" }
when not .hidden { section "Content" }
```

### Member Access & Method Calls
```nyx
when user.profile.name == "Nyx" { ... }
when items[0].price > 50 { ... }
when items.includes("hello") { ... }
```

### Pipe Built-ins (30+)
```nyx
items | len | filter price > 10 | map name | sort price desc
name | uppercase | trim | split "," | join " "
price | round 2
obj | keys
items | first | last | reverse | unique | take 5 | skip 10
```

### Ternary, Booleans, Arrays
```nyx
condition ? "yes" : "no"
.active == true
[1, 2, 3] | len
```


## v0.39.0 — Full Programming Language

### Arrays & Objects (#189)
```nyx
let colors = ["red", "green", "blue"]
let config = { theme: "dark", lang: "en" }
```

### Mutable Variables — `set` (#184)
```nyx
let count = 0
button "+" on:click { set count = count + 1 }
```

### Array Mutations — `push`, `pop`, `shift` (#184)
```nyx
let items = []
button "Add" on:click { push items "new item" }
button "Remove" on:click { pop items }
```

### Loops — `while` and `for` (#183)
```nyx
while count < 10 { set count = count + 1 }
for i in 0..5 { span "{i}" }
for i in 0..100 step 10 { span "{i}" }
```
Frontend: `for` loops statically unroll. `while` has 10k iteration guard.

### Client-Side Reactivity (#185)
```nyx
page / {
  let count = 0
  button "+" on:click { set count = count + 1 }
  p "Count: {count}"
  input value=".name"
  p "Hello, {name}!"
}
```

### Component Events — `emit` (#192)
```nyx
component Counter {
  let count = 0
  button "+" on:click { emit change count }
}
```

### WebSocket (#187)
```nyx
socket /ws { on message -> data { respond "Echo: {data}" } }
```

### HTTP Client — `fetch` in API (#190)
```nyx
api /weather {
  fn getWeather(city) {
    fetch GET "https://api.weather.com/{city}" -> result
    respond result
  }
}
```

### SPA Routing (#188)
```nyx
page / { h1 "Home" }
page /about { h1 "About" }
```

### Route Handlers (#191)
```nyx
route /api/custom {
  fn GET(req) { respond { status: "ok" } }
  fn POST(req) { respond { created: true } }
}
```

## v0.40.0 — NyxForms Feature Set (Frontend Complete)

### Client-Side Conditionals — `when` in pages (#202)
```nyx
page / {
  let showForm = false
  button "Show" on:click { set showForm = true }
  when .showForm {
    div "Form visible!"
  } else {
    p "Click button to show"
  }
}
```

### Dynamic Data Fetching (#198)
```nyx
page /dashboard auth {
  data forms = fetch GET /api/forms auth {
    loading -> p "Loading..."
    error -> p "Failed"
    empty -> p "No forms yet"
  }
  each forms -> form { card { h3 "{form.title}" } }
}
```

### Dynamic Lists (#199)
```nyx
let todos = ["Buy milk"]
button "Add" on:click { push todos "New" }
each todos -> todo { div "{todo}" }
```

### Auth-Protected Routes (#197)
```nyx
page / { h1 "Public" }
page /dashboard auth { h1 "Protected" }
page /login { h1 "Login" }
```

### Multi-Step Wizard (#200)
```nyx
wizard {
  step { h2 "Name", input value=".name" }
  step { h2 "Email", input type="email" value=".email" }
  step { h2 "Done!", p "Thanks!" }
}
```
Features: progress bar, slide animations, Enter to advance, back/next, auto-focus.

### Rich Inputs (#201)
```nyx
rating max=5 value=".score"
toggle value=".darkMode" "Dark Mode"
choice options="TypeScript,Python,Rust,Go" value=".answer"
```

### Event Handlers — `on:click`
```nyx
button "Click" on:click { set count = count + 1 }
button "Add" on:click { push items "new" }
button "Remove" on:click { pop items }
button "Fire" on:click { emit change data }
```

## v0.50.0 — Component System v2 + Reactive Runtime + StdLib

### Reactive State (Signals)

Page-level `let` declarations are now **reactive signals** (SolidJS-style fine-grained reactivity):

```nyx
page / {
  let count = 0

  button on:click { set count = count + 1 } "Clicked: {count}"
}
```

- `let` in `page {}` = reactive signal (auto-updates DOM on change)
- `let` in handlers = local variable (not reactive)
- `const` = always static (never reactive)
- `data` in components = reactive state scoped to component instance

### Multi-Statement Event Handlers

Handlers now support multiple statements, conditionals, and complex logic:

```nyx
page / {
  let items = []
  let input = ""

  input bind="input" placeholder="Add item"
  button on:click {
    push items input
    set input = ""
    call #input.focus()
  } "Add"

  each items -> item {
    li {
      span "{item}"
      button on:click { remove items item } "x"
    }
  }
}
```

**Handler statements:** `set`, `push`, `pop`, `shift`, `remove`, `call`, `fetch`, `navigate`, `emit`

### Typed Props (Component System v2)

Components now support type annotations and default values:

```nyx
component Counter(label: string, count: number = 0, active: boolean = true) {
  div "{label}: {count}"
}

page / {
  Counter label="Clicks" count="5"
  Counter label="Score"  // count defaults to 0
}
```

**Supported types:** `string`, `number`, `boolean`, `array`, `object`
**Runtime coercion:** `number` props auto-converted via Number(), `boolean` via truthy/falsy

### Named Slots

Components can define multiple slot insertion points:

```nyx
component Card {
  header { slot name="header" }
  main { slot }
  footer { slot name="footer" }
}

page / {
  Card {
    div slot="header" "My Title"
    p "Main content goes here"
    div slot="footer" "Footer info"
  }
}
```

**Slot default content:** If no children match a named slot, the slot's own children render as fallback.

### Event Forwarding (emit)

```nyx
component Button(label: string) {
  button on:click { emit click } "{label}"
}
```

### Single-Brace Prop Interpolation

Inside component bodies, `{propName}` resolves to the prop value at compile time:

```nyx
component Badge(text: string, color: string = "blue") {
  span class="badge-{color}" "{text}"
}
```

### Standard Library

```nyx
use "stdlib"           // loads all: Toggle, Rating, Choice, Wizard, BurgerNav
use "stdlib/toggle"    // loads only Toggle
```

**Available:** Toggle, Rating, Choice, Wizard, BurgerNav

### Line Comments

```nyx
// This is a comment (only at line start / after whitespace)
```

### DOM Access + fetch + navigate in Handlers

```nyx
call #elementId.focus()       // DOM access via #id
set value = val(#input)       // get input value
fetch POST "/api/x" { body { key: val } }
navigate "/other-page"
```

### Reactive Style Bindings

```nyx
let size = 16
p style="font-size: {size}px" "Dynamic size"
```

### Route Parameters in Data Fetch URLs

Use `:paramName` in page paths and data fetch URLs. The compiler extracts the parameter from the URL at runtime:

```nyx
page /f/:slug {
  data form = get /api/forms/by-slug/:slug

  h1 "{form.title}"
  p "{form.description}"
}
```

`:slug` is automatically extracted from `window.location.pathname` at the correct segment index. Works in both `data` fetch URLs and `fn` body fetch URLs:

```nyx
page /f/:slug {
  data form = get /api/forms/by-slug/:slug

  fn submitForm() {
    fetch POST /api/forms/:slug/respond { answers: answers } then navigate "/thanks"
  }

  button on:click { call submitForm() } "Submit"
}
```

**Combined with query params:** `:param` (route) and `$param.x` (query) can coexist.

### Fetch Body in Handlers

`fetch` in event handlers supports JSON body with `{ key: value }` syntax:

```nyx
page /create {
  let title = ""

  fn publish() {
    fetch POST /api/forms { title: title, slug: slug } then navigate "/dashboard"
  }

  input bind="title" placeholder="Form title"
  button on:click { call publish() } "Publish"
}
```

**Keys are preserved as strings**, values are resolved to reactive state. `{ answers: answers }` compiles to `{ answers: __nyx.state.answers }` (not `{ __nyx.state.answers: __nyx.state.answers }`).

### Data Fetch Returns Raw Response

`data` blocks pass the API response through without modification:

```nyx
data form = get /api/forms/1    // form = {id:1, title:"..."}  (object)
data posts = get /api/posts     // posts = [{...}, {...}]      (array)
```

The response is stored exactly as the API returns it. Use `each` for arrays, dot-access for objects.

### Reactive Text Bindings

Use **single curly braces** `{expression}` for reactive text:

```nyx
page / {
  let name = "World"

  h1 "Hello, {name}!"                    // Simple variable
  p "Step {current + 1} of {total}"      // Expressions
  p "{form.title}"                        // Dot-access
}
```

**⚠️ Important:** Use `{var}`, NOT `${var}`. Dollar-sign template literals are NOT NyxCode syntax and will render as literal text.
