# Full-Stack Blog Benchmark 🐺📊

**NyxCode v0.11.5 vs Next.js 15 + Prisma + JWT**

Identical app, identical design, pixel-perfect. Measured with `tiktoken` (`cl100k_base`).

## Features (both implementations)

- 🔐 User registration + login (JWT, bcrypt)
- ✍️ Create posts (auth-protected writes, public reads)
- 👤 Foreign key relations (posts → users, comments → posts + users)
- 🗑️ Cascade deletes
- ⚡ Rate limiting on auth endpoints
- 🎨 Identical dark theme with Space Grotesk / Inter fonts
- 📱 Stats bar, PostCard component, hero section, footer

## Results

| Metric | NyxCode | Next.js | Savings |
|--------|---------|---------|---------|
| **Tokens** | 2,746 | 5,833 | **53%** |
| **Lines** | 279 | 617 | **55%** |
| **Files** | 1 | 11 | **91%** |
| **Config files** | 0 | 4+ | **100%** |
| **Dependencies** | 0 (dev) | 12+ | **100%** |

## File breakdown (Next.js)

| File | Tokens | Lines |
|------|--------|-------|
| Prisma Schema | 244 | 39 |
| Prisma Client | 78 | 10 |
| Auth Helper | 115 | 20 |
| Rate Limit Middleware | 230 | 31 |
| API: Register | 255 | 34 |
| API: Login | 228 | 30 |
| API: Posts CRUD | 313 | 42 |
| API: Comments CRUD | 364 | 44 |
| API: Users Delete | 227 | 29 |
| Root Layout | 87 | 18 |
| Blog Page (React) | 3,692 | 320 |
| **Total** | **5,833** | **617** |

## Run it

```bash
# NyxCode (one command)
npx @fabudde/nyxcode@0.11.5 build blog.nyx
cd dist-site && node server.js

# Next.js (many commands)
npx create-next-app@latest blog --typescript
cd blog
npm install @prisma/client bcryptjs jsonwebtoken
npm install -D prisma @types/bcryptjs @types/jsonwebtoken
npx prisma init
# ... copy 11 files into correct directories ...
npx prisma db push
npm run dev
```

## Live Demo

**https://blog.rudel.fun** — running the NyxCode version.

## Methodology

- Tokenizer: `tiktoken` with `cl100k_base` encoding (same as GPT-4 / Claude)
- Both implementations are feature-complete and visually identical
- Next.js version does NOT include: `next.config.js`, `tsconfig.json`, `package.json`, `.env` (would add ~369 more tokens)
- NyxCode version does NOT include any config files (zero config by design)

---

*Benchmarked by Kiro 🐺 (QA Lead) — April 14, 2026*
