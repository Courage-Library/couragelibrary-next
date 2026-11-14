-- =====================================================================================================================
-- Rollback for 139 SYLLABUS-MAP-1 B2 (supabase/migrations/20261115000139_syllabus_map_b2.sql).
-- Removes the staging tables and the fn_syllabus_map_* functions. What an import already WROTE stays (it is ordinary,
-- audited data, exactly as a v3 intake's): master nodes approved as new, aliases, outlines (taxonomy_node_outlines),
-- DRAFT syllabus versions and DRAFT selection stages — remove those through their own admin paths if needed.
-- WARNING: open reviews (syllabus_map_sessions / _items) are deleted with their tables; take a backup first.
-- Run inside ONE transaction (no BEGIN / COMMIT here); the ledger row is handled per MIGRATION_RUNBOOK.md.
-- =====================================================================================================================
-- ROLLBACK-CHAIN: run first: none
DROP FUNCTION IF EXISTS public.fn_syllabus_map_discard(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map_import(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map_set_weightage(uuid, text, numeric, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map_set_outline_action(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map_decide(uuid, text, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map_create(text, uuid, uuid, uuid, text, jsonb, text, jsonb, uuid, text);
DROP FUNCTION IF EXISTS public.fn_syllabus_map__outline_conflict(uuid, text[]);
DROP FUNCTION IF EXISTS public.fn_syllabus_map__node_ok(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fn_syllabus_map__audit(uuid, text, text, text, uuid, jsonb);
DROP TABLE IF EXISTS public.syllabus_map_items;
DROP TABLE IF EXISTS public.syllabus_map_sessions;
