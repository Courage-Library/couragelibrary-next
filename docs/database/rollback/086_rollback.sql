-- =============================================================================
-- ROLLBACK for 20261016000086_syl_import1_import_draft.sql
--
-- 086 only CREATEs new functions (no table, column, policy, trigger or existing-function change), so the rollback
-- drops them. DRAFT versions already imported stay (they are ordinary DRAFT rows, source_kind IMPORT, editable and
-- deletable through the existing editor). Revert the SYL-IMPORT-1 commit together with this rollback (the
-- /admin/syllabus import action calls fn_syllabus_import_draft).
-- Order: 086 first (086 → 085 → 084 → 083 → 082 → …).
-- =============================================================================

DROP FUNCTION public.fn_syllabus_import_draft(uuid, jsonb);
DROP FUNCTION public.fn_syllabus__import_list(jsonb, text, text);
DROP FUNCTION public.fn_syllabus__import_check_node(jsonb, text, integer, text);
DROP FUNCTION public.fn_syllabus__import_count(jsonb, text, text);
DROP FUNCTION public.fn_syllabus__import_text(jsonb, text, text, integer, boolean);
DROP FUNCTION public.fn_syllabus__import_is_plain(text);
DROP FUNCTION public.fn_syllabus__import_fail(text, text, text);
