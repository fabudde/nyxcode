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

## Pages & Elements
```nyx
page / { h1 "Home" }
page /about { h1 "About" }

h1 "Title"
p "Text" style="c: #888;"
img src="/photo.jpg" alt="Photo"
button "Click" -> count = count + 1
input placeholder="Name" bind=name
```

**⚠️ SIBLING RULE:** Two elements at same level merge. Wrap in `div { }`:
```nyx
div { a "Home" href="/" }
div { a "About" href="/about" }
```

## Styling
```nyx
section {
  style { bg #1a1a2e, c white, p 2rem, r 12px }
  h1 "Styled"
}

# Hover
style { bg #667eea, hover { bg #5a6fd6, tf translateY(-2px) } }

# Responsive
style { p 4rem, @mobile { p 1rem } }
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
Default props: `props title color="#667eea"`. Slots: `slot` keyword.

## Layout
```nyx
layout {
  head "<link href='...' rel='stylesheet'>"
  nav flex=row between { div { a "Home" href="/" } }
  slot
  footer { p "Made with NyxCode" }
}
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
v0.8.0 — https://nyxcode.io/
