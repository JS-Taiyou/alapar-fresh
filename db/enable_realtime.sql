-- ===========================================================================
-- enable_realtime.sql — codify which tables Supabase Realtime publishes.
--
-- Run order: LAST in the migration chain, after tighten_rls.sql:
--   schema.sql → add_*.sql → enable_rls.sql → tighten_rls.sql → THIS file.
--
-- Only `transactions` is published: it is the single table the client
-- subscribes to (lib/realtime.ts, postgres_changes on table "transactions").
-- The transactions RLS policies (enable_rls.sql / tighten_rls.sql) gate what
-- each subscriber receives, so membership is enforced by the database.
--
-- MANUAL CHECK for the live project — list everything currently published:
--   SELECT schemaname, tablename
--   FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime';
-- If anything beyond `transactions` shows up, unpublish it:
--   ALTER PUBLICATION supabase_realtime DROP TABLE <schema>.<table>;
-- ===========================================================================

-- Idempotent: ALTER PUBLICATION ... ADD TABLE errors with duplicate_object
-- (SQLSTATE 42710) if the table is already a member, so swallow that one case.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
