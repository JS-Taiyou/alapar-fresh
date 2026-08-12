# Database Documentation

## Overview

Single PostgreSQL database (Supabase-hosted) with UUID primary keys. All
per-registry data uses a `registry_id` foreign key for isolation, replacing the
original app's per-registry SQLite file approach.

**Connection**: Via `pg` connection pool (`lib/db.ts`) using `DATABASE_URL` env
var with SSL.

---

## Tables

### `users` — Unified User Identity + Profile

| Column           | Type        | Constraints                 | Description                                            |
| ---------------- | ----------- | --------------------------- | ------------------------------------------------------ |
| id               | UUID        | PK, auto                    | Unique identifier (the single user ID used everywhere) |
| email            | TEXT        | NOT NULL, UNIQUE            | User email                                             |
| name             | TEXT        | NOT NULL                    | Display name                                           |
| supabase_auth_id | UUID        | UNIQUE                      | Links to Supabase Auth                                 |
| color            | TEXT        | NOT NULL, default '#093eaa' | Hex color for avatar                                   |
| created_at       | TIMESTAMPTZ | NOT NULL, default now()     | Creation timestamp                                     |

**Purpose**: Single table per user. Combines auth identity (email,
supabase_auth_id) with app profile (name, color). Created at signup time. One
row per real person, shared across all registries.

---

### `registries` — Expense Groups

| Column                     | Type        | Constraints             | Description                                                    |
| -------------------------- | ----------- | ----------------------- | -------------------------------------------------------------- |
| id                         | UUID        | PK, auto                | Unique identifier                                              |
| name                       | TEXT        | NOT NULL                | Display name (e.g., "Viaje a la playa")                        |
| is_default                 | BOOLEAN     | NOT NULL, default false | Legacy field                                                   |
| latest_accessed            | TIMESTAMPTZ | NOT NULL, default now() | Last access time                                               |
| default_split_json         | JSONB       | nullable                | Custom default split percentages                               |
| default_split_member_count | INTEGER     | nullable                | Member count when default was set (auto-invalidates on change) |
| entities_json              | JSONB       | default '[]'            | Third-party entities stored as JSON array                      |
| last_modified              | TIMESTAMPTZ | NOT NULL, default now() | Updated by trigger on any transaction CUD                      |
| created_at                 | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp                                             |

**Purpose**: Central hub for each expense group.

**Entities JSON format**:

```json
[
  { "id": "1", "name": "Landlord", "color": "#6b7280" },
  { "id": "2", "name": "Insurance Co", "color": "#f97316" }
]
```

Entity IDs are auto-incrementing integers (starting from 1). They are scoped to
the registry and can be referenced in `transactions.user_paid` and `split_json`.

---

### `registry_members` — Membership & Roles

| Column      | Type        | Constraints                | Description             |
| ----------- | ----------- | -------------------------- | ----------------------- |
| id          | UUID        | PK, auto                   | Unique identifier       |
| registry_id | UUID        | FK → registries, CASCADE   | Target registry         |
| user_id     | UUID        | FK → users, CASCADE        | Member                  |
| role        | TEXT        | NOT NULL, default 'member' | `'owner'` or `'member'` |
| joined_at   | TIMESTAMPTZ | NOT NULL, default now()    | Join timestamp          |

**Unique**: `(registry_id, user_id)` — one membership per user per registry.

**Roles**:

- `owner`: Can create/revoke invitations, configure default split. Assigned to
  the creator.
- `member`: Standard access, can view/create transactions.

---

### `user_preferences` — Per-User Settings

| Column             | Type        | Constraints                 | Description                 |
| ------------------ | ----------- | --------------------------- | --------------------------- |
| id                 | UUID        | PK, auto                    | Unique identifier           |
| user_id            | UUID        | FK → users, CASCADE, UNIQUE | User                        |
| active_registry_id | UUID        | FK → registries, SET NULL   | Currently selected registry |
| updated_at         | TIMESTAMPTZ | NOT NULL, default now()     | Last update timestamp       |

**Purpose**: Tracks which registry the user is currently viewing. Upserted on
registry switch and invitation acceptance.

---

### `exercises` — Historical Cuts/Settlements

