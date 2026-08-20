# Monetization — Pro tier with Polar billing

> **Status: implemented and merged to main** (originally
> `feat/monetization-pro-tier`, merged 2026-08-18). This document describes the
> system **as built** — the original plan is preserved below for history.
> User-facing behavior summary: see
> [Plans & Limits in BUSINESS_LOGIC.md](BUSINESS_LOGIC.md#plans--limits-pro-tier);
> schema: [DATABASE.md](DATABASE.md); routes: [ROUTES.md](ROUTES.md).

## How the system fits together

```
OWNER on a free registry
     │  clicks "Mejorar a Pro" (UpgradeButton island, sidebar)
     ▼
GET /api/billing/checkout ── owner-checked 302 ──▶ Polar Checkout Link
     │                                              (products/pricing/trial
     │                                               configured in dashboard)
     │                                              metadata[registry_id] rides along
     ▼
/billing/success?checkout_id ──▶ syncCheckout()   [display-only confirmation;
     │                                             authoritative write is below]
     ▼
Polar → POST /api/webhooks/polar   (public; HMAC-verified per Standard
     │                              Webhooks: replay-protected, timing-safe)
     ▼
handleSubscriptionEvent()
     ├─ upsert registry_subscriptions (idempotent, keyed on registry_id)
     ├─ active/trialing → registries.plan: 'free' → 'pro'
     └─ canceled/revoked → grace_until = now + 3d (never a hard cut)
     ▼
getRegistryPlan(registryId) — the single source of truth:
     plan column OR live subscription OR past_due-within-grace ⇒ Pro
     ▲
     ├─ middleware populates ctx.state.activeRegistryPlan (full-state paths)
     └─ enforcement call sites (create/join/template/history)
```

## Key design decisions and why

| Decision                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry is the paid unit (owner pays, group benefits)             | Members shouldn't need payment setup to participate; one payer per group keeps the billing surface tiny                                                                                                                                                                                                                                                    |
| Joining never gated by the joiner's plan                           | Network effects: every free user can still join Pro groups                                                                                                                                                                                                                                                                                                 |
| Grandfathered = permanent, webhook can't touch it                  | Trust promise to early users; activation UPDATE is `WHERE plan = 'free'`                                                                                                                                                                                                                                                                                   |
| Subscription JOIN _and_ plan column                                | Webhooks lag; entitlements must be correct at payment time. Column = fast path; the JOIN is the safety net in BOTH directions: it lifts a just-paid registry before the flip webhook lands, AND demotes a canceled one once grace lapses (the webhook never writes plan='free' — demotion happens on read in `getRegistryPlan`, so no cron sweeper exists) |
| Owned-registry cap counts only effectively-FREE registries         | Grandfathered/Pro groups don't consume the cap — early users keep their pre-billing "unlimited creates", and a customer with 2 Pro groups can still start a 3rd (upgrade happens per-registry, after creation)                                                                                                                                             |
| 3-day grace on cancel/revoke/past_due                              | Covers dunning (one failed charge ≠ instant cut) and "paid period not over"; the window IS the max time any lapsed payment grants access                                                                                                                                                                                                                   |
| Locked rows instead of hidden history                              | The paywall IS feature discovery; silent hiding looks like data loss                                                                                                                                                                                                                                                                                       |
| Templates = distinct recurring groups                              | Carry-forward clones of existing commitments must never be blocked                                                                                                                                                                                                                                                                                         |
| Polar only, no SDK                                                 | Merchant of Record (they own cards/tax/VAT); the 3 API calls we need don't justify a preview SDK                                                                                                                                                                                                                                                           |
| Checkout Links + webhooks (no programmatic sessions)               | Pricing/trial changes stay dashboard-only, no deploy                                                                                                                                                                                                                                                                                                       |
| Registry mapping: metadata.registry_id with reference_id fallbacks | Polar's documented link params list `reference_id` but not `metadata[…]`; the webhook handler accepts both so the mapping survives either dashboard behavior                                                                                                                                                                                               |

## Security notes (where the sensitive parts live)

- **`lib/billing.ts` is the money file.** The HMAC verifier is the only thing
  between the public internet and the subscription table: raw-body signing
  (exact bytes), 5-minute replay tolerance (past AND future timestamps),
  timing-safe comparison, multi-scheme rotation support, fail-closed on every
  error path. Read its doc comments before touching it.
- **401 vs 500 from the webhook route is a contract**: 401 = invalid signature
  (Polar won't retry — retrying can't fix a wrong secret), 500 = handler failure
  (Polar retries — a DB blip must not lose a paid activation).
- **`POLAR_ACCESS_TOKEN` is org-admin-equivalent**: server-only, never in the
  client bundle, logs, or errors. The webhook secret is lower blast radius
  (forge events to us only).
- **`syncCheckout` performs no writes** — a crafted `checkout_id` on the success
  page can't grant anything; only the HMAC-verified webhook writes.
- **CSRF exemption for the webhook is safe** because authentication is the
  signature, not a session. It's deliberately NOT in the rate-limit list (Polar
  retries must not be throttled).
