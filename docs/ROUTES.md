# Routes Documentation

## Overview

Routes follow Fresh 2 conventions. Files use `define.page()`, `define.layout()`, and `define.handlers()`. Authenticated routes access shared `State` from `utils.ts`.

---

## Public Routes

### `/` — Home Page

**File**: `routes/index.tsx`

Landing page with two action cards:
- **Nuevo registro** — Links to `/registries/new` to create a new expense group
- **Unirme a registro** — Contains `JoinCodeForm` island for entering an invite code

No authentication required.

### `/login` — Login Page

**File**: `routes/login.tsx`

Displays `AuthForm` island in `mode="login"`. Shows an unauthorized error banner if `?error=unauthorized` query param is present.

Passes `supabaseUrl` and `supabaseAnonKey` as props to the island for client-side Supabase auth.

### `/signup` — Signup Page

**File**: `routes/signup.tsx`

Displays `AuthForm` island in `mode="signup"`. Same pattern as login — client handles signup via Supabase, then calls `/api/auth/callback` to set server cookies.

### `/join/[code]` — Join Registry via Invitation

**File**: `routes/join/[code].tsx`

**Handler (GET)**: Looks up invitation by URL parameter `code` via `getInvitationByCode()`.

**Page rendering**:
- If invitation not found → error page with "Invitación no encontrada"
- If invitation is expired, revoked, or maxed → error message
- If user is logged in → shows `JoinButton` island to accept invite
- If user is not logged in → links to `/login` and `/signup`

### `/registries/new` — New Registry Form

**File**: `routes/registries/new.tsx`

Simple HTML form that POSTs to `/api/registries`. Single field: registry name. No island needed — standard form submission.

---

## Dashboard Routes (Authenticated)

All under `routes/dashboard/`. Protected by shared layout.

### `/dashboard/_layout.tsx` — Dashboard Layout

**File**: `routes/dashboard/_layout.tsx`

Wraps all dashboard routes in a sidebar + content layout:
- Renders `Sidebar` island with user info, registry list, invite button
- Passes `ctx.state.registries`, `activeRegistry`, `isOwner` as props
- Computes `userInitials` from system user name

### `/dashboard` — Main Dashboard

**File**: `routes/dashboard/index.tsx`

**Handler (GET)**:
1. Resolves `registryUserId` from `ctx.state.registryUsers` matching the current system user
2. Fetches active transactions (`getActiveTransactions`)
3. Calculates balance (`calculateBalance`) for the current user
4. Fetches recurring/installment spawn candidates (`getSpawnCandidates`)
5. Enriches each transaction with `paidByUser` (the `User` record for who paid)

**Page rendering**:
- Header with total balance (green if positive, red if negative)
- `RecurringSpawn` island (only visible if there are candidates)
- History link → `/dashboard/history`
- `CortarButton` island (only active when balance = $0 and transactions exist)
- `TransactionList` island with enriched transactions, users, and current user ID

### `/dashboard/history` — Exercise History

**File**: `routes/dashboard/history.tsx`

**Handler (GET)**:
1. Fetches all exercises for active registry (`getExercises`)
2. Groups by year (descending)
3. Returns grouped exercises, year list, and flat exercise array

**Page rendering**:
- Back button → `/dashboard`
- `SearchBar` island (client-side filter — note: currently filters visually via CSS, the actual filtering is not implemented server-side)
- Exercises grouped by year with `ExerciseCard` components
- Empty state if no exercises exist

### `/dashboard/history/[id]` — Exercise Detail

**File**: `routes/dashboard/history/[id].tsx`

**Handler (GET)**:
1. Fetches exercise by ID (`getExerciseById`)
2. Fetches all transactions in that exercise (`getTransactionsByExercise`)
3. Enriches each with `paidByUser`

**Page rendering**:
- Exercise title: "Corte {month} {year}" in Spanish
- Transaction count and total amount
- List of `TransactionCard` components (server-rendered, not interactive)
- "Corte no encontrado" fallback if exercise doesn't exist

---

## API Routes

### `/api/auth/callback` — Auth Callback (POST)

**File**: `routes/api/auth/callback.ts`

