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
 * Resolve the effective plan for a registry. Reads registries.plan plus the
 * subscription mirror in one round trip. Returns null when the registry
 * doesn't exist.
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

  let effective: RegistryPlan = plan;
  if (plan === "free") {
    // A live subscription lifts a 'free' registry to pro without waiting for
    // a webhook to flip registries.plan (belt-and-braces: the webhook also
    // updates registries.plan, this covers webhook lag and past_due grace).
    const now = Date.now();
    if (
      subStatus === "trialing" || subStatus === "active" ||
      (subStatus === "past_due" && graceUntil && graceUntil.getTime() > now)
    ) {
      effective = "pro";
    }
  }

  return {
    plan: effective,
    isPro: effective !== "free",
    limits: entitlementsFor(effective),
  };
}

/** Count registries where the user is owner (for the create cap). */
export async function countOwnedRegistries(userId: string): Promise<number> {
  const result = await query(
    `SELECT count(*)::int AS cnt FROM registry_members
     WHERE user_id = $1 AND role = 'owner'`,
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
