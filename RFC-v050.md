# RFC: NyxCode v0.50 — The Complete Language

**Authors:** Nyx 🦞 + Kiro 🐺
**Date:** 2026-04-27
**Status:** DRAFT — Awaiting Fabian's approval

---

## The Problem

NyxCode v0.40 is a powerful DSL but NOT a programming language. Evidence:

1. **Every UI pattern = new compiler code.** Rating, wizard, toggle, choice = 4 TypeScript functions in compiler.ts. Next app needs datepicker? Another compiler function. Chatbubble? Another one. This doesn't scale.

2. **Frontend logic is limited.** `on:click` can do `set` and `push`, but not conditionals, loops, API calls, or multi-step logic. Real apps need real logic.

3. **Components are shallow.** No typed props, no named slots, no lifecycle, no event forwarding. Can't build a design system.

4. **Backend and frontend are separate languages.** Backend has `fn`, `match`, `try/catch`, `each`, `while`. Frontend has... `set` and `push`. They should be ONE language.

5. **No standard library.** Everything is compiler-hardcoded or raw HTML/JS.

## The Goal

**One `.nyx` file = complete fullstack app. ANY web app. AI writes it in 3.5x fewer tokens than Next.js.**

NyxCode v0.50 should be able to build:
- ✅ Typeform clone (wizard, conditional logic, ratings)
- ✅ Trello clone (drag-drop, lists, cards, real-time)
- ✅ Chat app (WebSocket, messages, typing indicators)
- ✅ Dashboard (charts, tables, filters, pagination)
- ✅ E-commerce (cart, checkout, payments)
- ✅ Blog/CMS (CRUD, rich text, image upload)
- ✅ Auth flows (login, register, forgot password, OAuth)

## Design Principles

1. **Token efficiency.** `let x = 0` not `const [x, setX] = useState(0)`. Every character earns its place.
2. **One language, everywhere.** Same syntax in backend `api {}`, frontend `page {}`, and components.
3. **Compiler knows primitives.** Elements like `div`, `button`, `input`. Everything else is NyxCode components.
4. **Explicit > magic.** You see what's reactive. No hidden re-renders.
5. **Progressive complexity.** Simple things are simple. Complex things are possible.

---

## 1. UNIFIED EXPRESSION LANGUAGE

### 1.1 Variables & Assignment
```nyx
let count = 0                    # mutable, reactive in pages
let name = "Nyx"                 # string
let items = ["a", "b", "c"]     # array
let config = { theme: "dark" }   # object
const API_URL = "https://..."    # immutable, compile-time
```

### 1.2 Operators
```nyx
# Arithmetic
x + y    x - y    x * y    x / y    x % y

# Comparison
x == y   x != y   x > y   x < y   x >= y   x <= y

# Logic
x and y   x or y   not x

# String interpolation
"Hello {name}, you have {count} items"

# Ternary
x > 0 ? "positive" : "negative"

# Nullish
user.name ?? "Anonymous"

# Member access
user.profile.avatar
items[0]
config["theme"]
```

### 1.3 Functions
```nyx
fn add(a, b) { return a + b }
fn greet(name = "world") { return "Hello {name}" }

# Arrow-style (for inline)
fn double(x) { x * 2 }

# Multi-line
fn processOrder(order) {
  let total = 0
  each order.items -> item {
    set total = total + item.price * item.qty
  }
  return { total, tax: total * 0.19 }
}
```

### 1.4 Control Flow
```nyx
# Conditionals
if count > 0 {
  p "Has items"
} else if count == 0 {
  p "Empty"
} else {
  p "Negative?!"
}

# Pattern matching
match status {
  "active"  -> badge "Active" color=green
  "pending" -> badge "Pending" color=yellow
  "banned"  -> badge "Banned" color=red
  _         -> badge "Unknown" color=gray
}

# Loops
each items -> item { div "{item.name}" }
each items -> item, index { div "#{index}: {item.name}" }
for i in 0..10 { span "{i}" }
while condition { ... }

# Error handling
try {
  let data = fetch GET "/api/data"
} catch err {
  toast error "Failed: {err.message}"
}
```

