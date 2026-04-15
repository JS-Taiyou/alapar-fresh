# Context Review

## State Interface

**Doc reference**: `ctx.state` carries data between middleware and handlers.
Typed via `State` interface.

**Current implementation**: `State` interface in `utils.ts` properly typed with
all fields. Middleware populates state correctly.

**Severity**: N/A — correct

## Cookie Parsing

**Current implementation**: Auth token parsed manually via `getAccessToken`
helper. Cookies are `HttpOnly` + `SameSite=Lax`.

**Severity**: LOW — works correctly, no issue

## Redirects

**Current implementation**: `ctx.redirect()` used correctly for auth flows.

**Severity**: N/A — correct
