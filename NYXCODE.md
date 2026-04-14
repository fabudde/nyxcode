# NYXCODE.md — AI Context File (v0.8.2)
# Give this to any AI. It will generate NyxCode.

## What is NyxCode?
A token-efficient language replacing TypeScript/Next.js. One `.nyx` file = full-stack app with DB, Auth, API, frontend. **25% fewer tokens than Tailwind, 82% fewer than Next.js.** Compiles to HTML+CSS+JS (frontend) and Express+SQLite (backend). Node-based runtime.

## Quick Start
```bash
npm i -g @fabudde/nyxcode
nyxcode build app.nyx          # Compile to dist-site/
nyxcode dev app.nyx            # Dev server + hot reload
nyxcode parse app.nyx          # Debug AST output
```

## Hero Example: Full-Stack Blog (16 lines)
```nyx
table posts { title text required, body text, created auto }
security { table users, login email password, token jwt, protect /api/posts }
theme { colors { primary #667eea, bg #0a0a12, card #1a1a2e } }
preset card { bg var(--colors-card), r 12px, p 2rem }

page / {
  section style="max-width: 800px; margin: 0 auto; padding: 2rem;" {
    h1 "My Blog"
    form /api/posts auth { input title, submit "Post", success -> reload }
    data posts = get /api/posts auth
    each posts -> div preset=card { h3 .title, p .body }
  }
}
page /register {
  h1 "Register"
  form /api/register { input email, input password type=password, submit "Sign Up" }
}
```
**Generates:** SQLite DB + JWT auth + CRUD API + reactive frontend. Zero config.

---

## CSS Shorthands — ALWAYS USE THESE (60+)

| Short | CSS | Short | CSS |
|-------|-----|-------|-----|
| `bg` | background | `c` | color |
| `p` | padding | `m` | margin |
| `pt pb pl pr` | padding-top/bottom/left/right | `mt mb ml mr` | margin-top/bottom/left/right |
| `px` | padding-inline | `py` | padding-block |
| `mx` | margin-inline | `my` | margin-block |
| `w` | width | `h` | height |
| `minw` | min-width | `maxw` | max-width |
| `minh` | min-height | `maxh` | max-height |
| `r` | border-radius | `fs` | font-size |
| `fw` | font-weight | `ff` | font-family |
| `lh` | line-height | `ls` | letter-spacing |
| `ta` | text-align | `tt` | text-transform |
| `td` | text-decoration | `ws` | white-space |
| `d` | display | `pos` | position |
| `z` | z-index | `op` | opacity |
| `cur` | cursor | `v` | visibility |
| `ai` | align-items | `jc` | justify-content |
| `as` | align-self | `js` | justify-self |
| `fd` | flex-direction | `fw` | flex-wrap (context) |
| `fg` | flex-grow | `fb` | flex-basis |
| `gap` | gap | `of` | overflow |
| `shadow` | box-shadow | `tf` | transform |
| `tr` | transition | `anim` | animation |
| `gtc` | grid-template-columns | `gtr` | grid-template-rows |
| `gc` | grid-column | `gr` | grid-row |
| `pi` | place-items | `bs` | border-style |
| `bw` | border-width | `bc` | border-color |

**Shorthands work in:** `style { }` blocks, `preset` definitions, AND inline `style="fs: 1rem; c: red"`.

---

## Layout Attributes — On ANY Element (incl. Components)
```nyx
section flex=col center gap=2rem { }     # Flexbox column, centered
nav flex=row between { }                  # Flex row, space-between
div grid=3 gap=1.5rem { }                # 3-column grid
div flex=wrap gap=1rem { }               # Flex with wrapping
```

| Attr | CSS |
|------|-----|
| `flex=col` | `display:flex; flex-direction:column` |
| `flex=row` | `display:flex; flex-direction:row` |
| `flex=wrap` | `display:flex; flex-wrap:wrap` |
| `grid=3` | `display:grid; grid-template-columns:repeat(3,1fr)` |
| `gap=X` | `gap:X` |
| `center` | `align-items:center; justify-content:center` |
| `between` | `justify-content:space-between` |
| `around` | `justify-content:space-around` |
| `evenly` | `justify-content:space-evenly` |
| `wrap` | `flex-wrap:wrap` |
| `place=center` | `place-items:center` |

