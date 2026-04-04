import { query } from "./db.ts";
import type { User, Transaction, Exercise, Registry, SystemUser, SplitEntry, TransactionSplit } from "./types.ts";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function rowToSystemUser(row: Record<string, unknown>): SystemUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
  };
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    registry_id: row.registry_id as string,
    system_user_id: row.system_user_id as string,
    email: row.email as string,
    name: row.name as string,
    color: row.color as string,
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
    type: row.type as "unico" | "parcialidad" | "recurrente",
    exerciseId: row.exercise_id as string | null,
    installmentCurrent: row.installment_current as number | null,
    installmentTotal: row.installment_total as number | null,
    recurringDisabled: (row.recurring_disabled as boolean) ?? false,
    recurringGroupId: (row.recurring_group_id as string) ?? row.id as string,
    notes: row.notes as string,
    splitJson: typeof row.split_json === "string" ? JSON.parse(row.split_json) : row.split_json as TransactionSplit,
    creatorId: row.creator_id as string,
    userPaid: row.user_paid as string,
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
    dbName: row.db_name as string,
    isDefault: row.is_default as boolean,
    latestAccessed: new Date(row.latest_accessed as string),
  };
}

let cachedSystemUser: SystemUser | null = null;

export async function getSystemUser(): Promise<SystemUser | null> {
  if (cachedSystemUser) return cachedSystemUser;
  const result = await query("SELECT * FROM system_users ORDER BY created_at LIMIT 1");
  if (result.rows.length === 0) return null;
  cachedSystemUser = rowToSystemUser(result.rows[0]);
  return cachedSystemUser;
}

export async function setSystemUser(user: SystemUser): Promise<void> {
  await query(
    "INSERT INTO system_users (id, email, name) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = $3",
    [user.id, user.email, user.name],
  );
  cachedSystemUser = user;
}

