-- ============================================================================
-- Courage Library — Phase 3R.4 Migration 60
-- Human Review & Taxonomy Resolution Workbench Foundation
-- ============================================================================

-- 1. Extend match_status Check Constraint to support 'REJECTED'
ALTER TABLE public.exam_syllabus_canonical_mappings
DROP CONSTRAINT IF EXISTS exam_syllabus_canonical_mappings_match_status_check;

ALTER TABLE public.exam_syllabus_canonical_mappings
ADD CONSTRAINT exam_syllabus_canonical_mappings_match_status_check
CHECK (match_status IN (
    'EXACT_MATCH',
    'ALIAS_MATCH',
    'PROPOSED_MATCH',
    'AMBIGUOUS',
    'MANUALLY_MAPPED',
    'NEW_SUBJECT_GAP',
    'NEW_NODE_GAP',
    'IGNORED',
    'REJECTED'
));

-- 2. Add performance indices for resolution and audit workflows
CREATE INDEX IF NOT EXISTS idx_syllabus_mappings_reviewed_by 
    ON public.exam_syllabus_canonical_mappings(reviewed_by);

CREATE INDEX IF NOT EXISTS idx_syllabus_mappings_reviewed_at 
    ON public.exam_syllabus_canonical_mappings(reviewed_at);

CREATE INDEX IF NOT EXISTS idx_syllabus_mappings_status 
    ON public.exam_syllabus_canonical_mappings(match_status);
