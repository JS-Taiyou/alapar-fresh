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

**Props**: `{ hasTransactions: boolean }`

The "Cortar" (cut/settle) button in the dashboard header.

**Business Logic**:
- Button is **only enabled** when `hasTransactions === true`
- On click, POSTs to `/api/exercises` to create the exercise, then reloads

**Disabled state**: Grayed out, `cursor-not-allowed`, when no transactions exist.

---

## `EntityManager` — `islands/EntityManager.tsx`

**Props**: `{ registryId: string, entities: Entity[], onUpdate: () => void }`

Modal for managing third-party entities (terceros). Button with users icon.

**Behavior**:
- On create: POSTs to `/api/entities` with `{ name, color, registryId }`
- On edit: PUTs to `/api/entities/[id]` with `{ name, color }`
- On delete: DELETEs `/api/entities/[id]` (fails with 409 if entity has active transactions)
- Shows color picker (8 preset colors)
- Entities display with avatar initials and "Tercero" badge
- Calls `onUpdate` callback after any change to refresh parent state

---

## `DefaultSplitConfig` — `islands/DefaultSplitConfig.tsx`

**Props**: `{ registryId: string, users: User[], defaultSplit: DefaultSplit | null, onUpdate: () => void }`

Owner-only modal for configuring default split percentages.

**Behavior**:
- Shows all participants with percentage inputs
- POSTs to `/api/registries/default-split` with `{ splits, registryId }`
- DELETEs to `/api/registries/default-split` to clear
- Auto-complement for 2 users (editing one fills the other to 100%)
- Calls `onUpdate` callback after save/clear

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

**Props**: `{ registries: Registry[], activeRegistryId: string, userName: string, userInitials: string, isOwner: boolean, entities: Entity[], registryUsers: User[], defaultSplit: DefaultSplit | null, deletableRegistryIds: Set<string> }`

Collapsible sidebar with user info, registry list, entity manager, default split config, invite button, and actions.

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
- "Terceros" button opens `EntityManager` island
- "Default Split" button opens `DefaultSplitConfig` island
- Rename registry (inline edit)
- Delete empty registries

**Actions**:
- "Nuevo Registro" — links to `/registries/new`
- "Cerrar sesión" — POSTs to `/api/auth/logout`, redirects to `/login`

---

## `BalanceBreakdown` — `islands/BalanceBreakdown.tsx`

**Props**: `{ balance: Signal<number>, entries: Signal<BalanceBreakdownEntry[]>, users: Signal<Participant[]> }`

Interactive popover in the dashboard header showing pairwise debt breakdown for multi-user registries.

**Behavior**:
- Always renders the total balance amount (green if positive, red if negative)
- When more than 2 participants: the balance becomes a clickable button with a chevron indicator
- On click, opens a popover below the balance showing per-person breakdown:
  - **"Te deben"** section (green): lists users who owe the current user, with amounts
  - **"Debes"** section (red): lists users the current user owes, with amounts
  - Each entry shows the user's avatar initials (colored with `userColor`), name, and signed amount
  - Empty state: checkmark icon + "Todos están balanceados"
- Click outside the popover to dismiss (fixed backdrop overlay)
- When 2 or fewer participants: behaves like the old static display (no popover, `cursor-default`)

**Data source**: `calculatePairwiseBreakdown()` from `lib/calculations.ts`, computed server-side in the dashboard handler.

---

## `TransactionList` — `islands/TransactionList.tsx`

**Props**: `{ transactions: Signal<EnrichedTransaction[]>, users: Signal<Participant[]>, currentUserId: Signal<string>, registryId: Signal<string>, balance: Signal<number>, balanceEntries: Signal<BalanceBreakdownEntry[]>, defaultSplit: Signal<DefaultSplit | null>, entityIds: Set<string> }`

The main transaction list on the dashboard. Handles both listing and CRUD for transactions.

**Features**:
- Lists all active transactions with per-user balance display
- FAB button opens modal for **new** transaction
- Clicking a transaction card opens modal for **editing** that transaction
- Supports all transaction types: unico, parcialidad, recurrente, **pago**, **ajuste**
- Entity participants show a "tercero" badge (identified via `entityIds` prop)

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
- Infers `splitMode` from the saved split: auto (equal percentages), percentage (custom %), or fixed (custom amounts that sum to total)
- Shows "Eliminar" button (with confirmation dialog) that DELETEs the transaction

**Balance Display per Transaction**:
- For expenses: shows personal balance (green if positive, red if negative) + "de $total" subtitle
- For payments/adjustments: shows indigo/amber-colored amount with contextual label ("Le pagaste a X" / "Te pagó X")
- Installments show the per-installment portion (divided by `installmentTotal`)

**Submit**:
- New: POSTs FormData to `/api/transactions`
- Edit: PUTs FormData to `/api/transactions/[id]`
- Both reload the page after
