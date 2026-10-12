-- =============================================================================
-- COURAGE LIBRARY — DRIFT-1c: REVOKE UNUSED TABLE PRIVILEGES
-- Migration: 20261012000066_revoke_unused_table_privileges.sql
--
-- Supabase default privileges had granted anon/authenticated TRUNCATE, REFERENCES
-- and TRIGGER on (almost) every public table. None of these are needed by the app:
--   - TRUNCATE bypasses RLS entirely,
--   - REFERENCES lets a role create FKs against our tables,
--   - TRIGGER lets a role create triggers on our tables.
--
-- Scope (B1/B2):
--   * REVOKE TRUNCATE, REFERENCES, TRIGGER on every public table/partitioned table
--     from anon and authenticated.
--   * Default privileges for objects created by the migration owner role: same revoke.
--   * SELECT / INSERT / UPDATE / DELETE grants and all RLS policies are NOT changed.
-- Idempotent.
-- =============================================================================

DO $$
DECLARE
    v_table RECORD;
BEGIN
    FOR v_table IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
    LOOP
        EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM anon, authenticated', v_table.relname);
    END LOOP;
END $$;

-- Future tables created by the migration owner role (postgres) in schema public.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- End of 066.
