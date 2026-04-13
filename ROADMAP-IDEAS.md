
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
