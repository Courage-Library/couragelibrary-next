-- Rollback for 20261103000135_course_progress_per_lesson.sql (COURSE-UX-1). Only on an owner / architect instruction.
-- Restores the (user_id, document_id, language) key and the exact 122 fn_lesson_progress_save. The rows merged by 135
-- stay merged (one row per lesson is also unique per lesson and language; nothing is invented to split them).
-- Apply 137 and 136 rollbacks first when they are applied.
ALTER TABLE public.user_lesson_progress DROP CONSTRAINT user_lesson_progress_pkey;
ALTER TABLE public.user_lesson_progress ADD CONSTRAINT user_lesson_progress_pkey PRIMARY KEY (user_id, document_id, language);
COMMENT ON COLUMN public.user_lesson_progress.language IS NULL;
COMMENT ON TABLE public.user_lesson_progress IS 'CA-5: a student''s progress per lesson and language; own rows readable; written only by fn_lesson_progress_save (auth.uid()).';

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
    ON CONFLICT (user_id, document_id, language) DO UPDATE
       SET status        = CASE WHEN p.status = 'COMPLETED' THEN 'COMPLETED' ELSE EXCLUDED.status END,
           completed_at  = CASE WHEN p.status = 'COMPLETED' THEN p.completed_at ELSE EXCLUDED.completed_at END,
           last_block_id = coalesce(EXCLUDED.last_block_id, p.last_block_id),
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
