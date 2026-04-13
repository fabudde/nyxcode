# LLVM Codegen Plan for NyxCode

> **Status:** Research & Architecture | **Author:** Nyx 🦞 | **Date:** 2026-04-13

## 1. Research: LLVM IR Generation Approaches

### 1.1 Available LLVM Bindings for TypeScript/JavaScript

| Library | Status | Approach | LLVM Version | Viability |
|---------|--------|----------|--------------|-----------|
| **llvm-bindings** (npm) | Maintained | Native addon (N-API + CMake) | 11-15 | ⚠️ Requires LLVM dev headers installed, complex build |
| **llvmc** (node-llvmc) | Abandoned (~2018) | FFI to LLVM C API | 5-6 | ❌ Dead project, ancient LLVM |
| **ts-llvm** | Abandoned | Full TS→LLVM compiler | - | ❌ Dead, but useful reference |
| **binaryen** (npm) | Active | Wasm backend only | N/A | ❌ Wasm only, not native |

**Verdict:** JS/TS LLVM bindings are fragile — they require matching system LLVM versions, complex CMake builds, and break across Node.js versions. Not production-grade for a compiler that needs to work on user machines.

### 1.2 How Other Compilers Do It

| Language | Frontend Lang | LLVM Strategy | Notes |
|----------|--------------|---------------|-------|
| **Zig** | C/Zig | Links LLVM as C++ library | Ships its own LLVM fork. 30MB+ binary |
| **Crystal** | Crystal | Links LLVM C API | Requires LLVM installed. `crystal build` shells out to linker |
| **Swift** | C++ | Links LLVM as library | Apple maintains their own LLVM fork |
| **Rust (rustc)** | Rust | Links LLVM as library | Ships bundled LLVM. ~200MB toolchain |
| **Nim** | Nim | Generates C → gcc/clang | C-as-backend approach. Very successful |
| **Cython** | Python | Generates C → gcc/clang | Same C-backend strategy |
| **V (vlang)** | V | Generates C → cc | Simple, effective, fast compile times |

**Key insight:** Many successful languages transpile to C rather than using LLVM directly. Nim, V, and Cython all prove this works at scale.

### 1.3 Text-Based LLVM IR Generation

The simplest LLVM approach: generate `.ll` text files and shell out to `llc` + linker.

```
NyxCode AST → Generate .ll text → llc -filetype=obj → clang (link) → Binary
```

**Pipeline:**
```bash
# Step 1: NyxCode compiler generates LLVM IR text
nyxcode compile app.nyx --emit-llvm > app.ll

# Step 2: LLVM compiles IR to object file
llc -filetype=obj app.ll -o app.o

# Step 3: Link with libc + dependencies
clang app.o -lsqlite3 -lpthread -o app
```

