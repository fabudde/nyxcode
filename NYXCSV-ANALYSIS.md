# NyxCSV — Stress Test Analysis für NyxCode v0.15.3

> Ein professioneller CSV Editor (csv.heynyx.dev) als Showcase: Was kann NyxCode, wo muss JS ran?

## 📊 Zahlen

| Metrik | Wert |
|--------|------|
| **Gesamt** | 1020 Zeilen `.nyx` |
| **NyxCode** (Theme, Markup, Styles) | 275 Zeilen (27%) |
| **JavaScript** (`script {}` Block) | 745 Zeilen (73%) |
| **Kompilierte HTML** | 57 KB |
| **NyxCode Elemente** | div (59×), button (20×), span (18×), input (9×), select (4×), label (4×) |
| **JS `createElement` Calls** | 21× (Dinge die NyxCode nicht konnte) |

## ✅ Was NyxCode gut macht

### 1. Theme & Design System
```nyx
theme {
  colors { bg #0a0a12, surface #12121a, primary #667eea, accent #06b6d4 }
}
```
→ Einmal definiert, überall verfügbar. Sauber.

### 2. Page-Struktur & Layout
```nyx
page / {
  div .app {
    div .toolbar { ... }
    div .drop-zone { ... }
    div .spreadsheet-wrapper { ... }
    div .status-bar { ... }
  }
}
```
→ Deklaratives Layout. Klar, lesbar. Besser als HTML.

### 3. Style Blocks mit Shorthands
```nyx
style {
  .toolbar { d flex, ai center, gap 6px, bg #12121a, px 12px, h 42px }
  .tb-btn { bg transparent, c #e0e0e0, r 5px, px 8px, h 28px, fs 12px, cur pointer }
  .tb-btn:hover { bg rgba(102,126,234,0.1) }
}
```
→ CSS Shorthands sparen ~40% Tipparbeit. `:hover`, `:focus` etc. funktionieren.

### 4. Head Injection (Fonts, Meta)
```nyx
head "<link rel='stylesheet' href='https://fonts.googleapis.com/css2?family=Inter...'>"
```
→ Externe Resources einfach einbinden. Funktioniert.

### 5. Dropdowns (seit v0.15.2)
```nyx
select .tb-select #sel-delim {
  option "Auto" value="auto"
  option "Comma" value=","
  option "Semicolon" value=";"
}
```
→ Neu seit v0.15.2, funktioniert sauber.

## ❌ Was JS machen musste (und warum)

### 1. Dynamische Tabelle (Virtual Scrolling)
**Problem:** Die Tabelle rendert nur sichtbare Rows (Performance bei 100k+ Rows). Das braucht:
- `requestAnimationFrame` für Scroll-Events
- DOM-Manipulation: `createElement('tr')`, `createElement('td')` bei jedem Scroll
- Spacer-Elemente für korrekte Scrollbar-Höhe

**Warum NyxCode das nicht kann:** `each`/`data` Binding ist statisch (einmal rendern). Virtual Scrolling braucht imperative DOM-Kontrolle — Elemente erzeugen, zerstören, recyclen basierend auf Scroll-Position.

**Was NyxCode bräuchte:**
- `virtual-list` oder `virtual-scroll` Component
- Oder: Low-level Hook in den Render-Cycle (`onScroll → re-render subset`)

### 2. CSV Parser
**Problem:** RFC 4180 Parsing (Quotes, Escapes, Newlines in Feldern, BOM Detection, Encoding)

**Warum NyxCode das nicht kann:** Das ist reine Algorithmus-Logik. Kein UI-Framework "kann" das — es muss immer JS/TS sein.

**Lösung:** NyxCode muss das nicht können. `script {}` ist genau richtig dafür.

### 3. State Management (Undo/Redo, Selection, Edit Mode)
**Problem:** 10+ State-Variablen die zusammenhängen: `data[][]`, `headers[]`, `selectedRow/Col`, `editingRow/Col`, `undoStack`, `redoStack`, `sortCol`, `filterText`, `searchMatches`...

**Warum NyxCode's `state` nicht reicht:**
- NyxCode `state` ist flat: `state count = 0` → gut für Counter
- CSV Editor braucht: 2D Arrays, verschachtelte Objekte, Snapshots, Stack-Operationen
- Kein computed state (`filteredRows = data.filter(...)`)
- Kein Batch-Update (multiple states ändern ohne Re-Render dazwischen)

