/**
 * Plan entitlements — what a registry can do on 'free' vs 'pro'.
 *
 * The paid unit is the registry (group): the owner pays, the whole group
 * benefits. Joining groups is never gated.
 *
 * Plan resolution order:
 *   1. registries.plan = 'pro' | 'grandfathered' → unlimited
 *   2. active subscription (trialing/active, or past_due within grace_until)
 *      → unlimited
 *   3. otherwise → free limits
 *
 * All limits are enforced server-side at the mutation/API boundary; the UI
 * reads the same values from ctx.state to render CTAs.
 */

import { query } from "./db.ts";

export type RegistryPlan = "free" | "pro" | "grandfathered";

export interface PlanLimits {
  maxOwnedRegistries: number;
  maxMembers: number;
  maxActiveTemplates: number;
  /** How many CLOSED exercises are visible. Current (open) exercise always
   * counts separately and is always visible. */
  maxClosedExercisesVisible: number;
}

export const FREE_LIMITS: PlanLimits = {
  maxOwnedRegistries: 2,
  maxMembers: 4,
  maxActiveTemplates: 3,
  maxClosedExercisesVisible: 1,
};

export const UNLIMITED: PlanLimits = {
  maxOwnedRegistries: Infinity,
  maxMembers: Infinity,
  maxActiveTemplates: Infinity,
  maxClosedExercisesVisible: Infinity,
};

export function entitlementsFor(plan: RegistryPlan): PlanLimits {
  return plan === "free" ? FREE_LIMITS : UNLIMITED;
}

export interface RegistryPlanInfo {
  plan: RegistryPlan;
  /** True when the registry has unlimited access (pro/grandfathered). */
  isPro: boolean;
  limits: PlanLimits;
}

/**
 * Resolve the effective plan for a registry. Returns null when the registry
 * doesn't exist.
 *
 * One round trip: `registries.plan` LEFT JOINed with the subscription mirror.
 * The resolution matrix (first match wins):
 *
 *   registries.plan = 'grandfathered' → PRO     (permanent; a subscription
 *                                               can never demote it — see
 *                                               GRANDFATHERING below)
 *   subscription = trialing|active    → PRO     (covers webhook LAG in BOTH
 *   subscription = past_due/canceled/            directions: a payment that
 *     revoked AND grace_until > now   → PRO      succeeded before the plan-
 *                                               flip webhook landed, AND a
 *                                               cancellation still inside
 *                                               its grace window)
 *   registries.plan = 'pro' AND
 *     NO subscription row             → PRO     (column says pro, nothing
 *                                               contradicts it)
 *   anything else                     → FREE    (free column, OR pro column
 *                                               with a dead subscription:
 *                                               canceled/revoked/past_due
 *                                               beyond grace)
 *
 * The last row is the REVENUE-CRITICAL one: the webhook deliberately never
 * writes plan='free' on cancel (no cron sweeper), so this read is where a
 * canceled subscription demotes to free — once grace_until lapses, the
 * "grace" branch stops matching and the matrix falls through to FREE.
 * Grandfathered rows are immune because they short-circuit at the top and
 * (by migration design) carry no subscription history.
 *
 * AUTHORITY: this function (via the DB rows) is the single source of truth
 * for "is this registry Pro". UI hints may be stale; enforcement MUST call
 * this (or use ctx.state.activeRegistryPlan, which the middleware populates
 * with this same function on full-state paths).
 */
