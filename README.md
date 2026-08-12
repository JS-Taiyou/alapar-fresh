# A la Par

Comparte gastos con tu pareja, amigos o roomies de forma sencilla.

A la Par is a shared expense tracker built with **Deno**, **Fresh 2**, and
**PostgreSQL** (Supabase-hosted). Create shared expense groups ("registros"),
log expenses and payments, and the app calculates who owes whom — down to the
cent. Built for Spanish-speaking users with a clean, dark-themed, mobile-first
PWA experience.

## Getting started

Install Deno: https://docs.deno.com/runtime/getting_started/installation

Start the dev server:

```
deno task dev
```

Build for production:

```
deno task build
```

## Testing

The project has a comprehensive test suite (47 suites, 339 steps) covering pure
logic, extracted modules, route-handler validation, and business rules.

```
deno task test    # run tests (uses deno.test.json with a DB stub)
deno task check   # fmt + lint + type-check + tests
```

Tests live alongside source as `*_test.ts` files. The test config remaps
`lib/db.ts` to a stub so tests run without `DATABASE_URL` or a live database.

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