**⚠️ `center` + `between` conflict!** `center` sets `justify-content:center` which overrides `between`. For vertical centering + horizontal space-between, use:
```nyx
section flex=row between {
  style { ai center }
}
```

---

## Style Presets — Define Once, Use Everywhere
```nyx
preset label { fs 0.7rem, fw 700, tt uppercase, c var(--colors-primary) }
preset card { bg var(--colors-card), r 12px, p 2rem }

p "SECTION TITLE" preset=label
section preset=card { h3 "Card Content" }
```
**Preset + style combo:** `preset=` applies the preset class, additional `style { }` block adds more:
```nyx
div preset=card { style { shadow 0 4px 20px rgba(0,0,0,0.2) } }
```

---

## Theme — Global Design Tokens
```nyx
theme {
  colors { primary #667eea, accent #f093fb, bg #0a0a12, card #1a1a2e, text #e2e8f0 }
  fonts { heading "Space Grotesk, sans-serif", body "Inter, sans-serif" }
}
```
- Colors → CSS variables: `var(--colors-primary)`, `var(--colors-bg)`
- `heading` font auto-applies to `h1`–`h6`
- `body` font auto-applies to `body`, `p`, `span`, `li`
- **Quote font values with commas:** `"Inter, sans-serif"`

---

## Pages & Routing
```nyx
page / { h1 "Home" }
page /about { h1 "About" }
page /blog { h1 "Blog" }
page /docs/install { h1 "Install" }
```
- Each `page /path { }` = one route → one HTML file (SSG)
- Single page → `dist-site/index.html`
- Multi-page → `dist-site/`, `dist-site/about/index.html`, etc.
- Auto SEO: `<title>`, `<meta description>`, `<link rel="canonical">`

---

## Elements
```nyx
# Text
h1 "Title"                     h2 "Subtitle"
p "Paragraph"                  span "Inline"

# Links
a "Click here" href="/about"
link "Click" href="/about"              # alias for <a>

# Structure (all compile to HTML tags)
section { }    div { }    nav { }    header { }    footer { }
main { }       aside { }  article { }

# Media
img src="/photo.jpg" alt="A photo"
video src="/clip.mp4" controls

# Form elements
button "Click me" -> count = count + 1
input placeholder="Type..." bind=name
input type=password placeholder="Password"
input type=email placeholder="Email"
select { option "Red", option "Blue", option "Green" }
textarea placeholder="Write something..."

# Attributes on any element
div id="team"                           # anchor target
div class="custom-class"               # CSS class
div style="bg: red; r: 12px;"          # inline (shorthands work!)
```

**⚠️ SIBLING RULE:** Two same-level elements can merge. Always wrap in `div { }`:
```nyx
# WRONG — these may merge into one element
a "Home" href="/"
a "About" href="/about"

# RIGHT — wrap each
div { a "Home" href="/" }
div { a "About" href="/about" }
```

---

## Styling (3 Tiers)

### Tier 1: Style Blocks (use this 90% of the time)
```nyx
section {
  style {
    bg #1a1a2e, c white, p 2rem, r 12px
    d flex, fd column, gap 1rem
    maxw 800px, m 0 auto
  }
  h1 "Content"
}
```

### Hover / Focus / Active / Pseudo-elements
```nyx
div {
  style {
    bg #667eea, c white, p 1rem, r 8px
    tr all 0.3s ease
    hover { bg #5a6fd6, tf translateY(-2px), shadow 0 8px 20px rgba(0,0,0,0.3) }
    focus { outline 2px solid #667eea }
    active { tf scale(0.98) }
    ::after { content "", d block, w 100%, h 2px, bg #667eea }
  }
}
```

### Responsive Breakpoints
```nyx
style {
  p 4rem, gtc repeat(3, 1fr)
  @mobile { p 1rem, gtc 1fr }              # max-width: 768px
  @tablet { p 2rem, gtc repeat(2, 1fr) }   # max-width: 1024px
}
```

### Tier 2: Animate Blocks
```nyx
animate fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
animate pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
```
**Note:** `animate` uses CSS syntax (semicolons + colons), not NyxCode shorthand commas.

