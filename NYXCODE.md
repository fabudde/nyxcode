# NYXCODE.md — AI Context File
# Give this file to any AI to generate NyxCode.

## What is NyxCode?
A token-efficient web language that replaces TypeScript/Next.js. One file = full-stack app. Built for AI code generation.

## Quick Start
```bash
npx @fabudde/nyxcode build app.nyx    # Compile to HTML
npx @fabudde/nyxcode dev app.nyx      # Dev server + hot reload
```

## Full Example: Landing Page
```nyx
component Feature {
  props icon title description
  section {
    style { bg #0d0d1a, radius 12px, padding 2rem, text-align center }
    span .icon style="font-size: 2.5rem; display: block; margin-bottom: 1rem;"
    h3 .title style="color: #e0e0f0; margin-bottom: 0.5rem;"
    p .description style="color: #8888a8; font-size: 0.9rem;"
  }
}

page / {
  head "<link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap' rel='stylesheet'>"
  head "<style>body { font-family: Inter, sans-serif; }</style>"

  section {
    style { max-width 900px, margin 0 auto, padding 4rem 2rem, text-align center }
    
    h1 "NyxCode" style="font-size: 3rem; font-weight: 700; background: linear-gradient(135deg, #667eea, #f093fb); -webkit-background-clip: text; -webkit-text-fill-color: transparent;"
    p "The AI-native programming language for the web." style="color: #8888a8; font-size: 1.2rem; margin-bottom: 3rem;"
    
    section {
      style { display grid, grid-template-columns repeat(3, 1fr), gap 1.5rem }
      Feature icon="⚡" title="Token Efficient" description="68% fewer tokens than React"
      Feature icon="🎯" title="Zero Config" description="No webpack, no tsconfig, no babel"
      Feature icon="🔒" title="Secure by Default" description="No eval, auto-escaping, safe state"
    }
  }
}
```

## Core Syntax

### Pages (= Routes)
```nyx
page / {
  h1 "Hello World"
}

page /about {
  h1 "About"
  p "This is my app."
}
```
Each `page /path { }` = one route. File-based routing without files.

### Elements
```nyx
# Text
h1 "Title"
h2 "Subtitle"
p "Paragraph"
span "Inline text"
link "Click me" href="/about"

# Interactive
button "Click" -> count = count + 1
input placeholder="Type here..." bind=name
select { option "A", option "B" }
textarea placeholder="Write..."

# Media
img src="/photo.jpg" alt="A photo"

# Layout
section { ... }
nav { ... }
footer { ... }
header { ... }
div { ... }
```

### Styling (3 Tiers)

**Tier 1: Style blocks (90% of cases)**
```nyx
section {
  style {
    bg #1a1a2e
    color white
    padding 2rem
    radius 12px
    display flex
    gap 1rem
    shadow 0 4px 12px rgba(0, 0, 0, 0.2)
    transition all 0.2s
  }
  h1 "Styled section"
}
```

Common shorthands: `bg` = background, `radius` = border-radius, `shadow` = box-shadow. Most CSS properties pass through directly.

**Responsive:**
```nyx
style {
  padding 4rem
  grid-template-columns repeat(3, 1fr)
  @mobile { padding 2rem, grid-template-columns 1fr }
  @tablet { padding 3rem }
}
```

**Hover/Focus/Active:**
```nyx
style {
  bg #667eea
  hover { bg #5a6fd6, transform translateY(-2px) }
  focus { outline 2px solid #667eea }
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

**Tier 3: Raw CSS (escape hatch)**
```nyx
head "<style>body { font-family: Inter, sans-serif; }</style>"
head "<link href='https://fonts.googleapis.com/css2?family=Inter&display=swap' rel='stylesheet'>"
```

### Reactive State
```nyx
state count = 0
state name = "World"
computed double = count * 2

