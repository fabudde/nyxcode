# Benchmark Results — Full-Stack Blog

**Date:** 2026-04-16
**Host:** Linux x64, Node v22.22.0
**NyxCode:** v0.21.0
**Next.js:** 14.2.15

Both apps implement the identical feature set:

- SQLite database with `posts` and `users` tables
- User authentication: email + password, bcrypt hashing, JWT tokens (7-day expiry)
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/posts` (protected, requires Bearer token)
- `POST /api/posts` (protected, requires Bearer token)
- Rate limiting on auth endpoints (10 req/min per IP)
- HTML form for creating posts, list view for reading them
- Input validation on API endpoints
- Themed styling (dark mode, purple accent)

## Results

| Metric | NyxCode | Next.js + Prisma + JWT | Ratio | Reduction |
|---|---:|---:|---:|---:|
| Source files | **1** | 19 | 19× | 94.7% |
| Lines of code | **31** | 488 | 15.7× | 93.6% |
| Bytes of source | **639** | 12,547 | 19.6× | 94.9% |
| AI tokens (cl100k_base) | **183** | 3,350 | 18.3× | **94.5%** |
| Config files | **0** | 9 | — | 100% |
| Direct dependencies | **0** | 19 (7 prod + 12 dev) | — | 100% |
| Installed packages (transitive) | **39** | 415 | 10.6× | 90.6% |
| `node_modules` size | **15 MB** | 442 MB | 29.5× | 96.6% |
| Install time (warm cache) | **2 s** | 7 s | 3.5× | 71.4% |
| Build time | **0.09 s** | 15 s | 167× | **99.4%** |

## Token reduction

183 tokens (NyxCode) vs 3,350 tokens (Next.js) = **94.5% fewer tokens**.

For LLM-generated code in 2026, this is the metric that matters most. Lower
tokens mean less context budget spent on boilerplate, cheaper API calls, and
faster first-token latency when the AI writes or modifies the app.

## Methodology

- **Source files:** `find -type f` excluding `node_modules`, `.next`, database files.
- **Lines/bytes:** `wc -l` / `wc -c` summed across all source files.
- **Tokens:** Python `tiktoken` with `cl100k_base` encoding (GPT-4/Claude-compatible).
- **Install time:** `npm ci` (Next.js) / `npm install @fabudde/nyxcode` (NyxCode) with warm npm cache. Cold-cache timings would be larger for both, but the ratio stays similar.
- **Build time:** Wall-clock from command start to completion. Next.js build includes `prisma generate` and SQLite schema push (required for compile).
- **Dependencies:** `dependencies` + `devDependencies` in `package.json` for Next.js. NyxCode has zero runtime dependencies; the compiler pulls in 38 transitive packages at install time.

## Caveats

- **Functional parity, not identical UX.** The Next.js page uses React
  hydration and client-side state; the NyxCode page uses server-rendered
  HTML with declarative data bindings. Both work. Both are styled. Both
  handle auth correctly. They aren't byte-identical runtime HTML, but
  they deliver the same user-facing blog.

- **Next.js code is written idiomatically**, not maximally golfed. No
  unnecessary boilerplate beyond what Next + Prisma + JWT conventions
  require. If you wanted to, you could shave ~50 lines off with
  aggressive inlining — but that's not how real Next.js code looks.

- **The NyxCode app is *not* minimal either** — it's the same 31 lines
  from the README hero example. That's the point.

- **Rate limiting in NyxCode is built into `security { }`**, not opt-in.
  In Next.js it required `lib/rate-limit.ts` (22 lines) plus calling it
  from each auth endpoint.

## Reproduce

```bash
# Clone the repo
git clone https://github.com/fabudde/nyxcode.git
cd nyxcode/benchmarks/blog

# NyxCode build
cd nyxcode
npm i -g @fabudde/nyxcode
time nyx build app.nyx

# Next.js install + build
cd ../nextjs
echo 'DATABASE_URL="file:./dev.db"' > .env
echo 'JWT_SECRET="change-me-in-production-min-32-chars-long"' >> .env
time npm ci
time npm run build

# Count metrics
find . -type f ! -path "*/node_modules/*" ! -path "*/.next/*" | wc -l
find . -type f ! -path "*/node_modules/*" ! -path "*/.next/*" -exec cat {} + | wc -l
```

## Source

- [`nyxcode/app.nyx`](./nyxcode/app.nyx) — 31 lines
- [`nextjs/`](./nextjs/) — 19 files, 488 lines

🦞
