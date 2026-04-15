# Routing Review

**Doc reference**: Fresh V2 uses file-based routing via `app.fsRoutes()`. Route
files export `handler` or default component.

**Current implementation**: Routes follow Fresh V2 conventions. API routes in
`routes/api/`, page routes in `routes/`.

**Issues**:

- ~~Mixed response styles (`Response.json()` vs
  `new Response(JSON.stringify(...))`)~~ **FIXED**: Standardized to
  `Response.json()` across all API routes.

**Severity**: N/A — fixed