### Tier 3: Head CSS Injection (global/complex CSS)
```nyx
head "<style>@keyframes spin { to { transform: rotate(360deg) } }</style>"
head "<link href='https://fonts.googleapis.com/css2?family=Inter&display=swap' rel='stylesheet'>"
```
Use for: third-party fonts, complex keyframes, global overrides. Works in both `layout` and `page` blocks.

---

## Components
```nyx
component Card {
  props title desc icon
  section preset=card {
    span .icon style="fs: 2rem;"
    div { h3 .title }
    p .desc style="c: #888;"
  }
}

# Usage
Card title="Fast" desc="Milliseconds" icon="⚡"
```

### Default Props
```nyx
component Button {
  props label="Click" color="#667eea" size="1rem"
}
Button label="Submit"                   # Uses default color + size
Button label="Delete" color="red"      # Override color
```

### Slots (nested content)
```nyx
component Modal {
  props title
  section { h2 .title, slot }
}
Modal title="Confirm" { p "Are you sure?", button "Yes" }
```

### Layout Attributes on Components
```nyx
component Row {
  props gap="1rem"
  section flex=row center gap=.gap { slot }
}
```
`flex=row`, `center`, `grid=N`, `between`, etc. all work on component root elements.

---

## Layout — Shared Wrapper
```nyx
layout {
  head "<link href='https://fonts.googleapis.com/...' rel='stylesheet'>"
  head "<title>My Site</title>"
  nav flex=row between {
    div { a "Home" href="/" }
    div { a "About" href="/about" }
  }
  main { slot }
  footer { p "© 2026" }
}
```
- `slot` = where page content goes
- `head` blocks in layout inject into every page's `<head>`
- One layout per file (use `use` to import)

---

## Imports (Multi-File)
```nyx
use "./components.nyx"          # Import components
use "./layout.nyx"              # Import layout
```
Components and layouts from imported files are available in all pages.

---

## State & Reactivity
```nyx
state count = 0
state name = "World"
computed double = count * 2
computed greeting = "Hello " + name

h1 count                                # Auto-updates
h2 greeting
button "+" -> count = count + 1
button "Reset" -> count = 0
input bind=name                         # Two-way binding
```

---

## Data Binding (Frontend ↔ API)
```nyx
data posts = get /api/posts             # Public fetch
data posts = get /api/posts auth        # With JWT token
each posts -> div { h3 .title, p .body }
```

---

## Iteration & Conditionals
```nyx
# each — loop over data
each items -> div { h3 .name, p .description }

# when/else — conditional rendering
when loggedIn -> p "Welcome back!"
else -> div { a "Login" href="/login" }
```

---

## Forms — Declarative, Auth-Aware
```nyx
form /api/posts auth {
  input title placeholder="Post title" required
  textarea body placeholder="Write..."
  submit "Publish"
  success -> reload                     # or: redirect "/blog" | toast "Done!" | clear
  error -> toast "Something went wrong"
}
```
- `auth` → auto-includes `Authorization: Bearer` header from localStorage
- `success` actions: `reload`, `redirect "/path"`, `toast "message"`, `clear`
- `error` actions: `toast "message"`
- Auto-generates: `<form>`, `fetch()`, JSON body, error handling

---

## Script Block (Escape Hatch)
```nyx
script {
  document.addEventListener('DOMContentLoaded', function() {
    // Any JavaScript here
    console.log('Custom JS');
  });
}
```
Use sparingly. 95% of apps need zero script blocks.

---

## Icons — 4 Methods

**Emoji (simplest):**
```nyx
span "🦞" style="fs: 2rem;"
```

**Lucide Icons:**
```nyx
head "<link href='https://unpkg.com/lucide-static@latest/font/lucide.css' rel='stylesheet'>"
span "" class="icon-home"
```

**Font Awesome:**
```nyx
head "<link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css' rel='stylesheet'>"
span "" class="fa-solid fa-house"
```

**Material Icons:**
```nyx
head "<link href='https://fonts.googleapis.com/icon?family=Material+Icons' rel='stylesheet'>"
span "home" class="material-icons"
```

---

## Full-Stack Backend

