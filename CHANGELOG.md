# Changelog

All notable changes to this project are documented here. Dates are approximate.

---

## 2026-08-14 — Pro tier with Polar billing

Paid registry plan (owner pays, whole group benefits). See
`docs/MONETIZATION.md` for the full design.

- **DB** (`db/add_billing.sql`): `registries.plan`
  (`free`|`pro`|`grandfathered`) — existing registries grandfathered to
  unlimited forever; `registry_subscriptions` Polar mirror (server-only, RLS
  with zero policies)
- **`lib/entitlements.ts`**: plan resolution (column + subscription + past-due
  grace) and free limits (2 owned registries, 4 members/registry, 3 active
  recurring templates, newest closed exercise only)
- **Enforcement** at 4 touchpoints, all returning `402 upgrade_required`:
  registry creation cap, join member cap (localized "group full" message),
  recurring/installment template cap, history depth (locked rows with upgrade
  CTA instead of silently hidden)
- **`lib/billing.ts`**: zero-dependency Polar REST client — Checkout Link
  builder, `syncCheckout`, customer-portal sessions, Standard Webhooks HMAC
  verifier (replay-protected, timing-safe), subscription-event upsert with 3-day
  cancellation grace
- **Routes**: `GET /api/billing/checkout` (owner-only 302), public
  `POST /api/webhooks/polar` (csrf-exempt, HMAC-verified),
  `POST /api/billing/portal`, `/billing/success` confirmation page
- **UI**: `UpgradeButton` island (monthly/yearly picker, non-owner hint),
  `PaywallCard` locked-history rows, sidebar CTA on free registries, billing
  i18n strings (es/en)
- **State**: middleware resolves the active registry's plan once per full-state
  request (`ctx.state.activeRegistryPlan`)
- Tests: plan matrix (incl. cancel-demotion, grace windows, grandfathered
  immunity), webhook signatures (tamper/replay/missing/multi-scheme), event
  upsert mapping, past_due grace, reference_id fallback. 61 suites / 457 steps
  green.

Post-review fixes (senior review, pre-merge):

- **Revenue leak**: canceled subscriptions kept Pro forever — the plan column
  was trusted unconditionally. `getRegistryPlan` now demotes `plan='pro'` to
  free when the subscription row is dead and grace has lapsed (grandfathered is
  immune by checking it first).
- **Portal always failed**: customer-session creation now sends the stored
  `polar_customer_id` (Polar requires a customer identifier).
- **Owned-registry cap punished loyal users**: the count now includes only
  effectively-free registries, so grandfathered/Pro groups don't consume it.
- Registry mapping accepts `reference_id` fallbacks (Polar's documented
  checkout-link params don't include `metadata[…]`); yearly preselect uses a
  dedicated `POLAR_CHECKOUT_LINK_YEARLY` when configured. Runbook requires a
  sandbox end-to-end check of which channel the webhook actually carries.
- Grace is also set on `past_due` (one failed charge ≠ instant cut).
- History personal totals computed for visible exercises only (removes an
  unbounded N+1 on free registries with long history).
- `GROUP_FULL` string sentinel replaced by a typed `GroupFullError`.

---

## 2026-08-12 — v1.0.0: Public launch + security hardening

First public release. A full security-hardening pass landed ahead of opening the
repo.

### Security — application layer

- **API authorization scoping**: exercise transactions/history verify registry
  membership (404 on foreign ids); carry-forward validates every item's registry
  and caps batches (≤100 items, quantity 1–60); default-split and invitation
  revoke are scoped to the target registry's owner; entities GET requires
  membership; transaction create/update validate payer/split participants and
  same-registry references; push subscribe requires an https endpoint and
  membership of the supplied registry
- **Owner-only destructive ops**: registry rename/delete and exercise close now
  require the owner role (previously any member)
- **Middleware**: CSRF exemptions removed entirely; `/api/auth/callback`
  requires a JSON body and validates tokens before setting cookies; the email
  allowlist is enforced before user creation on the very first request; security
  headers on every response (X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy); per-IP rate limit (20 req/min, 429) on invite-acceptance
  and auth endpoints
- **Auth/session**: browser Supabase clients run `persistSession: false`; Google
  OAuth moved to the PKCE flow (`/auth/callback` exchanges `?code=`);
  open-redirect params restricted to relative paths; logout revokes the session
  server-side and wipes client caches/storage; single-flight token refresh;
  access tokens are no longer serialized into dashboard HTML — the realtime
  client fetches `/api/auth/token` on subscribe
- **Service worker**: cache-first restricted to immutable static assets;
  `/api/*` and HTML navigations are network-only; caches purged on logout
- **Database (RLS)**: new `tighten_rls.sql` and `enable_realtime.sql`
  migrations; policies hardened — owner-only registry delete, per-command
  transaction policies (exercise-locked rows immutable), server-only
  audit_log/allowed_emails, member-scoped invitation reads, immutable user
  identity columns for client callers, `role` CHECK, case-insensitive email
  uniqueness
- **Misc**: invite codes use a CSPRNG and default to a 7-day expiry; max-uses
  increment is atomic; VAPID `aud` derived from the push endpoint origin per RFC
  8292 (Firefox/Safari push works); segment-aware public-path matching

### Repo hygiene

- Agent tooling and internal notes (`.agents/`, `.claude/`, `review/`,
  `mockups/`, `db/backups/`, `AGENTS.md`, `PENDING.md`, `skills-lock.json`) are
  untracked and don't ship with the repo
- Leftover debug logging removed from the dashboard route

### Tests

- Suite grew to 59 suites / 417 steps

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
