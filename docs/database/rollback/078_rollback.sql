-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 078 (gap2_4a_syllabus_schema)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 078 ledger row ROLLED_BACK.
-- Roll back 080 and 079 first. Requires the three syllabus tables to hold no rows created after 078 that the
-- old shape cannot represent (PUBLISHED-audit columns, many mappings per node); it deletes all versions first
-- (DRAFT only — PUBLISHED / ARCHIVED rows must be archived-and-exported by hand before a rollback).
-- =============================================================================
BEGIN;
DROP TRIGGER IF EXISTS trg_guard_exam_syllabus_mappings_draft_only ON public.exam_syllabus_canonical_mappings;
DROP TRIGGER IF EXISTS trg_guard_exam_syllabus_nodes_draft_only ON public.exam_syllabus_nodes;
DROP TRIGGER IF EXISTS trg_guard_exam_syllabus_version_lifecycle ON public.exam_syllabus_versions;
DROP TRIGGER IF EXISTS trg_guard_exam_syllabus_node_same_version ON public.exam_syllabus_nodes;
DELETE FROM public.exam_syllabus_versions WHERE status = 'DRAFT';
DROP FUNCTION IF EXISTS public.fn_guard_exam_syllabus_content_draft_only();
DROP FUNCTION IF EXISTS public.fn_guard_exam_syllabus_version_lifecycle();
DROP FUNCTION IF EXISTS public.fn_guard_exam_syllabus_node_same_version();
ALTER FUNCTION public.fn_derive_exam_syllabus_node_depth() RESET search_path;
ALTER FUNCTION public.fn_guard_exam_syllabus_node_cycles() RESET search_path;
ALTER FUNCTION public.fn_cascade_exam_syllabus_node_descendants() RESET search_path;

-- mappings
DROP INDEX IF EXISTS public.idx_syllabus_mappings_node;
DROP INDEX IF EXISTS public.uq_syllabus_node_topic;
ALTER TABLE public.exam_syllabus_canonical_mappings DROP CONSTRAINT IF EXISTS exam_syllabus_canonical_mappings_topic_fkey;
ALTER TABLE public.exam_syllabus_canonical_mappings
  ADD CONSTRAINT exam_syllabus_canonical_mappings_canonical_node_id_fkey
  FOREIGN KEY (canonical_node_id) REFERENCES public.canonical_taxonomy_nodes(id) ON DELETE RESTRICT;
ALTER TABLE public.exam_syllabus_canonical_mappings DROP COLUMN IF EXISTS mapping_weight, DROP COLUMN IF EXISTS canonical_node_type;
ALTER TABLE public.exam_syllabus_canonical_mappings ADD CONSTRAINT uq_exam_syllabus_canonical_mapping_node UNIQUE (syllabus_node_id);

-- nodes
ALTER TABLE public.exam_syllabus_nodes DROP CONSTRAINT IF EXISTS chk_syllabus_node_expected_range;
ALTER TABLE public.exam_syllabus_nodes
  DROP COLUMN IF EXISTS node_kind, DROP COLUMN IF EXISTS description,
  ALTER COLUMN expected_questions_min SET DEFAULT 0, ALTER COLUMN expected_questions_max SET DEFAULT 0;

-- versions
DROP INDEX IF EXISTS public.idx_syllabus_versions_published_by;
DROP INDEX IF EXISTS public.idx_syllabus_versions_created_by;
DROP INDEX IF EXISTS public.idx_syllabus_versions_supersedes;
DROP INDEX IF EXISTS public.uq_exam_syllabus_one_published;
DROP INDEX IF EXISTS public.uq_exam_syllabus_version_number;
ALTER TABLE public.exam_syllabus_versions DROP CONSTRAINT IF EXISTS chk_syllabus_archived_has_time;
ALTER TABLE public.exam_syllabus_versions DROP CONSTRAINT IF EXISTS chk_syllabus_published_has_audit;
ALTER TABLE public.exam_syllabus_versions DROP CONSTRAINT exam_syllabus_versions_status_check;
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT exam_syllabus_versions_status_check
  CHECK (status IN ('DRAFT', 'RECONCILED', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE public.exam_syllabus_versions
  DROP COLUMN IF EXISTS archived_at, DROP COLUMN IF EXISTS published_by, DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS created_by, DROP COLUMN IF EXISTS source_kind, DROP COLUMN IF EXISTS supersedes_version_id,
  DROP COLUMN IF EXISTS version_number;
UPDATE public.exam_syllabus_versions SET raw_payload_hash = '' WHERE raw_payload_hash IS NULL;
ALTER TABLE public.exam_syllabus_versions ALTER COLUMN raw_payload_hash SET NOT NULL;
COMMIT;
