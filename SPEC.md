# NyxCode Language Specification v0.1

## 1. File Structure

Every `.nyx` file is self-contained. No imports needed. The compiler resolves dependencies automatically.

```
project/
  pages/
    index.nyx        # → /
    dashboard.nyx    # → /dashboard
    users.nyx        # → /users
  components/
    header.nyx       # reusable component
    card.nyx         # reusable component
  api/
    users.nyx        # API endpoints
  data/
    schema.nyx       # database schema
  app.nyx            # global config (optional)
```

File location = route. No router config needed.

## 2. Core Constructs

### 2.1 Pages
```nyx
page /path {
  # page content
}
```
A page is a route + component. Auth, data, and layout are declared inline.

### 2.2 Components
```nyx
component Name {
  props prop1 prop2?  # ? = optional
  # component content
}
```
Used inside pages or other components: `Name prop1="value"`

### 2.3 Data Fetching
```nyx
data varname = get /api/endpoint
data varname = query "SQL here"
data varname = post /api/endpoint { body }
```
Data is reactive. Changes auto-update the UI.

### 2.4 Iteration
```nyx
each collection -> element { content using .field }
each collection as item -> element { content using .item.field }
```

### 2.5 Conditionals
```nyx
when condition -> content
when condition -> content
else -> content
```

### 2.6 Events
```nyx
on click -> action
on submit -> post /api/endpoint
on hover -> toggle .classname
```

### 2.7 Styling
```nyx
style {
  bg color
  padding value
  text color size weight
  margin value
  border value
  radius value
  shadow value
  flex direction gap
  grid cols gap
}
```
Short-form CSS. `bg red` = `background-color: red`. No colons, no semicolons.

### 2.8 API Endpoints
```nyx
api METHOD /path {
  auth level          # none|required|admin
  validate { rules }
  # logic
  respond code { body }
}
```

### 2.9 Database Schema
```nyx
table users {
  id auto
  name string required
  email email unique
  role enum[user,admin] default=user
  created timestamp auto
}
```

### 2.10 Global State
```nyx
store theme {
  mode = "dark"
  toggle -> { mode = mode == "dark" ? "light" : "dark" }
}
```
Access anywhere: `$theme.mode`, `$theme.toggle`

## 3. Type System

Types are inferred. Explicit types optional:
```nyx
data count: number = query "SELECT count(*) FROM users"
data name: string = "hello"
data active: bool = true
data items: list = get /api/items
```

Built-in types: `string`, `number`, `bool`, `list`, `map`, `date`, `email`, `url`

## 4. Operators

