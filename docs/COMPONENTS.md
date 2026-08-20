# Components Documentation

Presentational Preact components (not routes, not islands). Most are
server-rendered only (ExerciseCard, TransactionCard, PaywallCard,
AuthCardLayout); `Modal` and `TransactionModal` are imported by islands and
therefore ship in the client bundle — they manage no data of their own.

---

## `Modal` — `components/Modal.tsx`

**Props**:
`{ onClose: () => void, title: ComponentChildren, subtitle?: ComponentChildren, widthClass?: string, closeOnBackdrop?: boolean, children: ComponentChildren, footer?: ComponentChildren }`

The shared modal scaffold used by every modal in the app (transaction editor,
invite, new registry, entities, default split, recurring spawn, cortar, upgrade
picker). Rendering a modal without it is the exception, not the rule.

**Behavior**:

- Fixed overlay + card with `role="dialog"` / `aria-modal` and a header (title,
  subtitle, close button)
- **Escape closes** — this is a contract, not a nicety: the demo tour closes
  whatever modal is open by dispatching a synthetic Escape keydown, so all
  Escape handling must come from here
- Backdrop click closes by default; form-heavy callers (the transaction editor)
  pass `closeOnBackdrop={false}` so an accidental click can't discard a
  half-filled form
- `widthClass` selects the card's max-width (default `max-w-md`); `footer`
  renders in the standard bottom bar (flex, space-between)

---

## `AuthCardLayout` — `components/AuthCardLayout.tsx`

**Props**: `{ pageTitle: string, children, centered?: boolean }`

Shared shell for the auth screens (login, signup, forgot/reset password, OAuth
callback): dark page with the logo mark and a centered card. Setting `pageTitle`
keeps the tab title consistent across those routes.

---

## `ExerciseCard` — `components/ExerciseCard.tsx`

**Props**: `{ exercise: Exercise, monthName: string, personalTotal?: number }`

Renders a single exercise (cut) as a clickable card in the history list.

**Layout**:

- Left side: month abbreviation badge (e.g., "ENE") in rounded box + title
  ("Corte enero 2025") + subtitle ("5 Gastos • Total: $1,234.56")
- Right side: chevron arrow (turns blue on hover)
- Entire card links to `/dashboard/history/[exercise.id]`
- Optional `personalTotal` shows the user's personal net balance for the
  exercise

**Styling**: Dark background (`#1e293b`), slate border, hover effect with
translate-x animation.

---

## `PaywallCard` — `components/PaywallCard.tsx`

**Props**: `{ locale: Locale, lockedCount: number }`

Server-rendered locked-history placeholder for closed exercises beyond the free
plan's history depth (newest closed exercise only on free registries). Renders
blurred "hidden rows" silhouettes, the locked count, and an upgrade CTA
funneling to `/pricing?registry_id=…` — the paywall doubles as feature
discovery; history is never silently hidden.

---

## `TransactionCard` — `components/TransactionCard.tsx`

**Props**:
`{ transaction: Transaction, paidByUser: Participant | null, currentUserId: string, allUsers?: Participant[] }`

Renders a single transaction as a card. Handles three distinct display modes:

### Payment (pago) Mode

- Left indigo border accent
- Description + "Pago" badge
- Contextual label: "Le pagaste a [name]" or "Te pagó [name]"
- Indigo-colored amount with +/- prefix

### Adjustment (ajuste) Mode

- Left amber border accent
- Description + "Ajuste" badge
- Contextual label: "Le pagaste a [name]" or "Te pagó [name]"
- Amber-colored amount with +/- prefix

### Expense Mode

- Calculates personal balance:
  - If current user paid: `perInstallmentTotal - perInstallmentSplit`
    (green/positive)
  - If someone else paid: `-perInstallmentSplit` (red/negative)
- For installments: divides `originalAmount` and split amounts by
  `installmentTotal`
- Shows "Tú pagaste" or payer's name
- Shows installment progress (e.g., "3/12") for parcialidad type
- Shows "de $total" subtitle under the balance

**Styling**: Card background, subtle white border, hover scale effect.

**Note**: Uses `Participant` type (not `User`) — both real users and entities
can appear as `paidByUser` or in `allUsers`.

---

## `TransactionModal` — `components/TransactionModal.tsx`

**Props**: all data arrives as **signals** plus callbacks —
`{ isOpen, editingId, modalMode ("expense" | "payment"), transactions, users, currentUserId, registryId, balanceEntries, defaultSplit, entityIds, entities, transactionPayments, onRecalculate, isDemo?, locale? }`

The create/edit form for expenses and payments, rendered inside the shared
`Modal` (backdrop-close disabled). Owned by `TransactionList` and reused
verbatim on the demo page.

**Expense mode**: description, amount (total or per-installment with live total
preview), type selector (único / parcialidad / recurrente with installment
current/total), payer select, notes, and the split table (auto / percentage /
fixed with auto-complement for 2-user registries and a sum-vs-total footer that
turns red on mismatch). Remembers the last split configuration per registry for
the day.

**Payment mode**: payer/recipient radio table (with pairwise "SALDO" indicators
in 3+-user registries and a pay-exact-debt shortcut), plus optional linking to
outstanding expenses — allocations are computed by remaining debt and rendered
with coverage bars.

**Submit flow** (optimistic, rollback-safe):

1. Builds the split JSON and linked-payment allocations, applies the optimistic
   transaction (and payment rows) to the signals, closes the modal, recalculates
   balances
2. POSTs/PUTs FormData to `/api/transactions`; on success the optimistic row is
   reconciled with the server row (real id, dates, payer)
3. On rejection (4xx or network): the pre-optimistic snapshots are restored,
   balances recalculated, the server's error is surfaced, and the modal
   **reopens with the user's input intact** (the form signals were never
   cleared)
4. Delete: confirmation dialog, optimistic removal, restored at its original
   position if the server rejects

The `submitting` signal guards double-submits and drives the "Guardando…" state
on both Save and Delete.
