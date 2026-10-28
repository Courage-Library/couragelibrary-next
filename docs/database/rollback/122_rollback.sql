-- Rollback for 20261028000122_ca7_launch_notes_internal.sql. Run as ONE transaction by the operator.
-- Restores the exact 120 bodies of fn_servable_node_lessons and fn_lesson_progress_save, then drops what 122 added.
-- Data loss: launches, exam notes, the INTERNAL / test-content flags and the view-event keys go with it (export first).
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_servable_node_lessons()
RETURNS TABLE (document_id uuid, canonical_slug text, node_id uuid, node_type text, topic_id uuid, chapter_position integer,
               published_at timestamptz, hi_current boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    WITH RECURSIVE
    docs AS (
        SELECT d.id, d.canonical_slug::text AS slug, d.node_id, dv.published_at
          FROM public.learning_documents d
          JOIN public.document_versions dv ON dv.id = d.current_published_version_id
         WHERE d.document_type = 'NODE_LESSON' AND d.status = 'PUBLISHED' AND d.node_id IS NOT NULL
           AND dv.is_published AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'),
    -- every active TOPIC and its active descendants, with a master-order key (pre-order: display order, name, id)
    tree AS (
        SELECT n.id, n.id AS topic_id, n.node_type,
               lpad(n.display_order::text, 6, '0') || '~' || regexp_replace(lower(n.name), '[^a-z0-9 ]', '', 'g') || '~' || n.id::text AS k,
               0 AS depth
          FROM public.canonical_taxonomy_nodes n
         WHERE n.node_type = 'TOPIC' AND n.is_active
        UNION ALL
        SELECT c.id, t.topic_id, c.node_type,
               t.k || '/' || lpad(c.display_order::text, 6, '0') || '~' || regexp_replace(lower(c.name), '[^a-z0-9 ]', '', 'g') || '~' || c.id::text,
               t.depth + 1
          FROM public.canonical_taxonomy_nodes c
          JOIN tree t ON c.parent_id = t.id
         WHERE c.is_active AND t.depth < 3)
    SELECT d.id, d.slug, d.node_id, tr.node_type, tr.topic_id,
           (row_number() OVER (PARTITION BY tr.topic_id ORDER BY tr.k COLLATE "C"))::integer,
           d.published_at,
           EXISTS (SELECT 1 FROM public.document_versions h
                    WHERE h.document_id = d.id AND h.language = 'hi' AND h.is_current AND h.is_published)
      FROM docs d
      JOIN tree tr ON tr.id = d.node_id
$fn$;
COMMENT ON FUNCTION public.fn_servable_node_lessons() IS 'CA-5: servable node lessons with their master chapter (TOPIC) and position in master order; the one source for counts, courses and access.';

CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user uuid := auth.uid();
    v_node uuid;
    v_row  public.user_lesson_progress%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'PROGRESS: sign in to save progress' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'PROGRESS: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('READING', 'COMPLETED') THEN RAISE EXCEPTION 'PROGRESS: status must be READING or COMPLETED' USING ERRCODE = '22023'; END IF;
    IF p_last_block_id IS NOT NULL AND p_last_block_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
        RAISE EXCEPTION 'PROGRESS: invalid block id' USING ERRCODE = '22023';
    END IF;
    SELECT d.node_id INTO v_node
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
    RETURN jsonb_build_object('document_id', v_row.document_id, 'language', v_row.language, 'status', v_row.status,
                              'last_block_id', v_row.last_block_id, 'completed_at', v_row.completed_at);
END
$fn$;

DROP FUNCTION public.fn_live_course_document_ids();
DROP FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text);
DROP FUNCTION public.fn_exam_note_publish(uuid, uuid, text);
DROP FUNCTION public.fn_exam_note_save_draft(uuid, uuid, text, jsonb, jsonb, uuid, text);
DROP TABLE public.exam_node_notes;
DROP FUNCTION public.fn_exam_node_note_guard();
DROP TABLE public.exam_course_launches;
DROP INDEX public.uq_learning_activity_events_idempotency;
ALTER TABLE public.learning_activity_events DROP COLUMN idempotency_key;
REVOKE SELECT (is_test_content) ON public.learning_documents FROM anon, authenticated;
ALTER TABLE public.learning_documents DROP COLUMN is_test_content;
ALTER TABLE public.canonical_taxonomy_nodes DROP COLUMN is_internal;

COMMIT;
