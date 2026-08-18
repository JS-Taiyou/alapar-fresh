-- ===========================================================================
-- drop_allowed_emails.sql — remove the registration allowlist
--
-- The app is public: signup is open to any authenticated Google account and
-- the code no longer reads allowed_emails (middleware, resolveUserState and
-- the /api/auth/check-email endpoint were removed alongside this migration).
--
-- RUN ORDER — timing matters:
--   Deploy the code FIRST, then run this file. The currently-deployed code
--   still JOINs allowed_emails on every authenticated request; dropping the
--   table before the new code is live would 500 the whole app. After the
--   deploy, nothing reads the table and the drop is safe.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

DROP TABLE IF EXISTS allowed_emails;
