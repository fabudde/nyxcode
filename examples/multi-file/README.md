# Multi-File Example (v0.21.0)

Demonstrates NyxCode's module system:

```
multi-file/
├── app.nyx              # entry: theme, meta, imports
├── components/
│   ├── nav.nyx          # MainNav(current) with active-state ternary
│   └── footer.nyx       # SiteFooter
└── pages/
    ├── home.nyx         # page /
    ├── docs.nyx         # page /docs/
    └── about.nyx        # page /about/
```

## Build

```bash
nyx build app.nyx
# → dist-site/index.html, dist-site/docs/index.html, dist-site/about/index.html
```

## Flatten (multi-file → single file)

```bash
nyx flatten app.nyx > flat.nyx
# flat.nyx is a single-file version of the whole project
# Comments and formatting are preserved.
```

## Features Shown

- `use "@/components/"` — directory import using project-root alias
- `use "@/pages/"` — page files can live anywhere
- `class="${current == 'home' ? 'active' : ''}"` — ternary interpolation
- Component instantiation with named args: `use MainNav(current="home")`
