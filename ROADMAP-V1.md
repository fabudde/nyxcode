# NyxCode v1.0 Roadmap — "The Full-Stack Paradigm"

> "30 Zeilen = komplette Full-Stack App" — das ist die Story.
> 
> Feedback von: Tyto 🦉 (Language Design), Kiro 🐺 (User Experience), Nyx 🦞 (Lead Dev), Fabian 🐻 (Creator)

---

## 🎯 Vision für v1.0

NyxCode v1.0 ist keine Template-Sprache. Es ist die erste **AI-native Full-Stack Sprache**.

Eine AI schreibt eine `.nyx` Datei → komplette App mit DB, Auth, API, Frontend, Error Handling, Types, Tests.

**Der Moat:** Kein anderes Tool generiert aus deklarativem Code eine vollständige Full-Stack App. Svelte braucht SvelteKit + Prisma + Auth.js. Next braucht 15 Dateien. NyxCode braucht eine.

---

## 📦 Release Plan

### v0.10 — "Component Power" (Kiro's Pain Points)
**Ziel:** Components so gut machen dass niemand mehr inline styles braucht.

- [ ] **Style Blocks auf Prop-Elemente** (Kiro's #1 Request)
  ```nyx
  component Card {
    props title desc
    h3 .title { fs 1.3rem, c text, fw 700 }
    p .desc { fs 0.88rem, c text-muted, lh 1.65 }
  }
  ```
  Statt: `h3 .title style="fs: 1.3rem; c: text; fw: 700"`
  **Impact:** ~500 Tokens gespart bei rudel.fun allein.

- [ ] **`a` als Element-Tag** (zusätzlich zu `link`)
  AIs denken zuerst an `a`, nicht `link`. Beides soll funktionieren.

- [ ] **Inline styles als Anti-Pattern dokumentieren**
  NYXCODE.md updaten: Style blocks > Presets > Inline (in der Reihenfolge)

### v0.11 — "Data Flow" (Tyto's #1 Concern)
**Ziel:** NyxCode skaliert über Landing Pages hinaus.

- [ ] **Deklarative Loading/Error States**
  ```nyx
  data posts = get /api/posts auth {
    loading -> div { Spinner, p "Loading..." }
    error -> div { p "Failed to load posts" }
    empty -> p "No posts yet"
  }
  each posts -> Card { h3 .title, p .body }
  ```
  **Warum:** Aktuell passiert bei API-Fehlern: nichts. Kein Loading, kein Error.

- [ ] **Component Events (up-flow)**
  ```nyx
  component TodoItem {
    props text id
    button "Delete" on:click -> emit delete .id
  }
  
  page / {
    each todos -> TodoItem on:delete -> remove .id
  }
  ```

- [ ] **Stores (shared state)**
  ```nyx
  store auth {
    user = null
    token = localStorage.token
    login(email, password) -> fetch /api/auth/login
    logout -> token = null, user = null
  }
  
  page / {
    when auth.user { p "Hello {auth.user.name}" }
  }
  ```

### v0.12 — "Type Safety" (Tyto's #2 Concern)
**Ziel:** Fehler beim Kompilieren finden, nicht zur Laufzeit.

- [ ] **Optional Types auf State/Props**
  ```nyx
  state count: int = 0
  state name: text = ""
  state items: list = []
  ```

- [ ] **Table Types fließen zum Frontend**
  ```nyx
  table posts { title text required, body text }
  data posts = get /api/posts   # Compiler weiß: posts hat .title und .body
  each posts -> p .titel        # ← COMPILE ERROR: .titel nicht in posts
  ```

- [ ] **Form Validation aus Table Constraints**
  ```nyx
  table users { email email unique required, name text required }
  form /api/auth/register {
    input email    # ← Compiler generiert automatisch: type="email", required
    input name     # ← Compiler generiert automatisch: required
    submit "Register"
  }
  ```

### v0.13 — "Relations & Real Apps"
**Ziel:** Echte Apps mit mehreren Tabellen und Beziehungen.

- [ ] **Table Relations**
  ```nyx
  table users { name text required, email email unique }
  table posts { title text, body text, author [users] required }
  table comments { text text, post [posts], author [users] }
  ```
  Auto-generiert: JOINs, nested API responses, cascade deletes.

- [ ] **Pagination**
  ```nyx
  data posts = get /api/posts page=1 limit=10
  Paginator posts
  ```

- [ ] **File Uploads**
  ```nyx
  form /api/posts auth {
    input title
    file avatar accept="image/*" max=5mb
    submit "Create"
  }
  ```

- [ ] **Search/Filter**
  ```nyx
  data posts = get /api/posts search=query sort=created
  input query placeholder="Search..." on:input -> refetch posts
  ```

### v0.14 — "Realtime & Jobs"
**Ziel:** NyxCode Apps fühlen sich lebendig an.

- [ ] **WebSocket Subscriptions**
  ```nyx
  live messages = subscribe /api/messages
  each messages -> div { p .text, span .author }
  ```

- [ ] **Scheduled Jobs**
  ```nyx
  job cleanup every=1h {
    delete from posts where created < 30d
  }
  ```

- [ ] **Webhooks**
  ```nyx
  hook /webhooks/stripe on=payment.success {
    update users set premium = true where stripe_id = .customer
  }
  ```

### v1.0 — "Ship It"
**Ziel:** Production-ready. Keine Ausreden.

- [ ] **Testing**
  ```nyx
  test "create post" {
    register user email="test@test.com" password="123"
    login user
    post /api/posts { title "Test", body "Content" } -> 201
    get /api/posts -> has { title "Test" }
  }
  ```

- [ ] **Deploy Adapters**
  - `nyxcode deploy vercel` → Serverless Functions + Static
  - `nyxcode deploy railway` → Docker Container
  - `nyxcode deploy fly` → Fly.io Machines
  - `nyxcode deploy docker` → Dockerfile generation

- [ ] **`nyxcode init`** — Interactive project setup
- [ ] **`nyxcode migrate`** — DB schema migrations
- [ ] **Production Hardening** — Connection pooling, CORS config, env vars, HTTPS
- [ ] **Documentation Site** — Built in NyxCode (dogfooding!)

---

## 🚫 Bewusst NICHT in v1.0

- **Eigenes Runtime/VM** — Node ist der richtige Call (Tyto bestätigt)
- **TypeScript-Level Type System** — Zu komplex. Optionale simple Types reichen
- **Server Components / Streaming SSR** — Overengineered für den Use Case
- **Plugin System** — Erst wenn die Kernsprache stabil ist
- **Package Manager** — npm reicht

---

## 📊 Erfolgskriterien v1.0

| Metrik | Ziel |
|--------|------|
| Full-Stack Blog | ≤20 Zeilen |
| Full-Stack Todo App mit Auth | ≤40 Zeilen |
| Full-Stack E-Commerce (basic) | ≤100 Zeilen |
| Token-Effizienz vs Next.js | ≥80% weniger |
| Compile Time | <500ms für 100-Zeilen App |
| Zero-Config Deploy | Ein Befehl |
| Test Coverage | Eigenes Test-Framework |

---

## 🏷️ Story für die Welt

**NICHT sagen:** "68% weniger CSS Tokens" / "Besseres HTML" / "Tailwind Alternative"

**SAGEN:** 
- "30 Zeilen NyxCode = Full-Stack App mit DB, Auth und API"
- "Die erste Sprache die für AI-Autoren gebaut wurde"
- "Describe WHAT you want. NyxCode generates the HOW."

---

*Erstellt: 14. April 2026*
*Team: Fabian 🐻 + Nyx 🦞 + Tyto 🦉 + Kiro 🐺*
