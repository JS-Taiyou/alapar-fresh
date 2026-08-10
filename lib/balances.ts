/**
 * Per-transaction balance delta computation.
 *
 * The canonical source of truth for how a single transaction affects each
 * user's balance. Each delta is rounded to the cent (`Math.round(x * 100) / 100`)
 * at computation time, so when these values are persisted as `NUMERIC(12,2)` and
 * later summed, the result is exact — no floating-point residue.
 *
 * This eliminates the historical divergence between {@link calculateBalance}
 * (which accumulated raw floats) and {@link calculatePairwiseBreakdown} (which
 * rounded per-counterparty). Both now sum the same persisted, pre-rounded
 * deltas and will always agree.
 *
 * Formula (mirrors the existing `calculateBalance` loop, generalized to all
 * affected users):
 *
 * For expenses (`unico`, `parcialidad`, `recurrente`):
 *   - payer: `+perInstallmentTotal - ownShare` (or `+perInstallmentTotal` if
 *     the payer is not in the split)
 *   - each non-payer in the split: `-theirShare`
 *
 * For payments/adjustments (`pago`, `ajuste`):
 *   - payer: `+originalAmount`
 *   - recipient (first split entry): `-originalAmount`
 */

import type { Transaction } from "./types.ts";

export interface BalanceDelta {
  userId: string;
  amount: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute the signed, rounded-to-cent balance delta for each user affected by
 * a single transaction.
 *
 * @returns array of `{ userId, amount }` — one per affected user. Users with a
 * zero delta are excluded. The payer is always included if they have a non-zero
 * delta (even when not in the split).
 */
export function computeDeltas(tx: Transaction): BalanceDelta[] {
  const deltas: BalanceDelta[] = [];

  if (tx.type === "pago" || tx.type === "ajuste") {
    // Payer is credited the full amount.
    deltas.push({ userId: tx.userPaid, amount: round(tx.originalAmount) });
    // Recipient (first split entry) is debited.
    const recipient = tx.splitJson.splits[0];
    if (recipient && recipient.userId !== tx.userPaid) {
      deltas.push({
        userId: recipient.userId,
        amount: round(-tx.originalAmount),
      });
    }
    return deltas;
  }

  // Expense (unico, parcialidad, recurrente).
  const divisor = tx.type === "parcialidad" && tx.installmentTotal
    ? tx.installmentTotal
    : 1;
  const perTotal = tx.originalAmount / divisor;

  // Each user in the split owes their per-installment share.
  const splits = tx.splitJson?.splits ?? [];
  for (const split of splits) {
    const share = split.amount / divisor;
    if (split.userId === tx.userPaid) {
      // Payer: credited the full per-installment total, debited their own share.
      deltas.push({ userId: split.userId, amount: round(perTotal - share) });
    } else {
      deltas.push({ userId: split.userId, amount: round(-share) });
    }
  }

  // If the payer is NOT in the split, they are credited the full per-installment
  // total (they paid for everyone but owe nothing themselves). This fixes a
  // latent inconsistency where calculateBalance gave 0 for this case while
  // calculatePairwiseBreakdown credited the full amount.
  const payerInSplit = splits.some((s) => s.userId === tx.userPaid);
  if (!payerInSplit) {
    deltas.push({ userId: tx.userPaid, amount: round(perTotal) });
  }

  return deltas;
}