### 1.5 Array/Object Methods
```nyx
# Array
items.push("new")
items.pop()
items.shift()
items.filter(fn(item) { item.active })
items.map(fn(item) { item.name })
items.find(fn(item) { item.id == targetId })
items.sort(fn(a, b) { a.price - b.price })
items.length

# Object
keys(config)
values(config)
entries(config)
merge(defaults, overrides)
```

---

## 2. REACTIVE SYSTEM (SolidJS-Semantics)

### 2.1 Signals (Auto from `let` in pages)
```nyx
page / {
  let count = 0        # → Signal. Compiler wraps in createSignal()
  let name = ""        # → Signal
  let items = []       # → Reactive Array (tracks mutations)

  p "Count: {count}"   # → Auto-subscribes, updates on change
  input value=".name"  # → Two-way binding
}
```

### 2.2 Computed Values
```nyx
page / {
  let price = 100
  let qty = 1
  let total = { price * qty }         # → Computed. Re-evaluates when deps change.
  let formatted = { "${total.toFixed(2)}€" }

  p "Total: {formatted}"
}
```

### 2.3 Effects
```nyx
page / {
  let query = ""

  effect {
    if query.length > 2 {
      let results = fetch GET "/api/search?q={query}"
      set searchResults = results
    }
  }
}
```

### 2.4 Reactive Arrays
```nyx
page / {
  let todos = []

  button "Add" on:click {
    push todos { text: "New todo", done: false }
  }

  each todos -> todo, i {
    div {
      checkbox checked=".todos[{i}].done"
      span "{todo.text}"
      button "×" on:click { remove todos i }
    }
  }
}
```

### 2.5 Stores (Complex State)
```nyx
store cart {
  items: []
  total: { items.reduce(fn(sum, i) { sum + i.price * i.qty }, 0) }

  fn add(product) {
    let existing = items.find(fn(i) { i.id == product.id })
    if existing {
      set existing.qty = existing.qty + 1
    } else {
      push items { ...product, qty: 1 }
    }
  }

  fn remove(id) {
    set items = items.filter(fn(i) { i.id != id })
  }

  fn clear() { set items = [] }
}
```

---

## 3. COMPONENTS (First-Class)

### 3.1 Definition with Typed Props
```nyx
component Button(label: string, variant = "primary", disabled = false) {
  button class="btn btn-{variant}" disabled=disabled on:click { emit click } {
    "{label}"
  }
}

component Card(title: string) {
  div class="card" {
    div class="card-header" { h3 "{title}" }
    div class="card-body" { slot }
  }
}
```

### 3.2 Usage
```nyx
page / {
  use Button("Click me", variant="danger") on:click { set count = count + 1 }

  use Card("My Card") {
    p "This goes into the slot"
    p "Multiple children work"
  }
}
```

### 3.3 Named Slots
```nyx
component Layout(title: string) {
  div class="layout" {
    header { slot header }
    main { slot }
    footer { slot footer }
  }
}

page / {
  use Layout("App") {
    slot header { nav { link "/" "Home", link "/about" "About" } }
    p "Main content here"
    slot footer { p "© 2026" }
  }
}
```

### 3.4 Component Events
```nyx
component SearchInput(placeholder = "Search...") {
  let query = ""
  input value=".query" placeholder=placeholder on:input {
    emit search query
  }
}

page / {
  let results = []
  use SearchInput on:search -> q {
    set results = fetch GET "/api/search?q={q}"
  }
}
```

