# Performance Review

## Blocking Layout Query

**Status**: **IMPROVED** — `getTransactionCounts()` in `_layout.tsx` now uses
server cache. First request still hits DB, subsequent requests are cached.

**Severity**: MEDIUM

## N+1 Queries in History

**Issue**: History page fetches exercises, then queries transactions per
exercise.

**Recommendation**: Batch query with `WHERE exercise_id = ANY($1)`.

**Severity**: MEDIUM

## Sequential resolveUserState() Queries

**Issue**: 4-5 sequential DB queries per authenticated request.

**Recommendation**: Parallelize with `Promise.all()` or combine with JOINs.

**Severity**: MEDIUM

## Unbounded Server Cache

**Status**: **FIXED** — Added 200-entry max limit with LRU eviction and expired
entry cleanup.

**Severity**: N/A — fixed

## Dead Code

**Status**: **FIXED** — `lib/api.ts` (116 lines, zero imports) deleted.

**Severity**: N/A — fixed

## Duplicated Utilities

**Status**: **FIXED** — `generateETag()` moved to `lib/etag.ts`,
`sanitizeDecimal()` and `sanitizeInteger()` moved to `lib/format.ts`. Both
import sites updated.

**Severity**: N/A — fixed

## Mixed API Response Styles

**Status**: **FIXED** — All `new Response(JSON.stringify(...))` calls replaced
with `Response.json()`.

**Severity**: N/A — fixed

## Large Transaction Arrays in HTML

**Issue**: Full transaction data serialized inline in HTML. For large registries
this significantly increases page size.

**Recommendation**: Consider pagination or streaming.

**Severity**: LOW
