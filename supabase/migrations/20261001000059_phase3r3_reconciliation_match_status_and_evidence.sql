-- ============================================================================
-- COURAGE LIBRARY — PHASE 3R.3 DATABASE MIGRATION
-- Reconciliation Engine: Match Status Extension & Evidence Metadata
-- ============================================================================
--
-- Implements:
-- 1. Updates exam_syllabus_canonical_mappings.match_status check constraint to include 'AMBIGUOUS'.
-- 2. Additive evidence columns:
--    - match_method (EXACT_CONTEXTUAL, NORMALIZED_EXACT, ALIAS_REGISTRY, CONTEXTUAL_CANDIDATE, TRIGRAM_SIMILARITY, UNMATCHED_GAP, MANUAL)
--    - candidate_matches (JSONB array of alternative canonical candidates for ambiguous/proposed nodes)
--    - reconciliation_metadata (JSONB for audit trail, depth comparison, and context pathing)
--
-- NON-DESTRUCTIVE INVARIANTS:
-- - Purely additive. Existing legacy rows and mappings remain untouched.
-- ============================================================================

-- 1. Extend match_status Check Constraint
-- ============================================================================
ALTER TABLE public.exam_syllabus_canonical_mappings
DROP CONSTRAINT IF EXISTS exam_syllabus_canonical_mappings_match_status_check;

ALTER TABLE public.exam_syllabus_canonical_mappings
ADD CONSTRAINT exam_syllabus_canonical_mappings_match_status_check
CHECK (
    match_status IN (
        'EXACT_MATCH',
        'ALIAS_MATCH',
        'PROPOSED_MATCH',
        'MANUALLY_MAPPED',
        'NEW_SUBJECT_GAP',
        'NEW_NODE_GAP',
        'AMBIGUOUS',
        'IGNORED'
    )
);

-- 2. Additive Evidence & Candidate Columns
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'exam_syllabus_canonical_mappings' 
          AND column_name = 'match_method'
    ) THEN
        ALTER TABLE public.exam_syllabus_canonical_mappings 
        ADD COLUMN match_method TEXT DEFAULT 'EXACT_CONTEXTUAL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'exam_syllabus_canonical_mappings' 
          AND column_name = 'candidate_matches'
    ) THEN
        ALTER TABLE public.exam_syllabus_canonical_mappings 
        ADD COLUMN candidate_matches JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'exam_syllabus_canonical_mappings' 
          AND column_name = 'reconciliation_metadata'
    ) THEN
        ALTER TABLE public.exam_syllabus_canonical_mappings 
        ADD COLUMN reconciliation_metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;
