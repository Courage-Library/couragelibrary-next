-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 075 (gap2_3_taxonomy_fk_flips)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 075 ledger row
-- ROLLED_BACK. Re-creates every original projection FK from taxonomy_fk_flip_log.old_definition
-- (same names, same actions / deferrability), drops the node FKs, generated *_node_type columns,
-- indexes created by 075, the UNIQUE (id, node_type) and the log table.
-- PREREQUISITE (since GAP2-4a): roll back 080, 079 and 078 first. 078 adds
-- exam_syllabus_canonical_mappings_topic_fkey → canonical_taxonomy_nodes (id, node_type), which depends on that UNIQUE.
-- =============================================================================

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT * FROM public.taxonomy_fk_flip_log ORDER BY (table_name = 'canonical_taxonomy_nodes') DESC, table_name, column_name LOOP
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.table_name, r.old_constraint, r.old_definition);
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.new_constraint);
        EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I', r.table_name, r.column_name || '_node_type');
    END LOOP;
END $$;

DROP INDEX IF EXISTS public."ix_batch_curriculum_assignments_topic_id";
DROP INDEX IF EXISTS public."ix_daily_study_recommendations_topic_id";
DROP INDEX IF EXISTS public."ix_descriptive_questions_subject_id";
DROP INDEX IF EXISTS public."ix_descriptive_questions_topic_id";
DROP INDEX IF EXISTS public."ix_mock_sections_subject_id";
DROP INDEX IF EXISTS public."ix_questions_subtopic_id";
DROP INDEX IF EXISTS public."ix_quiz_battle_rooms_topic_id";
DROP INDEX IF EXISTS public."ix_search_indexes_subject_id";
DROP INDEX IF EXISTS public."ix_search_indexes_topic_id";
DROP INDEX IF EXISTS public."ix_spaced_repetition_schedules_topic_id";
DROP INDEX IF EXISTS public."ix_user_mastery_history_canonical_topic_id";
DROP INDEX IF EXISTS public."ix_user_mistake_drills_topic_id";
DROP INDEX IF EXISTS public."ix_user_mistake_vault_subject_id";
DROP INDEX IF EXISTS public."ix_user_mistake_vault_topic_id";

ALTER TABLE public.canonical_taxonomy_nodes DROP CONSTRAINT canonical_taxonomy_nodes_id_node_type_key;
DROP TABLE public.taxonomy_fk_flip_log;

NOTIFY pgrst, 'reload schema';

-- End of 075 rollback.
