# Security Review

## CSRF Protection

**Doc reference**: Fresh V2 `csrf()` plugin checks `Sec-Fetch-Site` and `Origin`
headers.

**Status**: ~~No CSRF protection~~ **FIXED**: `app.use(csrf())` added to
`main.ts`.

**Severity**: N/A — fixed

## Input Validation

**Status**: ~~No input validation on transaction API~~ **FIXED**: Added
validation for `amount`, `description`, `userPaid`, `registryId`, and
`splitJson` in `routes/api/transactions/index.ts` and
`routes/api/transactions/[id].ts`.

**Severity**: N/A — fixed

## Access Token Exposure

**Issue**: Access token embedded in page HTML via serialized props
(`routes/dashboard/index.tsx`). Visible in page source.

**Recommendation**: Use a session-based approach or fetch token via dedicated
endpoint.

**Severity**: MEDIUM

## Auth Cookies

**Current implementation**: `HttpOnly` + `SameSite=Lax`. Provides partial CSRF
protection but not sufficient alone for FormData endpoints.

**Note**: With CSRF middleware now active, this is adequately protected.

**Severity**: N/A — adequate with CSRF

## registryId Validation

**Issue**: `registryId` from client not validated against active registry in
some endpoints.

**Severity**: LOW — middleware already ensures user is a member
