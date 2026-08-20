# Islands Documentation

Islands are Fresh's interactive Preact components that hydrate on the client.
They use `@preact/signals` for reactive state management.

## Cross-island state — `islands/shared-signals.ts`

Signals live in the islands that own them; when siblings must synchronize, they
do it through two module-level signals instead of DOM events:

- **`registrySwitch`** — the Sidebar publishes a full registry snapshot (typed
  as `RegistrySwitchPayload`) on every registry switch; TransactionList reacts
  by replacing its data signals
- **`entitiesChanged`** — EntityManager publishes the fresh entity list (or a
  "refetch" hint when the list wasn't returned)

Both are client-only: nothing reads them during SSR, and producers always assign
freshly-built objects so repeated updates keep notifying.

---

## `AuthForm` — `islands/AuthForm.tsx`

**Props**:
`{ mode: "login" | "signup", supabaseUrl: string, supabaseAnonKey: string, locale?: Locale }`

Client-side authentication form using Supabase JS SDK directly in the browser.

**Behavior**:

- Creates a Supabase client with the provided URL and anon key, with
  `persistSession: false` — sessions live in `HttpOnly` cookies, never in
  browser storage
- **Signup flow**: Calls `signUp()`, then sends tokens to `/api/auth/callback`
  via POST (open signup — no allowlist)
- **Login flow**: Calls `signInWithPassword()`, then sends tokens to
  `/api/auth/callback`
- **Google OAuth**: Uses a dedicated PKCE client (`flowType: "pkce"`,
  `persistSession: true` — required only so the code verifier survives the
  redirect round-trip) and redirects through `/auth/callback`, where
  `AuthCallback` exchanges the `?code=` param; the stored `sb-*` keys are wiped
  after the exchange
- On success, redirects to `/dashboard` (or to a validated relative
  `redirect`/`next` path — absolute URLs are rejected)
- Shows password toggle (eye icon, hold to reveal)
- Cross-links between login and signup pages

**Validation**: Email required, password minimum 6 characters, name required for
signup.

---

## `AuthCallback` — `islands/AuthCallback.tsx`

**Props**:
`{ redirectPath: string, supabaseUrl: string, supabaseAnonKey: string }`

OAuth landing page (`/auth/callback`) for the Google sign-in flow.

**Behavior**:

- Reads the `?code=` query param (PKCE flow — the older `location.hash` implicit
  flow is gone)
- Creates a PKCE client (`flowType: "pkce"`, `persistSession: true` — required
  only to read the code verifier left in localStorage by the initiating client)
  and calls `exchangeCodeForSession(code)`
- Wipes the stored `sb-*` localStorage keys immediately after the exchange
  (`clearSupabaseBrowserStorage`) — sessions live in `HttpOnly` cookies
- Strips the consumed single-use code from the URL via `history.replaceState`
- POSTs the session tokens to `/api/auth/callback`; on 400/401 restarts at
  `/login`
- `redirectPath` is validated to a relative same-origin path (also enforced
  server-side) — anything else falls back to `/dashboard`
- Renders `AuthCardLayout` with a branded spinner, or an error card with a
  collapsible technical-details block

---

## `CortarButton` — `islands/CortarButton.tsx`

**Props**: `{ hasTransactions: boolean, registryId: string, isDemo?: boolean }`

The "Cortar" (cut/settle) button in the dashboard header (hidden on the demo
page).

**Business Logic**:

- Button is **only enabled** when `hasTransactions === true`
- On click, opens a confirmation modal (shared `Modal` component, Escape to
  close), then POSTs to `/api/exercises` and reloads
- A failed cut shows an error alert instead of reloading — a rejected cut is
  never indistinguishable from a successful one

**Disabled state**: Grayed out, `cursor-not-allowed`, when no transactions
exist.

---

## `EntityManager` — `islands/EntityManager.tsx`

**Props**: `{ registryId: string, entities: Signal<Entity[]> }`

Modal (shared `Modal` scaffold) for managing third-party entities (terceros).
Button with users icon. Rendered inside the Sidebar (desktop and mobile asides
share one `entities` signal).

**Behavior**:

- On create: POSTs to `/api/entities` with `{ name, color, registryId }`
- On edit: PUTs to `/api/entities/[id]` with `{ name, color }`
- On delete: DELETEs `/api/entities/[id]` (fails with 409 if entity has active
  transactions)
- Shows color picker (8 preset colors)
- Entities display with avatar initials and "Tercero" badge
- After any change, publishes the fresh entity list (or a "refetch" hint) on the
  shared `entitiesChanged` signal — the Sidebar and TransactionList react to it
  without a prop callback

---

## `DefaultSplitConfig` — `islands/DefaultSplitConfig.tsx`

**Props**:
`{ registryId: string, users: User[], defaultSplit: DefaultSplit | null, isOwner: boolean, autoOpen?: boolean, onClose?: () => void }`

Owner-only modal (shared `Modal` scaffold) for configuring default split
percentages. Opened per-registry from the Sidebar's "%" action.

**Behavior**:

- Shows all participants with percentage inputs
- POSTs to `/api/registries/default-split` with `{ splits, registryId }`
- DELETEs to `/api/registries/default-split` to clear (reloads — the default
  split feeds the SSR-rendered dashboard)
- Auto-complement for 2 users (editing one fills the other to 100%)
- Percentages must sum to 100% before the save button enables

---

## `JoinButton` — `islands/JoinButton.tsx`

**Props**: `{ code: string }`

Single button on the `/join/[code]` page for authenticated users to accept an
invitation.

**Behavior**:

- POSTs to `/api/invitations/join` with the invitation code
- On success, redirects to `/dashboard`
- Shows loading state and error messages

---

## `JoinCodeForm` — `islands/JoinCodeForm.tsx`

No props. Simple form on the home page for entering an invite code.

**Behavior**:

- Text input (max 8 chars) + submit button
- On submit, navigates to `/join/[CODE]` with the uppercase-trimmed code
- No API call — just client-side navigation

---

## `RecurringSpawn` — `islands/RecurringSpawn.tsx`

**Props**: `{ candidates: Signal<SpawnCandidate[]>, isDemo?: boolean }`

(`SpawnCandidate` comes from `lib/types.ts` — shared with the dashboard handler
and the registry-switch payload.)

Manages recurring expense carry-forward after a cut. Button with refresh icon
and badge count.

**SpawnCandidate**:
`{ id, description, type, originalAmount, installmentCurrent, installmentTotal }`

**Behavior**:

- Renders nothing if no candidates exist
- Opens modal showing all candidate transactions with checkboxes
- For **parcialidad**: shows installment progress (e.g., "3/12") and quantity
  selector (+/- buttons)
- Users can **disable** recurring items (POSTs to
  `/api/transactions/disable-recurring`)
- On confirm: POSTs checked items with quantities to
  `/api/exercises/carry-forward`, then reloads
- A failed spawn shows an error alert instead of reloading silently

---

## `SearchBar` — `islands/SearchBar.tsx`

**Props**: `{ placeholder?: string, filterSelector?: string }`

Search input for the exercise history page.

**Behavior**:

- Text input with search icon, updates a signal on input
- When `filterSelector` is given (history passes `[data-exercise-card]`), hides
  the DOM nodes whose text doesn't match the query — client-side filtering over
  the server-rendered cards

---

## `Sidebar` — `islands/Sidebar.tsx`

**Props**:
`{ registries: Registry[], activeRegistryId: string, userName: string, userInitials: string, isOwner: boolean, ownerRegistryIds: Set<string>, entities: Entity[], registryUsers: User[], defaultSplit: DefaultSplit | null, deletableRegistryIds: Set<string>, initialCollapsed?: boolean, locale?: Locale, showUpgrade?: boolean }`

Collapsible sidebar with user info, registry list, entity manager, default split
config, invite button, and actions.

**Registry list**: Sorted — active registry always first, rest alphabetically by
name. Uses reactive `activeRegistryId` signal that updates on switch (no page
reload needed).

**Desktop behavior**:

- Collapsible via chevron button (full width → icon-only)
- Lists all registries with color-coded dots
- Active registry has highlighted background
- Click a registry → cache-aware switch (no full page reload)

**Mobile behavior**:

- Hamburger menu button (fixed bottom-left)
- Slides in from left with backdrop overlay
- Close button in header
- Two-finger swipe from left edge to open (PWA mode)
- `touch-action: manipulation` prevents zoom interference

**Cache-aware registry switch**:

1. Read the IndexedDB snapshot for the target registry (guarded by a generation
   counter so a slower stale switch can't overwrite a newer one)
2. Update `activeRegistryId` immediately; if a snapshot exists, publish it on
   the shared `registrySwitch` signal (`islands/shared-signals.ts`) →
   TransactionList updates all of its signals instantly
3. Background: POST `/api/stamp/{id}` (which also marks the registry active
   server-side) → compare `lastModified` → re-publish fresh data if stale
4. No snapshot → fetch `/api/dashboard?registryId=…` and publish that (full
   reload only on network failure)

**Optimistic updates**: registry rename (and delete) apply instantly and roll
back if the server rejects the request — a 403/409 never leaves a phantom rename
in the list.

**Owner-only features**:

- "Invitar" button opens the invite-code modal (shared `Modal` scaffold)
- Rename / configure default split / delete actions on each owned registry row
  (delete only offered for registries with zero transactions)

**Actions**:

- "Nuevo Registro" — links to `/registries/new`
- "Cerrar sesión" — POSTs to `/api/auth/logout` (which revokes the session
  server-side), then wipes every service-worker cache (directly and via the
  `CLEAR_CACHES` SW message), clears the IndexedDB registry snapshots, removes
  any `sb-*` localStorage keys, and redirects to `/login`

---

## `BalanceBreakdown` — `islands/BalanceBreakdown.tsx`

**Props**:
`{ balance: Signal<number>, entries: Signal<BalanceBreakdownEntry[]>, users: Signal<Participant[]> }`

Interactive popover in the dashboard header showing pairwise debt breakdown for
multi-user registries.

**Behavior**:

- Always renders the total balance amount (green if positive, red if negative)
- When more than 2 participants: the balance becomes a clickable button with a
  chevron indicator
- On click, opens a popover below the balance showing per-person breakdown:
  - **"Te deben"** section (green): lists users who owe the current user, with
    amounts
  - **"Debes"** section (red): lists users the current user owes, with amounts
  - Each entry shows the user's avatar initials (colored with `userColor`),
    name, and signed amount
  - Empty state: checkmark icon + "Todos están balanceados"
- Click outside the popover to dismiss (fixed backdrop overlay)
- When 2 or fewer participants: behaves like the old static display (no popover,
  `cursor-default`)

**Data source**: `calculatePairwiseBreakdown()` from `lib/calculations.ts`,
computed server-side in the dashboard handler.

---

## `TransactionList` — `islands/TransactionList.tsx`

**Props**:
`{ transactions: Signal<EnrichedTransaction[]>, users: Signal<Participant[]>, currentUserId: Signal<string>, registryId: Signal<string>, balance: Signal<number>, balanceEntries: Signal<BalanceBreakdownEntry[]>, defaultSplit: Signal<DefaultSplit | null>, spawnCandidates: Signal<SpawnCandidate[]>, lastModified: Signal<string | null>, entityIds: Signal<Set<string>>, entities: Signal<Entity[]>, transactionPayments: Signal<TransactionPayment[]>, supabaseUrl?: string, supabaseAnonKey?: string, isDemo?: boolean }`

The main transaction list on the dashboard. Handles listing, CRUD, caching, and
realtime updates. No access token is ever passed as a prop — the realtime client
fetches it from `/api/auth/token` when subscribing.

**Features**:

- Lists all active transactions with per-user balance display
- Desktop: floating FAB buttons for "Agregar pago" and "Agregar gasto" (visible
  on `sm:` and up)
- Mobile: inline "Agregar" button that expands to "Pago" / "Gasto" pair (visible
  below `sm:`)
- Clicking a transaction card opens modal for **editing** that transaction
- Supports all transaction types: unico, parcialidad, recurrente, **pago**,
  **ajuste**
- Entity participants show a "tercero" badge (identified via `entityIds` prop)

**Caching**:

- On data change: writes full snapshot to IndexedDB via `lib/cache.ts`
  (transactions, payments, balance, users, lastModified)
- Watches the shared `registrySwitch` signal (published by the Sidebar) →
  updates all signals instantly from the switched registry's data
- Deserializes `createdAt` strings back to `Date` objects on arrival

**Realtime**:

- Subscribes to Supabase Postgres Changes on `transactions` table filtered by
  `registry_id`
- Handles INSERT/UPDATE/DELETE with optimistic signal updates
- Re-fetches balance from `/api/dashboard` on each change
- Browser notifications for other users' inserts (15s cooldown)
- Subscribes to Web Push for background notifications

**Wake-up detection**:

- Listens to `visibilitychange`, `resume`, and `pageshow` events
- If backgrounded for >30s: compares stamp via `POST /api/stamp/{rid}` →
  refreshes if stale
- Reconnects realtime WebSocket via `resubscribe()` on wake-up

**Pago (Payment) Mode**:

- Different UI: shows "Pagó" and "Recibió" radio columns instead of split table
- Creates a `TransactionSplit` with single recipient at 100%
- Cannot select same user as both payer and recipient
- **Pairwise balance indicators** (when registry has 3+ users):
  - A "SALDO" column header appears in the payment table
  - For each non-self user, shows either:
    - **"Te debe $X"** (green) — if that user owes the current user
    - **"Le debes $X"** (red) — if the current user owes that user
    - Nothing — if balance between them is settled (~$0.00)
  - Self row shows no indicator (can't owe yourself)
  - Helps users decide who to pay and how much, without leaving the modal

**Default Split**:

- "Default" button pre-fills percentages from `defaultSplit` prop
- Falls back to equal split if no default configured

**Edit Mode**:

- Pre-populates all fields from the transaction
- Infers `splitMode` from the saved split: auto (equal percentages), percentage
  (custom %), or fixed (custom amounts that sum to total)
- Shows "Eliminar" button (with confirmation dialog) that DELETEs the
  transaction

**Balance Display per Transaction**:

- For expenses: shows personal balance (green if positive, red if negative) +
  "de $total" subtitle
- For payments/adjustments: shows indigo/amber-colored amount with contextual
  label ("Le pagaste a X" / "Te pagó X")
- Installments show the per-installment portion (divided by `installmentTotal`)

**Submit**:

- New: POSTs FormData to `/api/transactions`
- Edit: PUTs FormData to `/api/transactions/[id]`
- Both use optimistic updates — signals updated before server response, rolled
  back on error

---

## `DemoTour` — `islands/DemoTour.tsx`

No props. Floating tour button (bottom-left) on the `/demo` page, powered by
driver.js.

**Behavior**:

- Auto-opens the tour picker on first visit (suppressed afterwards via a
  `localStorage` flag; the button always remains)
- **Tour Rápido** (5 steps): dashboard highlights only
- **Tour Completo**: additionally opens the real expense modal (clicks the FAB
  programmatically), walks the type/split-mode controls, then closes it by
  dispatching a synthetic Escape — which works because every modal gets its
  Escape handling from the shared `Modal` component — and repeats inside the
  payment modal for the pay-exact-debt step
- Tour end/dismissal is detected via driver's `onDestroyed` hook

---

## `UpgradeButton` — `islands/UpgradeButton.tsx`

**Props**: `{ locale: Locale, registryId: string, isOwner: boolean }`

"Mejorar a Pro" CTA in the sidebar footer (rendered only for the free active
registry). Owner variant opens a monthly/yearly picker modal (shared `Modal`
scaffold) and redirects to the Polar checkout; non-owners see a hint to ask the
owner instead.

---

## `LocaleToggle` — `islands/LocaleToggle.tsx`

**Props**: `{ locale: Locale, full?: boolean, class?: string }`

ES/EN pill toggle (`role="group"` + `aria-pressed`). POSTs the choice to
`/api/locale` and reloads so the SSR re-renders in the new language.

---

## `ForgotPassword` — `islands/ForgotPassword.tsx`

**Props**: `{ supabaseUrl: string, supabaseAnonKey: string, locale?: Locale }`

Email-only form on `/forgot-password`: calls Supabase `resetPasswordForEmail`
client-side (redirecting back to `/reset-password`) and shows the localized
confirmation.

---

## `ResetPassword` — `islands/ResetPassword.tsx`

**Props**: `{ supabaseUrl: string, supabaseAnonKey: string, locale?: Locale }`

New-password form on `/reset-password`: establishes the recovery session in
memory only (`setSession` — never persisted), updates the password via
`updateUser`, then shows a success card linking to `/login` (the recovery
session is intentionally not turned into an app session).
