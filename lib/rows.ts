/**
 * Pure row-mapping helpers.
 *
 * Each function converts a raw `pg` result row (`Record<string, unknown>`,
 * snake_case columns, numerics as strings) into the app's typed model. They
 * have no I/O and no side effects — extracted from `lib/store.ts` so they can
 * be unit-tested without a database.
 *
 * Branches worth knowing (locked down by `rows_test.ts`):
 *   - `rowToTransaction.splitJson`: parsed from string when the driver returns
 *     a string, used as-is when already an object.
 *   - `rowToTransaction.recurringGroupId`: falls back to the row id when the
 *     group id is null (load-bearing for spawn-candidate grouping).
 *   - `rowToRegistry.defaultSplit`: three-way branch — falsy → null, string →
 *     JSON.parse, object → as-is.
 */
import type {
  DefaultSplit,
  Entity,
  Exercise,
  Registry,
  Transaction,
  TransactionPayment,
  TransactionSplit,
  User,
} from "./types.ts";

export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    email: row.email as string,
    supabaseAuthId: (row.supabase_auth_id as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export function rowToTransaction(
  row: Record<string, unknown>,
): Transaction {
  return {
    id: row.id as string,
    registry_id: row.registry_id as string,
    description: row.description as string,
    amount: parseFloat(row.amount as string),
    originalAmount: parseFloat(row.original_amount as string),
    type: row.type as
      | "unico"
      | "parcialidad"
      | "recurrente"
      | "pago"
      | "ajuste",
    exerciseId: row.exercise_id as string | null,
    installmentCurrent: row.installment_current as number | null,
    installmentTotal: row.installment_total as number | null,
    recurringDisabled: (row.recurring_disabled as boolean) ?? false,
    recurringGroupId: (row.recurring_group_id as string) ??
      row.id as string,
    notes: row.notes as string,
    splitJson: typeof row.split_json === "string"
      ? JSON.parse(row.split_json)
      : row.split_json as TransactionSplit,
    relatedTransactionId: (row.related_transaction_id as string) ?? null,
    creatorId: row.creator_id as string,
    userPaid: row.user_paid as string,
    createdAt: new Date(row.created_at as string),
  };
}

export function rowToTransactionPayment(
  row: Record<string, unknown>,
): TransactionPayment {
  return {
    id: row.id as string,
    pagoId: row.pago_id as string,
    expenseId: row.expense_id as string,
    amount: parseFloat(row.amount as string),
    createdAt: new Date(row.created_at as string),
  };
}

export function rowToExercise(
  row: Record<string, unknown>,
): Exercise {
  return {
    id: row.id as string,
    registry_id: row.registry_id as string,
    startDate: new Date(row.start_date as string),
    endDate: new Date(row.end_date as string),
    transactionCount: row.transaction_count as number,
    totalAmount: parseFloat(row.total_amount as string),
  };
}

export function rowToRegistry(row: Record<string, unknown>): Registry {
  return {
    id: row.id as string,
    name: row.name as string,
    isDefault: row.is_default as boolean,
    latestAccessed: new Date(row.latest_accessed as string),
    defaultSplit: row.default_split_json
      ? (typeof row.default_split_json === "string"
        ? JSON.parse(row.default_split_json)
        : row.default_split_json as DefaultSplit)
      : null,
    defaultSplitMemberCount: (row.default_split_member_count as number) ??
      null,
    lastModified: row.last_modified
      ? new Date(row.last_modified as string)
      : null,
  };
}

// Entity and Participant are structurally identical for row-mapping purposes;
// re-exported here for symmetry, used by store.getEntities.
export function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
  };
}
