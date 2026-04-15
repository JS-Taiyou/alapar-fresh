# Data Fetching Review

## Layout Blocking Call

**Doc reference**: `_layout.tsx` renders before children. Async operations in
layout block all child renders.

**Current implementation**: `routes/dashboard/_layout.tsx` calls
`await getTransactionCounts()` which blocks every dashboard page SSR.

**Issue**: This DB query runs on every dashboard page load, adding latency to
SSR.

**Recommendation**: Cache transaction counts in server-cache alongside
transactions. On cache hit, skip DB query entirely.

**Status**: **PARTIALLY FIXED** — `getCachedTransactionCounts()` and
`setCachedTransactionCounts()` added to `lib/server-cache.ts`. Layout now checks
cache first. First request still hits DB, subsequent requests within TTL are
cached.

**Severity**: MEDIUM (improved but first request still blocks)

## N+1 Queries in History Page

**Doc reference**: N/A

**Current implementation**: History page does N+1 queries per exercise — fetches
exercises, then for each exercise fetches its transactions.

**Recommendation**: Batch fetch all transactions for all exercises in a single
query using `WHERE exercise_id = ANY($1)`.

**Severity**: MEDIUM

## resolveUserState() Sequential Queries

**Doc reference**: N/A

**Current implementation**: `resolveUserState()` makes 4-5 sequential DB queries
per request (user lookup, registries, entities, participants, etc.).

**Recommendation**: Use `Promise.all()` for independent queries or combine into
fewer queries with JOINs.

**Severity**: MEDIUM

## Stamp Check DB Hit

**Doc reference**: N/A

**Current implementation**: `getStamp()` hits DB on every cached transaction
fetch to check `last_modified`.

**Recommendation**: Cache the stamp value itself with a short TTL (e.g., 5s) to
reduce DB load under high traffic.

**Severity**: LOW
