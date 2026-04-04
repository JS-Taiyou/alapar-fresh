-- Alapar Schema - Multi-registry expense splitting
-- Designed for future Supabase migration (uuids, timestamps, FKs)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- System-level users (auth identity)
CREATE TABLE system_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registries (groups) - central hub replacing per-group SQLite DBs
CREATE TABLE registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  db_name TEXT NOT NULL UNIQUE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  latest_accessed TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registry membership
CREATE TABLE registry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, user_id)
);

-- Per-registry user profiles
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  system_user_id UUID NOT NULL REFERENCES system_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#093eaa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exercises (cuts/settlements) - before transactions due to FK
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  transaction_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'unico' CHECK (type IN ('unico', 'parcialidad', 'recurrente', 'pago')),
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  installment_current INTEGER,
  installment_total INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  split_json JSONB NOT NULL DEFAULT '{"splits":[]}',
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_paid UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_transactions_registry ON transactions(registry_id);
CREATE INDEX idx_transactions_exercise ON transactions(exercise_id);
CREATE INDEX idx_users_registry ON users(registry_id);
CREATE INDEX idx_exercises_registry ON exercises(registry_id);
CREATE INDEX idx_registry_members_user ON registry_members(user_id);
CREATE INDEX idx_registry_members_registry ON registry_members(registry_id);