- **TOCTOU acceptances, documented in place**: racing joins/creates can
  overshoot a cap by one. These are product limits, not security boundaries. The
  invitation max-uses claim — the one that must be race-proof — already is
  (atomic `UPDATE ... WHERE current_uses < max_uses`).

---

# Original plan (preserved for history)

## Decisions locked in (from discussion)

- **Paid unit = registry (group), owner pays**, whole group benefits. Joining
  groups is never gated.
- **Free tier**: unlimited transactions/payments/cuts; own ≤ 2 registries; per
  free registry: ≤ 4 members, ≤ 3 active recurring/installment templates,
  history = current exercise + last closed one.
- **Pro registry**: unlimited members, templates, full history. Price configured
  in Polar dashboard (~US$1.99/mo, ~$15/yr, 14-day no-card trial — dashboard
  config, not code).
- **Grandfathering**: all registries existing at migration time get
  `plan='grandfathered'` (unlimited forever).
- **Processor: Polar only** (Merchant of Record — standalone, no Stripe). Thin
  `lib/billing.ts` abstraction so Stripe/MercadoPago could be added later.
- Polar integration style: **Checkout Links** (long-lived URLs, metadata
  propagation) + webhooks — no programmatic checkout sessions needed.

## Polar facts (from docs)

- OAT (`polar_oat_…`) in `Authorization: Bearer`, server-side only; production
  `https://api.polar.sh/v1`, sandbox `https://sandbox-api.polar.sh/v1`.
- Checkout Link: configured in dashboard (monthly + yearly products on one
  link), supports `metadata` (propagates to subscription/order), `reference_id`,
  success URL with `{CHECKOUT_ID}` substitution, trial override,
  `locale`/`theme` query params.
- Webhooks: Standard Webhooks spec, HMAC signature, secret set in dashboard;
  subscribe to subscription lifecycle events (active/canceled/revoked/updated —
  confirm exact event names at implementation time). Polar CLI `polar listen`
  tunnels webhooks for local dev.
- Customer portal: hosted; server creates a session via
  `POST /v1/customer-sessions/` and redirects the user to the returned
  `customer_portal_url`.

## Step 1 — DB migration `db/add_billing.sql`

Following the new convention (self-contained RLS block, idempotent):

- `ALTER TABLE registries ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'` +
  `CHECK (plan IN ('free','pro','grandfathered'))`; set `plan='grandfathered'`
  for all existing rows in the same migration.
- New table `registry_subscriptions`:
  `registry_id UUID PK REFERENCES registries(id) ON DELETE CASCADE`,
  `polar_subscription_id TEXT UNIQUE`, `polar_customer_id TEXT`,
  `status TEXT NOT NULL` (`trialing|active|past_due|canceled|revoked`),
  `current_period_end TIMESTAMPTZ`, `grace_until TIMESTAMPTZ`, `updated_at`. RLS
  enabled + forced, **zero policies** (server-only, same posture as
  `audit_log`/`allowed_emails`).
- Update `docs/DATABASE.md` run order + table docs.

