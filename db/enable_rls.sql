-- Enable Row-Level Security across all tables.
--
-- Strategy: "Policies + FORCE, app bypasses."
--   - The Fresh server runs queries through a postgres-superuser pg.Pool that
--     bypasses RLS by design. The server-side middleware is the authz layer.
--   - These policies protect the Supabase Realtime channel (which connects as
--     the authenticated user via JWT, so auth.uid() works natively) and any
--     future direct Supabase-client access.
--   - FORCE ROW LEVEL SECURITY ensures policies apply even to the table owner,
--     which matters if the connection role is ever downgraded from superuser.
--
-- Run this in the Supabase SQL editor. No code changes required.

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

CREATE POLICY users_select_self_or_comember ON users
  FOR SELECT USING (
    id = app_user_id()
    OR EXISTS (
      SELECT 1 FROM registry_members rm1
      JOIN registry_members rm2 ON rm1.registry_id = rm2.registry_id
      WHERE rm1.user_id = app_user_id() AND rm2.user_id = users.id
    )
  );

CREATE POLICY users_insert_self ON users
  FOR INSERT WITH CHECK (supabase_auth_id = (SELECT auth.uid()));

CREATE POLICY users_update_self ON users
  FOR UPDATE USING (id = app_user_id()) WITH CHECK (id = app_user_id());

-- ===========================================================================
-- registries
-- ===========================================================================

ALTER TABLE registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE registries FORCE ROW LEVEL SECURITY;

CREATE POLICY registries_select_member ON registries
  FOR SELECT USING (is_registry_member(id));

CREATE POLICY registries_insert_any ON registries
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY registries_update_member ON registries
  FOR UPDATE USING (is_registry_member(id)) WITH CHECK (is_registry_member(id));

CREATE POLICY registries_delete_member ON registries
  FOR DELETE USING (is_registry_member(id));

-- ===========================================================================
-- registry_members
-- ===========================================================================

ALTER TABLE registry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_members FORCE ROW LEVEL SECURITY;

CREATE POLICY registry_members_select_comember ON registry_members
  FOR SELECT USING (is_registry_member(registry_id));

CREATE POLICY registry_members_insert_self ON registry_members
  FOR INSERT WITH CHECK (user_id = app_user_id());

CREATE POLICY registry_members_delete_self ON registry_members
  FOR DELETE USING (user_id = app_user_id());

-- ===========================================================================
-- user_preferences
-- ===========================================================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_self ON user_preferences
  FOR ALL USING (user_id = app_user_id()) WITH CHECK (user_id = app_user_id());

-- ===========================================================================
-- exercises
-- ===========================================================================

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;

CREATE POLICY exercises_select_member ON exercises
  FOR SELECT USING (is_registry_member(registry_id));

CREATE POLICY exercises_insert_member ON exercises
  FOR INSERT WITH CHECK (is_registry_member(registry_id));

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

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY transactions_member ON transactions
  FOR ALL USING (is_registry_member(registry_id))
  WITH CHECK (is_registry_member(registry_id));

-- ===========================================================================
-- transaction_payments
-- ===========================================================================

ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY transaction_payments_member ON transaction_payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_payments.pago_id
        AND is_registry_member(t.registry_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_payments.pago_id
        AND is_registry_member(t.registry_id)
    )
  );

-- ===========================================================================
-- transaction_balances
-- ===========================================================================

ALTER TABLE transaction_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_balances FORCE ROW LEVEL SECURITY;

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

-- SELECT: registry members can see their invitations. Any authenticated user
-- can also SELECT (the invitation code is the secret — guessing an 8-char
-- unambiguous code is infeasible, and the app validates code validity).
CREATE POLICY invitations_select ON invitations
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

CREATE POLICY invitations_insert_member ON invitations
  FOR INSERT WITH CHECK (is_registry_member(registry_id));

CREATE POLICY invitations_update_member ON invitations
  FOR UPDATE USING (is_registry_member(registry_id))
  WITH CHECK (is_registry_member(registry_id));

-- ===========================================================================
-- audit_log (write-only from the client perspective)
-- ===========================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- No SELECT policy → denies all reads from non-superuser roles.
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- ===========================================================================
-- allowed_emails (read-only allowlist)
-- ===========================================================================

-- Drop the pre-existing permissive policy (allowed anon reads) and replace
-- with one that requires authentication.
DROP POLICY IF EXISTS "Enable read access for all users" ON allowed_emails;

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowed_emails FORCE ROW LEVEL SECURITY;

CREATE POLICY allowed_emails_select ON allowed_emails
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- ===========================================================================
-- push_subscriptions
-- ===========================================================================

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_self ON push_subscriptions
  FOR SELECT USING (user_id = app_user_id());

CREATE POLICY push_subscriptions_insert_self ON push_subscriptions
  FOR INSERT WITH CHECK (user_id = app_user_id());

CREATE POLICY push_subscriptions_delete_self ON push_subscriptions
  FOR DELETE USING (user_id = app_user_id());
