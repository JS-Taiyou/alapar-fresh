ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS related_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
