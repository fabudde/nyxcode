# NyxCode v0.37 — Full Expressiveness Update

## Overview
Transform NyxCode from "DSL with some expressions" to "full programming language for the web."
This is the biggest release yet.

## Features (Priority Order)

### 1. Expression Engine Overhaul (FOUNDATION — do first!)
- **Dot access on identifiers**: `user.name`, `item.price`, `items[0].name`
- **Bracket access**: `items[0]`, `obj["key"]`
- **Method calls**: `items.length`, `name.toUpperCase()`
- **Chained expressions**: `user.orders.filter(o => o.total > 100).length`
- **Operator precedence**: proper `and`/`or`/`not` with correct binding
- **Arithmetic**: `+`, `-`, `*`, `/`, `%` operators
- **Ternary**: `condition ? a : b`
- **Parenthesized groups**: `(a + b) * c`

### 2. Expression Built-ins (pipe-style)
```nyx
items | filter price > 10 | map name        // filter + map
items | sort price desc                      // sort
items | len                                  // length
name | split "," | join " "                  // string ops
items | sum price                            // aggregation
items | includes "hello"                     // search
obj | keys                                   // object keys
obj | values                                 // object values
```

### 3. Logic Operators as Keywords
- `and`, `or`, `not` (more readable than `&&`, `||`, `!`)
- Keep `&` as `and` alias for backwards compat

### 4. String Methods
- `uppercase`, `lowercase`, `trim`, `replace`, `startsWith`, `endsWith`
- Via pipe: `name | uppercase` or dot: `name.toUpperCase()`

### 5. Math Built-ins
- `round`, `floor`, `ceil`, `abs`, `min`, `max`, `random`
- Via pipe: `price | round 2`

### 6. Enhanced Each
- Index access: `each item, i in items`
- Object iteration: `each key, value in obj`

### 7. Computed Expressions in Templates
- `{count * price}` not just `{variable}`
- `{items | len}` in template interpolation
- `{condition ? "yes" : "no"}`

### 8. Import/Module System
```nyx
use "./components/Card.nyx"
use "./utils/format.nyx" { formatPrice, formatDate }
```

### 9. Async/Await in Frontend
```nyx
action loadData {
  let data = await fetch "/api/data"
  set items data.results
}
```

### 10. Enhanced Conditionals
```nyx
when items | len > 0 {
  // show items
} else {
  // empty state
}
```

## Token Efficiency Targets
Every feature MUST be ≥15% more token-efficient than JS equivalent.

| Feature | JS tokens | NyxCode tokens | Savings |
|---------|-----------|---------------|---------|
| filter+map | `items.filter(x => x.price > 10).map(x => x.name)` | `items \| filter price > 10 \| map name` | ~40% |
| sort | `items.sort((a,b) => b.price - a.price)` | `items \| sort price desc` | ~60% |
| length | `items.length` | `items \| len` | ~30% |
| uppercase | `str.toUpperCase()` | `str \| uppercase` | ~25% |
| ternary | `condition ? "yes" : "no"` | same | 0% (keep JS syntax) |

## Implementation Order
1. AST: Add new Expression types (MemberExpression, CallExpression, etc.)
2. Tokens: Add `And`, `Or`, `Not`, `Plus`, `Minus`, `Star`, `Percent`
3. Lexer: Support new operators
4. Parser: Rewrite parseExpression with proper precedence
5. Compiler: Compile new expression types to JS
6. Built-ins: Implement pipe built-ins
7. Tests: Comprehensive test suite
8. Docs: NYXCODE.md update

## Non-Goals (v0.37)
- No classes/OOP (NyxCode is functional)
- No generator functions
- No decorators
- No TypeScript-style type checking (types are documentation only)
