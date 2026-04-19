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
