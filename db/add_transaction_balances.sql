-- transaction_balances: persisted per-user balance deltas per transaction.
--
-- Each row stores the signed, rounded-to-cent impact of one transaction on one
-- user's balance. Balance is then an exact SUM (NUMERIC arithmetic, no
-- floating-point residue) instead of a re-derivation from split_json every time.
--
-- This eliminates the historical 1-2 cent discrepancy between users after a
-- full payment, caused by calculateBalance (raw floats) and
-- calculatePairwiseBreakdown (per-counterparty rounding) diverging.

CREATE TABLE IF NOT EXISTS transaction_balances (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,            -- NOT FK to users: may be an entity id (like user_paid)
  amount NUMERIC(12,2) NOT NULL,    -- signed delta, already rounded to cents
  PRIMARY KEY (transaction_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tb_transaction ON transaction_balances(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tb_user ON transaction_balances(user_id);

-- Backfill existing transactions.
-- Mirrors computeDeltas() in lib/balances.ts: for each transaction, compute the
-- signed delta for every affected user and insert it.
-- Run once after deploying the code changes that call computeDeltas at write time.

INSERT INTO transaction_balances (transaction_id, user_id, amount)
SELECT
  t.id,
  u.user_id::uuid,
  u.amount
FROM transactions t
CROSS JOIN LATERAL (
  -- For pago/ajuste: payer gets +amount, recipient gets -amount.
  -- Cast all user_id branches to text so the UNION types match.
  SELECT t.user_paid::text AS user_id, ROUND(t.original_amount, 2) AS amount
  WHERE t.type IN ('pago', 'ajuste')
  UNION ALL
  SELECT
    s->>'userId' AS user_id,
    CASE
      WHEN (s->>'userId')::text = t.user_paid::text THEN
        ROUND((t.original_amount / COALESCE(NULLIF(t.installment_total, 0), 1)) - (CAST(s->>'amount' AS NUMERIC) / COALESCE(NULLIF(t.installment_total, 0), 1)), 2)
      ELSE
        ROUND(-(CAST(s->>'amount' AS NUMERIC) / COALESCE(NULLIF(t.installment_total, 0), 1)), 2)
    END AS amount
  FROM jsonb_array_elements(t.split_json->'splits') AS s
  WHERE t.type NOT IN ('pago', 'ajuste')
  UNION ALL
  -- Payer not in split: credited the full per-installment total.
  SELECT
    t.user_paid::text AS user_id,
    ROUND(t.original_amount / COALESCE(NULLIF(t.installment_total, 0), 1), 2) AS amount
  WHERE t.type NOT IN ('pago', 'ajuste')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.split_json->'splits') AS s
      WHERE (s->>'userId')::text = t.user_paid::text
    )
) AS u
ON CONFLICT (transaction_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row-Level Security for this table (R7).
--
-- This block is self-contained (the helper functions are created here via
-- CREATE OR REPLACE because this migration runs BEFORE enable_rls.sql in the
-- fresh-deploy chain). enable_rls.sql and tighten_rls.sql re-assert the same
-- final state, so all paths converge. Idempotent: safe to re-run.
--
-- Policy: members of a registry can read/write the balance rows of that
-- registry's transactions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE supabase_auth_id = (SELECT auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION app_user_id() FROM PUBLIC;

CREATE OR REPLACE FUNCTION is_registry_member(reg_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM registry_members
    WHERE registry_id = reg_id AND user_id = app_user_id()
  )
$$;
REVOKE EXECUTE ON FUNCTION is_registry_member(UUID) FROM PUBLIC;

ALTER TABLE transaction_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_balances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_balances_member ON transaction_balances;
CREATE POLICY transaction_balances_member ON transaction_balances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_balances.transaction_id
        AND is_registry_member(t.registry_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_balances.transaction_id
        AND is_registry_member(t.registry_id)
    )
  );
