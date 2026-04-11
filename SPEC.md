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

## 8. Reserved for v0.2+

- `test` — built-in testing
- `i18n` — internationalization
- `cache` — caching directives
- `stream` — real-time data (WebSocket)
- `worker` — background processing
- `cron` — scheduled tasks