**Was NyxCode bräuchte:**
- `state` mit komplexen Typen (Arrays, Objects)
- `computed` Properties
- `batch {}` für atomare Updates
- Store-Pattern (wie Svelte Stores oder Zustand)

### 4. Keyboard & Event Handling
**Problem:** Tab zwischen Zellen, Enter zum Editieren, Escape zum Abbrechen, Ctrl+Z für Undo...

**Warum NyxCode das nicht kann:**
- `on:click -> count = count + 1` reicht für Simple Cases
- Aber: `on:keydown` mit `event.key` Switch, `event.preventDefault()`, Event Delegation auf dynamischen Elementen → braucht imperativen Code

**Was NyxCode bräuchte:**
- `on:keydown.ctrl.z -> undo()` (Modifier Syntax)
- Event Delegation: `on:click.delegate(.sg-cell) -> selectCell(event)`
- Zugriff auf `event` Object in Handlern

### 5. File Handling
**Problem:** Drag & Drop, FileReader, ArrayBuffer → TextDecoder, Encoding Detection

**Warum NyxCode das nicht kann:** Low-level Browser APIs. Muss JS sein.

**Lösung:** `script {}` ist korrekt. Evtl. `import` für externe Libraries.

### 6. Context Menu
**Problem:** Rechtsklick → Custom Menu an Cursor-Position → Row/Column Operationen

**Warum NyxCode das nicht kann:** Dynamische Positionierung, Event Koordinaten, conditional Rendering basierend auf Klick-Target.

**Was NyxCode bräuchte:**
- `contextmenu` Component oder Directive
- `show-when` mit dynamischer Position

## 🎯 Priorisierte Feature-Wünsche für NyxCode

### Prio 1 — Würde den meisten Impact haben
1. **Komplexe State-Typen** — `state data = []`, `state config = {}` mit Mutation-Methoden
2. **Computed Properties** — `computed filtered = data.filter(r => r.includes(search))`
3. **Event Modifiers** — `on:keydown.ctrl.z -> undo()`, `on:click.prevent -> handle()`
4. **`each` mit Key** — `each items key=id -> Item {}` für effizientes Re-Rendering

### Prio 2 — Nice to have
5. **Virtual List Component** — `virtual-list items={data} rowHeight=24 -> Row {}`
6. **Event Delegation** — `on:click.delegate(.cell) -> selectCell(event.target)`
7. **Lifecycle Hooks** — `onMount { }`, `onDestroy { }`, `onUpdate { }`
8. **Refs** — `div #myDiv` → `refs.myDiv.scrollTop` in Script

### Prio 3 — Langfristig
9. **External Script Import** — `import { parseCSV } from "./csv-parser.js"`
10. **Web Worker Support** — `worker { heavy computation }` für Off-Thread Parsing
11. **Conditional Rendering** — `when editing -> input` / `else -> span`
12. **Two-Way Binding** — `input bind:value={searchText}` (wie Svelte)

## 🧪 Bugs gefunden (alle gefixt in v0.15.2/v0.15.3)

| # | Bug | Fix |
|---|-----|-----|
| #38 | `table` Keyword-Konflikt (HTML vs DB) | Context-aware: in page = HTML |
| #39 | Kein `<option>` Element | `option` + `optgroup` added |
| #40 | Regex in `script {}` bricht Lexer | Lexer erkennt Regex-Kontext |
| #41 | 8 CSS Shorthands fehlen | `t`, `l`, `b`, `fsk`, `ox`, `oy`, `us`, `pe`, `ap` |
| #42 | Single-letter Shorthands in multi-line `style={}` | Parser-Fix |

## 💡 Fazit

NyxCode ist **stark bei Content & Layout** — Theme, Struktur, Styling, Static Rendering. Das allein spart schon ~40% Boilerplate vs raw HTML/CSS.

Für **interaktive Apps** braucht es noch:
- Besseres State Management (Prio 1)
- Event System mit Modifiers (Prio 1)  
- Virtual Rendering für große Listen (Prio 2)

Der `script {}` Escape Hatch funktioniert — aber 73% JS ist zu viel für einen "NyxCode Showcase". Ziel sollte sein: **<30% JS** bei vergleichbaren Apps.

**Realistisches Ziel mit Prio 1 Features:** ~50% NyxCode / 50% JS. CSV Parser und File Handling bleiben immer JS, aber State + Events + Rendering könnten NyxCode werden.

---

*Analyse basierend auf NyxCSV v1 (csv.heynyx.dev), gebaut am 15.04.2026*
*NyxCode v0.15.3 | 1020 Zeilen .nyx | 57 KB compiled HTML*
