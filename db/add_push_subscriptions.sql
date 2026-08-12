CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  registry_id UUID REFERENCES registries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_registry_id ON push_subscriptions(registry_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security for this table (R7).
--
-- This block is self-contained (the helper function is created here via
-- CREATE OR REPLACE because this migration runs BEFORE enable_rls.sql in the
-- fresh-deploy chain). enable_rls.sql and tighten_rls.sql re-assert the same
-- final state, so all paths converge. Idempotent: safe to re-run.
--
-- Policies: users can only see/register/remove their own subscriptions.
-- No UPDATE policy: the app server (superuser, bypasses RLS) handles updates.
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
