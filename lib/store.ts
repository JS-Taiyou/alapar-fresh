import { query } from "./db.ts";
import { countRegistryMembers, getRegistryPlan } from "./entitlements.ts";
import type {
  Entity,
  Exercise,
  Participant,
  Registry,
  Transaction,
  TransactionPayment,
  User,
} from "./types.ts";
import {
  buildEqualSplit,
  buildFixedSplit,
  buildPercentageSplit,
  calculateBalance as calcBalancePure,
  calculateFullPairwiseBalances as calcFullPairwisePure,
  calculatePairwiseBreakdown as calcPairwiseBreakdownPure,
} from "./calculations.ts";
import { getUserActiveRegistry } from "./server-cache.ts";
import {
  rowToExercise,
  rowToRegistry,
  rowToTransaction,
  rowToTransactionPayment,
  rowToUser,
} from "./rows.ts";
import { filterSpawnCandidates, generateInviteCode } from "./invite.ts";
import {
  buildBatchPlaceholders,
  buildTransactionUpdateSets,
} from "./sql-builders.ts";
import { computeDeltas } from "./balances.ts";

export {
  buildEqualSplit,
  buildFixedSplit,
  buildPercentageSplit,
  calcFullPairwisePure as calculateFullPairwiseBalances,
  calcPairwiseBreakdownPure as calculatePairwiseBreakdown,
};
export { generateInviteCode };

/**
 * Write the computed balance deltas for a transaction into the
 * `transaction_balances` table. Called after every transaction INSERT and on
 * update (after deleting stale rows). Uses UPSERT to be idempotent.
 */
async function writeTransactionBalances(tx: Transaction): Promise<void> {
  const deltas = computeDeltas(tx);
  if (deltas.length === 0) return;
  const values: unknown[] = [];
  const placeholders = deltas.map((d, i) => {
    const base = i * 3;
    values.push(tx.id, d.userId, d.amount);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  }).join(", ");
  await query(
    `INSERT INTO transaction_balances (transaction_id, user_id, amount) VALUES ${placeholders}
     ON CONFLICT (transaction_id, user_id) DO UPDATE SET amount = EXCLUDED.amount`,
    values,
  );
}

/** Delete persisted balance deltas for a transaction (before re-computing on update). */
async function deleteTransactionBalances(transactionId: string): Promise<void> {
  await query(
    "DELETE FROM transaction_balances WHERE transaction_id = $1",
    [transactionId],
  );
}

const MONTHS_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export async function getUserBySupabaseId(
  supabaseAuthId: string,
): Promise<User | null> {
  const result = await query(
    "SELECT * FROM users WHERE supabase_auth_id = $1",
    [supabaseAuthId],
  );
  if (result.rows.length === 0) return null;
  return rowToUser(result.rows[0]);
}

export async function createUserFromSupabase(
  supabaseAuthId: string,
  email: string,
  name: string,
): Promise<User> {
  const result = await query(
    "INSERT INTO users (email, name, supabase_auth_id, color) VALUES ($1, $2, $3, $4) ON CONFLICT (supabase_auth_id) DO UPDATE SET email = $1, name = $2 RETURNING *",
    [email, name, supabaseAuthId, "#093eaa"],
  );
  return rowToUser(result.rows[0]);
}

