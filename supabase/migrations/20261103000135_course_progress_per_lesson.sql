-- =====================================================================================================================
-- 135 COURSE-UX-1 — ONE progress record per lesson, whatever the language (owner answer 6, 2026-11-03).
-- Fixes the Hindi bug: the course read progress in the preferred language while the reader saved it under the language
-- shown, so a Hindi-preference student never saw progress. user_lesson_progress.language now means "the language last
-- read"; the key becomes (user_id, document_id).
--   1. existing rows are MERGED per (user, lesson): COMPLETED wins (earliest completed_at), earliest started_at, the
--      last block + language of the most recently updated row, the newest updated_at; the other rows are deleted
--   2. primary key (user_id, document_id, language) → (user_id, document_id)
--   3. fn_lesson_progress_save (same signature, SECURITY DEFINER, search_path '', grants kept): upserts on the new key
--      and records the language read; otherwise the 122 body unchanged (ARTICLE_VIEWED stays per language and day)
-- Backward-compatible with the code in production (same RPC signature and result; the old readers filter by language
-- and simply see the merged row under its last language). SECURITY DEFINER count unchanged.
-- Rollback: docs/database/rollback/135_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261028000122_ca7_launch_notes_internal.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PREFLIGHT: 122 is not applied';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_lesson_progress_pkey'
                    AND pg_get_constraintdef(oid) = 'PRIMARY KEY (user_id, document_id, language)') THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PREFLIGHT: user_lesson_progress key is not (user_id, document_id, language)';
    END IF;
END
$pre$;

-- 1. merge (one row per user and lesson)
CREATE TEMP TABLE _clp_merged ON COMMIT DROP AS
SELECT user_id, document_id,
       (array_agg(language ORDER BY updated_at DESC, language))[1]                                  AS language,
       (array_agg(node_id ORDER BY updated_at DESC, language))[1]                                   AS node_id,
       CASE WHEN bool_or(status = 'COMPLETED') THEN 'COMPLETED'
            WHEN bool_or(status = 'READING') THEN 'READING' ELSE 'NOT_STARTED' END                  AS status,
       (array_agg(last_block_id ORDER BY updated_at DESC, language) FILTER (WHERE last_block_id IS NOT NULL))[1] AS last_block_id,
       min(started_at)                                                                               AS started_at,
       min(completed_at)                                                                             AS completed_at,
       max(updated_at)                                                                               AS updated_at,
       count(*)                                                                                      AS n
  FROM public.user_lesson_progress
 GROUP BY user_id, document_id
HAVING count(*) > 1;

DELETE FROM public.user_lesson_progress p USING _clp_merged m WHERE p.user_id = m.user_id AND p.document_id = m.document_id;
INSERT INTO public.user_lesson_progress (user_id, document_id, language, node_id, status, last_block_id, started_at, completed_at, updated_at)
SELECT user_id, document_id, language, node_id, status, last_block_id, started_at, completed_at, updated_at FROM _clp_merged;

-- 2. the new key
ALTER TABLE public.user_lesson_progress DROP CONSTRAINT user_lesson_progress_pkey;
ALTER TABLE public.user_lesson_progress ADD CONSTRAINT user_lesson_progress_pkey PRIMARY KEY (user_id, document_id);
COMMENT ON COLUMN public.user_lesson_progress.language IS 'COURSE-UX-1 (135): the language the lesson was last read in; progress is one record per lesson.';
COMMENT ON TABLE public.user_lesson_progress IS 'CA-5 / COURSE-UX-1: a student''s progress per lesson (one record, any language); own rows readable; written only by SECURITY DEFINER RPCs (auth.uid()).';