## Step 2 — `lib/entitlements.ts` (pure, unit-tested)

- `FREE_LIMITS = { maxOwnedRegistries: 2, maxMembers: 4, maxActiveTemplates: 3, maxClosedExercisesVisible: 1 }`.
- `getRegistryPlan(registryId)` → reads `registries.plan` +
  `registry_subscriptions` (pro = plan pro/grandfathered, or subscription status
  trialing/active, or past_due within `grace_until`).
- `entitlementsFor(plan)` → limit set (Infinity for pro/grandfathered).
- Tests in `lib/entitlements_test.ts` (db stub).

## Step 3 — Enforcement (4 touchpoints, all return 402 + `{ code: "upgrade_required", reason }`)

- `routes/api/registries/index.ts` POST: count owned registries
  (`SELECT count(*) FROM registry_members WHERE user_id=$1 AND role='owner'`) —
  block 3rd for free users.
- `lib/store.ts useInvitation` + `routes/api/invitations/join.ts`: member count
  vs registry plan cap → join fails with "group is full; the owner can upgrade"
  (i18n string). Surface a friendly message on `/join/[code]` too.
- `routes/api/transactions/index.ts` POST: when `type` is
  `parcialidad`/`recurrente`, count active templates (spawn-candidate query) for
  the registry vs cap.
- `routes/dashboard/history.tsx` + `getExercises`: free registries see the
  newest closed exercise only; older rows render as locked placeholder rows with
  an upgrade CTA (not hidden silently — the paywall _is_ the feature discovery).
- `ctx.state`: middleware already loads registries; add plan/entitlements to
  `State` (utils.ts) so pages/islands can render CTAs without extra queries.

## Step 4 — `lib/billing.ts` (Polar, dependency-light)

- Plain `fetch` REST client with OAT (no SDK — the SDK is `@next` public
  preview; the 3 calls we need are simple; revisit if the surface grows).
