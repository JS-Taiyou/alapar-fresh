# Changelog

All notable changes to this project are documented here. Dates are approximate.

---

## 2026-08-12 — Test suite, balance fix, demo tour, performance

### Test suite (4 phases, 47 suites / 339 steps)

Built a comprehensive unit + route-handler test suite from scratch. The project
had zero tests before this work.

**Infrastructure:**

- `deno.test.json` — test-only config that remaps `lib/db.ts` to a stub
- `test/fixtures/db_stub.ts` — controllable `query()` that records calls and
  returns canned rows
- `test/helpers.ts` — `makeCtx()` builder for route-handler tests, request
  builders

**Phase 1 — Pure logic** (`lib/calculations_test.ts`, `lib/format_test.ts`,
`lib/etag_test.ts`, `lib/routing_test.ts`): Balance math, split builders,
pairwise breakdown, input sanitizers, ETag hashing, routing rules.

**Phase 2 — Extracted pure modules** (`lib/rows_test.ts`, `lib/invite_test.ts`,
`lib/auth-cookies_test.ts`, `lib/encoding_test.ts`, `lib/server-cache_test.ts`):
Row mappers, invite-code generation, spawn-candidate filtering, cookie parsing
(the Deno Deploy comma-mashing edge case), base64url encoding, server cache
hit/miss/stale logic.

**Phase 3 — Route handler validation** (7 route test files): Pre-DB
validation/branching for default-split, transactions, entities, exercises,
registries, and invitations — using a fake `ctx` + the DB stub.

**Phase 4 — Deeper business logic** (`lib/realtime_test.ts`,
`lib/sql-builders_test.ts`, `lib/push_test.ts`): Invitation validation rules,
batch-insert placeholder math, UPDATE SET-clause builder, push cooldown gate,
realtime channel recovery policy.

### Pure module extraction

Extracted testable pure logic out of DB-coupled modules:

| New module            | Extracted from                 | Purpose                                                                          |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `lib/rows.ts`         | `store.ts`                     | Row mappers (`rowToUser`, `rowToTransaction`, etc.) + `rowToEnrichedTransaction` |
| `lib/invite.ts`       | `store.ts`                     | `generateInviteCode` + `filterSpawnCandidates` + `validateInvitation`            |
| `lib/auth-cookies.ts` | `supabase.ts`                  | `getCookie` (the comma-mashing cookie parser)                                    |
| `lib/encoding.ts`     | `notifications.ts` + `push.ts` | `base64url`, `concatUint8Arrays`, `encodeLength`                                 |
| `lib/routing.ts`      | `main.ts`                      | `needsFullState`, `isPublicPath`, `routeGuard`                                   |
| `lib/sql-builders.ts` | `store.ts`                     | `buildBatchPlaceholders`, `buildTransactionUpdateSets`                           |
| `lib/balances.ts`     | (new)                          | `computeDeltas` — the per-transaction balance delta source of truth              |

### Balance persistence (fixes 1-2 cent discrepancies)

Added a `transaction_balances` junction table that stores the signed,
rounded-to-cent balance delta for each user per transaction. Balance is now an
exact `NUMERIC(12,2)` SUM instead of a re-derivation from `split_json` every
time (which accumulated floating-point residue).

- `lib/balances.ts` — `computeDeltas(tx)`: pure function, single source of truth
- `db/add_transaction_balances.sql` — table creation + backfill migration
- All write paths (`createTransaction`, `updateTransaction`, `cloneTransaction`,
  `batchCloneTransactions`) now persist deltas
- `getBalanceFromDeltas()` — exact SUM query with try/catch fallback
- Display tolerance: `|balance| < $0.02` shows as `$0.00`
- Also fixes a latent payer-not-in-split bug

### Realtime channel recovery

- New `/api/auth/token` endpoint — returns the current (server-refreshed) access
  token for client-side realtime recovery
- `lib/realtime.ts` — on `CHANNEL_ERROR`/`TIMED_OUT`, fetches a fresh token and
  resubscribes with backoff (1s/2s/4s, max 3 attempts)
- `CLOSED` excluded from recovery (SDK fires it during normal lifecycle)
- Shared `rowToEnrichedTransaction` mapper eliminates duplicated `mapRow` in
  `TransactionList.tsx`

### Service worker improvements

- Replaced bare `"Offline"` text with a styled dark-themed Spanish fallback page
  ("No hay conexión" + Reintentar button)
- Non-HTML requests get a clean plain-text 503

### Performance

- `/` no longer runs full `resolveUserState` (saves 4 queries) — uses a single
  membership-existence check instead
- Dashboard shares one `getStamp()` between both cache lookups (saves 1 query)
- `/demo` skips auth + DB entirely (renders from static JSON)
- Dashboard `getAccessToken` replaced with canonical `getCookie` (fixes the Deno
  Deploy comma-mashing bug in the SSR path)

### Demo

- Guided tours via driver.js (MIT, zero-dependency)
- Two tours: "Tour Rápido" (5 steps, main page) and "Tour Completo" (10 steps,
  includes modal walkthrough with programmatic open/close)
- Styled popovers matching the app's dark palette
- Fixed negative `amount` values in `data/demo.json`
- Auth callback screen redesigned to use `AuthCardLayout` + branded spinner

### Routing refactor

- `lib/routing.ts` — `needsFullState`, `isPublicPath`, `routeGuard` extracted
  from `main.ts` as pure, testable functions
- `main.ts` calls these (behavior-preserving)

### Other

- `deno.json` — added `@std/assert`, `@std/testing`, `driver.js`; added `test`
  task; folded `deno test` into the `check` task
- `README.md` — added Testing section
- `.gitignore` — added `.zcode`, `PENDING.md`
