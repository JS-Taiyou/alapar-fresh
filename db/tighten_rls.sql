-- ===========================================================================
-- tighten_rls.sql — security-hardening follow-up to enable_rls.sql
--
-- Run order:
--   Fresh deploy:  schema.sql → add_*.sql → enable_rls.sql → tighten_rls.sql
--                  → enable_realtime.sql
--   Live project (schema → add_* → enable_rls.sql already applied):
--                  run THIS file, then enable_realtime.sql.
--
-- This file MUST run AFTER enable_rls.sql: it builds on the helper functions
-- (app_user_id, is_registry_member) and tables created by the earlier files.
--
-- Everything here is idempotent (DROP ... IF EXISTS / CREATE OR REPLACE /
-- CREATE ... IF NOT EXISTS), so it is safe to re-run.
--
-- Fixes (audit numbering):
--   R1  drop registry_members self-insert policy (join flow is server-side)
--   R2  invitations_select scoped to registry members (was: any authed user)
--   R3  registry DELETE requires role='owner' (was: any member)
--   R4  transactions: INSERT requires creator_id = app_user_id();
--       UPDATE/DELETE blocked for exercise-locked (cortadas) transactions
--   R5  drop audit_log client INSERT policy (server-only writes)
--   R6  drop allowed_emails client SELECT policy (server-only table)
--   R7  per-table RLS re-asserted for transaction_payments,
--       transaction_balances, push_subscriptions (mirrors the blocks now
--       embedded in their add_*.sql migrations and enable_rls.sql)
--   R8  transaction_payments: pago and expense must belong to the SAME
--       registry (was: only pago's registry validated)
--   R10 BEFORE UPDATE trigger guards users.email / users.supabase_auth_id
--       against client-side changes
--   R11 registry_members.role CHECK constraint ('owner' | 'member')
--   R12 unique index on lower(users.email) — case-insensitive uniqueness
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (identical definitions to enable_rls.sql; re-asserted so
-- this file is self-contained).
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

-- ===========================================================================
-- R1 — registry_members: no client-side INSERT (BLOCKER)
-- ===========================================================================
-- The old registry_members_insert_self policy (WITH CHECK user_id =
-- app_user_id()) let any authenticated user join ANY registry. The join flow
-- runs server-side (superuser, bypasses RLS), so no client insert policy is
-- needed at all. Verified: no supabase-js table writes exist in islands/ or
-- routes/ — the only client Supabase usage is the Realtime subscription in
-- lib/realtime.ts plus auth calls in AuthForm/ForgotPassword/ResetPassword.
DROP POLICY IF EXISTS registry_members_insert_self ON registry_members;

-- ===========================================================================
-- R2 — invitations: SELECT scoped to registry members (BLOCKER)
-- ===========================================================================
-- The old policy (USING auth.uid() IS NOT NULL) exposed every invitation
-- code to any authenticated user. Code redemption is server-side, so
-- non-members need no read access.
DROP POLICY IF EXISTS invitations_select ON invitations;
CREATE POLICY invitations_select ON invitations
  FOR SELECT USING (is_registry_member(registry_id));

-- ===========================================================================
-- R3 — registries: DELETE restricted to owners (BLOCKER)
-- ===========================================================================
-- DELETE cascades wipe members, exercises, transactions, payments, balances
-- and invitations. The old policy allowed ANY member to delete a registry.
-- Decision: destructive operations are owner-only.
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
-- R4 — transactions: split FOR ALL into per-command policies
-- ===========================================================================
-- - INSERT additionally requires creator_id = app_user_id() (a client cannot
--   forge transactions in another member's name). user_paid is left alone —
--   it may be an entity id, not a users.id.
-- - UPDATE/DELETE are blocked for exercise-locked rows (exercise_id IS NOT
--   NULL): cutting an exercise ("cortar") is a server-side operation, and
--   settled transactions must be immutable from client roles.
DROP POLICY IF EXISTS "Users can read transactions of their registries" ON transactions;
DROP POLICY IF EXISTS "Users can insert transactions in their registries" ON transactions;
DROP POLICY IF EXISTS "Users can update transactions in their registries" ON transactions;
DROP POLICY IF EXISTS "Users can delete transactions in their registries" ON transactions;
DROP POLICY IF EXISTS transactions_member ON transactions;
DROP POLICY IF EXISTS transactions_select_member ON transactions;
DROP POLICY IF EXISTS transactions_insert_member ON transactions;
DROP POLICY IF EXISTS transactions_update_member ON transactions;
DROP POLICY IF EXISTS transactions_delete_member ON transactions;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions FORCE ROW LEVEL SECURITY;

CREATE POLICY transactions_select_member ON transactions
  FOR SELECT USING (is_registry_member(registry_id));

CREATE POLICY transactions_insert_member ON transactions
  FOR INSERT WITH CHECK (
    is_registry_member(registry_id)
    AND creator_id = app_user_id()
  );

CREATE POLICY transactions_update_member ON transactions
  FOR UPDATE
  USING (exercise_id IS NULL AND is_registry_member(registry_id))
  WITH CHECK (exercise_id IS NULL AND is_registry_member(registry_id));

CREATE POLICY transactions_delete_member ON transactions
  FOR DELETE
  USING (exercise_id IS NULL AND is_registry_member(registry_id));

-- ===========================================================================
-- R5 — audit_log: drop the client INSERT policy
-- ===========================================================================
-- WITH CHECK (auth.uid() IS NOT NULL) let any authenticated user forge audit
-- rows and served no client purpose. All audit writes are server-side
-- (superuser, bypasses RLS). No SELECT policy exists, so audit_log becomes
-- fully server-only.
DROP POLICY IF EXISTS audit_log_insert ON audit_log;

-- ===========================================================================
-- R6 — allowed_emails: drop the client SELECT policy
-- ===========================================================================
-- The allowlist is only consulted server-side (main.ts / lib/store.ts).
-- Exposing it to any authenticated user leaks which emails may register.
DROP POLICY IF EXISTS "Enable read access for all users" ON allowed_emails;
DROP POLICY IF EXISTS allowed_emails_select ON allowed_emails;

-- ===========================================================================
-- R7 + R8 — transaction_payments
-- ===========================================================================
-- R7: RLS block re-asserted here (also embedded in
--     add_transaction_payments.sql and enable_rls.sql — all three converge).
-- R8: WITH CHECK (and USING) now require the expense transaction to live in
--     the SAME registry as the pago transaction, not just membership of
--     pago's registry — closing the cross-registry payment-linking hole.
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
-- R7 — transaction_balances
-- ===========================================================================
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
-- R7 — push_subscriptions
-- ===========================================================================
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
-- R10 — users: guard email / supabase_auth_id against client-side changes
-- ===========================================================================
-- users_update_self lets a user UPDATE their own row, which included email
-- and supabase_auth_id (account-takeover / allowlist-bypass vector, since
-- access is gated on allowed_emails). This trigger forces both columns back
-- to their OLD values on client requests, while still allowing name/color
-- changes (main.ts updates users.name server-side and clients may edit their
-- own profile fields).
--
-- The guard only fires when a Supabase user JWT is present (auth.uid() IS
-- NOT NULL), i.e. PostgREST/Realtime client roles. The app server connects
-- directly as superuser WITHOUT JWT claims, so it stays able to sync email:
-- lib/store.ts createUserFromSupabase does
--   INSERT ... ON CONFLICT (supabase_auth_id) DO UPDATE SET email = $1, ...
-- An unconditional guard would silently break that server-side email sync.
-- Note: a service_role JWT carries no "sub" claim, so auth.uid() is NULL and
-- service_role updates are likewise unaffected (service_role bypasses RLS
-- anyway).
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

-- ===========================================================================
-- R11 — registry_members.role CHECK constraint
-- ===========================================================================
ALTER TABLE registry_members DROP CONSTRAINT IF EXISTS registry_members_role_check;
ALTER TABLE registry_members
  ADD CONSTRAINT registry_members_role_check CHECK (role IN ('owner', 'member'));

-- ===========================================================================
-- R12 — case-insensitive uniqueness of users.email
-- ===========================================================================
-- The existing users.email UNIQUE constraint (users_email_key) is
-- case-sensitive; this unique expression index additionally enforces
-- case-insensitive uniqueness. The old constraint is kept (redundant but
-- harmless — dropping it would break the ON CONFLICT (email) target if any
-- code used it, and FKs could reference it).
-- NOTE: this statement FAILS if the live table already contains emails that
-- differ only by case — check first with:
--   SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));
