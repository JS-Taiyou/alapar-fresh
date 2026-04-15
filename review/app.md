# App Instance Review

**Doc reference**: `App` is the central Fresh V2 class. Methods: `.use()`,
`.get()`, `.onError()`, `.notFound()`, `.fsRoutes()`.

**Current implementation**: `main.ts` creates `App<State>()`, registers
middleware and routes.

**Issues**:

- ~~No CSRF middleware~~ **FIXED**: `app.use(csrf())` added.
- ~~No error/notFound handlers~~ **FIXED**: `app.onError("*", ...)` and
  `app.notFound(...)` added.

**Severity**: N/A — all issues fixed
