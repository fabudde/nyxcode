# NyxCode Cheat Sheet

## Structure
```nyx
theme { colors { primary #667eea, bg #0a0a12 }, fonts { heading "Inter, sans-serif" } }
preset card { bg card, r 12px, p 2rem }
layout { nav { a "Home" href=/ } slot }
page / { h1 "Hello" }
page /about { p "About us" }
```

## Elements
```nyx
h1 "Title"                              # Text content
p "Styled" style={ c primary, fs 2rem } # Inline NyxCode styles
a "Link" href=/about                    # Attributes
img src="/photo.jpg" alt="Photo"        # Void elements (auto lazy)
button "Click" on:click -> count = count + 1
div flex=col center gap=2rem { }        # Layout wrapper
```

## HTML Tables
```nyx
table style={ w 100%, bc #333 } {
  thead { tr { th "Name"  th "Role" } }
  tbody {
    tr { td "Nyx"  td "Developer" }
    tr { td "Kiro" td "QA Lead" }
  }
}
```

## Select Dropdowns
```nyx
select name="role" {
  option "Pick one" value=""
  option "Admin" value="admin"
  option "User" value="user"
}
```

## Styling
```nyx
# Inline (simple)
h1 "Hi" style={ fs 2rem, fw 700, c primary }

# Multi-line (complex)
div style={
  mw 1200px
  mx auto
  p 2rem
  bg card
  r 12px
} { }

# Style block (hover/responsive/animations)
h1 "Title" {
  style {
    fs 3rem, fw 900, c primary
    hover { c accent, tf scale(1.02) }
    @mobile { fs 2rem }
    @tablet { fs 2.5rem }
  }
}

# Presets (reusable)
preset card { bg card, r 12px, p 2rem, border 1px solid rgba(255,255,255,0.1) }
div $card { p "Using preset" }     # $card shorthand
div preset=card { p "Same thing" } # explicit
```

## CSS Shorthands (75+)
```
bg=background  c=color     p=padding    m=margin     r=border-radius
fs=font-size   fw=font-weight  ff=font-family  lh=line-height
w=width  h=height  mw=max-width  mh=max-height  miw=min-width
d=display  pos=position  z=z-index  op=opacity  of=overflow
ai=align-items  jc=justify-content  fd=flex-direction  fg=flex-grow
gap/gg=gap  tf=transform  tr=transition  anim=animation
ta=text-align  td=text-decoration  tt=text-transform
shadow=box-shadow  cur=cursor  fi=filter  bf=backdrop-filter
```

## Layout Attributes
```nyx
div flex=col          # display:flex; flex-direction:column
div flex=row          # display:flex; flex-direction:row
div grid=3            # display:grid; grid-template-columns:repeat(3,1fr)
div grid=3@1          # 3 cols desktop, 1 col mobile (auto @media)
div center            # align-items:center; justify-content:center
div between           # justify-content:space-between
div gap=2rem          # gap:2rem
```

## Components
```nyx
component Card {
  props title, subtitle="Default", color="primary"
  div $card {
    h2 .title style={ c .color }
    p .subtitle
    slot   # ← children go here
  }
}

# Usage:
Card title="Hello" { p "Child content" }
```

## State & Events
```nyx
state count = 0
state name = "World"
computed label = count > 0 ? "positive" : "zero"
button "Count: {count}" on:click -> count = count + 1
button "Reset" on:click -> count = 0
h1 "Hello {name}"
p "Status: {label}"   # {var} works with state AND computed
```

## Forms (zero JS!)
```nyx
form /api/posts auth {
  input title placeholder="Title"
  input body placeholder="Content"
  submit "Publish"
  success -> reload          # or: redirect /path, toast "Saved!", clear
  error -> toast "Failed!"
}
```

## Data Fetching
```nyx
data posts = get /api/posts auth {
  loading -> p "Loading..."
  empty -> p "No posts yet."
  error -> p "Failed to load."
}
each posts -> div $card {
  h3 .title
  p .body
  small .author.name    # nested access (auto optional chaining)
}

# Realtime (WebSocket):
data msgs = live /api/messages auth { }
```

## Conditionals
```nyx
when .role == "admin" { button "Delete" }
else { span "Read only" }
when .premium -> badge "PRO"   # inline
```

## Full-Stack (Backend)
```nyx
table users {
  name text required min=2 max=50
  email text required unique format=email
  password password required min=8
  role text default="user"
  avatar upload                    # file upload
  created auto
}
table posts {
  title text required
  body text required
  author [users]                   # relation → auto JOIN
  created auto
}

security {
  table users
  login email password
  token jwt
  protect /api/posts write         # GET open, POST/PUT/DELETE need auth
  protect /api/admin all role=admin # role-based
}

# Custom API:
api GET /api/stats auth {
  query "SELECT COUNT(*) as total FROM posts"
}
```

## Config & Hooks
```nyx
config {
  port 4000
  cors http://localhost:3000
  env JWT_SECRET "dev-secret"
}
before POST /api/* {
  log "Incoming: {method} {path}"
}
```

## Multi-File
```nyx
# components.nyx
component Header { ... }
component Footer { ... }

# main.nyx
use "./components.nyx"
page / { Header {} slot Footer {} }
```

## Comments
```nyx
# This is a comment
h1 "Hello" # Inline comment
# #fff is a hex color (alphanumeric after #)
```

## Gotchas
- Strings MUST be `"quoted"` — no bare text
- Components start with Uppercase
- `style={ }` = NyxCode shorthands, `style=""` = raw CSS
- Sibling elements need wrapping `div {}`
- `head "<link ...>"` for third-party resources (fonts, icons)
- `script { raw JS here }` as escape hatch
- Theme colors: `c primary` not `c var(--colors-primary)`
- `$card` = `preset=card` shorthand
