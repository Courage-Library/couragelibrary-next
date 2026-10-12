-- =============================================================================
-- COURAGE LIBRARY — DRIFT-1d: MISTAKE LINEAGE BACKFILL + MAINTAIN REVOKE
-- Migration: 20261012000068_mistake_lineage_backfill_and_maintain_revoke.sql
--
-- a. user_mistake_occurrences.question_version_id ← attempt_answers.question_version_id
--    (via attempt_answer_id) where it is still NULL. Rows without attempt_answer_id stay NULL.
-- b. user_mistake_vault.topic_id ← questions.canonical_topic_id where topic_id is NULL;
--    subject_id ← topics.subject_id only where subject_id is NULL. No other column changes.
-- c. REVOKE MAINTAIN (PostgreSQL 17) on every public table from anon, authenticated, and for
--    future tables created by the migration owner role.
-- d. Nothing else. No exception swallowing: any trigger/CHECK error aborts the migration.
-- Idempotent.
-- =============================================================================

-- a. Occurrence → exact question version answered.
UPDATE public.user_mistake_occurrences o
SET question_version_id = aa.question_version_id
FROM public.attempt_answers aa
WHERE aa.id = o.attempt_answer_id
  AND o.question_version_id IS NULL
  AND o.attempt_answer_id IS NOT NULL
  AND aa.question_version_id IS NOT NULL;

-- b. Vault taxonomy from the canonical question.
UPDATE public.user_mistake_vault v
SET topic_id = q.canonical_topic_id,
    subject_id = COALESCE(v.subject_id, t.subject_id)
FROM public.questions q
LEFT JOIN public.topics t ON t.id = q.canonical_topic_id
WHERE q.id = v.question_id
  AND v.topic_id IS NULL
  AND q.canonical_topic_id IS NOT NULL;

-- c. MAINTAIN (VACUUM/ANALYZE/REINDEX/CLUSTER/REFRESH/LOCK) is not needed by app roles.
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
        EXECUTE format('REVOKE MAINTAIN ON TABLE public.%I FROM anon, authenticated', v_table.relname);
    END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE MAINTAIN ON TABLES FROM anon, authenticated;

-- End of 068.