- `getCheckoutUrl(registryId, interval, locale)`: builds the
  dashboard-configured Checkout Link URL +
  `?metadata[registry_id]=…&reference_id=…&locale=es|en&theme=dark`. (If one
  link can't carry both products the way we want, two env-configured links.)
- `verifyWebhook(req)`: HMAC per Standard Webhooks (`webhook-id`,
  `webhook-timestamp`, `webhook-signature` headers, ~25 lines or the tiny
  `standardwebhooks` npm package — decide at implementation, prefer zero-dep).
- `handleSubscriptionEvent(payload)`: upsert `registry_subscriptions` from
  `metadata.registry_id`; on canceled/revoked set status +
  `grace_until = now() + 3 days`; never hard-cut mid-paid-period.
- `createPortalSession(registryId, userId)`: owner-only; POST
  `/v1/customer-sessions/` → return portal URL.
- `syncCheckout(checkoutId)`: fetch checkout/subscription by id for instant
  confirmation on the success page (webhooks can lag seconds).

## Step 5 — Routes

- `GET /api/billing/checkout?registry_id&interval=monthly|yearly` — owner-only,
  302 to Polar checkout link. (POST-only mutation rules don't apply — it's a
  redirect, no state change; but make it POST→URL JSON if csrf gets in the way.)
- `POST /api/webhooks/polar` — **public** (add to `PUBLIC_PREFIXES`
  segment-aware list), **csrf exemption** in `main.ts` origin callback (safe:
  HMAC-verified), **exempt from rate limiting** (Polar retries). Raw body needed
  for signature — check Fresh body reading order.
- `GET /billing/success?checkout_id=…` — page route: calls `syncCheckout`, shows
  "Pro activado" state, links back to dashboard.
- `POST /api/billing/portal` — owner-only, returns portal URL
  (cancel/payment-method self-service).
- Update `docs/ROUTES.md`.

## Step 6 — Paywall UI + i18n

- `islands/UpgradeButton.tsx`: owner sees "Mejorar a Pro" (sidebar footer above
  LocaleToggle + contextual CTAs at each locked feature); non-owner members see
  "ask the owner to upgrade" tooltip.
- `components/PaywallCard.tsx` (server): used on history page locked rows,
  full-group join error, template-limit error toast.
- i18n keys in `lib/i18n.ts` (es + en) for all paywall/upgrade/success strings.
- Demo route: unaffected (no billing on demo data).

## Step 7 — Config, docs, ops

- `.env.example`: `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_ENV`
  (`sandbox`|`production`), `POLAR_CHECKOUT_LINK` (or monthly/yearly ids).
- `README.md`/`README.es.md`: billing section; `docs/BUSINESS_LOGIC.md`:
  plans/limits; `CHANGELOG.md` entry.
- **User manual steps** (same pattern as DB runbook): create Polar org +
  products (monthly/yearly) + checkout link, set OAT + webhook secret in Deno
  Deploy env, register webhook URL `https://<app>/api/webhooks/polar`, run
  `db/add_billing.sql` on prod BEFORE deploy.

## Step 8 — Tests

- `lib/entitlements_test.ts`: plan resolution incl. grace period, grandfathered.
- Route tests (db stub): registry-create cap, join member cap (403/402 +
  message), template cap, history depth shaping.
- Webhook test: signature verify (valid/invalid/tampered), event→DB upsert
  mapping.
- `deno task check` green; verify no regression on the 417-step suite.

## Explicitly out of scope

- No Stripe/MercadoPago implementation (abstraction seam only).
- No per-user billing, no seat pricing, no refunds UI (Polar dashboard covers
  refunds).
- No new paid-only features (export/charts) — future work.

## Deployment order (critical)

1. Run `db/add_billing.sql` on prod (grandfathers everyone → zero user-facing
   change).
2. Configure Polar sandbox → test end-to-end with `polar listen` locally.
3. Switch to Polar production keys in Deno Deploy env.
4. Push/deploy.

---

## Implementation status (2026-08-14)

All steps implemented on branch `feat/monetization-pro-tier`. One deliberate
deviation from the original plan:

- **Template cap counts distinct recurring groups** (not transactions) via
  `countActiveTemplates()` — clones of the same template (carry-forward) and
  same-group edits stay free, only NEW template groups hit the cap.

### User runbook (do these before enabling in production)

1. Run `db/add_billing.sql` on prod **before** deploying the code (everyone is
   grandfathered → zero user-facing change).
2. Create a Polar **sandbox** org at sandbox.polar.sh:
   - Products: monthly (~$1.99) + yearly (~$15), with the 14-day no-card trial
     configured on the checkout link(s).
   - Checkout Link(s): one per product. Polar's documented query params do NOT
     include `interval` preselection — to reliably offer yearly, create a second
     link on the yearly product and set it as `POLAR_CHECKOUT_LINK_YEARLY`.
   - Checkout Link success URL:
     `https://<your-domain>/billing/success?checkout_id={CHECKOUT_ID}`
   - Copy the monthly link URL → `POLAR_CHECKOUT_LINK`.
   - Developer settings → create OAT → `POLAR_ACCESS_TOKEN`.
   - Webhooks → add endpoint `https://<your-domain>/api/webhooks/polar`,
     subscribe to subscription events → secret → `POLAR_WEBHOOK_SECRET`.
3. Set the `POLAR_*` vars in Deno Deploy env (`POLAR_ENV=sandbox`) and test
   end-to-end. Local dev: `polar listen --background` tunnels webhooks.
4. **Sandbox verification (the one thing unit tests can't cover):** complete a
   test purchase and confirm the subscription webhook actually carries
   `metadata.registry_id` (or at minimum the `reference_id` fallback — check the
   payload with `polar listen`). If neither field reaches the subscription
   object, upgrades will never activate: the webhook handler ignores events it
   can't map to a registry. Also verify a cancel flow end-to-end: Pro should
   persist for 3 days, then drop to free.
5. Go live: repeat in the production Polar org, flip `POLAR_ENV=production` and
   the prod checkout link(s)/token/secret in Deno Deploy, deploy.

> Domain note: webhook + success URLs live in the Polar dashboard, so moving
> from `*.deno.net` to a custom domain later is a dashboard-only change.
