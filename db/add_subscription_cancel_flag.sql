-- Tracks whether the owner scheduled a cancel-at-period-end from the app
-- (POST /api/billing/cancel). Polar keeps the subscription ACTIVE until
-- current_period_end when cancel_at_period_end is true, so this flag drives
-- the pricing page's "Activo hasta {date}" / Reactivar UI — entitlements
-- themselves need no change (status stays live until Polar ends the period).
--
-- Idempotent: safe to re-run.

ALTER TABLE registry_subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