| Column            | Type          | Constraints              | Description            |
| ----------------- | ------------- | ------------------------ | ---------------------- |
| id                | UUID          | PK, auto                 | Unique identifier      |
| registry_id       | UUID          | FK → registries, CASCADE | Registry scope         |
| start_date        | TIMESTAMPTZ   | NOT NULL, default now()  | Period start           |
| end_date          | TIMESTAMPTZ   | NOT NULL, default now()  | Period end             |
| transaction_count | INTEGER       | NOT NULL, default 0      | Number of transactions |
| total_amount      | NUMERIC(12,2) | NOT NULL, default 0      | Total expense amount   |

**Purpose**: Created by the "Cortar" action. Groups transactions into a
historical period. Active transactions have `exercise_id = NULL`.

---

### `transactions` — Expense & Payment Records

| Column                 | Type          | Constraints                           | Description                                                                    |
| ---------------------- | ------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| id                     | UUID          | PK, auto                              | Unique identifier                                                              |
| registry_id            | UUID          | FK → registries, RESTRICT             | Registry scope                                                                 |
| description            | TEXT          | NOT NULL                              | What the expense is for                                                        |
| amount                 | NUMERIC(12,2) | NOT NULL                              | Current amount                                                                 |
| original_amount        | NUMERIC(12,2) | NOT NULL                              | Full/original amount                                                           |
| type                   | TEXT          | NOT NULL, CHECK                       | `'unico'`, `'parcialidad'`, `'recurrente'`, `'pago'`, `'ajuste'`               |
| exercise_id            | UUID          | FK → exercises, SET NULL              | NULL = active, non-null = archived                                             |
| installment_current    | INTEGER       | nullable                              | Current installment number                                                     |
| installment_total      | INTEGER       | nullable                              | Total installments                                                             |
| recurring_disabled     | BOOLEAN       | NOT NULL, default false               | Soft-delete for recurring                                                      |
| recurring_group_id     | UUID          | nullable                              | Groups recurring clones together                                               |
| notes                  | TEXT          | NOT NULL, default ''                  | Optional notes                                                                 |
| split_json             | JSONB         | NOT NULL, default '{"splits":[]}'     | Split data (see below)                                                         |
| creator_id             | UUID          | FK → users, SET NULL                  | Who created it (nullable to preserve transactions if user deleted)             |
| user_paid              | UUID          | NOT NULL                              | Who paid (no FK — can be a user ID or entity ID from registries.entities_json) |
| related_transaction_id | UUID          | FK → transactions, SET NULL, nullable | For 'pago' type: links to the expense transaction this payment settles         |
| created_at             | TIMESTAMPTZ   | NOT NULL, default now()               | Creation timestamp                                                             |

**Key design decisions**:

- `user_paid` has **no FK constraint** — it can reference either `users.id`
  (real member) or an entity ID from `registries.entities_json`
- `creator_id` uses **SET NULL** on delete — transactions are preserved if a
  user is deleted
- `creator_id` is **nullable** for the same reason

---

### `invitations` — Invite Codes

| Column       | Type        | Constraints              | Description              |
| ------------ | ----------- | ------------------------ | ------------------------ |
| id           | UUID        | PK, auto                 | Unique identifier        |
| registry_id  | UUID        | FK → registries, CASCADE | Target registry          |
| code         | TEXT        | NOT NULL, UNIQUE         | 8-char alphanumeric code |
| created_by   | UUID        | FK → users               | Creator                  |
| expires_at   | TIMESTAMPTZ | nullable                 | Expiration time          |
| max_uses     | INTEGER     | nullable                 | Maximum accepted uses    |
| current_uses | INTEGER     | NOT NULL, default 0      | Current accepted count   |
| revoked_at   | TIMESTAMPTZ | nullable                 | Revocation timestamp     |
| created_at   | TIMESTAMPTZ | NOT NULL, default now()  | Creation timestamp       |

**Indexes**: `code`, `registry_id`

**Code generation**: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
(excludes ambiguous: I, O, 0, 1).

---

### `audit_log` — Audit Trail

| Column      | Type        | Constraints             | Description                          |
| ----------- | ----------- | ----------------------- | ------------------------------------ |
| id          | UUID        | PK, auto                | Unique identifier                    |
| actor_id    | UUID        | FK → users, SET NULL    | Who performed the action             |
| action      | TEXT        | NOT NULL                | Action name (e.g., `invite_created`) |
| target_type | TEXT        | NOT NULL                | Target entity type                   |
| target_id   | UUID        | nullable                | Target entity ID                     |
| metadata    | JSONB       | NOT NULL, default '{}'  | Additional data                      |
| created_at  | TIMESTAMPTZ | NOT NULL, default now() | Timestamp                            |

