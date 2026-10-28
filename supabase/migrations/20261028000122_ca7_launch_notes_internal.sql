-- =====================================================================================================================
-- 122 CA-7 — per-exam launch, exam notes, INTERNAL master-tree nodes, QA test content, lesson view events.
-- CONDITIONAL GO rules + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/122_rollback.sql. No BEGIN / COMMIT.
--   canonical_taxonomy_nodes.is_internal — the legacy "<Subject> General Topics" catch-alls: still mappable for questions,
--     never a lesson node, never in a course, the coverage matrix, /learn, exam-topic pages, the sitemap or JSON-LD
--   learning_documents.is_test_content — QA fixtures: servable (the perf gate reads one) but never indexed
--   fn_servable_node_lessons — same signature; an INTERNAL node (and its subtree) is never servable
--   exam_course_launches — the explicit, audited owner action (LIVE / PAUSED, coverage snapshot); public reads only see
--     LIVE rows (exam, cycle, status); fn_exam_course_launch_set (service_role, audited)
--   fn_live_course_document_ids — the lessons inside a LIVE exam course (gating applies only there, design F/H)
--   exam_node_notes — per exam × node × language, versioned lesson blocks (the lesson validator), one DRAFT + one
--     PUBLISHED; a non-DRAFT body is frozen; public reads see PUBLISHED; save / publish RPCs (service_role, audited)
--   learning_activity_events.idempotency_key — + fn_lesson_progress_save records ONE ARTICLE_VIEWED per user, lesson,
--     language and UTC day (same signature, same SECURITY DEFINER auth.uid() rules; no new SECDEF function)
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261028000121_lesson_prompt_2.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'CA7_PREFLIGHT: 121 is not applied';
    END IF;
END
$pre$;

-- ------------------------------------------------------------------ flags
ALTER TABLE public.canonical_taxonomy_nodes ADD COLUMN is_internal boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.canonical_taxonomy_nodes.is_internal IS 'CA-7: an internal node (legacy catch-all) — usable for question mapping, never a lesson / course / public page / sitemap node.';
ALTER TABLE public.learning_documents ADD COLUMN is_test_content boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.learning_documents.is_test_content IS 'CA-7 SEO-HYGIENE-1: QA / test content — served, never indexed (noindex, not in the sitemap).';
-- the client roles read learning_documents through column grants: the public sitemap reads this flag (not sensitive)
GRANT SELECT (is_test_content) ON public.learning_documents TO anon, authenticated;

-- ------------------------------------------------------------------ servable node lessons: INTERNAL excluded (same signature)
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
    -- every active, non-internal TOPIC and its active, non-internal descendants, with a master-order key (pre-order)
    tree AS (
        SELECT n.id, n.id AS topic_id, n.node_type,
               lpad(n.display_order::text, 6, '0') || '~' || regexp_replace(lower(n.name), '[^a-z0-9 ]', '', 'g') || '~' || n.id::text AS k,
               0 AS depth
          FROM public.canonical_taxonomy_nodes n
         WHERE n.node_type = 'TOPIC' AND n.is_active AND NOT n.is_internal
        UNION ALL
        SELECT c.id, t.topic_id, c.node_type,
               t.k || '/' || lpad(c.display_order::text, 6, '0') || '~' || regexp_replace(lower(c.name), '[^a-z0-9 ]', '', 'g') || '~' || c.id::text,
               t.depth + 1
          FROM public.canonical_taxonomy_nodes c
          JOIN tree t ON c.parent_id = t.id
         WHERE c.is_active AND NOT c.is_internal AND t.depth < 3)
    SELECT d.id, d.slug, d.node_id, tr.node_type, tr.topic_id,
           (row_number() OVER (PARTITION BY tr.topic_id ORDER BY tr.k COLLATE "C"))::integer,
           d.published_at,
           EXISTS (SELECT 1 FROM public.document_versions h
                    WHERE h.document_id = d.id AND h.language = 'hi' AND h.is_current AND h.is_published)
      FROM docs d
      JOIN tree tr ON tr.id = d.node_id
$fn$;
COMMENT ON FUNCTION public.fn_servable_node_lessons() IS 'CA-5/CA-7: servable node lessons with their master chapter (TOPIC) and position in master order; INTERNAL nodes excluded; the one source for counts, courses and access.';

