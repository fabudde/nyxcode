
## Kiro's v0.7 Pitch (13.04.2026) — "QA Wolf Token Audit" 🐺

Based on analyzing rudel.fun: 28% of file = inline style= attributes (64 occurrences, avg 134 chars).

### 1. STYLE PRESETS (biggest win!)
```nyx
preset label {
  font-size 0.7rem
  color var(--colors-accent)
  font-weight 700
  text-transform uppercase
  letter-spacing 0.25em
}
p "THE PACK" preset=label
```
Reusable named style blocks. rudel.fun uses section-label/section-heading 10x each.

### 2. FONTS IN THEME
```nyx
theme {
  fonts {
    heading Space Grotesk, sans-serif
    body Inter, sans-serif
  }
}
```
Auto-applies font-family to h1-h4 = heading, p = body. Saves 43 chars × 15 places = 645 chars.

### 3. NATIVE KEYFRAMES (already have `animate` — but Kiro wants it working in style blocks)
```nyx
animate fadeUp {
  from { opacity 0, transform translateY(50px) }
  to { opacity 1, transform translateY(0) }
}
```

### 4. COMPONENT DEFAULT STYLES
```nyx
component MemberCard {
  style { bg #1a1a2e, radius 12px, padding 2rem }  # applies to component root
  props name role
  h3 .name
  p .role
}
```

**Potential: 30-40% fewer tokens. rudel.fun ~7500 → ~5000 tokens.**

---

## Kiro's v0.9 Token Efficiency Pitch (2026-04-14 00:34 UTC) 🐺

### 1. IMPLICIT THEME COLORS (v0.9)
- **Current:** `c var(--colors-text-muted)` (28 chars)
- **Proposed:** `c text-muted` (12 chars)
- Compiler knows theme color names → auto-wraps in `var(--colors-...)`
- **Savings:** ~16 chars × ~150 usages (rudel.fun) = ~2,400 chars = ~600 tokens
- **Priority: HIGH** — easy to implement, big token savings

### 2. COMPONENT PROP STYLES (v0.9)
- Verbose inline styles on prop elements are biggest remaining token killer
- Proposal: Allow preset= on prop-bound elements or default styles in component body
- Example: `p .desc preset=muted` instead of `p .desc style="fs: 0.88rem; c: var(--colors-text-muted); lh: 1.65;"`

### 3. FULL-STACK BENCHMARK (Kiro builds this)
- Same app (Blog with Auth) in NyxCode AND Next.js+Prisma+NextAuth+Zod
- Real tiktoken comparison
- This is the story that sells NyxCode: 82% comes from backend!

### Honest Analysis
- First page: NyxCode costs 30% MORE (NYXCODE.md context = 4,653 tokens)
- From page 3+: NyxCode is cheaper (context paid only once)
- Each additional page saves ~1,771 tokens
- **Messaging:** "NyxCode pays for itself after 3 pages"

## 🐺 Kiro Bug #5 — CSS Selector Rules Edge Cases (14.04.2026)
1. `*` universal selector — Lexer doesn't recognize `*` as valid token
2. `::selection` pseudo-element — Not tested yet
3. `-webkit-*` vendor prefixes — Leading hyphen confuses parser
4. `@keyframes` in style blocks — No support yet (must use head injection)
Workaround: Put these in head "<style>...</style>" injection.
