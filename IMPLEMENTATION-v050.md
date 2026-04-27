# NyxCode v0.50 Implementation Plan

## Phase 1: Multi-Statement Event Handlers

### Current State
- Parser collects `on:click { ... }` body as raw string
- Compiler injects string as inline onclick attribute or script
- Only recognizes: `set X = Y`, `push X Y`, `pop X`, `emit X Y`

### Target State
- Parser parses handler body as AST nodes (like backend action blocks)
- New AST node: `EventHandler { event, modifiers, body: Statement[] }`
- Compiler generates JS function from AST, not string manipulation

### AST Changes (ast.ts)
```typescript
interface EventHandlerNode {
  type: 'EventHandler';
  event: string;          // 'click', 'submit', 'input', etc.
  modifiers: string[];    // ['prevent', 'ctrl', 'z']
  body: HandlerStatement[];
}

type HandlerStatement = 
  | SetStatement           // set count = count + 1
  | PushStatement          // push items "new"
  | PopStatement           // pop items  
  | ShiftStatement         // shift items
  | RemoveStatement        // remove items index
  | EmitStatement          // emit change data
  | IfStatement            // if cond { ... } else { ... }
  | MatchStatement         // match x { ... }
  | LetStatement           // let temp = expr (LOCAL, not signal)
  | FetchStatement         // fetch POST "/api/save" { data }
  | NavigateStatement      // navigate "/path"
  | ToastStatement         // toast success "message"
  | CallStatement          // call functionName(args)
  | TryCatchStatement      // try { ... } catch err { ... }
  | EachStatement          // each items -> item { ... }
  | ForStatement           // for i in 0..10 { ... }
;
```

### Parser Changes (parser.ts)
In `parseElementAttributes()` where `on:click` is detected:
- Instead of collecting raw text, call `parseHandlerBody()`
- `parseHandlerBody()` reuses existing statement parsing
- Store as `EventHandlerNode` on the element

### Compiler Changes (compiler.ts)
New method: `compileEventHandler(handler: EventHandlerNode): string`
- Generates a JS function body
- `set x = expr` → `__nyx.state.x = ${compileExpr(expr)}`
- `push arr val` → `__nyx.state.arr.push(${compileExpr(val)}); __nyx.notify('arr')`
- `if cond { }` → `if (${compileExpr(cond)}) { ... }`
- `let temp = expr` → `let temp = ${compileExpr(expr)}` (local!)
- `fetch POST url { body }` → `await fetch(url, { method:'POST', body:JSON.stringify({...}), headers:{'Content-Type':'application/json'} })`
- `navigate path` → `__nyx.navigate(path)` 
- `toast type msg` → `__nyx.toast(type, msg)`

### Step by Step
1. Add HandlerStatement types to ast.ts
2. Add parseHandlerBody() to parser.ts  
3. Add compileEventHandler() to compiler.ts
4. Update element compilation to use new handler compilation
5. Tests for each handler statement type
6. Backward compatibility: old string-based handlers still work during migration

## Phase 2: Client-Side Control Flow

### if/else in pages (not just handlers)
Already partly done (#202 when blocks). Extend to full if/else:
```nyx
if count > 0 {
  div "Has items: {count}"
} else {
  div "No items yet"
}
```
Compiles to reactive DOM that updates when `count` changes.

### match in pages
```nyx
match status {
  "active" -> badge "Active" color=green
  "error" -> badge "Error" color=red
  _ -> badge "Unknown"
}
```

## Phase 3: Component System v2

### Typed Props
Parser already supports `component Name(prop1, prop2)`.
Add type annotations: `component Name(label: string, count: number = 0)`.

### Named Slots
Parser already has basic slot support.
Add named slots: `slot header`, `slot footer`, `slot` (default).

### Event Forwarding
Components can emit events and parents can listen:
```nyx
component Button(label) {
  button on:click { emit click } "{label}"
}
page / {
  Button label="Save" on:click { toast success "Saved!" }
}
```

## Phase 4: StdLib

Move hardcoded compile methods to .nyx files:
- stdlib/rating.nyx
- stdlib/wizard.nyx  
- stdlib/toggle.nyx
- stdlib/choice.nyx
- stdlib/burger-nav.nyx

These are imported automatically (like a prelude) or via `use stdlib/rating`.
