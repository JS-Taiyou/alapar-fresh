# Islands Documentation

Islands are Fresh's interactive Preact components that hydrate on the client. They use `@preact/signals` for reactive state management.

---

## `AuthForm` — `islands/AuthForm.tsx`

**Props**: `{ mode: "login" | "signup", supabaseUrl: string, supabaseAnonKey: string }`

Client-side authentication form using Supabase JS SDK directly in the browser.

**Behavior**:
- Creates a Supabase client with the provided URL and anon key
- **Signup flow**: Checks email against a hardcoded allowlist (`ALLOWED_EMAILS`), calls `signUp()`, then sends tokens to `/api/auth/callback` via POST
- **Login flow**: Calls `signInWithPassword()`, then sends tokens to `/api/auth/callback`
- On success, redirects to `/dashboard`
- Shows password toggle (eye icon, hold to reveal)
- Cross-links between login and signup pages

**Validation**: Email required, password minimum 6 characters, name required for signup.

---

## `CortarButton` — `islands/CortarButton.tsx`

**Props**: `{ balance: number, hasTransactions: boolean }`

The "Cortar" (cut/settle) button in the dashboard header.

**Business Logic**:
- Button is **only enabled** when `balance === 0` AND `hasTransactions === true`
- This enforces that all debts must be settled (balance zeroed via payments) before cutting
- On click, POSTs to `/api/exercises` to create the exercise, then reloads

**Disabled state**: Grayed out, `cursor-not-allowed`, when conditions aren't met.

---

## `ExpenseModal` — `islands/ExpenseModal.tsx`

**Props**: `{ users: User[], currentUserId: string, registryId: string }`

Modal for creating **new** expenses only (no editing capability). Rendered as a floating action button (FAB) that opens a modal.

**State Signals**:
- `amount`, `description`, `notes` — Form fields
- `expenseType` — `"unico" | "parcialidad" | "recurrente"`
- `installmentCurrent`, `installmentTotal` — Installment tracking
- `splitMode` — `"auto" | "percentage" | "fixed"`
- `userPaid` — Which user paid (radio selection)
- `percentages`, `fixedAmounts` — Per-user split values

**Split Calculation**:
- **Auto**: Equal division with remainder assigned to first user
- **Percentage**: User-defined percentages, amounts calculated as `total * pct / 100`
- **Fixed**: User-defined amounts, percentages derived as `amount / total * 100`

**Auto-complement** (2 users only): Editing one field auto-fills the complement (100% - X or total - $X).

**Input Sanitization**: `sanitizeDecimal()` strips non-numeric chars, allows single decimal point, max 2 decimal places.

**Submit**: Builds `TransactionSplit` JSON, POSTs as FormData to `/api/transactions`, reloads page.

---

## `InviteManager` — `islands/InviteManager.tsx`

**Props**: `{ registryId: string }`

Modal for managing invitations within a registry. Button with user+ icon.

**Behavior**:
- On open, loads all invitations for the registry via `GET /api/invitations/list`
- **Create**: POSTs to `/api/invitations`, displays generated code with copy button
- **Revoke**: POSTs to `/api/invitations/[id]/revoke`, refreshes list
- Shows usage count (`currentUses/maxUses`) and revoked status for each invitation

---

## `JoinButton` — `islands/JoinButton.tsx`

**Props**: `{ code: string }`

Single button on the `/join/[code]` page for authenticated users to accept an invitation.

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

**Props**: `{ candidates: SpawnCandidate[] }`

Manages recurring expense carry-forward after a cut. Button with refresh icon and badge count.

**SpawnCandidate**: `{ id, description, type, originalAmount, installmentCurrent, installmentTotal }`

**Behavior**:
- Renders nothing if no candidates exist
- Opens modal showing all candidate transactions with checkboxes
- For **parcialidad**: shows installment progress (e.g., "3/12") and quantity selector (+/- buttons)
- Users can **disable** recurring items (POSTs to `/api/transactions/disable-recurring`)
- On confirm: POSTs checked items with quantities to `/api/exercises/carry-forward`
- Reloads page after spawn

---

## `SearchBar` — `islands/SearchBar.tsx`

No props. Search input for the exercise history page.

**Behavior**:
- Text input with search icon
- Updates a signal on input
- Currently **cosmetic only** — the filtering is not wired up server-side (exercises are pre-rendered)

---

## `Sidebar` — `islands/Sidebar.tsx`

**Props**: `{ registries: Registry[], activeRegistryId: string, userName: string, userInitials: string, isOwner: boolean }`

Collapsible sidebar with user info, registry list, invite button, and actions.

**Desktop behavior**:
- Collapsible via chevron button (full width → icon-only)
- Lists all registries with color-coded dots
- Active registry has highlighted background
- Click a registry → POSTs to `/api/registries/switch` → redirects to `/dashboard`

**Mobile behavior**:
- Hamburger menu button (fixed top-left)
- Slides in from left with backdrop overlay
- Close button in header

**Owner-only features**:
- "Invitar" button opens inline invite modal
- Generates invite code via `/api/invitations`, displays with copy-to-clipboard

**Actions**:
- "Nuevo Registro" — links to `/registries/new`
- "Cerrar sesión" — POSTs to `/api/auth/logout`, redirects to `/login`

---

## `BalanceBreakdown` — `islands/BalanceBreakdown.tsx`

**Props**: `{ balance: number, entries: BalanceBreakdownEntry[], usersCount: number }`

Replaces the static balance display in the dashboard header with an interactive popover that shows pairwise debt breakdown for multi-user registries.

**Behavior**:
- Always renders the total balance amount (green if positive, red if negative)
- When `usersCount > 2`: the balance becomes a clickable button with a chevron indicator
- On click, opens a popover below the balance showing per-person breakdown:
  - **"Te deben"** section (green): lists users who owe the current user, with amounts
  - **"Debes"** section (red): lists users the current user owes, with amounts
  - Each entry shows the user's avatar initials (colored with `userColor`), name, and signed amount
  - Empty state: checkmark icon + "Todos están balanceados"
- Click outside the popover to dismiss (fixed backdrop overlay)
- When `usersCount <= 2`: behaves like the old static display (no popover, `cursor-default`)

**Data source**: `calculatePairwiseBreakdown()` from `lib/store.ts`, computed server-side in the dashboard handler.

---

## `TransactionList` — `islands/TransactionList.tsx`

**Props**: `{ transactions: EnrichedTransaction[], users: User[], currentUserId: string, registryId: string, balanceBreakdown: BalanceBreakdownEntry[] }`

The main transaction list on the dashboard. Handles both listing and CRUD for transactions.

**Features**:
- Lists all active transactions with per-user balance display
- FAB button opens modal for **new** transaction
- Clicking a transaction card opens modal for **editing** that transaction
- Supports all 4 transaction types: unico, parcialidad, recurrente, **pago**

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

**Edit Mode**:
- Pre-populates all fields from the transaction
- Infers `splitMode` from the saved split: auto (equal percentages), percentage (custom %), or fixed (custom amounts that sum to total)
- Shows "Eliminar" button (with confirmation dialog) that DELETEs the transaction

**Balance Display per Transaction**:
- For expenses: shows personal balance (green if positive, red if negative) + "de $total" subtitle
- For payments: shows indigo-colored amount with contextual label ("Le pagaste a X" / "Te pagó X")
- Installments show the per-installment portion (divided by `installmentTotal`)

**Submit**:
- New: POSTs FormData to `/api/transactions`
- Edit: PUTs FormData to `/api/transactions/[id]`
- Both reload the page after
