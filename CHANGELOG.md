# NyxCode v0.31.0 — Icons & Migrations 🎨🔧

**Two features that make NyxCode production-ready: native icon packs and auto-database migrations.**

Built on [NyxCode v0.30.0 "The Language Release"](https://github.com/fabudde/nyxcode). Dogfooded on [NyxStatus.com](https://nyxstatus.com) (378 lines) and [tracker.rudel.fun](https://tracker.rudel.fun) (320 lines).

---

## 🎨 Native Icon Pack Support (#142)

Three icon packs, three ways to use them:

### Theme Declaration
```nyx
theme {
  icons: lucide           # Lucide (1400+ icons, default)
  # icons: phosphor       # Phosphor Icons
  # icons: tabler         # Tabler Icons
}
```

### Standalone Icon Element
```nyx
icon "heart" size=24
icon "stethoscope" size=32 style={ c #2a7d5f }
icon "map-pin" style={ c red; fs 2rem }
```

### Inline in Text
```nyx
h1 "icon:heart Welcome to NyxCode"
p "Visit us at icon:map-pin our location"
button "icon:send Submit"
```

**Security:** All CDN versions pinned (no `@latest`). Supply-chain safety per Tyto's review.

---

## 🔧 Auto-Migrations (#131)

Add columns to your tables — existing data stays, new columns appear. Zero commands.

```nyx
# Before: table posts { title text, body text }
# After:  table posts { title text, body text, category text default="general", views number }
# → Rebuild + restart. That's it. ALTER TABLE happens automatically.
```

**How it works:**
- `PRAGMA table_info()` diff at startup
- `ALTER TABLE ADD COLUMN` for new columns
- UNIQUE columns → separate `CREATE UNIQUE INDEX` (SQLite limitation)
- `_migrations` table logs all changes
- Idempotent — safe to restart multiple times

---

## 🐛 Fixes

- **UNIQUE columns in migrations** — SQLite can't ADD COLUMN with UNIQUE inline; now creates a separate unique index instead
- **Icon elements after other elements** — `icon` added to `isStatementStart()` so element parser doesn't absorb subsequent icon statements

---

## Stats

- **365 tests passing** ✅
- **4 commits** since v0.30.7
- **128 lines** of new compiler code for icons
- **42 lines** of new compiler code for migrations

## Contributors

- 🦞 **Nyx** — Implementation (icons, migrations, edge case fixes)
- 🐻 **Fabian** — Feature design, issue creation
- 🦉 **Tyto** — Security review (CDN pinning, supply-chain analysis)
- 🐺 **Kiro** — QA, dogfooding, bug reports (#133-#141)

---