h1 count                           # Auto-updates when count changes
p name
button "+" -> count = count + 1
button "Reset" -> count = 0
input bind=name                    # Two-way binding
```

### Components
```nyx
component Card {
  props title description icon
  section {
    style { bg #1a1a2e, radius 12px, padding 1.5rem }
    span .icon style="font-size: 2rem;"
    h3 .title
    p .description
  }
}

# Usage:
Card title="Fast" description="Really fast" icon="⚡"
Card title="Simple" description="Zero config" icon="🎯"
```

**Default props:**
```nyx
component Button {
  props label color="#667eea" size="1rem"
}
Button label="Click"                    # Uses defaults
Button label="Go" color="red"          # Overrides color
```

**Slots (nested content):**
```nyx
component Modal {
  props title
  section {
    h2 .title
    slot                                # Children go here
  }
}

Modal title="Confirm" {
  p "Are you sure?"
  button "Yes"
}
```

### Layout (wraps all pages)
```nyx
layout {
  nav {
    link "Home" href="/"
    link "About" href="/about"
  }
  section {
    style { margin-left 260px, padding 3rem }
    slot                                # Page content goes here
  }
  footer { p "Made with NyxCode" }
}
```

### Imports
```nyx
use "./components/navbar.nyx"
use "./layout.nyx"
```

### Iteration
```nyx
each items -> item {
  p .name
  span .description
}
```

### Conditionals
```nyx
when loggedIn -> p "Welcome back!"
else -> link "Login" href="/login"
```

### Forms
```nyx
form action="/api/contact" method="POST" {
  input name placeholder="Name" required
  input email type="email" placeholder="Email" required
  textarea message placeholder="Message"
  submit "Send"
}
```

### Comments
```nyx
# This is a comment
```

### Head Injection
```nyx
head "<title>My Page</title>"
head "<meta name='description' content='My NyxCode app'>"
```

## Icons

**Emoji icons (zero deps, recommended):**
```nyx
span "🦞" style="font-size: 2rem;"
span "⚡" style="font-size: 1.5rem;"
```

**Lucide Icons (lightweight SVG icons):**
```nyx
head "<link href='https://unpkg.com/lucide-static@latest/font/lucide.css' rel='stylesheet'>"

span "" class="icon-home" style="font-size: 1.5rem;"
span "" class="icon-settings"
span "" class="icon-user"
```

**Font Awesome:**
```nyx
head "<link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css' rel='stylesheet'>"

span "" class="fa-solid fa-house" style="font-size: 1.5rem;"
span "" class="fa-brands fa-github"
span "" class="fa-solid fa-rocket"
```

**Material Icons:**
```nyx
head "<link href='https://fonts.googleapis.com/icon?family=Material+Icons' rel='stylesheet'>"

span "home" class="material-icons"
span "settings" class="material-icons"
```

**SVG inline (via head injection):**
```nyx
head "<svg style='display:none'><symbol id='logo' viewBox='0 0 24 24'><path d='...'/></symbol></svg>"

# Then use:
head "<svg width='24' height='24'><use href='#logo'/></svg>"
```

## Common Mistakes (DO NOT)

```
❌ WRONG                              ✅ RIGHT
─────────────────────────────────────────────────────
<div class="flex">                    section { style { display flex } }
</div>                                }
className="text-lg"                   style { font-size 1.125rem }
onClick={() => setCount(c+1)}         button "+" -> count = count + 1
import React from 'react'            use "./component.nyx"
export default function App() {       page / {
<img src="x.jpg" />                   img src="x.jpg"
{isLoggedIn && <p>Hi</p>}            when loggedIn -> p "Hi"
{items.map(i => <li>{i}</li>)}        each items -> item { p .name }
background-color: red;                bg red
border-radius: 12px;                  radius 12px
```

**Key differences from React/HTML:**
- No closing tags — use `{ }` braces
- No JSX — elements are keywords, not XML
- No CSS classes — use `style { }` blocks
- No semicolons — one property per line in style blocks
- No imports from npm — `use` imports .nyx files only

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Style not applied | `style { }` must be INSIDE the element's `{ }` block |
| Component not found | Define components BEFORE pages (top of file) |
| Props not showing | Use `.propName` inside component (dot prefix) |
| State not updating | Check arrow syntax: `-> varName = expression` |
| Page not routing | Each page needs unique path: `page /path { }` |
| Import not working | Use relative paths: `use "./file.nyx"` |

## Rules for AI Code Generation

1. **Minimize tokens** — use shorthands (`bg` not `background-color`)
2. **One file when possible** — pages + components + state in one .nyx file
3. **No closing tags** — NyxCode uses `{ }` blocks, not `</div>`
4. **Props with `.`** — inside components, `.title` references the prop
5. **State is reactive** — just declare `state x = 0`, use `x` in elements
6. **Style blocks, not classes** — no `class="flex items-center"`, use `style { display flex }`
7. **`->` for events** — `button "Go" -> count = count + 1`
8. **`bind=` for two-way** — `input bind=name`
9. **Strings use `""`** — always double quotes
10. **Comments use `#`**

## Token Comparison

| Framework | Files | Lines | Config |
|-----------|-------|-------|--------|
| Next.js   | 22    | 1200  | 5 files |
| NyxCode   | 1     | 545   | 0 files |

## Full-Stack (Backend)

`nyx build` generates **both** `index.html` (frontend) and `server.js` (backend) from a single `.nyx` file.

**Required npm packages:** `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `express-rate-limit`

### Tables (= Database)
```nyx
table users {
  name text required
  email email unique
  password text required
  role text default="user"
  created auto
}

table posts {
  title text required
  body text
  author users          # Foreign key → users(id)
  published bool default=false
  created auto
}
```

Every table gets an `id` (auto-increment primary key) automatically. Each table generates a full CRUD REST API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/users` | GET | List all |
| `/api/users/:id` | GET | Get one |
| `/api/users` | POST | Create |
| `/api/users/:id` | PUT | Update |
| `/api/users/:id` | DELETE | Delete |

**Column types:**

| NyxCode | SQLite | Notes |
|---------|--------|-------|
| `text` | TEXT | General string |
| `email` | TEXT | Treated as text in DB |
| `number` / `int` | INTEGER | Whole numbers |
| `float` / `decimal` | REAL | Decimal numbers |
| `bool` | INTEGER | 0/1 |
| `auto` | DATETIME | Auto-set to `CURRENT_TIMESTAMP` |
| `users` (table name) | INTEGER | Foreign key → `users(id)` |

**Constraints:** `required` (NOT NULL), `unique` (UNIQUE), `default="value"` (DEFAULT)

### Security (= Auth)
```nyx
security {
  table users             # Which table stores users
  login email password    # Fields for authentication
  token jwt               # JWT-based tokens
  protect /api/posts      # Require auth for this path
}
```

This generates:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account (hashes password with bcrypt) |
| `/api/auth/login` | POST | Returns JWT token (7-day expiry) |
| `/api/auth/me` | GET | Get current user (requires token) |

Protected routes require `Authorization: Bearer <token>` header. Rate-limited to 20 requests per 15 minutes.

Passwords are **never returned** in any API response.

### Data Binding (Frontend → Backend)
```nyx
data users = get /api/users
data posts = get /api/posts
```

- Fetches the URL on page load
- Stores the result in a JS variable
- Use with `each` to render lists:

```nyx
data posts = get /api/posts

each posts -> post {
  h3 .title
  p .body
}
```

### Complete Full-Stack Example

**30 lines → full-stack app with database, auth, CRUD API, and frontend:**

```nyx
# Full-Stack NyxCode Demo
# 30 lines → complete app with DB, Auth, CRUD API

table users {
  name text required
  email email unique
  password text required
  role text default="user"
  created auto
}

table posts {
  title text required
  body text
  author users
  published bool default=false
  created auto
}

security {
  table users
  login email password
  token jwt
  protect /api/posts
}

page / {
  h1 "My Blog"

  data posts = get /api/posts

  each posts -> post {
    section {
      style { bg #1a1a2e, radius 12px, padding 1.5rem, margin-bottom 1rem }
      h3 .title
      p .body
    }
  }
}
```

**What `nyx build` generates from this:**
- `index.html` — SPA with routing, components, reactive state
- `server.js` — Express server with SQLite, CRUD for `users` + `posts`, JWT auth, bcrypt password hashing, rate limiting

**Token efficiency:**

| Stack | Lines | Files |
|-------|-------|-------|
| TypeScript + Express + Prisma + React | ~500 | 10+ |
| NyxCode | 30 | 1 |

## Version
v0.3.1 — Docs: https://nyxcode.io/docs/
