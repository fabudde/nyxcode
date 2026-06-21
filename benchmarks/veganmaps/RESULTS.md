# VeganMaps: NyxCode vs Next.js

The same app — a live vegan-restaurant map (OpenStreetMap + Overpass) with user
accounts (JWT), a favorites system (SQLite), search, a fully-vegan/vegan-options
toggle, and "near me" geolocation — built twice.

- **NyxCode**: [`examples/vegan-maps.nyx`](../../examples/vegan-maps.nyx) — live at https://vegan.heynyx.dev
- **Next.js**: [`nextjs/`](./nextjs) — App Router + better-sqlite3 + jsonwebtoken + Leaflet

## By the numbers

| | NyxCode | Next.js | |
|---|---|---|---|
| Files (source) | **1** | 10 (+3 config) | 13× fewer |
| Code lines (excl. comments/blank) | **129** | 383 | ~3× fewer |
| Source bytes | **9.6 KB** | 21.3 KB | 2.1× smaller |
| Approx. tokens | **~2.4k** | ~5.0k | 2.1× fewer |
| Hand-written backend | `table` + `security` (~12 lines) | db.ts + auth.ts + 3 route handlers (~95 lines) | |
| Map | declarative `map`/`marker` (~12 lines) | 138-line imperative client component | |
| Config to author | **none** (auto-generated) | package.json, tsconfig, next.config | |

> Token counts are the chars/4 heuristic on source only (no `node_modules`, no
> lockfiles). The gap widens once you count the config/boilerplate a Next.js repo
> needs and an AI has to emit or keep consistent.

## Honest assessment — what's actually better where

This is not a hit piece on either side. I built both; here's the straight call.

### Where NyxCode genuinely wins
- **Density & one mental model.** 1 file, ~2.4k tokens, no build config. The whole
  app fits in a single context window with room to spare.
- **The full-stack stuff is nearly free.** `table favorites { user [users] … }` +
  `security { … }` gave me SQLite, migrations, a JWT register/login flow, a CRUD API,
  and per-user protected routes in ~12 lines. In Next.js I hand-wrote `lib/db.ts`,
  `lib/auth.ts`, and three route handlers (~95 lines) for the same thing.
- **Declarative map.** `map source="overpass" … { marker … }` vs a 138-line React
  component wiring Leaflet, debounced refetch, refs, and effect dependencies by hand.
- **AI economy.** Fewer tokens, far less surface area to get wrong, one file to edit.
  For AI-written code this is a real, measurable advantage.

### Where Next.js genuinely wins (and it's not close)
- **Type safety.** Real end-to-end TypeScript: a `Place` interface, typed API
  payloads, compile-time errors. NyxCode is dynamically typed — and building this app
  surfaced exactly the class of bug a typed/mature compiler prevents: `set x = not y`
  emitted the literal word `not` (invalid JS, the toggle silently died); the arrow
  handler form swallowed a trailing `style=`; `success -> navigate` was dropped. I had
  to fix the **compiler itself** ~5 times to finish this app. Next.js wouldn't have hit
  any of those.
- **Ecosystem & maturity.** npm, react-leaflet, SSR, middleware, a decade of Stack
  Overflow. NyxCode is young; you live within what the compiler supports, and you hit
  walls.
- **Debugging & tooling.** Source maps, real stack traces, React DevTools, a full LSP,
  refactoring, ESLint. NyxCode generates code — debugging the output is indirect, and
  editor support is basic.
- **Hiring & longevity.** Millions know React. Approximately nobody knows NyxCode.

### My verdict
For **this app**, and for **AI-first development where token economy and a single
coherent file matter more than ecosystem**, NyxCode is genuinely better — dramatically
less code, and auth/DB/API/map are almost free. That conciseness is real.

But it rests on a **young compiler**. Shipping this exposed several real language bugs I
had to fix as I went. Today, for a team shipping production software, **Next.js is the
safer, more powerful, more debuggable, more hireable choice** — type safety and a mature
ecosystem are worth a lot more than they look on a line-count table.

NyxCode's bet is that AI writes most code and that tokens + coherence will matter more
than ecosystem depth. The 2× density gap is real and the DX is improving fast. If it
keeps closing the robustness/type-safety gap, that bet gets very hard to argue against
for AI-generated apps. It isn't there yet — but the direction is right.

*Built and measured 2026-06-21. The NyxCode version is verified running live; the
Next.js version is written idiomatically (standard App Router patterns) but a full
`next build` was not run in this environment.*