### 3.5 StdLib Components (replace hardcoded)
```nyx
# These ship as stdlib/rating.nyx, stdlib/wizard.nyx, etc.
# Users can import or override them.

component Rating(max = 5, value = 0) {
  let hovered = -1
  div class="rating" {
    for i in 1..max+1 {
      span class="star {i <= (hovered >= 0 ? hovered : value) ? 'filled' : ''}"
        on:mouseenter { set hovered = i }
        on:mouseleave { set hovered = -1 }
        on:click { emit change i }
        "★"
    }
  }
}

component Wizard() {
  let step = 0
  let steps = children.length

  div class="wizard" {
    div class="progress" {
      for i in 0..steps {
        div class="dot {i <= step ? 'active' : ''}"
      }
    }
    each children -> child, i {
      if i == step { child }
    }
    div class="nav" {
      button "← Back" disabled={step == 0} on:click { set step = step - 1 }
      button "{step == steps - 1 ? 'Submit' : 'Next →'}" on:click {
        if step < steps - 1 { set step = step + 1 }
        else { emit complete }
      }
    }
  }
}
```

---

## 4. EVENT HANDLERS (Full Language)

### 4.1 Multi-Statement Handlers
```nyx
button "Save" on:click {
  set saving = true
  try {
    let result = fetch POST "/api/save" { title, body }
    toast success "Saved!"
    set saving = false
    navigate "/posts/{result.id}"
  } catch err {
    toast error "Failed: {err.message}"
    set saving = false
  }
}
```

### 4.2 Event Types
```nyx
input on:input { set query = event.target.value }
input on:keydown.enter { call submitForm() }
div on:scroll { if event.scrollY > 100 { set showNav = true } }
form on:submit.prevent { call handleSubmit() }
div on:click.outside { set menuOpen = false }
```

### 4.3 Keyboard Shortcuts
```nyx
page / {
  on:key.ctrl+s { call save() }
  on:key.escape { set modalOpen = false }
  on:key.ctrl+k { set searchOpen = true }
}
```

---

## 5. DATA FETCHING (Unified)

### 5.1 Server-Side (in API/Action blocks)
```nyx
api /posts {
  fn list(page = 1, limit = 20) {
    let posts = query "SELECT * FROM posts LIMIT :limit OFFSET :offset" {
      limit, offset: (page - 1) * limit
    }
    respond posts
  }

  fn create(title, body) auth {
    let post = query "INSERT INTO posts (title, body, author_id) VALUES (:title, :body, :uid) RETURNING *" {
      title, body, uid: auth.id
    }
    respond post status=201
  }
}
```

### 5.2 Client-Side (in Pages)
```nyx
page /posts {
  let posts = fetch GET "/api/posts"              # auto-loading state
  let loading = posts.loading                      # boolean
  let error = posts.error                          # null or error

  if loading { spinner "Loading..." }
  if error { alert "Error: {error.message}" }

  each posts.data -> post {
    use PostCard(post)
  }
}
```

### 5.3 Mutations
```nyx
page /posts/new {
  let title = ""
  let body = ""

  form on:submit.prevent {
    let result = fetch POST "/api/posts" { title, body }
    if result.ok {
      navigate "/posts/{result.data.id}"
    }
  } {
    input value=".title" placeholder="Title"
    textarea value=".body" placeholder="Write..."
    button "Publish" type="submit"
  }
}
```

---

## 6. REAL-TIME (WebSocket + SSE)

### 6.1 WebSocket
```nyx
# Server
socket /chat {
  on connect -> client {
    broadcast "{client.name} joined"
  }
  on message -> data, client {
    broadcast data
  }
  on disconnect -> client {
    broadcast "{client.name} left"
  }
}

# Client
page /chat {
  let messages = []
  let input = ""

  connect /chat -> msg {
    push messages msg
  }

  each messages -> msg { p "{msg}" }
  input value=".input" on:keydown.enter {
    send input
    set input = ""
  }
}
```

### 6.2 SSE (Server-Sent Events)
```nyx
# Server
stream /notifications auth {
  each event from notifications.where(user_id: auth.id) {
    yield event
  }
}

# Client
page /dashboard {
  subscribe /notifications -> event {
    push alerts event
    toast info "{event.title}"
  }
}
```

---

## 7. ROUTING (Full SPA)

