import { query } from "./db.ts";
import type {
  BalanceBreakdownEntry,
  DefaultSplit,
  Exercise,
  Registry,
  SystemUser,
  Transaction,
  TransactionSplit,
  User,
} from "./types.ts";
import {
  calculateBalance as calcBalancePure,
  calculatePairwiseBreakdown as calcPairwiseBreakdownPure,
  buildEqualSplit,
  buildFixedSplit,
  buildPercentageSplit,
} from "./calculations.ts";

export {
  buildEqualSplit,
  buildFixedSplit,
  buildPercentageSplit,
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

function rowToSystemUser(row: Record<string, unknown>): SystemUser {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    supabaseAuthId: (row.supabase_auth_id as string) ?? null,
  };
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    registry_id: row.registry_id as string,
    system_user_id: (row.system_user_id as string) ?? null,
    email: (row.email as string) ?? "",
    name: row.name as string,
    color: row.color as string,
    isEntity: (row.is_entity as boolean) ?? false,
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
    splitJson: typeof row.split_json === "string"
      ? JSON.parse(row.split_json)
      : row.split_json as TransactionSplit,
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
    defaultSplit: row.default_split_json
      ? (typeof row.default_split_json === "string"
        ? JSON.parse(row.default_split_json)
        : row.default_split_json as DefaultSplit)
      : null,
    defaultSplitMemberCount: (row.default_split_member_count as number) ?? null,
  };
}

export async function getUserBySupabaseId(
  supabaseAuthId: string,
): Promise<SystemUser | null> {
  const result = await query(
    "SELECT * FROM system_users WHERE supabase_auth_id = $1",
    [supabaseAuthId],
  );
  if (result.rows.length === 0) return null;
  return rowToSystemUser(result.rows[0]);
}

export async function createUserFromSupabase(
  supabaseAuthId: string,
  email: string,
  name: string,
): Promise<SystemUser> {
  const result = await query(
    "INSERT INTO system_users (id, email, name, supabase_auth_id) VALUES ($1, $2, $3, $4) ON CONFLICT (supabase_auth_id) DO UPDATE SET email = $2, name = $3 RETURNING *",
    [crypto.randomUUID(), email, name, supabaseAuthId],
  );
  return rowToSystemUser(result.rows[0]);
}

export async function getUserActiveRegistry(
  systemUserId: string,
): Promise<Registry | null> {
  const result = await query(
    `SELECT r.* FROM registries r
     JOIN user_preferences up ON up.active_registry_id = r.id
     WHERE up.user_id = $1`,
    [systemUserId],
  );
  if (result.rows.length === 0) return null;
  return rowToRegistry(result.rows[0]);
}

export async function setUserActiveRegistry(
  systemUserId: string,
  registryId: string,
): Promise<void> {
  await query(
    `INSERT INTO user_preferences (user_id, active_registry_id, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET active_registry_id = $2, updated_at = now()`,
    [systemUserId, registryId],
  );
}

export async function ensureUserPreferences(
  systemUserId: string,
): Promise<void> {
  await query(
    `INSERT INTO user_preferences (user_id, active_registry_id) VALUES ($1, NULL)
     ON CONFLICT (user_id) DO NOTHING`,
    [systemUserId],
  );
}

export async function resolveUserState(supabaseAuthId: string): Promise<{
  systemUser: SystemUser | null;
  isEmailAllowed: boolean;
  activeRegistry: Registry | null;
  isOwner: boolean;
  registries: Registry[];
  registryUsers: User[];
}> {
  const userResult = await query(
    `SELECT su.*, ae.id IS NOT NULL as is_email_allowed
     FROM system_users su
     LEFT JOIN allowed_emails ae ON ae.email = su.email
     WHERE su.supabase_auth_id = $1`,
    [supabaseAuthId],
  );
  if (userResult.rows.length === 0) {
    return {
      systemUser: null,
      isEmailAllowed: false,
      activeRegistry: null,
      isOwner: false,
      registries: [],
      registryUsers: [],
    };
  }

  const row = userResult.rows[0];
  const systemUser = rowToSystemUser(row);
  const isEmailAllowed = row.is_email_allowed as boolean;

  if (!isEmailAllowed) {
    return {
      systemUser,
      isEmailAllowed: false,
      activeRegistry: null,
      isOwner: false,
      registries: [],
      registryUsers: [],
    };
  }

  const [registries, activeRegResult] = await Promise.all([
    query(
      `SELECT r.* FROM registries r
       JOIN registry_members rm ON r.id = rm.registry_id
       WHERE rm.user_id = $1
       ORDER BY r.latest_accessed DESC`,
      [systemUser.id],
    ),
    query(
      `SELECT r.*, rm.role as active_registry_role
       FROM registries r
       JOIN user_preferences up ON up.active_registry_id = r.id
       JOIN registry_members rm ON rm.registry_id = r.id AND rm.user_id = $1
       WHERE up.user_id = $1`,
      [systemUser.id],
    ),
  ]);

  const registriesList = registries.rows.map(rowToRegistry);
  let activeRegistry: Registry | null = null;
  let isOwner = false;
  let registryUsers: User[] = [];

  if (activeRegResult.rows.length > 0) {
    const activeRegRow = activeRegResult.rows[0];
    activeRegistry = rowToRegistry(activeRegRow);
    isOwner = activeRegRow.active_registry_role === "owner";

    const usersResult = await query(
      `SELECT u.*, COALESCE(su.name, u.name) as name
       FROM users u
       LEFT JOIN system_users su ON u.system_user_id = su.id
       WHERE u.registry_id = $1`,
      [activeRegistry.id],
    );
    registryUsers = usersResult.rows.map(rowToUser);
  }

  return {
    systemUser,
    isEmailAllowed: true,
    activeRegistry,
    isOwner,
    registries: registriesList,
    registryUsers,
  };
}

