# Changelog

## v0.5.0 "Fifth Molt — Full Stack" 🦞 (2026-04-13)

### 🔥 Full-Stack Backend Compiler

NyxCode is now a **full-stack language**. Write 30 lines of .nyx, get a complete app with database, REST API, and authentication.

- **`table` blocks → SQLite + auto-CRUD**
  ```nyx
  table users {
    name text required
    email email unique
    password text required
    role text default="user"
    created auto
  }
  ```
  → Generates CREATE TABLE + GET/POST/PUT/DELETE endpoints automatically.

- **`security` blocks → JWT Auth**
  ```nyx
  security {
    table users
    login email password
    token jwt
    protect /api/posts
  }
  ```
  → Register, Login, /me endpoints + route protection middleware.

- **`nyx build app.nyx`** now generates:
  - `index.html` — frontend
  - `server.js` — Express + better-sqlite3 + JWT server

### 🔐 Security (Tyto's Review)

- **SQL Injection prevention** — PUT handler uses column allowlist, not raw req.body keys
- **Rate limiting** — express-rate-limit on /api/auth (20 req/15min)
- **Password hash filtering** — Never exposed in GET responses
- **JWT Secret warning** — Logs warning when using random fallback

### 🐛 Parser Fixes

- **Table column parsing** — Type keywords (text, email, number etc.) correctly separated from column names
- **Security block parsing** — Multi-value rules like `login email password` parsed correctly
- **`icon` removed from ELEMENT_TAGS** — No more phantom elements when used as prop name

### 📊 Token Efficiency
- 30 lines NyxCode → 178 lines Express+SQLite+JWT server
- **~50x token efficiency** for backend code

### 🙏 Contributors
- **Nyx 🦞** — Backend compiler, auth compiler, parser fixes, integration
- **Tyto 🦉** — Security review (4 findings, all fixed in 7 minutes!)
- **Biene Backend 🐝** — Initial backend-compiler.ts



## v0.4.0 "Fourth Molt" 🦞 (2026-04-13)

### 🔥 New Features

- **`nyxcode dev` — Dev Server with Hot Reload**
  Zero-config dev server with SSE live reload. Edit your .nyx file, browser updates instantly.
  ```bash
  npx @fabudde/nyxcode dev app.nyx          # localhost:3000
  npx @fabudde/nyxcode dev app.nyx --port=8080
  ```

- **`nyxcode parse` — AST Debug Command**
  Inspect the parsed AST of any .nyx file. Essential for debugging and compiler development.
  ```bash
  npx @fabudde/nyxcode parse app.nyx
  ```

- **`--watch` Mode**
  Rebuild on file changes without a dev server.
  ```bash
  npx @fabudde/nyxcode watch app.nyx
  ```

- **Default Props**
  Components can now define default values for props.
  ```nyx
  component Card {
    props title="Untitled" theme="dark"
    h2 .title
  }
  Card              # uses defaults
  Card title="Hi"   # overrides title
  ```

- **Element CSS Defaults**
  Buttons, inputs, selects, and textareas get sensible base styles automatically. No more unstyled native elements.

- **NYXCODE.md — AI Context File**
  Drop this file into any AI's context window and it can generate NyxCode immediately. Complete syntax reference with examples.

- **Icons Documentation**
  Four ways to use icons: Emoji (zero deps), Lucide, Font Awesome, Material Icons — all via `head` CDN injection.

### 🐛 Bug Fixes

- **CSS Comma Properties** — `font-family: Inter, sans-serif` no longer breaks the parser. Properties like `transition`, `animation`, `background`, `box-shadow` etc. now correctly preserve commas in values.

- **Smart Title Detection** — Custom `<title>` via `head` injection now overrides the default "NyxCode App" title instead of duplicating it.

- **`icon` Reserved Word** — `icon` was incorrectly listed as an HTML element tag AND mapped to `<i>`. Using `icon` as a prop name (e.g. `props icon title`) caused phantom `<icon>` elements in output. Fixed: removed from ELEMENT_TAGS and compiler tag mapping.

- **String State Quoting** — Button onclick handlers with string values now preserve quotes correctly (Kiro's Bug #1).

- **Head Script Escaping** — Scripts injected via `head` containing double-quoted HTML attributes no longer break the page.

### 📊 Stats
- 15 example files, all compile clean
- Dev server: ~400 lines, zero third-party dependencies
- NYXCODE.md: complete language reference for LLM code generation

### 🙏 Contributors
- **Nyx 🦞** — Compiler development, dev server, bug fixes, documentation
- **Kiro 🐺** — First third-party user, found the string state bug
- **Tyto 🦉** — Reviewed NYXCODE.md, suggested dev server priority
- **Biene 3 🐝** — Built watch mode + CSS comma fix

---

## v0.3.0 "Third Molt" (2026-04-12)
- Multi-file SSG with automatic SEO
- Layout system (`layout { slot }`)
- Component slots
- Validator pass
- Multi-file imports (`use "./file.nyx"`)
- VS Code Extension (17 pattern groups)

## v0.2.0 "Second Molt" (2026-04-11)
- Components with props
- SPA router
- Style scoping
- Responsive blocks

## v0.1.0 "First Molt" (2026-04-11)
- Initial release
- Pages, elements, styles
- Static HTML output
