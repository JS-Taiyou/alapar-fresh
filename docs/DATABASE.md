# Database Documentation

## Overview

Single PostgreSQL database (Supabase-hosted) with UUID primary keys. All per-registry data uses a `registry_id` foreign key for isolation, replacing the original app's per-registry SQLite file approach.

**Connection**: Via `pg` connection pool (`lib/db.ts`) using `DATABASE_URL` env var with SSL.

---

## Tables

### `system_users` — Global User Identity

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| email | TEXT | NOT NULL, UNIQUE | User email |
| name | TEXT | NOT NULL | Display name |
| supabase_auth_id | UUID | UNIQUE | Links to Supabase Auth |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Purpose**: Bridges Supabase Auth to the application's data model. One row per registered user.

---

### `registries` — Expense Groups

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| name | TEXT | NOT NULL | Display name (e.g., "Viaje a la playa") |
| db_name | TEXT | NOT NULL, UNIQUE | Slug: lowercase, underscores (e.g., "viaje_a_la_playa") |
| is_default | BOOLEAN | NOT NULL, default false | Legacy field |
| latest_accessed | TIMESTAMPTZ | NOT NULL, default now() | Last access time |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Purpose**: Central hub for each expense group. `db_name` is derived from the name during creation.

---

### `registry_members` — Membership & Roles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| registry_id | UUID | FK → registries, CASCADE | Target registry |
| user_id | UUID | FK → system_users, CASCADE | Member |
| role | TEXT | NOT NULL, default 'member' | `'owner'` or `'member'` |
| joined_at | TIMESTAMPTZ | NOT NULL, default now() | Join timestamp |

**Unique**: `(registry_id, user_id)` — one membership per user per registry.

**Roles**:
- `owner`: Can create/revoke invitations. Assigned to the creator.
- `member`: Standard access, can view/create transactions.

---

### `user_preferences` — Per-User Settings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| user_id | UUID | FK → system_users, CASCADE, UNIQUE | User |
| active_registry_id | UUID | FK → registries, SET NULL | Currently selected registry |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() | Last update timestamp |

**Purpose**: Tracks which registry the user is currently viewing. Upserted on registry switch and invitation acceptance.

---

### `users` — Per-Registry User Profiles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| registry_id | UUID | FK → registries, CASCADE | Registry scope |
| system_user_id | UUID | FK → system_users, CASCADE | Links to global identity |
| email | TEXT | NOT NULL | Email (denormalized) |
| name | TEXT | NOT NULL | Display name (denormalized) |
| color | TEXT | NOT NULL, default '#093eaa' | Hex color for avatar |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Purpose**: Each registry has its own set of user profiles. Created when a user joins or creates a registry. The `system_user_id` links back to the global identity.

---

### `exercises` — Historical Cuts/Settlements

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| registry_id | UUID | FK → registries, CASCADE | Registry scope |
| start_date | TIMESTAMPTZ | NOT NULL, default now() | Period start |
| end_date | TIMESTAMPTZ | NOT NULL, default now() | Period end |
| transaction_count | INTEGER | NOT NULL, default 0 | Number of transactions |
| total_amount | NUMERIC(12,2) | NOT NULL, default 0 | Total expense amount |

**Purpose**: Created by the "Cortar" action. Groups transactions into a historical period. Active transactions have `exercise_id = NULL`.

---

### `transactions` — Expense & Payment Records

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| registry_id | UUID | FK → registries, CASCADE | Registry scope |
| description | TEXT | NOT NULL | What the expense is for |
| amount | NUMERIC(12,2) | NOT NULL | Current amount |
| original_amount | NUMERIC(12,2) | NOT NULL | Full/original amount |
| type | TEXT | NOT NULL, CHECK | `'unico'`, `'parcialidad'`, `'recurrente'`, `'pago'` |
| exercise_id | UUID | FK → exercises, SET NULL | NULL = active, non-null = archived |
| installment_current | INTEGER | nullable | Current installment number |
| installment_total | INTEGER | nullable | Total installments |
| recurring_disabled | BOOLEAN | NOT NULL, default false | Soft-delete for recurring |
| recurring_group_id | UUID | nullable | Groups recurring clones together |
| notes | TEXT | NOT NULL, default '' | Optional notes |
| split_json | JSONB | NOT NULL, default '{"splits":[]}' | Split data (see below) |
| creator_id | UUID | FK → users, CASCADE | Who created it |
| user_paid | UUID | FK → users, CASCADE | Who paid |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Indexes**: `registry_id`, `exercise_id`

---

### `invitations` — Invite Codes

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| registry_id | UUID | FK → registries, CASCADE | Target registry |
| code | TEXT | NOT NULL, UNIQUE | 8-char alphanumeric code |
| created_by | UUID | FK → system_users | Creator |
| expires_at | TIMESTAMPTZ | nullable | Expiration time |
| max_uses | INTEGER | nullable | Maximum accepted uses |
| current_uses | INTEGER | NOT NULL, default 0 | Current accepted count |
| revoked_at | TIMESTAMPTZ | nullable | Revocation timestamp |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Creation timestamp |

**Indexes**: `code`, `registry_id`

**Code generation**: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes ambiguous: I, O, 0, 1).

---

### `audit_log` — Audit Trail

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, auto | Unique identifier |
| actor_id | UUID | FK → system_users, nullable | Who performed the action |
| action | TEXT | NOT NULL | Action name (e.g., `invite_created`) |
| target_type | TEXT | NOT NULL | Target entity type |
| target_id | UUID | nullable | Target entity ID |
| metadata | JSONB | NOT NULL, default '{}' | Additional data |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | Timestamp |

**Tracked actions**: `invite_created`, `invite_used`, `invite_revoked`

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

For `pago` (payment) type, split contains single recipient:
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

---

## Entity Relationships

```
system_users ──┬── registry_members ──── registries
               │                              │
               ├── user_preferences           ├── users (per-registry profiles)
               │                              ├── transactions
               │                              ├── exercises
               │                              └── invitations
               └── audit_log
```