### Tables → Auto CRUD API
```nyx
table posts {
  title text required
  body text
  author users                          # Foreign key → users table
  views int default="0"
  featured bool
  created auto                          # Auto-timestamp
}
```
- Auto-generates: `id` INTEGER PRIMARY KEY, all CRUD endpoints (`GET/POST/PUT/DELETE /api/posts`)
- Types: `text`, `email`, `int`, `float`, `bool`, `auto`, `tablename` (FK)
- Constraints: `required`, `unique`, `default="value"`
- DB: SQLite with WAL mode, foreign keys enabled

### Security → Auth System
```nyx
security {
  table users                           # User storage table
  login email password                  # Login fields
  token jwt                             # JWT tokens
  protect /api/posts                    # Protected endpoints
}
```
Generates: `/api/register`, `/api/login`, `/api/me`, JWT middleware, bcrypt hashing, rate limiting.

**⚠️ `protect /api/posts` applies to ALL methods** (GET included). Users must register/login first.

### Runtime Dependencies
Server (`server.js`) uses: `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `express-rate-limit`. Install in your deploy directory.

---

## Element Defaults
NyxCode auto-generates base CSS for interactive elements (`button`, `input`, `select`, `textarea`, `a`) using `:where()` selectors (zero specificity). **Your styles always override defaults** — no `!important` needed.

---

## Common Mistakes

| Wrong | Right |
|-------|-------|
| `<div class="flex">` | `section flex=row { }` |
| `className="text-lg"` | `style { fs 1.125rem }` |
| `onClick={() => set(c+1)}` | `button "+" -> count = count + 1` |
| `import React from 'react'` | `use "./component.nyx"` |
| `export default function App()` | `page / {` |
| `background-color: red;` | `bg red` |
| `border-radius: 12px;` | `r 12px` |
| `font-size: 0.9rem;` | `fs 0.9rem` |
| `display: flex;` | `d flex` (or `flex=row`) |
| `{items.map(i => <li>{i}</li>)}` | `each items -> div { p .name }` |
| `{show && <p>Hi</p>}` | `when show -> p "Hi"` |
| `style="background-color: red"` | `style="bg: red"` (shorthands work inline!) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Style not applied | `style { }` must be INSIDE the element's `{ }`, not after |
| Component not found | Define components BEFORE pages in the file |
| Props not showing | Use `.propName` (dot prefix) inside component body |
| State not updating | Arrow syntax: `-> varName = expression` |
| Elements merging | Wrap siblings in `div { }` |
| Import not working | Relative paths: `use "./file.nyx"` |
| Font commas break | Quote font values: `"Inter, sans-serif"` |
| `center` + `between` | Use `style { ai center }` separately (see above) |
| `class` not applied | Works for head-injected CSS classes: `class="my-class"` |
| Anchor links | Use `div id="section"` for scroll targets |
| `animate` syntax | Uses CSS syntax (`;` and `:`) not NyxCode commas |
| Layout head missing | `head` works in both `layout { }` and `page { }` blocks |
| Default styles too strong | Element defaults use `:where()` — your styles always win |

---

## AI Rules (READ THIS!)
1. **USE SHORTHANDS** — `bg c p m r fs fw w h d op z ai jc fd`, never full CSS names
2. **USE LAYOUT ATTRS** — `flex=col center gap=2rem` not `style { d flex, fd column }`
3. **USE PRESETS** — define once, `preset=name` everywhere. Avoid repeating styles
4. **USE THEME** — `var(--colors-primary)` not hardcoded `#667eea` everywhere
5. **WRAP SIBLINGS** — `div { element }` to prevent parser merging
6. **ONE FILE DEFAULT** — put everything in one `.nyx` file. Multi-file with `use` for large apps
7. **NO CLOSING TAGS** — `{ }` blocks, not `</div>`
8. **PROPS USE DOT** — `.title` `.name` inside components to reference props
9. **STRINGS USE `""`** — always double quotes
10. **COMMENTS USE `#`** — `# This is a comment`
11. **COMMAS IN STYLE** — `bg red, c white, p 1rem` (commas separate properties)
12. **NO HTML INJECTION** — use NyxCode elements, not raw HTML (except in `head` blocks)
13. **`head` TAKES RAW STRING** — `head "<link ...>"` NOT `head { link ... }`

---

## Version
v0.8.2 — https://nyxcode.io/ — MIT License
Built by Nyx 🦞 & Fabian
