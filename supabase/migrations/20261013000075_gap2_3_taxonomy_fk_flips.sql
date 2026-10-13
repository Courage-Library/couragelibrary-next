-- =============================================================================
-- COURAGE LIBRARY — GAP2-3: TAXONOMY FOREIGN KEYS → canonical_taxonomy_nodes (decision #23)
-- Migration: 20261013000075_gap2_3_taxonomy_fk_flips.sql
--
-- Every public FK that referenced the projection tables (subjects / topics / subtopics) now references
-- canonical_taxonomy_nodes with node-type enforcement:
--   UNIQUE (id, node_type) on canonical_taxonomy_nodes;
--   per column: <col>_node_type text GENERATED ALWAYS AS ('<TYPE>') STORED +
--   FOREIGN KEY (<col>, <col>_node_type) → canonical_taxonomy_nodes (id, node_type)
--   ON DELETE RESTRICT ON UPDATE NO ACTION (MATCH SIMPLE: a NULL <col> stays allowed where nullable).
-- Added NOT VALID → VALIDATE → old FK dropped. No data rewrite (node id = projection id).
-- Projection tables, their triggers and guard are unchanged and stay as read-compat (later phase).
-- The 2 FKs in schema retired (retired.learning_resource_topics) are NOT flipped.
-- Audit: public.taxonomy_fk_flip_log (old constraint name + full old definition → new constraint).
-- No grant or policy change (the log table gets default privileges only; RLS enabled, no policies).
-- Rollback: docs/database/rollback/075_rollback.sql
--
-- Planned flips (33):
--   canonical_taxonomy_nodes.legacy_subject_id → SUBJECT (was canonical_taxonomy_nodes_legacy_subject_id_fkey → subjects; rows 40, non-null 4, NOT NULL false, index present)
--   canonical_taxonomy_nodes.legacy_subtopic_id → SUBTOPIC (was canonical_taxonomy_nodes_legacy_subtopic_id_fkey → subtopics; rows 40, non-null 0, NOT NULL false, index present)
--   canonical_taxonomy_nodes.legacy_topic_id → TOPIC (was canonical_taxonomy_nodes_legacy_topic_id_fkey → topics; rows 40, non-null 36, NOT NULL false, index present)
--   batch_curriculum_assignments.topic_id → TOPIC (was batch_curriculum_assignments_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   daily_study_recommendations.topic_id → TOPIC (was daily_study_recommendations_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   descriptive_questions.subject_id → SUBJECT (was descriptive_questions_subject_id_fkey → subjects; rows 0, non-null 0, NOT NULL false, index CREATED)
--   descriptive_questions.topic_id → TOPIC (was descriptive_questions_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   discussion_threads.topic_id → TOPIC (was discussion_threads_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index present)
--   exam_topics.topic_id → TOPIC (was exam_topics_topic_id_fkey → topics; rows 18, non-null 18, NOT NULL true, index present)
--   flashcard_decks.subject_id → SUBJECT (was flashcard_decks_subject_id_fkey → subjects; rows 0, non-null 0, NOT NULL false, index present)
--   flashcard_decks.topic_id → TOPIC (was flashcard_decks_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index present)
--   learning_activity_events.topic_id → TOPIC (was learning_activity_events_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index present)
--   learning_units.subtopic_id → SUBTOPIC (was learning_units_subtopic_id_fkey → subtopics; rows 1, non-null 0, NOT NULL false, index present)
--   learning_units.topic_id → TOPIC (was learning_units_topic_id_fkey → topics; rows 1, non-null 1, NOT NULL true, index present)
--   mock_sections.subject_id → SUBJECT (was mock_sections_subject_id_fkey → subjects; rows 14, non-null 14, NOT NULL true, index CREATED)
--   pattern_sections.subject_id → SUBJECT (was pattern_sections_subject_id_fkey → subjects; rows 4, non-null 4, NOT NULL true, index present)
--   question_import_batches.target_topic_id → TOPIC (was question_import_batches_target_topic_id_fkey → topics; rows 2, non-null 2, NOT NULL true, index present)
--   questions.canonical_topic_id → TOPIC (was questions_canonical_topic_id_fkey → topics; rows 113, non-null 113, NOT NULL true, index present)
--   questions.subtopic_id → SUBTOPIC (was questions_subtopic_id_fkey → subtopics; rows 113, non-null 0, NOT NULL false, index CREATED)
--   quiz_battle_rooms.topic_id → TOPIC (was quiz_battle_rooms_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   search_indexes.subject_id → SUBJECT (was search_indexes_subject_id_fkey → subjects; rows 1, non-null 0, NOT NULL false, index CREATED)
--   search_indexes.topic_id → TOPIC (was search_indexes_topic_id_fkey → topics; rows 1, non-null 0, NOT NULL false, index CREATED)
--   spaced_repetition_schedules.topic_id → TOPIC (was spaced_repetition_schedules_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   study_plan_items.topic_id → TOPIC (was study_plan_items_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index present)
--   subtopics.topic_id → TOPIC (was subtopics_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index present)
--   topic_relationships.from_topic_id → TOPIC (was topic_relationships_from_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index present)
--   topic_relationships.to_topic_id → TOPIC (was topic_relationships_to_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index present)
--   topics.subject_id → SUBJECT (was topics_subject_id_fkey → subjects; rows 36, non-null 36, NOT NULL true, index present)
--   user_mastery_history.canonical_topic_id → TOPIC (was user_mastery_history_canonical_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index CREATED)
--   user_mistake_drills.topic_id → TOPIC (was user_mistake_drills_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL false, index CREATED)
--   user_mistake_vault.subject_id → SUBJECT (was user_mistake_vault_subject_id_fkey → subjects; rows 12, non-null 12, NOT NULL false, index CREATED)
--   user_mistake_vault.topic_id → TOPIC (was user_mistake_vault_topic_id_fkey → topics; rows 12, non-null 12, NOT NULL false, index CREATED)
--   user_topic_mastery.canonical_topic_id → TOPIC (was user_topic_mastery_canonical_topic_id_fkey → topics; rows 0, non-null 0, NOT NULL true, index present)
-- =============================================================================

-- 0. Pre-flip row counts + data fingerprints of every touched table ------------------------------
CREATE TEMP TABLE gap2_3_before ON COMMIT DROP AS
SELECT 'batch_curriculum_assignments'::text AS t, (SELECT count(*)::bigint FROM public."batch_curriculum_assignments") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."batch_curriculum_assignments" x) AS h
UNION ALL
SELECT 'canonical_taxonomy_nodes'::text AS t, (SELECT count(*)::bigint FROM public."canonical_taxonomy_nodes") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."canonical_taxonomy_nodes" x) AS h
UNION ALL
SELECT 'daily_study_recommendations'::text AS t, (SELECT count(*)::bigint FROM public."daily_study_recommendations") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."daily_study_recommendations" x) AS h
UNION ALL
SELECT 'descriptive_questions'::text AS t, (SELECT count(*)::bigint FROM public."descriptive_questions") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."descriptive_questions" x) AS h
UNION ALL
SELECT 'discussion_threads'::text AS t, (SELECT count(*)::bigint FROM public."discussion_threads") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."discussion_threads" x) AS h
UNION ALL
SELECT 'exam_topics'::text AS t, (SELECT count(*)::bigint FROM public."exam_topics") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."exam_topics" x) AS h
UNION ALL
SELECT 'flashcard_decks'::text AS t, (SELECT count(*)::bigint FROM public."flashcard_decks") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."flashcard_decks" x) AS h
UNION ALL
SELECT 'learning_activity_events'::text AS t, (SELECT count(*)::bigint FROM public."learning_activity_events") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."learning_activity_events" x) AS h
UNION ALL
SELECT 'learning_units'::text AS t, (SELECT count(*)::bigint FROM public."learning_units") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."learning_units" x) AS h
UNION ALL
SELECT 'mock_sections'::text AS t, (SELECT count(*)::bigint FROM public."mock_sections") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."mock_sections" x) AS h
UNION ALL
SELECT 'pattern_sections'::text AS t, (SELECT count(*)::bigint FROM public."pattern_sections") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."pattern_sections" x) AS h
UNION ALL
SELECT 'question_import_batches'::text AS t, (SELECT count(*)::bigint FROM public."question_import_batches") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."question_import_batches" x) AS h
UNION ALL
SELECT 'questions'::text AS t, (SELECT count(*)::bigint FROM public."questions") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."questions" x) AS h
UNION ALL
SELECT 'quiz_battle_rooms'::text AS t, (SELECT count(*)::bigint FROM public."quiz_battle_rooms") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."quiz_battle_rooms" x) AS h
UNION ALL
SELECT 'search_indexes'::text AS t, (SELECT count(*)::bigint FROM public."search_indexes") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."search_indexes" x) AS h
UNION ALL
SELECT 'spaced_repetition_schedules'::text AS t, (SELECT count(*)::bigint FROM public."spaced_repetition_schedules") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."spaced_repetition_schedules" x) AS h
UNION ALL
SELECT 'study_plan_items'::text AS t, (SELECT count(*)::bigint FROM public."study_plan_items") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."study_plan_items" x) AS h
UNION ALL
SELECT 'subtopics'::text AS t, (SELECT count(*)::bigint FROM public."subtopics") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."subtopics" x) AS h
UNION ALL
SELECT 'topic_relationships'::text AS t, (SELECT count(*)::bigint FROM public."topic_relationships") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."topic_relationships" x) AS h
UNION ALL
SELECT 'topics'::text AS t, (SELECT count(*)::bigint FROM public."topics") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."topics" x) AS h
UNION ALL
SELECT 'user_mastery_history'::text AS t, (SELECT count(*)::bigint FROM public."user_mastery_history") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."user_mastery_history" x) AS h
UNION ALL
SELECT 'user_mistake_drills'::text AS t, (SELECT count(*)::bigint FROM public."user_mistake_drills") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."user_mistake_drills" x) AS h
UNION ALL
SELECT 'user_mistake_vault'::text AS t, (SELECT count(*)::bigint FROM public."user_mistake_vault") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."user_mistake_vault" x) AS h
UNION ALL
SELECT 'user_topic_mastery'::text AS t, (SELECT count(*)::bigint FROM public."user_topic_mastery") AS n, (SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM public."user_topic_mastery" x) AS h;