export async function getRegistryPlan(
  registryId: string,
): Promise<RegistryPlanInfo | null> {
  const result = await query(
    `SELECT r.plan,
            rs.status AS sub_status,
            rs.grace_until
     FROM registries r
     LEFT JOIN registry_subscriptions rs ON rs.registry_id = r.id
     WHERE r.id = $1`,
    [registryId],
  );
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const plan = row.plan as RegistryPlan;
  const subStatus = row.sub_status as string | null;
  const graceUntil = row.grace_until
    ? new Date(row.grace_until as string)
    : null;
  const now = Date.now();

  const subLive = subStatus === "trialing" || subStatus === "active";
  const inGrace = !!graceUntil && graceUntil.getTime() > now &&
    (subStatus === "past_due" || subStatus === "canceled" ||
      subStatus === "revoked");

  let effective: RegistryPlan;
  if (plan === "grandfathered") {
    // Permanent by design — checked FIRST so no subscription state, however
    // dead, can ever demote it (the webhook's flip is WHERE plan='free').
    effective = "grandfathered";
  } else if (subLive || inGrace) {
    // A live or graced subscription is Pro regardless of what the column
    // says: covers activation webhook lag (column still 'free') AND the
    // cancellation/dunning grace window.
    effective = "pro";
  } else if (plan === "pro" && subStatus === null) {
    // Column says pro and there is no subscription row contradicting it.
    // (In practice the flip webhook always writes both; this branch is the
    // defensive no-contradiction case.)
    effective = "pro";
  } else {
    // plan='free' with no live sub → free.
    // plan='pro' with a DEAD sub (canceled/revoked/past_due beyond grace)
    // → free. This is where cancellation actually takes effect.
    effective = "free";
  }

  return {
    plan: effective,
    isPro: effective !== "free",
    limits: entitlementsFor(effective),
  };
}

/**
 * Count registries the user owns whose EFFECTIVE plan is free (for the
 * create cap).
 *
 * Only free registries consume the cap — grandfathered and Pro groups do NOT.
 * This matters in both directions:
 *   - Post-migration, most users own 1-2 grandfathered registries; counting
 *     those would lock long-time users out of ever creating a new group
 *     (a regression against their pre-billing "unlimited").
 *   - A paying customer with 2 Pro groups must still be able to start a
 *     3rd (they can upgrade it after creating — the upgrade flow is
 *     per-registry and runs AFTER creation).
 *
 * "Effectively free" = plan 'free' AND the subscription (if any) is not
 * live/graced — mirroring getRegistryPlan's matrix in SQL so a canceled-but-
 * unflipped registry correctly counts against the cap again.
 */
export async function countOwnedRegistries(userId: string): Promise<number> {
  const result = await query(
    `SELECT count(*)::int AS cnt
     FROM registry_members rm
     JOIN registries r ON r.id = rm.registry_id
     LEFT JOIN registry_subscriptions rs ON rs.registry_id = r.id
     WHERE rm.user_id = $1
       AND rm.role = 'owner'
       AND r.plan = 'free'
       AND (
         rs.status IS NULL
         OR (
           rs.status IN ('past_due', 'canceled', 'revoked')
           AND (rs.grace_until IS NULL OR rs.grace_until <= now())
         )
       )`,
    [userId],
  );
  return result.rows[0].cnt as number;
}

/** Count members of a registry (for the join cap). */
export async function countRegistryMembers(
  registryId: string,
): Promise<number> {
  const result = await query(
    `SELECT count(*)::int AS cnt FROM registry_members WHERE registry_id = $1`,
    [registryId],
  );
  return result.rows[0].cnt as number;
}

/**
 * Count active recurring/installment templates for a registry — mirrors the
 * spawn-candidate eligibility rules (recurring not disabled; parcialidad not
 * fully paid), regardless of archived state since clones reset exercise_id.
 */
export async function countActiveTemplates(
  registryId: string,
): Promise<number> {
  const result = await query(
    `SELECT count(DISTINCT recurring_group_id)::int AS cnt
     FROM transactions
     WHERE registry_id = $1
       AND recurring_disabled = false
       AND type IN ('recurrente', 'parcialidad')
       AND (type = 'recurrente' OR installment_current < installment_total)`,
    [registryId],
  );
  return result.rows[0].cnt as number;
}

/** HTTP 402 body shape used by every enforcement touchpoint. */
export function upgradeRequired(
  reason: "owned_registries" | "members" | "templates" | "history",
): Response {
  return Response.json({ code: "upgrade_required", reason }, { status: 402 });
}

/**
 * Thrown by `store.useInvitation` when the TARGET registry is at its
 * free-plan member cap. The join route maps it (via instanceof) to a
 * localized 402 upgrade payload — a class rather than a string sentinel so
 * the catch can't drift if the message text ever changes.
 */
export class GroupFullError extends Error {
  constructor() {
    super("GROUP_FULL");
    this.name = "GroupFullError";
  }
}
