# Business Logic

## Core Concepts

### Registry
A group of people sharing expenses. Each registry is an isolated scope — users, transactions, exercises, and invitations all belong to one registry.

### Transaction Types

| Type | Description | Balance Effect |
|------|-------------|----------------|
| `unico` | One-time expense (e.g., dinner) | Standard split balance |
| `parcialidad` | Installment (e.g., laptop over 12 months) | Per-installment portion only |
| `recurrente` | Recurring expense (e.g., monthly rent) | Full amount, clones on carry-forward |
| `pago` | Direct payment between users | Special: payer +$amount, recipient -$amount |

### Split Modes

Users choose how to divide each expense:

1. **Auto** — Equal split among all members. Remainder cents go to the first user in the list.
2. **Percentage** — Each user gets a custom percentage. Sum must equal 100%. Amounts are calculated.
3. **Fixed** — Each user gets a custom amount. Sum must equal total. Percentages are derived.

For 2-user registries, editing one user's value auto-complements the other (e.g., enter 30% → other becomes 70%).

---

## Balance Calculation

The balance answers: "How much is this person owed (positive) or owes (negative)?"

### For Regular Expenses (unico, parcialidad, recurrente)

```
For each active transaction where user is in split:
  userSplit = user's amount from split_json
  divisor = installmentTotal (if parcialidad) else 1
  perInstallmentTotal = originalAmount / divisor
  perInstallmentSplit = userSplit / divisor

  IF userPaid == currentUser:
    balance += (perInstallmentTotal - perInstallmentSplit)
    // "Others owe me for their share"
  ELSE:
    balance -= perInstallmentSplit
    // "I owe my share to whoever paid"
```

**Why `total - userShare` when user paid?**
- User pays $100 for a $50 share
- User's pocket: -$100
- Fair share: $50
- Others collectively owe: $50 = $100 - $50 → positive (money flowing to user)

### For Payments (pago)

```
IF currentUser == userPaid:
  balance += originalAmount     // "I paid someone, reducing their debt to me"
ELSE IF currentUser in split:
  balance -= originalAmount     // "Someone paid me, reducing my debt to them"
```

---

## Cortar (Cut/Settle)

The cut operation archives all active expenses into a historical period.

**Prerequisites**: Balance must be exactly $0.00 (all debts settled via payments).

**Process**:
1. Earliest active transaction date → `start_date`
2. Current time → `end_date`
3. Count and sum all active transactions
4. Create `exercises` record
5. Set `exercise_id` on all active transactions (moves them out of "active" scope)

After cutting, the dashboard is empty and ready for a new period.

---

## Carry-Forward (Recurring Spawn)

After a cut, recurring expenses and incomplete installments can be "carried forward" into the new period.

### Candidates

**Recurrente transactions** that were just archived (have an `exercise_id`) become candidates for cloning.

**Parcialidad transactions** with `installmentCurrent < installmentTotal` become candidates.

### Spawn Process

For each selected candidate:

- **Recurrente**: Clone the transaction with `exercise_id = NULL` (now active in new period). Same `recurring_group_id` links them.
- **Parcialidad**: Clone with `installmentCurrent` incremented by the specified quantity (default 1). Users can carry multiple installments at once.

### Disabling

Users can permanently disable a recurring group by setting `recurring_disabled = true`. This prevents it from appearing in future candidate lists.

---

## Invitation System

### Creating Invitations
- Only registry **owners** can create invitations
- 8-character code generated from unambiguous characters (no I, O, 0, 1)
- Optional: expiration time and max uses

### Joining via Invitation
- User navigates to `/join/[CODE]` or enters code on home page
- Validation: not expired, not revoked, under max uses
- If already a member: just sets active registry
- If new member:
  1. Added to `registry_members` as `member`
  2. User profile created in registry's `users` table
  3. Invitation `current_uses` incremented
  4. Active registry set to the joined registry
  5. Audit log entry created

### Revoking
- Owner-only action
- Sets `revoked_at` timestamp
- Audit log entry created

---

## Registry Creation Flow

```
User clicks "Nuevo registro"
→ Form at /registries/new
→ User enters name (e.g., "Viaje Playa")
→ POST /api/registries
→ store.createRegistry():
    1. dbName = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    2. INSERT into registries (or UPDATE if dbName exists)
    3. INSERT into registry_members as 'owner'
    4. Copy system_user info into registry's users table
    5. Set as active registry in user_preferences
→ Redirect to /dashboard
```

---

## Authentication Flow

```
1. User visits /login or /signup
2. AuthForm island handles Supabase auth client-side
3. On success, POST to /api/auth/callback with tokens
4. Server sets HttpOnly cookies:
   - sb-access-token (7 days)
   - sb-refresh-token (30 days)
5. Redirect to /dashboard
```

**Middleware** (`utils.ts` State): Every request reads `sb-access-token` cookie, validates with Supabase, resolves `systemUser` and all related state.

**Logout**: Clears both cookies, redirects to `/login`.