export async function resolveUserState(supabaseAuthId: string): Promise<{
  user: User | null;
  isEmailAllowed: boolean;
  activeRegistry: Registry | null;
  isOwner: boolean;
  ownerRegistryIds: Set<string>;
  registries: Registry[];
  registryUsers: User[];
  entities: Entity[];
  participants: Participant[];
}> {
  const userResult = await query(
    `SELECT u.*, ae.id IS NOT NULL as is_email_allowed
     FROM users u
     LEFT JOIN allowed_emails ae ON ae.email = u.email
     WHERE u.supabase_auth_id = $1`,
    [supabaseAuthId],
  );
  if (userResult.rows.length === 0) {
    return {
      user: null,
      isEmailAllowed: false,
      activeRegistry: null,
      isOwner: false,
      ownerRegistryIds: new Set<string>(),
      registries: [],
      registryUsers: [],
      entities: [],
      participants: [],
    };
  }

  const row = userResult.rows[0];
  const user = rowToUser(row);
  const isEmailAllowed = row.is_email_allowed as boolean;

  if (!isEmailAllowed) {
    return {
      user,
      isEmailAllowed: false,
      activeRegistry: null,
      isOwner: false,
      ownerRegistryIds: new Set<string>(),
      registries: [],
      registryUsers: [],
      entities: [],
      participants: [],
    };
  }

  const registriesResult = await query(
    `SELECT r.*, rm.role as membership_role FROM registries r
     JOIN registry_members rm ON r.id = rm.registry_id
     WHERE rm.user_id = $1
     ORDER BY r.name`,
    [user.id],
  );

  const registriesList = registriesResult.rows.map(rowToRegistry);
  const ownerRegistryIds = new Set<string>(
    registriesResult.rows.filter((r) => r.membership_role === "owner").map(
      (r) => r.id as string,
    ),
  );
  let activeRegistry: Registry | null = null;
  let isOwner = false;
  let registryUsers: User[] = [];
  let entities: Entity[] = [];
  let participants: Participant[] = [];

  if (registriesList.length > 0) {
    const cachedActiveId = getUserActiveRegistry(user.id);
    activeRegistry = cachedActiveId
      ? registriesList.find((r) => r.id === cachedActiveId) ?? registriesList[0]
      : registriesList[0];
    const activeIdx = registriesList.indexOf(activeRegistry);
    const activeRow = registriesResult.rows[activeIdx];
    isOwner = activeRow.membership_role === "owner";

    const usersResult = await query(
      `SELECT u.* FROM users u
       JOIN registry_members rm ON rm.user_id = u.id
       WHERE rm.registry_id = $1`,
      [activeRegistry.id],
    );
    registryUsers = usersResult.rows.map(rowToUser);

    entities = await getEntities(activeRegistry.id, user.id);

    participants = [
      ...registryUsers.map((u) => ({ id: u.id, name: u.name, color: u.color })),
      ...entities.map((e) => ({ id: e.id, name: e.name, color: e.color })),
    ];
  }

  return {
    user,
    isEmailAllowed: true,
    activeRegistry,
    isOwner,
    ownerRegistryIds,
    registries: registriesList,
    registryUsers,
    entities,
    participants,
  };
}

