# NYXCODE.md — AI Context File (v0.11.5)
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
security { table users, login email password, token jwt, protect /api/posts write }
theme { colors { primary #667eea, bg #0a0a12, card #1a1a2e } }
preset card { bg card, r 12px, p 2rem }

page / {
  section style="max-width: 800px; margin: 0 auto; padding: 2rem;" {
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
| `bgc` | background-clip | `bf` | backdrop-filter |
| `fil` | filter | `mix` | mix-blend-mode |
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

## Theme — Colors & Fonts
```nyx
theme {
  colors { primary #667eea, bg #0a0a12, card #1a1a2e, accent #f59e0b }
  fonts { heading "Inter, sans-serif", body "system-ui, sans-serif" }
}
```
- Colors become CSS custom properties: `--colors-primary`, `--colors-bg`, etc.
- **Implicit theme colors (v0.9.0+):** Write `c primary` instead of `c var(--colors-primary)` — compiler auto-resolves!
- Works everywhere: style blocks, presets, inline styles, CSS rules.
- Font heading auto-applies to h1-h6, font body to body/p/span/li.

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
- `img "alt text" src="url"` → `<img alt="alt text" src="url" loading="lazy" />` (v0.11.5+)

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
| `a` | `<a>` (native, v0.11.5+) |
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
img "A photo" src="photo.jpg"            # Alt text as content (v0.11.5+)
div class="hero" id="main" { ... }      # Attributes + children
button "Submit" style="bg: blue"         # Inline style
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
- `{name}` interpolates state in text content
- State changes auto-trigger re-render

### Events (v0.11.5+)
```nyx
button "Click" on:click -> count = count + 1
button "Reset" on:click -> count = 0
```
Both `on:click` and `on click` syntax work (colon optional).
Events work inline on elements AND inside when/else blocks.

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
```nyx
component Card {
  props title, subtitle="Default"
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
- `props` declares accepted properties with optional defaults.
- `slot` renders children passed to the component.
- `.propName` accesses prop values as content.
- Components start with uppercase.

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

## Imports (multi-file)
```nyx
use "./components.nyx"
use "./layout.nyx"

page / { MyComponent title="Hello" }
```
Imports components AND layouts from other `.nyx` files.

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

**Protect modes (v0.11.5+):**
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

### Loading/Error/Empty States (v0.11.5+)
```nyx
data posts = get /api/posts auth {
  loading -> p "Loading posts..."
  error -> p "Something went wrong!"
  empty -> p "No posts yet. Write one!"
}
each posts -> Card { h3 .title, p .body }
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
| `img` shows `value=` instead of `alt=` | Update to v0.11.5+ |
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

## Version
v0.11.5 — 21 releases. Security-reviewed by Tyto 🦉 (9.5/10). QA by Kiro 🐺 (6 bugs found + fixed).