-- 3. the progress RPC on the new key (122 body; only the conflict target and the language update differ)
CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user  uuid := auth.uid();
    v_node  uuid;
    v_slug  text;
    v_topic uuid;
    v_row   public.user_lesson_progress%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'PROGRESS: sign in to save progress' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'PROGRESS: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('READING', 'COMPLETED') THEN RAISE EXCEPTION 'PROGRESS: status must be READING or COMPLETED' USING ERRCODE = '22023'; END IF;
    IF p_last_block_id IS NOT NULL AND p_last_block_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
        RAISE EXCEPTION 'PROGRESS: invalid block id' USING ERRCODE = '22023';
    END IF;
    SELECT d.node_id, d.canonical_slug INTO v_node, v_slug
      FROM public.learning_documents d
      JOIN public.document_versions dv ON dv.id = d.current_published_version_id
     WHERE d.id = p_document_id AND d.status = 'PUBLISHED' AND dv.is_published AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS';
    IF NOT FOUND THEN RAISE EXCEPTION 'PROGRESS: lesson not found' USING ERRCODE = 'P0002'; END IF;

    INSERT INTO public.user_lesson_progress AS p (user_id, document_id, language, node_id, status, last_block_id, completed_at)
    VALUES (v_user, p_document_id, p_language, v_node, p_status, p_last_block_id, CASE WHEN p_status = 'COMPLETED' THEN now() END)
    ON CONFLICT (user_id, document_id) DO UPDATE
       SET status        = CASE WHEN p.status = 'COMPLETED' THEN 'COMPLETED' ELSE EXCLUDED.status END,
           completed_at  = CASE WHEN p.status = 'COMPLETED' THEN p.completed_at ELSE EXCLUDED.completed_at END,
           last_block_id = coalesce(EXCLUDED.last_block_id, p.last_block_id),
           language      = EXCLUDED.language,
           node_id       = EXCLUDED.node_id,
           updated_at    = now()
    RETURNING * INTO v_row;

    -- CA-7: ONE ARTICLE_VIEWED per user, lesson, language and UTC day (analytics); the event's topic = the lesson's TOPIC
    SELECT CASE WHEN n.node_type = 'TOPIC' THEN n.id WHEN pn.node_type = 'TOPIC' THEN pn.id ELSE gn.id END INTO v_topic
      FROM public.canonical_taxonomy_nodes n
      LEFT JOIN public.canonical_taxonomy_nodes pn ON pn.id = n.parent_id
      LEFT JOIN public.canonical_taxonomy_nodes gn ON gn.id = pn.parent_id AND gn.node_type = 'TOPIC'
     WHERE n.id = v_node;
    IF v_topic IS NOT NULL THEN
        -- topic_id_node_type is GENERATED ('TOPIC'); the composite FK then requires v_topic to be a TOPIC node
        INSERT INTO public.learning_activity_events (user_id, topic_id, resource_slug, event_type, metadata, idempotency_key)
        VALUES (v_user, v_topic, v_slug, 'ARTICLE_VIEWED', jsonb_build_object('document_id', p_document_id, 'language', p_language),
                'article_viewed:' || v_user::text || ':' || p_document_id::text || ':' || p_language || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'))
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN jsonb_build_object('document_id', v_row.document_id, 'language', v_row.language, 'status', v_row.status,
                              'last_block_id', v_row.last_block_id, 'completed_at', v_row.completed_at);
END
$fn$;
-- CREATE OR REPLACE keeps the 120 grants (authenticated + service_role)

-- proof
DO $proof$
BEGIN
    IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'user_lesson_progress_pkey')) <> 'PRIMARY KEY (user_id, document_id)' THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PROOF: key not (user_id, document_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_lesson_progress GROUP BY user_id, document_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PROOF: duplicate progress rows remain';
    END IF;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_lesson_progress_save(uuid, text, text, text)'::regprocedure)
       OR has_function_privilege('anon', 'public.fn_lesson_progress_save(uuid, text, text, text)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.fn_lesson_progress_save(uuid, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PROOF: progress RPC grants changed';
    END IF;
    IF has_table_privilege('authenticated', 'public.user_lesson_progress', 'INSERT') OR has_table_privilege('authenticated', 'public.user_lesson_progress', 'UPDATE')
       OR has_table_privilege('anon', 'public.user_lesson_progress', 'SELECT') THEN
        RAISE EXCEPTION 'COURSE_UX_1_135_PROOF: progress table client grants widened';
    END IF;
END
$proof$;
