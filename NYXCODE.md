# NYXCODE.md — AI Context File (v0.8)
# Give this to any AI. It will generate NyxCode.

## What is NyxCode?
A token-efficient language replacing TypeScript/Next.js. One `.nyx` file = full-stack app with DB, Auth, API, frontend. **25% fewer tokens than Tailwind, 82% fewer than Next.js.**

## Quick Start
```bash
npx @fabudde/nyxcode build app.nyx    # Compile
npx @fabudde/nyxcode dev app.nyx      # Dev server + hot reload
```

## Hero Example: Full-Stack Blog
```nyx
table posts { title text required, body text, created auto }
security { table users, login email password, token jwt, protect /api/posts }
theme { colors { primary #667eea, bg #0a0a12, card #1a1a2e } }
preset card { bg var(--colors-card), r 12px, p 2rem }

page / {
  section style="max-width: 800px; margin: 0 auto; padding: 2rem;" {
    div { h1 "My Blog" }
    form /api/posts auth { input title, submit "Post", success -> reload }
    data posts = get /api/posts auth
    each posts -> div preset=card { h3 .title, p .body }
  }
}
```
**Generates:** SQLite DB, JWT auth, CRUD API, reactive frontend. Zero config.

## CSS Shorthands — ALWAYS USE THESE

| Short | CSS | Short | CSS |
|-------|-----|-------|-----|
| `bg` | background | `c` | color |
| `p` | padding | `m` | margin |
| `pt pb pl pr` | padding-* | `mt mb ml mr` | margin-* |
| `px py` | padding-inline/block | `mx my` | margin-inline/block |
| `w` | width | `h` | height |
| `minw maxw` | min/max-width | `minh maxh` | min/max-height |
| `r` | border-radius | `fs` | font-size |
| `fw` | font-weight | `ff` | font-family |
| `lh` | line-height | `ls` | letter-spacing |
| `ta` | text-align | `tt` | text-transform |
| `td` | text-decoration | `d` | display |
| `pos` | position | `z` | z-index |
| `op` | opacity | `cur` | cursor |
| `ai` | align-items | `jc` | justify-content |
| `fd` | flex-direction | `gap` | gap |
| `of` | overflow | `shadow` | box-shadow |
| `tf` | transform | `tr` | transition |
| `anim` | animation | `gtc` | grid-template-columns |

## Layout Attributes — On Any Element
```nyx
section flex=col center gap=2rem { }     # Flexbox column, centered
nav flex=row between { }                  # Flex row, space-between
div grid=3 gap=1.5rem { }                # 3-column grid
```

| Attr | CSS |
|------|-----|
| `flex=col` | `display:flex; flex-direction:column` |
| `flex=row` | `display:flex; flex-direction:row` |
| `grid=3` | `display:grid; grid-template-columns:repeat(3,1fr)` |
| `gap=X` | `gap:X` |
| `center` | `align-items:center; justify-content:center` |
| `between` | `justify-content:space-between` |
| `wrap` | `flex-wrap:wrap` |

**⚠️ `center` overrides `between`!** `center` sets `justify-content:center` which beats `between`. Use `style { ai center }` separately if you need vertical centering + space-between.

## Style Presets
```nyx
preset label { fs 0.7rem, fw 700, tt uppercase, c var(--colors-primary) }
preset card { bg var(--colors-card), r 12px, p 2rem }

p "TITLE" preset=label
section preset=card { h3 "Content" }
```

## Theme
```nyx
theme {
  colors { primary #667eea, bg #0a0a12, card #1a1a2e }
  fonts { heading "Space Grotesk, sans-serif", body "Inter, sans-serif" }
}
```
Colors → `var(--colors-primary)`. Fonts auto-apply to headings/body.

## Pages & Routing
```nyx
page / { h1 "Home" }
page /about { h1 "About" }
page /blog { h1 "Blog" }
```
Each `page /path { }` = one route. Multi-page = separate HTML files (SSG).

## Elements
```nyx
h1 "Title"
p "Text"
span "Inline"
a "Click" href="/about"
link "Click" href="/about"          # alias for a

# Structure
section { }, div { }, nav { }, header { }, footer { }

# Attributes work on any element
div id="team"                         # anchor target
div class="custom-class"              # CSS class from head styles
button "Click" -> count = count + 1
input placeholder="Type..." bind=name
select { option "A", option "B", option "C" }
textarea placeholder="Write..."
img src="/photo.jpg" alt="Photo"
```

**⚠️ SIBLING RULE:** Two elements at same level merge. Wrap in `div { }`:
```nyx
div { a "Home" href="/" }
div { a "About" href="/about" }
```

## Styling (3 Tiers)

**Tier 1: Style blocks (90% of cases)**
```nyx
section {
  style { bg #1a1a2e, c white, p 2rem, r 12px, d flex, gap 1rem }
  h1 "Styled"
}
```

**Hover / Focus / Active:**
```nyx
style {
  bg #667eea, c white
  hover { bg #5a6fd6, tf translateY(-2px) }
  focus { outline 2px solid #667eea }
}
```

**Responsive (@mobile = max 768px, @tablet = max 1024px):**
```nyx
style {
  p 4rem, gtc repeat(3, 1fr)
  @mobile { p 1rem, gtc 1fr }
  @tablet { p 2rem, gtc repeat(2, 1fr) }
}
```