| Operator | Meaning |
|----------|---------|
| `.` | Property access (.name = current context's name) |
| `->` | Arrow / then / pipe |
| `==` | Equality |
| `!=` | Not equal |
| `>` `<` `>=` `<=` | Comparison |
| `&` | AND |
| `\|` | OR |
| `!` | NOT |
| `$` | Global store access |
| `?` | Optional |
| `..` | Range |

## 5. Built-in Elements

### Layout
`row`, `col`, `grid`, `stack`, `container`, `section`, `aside`, `nav`, `footer`

### Content
`h1`-`h6`, `p`, `text`, `span`, `link`, `img`, `video`, `icon`

### Interactive
`button`, `input`, `select`, `checkbox`, `radio`, `toggle`, `slider`, `textarea`

### Data Display
`card`, `badge`, `table`, `list`, `metric`, `chart`, `avatar`, `tag`

### Feedback
`alert`, `toast`, `modal`, `tooltip`, `progress`, `spinner`

## 6. Compiler Output

NyxCode compiles to:
- **Static sites:** HTML + CSS + vanilla JS
- **Dynamic sites:** HTML + CSS + JS with fetch/hydration
- **Full-stack:** + Node.js API server (Express)

Target is configurable:
```
nyx build --target static
nyx build --target dynamic
nyx build --target fullstack
```

## 7. Error Prevention

Common AI coding errors that NyxCode prevents structurally:

| AI Error | How NyxCode Prevents It |
|----------|------------------------|
| Forgotten imports | No imports exist |
| Missing keys in lists | `each` auto-generates keys |
| Undefined state | `data` is always initialized |
| Missing error handling | `data` has built-in error/loading states |
| Wrong event syntax | `on` keyword is consistent |
| CSS specificity wars | Styles are scoped by default |
| Missing null checks | Optional chaining via `?` built-in |
| Routing misconfig | File = route, no config |

## 8. Styling System

NyxCode has a 3-tier styling system: opinionated defaults with escape hatches.

### 8.1 Inline Shorthand (90% of cases)
Properties directly on elements. Ultra token-efficient.
```nyx
h1 "Hello" color=blue size=2rem bold
button "Click" bg=purple radius=8px padding=1rem
card shadow=lg radius=md padding=1.5rem
```

### 8.2 Style Blocks (complex styling)
Scoped by default. No naming conflicts possible.
```nyx
component Card {
  style {
    bg white
    radius 12px
    shadow md
    padding 1.5rem
    hover { shadow lg, translate y=-2px }
    @mobile { padding 1rem }
    @tablet { padding 1.25rem }
  }
  slot
}
```

### 8.3 Raw CSS (escape hatch)
Full CSS control when needed. Compiler passes through unchanged.
```nyx
style raw {
  .custom-animation {
    animation: spin 1s infinite;
    backdrop-filter: blur(10px);
  }
}
```

### 8.4 Theme (global design tokens)
Defined in `app.nyx`, accessible everywhere via `$`:
```nyx
theme {
  colors { primary #7c3aed, accent #00d4aa, bg #0a0a0f, text #e0e0e0 }
  fonts { body "Inter", code "JetBrains Mono" }
  spacing { sm 0.5rem, md 1rem, lg 2rem, xl 4rem }
  radius { sm 4px, md 8px, lg 16px }
  shadow { sm "0 1px 2px rgba(0,0,0,0.1)", md "0 4px 6px rgba(0,0,0,0.1)", lg "0 10px 15px rgba(0,0,0,0.1)" }
}
```
Usage: `bg $primary`, `padding $md`, `radius $lg`

### 8.5 Responsive Design
Built-in breakpoint keywords:
```nyx
component Hero {
  style {
    padding 4rem
    grid cols=3 gap=2rem
    @mobile { padding 2rem, grid cols=1 }
    @tablet { padding 3rem, grid cols=2 }
  }
}
```
Default breakpoints: `@mobile` (<768px), `@tablet` (768-1024px), `@desktop` (>1024px)

### 8.6 Animations
```nyx
button "Submit" animate=fade-in duration=0.3s
card animate=slide-up delay=0.1s

# Custom animation:
style {
  animate custom {
    from { opacity 0, translate y=20px }
    to { opacity 1, translate y=0 }
  }
}
```

### 8.7 Compiler Output
The style system compiles to:
- Scoped CSS classes (auto-generated, no conflicts)
- CSS Custom Properties for themes
- Only used styles in output (tree-shaking)
- Minified in production

## 9. Error Handling

### 9.1 Data Error States
`data` declarations have implicit `loading`, `error`, and `empty` states:
```nyx
data users = get /api/users

# Implicit states (compiler generates these):
when users.loading -> spinner
when users.error -> alert .users.error.message
when users.empty -> p "No users found"
each users -> card { h3 .name }
```

### 9.2 Custom Error Handling
```nyx
data users = get /api/users {
  loading -> skeleton rows=5
  error -> alert "Failed to load users" retry
  empty -> card { h2 "No users yet", button "Add first user" -> navigate /users/new }
}
```

### 9.3 API Error Responses
API endpoints automatically handle errors. Internal details never exposed:
```nyx
api GET /users/:id {
  auth required
  data user = query "SELECT * FROM users WHERE id = $id"
  when user.empty -> respond 404 { error "User not found" }
  respond 200 .user
}
```

## 10. Query Compilation (Tyto's Question #1)

`query` in a `page` does NOT run SQL in the browser. The compiler generates:
1. A server-side API endpoint (auto-generated, hidden)
2. A client-side `fetch()` call to that endpoint
3. Proper prepared statements on the server

```nyx
# You write:
page /users {
  data users = query "SELECT * FROM users"
  each users -> card { h3 .name }
}

# Compiler generates:
# SERVER: GET /api/__generated/users_page_users → db.query("SELECT * FROM users")
# CLIENT: fetch('/api/__generated/users_page_users').then(render)
```

This is transparent to the developer. Write SQL where you think about it, the compiler handles the architecture.

## 11. Scoping & Isolation (Tyto's Question #2)

- **Styles:** Scoped per component/page automatically (CSS Modules-style)
- **Stores:** Global but access-controlled (private/public fields)
- **Data:** Scoped to the declaring page/component
- **Naming:** Auto-scoped by filename + component name. No manual BEM, no conflicts.

## 12. Reserved for v0.2+

- `test` — built-in testing
- `i18n` — internationalization
- `cache` — caching directives
- `stream` — real-time data (WebSocket)
- `worker` — background processing
- `cron` — scheduled tasks
- `TypeScript output` — optional TS compilation target

## 9. Security (Tyto's Security Review 🦉🔒)

NyxCode is **secure-by-default**. The compiler enforces security at the language level.

### 9.1 SQL Injection Prevention
All `query` statements compile to **prepared statements**. Always. No exceptions.
```nyx
# This:
query "SELECT * FROM users WHERE name = $name"

# Compiles to (Node.js):
db.query("SELECT * FROM users WHERE name = $1", [name])
```
String concatenation in queries is a **compiler error**.

### 9.2 XSS Prevention
All output is **HTML-escaped by default**. Content rendered via `.field` or string interpolation is automatically encoded.
```nyx
p .user.name          # Auto-escaped: <script> becomes &lt;script&gt;
p raw .user.bio       # Explicit opt-in for unescaped HTML (use with caution!)
```
The `raw` keyword is required for unescaped output. The compiler emits a warning when `raw` is used.

### 9.3 Authentication Scope
API endpoints declare auth **independently**. Auth does NOT inherit from the calling page.
```nyx
# Page has auth, but API must declare its own:
page /admin { auth required }

api DELETE /users/:id {
  auth admin              # Required! Cannot rely on page-level auth.
  query "DELETE FROM users WHERE id = $id"
  respond 204
}
```
API endpoints without explicit `auth` default to `auth none` and the compiler emits a warning.

### 9.4 CSRF Protection
Forms that use `post`, `patch`, `put`, or `delete` automatically include CSRF tokens.
```nyx
form signup {
  # CSRF token is auto-generated and validated. No opt-in needed.
  input name required
  submit "Sign Up" -> post /api/register
}
```
This is **always on**. Cannot be disabled per-form.

### 9.5 Rate Limiting
API endpoints support rate limiting via the `limit` keyword:
```nyx
api POST /login {
  limit 10/min
  validate { email email, password string }
  # ...
}
```
Default rate limit (configurable in `app.nyx`): `limit 100/min` for all endpoints.

### 9.6 Validation Error Handling
When `validate` fails, the compiler generates an automatic **400 response** with sanitized error details:
```json
{
  "error": "validation_failed",
  "fields": {
    "email": "must be a valid email",
    "name": "required"
  }
}
```
Internal details (stack traces, SQL errors) are **never** exposed. In development mode, detailed errors go to the console only.

### 9.7 Store Scoping
Global stores have explicit access control:
```nyx
store userPrefs {
  private token           # Only accessible within this store's actions
  public theme = "dark"   # Readable from any component
  toggle -> { theme = theme == "dark" ? "light" : "dark" }
}
```
Components cannot directly mutate stores — only via declared actions.

### 9.8 Security Configuration
Global security settings in `app.nyx`:
```nyx
security {
  escape html default     # Auto-escape all output
  csrf auto               # CSRF tokens on all forms
  sql prepared            # Prepared statements only
  headers strict          # Strict security headers (CSP, HSTS, X-Frame)
  rateLimit 100/min       # Default rate limit for all API endpoints
}
```
These are the **defaults**. Relaxing any setting requires explicit opt-out and generates a compiler warning.

### 9.9 Security Headers
The compiler auto-generates strict HTTP security headers:
- `Content-Security-Policy` (restrictive default)
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
