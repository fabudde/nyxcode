# NyxCode v0.27.3 — CHANGELOG DRAFT

## 🔥 The Full-Stack Language Release

NyxCode is now a real full-stack language. One `.nyx` file = Frontend + Backend + DB + Auth + Background Workers + Live Data Bindings. No frameworks, no boilerplate, no post-build patches.

---

## Language Features

### `page /path auth` — Page-Level Authentication
```nyx
page /dashboard auth {
  h1 "My Dashboard"
}
```
Auto-redirects to `/login` if no JWT token. No JavaScript needed.

### `visible=auth` / `visible=guest` — Conditional Visibility
```nyx
nav {
  a "Login" href="/login" visible=guest
  a "Dashboard" href="/dashboard" visible=auth
  a "Logout" visible=auth onclick="..."
}
```
Elements show/hide based on auth state. Auto-injects toggle script only when used.

### `$param.id` — URL Parameter Binding
```nyx
page /detail auth {
  data item = get "/api/items/$param.id" auth
  each item -> i {
    h1 .name
  }
}
```
Extracts `?id=X` from URL, auto-guards with redirect if missing.

### `.field` in ALL Template Attributes
```nyx
each users -> user {
  img src=.avatar alt=.name
  a href="/profile/.id" title=.name
  div data-role=.role class=.status
}
```
Previously only worked in text content and href. Now resolves in every attribute. CSS decimals (`.5rem`) preserved in style attributes.

### Single-Object API Response Wrapping
```nyx
data user = get "/api/users/$param.id" auth
each user -> u { h1 .name }
```
APIs returning a single object (not array) auto-wrapped in `[object]` for `each` compatibility.

### `every` — Background Workers
```nyx
every 60s 'health-check' {
  query "SELECT * FROM monitors WHERE status != 'paused'"
  fetch $row.url
}
```
Runs background tasks on intervals. 5s minimum floor. SIGTERM cleanup. Multi-statement `$row` loops with `fetch $row.url` for HTTP health checks.

### Auto-Detect Input Types
```nyx
form /api/auth/register {
  input email
  input password
  input url
}
```
Field names `password`, `email`, `url`, `number`, `phone`, `search` auto-set HTML input types.

## Backend Features

### Pagination
All GET endpoints auto-support `?page=1&limit=20` → `{ data: [...], pagination: { page, limit, total, totalPages } }`. Backwards-compatible (no params = flat array).

### Search & Filtering
All GET endpoints auto-support `?search=term&status=active` → WHERE clauses, SQL-injection-safe.

### `fetch $row.url` in `every` Blocks
Auto-generates HTTP health checks: fetch with 10s timeout, measure response time, store status_code + response_ms + created_at.

## Compiler Fixes

### Trust Proxy — Auto-Generated
`app.set('trust proxy', true)` now auto-included. No more manual patching for reverse proxy setups (Caddy/nginx).

### Route Ordering — Custom APIs Before CRUD
Custom `api` routes (e.g. `/api/monitors/mine`) now generate BEFORE auto-CRUD routes (`/api/monitors/:id`). Fixes Express route matching order.

### `flex=row between center` — Conflicting Justify-Content
`between` and `center` no longer both emit `justify-content`. `between` wins (it's more specific). Issue #127.

## Theme & Styling

### Pseudo-Selectors in Theme Defaults
```nyx
theme {
  defaults {
    input:focus { bc color.primary; shadow 0 0 0 3px rgba(0,229,160,0.15) }
    input::placeholder { c color.muted }
    button[type=submit] { bg color.primary }
  }
}
```

### Bare Selectors (Specificity Fix)
Theme defaults now use bare element selectors (specificity 0,0,1) instead of `:where()` (0,0,0). Properly overrides `* { margin: 0 }`.

### `::selection` in Theme
```nyx
theme {
  selection { bg rgba(0,229,160,0.3) }
}
```

## NyxStatus — Dogfood Proof
Built entirely in NyxCode. One `site.nyx` file (~750 lines) → 9 pages, 7 tables, JWT auth, real-time health checks, email alerts, public status pages. Live at https://nyxstatus.com.

**Stats:**
- 0 `head "<style>"` injections (was 6)
- 2 `head "<script>"` injections (business logic only — addAlert/deleteAlert)
- 0 post-build patches needed
- 13 native presets
- 5 monitors, checks every 60s