**Tier 2: Animations**
```nyx
animate pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}
```

**Tier 3: Head CSS injection (global styles, fonts)**
```nyx
head "<style>@keyframes fade { from { opacity:0 } to { opacity:1 } }</style>"
head "<link href='https://fonts.googleapis.com/css2?family=Inter&display=swap' rel='stylesheet'>"

**Note:** `animate` blocks use CSS syntax (semicolons), not NyxCode commas — they output raw `@keyframes`.
```

## State
```nyx
state count = 0
computed double = count * 2
h1 count
button "+" -> count = count + 1
```

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
Card title="Fast" desc="Milliseconds" icon="⚡"
```
**Default props:**
```nyx
component Button {
  props label color="#667eea" size="1rem"
}
Button label="Click"                    # Uses defaults
Button label="Go" color="red"          # Override
```

**Slots (nested content):**
```nyx
component Modal {
  props title
  section {
    div { h2 .title }
    slot                                # Children inserted here
  }
}
Modal title="Confirm" { p "Are you sure?", button "Yes" }
```

## Layout
```nyx
layout {
  head "<link href='...' rel='stylesheet'>"
  nav flex=row between { div { a "Home" href="/" } }
  slot
  footer { p "Made with NyxCode" }
}
```

## Imports (multi-file)
```nyx
use "./components.nyx"                  # Import components
use "./layout.nyx"                      # Import layout
```

## Iteration & Conditionals
```nyx
each items -> item { div { h3 .name }, p .description }

when loggedIn -> p "Welcome back!"
else -> div { a "Login" href="/login" }
```

## Forms
```nyx
form /api/posts auth {
  input title placeholder="Title" required
  submit "Publish"
  success -> reload
  error -> toast "Failed"
}
```

## Script Block (escape hatch)
```nyx
script {
  document.addEventListener('DOMContentLoaded', function() {
    console.log('Custom JS');
  });
}
```
Use only for edge cases. 95% of apps need zero script blocks.

## Icons

**Emoji (recommended):** `span "🦞" style="fs: 2rem;"`

**Lucide:** `head "<link href='https://unpkg.com/lucide-static@latest/font/lucide.css' rel='stylesheet'>"` → `span "" class="icon-home"`

**Font Awesome:** `head "<link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css' rel='stylesheet'>"` → `span "" class="fa-solid fa-house"`

**Material Icons:** `head "<link href='https://fonts.googleapis.com/icon?family=Material+Icons' rel='stylesheet'>"` → `span "home" class="material-icons"`

## Head Injection
```nyx
head "<title>My Page</title>"
head "<meta name='description' content='My app'>"
```

## Full-Stack Backend

### Tables
```nyx
table posts { title text required, body text, author users, created auto }
```
Auto: `id` PK, CRUD API (`/api/posts`), SQLite WAL.
Types: `text`, `email`, `int`, `float`, `bool`, `auto`, `tablename` (FK).
Constraints: `required`, `unique`, `default="val"`.

### Security
```nyx
security { table users, login email password, token jwt, protect /api/posts }
```
Generates: register, login, JWT middleware, bcrypt, rate limiting.

### Data Binding
```nyx
data posts = get /api/posts auth
each posts -> div preset=card { h3 .title }
```

## Common Mistakes

```
WRONG                                 RIGHT
<div class="flex">                    section flex=row { }
className="text-lg"                   style { fs 1.125rem }
onClick={() => set(c+1)}              button "+" -> count = count + 1
import React from 'react'            use "./component.nyx"
export default function App()         page / {
background-color: red;                bg red
border-radius: 12px;                  r 12px
font-size: 0.9rem;                    fs 0.9rem
display: flex;                        d flex (or flex=row)
{items.map(i => <li>{i}</li>)}        each items -> i { p .name }
{show && <p>Hi</p>}                   when show -> p "Hi"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Style not applied | `style { }` must be INSIDE the element's `{ }` |
| Component not found | Define components BEFORE pages |
| Props not showing | Use `.propName` (dot prefix) inside component |
| State not updating | Arrow syntax: `-> varName = expression` |
| Elements merging | Wrap siblings in `div { }` |
| Import not working | Relative paths: `use "./file.nyx"` |
| Font commas break | Quote: `"Inter, sans-serif"` |
| center + between | `center` overrides `between` — use `style { ai center }` separately |
| class not applied | `class="name"` for CSS classes defined in `head "<style>..."` |
| anchor links | `div id="section"` for scroll targets |

## AI Rules
1. **USE SHORTHANDS** — `bg c p m r fs fw w h d op z`, never full names
2. **USE LAYOUT ATTRS** — `flex=col center` not `style { d flex, fd column }`
3. **USE PRESETS** — define once, `preset=name` everywhere
4. **USE THEME** — `var(--colors-primary)` not hardcoded colors
5. **WRAP SIBLINGS** — `div { element }` to prevent merging
6. **ONE FILE** — everything in one .nyx
7. **NO CLOSING TAGS** — `{ }` blocks
8. **PROPS = `.`** — `.title` inside components
9. **STRINGS = `""`** — double quotes
10. **COMMENTS = `#`**

## Version
v0.8.1 — https://nyxcode.io/
