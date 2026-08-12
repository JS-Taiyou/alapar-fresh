-- Enable Row-Level Security across all tables.
--
-- Strategy: "Policies + FORCE, app bypasses."
--   - The Fresh server runs queries through a postgres-superuser pg.Pool that
--     bypasses RLS by design. The server-side middleware is the authz layer.
--   - These policies protect the Supabase Realtime channel (which connects as
--     the authenticated user via JWT, so auth.uid() works natively) and any
--     direct Supabase-client (PostgREST) access.
--   - FORCE ROW LEVEL SECURITY ensures policies apply even to the table owner,
--     which matters if the connection role is ever downgraded from superuser.
--
-- Run this in the Supabase SQL editor AFTER schema.sql and the add_*.sql
-- migrations. For projects that already ran an older version of this file,
-- apply db/tighten_rls.sql instead (then db/enable_realtime.sql) — both
-- paths converge on the same final state.
--
-- This file is re-runnable: every CREATE POLICY is preceded by
-- DROP POLICY IF EXISTS, functions use CREATE OR REPLACE, and indexes use
-- IF NOT EXISTS.

-- ===========================================================================
-- Helper functions
-- ===========================================================================

-- Resolve auth.uid() (Supabase Auth UUID) to the app users.id.
-- Needed because registry_members.user_id references users.id, not
-- supabase_auth_id.
CREATE OR REPLACE FUNCTION app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE supabase_auth_id = (SELECT auth.uid())
$$;
-- Revoke direct access — these are internal RLS helpers, not API endpoints.
-- Must revoke from PUBLIC (Supabase grants EXECUTE to PUBLIC by default),
-- which covers anon, authenticated, and any future custom roles. Policies
-- still work because they evaluate with owner privileges, not via RPC.
REVOKE EXECUTE ON FUNCTION app_user_id() FROM PUBLIC;

-- Check whether the current authenticated user is a member of a registry.
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

-- Drop the redundant index on users.supabase_auth_id — the UNIQUE constraint
-- already creates one (users_supabase_auth_id_key), so the explicit index is
-- a duplicate.
DROP INDEX IF EXISTS idx_users_supabase_auth_id;

-- ===========================================================================
-- users
-- ===========================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_self_or_comember ON users;
CREATE POLICY users_select_self_or_comember ON users
  FOR SELECT USING (
    id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM registry_members rm1
      JOIN registry_members rm2 ON rm1.registry_id = rm2.registry_id
      WHERE rm1.user_id = app_user_id() AND rm2.user_id = users.id
    )
  );

DROP POLICY IF EXISTS users_insert_self ON users;
CREATE POLICY users_insert_self ON users
  FOR INSERT WITH CHECK (supabase_auth_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_update_self ON users
  FOR UPDATE USING (id = app_user_id()) WITH CHECK (id = app_user_id());

-- R10: users_update_self would otherwise let a user change their own email
-- (bypassing the allowed_emails gate) and supabase_auth_id (account
-- takeover). This trigger forces both columns back to their OLD values on
-- client requests, while name/color stay editable.
--
-- The guard only fires when a Supabase user JWT is present (auth.uid() IS
-- NOT NULL), i.e. PostgREST/Realtime client roles. The app server connects
-- directly as superuser WITHOUT JWT claims, so it stays able to sync email:
-- lib/store.ts createUserFromSupabase does
--   INSERT ... ON CONFLICT (supabase_auth_id) DO UPDATE SET email = $1, ...
-- An unconditional guard would silently break that server-side email sync.
-- (main.ts also updates users.name server-side — that path is unaffected
-- either way.)
CREATE OR REPLACE FUNCTION protect_user_identity_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    NEW.email := OLD.email;
    NEW.supabase_auth_id := OLD.supabase_auth_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_protect_identity ON users;
CREATE TRIGGER trg_users_protect_identity
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION protect_user_identity_columns();

-- R12: case-insensitive uniqueness of users.email. The existing
-- users_email_key UNIQUE constraint is case-sensitive; this unique
-- expression index is kept alongside it (redundant but harmless).
-- NOTE: fails if existing emails differ only by case — check first with:
--   SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));

-- ===========================================================================
-- registries
-- ===========================================================================