**Pros:** No native addons, no LLVM dev headers needed at compile time (only at user's build time), debuggable IR.

**Cons:** User needs LLVM toolchain installed. Slow (text parsing). Two-step build.

## 2. NyxCode → Native Compilation Mapping

### 2.1 What a NyxCode Binary Actually Does

A compiled NyxCode app is essentially:
1. **HTTP Server** — Serves pages, handles API routes
2. **Template Engine** — Renders HTML from page/component definitions
3. **Database Layer** — SQLite for `table` blocks, queries for `data` blocks
4. **Reactive Runtime** — Client-side JS (stays as JS, served as static asset)

The **native binary** handles server-side concerns. Client-side reactivity remains JavaScript (browsers can't run native code).

### 2.2 Block → Native Mapping

#### `table` Block
```nyx
table users {
  id int auto
  name string required
  email string unique
}
```
→ **Native:** SQLite `CREATE TABLE` statement + CRUD helper functions.
```c
// Generated C:
void init_table_users(sqlite3 *db) {
    sqlite3_exec(db, "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE)", NULL, NULL, NULL);
}
```

#### `api` Block
```nyx
api GET /users {
  query "SELECT * FROM users"
  respond 200
}
```
→ **Native:** HTTP route handler function.
```c
// Generated C:
void handle_GET_users(http_request *req, http_response *res) {
    sqlite3_stmt *stmt;
    sqlite3_prepare_v2(db, "SELECT * FROM users", -1, &stmt, NULL);
    // ... serialize to JSON, write response
}
```

#### `page` Block
```nyx
page /dashboard {
  h1 "Dashboard"
  p "Welcome back"
}
```
→ **Native:** String template function that returns HTML.
```c
// Generated C:
const char* render_page_dashboard() {
    return "<!DOCTYPE html><html>..."  // Pre-compiled HTML string
           "<h1>Dashboard</h1>"
           "<p>Welcome back</p>"
           "</html>";
}
```

#### `state`/`computed`
→ **Stays as JavaScript.** Reactivity is a browser concern. The native binary serves the JS runtime as a static asset. No change from current behavior.

### 2.3 Runtime Dependencies

The native binary needs to link against:
- **HTTP server:** `libmicrohttpd`, `libuv`, or embedded (like Go's `net/http`)
- **SQLite:** `libsqlite3` (bundled, ~600KB)
- **JSON:** `cJSON` or `yyjson` for API responses
- **TLS (optional):** `mbedtls` or `openssl` for HTTPS

## 3. Architecture Decision

### Option A: TS Compiler → LLVM IR Text → llc → Binary
```
.nyx → TS parser/compiler → .ll file → llc → .o → clang link → binary
```
- **Pros:** Keep existing TS compiler, LLVM optimization passes, cross-compilation via LLVM targets
- **Cons:** User needs LLVM toolchain (~500MB). Generating valid LLVM IR by hand is error-prone. Poor debugging. Two compilation phases.
- **Effort:** 🔴 High (LLVM IR is verbose and unforgiving)

### Option B: TS Compiler → Rust Source → cargo build → Binary
```
.nyx → TS parser/compiler → .rs files → cargo build → binary
```
- **Pros:** Memory safety, great HTTP ecosystem (hyper/axum/actix), SQLite (rusqlite already in our Cargo.toml), single binary output, excellent cross-compilation
- **Cons:** User needs Rust toolchain (~500MB). Slow compile times (~10-30s). Generated Rust code is ugly.
- **Effort:** 🟡 Medium (Rust codegen is straightforward)

### Option C: TS Compiler → C Source → gcc/clang → Binary ⭐ RECOMMENDED
```
.nyx → TS parser/compiler → .c file → cc → binary
```
- **Pros:**
  - C compiler is ubiquitous (every system has gcc or clang)
  - Fast compilation (~1-3s for small apps)
  - Tiny binaries (~200KB-2MB depending on static/dynamic linking)
  - SQLite is C-native (just `#include "sqlite3.c"` for amalgamation)
  - Simple codegen — C is close to what we need
  - Battle-tested approach (Nim, V, Cython all do this)
  - Debugging with gdb/lldb works naturally
  - Cross-compilation via `CC=arm-linux-gnueabi-gcc`
  - **No new build dependency** beyond what developers already have
- **Cons:**
  - C is unsafe (buffer overflows possible in generated code)
  - HTTP server library needed (microhttpd or hand-rolled)
  - String handling requires care
  - No package manager (vendor dependencies)
- **Effort:** 🟢 Low-Medium

### Option D: Rewrite Compiler in Rust → inkwell → LLVM → Binary
```
.nyx → Rust parser/compiler → inkwell (LLVM bindings) → .o → link → binary
```
- **Pros:** Best performance, full LLVM optimization, single unified codebase
- **Cons:** Complete rewrite of working compiler. 2-3 months of work. Abandons existing TS ecosystem.
- **Effort:** 🔴🔴 Very High

### 🏆 RECOMMENDATION: Option C (Transpile to C)

**Why C wins for NyxCode:**

1. **Nim & V proved it works.** Two successful modern languages use C as their backend. NyxCode's use case (web server + templates + SQLite) is actually simpler than what they compile.

2. **Minimal user setup.** `gcc` or `clang` is already installed on most dev machines. No LLVM toolchain, no Rust toolchain, no special dependencies.

3. **Fast iteration.** We keep our working TS parser/compiler. Only the codegen backend changes. We can ship incremental progress.

4. **Perfect fit for SQLite.** SQLite IS C. The amalgamation (`sqlite3.c`) can be compiled directly into the binary. No FFI overhead.

5. **Tiny binaries.** A NyxCode app with embedded SQLite, HTTP server, and all page templates would be ~1-3MB. Compare: a Next.js `node_modules` is 200MB+.

6. **Progressive enhancement.** Start with C, switch to LLVM IR later if needed. The C output can even be compiled to LLVM IR via `clang -emit-llvm`.

**With Option B (Rust) as Plan B** — if we find C string handling too painful or security concerns arise, Rust codegen is the natural upgrade path. We already have `runtime/` with rusqlite set up.

## 4. MVP Definition

### Goal
```bash
nyxcode compile app.nyx    # → generates app.c + compiles to ./app
./app                      # → HTTP server on :3000
curl localhost:3000        # → Returns rendered HTML
```

### MVP Scope (v0.4)

**IN:**
- `page` blocks → HTML string constants, served via HTTP
- `style` blocks → Compiled CSS embedded in HTML (existing compiler logic)
- `head` injections → Embedded in HTML output
- Basic HTTP server (serve pages by route)
- Static file serving (`/static/...`)
- `--port` flag

**OUT (v0.5+):**
- `table` blocks → SQLite schema + CRUD
- `api` blocks → Custom HTTP handlers
- `data` blocks → Server-side data fetching
- `state`/`computed` → Already works client-side, no change needed
- `form` blocks → POST handler generation
- TLS/HTTPS
- WebSocket

### MVP Architecture

```
┌─────────────────────────────────────────────────────────┐
│ nyxcode compile app.nyx                                  │
├─────────────────────────────────────────────────────────┤
│ 1. Parse .nyx → AST              (existing parser)       │
│ 2. Compile AST → HTML/CSS/JS     (existing compiler)     │
│ 3. Generate C source:                                     │
│    - Embed HTML as string constants                       │
│    - Route table (path → handler)                         │
│    - HTTP server (microhttpd or hand-rolled)              │
│    - main() entry point                                   │
│ 4. Compile C → binary:                                    │
│    cc -O2 app.c -o app -lsqlite3 -lpthread               │
└─────────────────────────────────────────────────────────┘
```

### Generated C Structure (MVP)

```c
// app.c — Generated by NyxCode Compiler

#include <stdio.h>
#include <string.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>

// === Embedded Page Content ===

static const char PAGE_HOME[] =
    "<!DOCTYPE html><html lang=\"en\"><head>..."
    "<style>.nyx-page { background: #0a0a1a; }</style>"
    "</head><body>..."
    "<h1>Dashboard</h1>"
    "</body></html>";

static const char PAGE_ABOUT[] =
    "<!DOCTYPE html>...";

// === Route Table ===

typedef struct {
    const char *path;
    const char *content;
    size_t content_len;
} Route;

static const Route routes[] = {
    { "/",      PAGE_HOME,  sizeof(PAGE_HOME) - 1 },
    { "/about", PAGE_ABOUT, sizeof(PAGE_ABOUT) - 1 },
    { NULL, NULL, 0 }
};

// === Minimal HTTP Server ===

static const char *find_route(const char *path) {
    for (int i = 0; routes[i].path; i++) {
        if (strcmp(routes[i].path, path) == 0) {
            return routes[i].content;
        }
    }
    return NULL;
}

// ... (minimal HTTP/1.1 parser + socket server, ~150 lines)

int main(int argc, char **argv) {
    int port = 3000;
    // Parse --port flag
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--port") == 0 && i + 1 < argc) {
            port = atoi(argv[++i]);
        }
    }

    printf("🦞 NyxCode server running on http://localhost:%d\n", port);
    return serve(port);
}
```

## 5. Dependency Analysis

### What the User Needs

| Dependency | Required? | Size | Already Installed? |
|-----------|----------|------|-------------------|
| **C compiler** (gcc/clang) | ✅ Yes | ~100MB | macOS: yes (Xcode CLT). Linux: usually. Windows: need MinGW or MSVC |
| **LLVM** | ❌ No | ~500MB | Not needed for C backend |
| **Rust** | ❌ No | ~500MB | Not needed for C backend |
| **SQLite** | ⚠️ For v0.5+ | ~2MB (amalgamation) | We bundle sqlite3.c directly |
| **Node.js** | ✅ Yes (compiler) | ~50MB | Already required for NyxCode |
| **libc** | ✅ Yes | 0 (system) | Always present |
| **pthreads** | ✅ Yes | 0 (system) | Always present on POSIX |

### Binary Size Estimates

| Configuration | Size |
|--------------|------|
| Minimal (static pages only) | ~50-100KB |
| With embedded HTTP server | ~150-300KB |
| With SQLite (static link) | ~1-2MB |
| With SQLite + TLS (static) | ~3-5MB |

Compare: `node_modules` for a Next.js app: **200-500MB**.

### Cross-Compilation

```bash
# Linux → macOS (with osxcross)
CC=o64-clang nyxcode compile app.nyx --target darwin-x64

# Linux → ARM (Raspberry Pi)
CC=arm-linux-gnueabihf-gcc nyxcode compile app.nyx --target linux-arm

# Linux → Windows (with mingw)
CC=x86_64-w64-mingw32-gcc nyxcode compile app.nyx --target win-x64
```

NyxCode sets `CC` and target flags automatically based on `--target`.

## 6. Implementation Roadmap

### Phase 1: C Codegen MVP (v0.4)
- [ ] `CCodegen` class in `src/codegen.ts`
- [ ] Embed compiled HTML as C string constants
- [ ] Route table generation
- [ ] Minimal HTTP server (embedded C, ~200 lines)
- [ ] `nyxcode compile app.nyx` CLI command
- [ ] Auto-detect gcc/clang
- [ ] `--port` flag

### Phase 2: Database (v0.5)
- [ ] SQLite amalgamation bundled
- [ ] `table` → CREATE TABLE + CRUD functions
- [ ] `data = query "..."` → prepared statements
- [ ] `api` → HTTP handler with JSON response

### Phase 3: Production (v0.6)
- [ ] Static file serving
- [ ] `form` → POST handlers with validation
- [ ] Connection pooling
- [ ] Graceful shutdown
- [ ] `--release` flag (optimization)

### Phase 4: LLVM Backend (v1.0, optional)
- [ ] If C backend proves limiting, add direct LLVM IR generation
- [ ] Or switch codegen to Rust (Option B) for memory safety
- [ ] JIT compilation for dev mode

## 7. Open Questions

1. **HTTP library:** Hand-roll a minimal HTTP/1.1 server in C (~200 lines) or use libmicrohttpd? Hand-rolling is simpler for users (zero deps) but less robust.

2. **Windows support:** MinGW or MSVC? MinGW is closer to POSIX but MSVC is more common on Windows.

3. **Dev mode vs compile mode:** Should `nyxcode dev` stay as the Node.js dev server (fast reload) while `nyxcode compile` creates the native binary? Yes — this is the Zig/Go model.

4. **Hot reload in binary:** The compiled binary serves static content. For dev, use the Node.js server with `--watch`. The binary is for deployment.

---

*This document will be updated as implementation progresses.*

🦞 Built by Nyx, reviewed by nobody (yet). Tyto? 🦉
