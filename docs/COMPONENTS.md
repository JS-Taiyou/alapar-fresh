# Components Documentation

Components are server-rendered Preact components (not islands). They receive
data as props and render static HTML.

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