ALTER TABLE registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE registries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registries_select_member ON registries;
CREATE POLICY registries_select_member ON registries
  FOR SELECT USING (is_registry_member(id));

DROP POLICY IF EXISTS registries_insert_any ON registries;
CREATE POLICY registries_insert_any ON registries
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS registries_update_member ON registries;
CREATE POLICY registries_update_member ON registries
  FOR UPDATE USING (is_registry_member(id)) WITH CHECK (is_registry_member(id));

-- R3: DELETE cascades wipe members, exercises, transactions, payments,
-- balances and invitations — destructive operations are owner-only.
DROP POLICY IF EXISTS registries_delete_member ON registries;
CREATE POLICY registries_delete_member ON registries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM registry_members rm
      WHERE rm.registry_id = registries.id
        AND rm.user_id = app_user_id()
        AND rm.role = 'owner'
    )
  );

-- ===========================================================================
-- registry_members
-- ===========================================================================

ALTER TABLE registry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS registry_members_select_comember ON registry_members;
CREATE POLICY registry_members_select_comember ON registry_members
  FOR SELECT USING (is_registry_member(registry_id));

-- R1: NO client-side INSERT policy — the old registry_members_insert_self
-- (WITH CHECK user_id = app_user_id()) let any authenticated user join ANY
-- registry. The join flow is server-side (superuser, bypasses RLS); verified
-- no supabase-js table writes exist in islands/ or routes/. The DROP below
-- removes the old policy when this file is re-run on a project that has it.
DROP POLICY IF EXISTS registry_members_insert_self ON registry_members;

DROP POLICY IF EXISTS registry_members_delete_self ON registry_members;
CREATE POLICY registry_members_delete_self ON registry_members
  FOR DELETE USING (user_id = app_user_id());

-- R11: restrict role values to the ones the app understands.
ALTER TABLE registry_members DROP CONSTRAINT IF EXISTS registry_members_role_check;
ALTER TABLE registry_members
  ADD CONSTRAINT registry_members_role_check CHECK (role IN ('owner', 'member'));

-- ===========================================================================
-- user_preferences
-- ===========================================================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_preferences_self ON user_preferences;
CREATE POLICY user_preferences_self ON user_preferences
  FOR ALL USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- ===========================================================================
-- exercises
-- ===========================================================================

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS exercises_select_member ON exercises;
CREATE POLICY exercises_select_member ON exercises
  FOR SELECT USING (is_registry_member(registry_id));

DROP POLICY IF EXISTS exercises_insert_member ON exercises;
CREATE POLICY exercises_insert_member ON exercises
  FOR INSERT WITH CHECK (is_registry_member(registry_id));

DROP POLICY IF EXISTS exercises_update_member ON exercises;
CREATE POLICY exercises_update_member ON exercises
  FOR UPDATE USING (is_registry_member(registry_id))
  WITH CHECK (is_registry_member(registry_id));

-- ===========================================================================
-- transactions (CRITICAL — gates the Supabase Realtime channel)
-- ===========================================================================

-- Drop pre-existing policies (they inline the auth.uid()→users.id subquery;
-- our version uses the is_registry_member helper for the same logic).
DROP POLICY IF EXISTS "Users can read transactions of their registries" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their registries" ON transactions;
DROP POLICY IF EXISTS "Users can update transactions in their registries" ON transactions;
DROP POLICY IF EXISTS "Users can delete transactions in their registries" ON transactions;

-- R4: the old FOR ALL policy (transactions_member) is replaced by per-command
-- policies:
--   - INSERT additionally requires creator_id = app_user_id() (user_paid is
--     left alone — it may be an entity id, not a users.id);
--   - UPDATE/DELETE are blocked for exercise-locked rows (exercise_id IS NOT
--     NULL): settled transactions are immutable from client roles. Cutting an
--     exercise is a server-side operation (superuser, unaffected).
DROP POLICY IF EXISTS transactions_member ON transactions;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transactions_select_member ON transactions;
CREATE POLICY transactions_select_member ON transactions
  FOR SELECT USING (is_registry_member(registry_id));

DROP POLICY IF EXISTS transactions_insert_member ON transactions;
CREATE POLICY transactions_insert_member ON transactions
  FOR INSERT WITH CHECK (
    is_registry_member(registry_id)
    AND creator_id = app_user_id()
  );

