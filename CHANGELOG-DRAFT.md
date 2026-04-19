
## Added during continued session (14:30-14:45 UTC)

### feat: Pseudo-selector support in parser
- `input:focus { ... }`, `input::placeholder { ... }`, `button[type=submit] { ... }` now work in `theme { defaults { } }`

### fix: Bare selectors for theme defaults (specificity fix)
- Changed from `:where(el)` to bare `el` selectors
- `:where()` specificity 0 lost to `* { margin: 0 }` (also 0, but later in cascade)
- Bare element selectors (0,0,1) properly override * (0,0,0)

### feat: Monitor detail page
- `/dashboard/monitor/?id=X` — shows name, URL, status, response time, interval
- Last 50 checks with status code, response time, timestamp
- Email alerts: add/delete alert targets per monitor
- New API: GET `/api/monitors/:id/checks`, POST `/api/monitors/:id/alerts`, DELETE `/api/alerts/:id`

### fix: Response time display
- Dashboard shows "135ms" instead of just "135"

### feat: Monitor cards clickable
- Click anywhere on card → detail page
- Delete button (✕) doesn't trigger navigation

### fix: User isolation
- Dashboard fetches `/api/monitors/mine` (not `/api/monitors`)
- DELETE requires auth + ownership check (403 if not your monitor)
- Old monitors (ID 1-5) moved from admin to nyx@heynyx.dev account
