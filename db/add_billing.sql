-- ===========================================================================
-- add_billing.sql — Paid tier ("Pro") with Polar billing
--
-- Run order:
--   Fresh deploy:  schema.sql → add_*.sql → enable_rls.sql → tighten_rls.sql
--                  → enable_realtime.sql → add_billing.sql
--   Live project:  run this file directly (idempotent, self-contained).
--
-- DEPLOY BEFORE THE CODE THAT USES IT (see docs/MONETIZATION.md).
-- Grandfathers every registry existing at migration time: plan='grandfathered'
-- (unlimited forever). New registries default to 'free'.
--
-- Everything here is idempotent (IF NOT EXISTS / WHERE NOT EXISTS guards), so
-- it is safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- registries.plan
-- ---------------------------------------------------------------------------
ALTER TABLE registries
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Enforce valid values. ALTER ... ADD CONSTRAINT is not IF NOT EXISTS-able;
-- drop and re-add (idempotent).
ALTER TABLE registries DROP CONSTRAINT IF EXISTS registries_plan_check;
ALTER TABLE registries ADD CONSTRAINT registries_plan_check
  CHECK (plan IN ('free', 'pro', 'grandfathered'));

-- Grandfather: every registry that exists before billing goes live keeps
-- unlimited access forever. (WHERE NOT EXISTS keeps re-runs from flipping a
-- registry that an owner deliberately downgraded later back to grandfathered.)
UPDATE registries
SET plan = 'grandfathered'
WHERE plan = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM registry_subscriptions rs
    WHERE rs.registry_id = registries.id
  );

-- ---------------------------------------------------------------------------
-- registry_subscriptions — server-only mirror of Polar subscription state.
-- Zero RLS policies: read/written exclusively by the Fresh server (superuser
-- pool + webhook handler), same posture as audit_log / allowed_emails.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registry_subscriptions (
  registry_id UUID PRIMARY KEY
    REFERENCES registries(id) ON DELETE CASCADE,
  polar_subscription_id TEXT UNIQUE,
  polar_customer_id TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'revoked')),
  current_period_end TIMESTAMPTZ,
  grace_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_subscriptions_polar_customer
  ON registry_subscriptions(polar_customer_id);

ALTER TABLE registry_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_subscriptions FORCE ROW LEVEL SECURITY;
-- No policies: client roles see zero rows. The server pool (superuser)
-- bypasses RLS; the webhook handler runs server-side on that same pool.