Receives Supabase `accessToken` and `refreshToken` in JSON body. Sets them as `HttpOnly` cookies (`sb-access-token`, `sb-refresh-token`).

- Access token cookie: 7-day expiry
- Refresh token cookie: 30-day expiry

Called by `AuthForm` island after successful Supabase login/signup.

### `/api/auth/logout` — Logout (POST)

**File**: `routes/api/auth/logout.ts`

Clears auth cookies and redirects to `/login`.

### `/api/registries` — Create Registry (POST)

**File**: `routes/api/registries/index.ts`

Receives form data with `name`. Creates registry via `createRegistry(name, systemUserId)` which:
- Generates `db_name` from the name (lowercase, spaces→underscores)
- Creates registry record
- Adds current user as `owner` in `registry_members`
- Creates user record in registry's `users` table
- Sets as active registry
- Redirects to `/dashboard`

### `/api/registries/switch` — Switch Active Registry (POST)

**File**: `routes/api/registries/switch.ts`

Receives JSON `{ registryId }`. Validates user is a member of the target registry. Updates `user_preferences.active_registry_id`. Returns `{ ok: true }`.

### `/api/transactions` — Create Transaction (POST)

**File**: `routes/api/transactions/index.ts`

Receives form data with:
- `description`, `amount`, `originalAmount`, `type`, `splitJson`, `userPaid`, `notes`, `registryId`
- Optional: `installmentCurrent`, `installmentTotal` (for parcialidad)

Creates transaction via `createTransaction()`. Redirects to `/dashboard`.

### `/api/transactions/[id]` — Update/Delete Transaction

**File**: `routes/api/transactions/[id].ts`

**PUT**: Updates transaction fields from form data. Redirects to `/dashboard`.

**DELETE**: Deletes transaction by ID. Returns 204 on success, 404 if not found.

### `/api/transactions/disable-recurring` — Disable Recurring (POST)

**File**: `routes/api/transactions/disable-recurring.ts`

Receives JSON `{ id }`. Sets `recurring_disabled = true` on the transaction. Used by `RecurringSpawn` island to permanently exclude a recurring/installment from future carry-forward.

### `/api/exercises` — Create Exercise / Cut (POST)

**File**: `routes/api/exercises/index.ts`

Creates an exercise (cut) for the active registry:
1. Checks for active transactions
2. If any exist, calls `createExercise()` which:
   - Calculates date range (earliest transaction → now)
   - Sums total amounts
   - Creates exercise record
   - Assigns all active transactions to the exercise
3. Redirects to `/dashboard`

### `/api/exercises/carry-forward` — Carry Forward Recurring (POST)

**File**: `routes/api/exercises/carry-forward.ts`

Receives JSON `{ items: [{ id, quantity? }] }`. For each item:
- If parcialidad: clones `quantity` times, incrementing `installmentCurrent`
- If recurrente: clones once
- Each clone gets `exercise_id = NULL` (active in new period)

### `/api/invitations` — Create Invitation (POST)

**File**: `routes/api/invitations/index.ts`

Owner-only. Receives JSON `{ registryId, expiresAt?, maxUses? }`. Generates 8-character alphanumeric code. Creates invitation record + audit log entry. Returns `{ id, code, expiresAt }`.

### `/api/invitations/join` — Join via Invitation (POST)

**File**: `routes/api/invitations/join.ts`

Receives JSON `{ code }`. Validates invitation (not expired, not revoked, under max uses). If user is already a member, just sets active registry. Otherwise:
- Adds user to `registry_members` as `member`
- Creates user record in registry's `users` table
- Increments invitation's `current_uses`
- Sets as active registry
- Logs to audit log

Returns `{ registryId }` or error.

### `/api/invitations/list` — List Invitations (GET)

**File**: `routes/api/invitations/list.ts`

Owner-only. Query param `registryId`. Returns array of invitations for the registry.

### `/api/invitations/[id]/revoke` — Revoke Invitation (POST)

**File**: `routes/api/invitations/[id]/revoke.ts`

Owner-only. Sets `revoked_at = now()` on the invitation. Logs to audit log.