-- ------------------------------------------------------------------ per-exam launch
CREATE TABLE public.exam_course_launches (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id           uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
    exam_cycle_id     uuid REFERENCES public.exam_cycles (id) ON DELETE RESTRICT,
    status            text NOT NULL CHECK (status IN ('LIVE', 'PAUSED')),
    coverage          jsonb NOT NULL CHECK (jsonb_typeof(coverage) = 'object'),
    launched_by       uuid,
    launched_by_email text NOT NULL,
    launched_at       timestamptz NOT NULL DEFAULT now(),
    changed_by_email  text NOT NULL,
    changed_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_course_launch UNIQUE NULLS NOT DISTINCT (exam_id, exam_cycle_id)
);
COMMENT ON TABLE public.exam_course_launches IS 'CA-7 (design H): the owner''s explicit, audited launch of an exam course; LIVE shows the course and applies lesson gating, PAUSED hides it again.';

ALTER TABLE public.exam_course_launches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_course_launches FROM PUBLIC, anon, authenticated;
GRANT SELECT (exam_id, exam_cycle_id, status) ON public.exam_course_launches TO anon, authenticated;
GRANT ALL ON TABLE public.exam_course_launches TO service_role;
CREATE POLICY "exam_course_launches: public reads LIVE" ON public.exam_course_launches
    FOR SELECT TO anon, authenticated USING (status = 'LIVE');

CREATE OR REPLACE FUNCTION public.fn_exam_course_launch_set(
    p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.exam_course_launches%ROWTYPE;
    v_new public.exam_course_launches%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LAUNCH: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('LIVE', 'PAUSED') THEN RAISE EXCEPTION 'LAUNCH: status must be LIVE or PAUSED' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'LAUNCH: exam not found' USING ERRCODE = 'P0002'; END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'LAUNCH: the cycle does not belong to this exam' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_course_launch:' || p_exam_id::text, 0));
    SELECT * INTO v_old FROM public.exam_course_launches WHERE exam_id = p_exam_id AND exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id FOR UPDATE;
    IF p_status = 'LIVE' THEN
        IF p_coverage IS NULL OR jsonb_typeof(p_coverage) <> 'object' OR NOT (p_coverage ? 'total' AND p_coverage ? 'en') THEN
            RAISE EXCEPTION 'LAUNCH: a coverage snapshot is required to launch' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active) THEN
            RAISE EXCEPTION 'LAUNCH: the exam has no published syllabus' USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_old.id IS NULL OR v_old.status <> 'LIVE' THEN
        RAISE EXCEPTION 'LAUNCH: only a LIVE course can be paused' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NOT NULL AND v_old.status = p_status THEN
        RAISE EXCEPTION 'LAUNCH: the course is already %', p_status USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NULL THEN
        INSERT INTO public.exam_course_launches (exam_id, exam_cycle_id, status, coverage, launched_by, launched_by_email, changed_by_email)
        VALUES (p_exam_id, p_exam_cycle_id, p_status, p_coverage, p_actor_id, p_actor_email, p_actor_email)
        RETURNING * INTO v_new;
    ELSE
        UPDATE public.exam_course_launches
           SET status = p_status,
               coverage = CASE WHEN p_status = 'LIVE' THEN p_coverage ELSE coverage END,
               launched_by = CASE WHEN p_status = 'LIVE' THEN p_actor_id ELSE launched_by END,
               launched_by_email = CASE WHEN p_status = 'LIVE' THEN p_actor_email ELSE launched_by_email END,
               launched_at = CASE WHEN p_status = 'LIVE' THEN now() ELSE launched_at END,
               changed_by_email = p_actor_email, changed_at = now()
         WHERE id = v_old.id
        RETURNING * INTO v_new;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, CASE WHEN p_status = 'LIVE' THEN 'EXAM_COURSE_LAUNCH' ELSE 'EXAM_COURSE_PAUSE' END, 'exam_course_launch',
            v_new.id::text, CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('status', v_old.status) END,
            jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'status', p_status, 'coverage', v_new.coverage), NULL);
    RETURN jsonb_build_object('id', v_new.id, 'status', v_new.status);
END
$fn$;

-- the lessons inside a LIVE exam course (INVOKER: anon sees only LIVE launches through RLS; the outline is anon-readable)
CREATE OR REPLACE FUNCTION public.fn_live_course_document_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT DISTINCT (l ->> 'document_id')::uuid
      FROM public.exam_course_launches x
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(public.fn_exam_course_outline(x.exam_id, x.exam_cycle_id, 'en') -> 'chapters', '[]'::jsonb)) ch
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(ch -> 'lessons', '[]'::jsonb)) l
     WHERE x.status = 'LIVE'
$fn$;

