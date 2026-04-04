# Architecture

## Overview

Alapar (Fresh) is a web-based expense-splitting application built with **Deno**, **Fresh (v2)**, and **PostgreSQL** (Supabase-hosted). It's a port of the original Kotlin Multiplatform desktop/mobile app to a server-rendered web application.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Deno | Runtime |
| Fresh 2 | Web framework (SSR + Islands) |
| Preact + Signals | UI and reactive state |
| PostgreSQL (pg) | Database via connection pool |
| Supabase Auth | Authentication (email/password) |
| Tailwind CSS | Styling |

## Key Differences from Kotlin Version

| Aspect | Kotlin Version | Fresh Version |
|--------|---------------|---------------|
| Database | Per-registry SQLite files | Single PostgreSQL with `registry_id` on all tables |
| Auth | Certificate-based (256-char hex) | Supabase Auth (email/password + cookies) |
| State | In-memory Compose state | Server-rendered + client-side Preact Signals (Islands) |
| UI | Compose Multiplatform (Material3) | Preact/Tailwind (dark theme) |
| Platforms | Android, iOS, Desktop, Wasm | Web only |

## Application Flow

```
Browser Request
     │
     ▼
Fresh Middleware (utils.ts → State)
     │
     ├── No auth cookie → Public routes (/, /login, /signup, /join/[code])
     │
     └── Auth cookie valid → Resolve State:
          ├── systemUser (from Supabase Auth ID → system_users)
          ├── activeRegistry (from user_preferences.active_registry_id)
          ├── registryUsers (users in active registry)
          ├── registries (all registries user belongs to)
          └── isOwner (role check on active registry)
               │
               ▼
          Dashboard Layout (/_layout.tsx)
                │
                ├── Header: BalanceBreakdown (popover for pairwise) + Recurring + History + Cortar
                └── TransactionList: Active expenses + CRUD modal (with per-user balance in pago mode)
```

## Directory Structure

```
alapar-fresh/
├── routes/                    # Fresh file-based routing
│   ├── _app.tsx               # HTML shell (fonts, global styles)
│   ├── index.tsx              # Landing page
│   ├── login.tsx              # Login page
│   ├── signup.tsx             # Signup page
│   ├── join/[code].tsx        # Join registry via invite code
│   ├── registries/new.tsx     # Create new registry
│   ├── dashboard/
│   │   ├── _layout.tsx        # Dashboard layout with Sidebar
│   │   ├── index.tsx          # Main dashboard (balance + transactions)
│   │   └── history/
│   │       ├── history.tsx    # Exercise history list
│   │       └── [id].tsx       # Exercise detail
│   └── api/                   # API endpoints
│       ├── auth/              # Auth callback + logout
│       ├── exercises/         # Create exercise + carry-forward
│       ├── invitations/       # CRUD + join
│       ├── registries/        # Create + switch
│       └── transactions/      # CRUD + disable-recurring
├── islands/                   # Interactive client-side Preact components
├── components/                # Server-side presentational components
├── lib/
│   ├── db.ts                  # PostgreSQL connection pool
│   ├── supabase.ts            # Supabase client + auth helpers
│   ├── store.ts               # Data access layer (queries + business logic)
│   └── types.ts               # TypeScript interfaces
├── db/
│   └── schema.sql             # Full PostgreSQL schema
└── utils.ts                   # Fresh State definition + createDefine
```

## Authentication Flow

1. User visits `/login` or `/signup`
2. Supabase client-side SDK handles auth (signUp / signInWithPassword)
3. On success, tokens are sent to `/api/auth/callback` (POST)
4. Server sets `sb-access-token` and `sb-refresh-token` as HttpOnly cookies
5. Subsequent requests: middleware reads cookie → validates with Supabase → resolves `State`
6. Logout: `/api/auth/logout` clears cookies

## Authorization