export async function getUsers(registryId: string): Promise<User[]> {
  const result = await query("SELECT * FROM users WHERE registry_id = $1", [registryId]);
  return result.rows.map(rowToUser);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const result = await query("SELECT * FROM users WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToUser(result.rows[0]);
}

export async function getActiveTransactions(registryId: string): Promise<Transaction[]> {
  const result = await query(
    "SELECT * FROM transactions WHERE exercise_id IS NULL AND registry_id = $1 ORDER BY created_at DESC",
    [registryId],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionsByExercise(exerciseId: string): Promise<Transaction[]> {
  const result = await query(
    "SELECT * FROM transactions WHERE exercise_id = $1 ORDER BY created_at DESC",
    [exerciseId],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionById(id: string): Promise<Transaction | undefined> {
  const result = await query("SELECT * FROM transactions WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToTransaction(result.rows[0]);
}

export async function createTransaction(data: Omit<Transaction, "id" | "createdAt">): Promise<Transaction> {
  const recurringGroupId = data.recurringGroupId ?? crypto.randomUUID();
  const result = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
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
    ],
  );
  return rowToTransaction(result.rows[0]);
}

export async function updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (data.description !== undefined) { sets.push(`description = $${idx++}`); values.push(data.description); }
  if (data.amount !== undefined) { sets.push(`amount = $${idx++}`); values.push(data.amount); }
  if (data.originalAmount !== undefined) { sets.push(`original_amount = $${idx++}`); values.push(data.originalAmount); }
  if (data.type !== undefined) { sets.push(`type = $${idx++}`); values.push(data.type); }
  if (data.notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(data.notes); }
  if (data.splitJson !== undefined) { sets.push(`split_json = $${idx++}`); values.push(JSON.stringify(data.splitJson)); }
  if (data.userPaid !== undefined) { sets.push(`user_paid = $${idx++}`); values.push(data.userPaid); }
  if (data.installmentCurrent !== undefined) { sets.push(`installment_current = $${idx++}`); values.push(data.installmentCurrent); }
  if (data.installmentTotal !== undefined) { sets.push(`installment_total = $${idx++}`); values.push(data.installmentTotal); }
  if (data.recurringDisabled !== undefined) { sets.push(`recurring_disabled = $${idx++}`); values.push(data.recurringDisabled); }
  if (sets.length === 0) return getTransactionById(id);
  values.push(id);
  const result = await query(
    `UPDATE transactions SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );
  if (result.rows.length === 0) return undefined;
  return rowToTransaction(result.rows[0]);
}

export async function deleteTransaction(id: string): Promise<boolean> {
  const result = await query("DELETE FROM transactions WHERE id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function getExercises(registryId: string): Promise<Exercise[]> {
  const result = await query(
    "SELECT * FROM exercises WHERE registry_id = $1 ORDER BY end_date DESC",
    [registryId],
  );
  return result.rows.map(rowToExercise);
}

export async function getExerciseById(id: string): Promise<Exercise | undefined> {
  const result = await query("SELECT * FROM exercises WHERE id = $1", [id]);
  if (result.rows.length === 0) return undefined;
  return rowToExercise(result.rows[0]);
}

export async function createExercise(registryId: string): Promise<Exercise> {
  const active = await getActiveTransactions(registryId);
  const total = active.reduce((sum, t) => sum + Math.abs(t.originalAmount), 0);
  const startDate = active.length > 0 ? new Date(Math.min(...active.map((t) => t.createdAt.getTime()))) : new Date();
  const endDate = new Date();

  const result = await query(
    `INSERT INTO exercises (registry_id, start_date, end_date, transaction_count, total_amount) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [registryId, startDate.toISOString(), endDate.toISOString(), active.length, total],
  );
  const exercise = rowToExercise(result.rows[0]);

  if (active.length > 0) {
    const ids = active.map((t) => t.id);
    await query(
      `UPDATE transactions SET exercise_id = $1 WHERE id = ANY($2::uuid[])`,
      [exercise.id, ids],
    );
  }

  return exercise;
}

export async function getRegistries(): Promise<Registry[]> {
  const result = await query("SELECT * FROM registries ORDER BY latest_accessed DESC");
  return result.rows.map(rowToRegistry);
}

export async function getRegistriesForUser(systemUserId: string): Promise<Registry[]> {
  const result = await query(
    `SELECT r.* FROM registries r JOIN registry_members rm ON r.id = rm.registry_id WHERE rm.user_id = $1 ORDER BY r.latest_accessed DESC`,
    [systemUserId],
  );
  return result.rows.map(rowToRegistry);
}

export async function getActiveRegistry(): Promise<Registry | undefined> {
  const result = await query("SELECT * FROM registries WHERE is_default = true LIMIT 1");
  if (result.rows.length === 0) return undefined;
  return rowToRegistry(result.rows[0]);
}

export async function createRegistry(name: string, systemUserId: string): Promise<Registry> {
  const dbName = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  await query("UPDATE registries SET is_default = false");
  let result;
  try {
    result = await query(
      "INSERT INTO registries (name, db_name, is_default) VALUES ($1, $2, true) RETURNING *",
      [name, dbName],
    );
  } catch {
    result = await query(
      "UPDATE registries SET is_default = true, name = $1 WHERE db_name = $2 RETURNING *",
      [name, dbName],
    );
  }
  const registry = rowToRegistry(result.rows[0]);

  const sysUser = await getSystemUser();
  if (sysUser) {
    const existing = await query(
      "SELECT id FROM users WHERE registry_id = $1 AND system_user_id = $2",
      [registry.id, sysUser.id],
    );
    if (existing.rows.length === 0) {
      await query(
        "INSERT INTO users (registry_id, system_user_id, email, name, color) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [registry.id, sysUser.id, sysUser.email, sysUser.name, "#093eaa"],
      );
    }
    const existingMember = await query(
      "SELECT registry_id FROM registry_members WHERE registry_id = $1 AND user_id = $2",
      [registry.id, systemUserId],
    );
    if (existingMember.rows.length === 0) {
      await query(
        "INSERT INTO registry_members (registry_id, user_id) VALUES ($1, $2)",
        [registry.id, systemUserId],
      );
    }
  }

  return registry;
}

export async function setActiveRegistry(id: string): Promise<void> {
  await query("UPDATE registries SET is_default = false");
  await query("UPDATE registries SET is_default = true, latest_accessed = now() WHERE id = $1", [id]);
}

export async function calculateBalance(userId: string, registryId: string): Promise<number> {
  const active = await getActiveTransactions(registryId);
  let balance = 0;
  for (const tx of active) {
    if (tx.type === "pago") {
      if (tx.userPaid === userId) {
        balance += tx.originalAmount;
      } else {
        const isInSplit = tx.splitJson.splits.some((s) => s.userId === userId);
        if (isInSplit) balance -= tx.originalAmount;
      }
      continue;
    }
    const userSplit = tx.splitJson.splits.find((s) => s.userId === userId);
    if (!userSplit) continue;
    const divisor = tx.type === "parcialidad" && tx.installmentTotal ? tx.installmentTotal : 1;
    const totalAmount = tx.originalAmount / divisor;
    const splitAmount = userSplit.amount / divisor;
    if (tx.userPaid === userId) {
      balance += totalAmount - splitAmount;
    } else {
      balance -= splitAmount;
    }
  }
  return balance;
}

export function buildEqualSplit(total: number, userIds: string[]): TransactionSplit {
  const count = userIds.length;
  const perPerson = Math.floor((total / count) * 100) / 100;
  const remainder = Math.round((total - perPerson * count) * 100) / 100;
  const splits: SplitEntry[] = userIds.map((uid, i) => ({
    userId: uid,
    percentage: Math.round((100 / count) * 100) / 100,
    amount: perPerson + (i === 0 ? remainder : 0),
  }));
  return { splits };
}

export function buildPercentageSplit(total: number, percentages: { userId: string; percentage: number }[]): TransactionSplit {
  const splits: SplitEntry[] = percentages.map((p) => ({
    userId: p.userId,
    percentage: p.percentage,
    amount: Math.round(total * p.percentage) / 100,
  }));
  return { splits };
}

export function buildFixedSplit(total: number, amounts: { userId: string; amount: number }[]): TransactionSplit {
  const splits: SplitEntry[] = amounts.map((a) => ({
    userId: a.userId,
    percentage: total > 0 ? Math.round((a.amount / total) * 10000) / 100 : 0,
    amount: a.amount,
  }));
  return { splits };
}

export function getMonthNameEs(date: Date): string {
  return MONTHS_ES[date.getMonth()];
}

export async function getSpawnCandidates(registryId: string): Promise<Transaction[]> {
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
      if (t.installmentCurrent !== null && t.installmentTotal !== null && t.installmentCurrent < t.installmentTotal) {
        candidates.push(t);
      }
    }
  }
  return candidates;
}

export async function cloneTransactionForNextPeriod(sourceId: string, installmentOffset: number = 1): Promise<Transaction> {
  const source = await getTransactionById(sourceId);
  if (!source) throw new Error(`Transaction ${sourceId} not found`);
  return createTransaction({
    registry_id: source.registry_id,
    description: source.description,
    amount: source.amount,
    originalAmount: source.originalAmount,
    type: source.type,
    exerciseId: null,
    installmentCurrent: source.type === "parcialidad" && source.installmentCurrent !== null ? source.installmentCurrent + installmentOffset : null,
    installmentTotal: source.type === "parcialidad" ? source.installmentTotal : null,
    recurringDisabled: false,
    recurringGroupId: source.recurringGroupId,
    notes: source.notes,
    splitJson: source.splitJson,
    creatorId: source.creatorId,
    userPaid: source.userPaid,
  });
}