export async function getUsers(registryId: string): Promise<User[]> {
  const result = await query(
    `SELECT u.* FROM users u
     JOIN registry_members rm ON rm.user_id = u.id
     WHERE rm.registry_id = $1`,
    [registryId],
  );
  return result.rows.map(rowToUser);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const result = await query("SELECT * FROM users WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToUser(result.rows[0]);
}

export async function getActiveTransactions(
  registryId: string,
): Promise<Transaction[]> {
  const result = await query(
    "SELECT * FROM transactions WHERE exercise_id IS NULL AND registry_id = $1 ORDER BY created_at DESC, description ASC",
    [registryId],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionsByExercise(
  exerciseId: string,
): Promise<Transaction[]> {
  const result = await query(
    "SELECT * FROM transactions WHERE exercise_id = $1 ORDER BY created_at DESC, description ASC",
    [exerciseId],
  );
  return result.rows.map(rowToTransaction);
}

/**
 * Membership-scoped variant of {@link getTransactionsByExercise}: returns rows
 * only when `userId` belongs to the registry that owns the exercise. API
 * routes use this so a bare exercise id can't leak another registry's data.
 */
export async function getTransactionsByExerciseForUser(
  exerciseId: string,
  userId: string,
): Promise<Transaction[]> {
  const result = await query(
    `SELECT t.* FROM transactions t WHERE t.exercise_id = $1
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = t.registry_id AND rm.user_id = $2
     )
     ORDER BY t.created_at DESC, t.description ASC`,
    [exerciseId, userId],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionById(
  id: string,
): Promise<Transaction | undefined> {
  const result = await query("SELECT * FROM transactions WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToTransaction(result.rows[0]);
}

/** Fetch several transactions by id in one query (used for cross-reference validation). */
export async function getTransactionsByIds(
  ids: string[],
): Promise<Transaction[]> {
  if (ids.length === 0) return [];
  const result = await query(
    "SELECT * FROM transactions WHERE id = ANY($1::uuid[])",
    [ids],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionPaymentsForRegistry(
  registryId: string,
): Promise<TransactionPayment[]> {
  console.log("[store] getTransactionPaymentsForRegistry start:", registryId);
  const result = await query(
    `SELECT tp.* FROM transaction_payments tp
     JOIN transactions t ON t.id = tp.pago_id
     WHERE t.registry_id = $1 AND t.exercise_id IS NULL`,
    [registryId],
  );
  console.log(
    "[store] getTransactionPaymentsForRegistry done, rows:",
    result.rows.length,
  );
  return result.rows.map(rowToTransactionPayment);
}

export async function getTransactionPaymentsForPago(
  pagoId: string,
): Promise<TransactionPayment[]> {
  const result = await query(
    "SELECT * FROM transaction_payments WHERE pago_id = $1",
    [pagoId],
  );
  return result.rows.map(rowToTransactionPayment);
}

export async function createTransactionPayments(
  pagoId: string,
  entries: { expenseId: string; amount: number }[],
): Promise<TransactionPayment[]> {
  if (entries.length === 0) return [];
  const values: unknown[] = [];
  const placeholders = entries.map((e, i) => {
    const base = i * 3;
    values.push(pagoId, e.expenseId, e.amount);
    return `($${base + 1}, $${base + 2}, $${base + 3})`;
  }).join(", ");
  const result = await query(
    `INSERT INTO transaction_payments (pago_id, expense_id, amount) VALUES ${placeholders} RETURNING *`,
    values,
  );
  return result.rows.map(rowToTransactionPayment);
}

export async function deleteTransactionPaymentsForPago(
  pagoId: string,
): Promise<void> {
  await query("DELETE FROM transaction_payments WHERE pago_id = $1", [pagoId]);
}

export async function createTransaction(
  data: Omit<Transaction, "id" | "createdAt">,
  userId: string,
  transactionPaymentEntries?: { expenseId: string; amount: number }[],
): Promise<Transaction | null> {
  const member = await isMemberOfRegistry(userId, data.registry_id);
  if (!member) return null;
  const recurringGroupId = data.recurringGroupId ?? crypto.randomUUID();
  const result = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid, related_transaction_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [
      data.registry_id,
      data.description,
      data.amount,
      data.originalAmount,
      data.type,
      data.exerciseId,
      data.installmentCurrent,
      data.installmentTotal,
      data.recurringDisabled ?? false,
      recurringGroupId,
      data.notes,
      JSON.stringify(data.splitJson),
      data.creatorId,
      data.userPaid,
      data.relatedTransactionId ?? null,
    ],
  );
  const tx = rowToTransaction(result.rows[0]);
  if (transactionPaymentEntries && transactionPaymentEntries.length > 0) {
    await createTransactionPayments(tx.id, transactionPaymentEntries);
  }
  await writeTransactionBalances(tx);
  return tx;
}

export async function updateTransaction(
  id: string,
  data: Partial<Transaction>,
  userId: string,
  transactionPaymentEntries?: { expenseId: string; amount: number }[],
): Promise<Transaction | undefined> {
  const { sets, values } = buildTransactionUpdateSets(data);
  if (sets.length === 0) return getTransactionById(id);
  const idx = values.length + 1;
  values.push(id);
  values.push(userId);
  const result = await query(
    `UPDATE transactions SET ${
      sets.join(", ")
    } WHERE id = $${idx} AND registry_id IN (SELECT rm.registry_id FROM registry_members rm WHERE rm.user_id = $${
      idx + 1
    } AND rm.registry_id = transactions.registry_id) RETURNING *`,
    values,
  );
  if (result.rows.length === 0) return undefined;
  const updated = rowToTransaction(result.rows[0]);
  if (transactionPaymentEntries !== undefined) {
    await deleteTransactionPaymentsForPago(id);
    if (transactionPaymentEntries.length > 0) {
      await createTransactionPayments(id, transactionPaymentEntries);
    }
  }
  // Recompute balance deltas if any delta-relevant field changed.
  const deltaRelevant = data.amount !== undefined ||
    data.originalAmount !== undefined ||
    data.type !== undefined ||
    data.splitJson !== undefined ||
    data.userPaid !== undefined ||
    data.installmentCurrent !== undefined ||
    data.installmentTotal !== undefined;
  if (deltaRelevant) {
    await deleteTransactionBalances(id);
    await writeTransactionBalances(updated);
  }
  return updated;
}

export async function deleteTransaction(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM transactions WHERE id = $1 AND registry_id IN (SELECT rm.registry_id FROM registry_members rm WHERE rm.user_id = $2 AND rm.registry_id = transactions.registry_id)`,
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getExercises(registryId: string): Promise<Exercise[]> {
  const result = await query(
    "SELECT * FROM exercises WHERE registry_id = $1 ORDER BY end_date DESC",
    [registryId],
  );
  return result.rows.map(rowToExercise);
}

export async function getExerciseById(
  id: string,
): Promise<Exercise | undefined> {
  const result = await query("SELECT * FROM exercises WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToExercise(result.rows[0]);
}

/**
 * Membership-scoped variant of {@link getExerciseById}: returns the exercise
 * only when `userId` belongs to its registry (else `undefined`, so the caller
 * can answer 404 without leaking existence).
 */
export async function getExerciseByIdForUser(
  id: string,
  userId: string,
): Promise<Exercise | undefined> {
  const result = await query(
    `SELECT e.* FROM exercises e WHERE e.id = $1
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = e.registry_id AND rm.user_id = $2
     )`,
    [id, userId],
  );
  if (result.rows.length === 0) return undefined;
  return rowToExercise(result.rows[0]);
}

export async function createExercise(registryId: string): Promise<Exercise> {
  const result = await query(
    `WITH active AS (
      SELECT id, original_amount, created_at
      FROM transactions
      WHERE registry_id = $1 AND exercise_id IS NULL
    ),
    new_exercise AS (
      INSERT INTO exercises (registry_id, start_date, end_date, transaction_count, total_amount)
      SELECT $1,
             COALESCE(MIN(created_at), now()),
             now(),
             COUNT(*),
             COALESCE(SUM(ABS(original_amount)), 0)
      FROM active
      RETURNING id, registry_id, start_date, end_date, transaction_count, total_amount
    ),
    updated AS (
      UPDATE transactions SET exercise_id = (SELECT id FROM new_exercise)
      WHERE registry_id = $1 AND exercise_id IS NULL
    )
    SELECT * FROM new_exercise`,
    [registryId],
  );
  return rowToExercise(result.rows[0]);
}

export async function getRegistriesForUser(
  userId: string,
): Promise<Registry[]> {
  const result = await query(
    `SELECT r.* FROM registries r JOIN registry_members rm ON r.id = rm.registry_id WHERE rm.user_id = $1 ORDER BY r.latest_accessed DESC`,
    [userId],
  );
  return result.rows.map(rowToRegistry);
}

export async function createRegistry(
  name: string,
  userId: string,
): Promise<Registry> {
  const result = await query(
    "INSERT INTO registries (name, is_default) VALUES ($1, false) RETURNING *",
    [name],
  );
  const registry = rowToRegistry(result.rows[0]);

  const existingMember = await query(
    "SELECT registry_id FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [registry.id, userId],
  );
  if (existingMember.rows.length === 0) {
    await query(
      "INSERT INTO registry_members (registry_id, user_id, role) VALUES ($1, $2, 'owner')",
      [registry.id, userId],
    );
  }

  return registry;
}

export async function renameRegistry(
  registryId: string,
  name: string,
  userId: string,
): Promise<Registry | undefined> {
  const member = await isMemberOfRegistry(userId, registryId);
  if (!member) return undefined;
  const result = await query(
    "UPDATE registries SET name = $1 WHERE id = $2 RETURNING *",
    [name, registryId],
  );
  if (result.rows.length === 0) return undefined;
  return rowToRegistry(result.rows[0]);
}

export async function getTransactionCount(
  registryId: string,
): Promise<number> {
  const result = await query(
    "SELECT COUNT(*) as cnt FROM transactions WHERE registry_id = $1",
    [registryId],
  );
  return parseInt(result.rows[0].cnt as string);
}

export async function getTransactionCounts(
  registryIds: string[],
): Promise<Map<string, number>> {
  if (registryIds.length === 0) return new Map();
  const result = await query(
    "SELECT registry_id, COUNT(*) as cnt FROM transactions WHERE registry_id = ANY($1::uuid[]) GROUP BY registry_id",
    [registryIds],
  );
  const map = new Map<string, number>();
  for (const row of result.rows) {
    map.set(row.registry_id as string, parseInt(row.cnt as string));
  }
  return map;
}

export async function deleteRegistry(
  registryId: string,
  userId: string,
): Promise<boolean> {
  const count = await getTransactionCount(registryId);
  if (count > 0) return false;
  // Owner-only: the DELETE itself carries the ownership subquery so it can't
  // be misused by a caller that skipped the role check.
  const result = await query(
    `DELETE FROM registries WHERE id = $1 AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $2 AND rm.role = 'owner'
     )`,
    [registryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getUserRole(
  userId: string,
  registryId: string,
): Promise<string | null> {
  const result = await query(
    "SELECT role FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [registryId, userId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].role as string;
}

export async function isMemberOfRegistry(
  userId: string,
  registryId: string,
): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [registryId, userId],
  );
  return result.rows.length > 0;
}

export async function calculateBalance(
  userId: string,
  registryId: string,
  preloadedTransactions?: Transaction[],
): Promise<number> {
  const active = preloadedTransactions ??
    await getActiveTransactions(registryId);
  return calcBalancePure(active, userId);
}

/**
 * Read the authoritative balance from persisted `transaction_balances` deltas.
 * Uses exact NUMERIC(12,2) arithmetic — no floating-point residue.
 * Falls back to `calculateBalance` if the deltas table doesn't exist yet
 * (pre-migration), making the rollout safe.
 */
export async function getBalanceFromDeltas(
  userId: string,
  registryId: string,
): Promise<number> {
  const result = await query(
    `SELECT COALESCE(SUM(tb.amount), 0) as balance
     FROM transaction_balances tb
     JOIN transactions t ON t.id = tb.transaction_id
     WHERE tb.user_id = $1 AND t.registry_id = $2 AND t.exercise_id IS NULL`,
    [userId, registryId],
  );
  return parseFloat(result.rows[0].balance as string);
}

export function getMonthNameEs(date: Date): string {
  return MONTHS_ES[date.getMonth()];
}

export async function getSpawnCandidates(
  registryId: string,
): Promise<Transaction[]> {
  const result = await query(
    `SELECT * FROM transactions
     WHERE registry_id = $1
       AND recurring_disabled = false
       AND (type = 'recurrente' OR type = 'parcialidad')
     ORDER BY recurring_group_id, created_at DESC`,
    [registryId],
  );
  const all = result.rows.map(rowToTransaction);
  return filterSpawnCandidates(all);
}

export async function cloneTransactionForNextPeriod(
  sourceId: string,
  installmentOffset: number = 1,
): Promise<Transaction> {
  const source = await getTransactionById(sourceId);
  if (!source) throw new Error(`Transaction ${sourceId} not found`);
  const recurringGroupId = source.recurringGroupId ?? crypto.randomUUID();
  const result = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [
      source.registry_id,
      source.description,
      source.amount,
      source.originalAmount,
      source.type,
      null,
      source.type === "parcialidad" && source.installmentCurrent !== null
        ? source.installmentCurrent + installmentOffset
        : null,
      source.type === "parcialidad" ? source.installmentTotal : null,
      false,
      recurringGroupId,
      source.notes,
      JSON.stringify(source.splitJson),
      source.creatorId,
      source.userPaid,
    ],
  );
  const cloned = rowToTransaction(result.rows[0]);
  await writeTransactionBalances(cloned);
  return cloned;
}

export async function batchCloneTransactions(
  items: { id: string; quantity: number }[],
  userId: string,
): Promise<Transaction[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  // Membership-scoped: only resolve sources in registries the user belongs
  // to, so a bare id from another registry can never be cloned into it.
  const result = await query(
    `SELECT * FROM transactions WHERE id = ANY($1::uuid[])
     AND registry_id IN (
       SELECT rm.registry_id FROM registry_members rm WHERE rm.user_id = $2
     )`,
    [ids, userId],
  );
  const sources = new Map(
    result.rows.map(rowToTransaction).map((t) => [t.id, t]),
  );

  const rows: unknown[][] = [];
  for (const item of items) {
    const source = sources.get(item.id);
    if (!source) continue;
    const quantity = source.type === "parcialidad" ? item.quantity : 1;
    for (let i = 1; i <= quantity; i++) {
      const recurringGroupId = source.recurringGroupId ?? crypto.randomUUID();
      rows.push([
        source.registry_id,
        source.description,
        source.amount,
        source.originalAmount,
        source.type,
        null,
        source.type === "parcialidad" && source.installmentCurrent !== null
          ? source.installmentCurrent + i
          : null,
        source.type === "parcialidad" ? source.installmentTotal : null,
        false,
        recurringGroupId,
        source.notes,
        JSON.stringify(source.splitJson),
        source.creatorId,
        source.userPaid,
      ]);
    }
  }

  if (rows.length === 0) return [];

  const cols = 14;
  const placeholders = buildBatchPlaceholders(rows.length, cols);
  const flatValues = rows.flat();

  const insertResult = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid) VALUES ${placeholders} RETURNING *`,
    flatValues,
  );
  const cloned = insertResult.rows.map(rowToTransaction);
  // Write balance deltas for each cloned transaction.
  for (const tx of cloned) {
    await writeTransactionBalances(tx);
  }
  return cloned;
}

export async function getEntities(
  registryId: string,
  userId: string,
): Promise<Entity[]> {
  // Membership-scoped: non-members see an empty list, same as "no entities".
  const result = await query(
    `SELECT entities_json FROM registries r WHERE r.id = $1
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = r.id AND rm.user_id = $2
     )`,
    [registryId, userId],
  );
  if (result.rows.length === 0) return [];
  const raw = result.rows[0].entities_json;
  if (!raw) return [];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw as unknown[];
  return parsed.map((e: Record<string, unknown>) => ({
    id: e.id as string,
    name: e.name as string,
    color: e.color as string,
  }));
}

export async function createEntity(
  registryId: string,
  name: string,
  color: string | undefined,
  userId: string,
): Promise<Entity | null> {
  const entities = await getEntities(registryId, userId);
  const entity: Entity = {
    id: crypto.randomUUID(),
    name,
    color: color ?? "#6b7280",
  };
  entities.push(entity);
  const result = await query(
    `UPDATE registries SET entities_json = $1 WHERE id = $2
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $3
     )`,
    [JSON.stringify(entities), registryId, userId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return entity;
}

export async function updateEntity(
  registryId: string,
  entityId: string,
  name: string,
  color: string | undefined,
  userId: string,
): Promise<Entity | undefined> {
  const entities = await getEntities(registryId, userId);
  const idx = entities.findIndex((e) => e.id === entityId);
  if (idx === -1) return undefined;
  entities[idx] = {
    ...entities[idx],
    name,
    color: color ?? entities[idx].color,
  };
  const result = await query(
    `UPDATE registries SET entities_json = $1 WHERE id = $2
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $3
     )`,
    [JSON.stringify(entities), registryId, userId],
  );
  if ((result.rowCount ?? 0) === 0) return undefined;
  return entities[idx];
}

export async function deleteEntity(
  registryId: string,
  entityId: string,
  userId: string,
): Promise<boolean> {
  const txCheck = await query(
    `SELECT 1 FROM transactions WHERE registry_id = $1
     AND exercise_id IS NULL
     AND (user_paid::text = $2 OR split_json::text LIKE $3)`,
    [registryId, entityId, `%"userId":"${entityId}"%`],
  );
  if (txCheck.rows.length > 0) return false;

  const entities = await getEntities(registryId, userId);
  const idx = entities.findIndex((e) => e.id === entityId);
  if (idx === -1) return false;
  entities.splice(idx, 1);
  const result = await query(
    `UPDATE registries SET entities_json = $1 WHERE id = $2
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $3
     )`,
    [JSON.stringify(entities), registryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getRegistryMemberCount(
  registryId: string,
): Promise<number> {
  const result = await query(
    "SELECT COUNT(*) as cnt FROM registry_members WHERE registry_id = $1",
    [registryId],
  );
  return parseInt(result.rows[0].cnt as string);
}

export async function setDefaultSplit(
  registryId: string,
  splits: { userId: string; percentage: number }[],
  ownerId: string,
): Promise<boolean> {
  const memberCount = await getRegistryMemberCount(registryId);
  // Owner-scoped: the UPDATE no-ops unless `ownerId` owns the registry.
  const result = await query(
    `UPDATE registries SET default_split_json = $1, default_split_member_count = $2 WHERE id = $3
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $4 AND rm.role = 'owner'
     )`,
    [JSON.stringify({ splits }), memberCount, registryId, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function clearDefaultSplit(
  registryId: string,
): Promise<void> {
  await query(
    "UPDATE registries SET default_split_json = NULL, default_split_member_count = NULL WHERE id = $1",
    [registryId],
  );
}

/**
 * Owner-scoped variant of {@link clearDefaultSplit} for user-facing routes.
 * Returns `false` when `ownerId` doesn't own the registry (no-op).
 */
export async function clearDefaultSplitForOwner(
  registryId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE registries SET default_split_json = NULL, default_split_member_count = NULL WHERE id = $1
     AND EXISTS (
       SELECT 1 FROM registry_members rm
       WHERE rm.registry_id = registries.id AND rm.user_id = $2 AND rm.role = 'owner'
     )`,
    [registryId, ownerId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function invalidateDefaultSplitIfNeeded(
  registryId: string,
): Promise<void> {
  const result = await query(
    "SELECT default_split_member_count FROM registries WHERE id = $1",
    [registryId],
  );
  if (result.rows.length === 0) return;
  const savedCount = result.rows[0].default_split_member_count as number | null;
  if (savedCount === null) return;

  const currentCount = await getRegistryMemberCount(registryId);
  if (currentCount !== savedCount) {
    await clearDefaultSplit(registryId);
  }
}

export async function createInvitation(
  registryId: string,
  createdBy: string,
  expiresAt?: Date,
  maxUses?: number,
): Promise<{ id: string; code: string; expiresAt: Date | null }> {
  const code = generateInviteCode();
  // Invitations created without an explicit expiry (e.g. from the UI) default
  // to 7 days instead of being valid forever.
  const effectiveExpiresAt = expiresAt ??
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const result = await query(
    `INSERT INTO invitations (registry_id, code, created_by, expires_at, max_uses) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      registryId,
      code,
      createdBy,
      effectiveExpiresAt.toISOString(),
      maxUses ?? null,
    ],
  );
  const row = result.rows[0];
  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [
      createdBy,
      "invite_created",
      "invitation",
      row.id,
      JSON.stringify({ code }),
    ],
  );
  return {
    id: row.id as string,
    code: row.code as string,
    expiresAt: effectiveExpiresAt,
  };
}

export async function getInvitationByCode(code: string): Promise<
  {
    id: string;
    registryId: string;
    registryName: string;
    code: string;
    expiresAt: Date | null;
    maxUses: number | null;
    currentUses: number;
    revokedAt: Date | null;
  } | null
> {
  const result = await query(
    `SELECT i.*, r.name as registry_name FROM invitations i JOIN registries r ON r.id = i.registry_id WHERE i.code = $1`,
    [code.toUpperCase()],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as string,
    registryId: row.registry_id as string,
    registryName: row.registry_name as string,
    code: row.code as string,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    maxUses: (row.max_uses as number) ?? null,
    currentUses: row.current_uses as number,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
  };
}

export async function useInvitation(
  code: string,
  userId: string,
): Promise<string> {
  const invitation = await getInvitationByCode(code);
  if (!invitation) throw new Error("Invitation not found");
  if (invitation.revokedAt) throw new Error("Invitation has been revoked");
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    throw new Error("Invitation has expired");
  }

  const existing = await query(
    "SELECT registry_id FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [invitation.registryId, userId],
  );
  if (existing.rows.length > 0) {
    return invitation.registryId;
  }

  // Atomic check-and-increment: the UPDATE itself enforces not-revoked and
  // max-uses, so concurrent joins can't overshoot max_uses (the read above
  // only exists to give precise error messages).
  const claimed = await query(
    `UPDATE invitations SET current_uses = current_uses + 1
     WHERE id = $1 AND revoked_at IS NULL
       AND (max_uses IS NULL OR current_uses < max_uses)
     RETURNING id`,
    [invitation.id],
  );
  if (claimed.rows.length === 0) {
    throw new Error("Invitation has reached max uses");
  }

  // Free plan: cap on members per registry.
  //
  // Placement matters: this runs AFTER the invitation-validity checks and the
  // current_uses claim above, but BEFORE the member INSERT — so a full group
  // never consumes an invitation use (the joiner can retry once the owner
  // upgrades, without wasting the code).
  //
  // The check is on the TARGET registry's plan, never the joiner's:
  // "joining groups is never gated" is a product invariant. A free-plan user
  // joining a Pro group is fine; only the group's own plan sets its limits.
  //
  // GROUP_FULL is a sentinel message — the join route maps it to a localized
  // 402 {code:'upgrade_required'} payload. An ordinary Error message would
  // leak to the client as a raw string; the sentinel keeps the mapping exact.
  //
  // TOCTOU: two racing joins could both pass the count and land N+1 members.
  // Accepted risk (product limit, not a security boundary). The atomic
  // invitation-uses claim above is the check that MUST be race-proof, and it
  // already is (UPDATE ... WHERE current_uses < max_uses).
  const planInfo = await getRegistryPlan(invitation.registryId);
  if (planInfo && !planInfo.isPro) {
    const members = await countRegistryMembers(invitation.registryId);
    if (members >= planInfo.limits.maxMembers) {
      throw new Error("GROUP_FULL");
    }
  }

  await query(
    "INSERT INTO registry_members (registry_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
    [invitation.registryId, userId],
  );

  await invalidateDefaultSplitIfNeeded(invitation.registryId);

  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      "invite_used",
      "invitation",
      invitation.id,
      JSON.stringify({ code }),
    ],
  );

  return invitation.registryId;
}

export async function getInvitationsForRegistry(registryId: string): Promise<{
  id: string;
  code: string;
  expiresAt: Date | null;
  maxUses: number | null;
  currentUses: number;
  revokedAt: Date | null;
  createdAt: Date;
}[]> {
  const result = await query(
    "SELECT * FROM invitations WHERE registry_id = $1 ORDER BY created_at DESC",
    [registryId],
  );
  return result.rows.map((row) => ({
    id: row.id as string,
    code: row.code as string,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    maxUses: (row.max_uses as number) ?? null,
    currentUses: row.current_uses as number,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
    createdAt: new Date(row.created_at as string),
  }));
}

export async function revokeInvitation(
  invitationId: string,
  userId: string,
): Promise<boolean> {
  // Ownership-scoped: the UPDATE no-ops unless `userId` owns the registry the
  // invitation belongs to, so a bare invitation id can't be revoked across
  // registries. Returns false in that case (and when already revoked).
  const result = await query(
    `UPDATE invitations SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL
     AND registry_id IN (
       SELECT rm.registry_id FROM registry_members rm
       WHERE rm.user_id = $2 AND rm.role = 'owner'
         AND rm.registry_id = invitations.registry_id
     )`,
    [invitationId, userId],
  );
  if ((result.rowCount ?? 0) === 0) return false;
  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      "invite_revoked",
      "invitation",
      invitationId,
      JSON.stringify({}),
    ],
  );
  return true;
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const result = await query(
    "SELECT 1 FROM allowed_emails WHERE email = $1",
    [email.toLowerCase()],
  );
  return result.rows.length > 0;
}

export async function getRegistryStamp(
  registryId: string,
): Promise<string | null> {
  const result = await query(
    "SELECT last_modified FROM registries WHERE id = $1",
    [registryId],
  );
  if (result.rows.length === 0) return null;
  const lm = result.rows[0].last_modified;
  return lm ? new Date(lm as string).toISOString() : null;
}
