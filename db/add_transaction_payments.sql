CREATE TABLE transaction_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pago_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tp_pago ON transaction_payments(pago_id);
CREATE INDEX idx_tp_expense ON transaction_payments(expense_id);

INSERT INTO transaction_payments (pago_id, expense_id, amount)
SELECT id, related_transaction_id, original_amount
FROM transactions
WHERE type = 'pago' AND related_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row-Level Security for this table (R7/R8).
--
-- This block is self-contained (the helper functions are created here via
-- CREATE OR REPLACE because this migration runs BEFORE enable_rls.sql in the
-- fresh-deploy chain). enable_rls.sql and tighten_rls.sql re-assert the same
-- final state, so all paths converge. Idempotent: safe to re-run.
--
-- Policy: members of a registry can read/write payment links whose pago AND
-- expense transactions both live in that registry (R8: previously only
-- pago's registry was validated, allowing cross-registry payment links).
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

ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transaction_payments_member ON transaction_payments;
CREATE POLICY transaction_payments_member ON transaction_payments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM transactions tp
      JOIN transactions te ON te.registry_id = tp.registry_id
      WHERE tp.id = transaction_payments.pago_id
        AND te.id = transaction_payments.expense_id
        AND is_registry_member(tp.registry_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM transactions tp
      JOIN transactions te ON te.registry_id = tp.registry_id
      WHERE tp.id = transaction_payments.pago_id
        AND te.id = transaction_payments.expense_id
        AND is_registry_member(tp.registry_id)
    )
  );
