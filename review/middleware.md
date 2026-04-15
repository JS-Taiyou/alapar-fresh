# Middleware Review

## CSRF Protection

**Doc reference**: Fresh V2 provides `csrf()` as a plugin
(`import { csrf } from "fresh"`). It checks `Sec-Fetch-Site` and `Origin`
headers on state-changing requests.

**Current implementation**: ~~No CSRF middleware~~ **FIXED**: `app.use(csrf())`
added after `staticFiles()`.

**Compatibility**: All mutation endpoints use `FormData` or `JSON` bodies. CSRF
origin check is compatible — no special handling needed.

**Severity**: N/A — fixed

## Auth Middleware Path Scoping

**Doc reference**: Middleware can be scoped to paths.

**Current implementation**: Single auth middleware handles all paths with
`needsFullState` flag using 10 `startsWith` checks.

**Issue**: Low maintainability but negligible perf impact.

**Severity**: LOW

## Lightweight API Paths

**Current implementation**: `/api/stamp` and `/api/push` paths skip
`resolveUserState()` — correct, only basic auth needed.

**Severity**: N/A — correct
