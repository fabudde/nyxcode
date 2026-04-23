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