export async function getUsers(registryId: string): Promise<User[]> {
  const result = await query(
    "SELECT u.*, COALESCE(su.name, u.name) as name FROM users u LEFT JOIN system_users su ON u.system_user_id = su.id WHERE u.registry_id = $1",
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
    "SELECT * FROM transactions WHERE exercise_id IS NULL AND registry_id = $1 ORDER BY created_at DESC",
    [registryId],
  );
  return result.rows.map(rowToTransaction);
}

export async function getTransactionsByExercise(
  exerciseId: string,
): Promise<Transaction[]> {
  const result = await query(
    "SELECT * FROM transactions WHERE exercise_id = $1 ORDER BY created_at DESC",
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

export async function createTransaction(
  data: Omit<Transaction, "id" | "createdAt">,
): Promise<Transaction> {
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

export async function updateTransaction(
  id: string,
  data: Partial<Transaction>,
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
  systemUserId: string,
): Promise<Registry[]> {
  const result = await query(
    `SELECT r.* FROM registries r JOIN registry_members rm ON r.id = rm.registry_id WHERE rm.user_id = $1 ORDER BY r.latest_accessed DESC`,
    [systemUserId],
  );
  return result.rows.map(rowToRegistry);
}

export async function createRegistry(
  name: string,
  systemUserId: string,
): Promise<Registry> {
  const dbName = name.toLowerCase().replace(/\s+/g, "_").replace(
    /[^a-z0-9_]/g,
    "",
  );
  let result;
  try {
    result = await query(
      "INSERT INTO registries (name, db_name, is_default) VALUES ($1, $2, false) RETURNING *",
      [name, dbName],
    );
  } catch {
    result = await query(
      "UPDATE registries SET name = $1 WHERE db_name = $2 RETURNING *",
      [name, dbName],
    );
  }
  const registry = rowToRegistry(result.rows[0]);

  const existingMember = await query(
    "SELECT registry_id FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [registry.id, systemUserId],
  );
  if (existingMember.rows.length === 0) {
    await query(
      "INSERT INTO registry_members (registry_id, user_id, role) VALUES ($1, $2, 'owner')",
      [registry.id, systemUserId],
    );
  }

  const sysUser = await query("SELECT * FROM system_users WHERE id = $1", [
    systemUserId,
  ]);
  if (sysUser.rows.length > 0) {
    const su = rowToSystemUser(sysUser.rows[0]);
    const existing = await query(
      "SELECT id FROM users WHERE registry_id = $1 AND system_user_id = $2",
      [registry.id, su.id],
    );
    if (existing.rows.length === 0) {
      await query(
        "INSERT INTO users (registry_id, system_user_id, email, name, color) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [registry.id, su.id, su.email, su.name, "#093eaa"],
      );
    }
  }

  await setUserActiveRegistry(systemUserId, registry.id);

  return registry;
}

export async function renameRegistry(
  registryId: string,
  name: string,
): Promise<Registry | undefined> {
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

export async function deleteRegistry(registryId: string): Promise<boolean> {
  const count = await getTransactionCount(registryId);
  if (count > 0) return false;
  const result = await query("DELETE FROM registries WHERE id = $1", [
    registryId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

export async function getUserRole(
  systemUserId: string,
  registryId: string,
): Promise<string | null> {
  const result = await query(
    "SELECT role FROM registry_members WHERE registry_id = $1 AND user_id = $2",
    [registryId, systemUserId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].role as string;
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
  return createTransaction({
    registry_id: source.registry_id,
    description: source.description,
    amount: source.amount,
    originalAmount: source.originalAmount,
    type: source.type,
    exerciseId: null,
    installmentCurrent:
      source.type === "parcialidad" && source.installmentCurrent !== null
        ? source.installmentCurrent + installmentOffset
        : null,
    installmentTotal: source.type === "parcialidad"
      ? source.installmentTotal
      : null,
    recurringDisabled: false,
    recurringGroupId: source.recurringGroupId,
    notes: source.notes,
    splitJson: source.splitJson,
    creatorId: source.creatorId,
    userPaid: source.userPaid,
  });
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
  const sources = new Map(result.rows.map(rowToTransaction).map((t) => [t.id, t]));

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
    `(${Array.from({ length: cols }, (_, c) => `$${rowIdx * cols + c + 1}`).join(", ")})`
  ).join(", ");
  const flatValues = rows.flat();

  const insertResult = await query(
    `INSERT INTO transactions (registry_id, description, amount, original_amount, type, exercise_id, installment_current, installment_total, recurring_disabled, recurring_group_id, notes, split_json, creator_id, user_paid) VALUES ${placeholders} RETURNING *`,
    flatValues,
  );
  return insertResult.rows.map(rowToTransaction);
}

export async function getEntities(registryId: string): Promise<User[]> {
  const result = await query(
    "SELECT * FROM users WHERE registry_id = $1 AND is_entity = true ORDER BY created_at",
    [registryId],
  );
  return result.rows.map(rowToUser);
}

export async function createEntity(
  registryId: string,
  name: string,
  color?: string,
): Promise<User> {
  const result = await query(
    "INSERT INTO users (registry_id, name, color, is_entity) VALUES ($1, $2, $3, true) RETURNING *",
    [registryId, name, color ?? "#6b7280"],
  );
  return rowToUser(result.rows[0]);
}

export async function updateEntity(
  entityId: string,
  name: string,
  color?: string,
): Promise<User | undefined> {
  const result = await query(
    "UPDATE users SET name = $1, color = COALESCE($2, color) WHERE id = $3 AND is_entity = true RETURNING *",
    [name, color ?? null, entityId],
  );
  if (result.rows.length === 0) return undefined;
  return rowToUser(result.rows[0]);
}

export async function deleteEntity(entityId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM users WHERE id = $1 AND is_entity = true
     AND NOT EXISTS (
       SELECT 1 FROM transactions
       WHERE (creator_id = $1 OR user_paid = $1) AND exercise_id IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM transactions
       WHERE exercise_id IS NULL AND split_json @> $2
     )`,
    [entityId, JSON.stringify({ splits: [{ userId: entityId }] })],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getRegistryMemberCount(
  registryId: string,
): Promise<number> {
  const result = await query(
    "SELECT COUNT(*) as cnt FROM users WHERE registry_id = $1 AND is_entity = false",
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
  systemUserId: string,
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
    [invitation.registryId, systemUserId],
  );
  if (existing.rows.length > 0) {
    await setUserActiveRegistry(systemUserId, invitation.registryId);
    return invitation.registryId;
  }

  await query(
    "INSERT INTO registry_members (registry_id, user_id, role) VALUES ($1, $2, 'member')",
    [invitation.registryId, systemUserId],
  );

  const sysUser = await query("SELECT * FROM system_users WHERE id = $1", [
    systemUserId,
  ]);
  if (sysUser.rows.length > 0) {
    const su = rowToSystemUser(sysUser.rows[0]);
    const existingUser = await query(
      "SELECT id FROM users WHERE registry_id = $1 AND system_user_id = $2",
      [invitation.registryId, su.id],
    );
    if (existingUser.rows.length === 0) {
      await query(
        "INSERT INTO users (registry_id, system_user_id, email, name, color) VALUES ($1, $2, $3, $4, $5)",
        [invitation.registryId, su.id, su.email, su.name, "#093eaa"],
      );
    }
  }

  await query(
    "UPDATE invitations SET current_uses = current_uses + 1 WHERE id = $1",
    [invitation.id],
  );

  await setUserActiveRegistry(systemUserId, invitation.registryId);

  await invalidateDefaultSplitIfNeeded(invitation.registryId);

  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [
      systemUserId,
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
  systemUserId: string,
): Promise<void> {
  await query(
    "UPDATE invitations SET revoked_at = now() WHERE id = $1",
    [invitationId],
  );
  await query(
    `INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5)`,
    [
      systemUserId,
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
