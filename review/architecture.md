# Architecture Review

## Request Lifecycle

**Doc reference**: Fresh V2 uses a linear middleware chain. `app.use()`
registers middleware in order. `app.fsRoutes()` registers file-based routes.
`app.onError()` and `app.notFound()` handle errors.

**Current implementation**: `main.ts` creates `App`, uses `staticFiles()`,
`csrf()`, two auth/routing middleware, then `onError`/`notFound` handlers, then
`fsRoutes()`.

**Issues**:

- ~~No `app.onError()` or `app.notFound()` handlers~~ **FIXED**: Added in this
  review pass.
- Double `new URL()` parse in main.ts (line 32 + 134) — minor perf, low
  priority.
- Layout blocks all children with async `_layout.tsx` — see `data-fetching.md`.

**Severity**: LOW (remaining issues are minor)

## Islands Architecture

**Doc reference**: Fresh islands are Preact components that hydrate
independently. Only islands ship JS. Props must be serializable (Fresh supports
`Set`, `Map`, `Date`).

**Current implementation**: Islands use `@preact/signals` for reactive state.
Cross-island communication via shared signal references created in route
components.

**Issues**: None — islands architecture is correct.

## Middleware Chain

**Doc reference**: Middleware runs in registration order. `csrf()` should be
early in the chain.

**Current implementation**: `staticFiles()` → `csrf()` → auth middleware →
routing middleware → routes.

**Issues**: None — chain is correctly ordered.