-- ------------------------------------------------------------------ exam notes
CREATE TABLE public.exam_node_notes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id            uuid NOT NULL REFERENCES public.exams (id) ON DELETE CASCADE,
    node_id            uuid NOT NULL REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    language           text NOT NULL CHECK (language IN ('en', 'hi')),
    version            integer NOT NULL CHECK (version >= 1),
    meta               jsonb NOT NULL,
    blocks             jsonb NOT NULL,
    blocks_hash        text NOT NULL CHECK (blocks_hash ~ '^[0-9a-f]{64}$'),
    status             text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    created_by_email   text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    published_at       timestamptz,
    published_by_email text,
    CONSTRAINT uq_exam_node_note_version UNIQUE (exam_id, node_id, language, version)
);
CREATE UNIQUE INDEX uq_exam_node_notes_one_draft ON public.exam_node_notes (exam_id, node_id, language) WHERE status = 'DRAFT';
CREATE UNIQUE INDEX uq_exam_node_notes_one_published ON public.exam_node_notes (exam_id, node_id, language) WHERE status = 'PUBLISHED';
COMMENT ON TABLE public.exam_node_notes IS 'CA-7 (design E): the per-exam note of a master node (how it is asked, weightage, PYQ pattern) — lesson blocks, versioned; one DRAFT + one PUBLISHED per exam × node × language; edits audited (EXAM_NOTE_*).';

-- the blocks are checked (and hashed) on every write; a non-DRAFT row keeps its body; DRAFT → PUBLISHED → RETIRED
CREATE OR REPLACE FUNCTION public.fn_exam_node_note_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_e jsonb;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' AND (NEW.blocks IS DISTINCT FROM OLD.blocks OR NEW.meta IS DISTINCT FROM OLD.meta
         OR NEW.exam_id IS DISTINCT FROM OLD.exam_id OR NEW.node_id IS DISTINCT FROM OLD.node_id OR NEW.language IS DISTINCT FROM OLD.language
         OR NEW.version IS DISTINCT FROM OLD.version) THEN
        RAISE EXCEPTION 'EXAM_NOTE: version % is % and cannot change; save a new draft instead', OLD.version, OLD.status USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('PUBLISHED', 'RETIRED')) OR (OLD.status = 'PUBLISHED' AND NEW.status = 'RETIRED')) THEN
        RAISE EXCEPTION 'EXAM_NOTE: a note cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'EXAM_NOTE: a new note is a DRAFT' USING ERRCODE = 'P0001';
    END IF;
    v_e := public.fn_lesson_blocks_errors(NEW.meta, NEW.blocks);
    IF jsonb_array_length(v_e) > 0 THEN
        RAISE EXCEPTION 'EXAM_NOTE: the blocks are not valid (% problem(s); first: %)', jsonb_array_length(v_e), v_e -> 0 USING ERRCODE = '22023';
    END IF;
    NEW.blocks_hash := encode(sha256(convert_to(NEW.blocks::text, 'UTF8')), 'hex');
    NEW.updated_at := now();
    RETURN NEW;
END
$fn$;
CREATE TRIGGER trg_exam_node_note_guard
    BEFORE INSERT OR UPDATE ON public.exam_node_notes
    FOR EACH ROW EXECUTE FUNCTION public.fn_exam_node_note_guard();

ALTER TABLE public.exam_node_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_node_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, exam_id, node_id, language, version, meta, blocks, status, published_at) ON public.exam_node_notes TO anon, authenticated;
GRANT ALL ON TABLE public.exam_node_notes TO service_role;
CREATE POLICY "exam_node_notes: public reads PUBLISHED" ON public.exam_node_notes
    FOR SELECT TO anon, authenticated USING (status = 'PUBLISHED');