**Tracked actions**: `invite_created`, `invite_used`, `invite_revoked`

---

### `allowed_emails` — Registration Allowlist

| Column     | Type        | Constraints             | Description           |
| ---------- | ----------- | ----------------------- | --------------------- |
| id         | UUID        | PK, auto                | Unique identifier     |
| email      | TEXT        | NOT NULL, UNIQUE        | Allowed email address |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp    |

---

## Split JSON Format

The `split_json` JSONB field in transactions:

```json
{
  "splits": [
    {
      "userId": "uuid-1",
      "percentage": 50.0,
      "amount": 150.00
    },
    {
      "userId": "uuid-2",
      "percentage": 50.0,
      "amount": 150.00
    }
  ]
}
```

For `pago` (payment) and `ajuste` (adjustment) types, split contains single
recipient:

```json
{
  "splits": [
    {
      "userId": "recipient-uuid",
      "percentage": 100,
      "amount": 50.00
    }
  ]
}
```

The `userId` can be either a `users.id` (real member) or an entity ID from
`registries.entities_json`.

---

## Entity Relationships

```
users ──┬── registry_members ──── registries
        │                              │
        ├── user_preferences           ├── transactions (via creator_id)
        │                              ├── exercises
        ├── invitations (created_by)   ├── invitations
        │                              └── entities (stored in entities_json)
        └── audit_log (actor_id)
```

---

## Triggers

### `trg_transactions_registry_modified` — Auto-update `last_modified`

**On**: `transactions` table, AFTER INSERT OR UPDATE OR DELETE, FOR EACH ROW

**Function**: `update_registry_last_modified()`

Sets `registries.last_modified = now()` for the affected `registry_id` whenever
a transaction is created, updated, or deleted. Used by both client and server
caching layers to detect stale data.

---

## Migrations

Migrations must be run in order:

1. **`migrate_entities_phase1.sql`** — Adds `entities_json` to registries,
   extracts entities from `users` table, drops FK on `user_paid`, changes
   `creator_id` from CASCADE to SET NULL
2. **Manual step** — Deduplicate `users` table (one row per real person per
   registry, keeping the ID referenced by the most transactions)
3. **`migrate_entities_phase2.sql`** — Drops `is_entity`, `registry_id` columns
   from `users`
4. **`migrate_merge_users.sql`** — Merges `system_users` into `users` table,
   remaps all FK references, drops `system_users` table
5. **`add_push_subscriptions.sql`** — Adds `push_subscriptions` table for Web
   Push notifications
6. **`add_related_transaction_id.sql`** — Adds `related_transaction_id` column
   to `transactions`
7. **`add_registry_last_modified.sql`** — Adds `last_modified` column to
   `registries`, creates `update_registry_last_modified()` function and
   `trg_transactions_registry_modified` trigger
8. **`add_transaction_balances.sql`** — Adds `transaction_balances` table for
   persisted per-user balance deltas (see below), with a backfill that computes
   deltas for all existing transactions

---

## `transaction_balances` — Persisted Balance Deltas

| Column         | Type          | Constraints                             | Description                               |
| -------------- | ------------- | --------------------------------------- | ----------------------------------------- |
| transaction_id | UUID          | FK → transactions(id) ON DELETE CASCADE | The transaction this delta belongs to     |
| user_id        | UUID          | NOT NULL (not FK — may be an entity id) | The user/entity whose balance is affected |
| amount         | NUMERIC(12,2) | NOT NULL                                | Signed delta, pre-rounded to cents        |

**Primary key**: `(transaction_id, user_id)`

**Indexes**: `idx_tb_transaction(transaction_id)`, `idx_tb_user(user_id)`

**Purpose**: Stores the exact, rounded-to-cent balance impact of each
transaction on each affected user. Balance is then an exact `NUMERIC` SUM:

```sql
SELECT COALESCE(SUM(amount), 0) FROM transaction_balances tb
JOIN transactions t ON t.id = tb.transaction_id
WHERE tb.user_id = $1 AND t.registry_id = $2 AND t.exercise_id IS NULL
```

This eliminates the floating-point residue that caused 1-2 cent discrepancies
between users after a full payment. Deltas are computed by the pure
`computeDeltas()` function in `lib/balances.ts` and written at transaction
creation/update time. `ON DELETE CASCADE` handles cleanup when a transaction is
deleted.
