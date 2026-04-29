## v0.50.0 — "Zero Patches" (2026-04-29)

NyxCode is now a complete full-stack programming language. One `.nyx` file = production app with ZERO post-build patches.

**New:** SolidJS-style reactivity, custom API routes (`api GET/POST/PUT`), query aliases (`query "SQL" -> var`), when-inside-each, each auto-subscribe, each loop aliases, data→state deferred init, dynamic page routes, route params in fetch, multi-statement handlers, generic components, stdlib imports.

**Fixed:** State var "value" clobber, text-after-handler leak, runtime ordering, let/var declarations, data fetch array-wrapping, each wrapper tags, deferred init multi-page, component usage syntax.

**Docs:** NYXCODE.md now 3,400+ lines — 9 new sections.

**Stats:** 616 tests, 0 failures. 22 commits since v0.40.1. NyxForms (460 lines) compiles with zero manual patches.

# NyxCode v0.39.0 — "The Language Release II" 🔥

**NyxCode is now a full programming language.** All 10 language feature issues (#183-#192) closed in a single session.

## New Features

### #189: Array & Object Literals
```nyx
api GET /api/colors {
  let colors = ["red", "green", "blue"]
  let config = { theme: "dark", lang: "de" }
  respond 200 { colors: colors, config: config }
}
```

### #184: Mutable Variables (`set`, `push`, `pop`, `shift`)
```nyx
api POST /api/process {
  let count = 0
  let results = []
  set count = count + 1
  set config.theme = "light"    // dot notation
  push results "first"
  pop results
  respond 200 { count: count }
}
```

### #183: While & For Loops
```nyx
api GET /api/fibonacci {
  let a = 0
  let b = 1
  let seq = []
  for i in 0..10 {
    push seq a
    let temp = b
    set b = a + b
    set a = temp
  }
  respond 200 { sequence: seq }
}

api GET /api/countdown {
  let n = 10
  while n > 0 {
    set n = n - 1
  }
  respond 200 { done: true }
}
```
⚠️ Infinite loop guard: throws after 10,000 iterations.  
Custom step: `for i in 0..100 step 5 { }`

### #185: Client-side Reactivity
```nyx
page / {
  let count = 0
  let todos = []
  
  h1 "Count: {count}"
  button "+" on:click { set count = count + 1 }
  button "Add Todo" on:click { push todos "new item" }
  
  each todos -> todo {
    p "{todo}"
  }
}
```
- State changes auto-update DOM (template bindings)
- Array mutations trigger list re-render via `__nyx.notify()`
- Two-way binding with `model=` attribute

### #192: Component Events (`emit`)
```nyx
component Counter {
  let count = 0
  button "+" on:click { emit increment count }
}

page / {
  Counter on:increment { set total = total + 1 }
}
```
- `emit eventName [data]` → dispatches CustomEvent with bubbling
- Parents listen with `on:eventName { }`

### #187: WebSocket
```nyx
socket /ws/chat {
  on connect { }
  on message { }
  on close { }
}
```
- Generates WebSocketServer (ws package)
- Auto-broadcast on message
- Path-based routing for multiple endpoints
- Client ID tracking

### #186, #188, #190, #191: Already Implemented!
- **File Upload** (#186): `table photos { image upload }` → multer middleware
- **SPA Routing** (#188): Multiple `page` blocks → client-side pushState router
- **HTTP Client** (#190): `fetch "url" { method, headers, body } as result`
- **Async/Await** (#191): All API handlers are async, fetch awaits automatically

## Stats
- **572 tests**, 0 failures
- **+54 tests** since v0.38.3 (518 → 572)
- All 10 issues (#183-#192) closed
- 7 commits in one session

## Breaking Changes
- `let` in API blocks now generates `let` (not `const`) to allow reassignment
- None other — fully backward compatible

---

# NyxCode v0.38.3 — Fix: Double colons in inline style={} (Regression #182)

### Bug Fixes
- **#182**: Fixed double colons (`::`) in inline `style={}` when using CSS-style syntax (`bg: red` instead of `bg red`)
- **#182**: Fixed double semicolons (`;;`) when using `;` as separator in inline styles
- Both CSS-style (`bg: red; p: 1rem`) and NyxCode-style (`bg red, p 1rem`) now work correctly

### Stats
- 549 tests, 0 failures (+3 new regression tests)
- Reported by Kiro 🐺 QA

---

# NyxCode v0.38.2 — Bugfixes: Vendor Prefix Parsing + JWT Persistence

### Bug Fixes
- **#181**: Fixed vendor prefix parsing (`-webkit-*`, `-moz-*`, `-ms-*`) in both style blocks and inline `style={}` attributes. Hyphenated property names after vendor prefix now parse correctly.
- **#181**: Added `bgclip` shorthand → `background-clip` (with auto `-webkit-` prefix). Previously `bgc` was incorrectly documented as `background-clip` — it's `background-color`.
- **#172**: JWT secret now persists across server restarts via `.nyx-data/.jwt-secret` file. Priority: env var `JWT_SECRET` > file > random.

### Stats
- 546 tests, 0 failures (+8 new tests)
- Fixed docs: `bgc` = `background-color`, `bgclip` = `background-clip`

---

# NyxCode v0.38.1 — Repo Cleanup + Tailwind Demo

- Cleaned up repository structure
- Added Tailwind CSS demo/benchmark

---

# NyxCode v0.38.0 — Tailwind CSS Compatibility

**Write Tailwind classes in NyxCode. Zero runtime. Zero config.**

Every AI already knows Tailwind. Now they can use that knowledge directly in NyxCode's `style={}` blocks. Classes compile to native CSS at build time — no PostCSS, no Tailwind runtime, no 300KB framework.

### What's New
- **200+ Tailwind utility classes** recognized in `style={}` blocks
- **Dynamic spacing**: `p-4`, `m-8`, `gap-2`, `px-6`, `mt-12` etc. (full Tailwind spacing scale)
- **Dynamic colors**: `text-blue-500`, `bg-red-600`, `border-gray-200` (slate/gray/red/blue/green/yellow/purple/pink/indigo/cyan/emerald/amber/rose/sky/orange)
- **Layout**: `flex`, `grid`, `items-center`, `justify-between`, `grid-cols-3`, `flex-col`, etc.
- **Typography**: `text-sm`, `text-2xl`, `font-bold`, `italic`, `uppercase`, `underline`
- **Borders**: `rounded-lg`, `rounded-full`, `border`, `border-dashed`
- **Shadows**: `shadow`, `shadow-md`, `shadow-xl`
- **Transitions**: `transition`, `transition-colors`, `duration-300`, `ease-in-out`
- **Position**: `relative`, `absolute`, `fixed`, `sticky`, `z-10`
- **And more**: cursor, opacity, overflow, object-fit, aspect-ratio, grid spans, etc.
- **Mix with NyxCode shorthands**: `style={ flex, items-center, bg red, fs 2rem }` — both systems coexist
- **20 new tests** (538 total, 0 failures)

### Token Efficiency
Tailwind in NyxCode is ~20% more token-efficient than Tailwind in JSX:
```
// JSX + Tailwind: 89 tokens
<div className="flex items-center justify-between p-4 bg-blue-500 text-white rounded-lg shadow-md">

// NyxCode + Tailwind: 71 tokens (↓20%)
div style={ flex, items-center, justify-between, p-4, bg-blue-500, text-white, rounded-lg, shadow-md }
```

---

# NyxCode v0.37.0 — Full Expressiveness Engine

**NyxCode can now build ANYTHING for the web.** Complete expression engine with arithmetic,
logic operators, member access, pipe built-ins, ternary expressions, and more — all while
maintaining ≥15% token efficiency over JavaScript.

## 🔥 Expression Engine Overhaul

### Arithmetic Operators
```nyx
when .count + 1 > 0 { ... }
when .price * .qty > 100 { ... }
when (.a + .b) * .c == 42 { ... }
```
Full operator precedence: `*`/`/`/`%` before `+`/`-` before `==`/`!=`/`<`/`>` before `and`/`or`.

### Logic Operators — Human-Readable!
```nyx
when .active and .visible { div "shown" }
when .admin or .editor { nav "Dashboard" }
when not .hidden { section "Content" }
```
`and` → `&&`, `or` → `||`, `not` → `!`. More readable, same power. (~0% size difference vs symbols.)

### Member Access & Chaining
```nyx
when user.active { ... }
when user.profile.name == "Nyx" { ... }
when order.items[0].price > 50 { ... }
```
Dot access, bracket access, and method calls on any expression.

### Pipe Built-ins — The Killer Feature
```nyx
// Array operations
items | filter price > 10 | map name     // 40% shorter than JS!
items | sort price desc                   // 60% shorter than JS!
items | len                               // .length
items | sum price                         // reduce sum
items | first                             // [0]
items | last                              // [arr.length-1]
items | reverse                           // [...arr].reverse()
items | unique                            // [...new Set(arr)]
items | take 5                            // .slice(0, 5)
items | skip 10                           // .slice(10)
items | flat                              // .flat()
items | includes "hello"                  // .includes()

// String operations
name | uppercase                          // .toUpperCase()
name | lowercase                          // .toLowerCase()
name | trim                               // .trim()
name | split ","                          // .split(",")
words | join " "                          // .join(" ")
name | replace "old" "new"               // .replace()

// Math
price | round 2                           // Math.round to 2 decimals
value | floor                             // Math.floor
value | ceil                              // Math.ceil
value | abs                               // Math.abs

// Object
obj | keys                                // Object.keys()
obj | values                              // Object.values()
```

### Ternary Expressions
```nyx
when .count > 0 ? "has items" : "empty" { ... }
```

### Boolean & Array Literals
```nyx
when .active == true { ... }
when .active == false { ... }
when [1, 2, 3] | len > 0 { ... }
```

### Unary Expressions
```nyx
when not .hidden { ... }
when -.offset > 0 { ... }
```

## 🐛 Bug Fixes

- **Fixed:** `type` attribute on `<source>` elements now parsed correctly (Issue #116 regressions)
- **Fixed:** `-` in CSS properties (`-webkit-background-clip`) no longer conflicts with minus operator
- **Fixed:** `as` keyword in theme blocks (`@theme as "name"`) works alongside new `as` keyword

## 📊 Token Efficiency

| Operation | JavaScript | NyxCode | Savings |
|-----------|-----------|---------|---------|
| Filter + Map | `items.filter(x => x.price > 10).map(x => x.name)` | `items \| filter price > 10 \| map name` | **~40%** |
| Sort desc | `items.sort((a, b) => b.price - a.price)` | `items \| sort price desc` | **~60%** |
| Length | `items.length` | `items \| len` | **~8%** |
| Uppercase | `str.toUpperCase()` | `str \| uppercase` | **~25%** |
| Logic | `active && visible \|\| admin` | `active and visible or admin` | **~0%** (readable!) |

## 📈 Stats
- **497/497 tests passing** (0 failures — fixed 2 pre-existing picture/source bugs!)
- **17 new expression engine tests**
- **30+ pipe built-ins**
- Backwards compatible with all v0.34–v0.36 syntax

---

# NyxCode v0.31.0 — Icons & Migrations 🎨🔧

**Two features that make NyxCode production-ready: native icon packs and auto-database migrations.**

Built on [NyxCode v0.30.0 "The Language Release"](https://github.com/fabudde/nyxcode). Dogfooded on [NyxStatus.com](https://nyxstatus.com) (378 lines) and [tracker.rudel.fun](https://tracker.rudel.fun) (320 lines).

---

## 🎨 Native Icon Pack Support (#142)

Three icon packs, three ways to use them:

### Theme Declaration
```nyx
theme {
  icons: lucide           # Lucide (1400+ icons, default)
  # icons: phosphor       # Phosphor Icons
  # icons: tabler         # Tabler Icons
}
```

### Standalone Icon Element
```nyx
icon "heart" size=24
icon "stethoscope" size=32 style={ c #2a7d5f }
icon "map-pin" style={ c red; fs 2rem }
```

### Inline in Text
```nyx
h1 "icon:heart Welcome to NyxCode"
p "Visit us at icon:map-pin our location"
button "icon:send Submit"
```

**Security:** All CDN versions pinned (no `@latest`). Supply-chain safety per Tyto's review.

---

## 🔧 Auto-Migrations (#131)

Add columns to your tables — existing data stays, new columns appear. Zero commands.

```nyx
# Before: table posts { title text, body text }
# After:  table posts { title text, body text, category text default="general", views number }
# → Rebuild + restart. That's it. ALTER TABLE happens automatically.
```

**How it works:**
- `PRAGMA table_info()` diff at startup
- `ALTER TABLE ADD COLUMN` for new columns
- UNIQUE columns → separate `CREATE UNIQUE INDEX` (SQLite limitation)
- `_migrations` table logs all changes
- Idempotent — safe to restart multiple times

---

## 🐛 Fixes

- **UNIQUE columns in migrations** — SQLite can't ADD COLUMN with UNIQUE inline; now creates a separate unique index instead
- **Icon elements after other elements** — `icon` added to `isStatementStart()` so element parser doesn't absorb subsequent icon statements

---

## Stats

- **365 tests passing** ✅
- **4 commits** since v0.30.7
- **128 lines** of new compiler code for icons
- **42 lines** of new compiler code for migrations

## Contributors

- 🦞 **Nyx** — Implementation (icons, migrations, edge case fixes)
- 🐻 **Fabian** — Feature design, issue creation
- 🦉 **Tyto** — Security review (CDN pinning, supply-chain analysis)
- 🐺 **Kiro** — QA, dogfooding, bug reports (#133-#141)

---