DROP POLICY IF EXISTS transactions_update_member ON transactions;
CREATE POLICY transactions_update_member ON transactions
  FOR UPDATE
  USING (exercise_id IS NULL AND is_registry_member(registry_id))
  WITH CHECK (exercise_id IS NULL AND is_registry_member(registry_id));

DROP POLICY IF EXISTS transactions_delete_member ON transactions;
CREATE POLICY transactions_delete_member ON transactions
  FOR DELETE
  USING (exercise_id IS NULL AND is_registry_member(registry_id));

-- ===========================================================================
-- transaction_payments
-- ===========================================================================
-- R7: RLS is also enabled in add_transaction_payments.sql itself; this block
-- is kept as a converging hardening pass.
-- R8: pago and expense must belong to the SAME registry (previously only
-- pago's registry membership was validated, allowing cross-registry links).

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

-- ===========================================================================
-- transaction_balances
-- ===========================================================================
-- R7: also enabled in add_transaction_balances.sql itself.

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

-- ===========================================================================
-- invitations
-- ===========================================================================

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;

-- R2: SELECT restricted to registry members. The old policy allowed ANY
-- authenticated user to read every invitation code. Code redemption is
-- server-side (superuser), so non-members need no read access.
DROP POLICY IF EXISTS invitations_select ON invitations;
CREATE POLICY invitations_select ON invitations
  FOR SELECT USING (is_registry_member(registry_id));

DROP POLICY IF EXISTS invitations_insert_member ON invitations;
CREATE POLICY invitations_insert_member ON invitations
  FOR INSERT WITH CHECK (is_registry_member(registry_id));

DROP POLICY IF EXISTS invitations_update_member ON invitations;
CREATE POLICY invitations_update_member ON invitations
  FOR UPDATE USING (is_registry_member(registry_id))
  WITH CHECK (is_registry_member(registry_id));

-- ===========================================================================
-- audit_log (server-only)
-- ===========================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- R5: NO client policies at all. The old audit_log_insert policy (WITH CHECK
-- auth.uid() IS NOT NULL) let any authenticated user forge audit rows and
-- served no client purpose — all audit writes are server-side. No SELECT
-- policy either, so non-superuser roles can neither read nor write.
-- The DROP removes the old policy when re-running on a project that has it.
DROP POLICY IF EXISTS audit_log_insert ON audit_log;

-- ===========================================================================
-- allowed_emails (server-only allowlist)
-- ===========================================================================

-- Drop the pre-existing permissive policy (allowed anon reads).
DROP POLICY IF EXISTS "Enable read access for all users" ON allowed_emails;

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_emails FORCE ROW LEVEL SECURITY;

-- R6: NO client SELECT policy — the old allowed_emails_select policy leaked
-- the entire allowlist to any authenticated user. The list is only consulted
-- server-side (main.ts / lib/store.ts). The DROP removes the old policy when
-- re-running on a project that has it.
DROP POLICY IF EXISTS allowed_emails_select ON allowed_emails;

-- ===========================================================================
-- push_subscriptions
-- ===========================================================================
-- R7: also enabled in add_push_subscriptions.sql itself.

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_self ON push_subscriptions;
CREATE POLICY push_subscriptions_select_self ON push_subscriptions
  FOR SELECT USING (user_id = app_user_id());

DROP POLICY IF EXISTS push_subscriptions_insert_self ON push_subscriptions;
CREATE POLICY push_subscriptions_insert_self ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = app_user_id());

DROP POLICY IF EXISTS push_subscriptions_delete_self ON push_subscriptions;
CREATE POLICY push_subscriptions_delete_self ON push_subscriptions
  FOR DELETE USING (user_id = app_user_id());

-- ===========================================================================
-- Covering indexes for foreign keys
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_creator ON transactions(creator_id);
CREATE INDEX IF NOT EXISTS idx_transactions_related ON transactions(related_transaction_id);
CREATE INDEX IF NOT EXISTS idx_invitations_created_by ON invitations(created_by);
CREATE INDEX IF NOT EXISTS idx_user_preferences_active_registry ON user_preferences(active_registry_id);