### 7.1 Static Routes
```nyx
page / { h1 "Home" }
page /about { h1 "About" }
page /pricing { h1 "Pricing" }
```

### 7.2 Dynamic Routes
```nyx
page /posts/:id {
  let post = fetch GET "/api/posts/{params.id}"
  h1 "{post.data.title}"
  p "{post.data.body}"
}

page /users/:userId/posts/:postId {
  # params.userId, params.postId available
}
```

### 7.3 Protected Routes
```nyx
page /dashboard auth {
  # Redirects to /login if no token
  h1 "Welcome, {auth.user.name}"
}

page /admin auth role="admin" {
  # Redirects if not admin
}
```

### 7.4 Navigation
```nyx
link "/posts" "All Posts"              # auto SPA navigation
button "Go" on:click { navigate "/dashboard" }
# navigate(path) — programmatic routing
# navigate(-1) — go back
```

### 7.5 Layouts
```nyx
layout /app {
  nav { link "/" "Home", link "/about" "About" }
  main { slot }
  footer { p "© 2026" }
}

page /app/ layout=/app { h1 "Dashboard" }
page /app/settings layout=/app { h1 "Settings" }
```

---

## 8. FORMS & VALIDATION

### 8.1 Declarative Forms
```nyx
page /register {
  let email = ""
  let password = ""
  let errors = {}

  form on:submit.prevent {
    set errors = validate {
      email: required email
      password: required min=8
    }
    if not errors {
      fetch POST "/api/register" { email, password }
    }
  } {
    input type="email" value=".email" error=".errors.email"
    input type="password" value=".password" error=".errors.password"
    button "Register" type="submit"
  }
}
```

### 8.2 Validation Rules
```nyx
validate {
  name: required min=2 max=50
  email: required email
  age: required number min=18
  url: url
  password: required min=8 matches="^(?=.*[A-Z])(?=.*[0-9])"
  confirm: required equals=password
}
```

---

## 9. STYLING (Already Strong — Keep It)

Keep everything that works:
- CSS shorthands (`bg`, `p`, `m`, `r`, `fs`, `fw`, etc.)
- Tailwind classes (`class="flex items-center gap-4"`)
- Theme tokens (`theme { colors { primary #667eea } }`)
- Presets (`preset card { bg white, r 12px, p 2rem }`)
- Dark mode (`@dark { bg #0a0a12 }`)
- Responsive (`@md { fs 1.5rem }`)
- Animations (`@keyframes fadeIn { ... }`)

---

## 10. BACKEND (Already Strong — Extend)

Keep and extend:
- `table` — auto CRUD
- `auth` — JWT auth
- `api` — custom endpoints
- `pipe` — data pipelines
- `action` — reusable functions
- `email` — email sending
- `use` — package system

### 10.1 New: Background Jobs
```nyx
job cleanupExpired every="1h" {
  query "DELETE FROM sessions WHERE expires_at < NOW()"
}

job sendDigest every="1d" at="09:00" {
  let users = query "SELECT * FROM users WHERE digest = true"
  each users -> user {
    email user.email "Daily Digest" template="digest" { user }
  }
}
```

### 10.2 New: File Storage
```nyx
storage uploads {
  path "/uploads"
  max 10mb
  allow ["image/*", "application/pdf"]
  rename uuid
}

api /avatar auth {
  fn upload(file) {
    let url = store file in uploads
    query "UPDATE users SET avatar = :url WHERE id = :uid" { url, uid: auth.id }
    respond { url }
  }
}
```

### 10.3 New: Middleware
```nyx
middleware rateLimit(max = 100, window = "1m") {
  # Applied to routes
}

middleware cors(origins = ["*"]) {
  # CORS headers
}

api /public use=[cors] { ... }
api /private use=[rateLimit(max=10)] auth { ... }
```

---

## 11. TOKEN EFFICIENCY COMPARISON

