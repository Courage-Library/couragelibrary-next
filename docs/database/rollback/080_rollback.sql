-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 080 (gap2_4a_syllabus_seed_drafts)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 080 ledger row ROLLED_BACK.
-- Removes the two seeded DRAFT versions (nodes and mappings cascade) and the seed functions. Refuses if either
-- version is no longer DRAFT (the immutability trigger would also refuse). Audit rows are kept (history).
-- =============================================================================
BEGIN;
DELETE FROM public.exam_syllabus_versions v
 USING public.exams e
 WHERE e.id = v.exam_id AND v.status = 'DRAFT'
   AND ((e.slug = 'ssc-gd' AND v.version_tag LIKE 'legacy-official-%' AND v.source_kind = 'LEGACY_MIGRATION')
     OR (e.slug = 'ssc-cgl' AND v.version_tag LIKE 'pattern-skeleton-%' AND v.metadata ->> 'seeded_by' = 'migration 080'));
DROP FUNCTION IF EXISTS public.fn_syllabus_seed_legacy_gd_draft();
DROP FUNCTION IF EXISTS public.fn_syllabus_seed_cgl_pattern_skeleton();
COMMIT;
