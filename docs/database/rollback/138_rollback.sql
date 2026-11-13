-- =====================================================================================================================
-- Rollback for 138 SYLLABUS-MAP-1 B1 (supabase/migrations/20261114000138_syllabus_map_b1.sql).
-- Removes everything 138 added; no pre-existing row or object changes. WARNING: rows written into
-- taxonomy_node_outlines / exam_selection_stages after the apply are deleted with their tables (take a backup first;
-- the audit rows in admin_audit_logs stay). Any choice_group values are dropped with the column.
-- Run inside ONE transaction (no BEGIN / COMMIT here); the ledger row is handled per MIGRATION_RUNBOOK.md.
-- =====================================================================================================================
DROP FUNCTION IF EXISTS public.fn_selection_stages_discard_draft(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_selection_stages_publish(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_selection_stages_save_draft(uuid, uuid, jsonb, text, date, uuid, text);
DROP TABLE IF EXISTS public.exam_selection_stages;

ALTER TABLE public.exam_syllabus_nodes DROP CONSTRAINT IF EXISTS chk_syllabus_node_choice_group;
ALTER TABLE public.exam_syllabus_nodes DROP COLUMN IF EXISTS choice_group;

DROP FUNCTION IF EXISTS public.fn_taxonomy_outline_set(uuid, text[], text, uuid, text);
DROP TABLE IF EXISTS public.taxonomy_node_outlines;
DROP FUNCTION IF EXISTS public.fn_outline_lines_valid(text[]);