CREATE OR REPLACE FUNCTION public.fn_exam_note_save_draft(
    p_exam_id uuid, p_node_id uuid, p_language text, p_meta jsonb, p_blocks jsonb, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_row public.exam_node_notes%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'EXAM_NOTE: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'EXAM_NOTE: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'EXAM_NOTE: exam not found' USING ERRCODE = 'P0002'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes WHERE id = p_node_id AND is_active AND NOT is_internal AND node_type IN ('TOPIC', 'SUBTOPIC', 'CONCEPT')) THEN
        RAISE EXCEPTION 'EXAM_NOTE: a note belongs to an active topic, subtopic or concept (not an internal node)' USING ERRCODE = '22023';
    END IF;
    IF p_language = 'hi' AND NOT EXISTS (SELECT 1 FROM public.exam_node_notes WHERE exam_id = p_exam_id AND node_id = p_node_id AND language = 'en' AND status = 'PUBLISHED') THEN
        RAISE EXCEPTION 'EXAM_NOTE: publish the English note first' USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_note:' || p_exam_id::text || ':' || p_node_id::text || ':' || p_language, 0));
    UPDATE public.exam_node_notes SET meta = p_meta, blocks = p_blocks
     WHERE exam_id = p_exam_id AND node_id = p_node_id AND language = p_language AND status = 'DRAFT'
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
        INSERT INTO public.exam_node_notes (exam_id, node_id, language, version, meta, blocks, blocks_hash, created_by_email)
        SELECT p_exam_id, p_node_id, p_language, coalesce(max(version), 0) + 1, p_meta, p_blocks, repeat('0', 64), p_actor_email
          FROM public.exam_node_notes WHERE exam_id = p_exam_id AND node_id = p_node_id AND language = p_language
        RETURNING * INTO v_row;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'EXAM_NOTE_DRAFT_SAVE', 'exam_node_note', v_row.id::text, NULL,
            jsonb_build_object('exam_id', p_exam_id, 'node_id', p_node_id, 'language', p_language, 'version', v_row.version, 'blocks_hash', v_row.blocks_hash), NULL);
    RETURN jsonb_build_object('id', v_row.id, 'version', v_row.version);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_exam_note_publish(p_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v      public.exam_node_notes%ROWTYPE;
    v_prev uuid;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'EXAM_NOTE: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM public.exam_node_notes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_NOTE: note not found' USING ERRCODE = 'P0002'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_note:' || v.exam_id::text || ':' || v.node_id::text || ':' || v.language, 0));
    SELECT * INTO v FROM public.exam_node_notes WHERE id = p_id FOR UPDATE;
    IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'EXAM_NOTE: only a draft can be published' USING ERRCODE = 'P0001'; END IF;
    UPDATE public.exam_node_notes SET status = 'RETIRED'
     WHERE exam_id = v.exam_id AND node_id = v.node_id AND language = v.language AND status = 'PUBLISHED'
    RETURNING id INTO v_prev;
    UPDATE public.exam_node_notes SET status = 'PUBLISHED', published_at = now(), published_by_email = p_actor_email WHERE id = p_id;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'EXAM_NOTE_PUBLISH', 'exam_node_note', p_id::text, NULL,
            jsonb_build_object('exam_id', v.exam_id, 'node_id', v.node_id, 'language', v.language, 'version', v.version, 'previous_id', v_prev), NULL);
    RETURN jsonb_build_object('id', p_id, 'version', v.version, 'previous_id', v_prev);
END
$fn$;

-- ------------------------------------------------------------------ view events (idempotent) through the existing progress RPC
ALTER TABLE public.learning_activity_events ADD COLUMN idempotency_key text
    CHECK (idempotency_key IS NULL OR char_length(idempotency_key) <= 200);
CREATE UNIQUE INDEX uq_learning_activity_events_idempotency ON public.learning_activity_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

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

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_live_course_document_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_exam_node_note_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_exam_note_save_draft(uuid, uuid, text, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_exam_note_publish(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_live_course_document_ids() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_exam_note_save_draft(uuid, uuid, text, jsonb, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_exam_note_publish(uuid, uuid, text) TO service_role;
-- fn_servable_node_lessons / fn_lesson_progress_save keep their 120 grants (CREATE OR REPLACE keeps the ACL)

-- ------------------------------------------------------------------ proof
DO $proof$
BEGIN
    IF has_table_privilege('authenticated', 'public.exam_course_launches', 'INSERT') OR has_table_privilege('authenticated', 'public.exam_course_launches', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.exam_node_notes', 'INSERT') OR has_table_privilege('authenticated', 'public.exam_node_notes', 'UPDATE')
       OR has_column_privilege('anon', 'public.exam_course_launches', 'coverage', 'SELECT') OR has_column_privilege('anon', 'public.exam_course_launches', 'launched_by_email', 'SELECT')
       OR has_column_privilege('anon', 'public.exam_node_notes', 'created_by_email', 'SELECT')
       OR has_function_privilege('authenticated', 'public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_exam_note_save_draft(uuid, uuid, text, jsonb, jsonb, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_lesson_progress_save(uuid, text, text, text)', 'EXECUTE')
       OR NOT has_function_privilege('anon', 'public.fn_servable_node_lessons()', 'EXECUTE')
       OR NOT has_column_privilege('anon', 'public.learning_documents', 'is_test_content', 'SELECT') THEN
        RAISE EXCEPTION 'CA7_PROOF: a client can write launches / notes, read admin columns, or the 120 grants changed';
    END IF;
    IF (SELECT count(*) FROM public.canonical_taxonomy_nodes WHERE is_internal) <> 0 OR (SELECT count(*) FROM public.learning_documents WHERE is_test_content) <> 0 THEN
        RAISE EXCEPTION 'CA7_PROOF: the new flags start false (they are set through the audited paths afterwards)';
    END IF;
END
$proof$;