- **Email allowlist**: `AuthForm.tsx` hardcodes allowed emails for signup
- **Role-based access**: Registry membership tracked in `registry_members` with `owner` or `member` roles
- **Owner-only actions**: Creating/revoking invitations
- **Member gating**: `ctx.state.registries` only contains registries the user belongs to

## State Management

### Server State (`utils.ts:State`)

Every request within an authenticated context has:

```typescript
interface State {
  systemUser: SystemUser | null;       // Global user identity
  activeRegistry: Registry | null;     // Currently selected registry
  registryUsers: User[];               // Users in active registry
  registries: Registry[];              // All registries for this user
  supabaseAuthId: string | null;       // Supabase auth UUID
  isOwner: boolean;                    // Is user owner of active registry
}
```

### Client State (Preact Signals)

Islands use `@preact/signals` for local reactive state. No global client-side store.

## Split JSON Format

Same format as Kotlin version, stored in `split_json` column (JSONB):

```json
{
  "splits": [
    { "userId": "uuid-1", "percentage": 50.0, "amount": 150.0 },
    { "userId": "uuid-2", "percentage": 50.0, "amount": 150.0 }
  ]
}
```

## Split Modes

| Mode | Behavior |
|------|----------|
| `auto` | Equal division among all users, remainder assigned to first user |
| `percentage` | User-defined percentages, amounts calculated from total |
| `fixed` | User-defined amounts, percentages derived from total |

## Transaction Types

| Type | Spanish | Behavior |
|------|---------|----------|
| `unico` | Único | One-time expense |
| `parcialidad` | Parcialidad | Installment: amount divided by `installmentTotal` |
| `recurrente` | Recurrente | Recurring: clones itself on carry-forward |
| `pago` | Pago | Direct payment between users (affects balance differently) |

## Balance Calculation

### Aggregate Balance (`calculateBalance`)

```
For each active transaction:
  If type is "pago" (payment):
    If current user paid: balance += originalAmount
    Else if user is in split: balance -= originalAmount

  Else (expense):
    userSplit = user's share from split_json
    divisor = installmentTotal (if parcialidad) else 1
    perInstallmentTotal = originalAmount / divisor
    perInstallmentSplit = userSplit / divisor

    If current user paid:
      balance += (perInstallmentTotal - perInstallmentSplit)
    Else:
      balance -= perInstallmentSplit
```

**Positive balance** = others owe you. **Negative balance** = you owe others.

### Pairwise Breakdown (`calculatePairwiseBreakdown`)

For multi-user registries (3+ members), the aggregate balance alone doesn't tell you _who_ you owe or who owes you. The pairwise breakdown solves this by tracking a running net between the current user and each other member:

```
For each active transaction:
  If type is "pago":
    If current user paid:  net[recipient] += originalAmount
    If someone else paid:  net[payer] -= originalAmount

  Else (expense):
    divisor = installmentTotal (if parcialidad) else 1

    If current user paid:
      For each OTHER user in split:
        net[otherUser] += theirSplit.amount / divisor
    Else (someone else paid):
      net[payer] -= currentUserSplit.amount / divisor
```

Returns a sorted list of `BalanceBreakdownEntry` (positive = owed to you, negative = you owe), filtered to entries with `|amount| >= $0.01`. Used by:
- **`BalanceBreakdown` island**: Popover on the dashboard header showing "Te debe $X" / "Le debes $X" per person
- **`TransactionList` island**: SALDO column in payment mode showing per-user balances to guide who to pay

## "Cortar" (Cut/Settle)

When balance is exactly $0.00 and there are active transactions:
1. Creates an `exercise` record spanning earliest active transaction date to now
2. All active transactions get their `exercise_id` set (archived)
3. Recurring/installment transactions that were archived become candidates for carry-forward

## Carry-Forward (Recurring Spawn)

After a cut, recurring expenses and incomplete installments can be cloned into the new period:
- **Recurrente**: Creates a fresh clone with `exercise_id = NULL`
- **Parcialidad**: Creates clone with `installmentCurrent` incremented by specified quantity
- Users can choose which items to include and disable ones no longer needed