-- 1. Audit log ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.taxonomy_fk_flip_log (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name         text        NOT NULL,
    column_name        text        NOT NULL,
    old_constraint     text        NOT NULL,
    old_target         text        NOT NULL,
    old_definition     text        NOT NULL,
    new_constraint     text        NOT NULL,
    expected_node_type text        NOT NULL,
    flipped_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (table_name, column_name)
);
ALTER TABLE public.taxonomy_fk_flip_log ENABLE ROW LEVEL SECURITY;

-- 2. Composite FK target ---------------------------------------------------------------------------
ALTER TABLE public.canonical_taxonomy_nodes
    ADD CONSTRAINT canonical_taxonomy_nodes_id_node_type_key UNIQUE (id, node_type);

-- 3. Flips -----------------------------------------------------------------------------------------
-- canonical_taxonomy_nodes.legacy_subject_id → SUBJECT
ALTER TABLE public."canonical_taxonomy_nodes" ADD COLUMN "legacy_subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'canonical_taxonomy_nodes', 'legacy_subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'canonical_taxonomy_nodes_legacy_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'canonical_taxonomy_nodes_legacy_subject_id_fkey' AND con.conrelid = 'public."canonical_taxonomy_nodes"'::regclass;
ALTER TABLE public."canonical_taxonomy_nodes" ADD CONSTRAINT "canonical_taxonomy_nodes_legacy_subject_id_node_fkey"
    FOREIGN KEY ("legacy_subject_id", "legacy_subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."canonical_taxonomy_nodes" VALIDATE CONSTRAINT "canonical_taxonomy_nodes_legacy_subject_id_node_fkey";
ALTER TABLE public."canonical_taxonomy_nodes" DROP CONSTRAINT "canonical_taxonomy_nodes_legacy_subject_id_fkey";
-- index on legacy_subject_id already present

-- canonical_taxonomy_nodes.legacy_subtopic_id → SUBTOPIC
ALTER TABLE public."canonical_taxonomy_nodes" ADD COLUMN "legacy_subtopic_id_node_type" text GENERATED ALWAYS AS ('SUBTOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'canonical_taxonomy_nodes', 'legacy_subtopic_id', con.conname, 'subtopics', pg_get_constraintdef(con.oid), 'canonical_taxonomy_nodes_legacy_subtopic_id_node_fkey', 'SUBTOPIC'
FROM pg_constraint con WHERE con.conname = 'canonical_taxonomy_nodes_legacy_subtopic_id_fkey' AND con.conrelid = 'public."canonical_taxonomy_nodes"'::regclass;
ALTER TABLE public."canonical_taxonomy_nodes" ADD CONSTRAINT "canonical_taxonomy_nodes_legacy_subtopic_id_node_fkey"
    FOREIGN KEY ("legacy_subtopic_id", "legacy_subtopic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."canonical_taxonomy_nodes" VALIDATE CONSTRAINT "canonical_taxonomy_nodes_legacy_subtopic_id_node_fkey";
ALTER TABLE public."canonical_taxonomy_nodes" DROP CONSTRAINT "canonical_taxonomy_nodes_legacy_subtopic_id_fkey";
-- index on legacy_subtopic_id already present

-- canonical_taxonomy_nodes.legacy_topic_id → TOPIC
ALTER TABLE public."canonical_taxonomy_nodes" ADD COLUMN "legacy_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'canonical_taxonomy_nodes', 'legacy_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'canonical_taxonomy_nodes_legacy_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'canonical_taxonomy_nodes_legacy_topic_id_fkey' AND con.conrelid = 'public."canonical_taxonomy_nodes"'::regclass;
ALTER TABLE public."canonical_taxonomy_nodes" ADD CONSTRAINT "canonical_taxonomy_nodes_legacy_topic_id_node_fkey"
    FOREIGN KEY ("legacy_topic_id", "legacy_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."canonical_taxonomy_nodes" VALIDATE CONSTRAINT "canonical_taxonomy_nodes_legacy_topic_id_node_fkey";
ALTER TABLE public."canonical_taxonomy_nodes" DROP CONSTRAINT "canonical_taxonomy_nodes_legacy_topic_id_fkey";
-- index on legacy_topic_id already present

-- batch_curriculum_assignments.topic_id → TOPIC
ALTER TABLE public."batch_curriculum_assignments" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'batch_curriculum_assignments', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'batch_curriculum_assignments_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'batch_curriculum_assignments_topic_id_fkey' AND con.conrelid = 'public."batch_curriculum_assignments"'::regclass;
ALTER TABLE public."batch_curriculum_assignments" ADD CONSTRAINT "batch_curriculum_assignments_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."batch_curriculum_assignments" VALIDATE CONSTRAINT "batch_curriculum_assignments_topic_id_node_fkey";
ALTER TABLE public."batch_curriculum_assignments" DROP CONSTRAINT "batch_curriculum_assignments_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_batch_curriculum_assignments_topic_id" ON public."batch_curriculum_assignments" ("topic_id");

-- daily_study_recommendations.topic_id → TOPIC
ALTER TABLE public."daily_study_recommendations" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'daily_study_recommendations', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'daily_study_recommendations_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'daily_study_recommendations_topic_id_fkey' AND con.conrelid = 'public."daily_study_recommendations"'::regclass;
ALTER TABLE public."daily_study_recommendations" ADD CONSTRAINT "daily_study_recommendations_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."daily_study_recommendations" VALIDATE CONSTRAINT "daily_study_recommendations_topic_id_node_fkey";
ALTER TABLE public."daily_study_recommendations" DROP CONSTRAINT "daily_study_recommendations_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_daily_study_recommendations_topic_id" ON public."daily_study_recommendations" ("topic_id");

-- descriptive_questions.subject_id → SUBJECT
ALTER TABLE public."descriptive_questions" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'descriptive_questions', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'descriptive_questions_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'descriptive_questions_subject_id_fkey' AND con.conrelid = 'public."descriptive_questions"'::regclass;
ALTER TABLE public."descriptive_questions" ADD CONSTRAINT "descriptive_questions_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."descriptive_questions" VALIDATE CONSTRAINT "descriptive_questions_subject_id_node_fkey";
ALTER TABLE public."descriptive_questions" DROP CONSTRAINT "descriptive_questions_subject_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_descriptive_questions_subject_id" ON public."descriptive_questions" ("subject_id");

-- descriptive_questions.topic_id → TOPIC
ALTER TABLE public."descriptive_questions" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'descriptive_questions', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'descriptive_questions_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'descriptive_questions_topic_id_fkey' AND con.conrelid = 'public."descriptive_questions"'::regclass;
ALTER TABLE public."descriptive_questions" ADD CONSTRAINT "descriptive_questions_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."descriptive_questions" VALIDATE CONSTRAINT "descriptive_questions_topic_id_node_fkey";
ALTER TABLE public."descriptive_questions" DROP CONSTRAINT "descriptive_questions_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_descriptive_questions_topic_id" ON public."descriptive_questions" ("topic_id");

-- discussion_threads.topic_id → TOPIC
ALTER TABLE public."discussion_threads" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'discussion_threads', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'discussion_threads_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'discussion_threads_topic_id_fkey' AND con.conrelid = 'public."discussion_threads"'::regclass;
ALTER TABLE public."discussion_threads" ADD CONSTRAINT "discussion_threads_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."discussion_threads" VALIDATE CONSTRAINT "discussion_threads_topic_id_node_fkey";
ALTER TABLE public."discussion_threads" DROP CONSTRAINT "discussion_threads_topic_id_fkey";
-- index on topic_id already present

-- exam_topics.topic_id → TOPIC
ALTER TABLE public."exam_topics" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'exam_topics', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'exam_topics_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'exam_topics_topic_id_fkey' AND con.conrelid = 'public."exam_topics"'::regclass;
ALTER TABLE public."exam_topics" ADD CONSTRAINT "exam_topics_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."exam_topics" VALIDATE CONSTRAINT "exam_topics_topic_id_node_fkey";
ALTER TABLE public."exam_topics" DROP CONSTRAINT "exam_topics_topic_id_fkey";
-- index on topic_id already present

-- flashcard_decks.subject_id → SUBJECT
ALTER TABLE public."flashcard_decks" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'flashcard_decks', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'flashcard_decks_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'flashcard_decks_subject_id_fkey' AND con.conrelid = 'public."flashcard_decks"'::regclass;
ALTER TABLE public."flashcard_decks" ADD CONSTRAINT "flashcard_decks_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."flashcard_decks" VALIDATE CONSTRAINT "flashcard_decks_subject_id_node_fkey";
ALTER TABLE public."flashcard_decks" DROP CONSTRAINT "flashcard_decks_subject_id_fkey";
-- index on subject_id already present

-- flashcard_decks.topic_id → TOPIC
ALTER TABLE public."flashcard_decks" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'flashcard_decks', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'flashcard_decks_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'flashcard_decks_topic_id_fkey' AND con.conrelid = 'public."flashcard_decks"'::regclass;
ALTER TABLE public."flashcard_decks" ADD CONSTRAINT "flashcard_decks_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."flashcard_decks" VALIDATE CONSTRAINT "flashcard_decks_topic_id_node_fkey";
ALTER TABLE public."flashcard_decks" DROP CONSTRAINT "flashcard_decks_topic_id_fkey";
-- index on topic_id already present

-- learning_activity_events.topic_id → TOPIC
ALTER TABLE public."learning_activity_events" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'learning_activity_events', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'learning_activity_events_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'learning_activity_events_topic_id_fkey' AND con.conrelid = 'public."learning_activity_events"'::regclass;
ALTER TABLE public."learning_activity_events" ADD CONSTRAINT "learning_activity_events_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."learning_activity_events" VALIDATE CONSTRAINT "learning_activity_events_topic_id_node_fkey";
ALTER TABLE public."learning_activity_events" DROP CONSTRAINT "learning_activity_events_topic_id_fkey";
-- index on topic_id already present

-- learning_units.subtopic_id → SUBTOPIC
ALTER TABLE public."learning_units" ADD COLUMN "subtopic_id_node_type" text GENERATED ALWAYS AS ('SUBTOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'learning_units', 'subtopic_id', con.conname, 'subtopics', pg_get_constraintdef(con.oid), 'learning_units_subtopic_id_node_fkey', 'SUBTOPIC'
FROM pg_constraint con WHERE con.conname = 'learning_units_subtopic_id_fkey' AND con.conrelid = 'public."learning_units"'::regclass;
ALTER TABLE public."learning_units" ADD CONSTRAINT "learning_units_subtopic_id_node_fkey"
    FOREIGN KEY ("subtopic_id", "subtopic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."learning_units" VALIDATE CONSTRAINT "learning_units_subtopic_id_node_fkey";
ALTER TABLE public."learning_units" DROP CONSTRAINT "learning_units_subtopic_id_fkey";
-- index on subtopic_id already present

-- learning_units.topic_id → TOPIC
ALTER TABLE public."learning_units" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'learning_units', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'learning_units_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'learning_units_topic_id_fkey' AND con.conrelid = 'public."learning_units"'::regclass;
ALTER TABLE public."learning_units" ADD CONSTRAINT "learning_units_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."learning_units" VALIDATE CONSTRAINT "learning_units_topic_id_node_fkey";
ALTER TABLE public."learning_units" DROP CONSTRAINT "learning_units_topic_id_fkey";
-- index on topic_id already present

-- mock_sections.subject_id → SUBJECT
ALTER TABLE public."mock_sections" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'mock_sections', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'mock_sections_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'mock_sections_subject_id_fkey' AND con.conrelid = 'public."mock_sections"'::regclass;
ALTER TABLE public."mock_sections" ADD CONSTRAINT "mock_sections_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."mock_sections" VALIDATE CONSTRAINT "mock_sections_subject_id_node_fkey";
ALTER TABLE public."mock_sections" DROP CONSTRAINT "mock_sections_subject_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_mock_sections_subject_id" ON public."mock_sections" ("subject_id");

-- pattern_sections.subject_id → SUBJECT
ALTER TABLE public."pattern_sections" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'pattern_sections', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'pattern_sections_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'pattern_sections_subject_id_fkey' AND con.conrelid = 'public."pattern_sections"'::regclass;
ALTER TABLE public."pattern_sections" ADD CONSTRAINT "pattern_sections_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."pattern_sections" VALIDATE CONSTRAINT "pattern_sections_subject_id_node_fkey";
ALTER TABLE public."pattern_sections" DROP CONSTRAINT "pattern_sections_subject_id_fkey";
-- index on subject_id already present

-- question_import_batches.target_topic_id → TOPIC
ALTER TABLE public."question_import_batches" ADD COLUMN "target_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'question_import_batches', 'target_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'question_import_batches_target_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'question_import_batches_target_topic_id_fkey' AND con.conrelid = 'public."question_import_batches"'::regclass;
ALTER TABLE public."question_import_batches" ADD CONSTRAINT "question_import_batches_target_topic_id_node_fkey"
    FOREIGN KEY ("target_topic_id", "target_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."question_import_batches" VALIDATE CONSTRAINT "question_import_batches_target_topic_id_node_fkey";
ALTER TABLE public."question_import_batches" DROP CONSTRAINT "question_import_batches_target_topic_id_fkey";
-- index on target_topic_id already present

-- questions.canonical_topic_id → TOPIC
ALTER TABLE public."questions" ADD COLUMN "canonical_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'questions', 'canonical_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'questions_canonical_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'questions_canonical_topic_id_fkey' AND con.conrelid = 'public."questions"'::regclass;
ALTER TABLE public."questions" ADD CONSTRAINT "questions_canonical_topic_id_node_fkey"
    FOREIGN KEY ("canonical_topic_id", "canonical_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."questions" VALIDATE CONSTRAINT "questions_canonical_topic_id_node_fkey";
ALTER TABLE public."questions" DROP CONSTRAINT "questions_canonical_topic_id_fkey";
-- index on canonical_topic_id already present

-- questions.subtopic_id → SUBTOPIC
ALTER TABLE public."questions" ADD COLUMN "subtopic_id_node_type" text GENERATED ALWAYS AS ('SUBTOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'questions', 'subtopic_id', con.conname, 'subtopics', pg_get_constraintdef(con.oid), 'questions_subtopic_id_node_fkey', 'SUBTOPIC'
FROM pg_constraint con WHERE con.conname = 'questions_subtopic_id_fkey' AND con.conrelid = 'public."questions"'::regclass;
ALTER TABLE public."questions" ADD CONSTRAINT "questions_subtopic_id_node_fkey"
    FOREIGN KEY ("subtopic_id", "subtopic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."questions" VALIDATE CONSTRAINT "questions_subtopic_id_node_fkey";
ALTER TABLE public."questions" DROP CONSTRAINT "questions_subtopic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_questions_subtopic_id" ON public."questions" ("subtopic_id");

-- quiz_battle_rooms.topic_id → TOPIC
ALTER TABLE public."quiz_battle_rooms" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'quiz_battle_rooms', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'quiz_battle_rooms_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'quiz_battle_rooms_topic_id_fkey' AND con.conrelid = 'public."quiz_battle_rooms"'::regclass;
ALTER TABLE public."quiz_battle_rooms" ADD CONSTRAINT "quiz_battle_rooms_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."quiz_battle_rooms" VALIDATE CONSTRAINT "quiz_battle_rooms_topic_id_node_fkey";
ALTER TABLE public."quiz_battle_rooms" DROP CONSTRAINT "quiz_battle_rooms_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_quiz_battle_rooms_topic_id" ON public."quiz_battle_rooms" ("topic_id");

-- search_indexes.subject_id → SUBJECT
ALTER TABLE public."search_indexes" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'search_indexes', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'search_indexes_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'search_indexes_subject_id_fkey' AND con.conrelid = 'public."search_indexes"'::regclass;
ALTER TABLE public."search_indexes" ADD CONSTRAINT "search_indexes_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."search_indexes" VALIDATE CONSTRAINT "search_indexes_subject_id_node_fkey";
ALTER TABLE public."search_indexes" DROP CONSTRAINT "search_indexes_subject_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_search_indexes_subject_id" ON public."search_indexes" ("subject_id");

-- search_indexes.topic_id → TOPIC
ALTER TABLE public."search_indexes" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'search_indexes', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'search_indexes_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'search_indexes_topic_id_fkey' AND con.conrelid = 'public."search_indexes"'::regclass;
ALTER TABLE public."search_indexes" ADD CONSTRAINT "search_indexes_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."search_indexes" VALIDATE CONSTRAINT "search_indexes_topic_id_node_fkey";
ALTER TABLE public."search_indexes" DROP CONSTRAINT "search_indexes_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_search_indexes_topic_id" ON public."search_indexes" ("topic_id");

-- spaced_repetition_schedules.topic_id → TOPIC
ALTER TABLE public."spaced_repetition_schedules" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'spaced_repetition_schedules', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'spaced_repetition_schedules_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'spaced_repetition_schedules_topic_id_fkey' AND con.conrelid = 'public."spaced_repetition_schedules"'::regclass;
ALTER TABLE public."spaced_repetition_schedules" ADD CONSTRAINT "spaced_repetition_schedules_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."spaced_repetition_schedules" VALIDATE CONSTRAINT "spaced_repetition_schedules_topic_id_node_fkey";
ALTER TABLE public."spaced_repetition_schedules" DROP CONSTRAINT "spaced_repetition_schedules_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_spaced_repetition_schedules_topic_id" ON public."spaced_repetition_schedules" ("topic_id");

-- study_plan_items.topic_id → TOPIC
ALTER TABLE public."study_plan_items" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'study_plan_items', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'study_plan_items_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'study_plan_items_topic_id_fkey' AND con.conrelid = 'public."study_plan_items"'::regclass;
ALTER TABLE public."study_plan_items" ADD CONSTRAINT "study_plan_items_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."study_plan_items" VALIDATE CONSTRAINT "study_plan_items_topic_id_node_fkey";
ALTER TABLE public."study_plan_items" DROP CONSTRAINT "study_plan_items_topic_id_fkey";
-- index on topic_id already present

-- subtopics.topic_id → TOPIC
ALTER TABLE public."subtopics" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'subtopics', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'subtopics_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'subtopics_topic_id_fkey' AND con.conrelid = 'public."subtopics"'::regclass;
ALTER TABLE public."subtopics" ADD CONSTRAINT "subtopics_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."subtopics" VALIDATE CONSTRAINT "subtopics_topic_id_node_fkey";
ALTER TABLE public."subtopics" DROP CONSTRAINT "subtopics_topic_id_fkey";
-- index on topic_id already present

-- topic_relationships.from_topic_id → TOPIC
ALTER TABLE public."topic_relationships" ADD COLUMN "from_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'topic_relationships', 'from_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'topic_relationships_from_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'topic_relationships_from_topic_id_fkey' AND con.conrelid = 'public."topic_relationships"'::regclass;
ALTER TABLE public."topic_relationships" ADD CONSTRAINT "topic_relationships_from_topic_id_node_fkey"
    FOREIGN KEY ("from_topic_id", "from_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."topic_relationships" VALIDATE CONSTRAINT "topic_relationships_from_topic_id_node_fkey";
ALTER TABLE public."topic_relationships" DROP CONSTRAINT "topic_relationships_from_topic_id_fkey";
-- index on from_topic_id already present

-- topic_relationships.to_topic_id → TOPIC
ALTER TABLE public."topic_relationships" ADD COLUMN "to_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'topic_relationships', 'to_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'topic_relationships_to_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'topic_relationships_to_topic_id_fkey' AND con.conrelid = 'public."topic_relationships"'::regclass;
ALTER TABLE public."topic_relationships" ADD CONSTRAINT "topic_relationships_to_topic_id_node_fkey"
    FOREIGN KEY ("to_topic_id", "to_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."topic_relationships" VALIDATE CONSTRAINT "topic_relationships_to_topic_id_node_fkey";
ALTER TABLE public."topic_relationships" DROP CONSTRAINT "topic_relationships_to_topic_id_fkey";
-- index on to_topic_id already present

-- topics.subject_id → SUBJECT
ALTER TABLE public."topics" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'topics', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'topics_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'topics_subject_id_fkey' AND con.conrelid = 'public."topics"'::regclass;
ALTER TABLE public."topics" ADD CONSTRAINT "topics_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."topics" VALIDATE CONSTRAINT "topics_subject_id_node_fkey";
ALTER TABLE public."topics" DROP CONSTRAINT "topics_subject_id_fkey";
-- index on subject_id already present

-- user_mastery_history.canonical_topic_id → TOPIC
ALTER TABLE public."user_mastery_history" ADD COLUMN "canonical_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'user_mastery_history', 'canonical_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'user_mastery_history_canonical_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'user_mastery_history_canonical_topic_id_fkey' AND con.conrelid = 'public."user_mastery_history"'::regclass;
ALTER TABLE public."user_mastery_history" ADD CONSTRAINT "user_mastery_history_canonical_topic_id_node_fkey"
    FOREIGN KEY ("canonical_topic_id", "canonical_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."user_mastery_history" VALIDATE CONSTRAINT "user_mastery_history_canonical_topic_id_node_fkey";
ALTER TABLE public."user_mastery_history" DROP CONSTRAINT "user_mastery_history_canonical_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_user_mastery_history_canonical_topic_id" ON public."user_mastery_history" ("canonical_topic_id");

-- user_mistake_drills.topic_id → TOPIC
ALTER TABLE public."user_mistake_drills" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'user_mistake_drills', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'user_mistake_drills_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'user_mistake_drills_topic_id_fkey' AND con.conrelid = 'public."user_mistake_drills"'::regclass;
ALTER TABLE public."user_mistake_drills" ADD CONSTRAINT "user_mistake_drills_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."user_mistake_drills" VALIDATE CONSTRAINT "user_mistake_drills_topic_id_node_fkey";
ALTER TABLE public."user_mistake_drills" DROP CONSTRAINT "user_mistake_drills_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_user_mistake_drills_topic_id" ON public."user_mistake_drills" ("topic_id");

-- user_mistake_vault.subject_id → SUBJECT
ALTER TABLE public."user_mistake_vault" ADD COLUMN "subject_id_node_type" text GENERATED ALWAYS AS ('SUBJECT') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'user_mistake_vault', 'subject_id', con.conname, 'subjects', pg_get_constraintdef(con.oid), 'user_mistake_vault_subject_id_node_fkey', 'SUBJECT'
FROM pg_constraint con WHERE con.conname = 'user_mistake_vault_subject_id_fkey' AND con.conrelid = 'public."user_mistake_vault"'::regclass;
ALTER TABLE public."user_mistake_vault" ADD CONSTRAINT "user_mistake_vault_subject_id_node_fkey"
    FOREIGN KEY ("subject_id", "subject_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."user_mistake_vault" VALIDATE CONSTRAINT "user_mistake_vault_subject_id_node_fkey";
ALTER TABLE public."user_mistake_vault" DROP CONSTRAINT "user_mistake_vault_subject_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_user_mistake_vault_subject_id" ON public."user_mistake_vault" ("subject_id");

-- user_mistake_vault.topic_id → TOPIC
ALTER TABLE public."user_mistake_vault" ADD COLUMN "topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'user_mistake_vault', 'topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'user_mistake_vault_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'user_mistake_vault_topic_id_fkey' AND con.conrelid = 'public."user_mistake_vault"'::regclass;
ALTER TABLE public."user_mistake_vault" ADD CONSTRAINT "user_mistake_vault_topic_id_node_fkey"
    FOREIGN KEY ("topic_id", "topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."user_mistake_vault" VALIDATE CONSTRAINT "user_mistake_vault_topic_id_node_fkey";
ALTER TABLE public."user_mistake_vault" DROP CONSTRAINT "user_mistake_vault_topic_id_fkey";
CREATE INDEX IF NOT EXISTS "ix_user_mistake_vault_topic_id" ON public."user_mistake_vault" ("topic_id");

-- user_topic_mastery.canonical_topic_id → TOPIC
ALTER TABLE public."user_topic_mastery" ADD COLUMN "canonical_topic_id_node_type" text GENERATED ALWAYS AS ('TOPIC') STORED;
INSERT INTO public.taxonomy_fk_flip_log (table_name, column_name, old_constraint, old_target, old_definition, new_constraint, expected_node_type)
SELECT 'user_topic_mastery', 'canonical_topic_id', con.conname, 'topics', pg_get_constraintdef(con.oid), 'user_topic_mastery_canonical_topic_id_node_fkey', 'TOPIC'
FROM pg_constraint con WHERE con.conname = 'user_topic_mastery_canonical_topic_id_fkey' AND con.conrelid = 'public."user_topic_mastery"'::regclass;
ALTER TABLE public."user_topic_mastery" ADD CONSTRAINT "user_topic_mastery_canonical_topic_id_node_fkey"
    FOREIGN KEY ("canonical_topic_id", "canonical_topic_id_node_type") REFERENCES public.canonical_taxonomy_nodes (id, node_type)
    ON DELETE RESTRICT ON UPDATE NO ACTION NOT VALID;
ALTER TABLE public."user_topic_mastery" VALIDATE CONSTRAINT "user_topic_mastery_canonical_topic_id_node_fkey";
ALTER TABLE public."user_topic_mastery" DROP CONSTRAINT "user_topic_mastery_canonical_topic_id_fkey";
-- index on canonical_topic_id already present

-- 4. Proof -----------------------------------------------------------------------------------------
DO $$
DECLARE
    v_bad text;
    r record;
    v_cols text;
    v_n bigint;
    v_h text;
BEGIN
    SELECT string_agg(cl.relname || '.' || con.conname, ', ') INTO v_bad
    FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid JOIN pg_class t ON t.oid = con.confrelid
    WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
      AND t.relnamespace = 'public'::regnamespace AND t.relname IN ('subjects', 'topics', 'subtopics');
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'GAP2_3_PROOF: FKs still reference the projection: %', v_bad;
    END IF;

    IF (SELECT count(*) FROM public.taxonomy_fk_flip_log) <> 33 THEN
        RAISE EXCEPTION 'GAP2_3_PROOF: flip log has % rows, expected 33', (SELECT count(*) FROM public.taxonomy_fk_flip_log);
    END IF;

    SELECT string_agg(l.table_name || '.' || l.column_name, ', ') INTO v_bad
    FROM public.taxonomy_fk_flip_log l
    LEFT JOIN pg_constraint con ON con.conname = l.new_constraint AND con.conrelid = ('public.' || quote_ident(l.table_name))::regclass
    WHERE con.oid IS NULL OR NOT con.convalidated OR con.confdeltype <> 'r' OR con.confupdtype <> 'a'
       OR con.confrelid <> 'public.canonical_taxonomy_nodes'::regclass;
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'GAP2_3_PROOF: missing / unvalidated / wrong-action node FK: %', v_bad;
    END IF;

    -- data unchanged (generated *_node_type columns excluded)
    FOR r IN SELECT * FROM pg_temp.gap2_3_before LOOP
        SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO v_cols
        FROM information_schema.columns WHERE table_schema = 'public' AND table_name = r.t AND column_name !~ '_node_type$';
        EXECUTE format('SELECT count(*), md5(coalesce(string_agg(x::text, ''|'' ORDER BY x::text), '''')) FROM (SELECT %s FROM public.%I) x', v_cols, r.t)
            INTO v_n, v_h;
        IF v_n <> r.n OR v_h <> r.h THEN
            RAISE EXCEPTION 'GAP2_3_PROOF: data changed in %', r.t;
        END IF;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- End of 075.
