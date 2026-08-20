-- Billing model change: a subscription maps to a USER, not a registry.
-- One subscription unlocks Pro on EVERY registry the subscriber owns
-- (grandfathering stays per-registry, unchanged).
--
-- Run AFTER add_billing.sql and add_subscription_cancel_flag.sql.
-- Idempotent guards make re-runs safe, but note steps 2/3 only do work the
-- first time (the table has no registry_id column afterwards).
--
-- MIGRATION SEMANTICS (worth reading before running on prod):
--   * Each existing per-registry subscription is re-attributed to the
--     registry's owner. A user who paid for one group therefore unlocks ALL
--     their groups — the new model's promise, applied retroactively.
--   * A user with SEVERAL per-registry subscriptions (was paying multiples)
--     keeps only the most recently updated row here. The extra Polar
--     subscriptions keep billing until cancelled — OPS NOTE: affected users
--     should cancel the extras from the customer portal (or Polar admin).
--     Webhook events for a dropped subscription simply overwrite the same
--     user row; nothing breaks.

-- 1. Add the user column and backfill it from each registry's owner.
ALTER TABLE registry_subscriptions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

UPDATE registry_subscriptions rs
SET user_id = sub.owner_id
FROM (
  SELECT DISTINCT ON (rm.registry_id)
    rm.registry_id,
    rm.user_id AS owner_id
  FROM registry_members rm
  WHERE rm.role = 'owner'
  ORDER BY rm.registry_id, rm.joined_at
) sub
WHERE rs.registry_id = sub.registry_id
  AND rs.user_id IS NULL;

-- 2. Deduplicate: one row per user, keeping the most recently updated
--    subscription (ctid as the deterministic tiebreaker).
DELETE FROM registry_subscriptions a
USING registry_subscriptions b
WHERE a.user_id IS NOT NULL
  AND a.user_id = b.user_id
  AND (a.updated_at < b.updated_at
    OR (a.updated_at = b.updated_at AND a.ctid < b.ctid));

-- 3. Swap the primary key from registry_id to user_id and drop the old column.
ALTER TABLE registry_subscriptions
  DROP CONSTRAINT IF EXISTS registry_subscriptions_pkey;

DELETE FROM registry_subscriptions WHERE user_id IS NULL;

ALTER TABLE registry_subscriptions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE registry_subscriptions ADD PRIMARY KEY (user_id);
ALTER TABLE registry_subscriptions DROP COLUMN IF EXISTS registry_id;
