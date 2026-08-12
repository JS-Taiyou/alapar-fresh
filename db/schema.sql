-- Alapar Schema - Multi-registry expense splitting
-- Designed for Supabase auth + local PostgreSQL data

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users (auth + profile in one table)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  supabase_auth_id UUID UNIQUE,
  color TEXT NOT NULL DEFAULT '#093eaa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_supabase_auth_id ON users(supabase_auth_id);

-- Registries (groups) - central hub replacing per-group SQLite DBs
CREATE TABLE registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  latest_accessed TIMESTAMPTZ NOT NULL DEFAULT now(),
  default_split_json JSONB DEFAULT NULL,
  default_split_member_count INTEGER DEFAULT NULL,
  entities_json JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registry membership
CREATE TABLE registry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, user_id)
);

-- Per-user preferences (active registry, etc.)
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  active_registry_id UUID REFERENCES registries(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);

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
-- user_paid may reference either users.id (real member) or an entity ID from registries.entities_json
-- creator_id always references a real user
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL DEFAULT 'unico' CHECK (type IN ('unico', 'parcialidad', 'recurrente', 'pago', 'ajuste')),
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  installment_current INTEGER,
  installment_total INTEGER,
  recurring_disabled BOOLEAN NOT NULL DEFAULT false,
  recurring_group_id UUID,
  notes TEXT NOT NULL DEFAULT '',
  split_json JSONB NOT NULL DEFAULT '{"splits":[]}',
  creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_paid UUID NOT NULL,
  related_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Invitations
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_code ON invitations(code);
CREATE INDEX idx_invitations_registry ON invitations(registry_id);

-- Audit log
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_log_registry ON audit_log(target_id);

-- Allowed emails for registration
CREATE TABLE allowed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_allowed_emails_email ON allowed_emails(email);

-- Indexes
CREATE INDEX idx_transactions_registry ON transactions(registry_id);
CREATE INDEX idx_transactions_exercise ON transactions(exercise_id);
CREATE INDEX idx_exercises_registry ON exercises(registry_id);
CREATE INDEX idx_registry_members_user ON registry_members(user_id);
CREATE INDEX idx_registry_members_registry ON registry_members(registry_id);

-- Additional performance indexes
CREATE INDEX idx_transactions_user_paid ON transactions(user_paid);
CREATE INDEX idx_transactions_recurring_group ON transactions(recurring_group_id);
CREATE INDEX idx_transactions_split_json ON transactions USING gin(split_json);
CREATE INDEX idx_transactions_active ON transactions(registry_id) WHERE exercise_id IS NULL;
CREATE INDEX idx_transactions_creator ON transactions(creator_id);
CREATE INDEX idx_transactions_related ON transactions(related_transaction_id);
CREATE INDEX idx_invitations_created_by ON invitations(created_by);
CREATE INDEX idx_user_preferences_active_registry ON user_preferences(active_registry_id);