### NyxCode v0.50
```nyx
table posts { title text required, body text, created auto }
auth { user email password, token jwt }

page / {
  let posts = fetch GET "/api/posts"
  each posts.data -> post {
    card { h2 "{post.title}", p "{post.body}" }
  }
  button "New Post" on:click { navigate "/new" }
}

page /new auth {
  let title = ""
  let body = ""
  form on:submit.prevent {
    fetch POST "/api/posts" { title, body }
    navigate "/"
  } {
    input value=".title" placeholder="Title"
    textarea value=".body"
    button "Publish" type="submit"
  }
}
```
**~20 lines. Complete CRUD blog with auth.**

### Next.js equivalent: ~200 lines across 8 files
### React + Express equivalent: ~350 lines across 12 files

---

## 12. MIGRATION PLAN

### What stays (v0.40 → v0.50)
- All CSS/styling (shorthands, Tailwind, themes, presets)
- Backend (table, auth, api, pipe, action, email)
- Page structure (page, layout, component)
- All 581 tests (nothing breaks)

### What changes
- `let` in pages → full Signal semantics (mostly backward compatible)
- `on:click` → multi-statement handlers (superset of current)
- `when` → unified `if/else` (when still works as alias)
- `each` → works on reactive arrays (superset)

### What's new
- Computed: `let x = { expr }`
- Effects: `effect { }`
- Stores: `store name { }`
- Full `fn` in frontend
- `match` in frontend
- `try/catch` in frontend
- `navigate()`, `connect`, `subscribe`
- `validate` blocks
- Component typed props, named slots, events
- Background `job`
- `storage` blocks
- StdLib: rating.nyx, wizard.nyx, toggle.nyx, etc.

### What gets removed from compiler
- `compileRatingInput` → stdlib/rating.nyx
- `compileToggleInput` → stdlib/toggle.nyx
- `compileChoiceInput` → stdlib/choice.nyx
- `compileWizard` → stdlib/wizard.nyx
- `compileBurgerNav` → stdlib/burger-nav.nyx

---

## 13. IMPLEMENTATION ORDER

1. **Unified expression engine** — same parser for backend + frontend
2. **Signal runtime** — createSignal, createMemo, createEffect
3. **Multi-statement handlers** — on:click { ... multiple statements ... }
4. **Component system v2** — typed props, named slots, events, children
5. **Client-side control flow** — if/else, match, each, for in pages
6. **Client-side functions** — fn in pages
7. **Data fetching** — fetch with loading/error states
8. **Navigation** — navigate(), dynamic routes
9. **Forms/validation** — validate blocks
10. **StdLib migration** — move hardcoded elements to .nyx files
11. **Real-time** — connect, subscribe
12. **Backend extensions** — job, storage, middleware

---

*This is our North Star. Every decision should pass the test: "Does this make NyxCode a LANGUAGE, or just a bigger template?"*

🦞🐺

---

## Appendix A: Design Decisions (Kiro QA Review)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Signal vs Static let | `let` in `page {}` = Signal, `let` in `api {}` = static, `const` = always static | Context determines reactivity. Clean, no new keywords. |
| 2 | Computed dependency tracking | **Runtime** (like SolidJS) | Compile-time misses dynamic refs. `__nyx.track()` auto-subscribes. |
| 3 | Array reactivity granularity | **Phase 1: full re-render.** Phase 2+: fine-grained per item. | Pragmatic. Get it working, then optimize. |
| 4 | Nested object reactivity | **Shallow** (Proxy on top-level) | `set user.score = X` works. New props need `set user = {...user, new: val}`. |
| 5 | `let` in event handlers | **Always local** (not reactive) | Only top-level page `let` = Signal. Handler `let` = temp variable. |
| 6 | Effect cleanup | **Phase 2** | Start without. Add `return { cleanup }` when leaks emerge. |
| 7 | Type inference | **Dynamic** (JS-style) | NyxCode is not TypeScript. Types only on component props. |
| 8 | Migration from v0.40 | **Zero breaking changes** | `createState` IS already a signal internally. Rename, don't rewrite. |
