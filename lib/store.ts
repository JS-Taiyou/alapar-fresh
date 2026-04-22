import { query } from "./db.ts";
import type {
  DefaultSplit,
  Entity,
  Exercise,
  Participant,
  Registry,
  Transaction,
  TransactionPayment,
  TransactionSplit,
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

export {
  buildEqualSplit,
  buildFixedSplit,
  buildPercentageSplit,
  calcFullPairwisePure as calculateFullPairwiseBalances,
  calcPairwiseBreakdownPure as calculatePairwiseBreakdown,
};

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

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    email: row.email as string,
    supabaseAuthId: (row.supabase_auth_id as string) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
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
    recurringGroupId: (row.recurring_group_id as string) ?? row.id as string,
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

function rowToTransactionPayment(
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

function rowToExercise(row: Record<string, unknown>): Exercise {
  return {
    id: row.id as string,
    registry_id: row.registry_id as string,
    startDate: new Date(row.start_date as string),
    endDate: new Date(row.end_date as string),
    transactionCount: row.transaction_count as number,
    totalAmount: parseFloat(row.total_amount as string),
  };
}

function rowToRegistry(row: Record<string, unknown>): Registry {
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
    defaultSplitMemberCount: (row.default_split_member_count as number) ?? null,
    lastModified: row.last_modified
      ? new Date(row.last_modified as string)
      : null,
  };
}

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

    entities = await getEntities(activeRegistry.id);

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

export async function getTransactionById(
  id: string,
): Promise<Transaction | undefined> {
  const result = await query("SELECT * FROM transactions WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToTransaction(result.rows[0]);
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
  return tx;
}

export async function updateTransaction(
  id: string,
  data: Partial<Transaction>,
  userId: string,
  transactionPaymentEntries?: { expenseId: string; amount: number }[],
): Promise<Transaction | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (data.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(data.description);
  }
  if (data.amount !== undefined) {
    sets.push(`amount = $${idx++}`);
    values.push(data.amount);
  }
  if (data.originalAmount !== undefined) {
    sets.push(`original_amount = $${idx++}`);
    values.push(data.originalAmount);
  }
  if (data.type !== undefined) {
    sets.push(`type = $${idx++}`);
    values.push(data.type);
  }
  if (data.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    values.push(data.notes);
  }
  if (data.splitJson !== undefined) {
    sets.push(`split_json = $${idx++}`);
    values.push(JSON.stringify(data.splitJson));
  }
  if (data.userPaid !== undefined) {
    sets.push(`user_paid = $${idx++}`);
    values.push(data.userPaid);
  }
  if (data.installmentCurrent !== undefined) {
    sets.push(`installment_current = $${idx++}`);
    values.push(data.installmentCurrent);
  }
  if (data.installmentTotal !== undefined) {
    sets.push(`installment_total = $${idx++}`);
    values.push(data.installmentTotal);
  }
  if (data.recurringDisabled !== undefined) {
    sets.push(`recurring_disabled = $${idx++}`);
    values.push(data.recurringDisabled);
  }
  if (data.relatedTransactionId !== undefined) {
    sets.push(`related_transaction_id = $${idx++}`);
    values.push(data.relatedTransactionId);
  }
  if (sets.length === 0) return getTransactionById(id);
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
  const member = await isMemberOfRegistry(userId, registryId);
  if (!member) return false;
  const count = await getTransactionCount(registryId);
  if (count > 0) return false;
  const result = await query("DELETE FROM registries WHERE id = $1", [
    registryId,
  ]);
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

  const disabledGroups = new Set<string>();
  for (const t of all) {
    if (t.recurringDisabled) disabledGroups.add(t.recurringGroupId);
  }

  const latestPerGroup = new Map<string, Transaction>();
  for (const t of all) {
    const existing = latestPerGroup.get(t.recurringGroupId);
    if (!existing || t.createdAt > existing.createdAt) {
      latestPerGroup.set(t.recurringGroupId, t);
    }
  }

  const candidates: Transaction[] = [];
  for (const t of latestPerGroup.values()) {
    if (disabledGroups.has(t.recurringGroupId)) continue;
    if (t.type === "recurrente") {
      if (t.exerciseId !== null) candidates.push(t);
    } else if (t.type === "parcialidad") {
      if (
        t.installmentCurrent !== null && t.installmentTotal !== null &&
        t.installmentCurrent < t.installmentTotal
      ) {
        candidates.push(t);
      }
    }
  }
  return candidates;
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
  return rowToTransaction(result.rows[0]);
}

export async function batchCloneTransactions(
  items: { id: string; quantity: number }[],
): Promise<Transaction[]> {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const result = await query(
    `SELECT * FROM transactions WHERE id = ANY($1::uuid[])`,
    [ids],
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
  const placeholders = rows.map((_, rowIdx) =>
    `(${
      Array.from({ length: cols }, (_, c) => `$${rowIdx * cols + c + 1}`).join(
        ", ",
      )
    })`
  ).join(", ");
  const flatValues = rows.flat();

  const insertResult = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid) VALUES ${placeholders} RETURNING *`,
    flatValues,
  );
  return insertResult.rows.map(rowToTransaction);
}

export async function getEntities(registryId: string): Promise<Entity[]> {
  const result = await query(
    "SELECT entities_json FROM registries WHERE id = $1",
    [registryId],
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
  color?: string,
): Promise<Entity> {
  const entities = await getEntities(registryId);
  const entity: Entity = {
    id: crypto.randomUUID(),
    name,
    color: color ?? "#6b7280",
  };
  entities.push(entity);
  await query(
    "UPDATE registries SET entities_json = $1 WHERE id = $2",
    [JSON.stringify(entities), registryId],
  );
  return entity;
}

export async function updateEntity(
  registryId: string,
  entityId: string,
  name: string,
  color?: string,
): Promise<Entity | undefined> {
  const entities = await getEntities(registryId);
  const idx = entities.findIndex((e) => e.id === entityId);
  if (idx === -1) return undefined;
  entities[idx] = {
    ...entities[idx],
    name,
    color: color ?? entities[idx].color,
  };
  await query(
    "UPDATE registries SET entities_json = $1 WHERE id = $2",
    [JSON.stringify(entities), registryId],
  );
  return entities[idx];
}

export async function deleteEntity(
  registryId: string,
  entityId: string,
): Promise<boolean> {
  const txCheck = await query(
    `SELECT 1 FROM transactions WHERE registry_id = $1
     AND exercise_id IS NULL
     AND (user_paid::text = $2 OR split_json::text LIKE $3)`,
    [registryId, entityId, `%"userId":"${entityId}"%`],
  );
  if (txCheck.rows.length > 0) return false;

  const entities = await getEntities(registryId);
  const idx = entities.findIndex((e) => e.id === entityId);
  if (idx === -1) return false;
  entities.splice(idx, 1);
  await query(
    "UPDATE registries SET entities_json = $1 WHERE id = $2",
    [JSON.stringify(entities), registryId],
  );
  return true;
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
): Promise<void> {
  const memberCount = await getRegistryMemberCount(registryId);
  await query(
    "UPDATE registries SET default_split_json = $1, default_split_member_count = $2 WHERE id = $3",
    [JSON.stringify({ splits }), memberCount, registryId],
  );
}

export async function clearDefaultSplit(
  registryId: string,
): Promise<void> {
  await query(
    "UPDATE registries SET default_split_json = NULL, default_split_member_count = NULL WHERE id = $1",
    [registryId],
  );
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

export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createInvitation(
  registryId: string,
  createdBy: string,
  expiresAt?: Date,
  maxUses?: number,
): Promise<{ id: string; code: string; expiresAt: Date | null }> {
  const code = generateInviteCode();
  const result = await query(
    `INSERT INTO invitations (registry_id, code, created_by, expires_at, max_uses) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      registryId,
      code,
      createdBy,
      expiresAt?.toISOString() ?? null,
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
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
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
  if (
    invitation.maxUses !== null && invitation.currentUses >= invitation.maxUses
  ) throw new Error("Invitation has reached max uses");

  const existing = await query(
    "SELECT registry_id FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [invitation.registryId, userId],
  );
  if (existing.rows.length > 0) {
    return invitation.registryId;
  }

  await query(
    "INSERT INTO registry_members (registry_id, user_id, role) VALUES ($1, $2, 'member')",
    [invitation.registryId, userId],
  );

  await query(
    "UPDATE invitations SET current_uses = current_uses + 1 WHERE id = $1",
    [invitation.id],
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
): Promise<void> {
  await query(
    "UPDATE invitations SET revoked_at = now() WHERE id = $1",
    [invitationId],
  );
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
