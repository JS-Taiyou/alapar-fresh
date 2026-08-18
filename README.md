# A la Par

**English** | [Español](README.es.md)

> Split shared expenses with your partner, friends, or roommates — and always
> settle _a la par_ (dead even).

![CI](https://github.com/JS-Taiyou/alapar-fresh/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-AGPLv3-blue)
![Demo](https://img.shields.io/badge/demo-live-brightgreen)

**[▶ Try the live guided demo — no signup needed](https://alapar.itzayanos.deno.net/demo)**
**Live app:** https://alapar.itzayanos.deno.net

## What it is

A la Par is a full-stack expense-splitting PWA for Spanish-speaking users.
Create a group ("registro"), log expenses and payments, and the app keeps a
running balance of who owes whom — across installments, recurring charges, and
direct payments between members.

- **Groups for any context** — couples, roommates, trips; users can belong to
  multiple groups
- **Installments & recurring charges** — tracks remaining cycles per purchase
  and ongoing subscriptions
- **Automatic balance calculation** — nets out arbitrary payments between any
  two members
- **"Corte de ejercicio" (period closing)** — archive a period's transactions
  and start with a clean slate; unsettled balances carry forward as opening
  transactions so nothing is lost
- **Searchable history** — filter the transaction list, and revisit closed
  periods anytime
- **Installable PWA** — optimistic updates, client-side caching via service
  workers, push notifications, and add-to-home-screen on Android and desktop
- **Real-time updates** — changes from other members appear instantly via
  Supabase Realtime

## Tech stack

| Layer     | Tech                                                           |
| --------- | -------------------------------------------------------------- |
| Frontend  | Deno + Fresh 2 (Preact + Signals), server-rendered islands     |
| Backend   | Supabase — Postgres, Auth (email/password + Google OAuth), RLS |
| Styling   | Tailwind CSS + DaisyUI (dark theme)                            |
| Hosting   | Deno Deploy                                                    |
| Packaging | PWA (web manifest + service worker + Web Push)                 |

## Engineering highlights

- **Money is handled in integer cents** end-to-end — no floating-point drift in
  balance math. Split shares always sum exactly to the original amount.
- **Deterministic remainder distribution** — when a split doesn't divide evenly,
  leftover cents are assigned reproducibly (seeded by a per-transaction UUID),
  so balances are auditable and fair in aggregate.
- **Exact balance persistence** — per-user deltas are stored as `NUMERIC(12,2)`
  in a `transaction_balances` table and summed via exact SQL arithmetic,
  eliminating the 1-2 cent discrepancies that accumulate with float-based
  running totals.
- **Realtime channel recovery** — if the Supabase Realtime WebSocket drops
  (token expiry, network blip, mobile sleep), the client automatically fetches a
  fresh token and resubscribes with backoff.
- **Security enforced in the database** — Postgres Row-Level Security isolates
  every group's data; the realtime channel can only deliver transactions from
  registries the authenticated user belongs to.
- **Comprehensive test suite** — 59 suites, 417 steps covering the balance
  engine, split math, route validation, and business rules, with a DB stub so
  tests run without a live database.

## Running locally

### Prerequisites

- [Deno](https://docs.deno.com/runtime/getting_started/installation) (latest)
- A [Supabase](https://supabase.com) project (free tier works)

### Setup

```bash
git clone https://github.com/JS-Taiyou/alapar-fresh.git
cd alapar-fresh
cp .env.example .env   # fill in your Supabase + VAPID credentials
```

Run the database migrations in `db/` against your Supabase project, in order:
`schema.sql` first, then the `add_*.sql` files, then `enable_rls.sql`,
`tighten_rls.sql`, and finally `enable_realtime.sql`.

Start the dev server:

```bash
deno task dev
```

Build and run for production:

```bash
deno task build
deno task start
```

## Testing

```bash
deno task test    # run the test suite (DB stubbed, no DATABASE_URL needed)
deno task check   # fmt + lint + type-check + tests
```

The suite covers the balance/splitting engine: shares always sum to the total,
the deviation between members is at most one cent, and identical inputs produce
identical splits. Route handlers are tested with a fake request context and a
stubbed query layer.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture,
  directory structure, auth flow, caching, realtime
- [`docs/BUSINESS_LOGIC.md`](docs/BUSINESS_LOGIC.md) — balance calculation,
  split modes, cortar/settle, carry-forward, invitations
- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, tables, migrations
- [`docs/ROUTES.md`](docs/ROUTES.md) — route inventory
- [`docs/ISLANDS.md`](docs/ISLANDS.md) — interactive components
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — server-side components
- [`CHANGELOG.md`](CHANGELOG.md) — record of significant changes

## Roadmap

- [ ] Android release via TWA (Google Play)
- [ ] Custom domain

## License

AGPLv3 — see [LICENSE](LICENSE).
