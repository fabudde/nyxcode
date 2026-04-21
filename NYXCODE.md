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
div flex=row wrap gap=1rem { }            # Wrapping flex
```

| Attr | CSS |
|------|-----|
| `flex=col` | `display:flex; flex-direction:column` |
| `flex=row` | `display:flex; flex-direction:row` |
| `grid=3` | `display:grid; grid-template-columns:repeat(3,1fr)` |
| `gap=X` | `gap:X` |
| `center` | `align-items:center; justify-content:center` |
| `between` | `justify-content:space-between` |
| `around` | `justify-content:space-around` |
| `evenly` | `justify-content:space-evenly` |
| `wrap` | `flex-wrap:wrap` |

## Style Presets — Define Once, Use Everywhere
```nyx
preset label { fs 0.7rem, fw 700, tt uppercase, c var(--colors-primary) }
preset card { bg var(--colors-card), r 12px, p 2rem }
preset glass { bg rgba(255,255,255,0.03), r 12px, p 1.5rem }

p "TITLE" preset=label
section preset=card { h3 "Content" }
```
Presets generate CSS classes. Combine with `style=""` for one-off overrides.

## Theme — Colors & Fonts
```nyx
theme {
  colors { primary #667eea, accent #764ba2, bg #0a0a12, card #1a1a2e, muted #888 }
  fonts { heading "Space Grotesk, sans-serif", body "Inter, sans-serif" }
  spacing { page 3rem 2rem }
}
```
- Colors become CSS custom properties: `var(--colors-primary)`, `var(--colors-bg)`
- `heading` auto-applies `font-family` on h1-h6
- `body` auto-applies `font-family` on body, p, span, li, input, textarea
- **Quote font values that contain commas**

## Pages & Routing
```nyx
page / { h1 "Home" }
page /about { h1 "About" }
page /blog { h1 "Blog" }
```
Each `page /path { }` = one route. Multi-page files generate separate HTML files (SSG).

## Elements
```nyx
# Text
h1 "Title"
h2 "Subtitle"
p "Paragraph"
span "Inline"
link "Click" href="/about"

# Interactive
button "Click" -> count = count + 1
input placeholder="Type..." bind=name
select { option "A", option "B", option "C" }
textarea placeholder="Write..."

# Media
img src="/photo.jpg" alt="Photo"

# Structure
section { }
nav { }
header { }
footer { }
div { }
```

**SIBLING RULE:** Two elements at same level merge. Always wrap in `div { }`:
```nyx
# WRONG — second a becomes attribute of first
a "Home" href="/"
a "About" href="/about"

# RIGHT
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

**Inline style attribute:**
```nyx
p "Muted" style="color: #888; font-size: 0.9rem;"
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
```

## State & Reactivity
```nyx
state count = 0
state name = "World"
computed double = count * 2

h1 count                              # Auto-updates when count changes
p name
button "+" -> count = count + 1
button "Reset" -> count = 0
input bind=name                        # Two-way binding
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

## Layout (wraps all pages)
```nyx
layout {
  head "<link href='...' rel='stylesheet'>"
  nav flex=row between { div { a "Home" href="/" }, div { a "About" href="/about" } }
  slot                                  # Page content here
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
# Loop
each items -> item { div { h3 .name }, p .description }

# Conditionals
when loggedIn -> p "Welcome back!"
else -> div { a "Login" href="/login" }
```

## Forms (v0.6+)
```nyx
form /api/posts auth {
  input title placeholder="Title" required
  textarea body placeholder="Write..."
  select category { option "Tech", option "Life" }
  submit "Publish"
  success -> reload
  error -> toast "Failed"
}
```
- `form /api/endpoint` = POST with JSON body
- `auth` = includes JWT Bearer token from localStorage
- `input fieldname` = fieldname becomes JSON key
- `success -> reload | redirect "/path" | clear | toast "msg"`

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

**Emoji (recommended, zero deps):**
```nyx
span "🦞" style="fs: 2rem;"
```

**Lucide Icons:**
```nyx
head "<link href='https://unpkg.com/lucide-static@latest/font/lucide.css' rel='stylesheet'>"
span "" class="icon-home" style="fs: 1.5rem;"
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

## Head Injection
```nyx
head "<title>My Page</title>"
head "<meta name='description' content='My app'>"
```

## Full-Stack Backend

### Tables (= Database)
```nyx
table users { name text required, email email unique, password text required, created auto }
table posts { title text required, body text, author users, published bool default=false, created auto }
```
Every table gets `id` (auto PK). Each generates CRUD: `GET/POST /api/posts`, `GET/PUT/DELETE /api/posts/:id`. SQLite WAL mode.

**Types:** `text`, `email`, `number`/`int`, `float`/`decimal`, `bool`, `auto` (timestamp), `tablename` (foreign key)
**Constraints:** `required`, `unique`, `default="value"`

### Security (= Auth)
```nyx
security { table users, login email password, token jwt, protect /api/posts }
```
Generates: `/api/auth/register` (bcrypt), `/api/auth/login` (JWT 7-day), `/api/auth/me`, auth middleware, rate limiting. Passwords never returned.

### Data Binding (Frontend to Backend)
```nyx
data posts = get /api/posts           # Plain fetch
data posts = get /api/posts auth      # With JWT Bearer token
each posts -> div preset=card { h3 .title, p .body }
```

## Common Mistakes

```
WRONG                                 RIGHT
------                                -----
<div class="flex">                    section flex=row { }
className="text-lg"                   style { fs 1.125rem }
onClick={() => set(c+1)}              button "+" -> count = count + 1
import React from 'react'            use "./component.nyx"
export default function App()         page / {
background-color: red;                bg red
border-radius: 12px;                  r 12px
font-size: 0.9rem;                    fs 0.9rem
font-weight: 700;                     fw 700
display: flex;                        d flex (or flex=row attr)
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

## AI Rules
1. **USE SHORTHANDS** — `bg c p m r fs fw w h d op z`, never full CSS names
2. **USE LAYOUT ATTRS** — `flex=col center gap=2rem` not `style { d flex, fd column }`
3. **USE PRESETS** — define once, `preset=name` everywhere
4. **USE THEME** — `var(--colors-primary)` not hardcoded colors
5. **WRAP SIBLINGS** — `div { element }` to prevent merging
6. **ONE FILE** — pages + components + tables + security in one .nyx
7. **NO CLOSING TAGS** — `{ }` blocks, not `</div>`
8. **PROPS = `.`** — `.title` references prop inside component
9. **STRINGS = `""`** — always double quotes
10. **COMMENTS = `#`**

## Token Comparison (measured with cl100k_base)

| Scenario | NyxCode v0.8 | Next.js+Tailwind | Savings |
|----------|-------------|-----------------|---------|
| Static page | 187 tokens | 251 tokens | **25%** |
| Full-stack app | 169 tokens | 964 tokens | **82%** |
| Files needed | 1 | 12+ | **92%** |

## Version
v0.8.0 — CSS Shorthands, Layout Attributes, Complete AI Docs
Site: https://nyxcode.io/
