-- =====================================================================================================================
-- 136 COURSE-UX-1 — secure lesson completion (owner answer 2, 2026-11-03). A lesson counts as completed only when the
-- SERVER has recorded all three, measured from its own clock (the client is never trusted):
--   (a) the end was reached — the reader reported the lesson's LAST block (validated against the published version);
--   (b) every quick check was attempted — each answer is checked on the server (the browser never receives the correct
--       option before answering);
--   (c) time since the server-recorded start ≥ max(60 s, 40 % of the estimated reading minutes); minutes come from the
--       lesson's word count (owner answer 5: 200 words per minute, at least 1) — fn_lesson__reading_minutes, mirrored by
--       lib/lessons/reading-time.ts (the gate compares both on shared vectors).
--   1. public.lesson_reading_sessions (user × lesson: started_at = first open, last block, end_reached_at) and
--      public.lesson_quick_check_attempts (user × lesson × language × block: the FIRST answer only, correct or not).
--      RLS on, own rows readable, no client write (writes only through the RPCs below).
--   2. fn_lesson__reading_minutes(jsonb) — IMMUTABLE, INVOKER; service_role only (the RPCs run it as the owner).
--   3. fn_lesson_quick_check_answer(document, language, block, option) — SECURITY DEFINER, search_path '', auth.uid();
--      authenticated only: checks against the current published version in that language, records the first attempt,
--      returns correctness + that option's feedback + the correct option id.
--   4. fn_lesson_complete(document, language) — SECURITY DEFINER, search_path '', auth.uid(); authenticated only:
--      completes only with (a) + (b) + (c), else returns what is missing (no write); idempotent; the progress row is
--      locked (FOR UPDATE) so two tabs complete once. 137 adds the coin award to this function.
--   5. fn_lesson_progress_save (same signature / grants): READING also records the reading session (start kept, last
--      block, end reached); COMPLETED is no longer a bare click — it is decided by fn_lesson_complete (the code in
--      production keeps working: an un-evidenced "Mark as complete" simply stays READING).
-- SECURITY DEFINER count +2 (both class A, authenticated): scripts/secdef/allowlist.json.
-- Rollback: docs/database/rollback/136_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261103000135_course_progress_per_lesson.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'COURSE_UX_1_136_PREFLIGHT: 135 is not applied';
    END IF;
    IF to_regclass('public.lesson_reading_sessions') IS NOT NULL OR to_regclass('public.lesson_quick_check_attempts') IS NOT NULL THEN
        RAISE EXCEPTION 'COURSE_UX_1_136_PREFLIGHT: evidence tables already exist';
    END IF;
END
$pre$;

-- 1. evidence tables
CREATE TABLE public.lesson_reading_sessions (
    user_id        uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    document_id    uuid NOT NULL REFERENCES public.learning_documents (id) ON DELETE CASCADE,
    started_at     timestamptz NOT NULL DEFAULT now(),
    last_block_id  text CHECK (last_block_id IS NULL OR last_block_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
    end_reached_at timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, document_id)
);
COMMENT ON TABLE public.lesson_reading_sessions IS 'COURSE-UX-1 (136): server-recorded reading evidence per student and lesson (first open, last block, end reached). Own rows readable; written only by SECURITY DEFINER RPCs (auth.uid()).';

CREATE TABLE public.lesson_quick_check_attempts (
    user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    document_id  uuid NOT NULL REFERENCES public.learning_documents (id) ON DELETE CASCADE,
    language     text NOT NULL CHECK (language IN ('en', 'hi')),
    block_id     text NOT NULL CHECK (block_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
    option_id    text NOT NULL CHECK (option_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
    is_correct   boolean NOT NULL,
    attempted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, document_id, language, block_id)
);
COMMENT ON TABLE public.lesson_quick_check_attempts IS 'COURSE-UX-1 (136): the FIRST answer per student, lesson, language and quick check (checked on the server). Own rows readable; written only by fn_lesson_quick_check_answer.';

ALTER TABLE public.lesson_reading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_quick_check_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lesson_reading_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.lesson_quick_check_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lesson_reading_sessions TO authenticated;
GRANT SELECT ON TABLE public.lesson_quick_check_attempts TO authenticated;
GRANT ALL ON TABLE public.lesson_reading_sessions TO service_role;
GRANT ALL ON TABLE public.lesson_quick_check_attempts TO service_role;
CREATE POLICY "lesson_reading_sessions: own rows" ON public.lesson_reading_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "lesson_quick_check_attempts: own rows" ON public.lesson_quick_check_attempts FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 2. reading minutes from the word count (lib/lessons/reading-time.ts mirrors the field list and the rule)
CREATE OR REPLACE FUNCTION public.fn_lesson__reading_minutes(p_blocks jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT greatest(1, ceil(coalesce(sum(cardinality(regexp_split_to_array(btrim(v #>> '{}'), '\s+'))) FILTER (WHERE btrim(v #>> '{}') <> ''), 0) / 200.0))::integer
      FROM unnest(ARRAY[
             'lax $[*].text', 'lax $[*].items[*]', 'lax $[*].question', 'lax $[*].steps[*].text', 'lax $[*].answer',
             'lax $[*].shortcut', 'lax $[*].mistake', 'lax $[*].why', 'lax $[*].title', 'lax $[*].name', 'lax $[*].caption',
             'lax $[*].headers[*]', 'lax $[*].rows[*][*]', 'lax $[*].prompt', 'lax $[*].options[*].text', 'lax $[*].bullets[*]',
             'lax $[*].speed_rules[*]', 'lax $[*].points[*]', 'lax $[*].reading', 'lax $[*].alt']::jsonpath[]) AS p(path)
     CROSS JOIN LATERAL pg_catalog.jsonb_path_query(coalesce(p_blocks, '[]'::jsonb), p.path) AS v
     WHERE pg_catalog.jsonb_typeof(v) = 'string'
$fn$;
COMMENT ON FUNCTION public.fn_lesson__reading_minutes(jsonb) IS 'COURSE-UX-1 (136): estimated reading minutes = ceil(words / 200), at least 1; words of the readable text fields (quick-check feedback excluded). Mirrored by lib/lessons/reading-time.ts.';
REVOKE ALL ON FUNCTION public.fn_lesson__reading_minutes(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson__reading_minutes(jsonb) TO service_role;

-- 3. quick-check answers, checked on the server
CREATE OR REPLACE FUNCTION public.fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user    uuid := auth.uid();
    v_blocks  jsonb;
    v_block   jsonb;
    v_option  jsonb;
    v_correct text;
    v_first   boolean;
    v_rec     public.lesson_quick_check_attempts%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'QUICK_CHECK: sign in to record answers' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'QUICK_CHECK: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_block_id IS NULL OR p_block_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' OR p_option_id IS NULL OR p_option_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' THEN
        RAISE EXCEPTION 'QUICK_CHECK: invalid id' USING ERRCODE = '22023';
    END IF;
    SELECT dv.blocks INTO v_blocks
      FROM public.learning_documents d
      JOIN public.document_versions dv ON dv.document_id = d.id
     WHERE d.id = p_document_id AND d.status = 'PUBLISHED' AND dv.language = p_language AND dv.is_current AND dv.is_published
       AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'QUICK_CHECK: lesson not found' USING ERRCODE = 'P0002'; END IF;
    SELECT b INTO v_block FROM jsonb_array_elements(v_blocks) b WHERE b ->> 'type' = 'quick_check' AND b ->> 'id' = p_block_id LIMIT 1;
    IF v_block IS NULL THEN RAISE EXCEPTION 'QUICK_CHECK: quick check not found' USING ERRCODE = 'P0002'; END IF;
    SELECT o INTO v_option FROM jsonb_array_elements(v_block -> 'options') o WHERE o ->> 'id' = p_option_id LIMIT 1;
    IF v_option IS NULL THEN RAISE EXCEPTION 'QUICK_CHECK: option not found' USING ERRCODE = 'P0002'; END IF;
    SELECT o ->> 'id' INTO v_correct FROM jsonb_array_elements(v_block -> 'options') o WHERE (o ->> 'correct')::boolean IS TRUE LIMIT 1;

    -- the FIRST attempt is the one that counts (later attempts still get feedback)
    INSERT INTO public.lesson_quick_check_attempts (user_id, document_id, language, block_id, option_id, is_correct)
    VALUES (v_user, p_document_id, p_language, p_block_id, p_option_id, p_option_id = v_correct)
    ON CONFLICT (user_id, document_id, language, block_id) DO NOTHING
    RETURNING * INTO v_rec;
    v_first := v_rec.user_id IS NOT NULL;

    RETURN jsonb_build_object('block_id', p_block_id, 'option_id', p_option_id, 'correct', p_option_id = v_correct,
                              'correct_option_id', v_correct, 'feedback', v_option ->> 'feedback', 'first_attempt', v_first);
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_lesson_quick_check_answer(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lesson_quick_check_answer(uuid, text, text, text) TO authenticated, service_role;

-- 4. completion — only with server-recorded evidence
CREATE OR REPLACE FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user      uuid := auth.uid();
    v_node      uuid;
    v_blocks    jsonb;
    v_status    text;
    v_session   public.lesson_reading_sessions%ROWTYPE;
    v_checks    text[];
    v_attempted integer;
    v_correct   integer;
    v_minutes   integer;
    v_required  integer;
    v_elapsed   integer;
    v_missing   text[] := ARRAY[]::text[];
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'COMPLETE: sign in to save progress' USING ERRCODE = '42501'; END IF;
    IF p_language IS NULL OR p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'COMPLETE: language must be en or hi' USING ERRCODE = '22023'; END IF;
    SELECT d.node_id, dv.blocks INTO v_node, v_blocks
      FROM public.learning_documents d
      JOIN public.document_versions dv ON dv.document_id = d.id
     WHERE d.id = p_document_id AND d.status = 'PUBLISHED' AND dv.language = p_language AND dv.is_current AND dv.is_published
       AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'
     LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'COMPLETE: lesson not found' USING ERRCODE = 'P0002'; END IF;

    -- one completion per student and lesson, even from two tabs: lock the progress row
    INSERT INTO public.user_lesson_progress (user_id, document_id, language, node_id, status)
    VALUES (v_user, p_document_id, p_language, v_node, 'READING')
    ON CONFLICT (user_id, document_id) DO NOTHING;
    SELECT status INTO v_status FROM public.user_lesson_progress WHERE user_id = v_user AND document_id = p_document_id FOR UPDATE;
    IF v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('status', 'COMPLETED', 'completed', true, 'already', true, 'coins_awarded', 0);
    END IF;

    SELECT * INTO v_session FROM public.lesson_reading_sessions WHERE user_id = v_user AND document_id = p_document_id;
    SELECT coalesce(array_agg(b ->> 'id'), ARRAY[]::text[]) INTO v_checks FROM jsonb_array_elements(v_blocks) b WHERE b ->> 'type' = 'quick_check';
    SELECT count(*)::int, count(*) FILTER (WHERE is_correct)::int INTO v_attempted, v_correct
      FROM public.lesson_quick_check_attempts
     WHERE user_id = v_user AND document_id = p_document_id AND language = p_language AND block_id = ANY (v_checks);
    v_minutes  := public.fn_lesson__reading_minutes(v_blocks);
    v_required := greatest(60, ceil(0.4 * v_minutes * 60))::int;
    v_elapsed  := CASE WHEN v_session.user_id IS NULL THEN 0 ELSE floor(extract(epoch FROM (now() - v_session.started_at)))::int END;

    IF v_session.user_id IS NULL THEN v_missing := array_append(v_missing, 'START'); END IF;
    IF v_session.end_reached_at IS NULL THEN v_missing := array_append(v_missing, 'END'); END IF;
    IF v_attempted < cardinality(v_checks) THEN v_missing := array_append(v_missing, 'QUICK_CHECKS'); END IF;
    IF v_elapsed < v_required THEN v_missing := array_append(v_missing, 'TIME'); END IF;

    IF cardinality(v_missing) > 0 THEN
        RETURN jsonb_build_object('status', v_status, 'completed', false, 'missing', to_jsonb(v_missing),
                                  'seconds_left', greatest(0, v_required - v_elapsed),
                                  'quick_checks', jsonb_build_object('total', cardinality(v_checks), 'attempted', v_attempted),
                                  'coins_awarded', 0);
    END IF;

    UPDATE public.user_lesson_progress
       SET status = 'COMPLETED', completed_at = now(), language = p_language, updated_at = now()
     WHERE user_id = v_user AND document_id = p_document_id;
    RETURN jsonb_build_object('status', 'COMPLETED', 'completed', true, 'already', false,
                              'all_correct', v_correct = cardinality(v_checks), 'coins_awarded', 0);
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_lesson_complete(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_lesson_complete(uuid, text) TO authenticated, service_role;

-- 5. the progress RPC records the reading session; COMPLETED is decided by fn_lesson_complete
CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
    v_user     uuid := auth.uid();
    v_node     uuid;
    v_slug     text;
    v_topic    uuid;
    v_blocks   jsonb;
    v_block    text;
    v_last     text;
    v_complete jsonb;
    v_row      public.user_lesson_progress%ROWTYPE;
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

    IF p_status = 'COMPLETED' THEN
        -- COURSE-UX-1: never a bare click — completed only with the server-recorded evidence
        v_complete := public.fn_lesson_complete(p_document_id, p_language);
        SELECT * INTO v_row FROM public.user_lesson_progress WHERE user_id = v_user AND document_id = p_document_id;
        RETURN jsonb_build_object('document_id', p_document_id, 'language', v_row.language, 'status', v_row.status,
                                  'last_block_id', v_row.last_block_id, 'completed_at', v_row.completed_at, 'complete', v_complete);
    END IF;

    -- the block must exist in the published version of that language (else it is ignored); the LAST block = end reached
    SELECT dv.blocks INTO v_blocks
      FROM public.document_versions dv
     WHERE dv.document_id = p_document_id AND dv.language = p_language AND dv.is_current AND dv.is_published
       AND dv.review_status = 'PUBLISHED' AND dv.content_format = 'BLOCKS'
     LIMIT 1;
    IF p_last_block_id IS NOT NULL AND v_blocks IS NOT NULL
       AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_blocks) b WHERE b ->> 'id' = p_last_block_id) THEN
        v_block := p_last_block_id;
        v_last  := v_blocks -> (jsonb_array_length(v_blocks) - 1) ->> 'id';
    END IF;

    INSERT INTO public.lesson_reading_sessions AS s (user_id, document_id, last_block_id, end_reached_at)
    VALUES (v_user, p_document_id, v_block, CASE WHEN v_block IS NOT NULL AND v_block = v_last THEN now() END)
    ON CONFLICT (user_id, document_id) DO UPDATE
       SET last_block_id  = coalesce(EXCLUDED.last_block_id, s.last_block_id),
           end_reached_at = coalesce(s.end_reached_at, EXCLUDED.end_reached_at),
           updated_at     = now();

    INSERT INTO public.user_lesson_progress AS p (user_id, document_id, language, node_id, status, last_block_id, completed_at)
    VALUES (v_user, p_document_id, p_language, v_node, 'READING', v_block, NULL)
    ON CONFLICT (user_id, document_id) DO UPDATE
       SET last_block_id = coalesce(EXCLUDED.last_block_id, p.last_block_id),
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
DECLARE
    f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['public.fn_lesson_quick_check_answer(uuid, text, text, text)', 'public.fn_lesson_complete(uuid, text)', 'public.fn_lesson_progress_save(uuid, text, text, text)'] LOOP
        IF NOT (SELECT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = f::regprocedure)
           OR has_function_privilege('anon', f, 'EXECUTE') OR NOT has_function_privilege('authenticated', f, 'EXECUTE') THEN
            RAISE EXCEPTION 'COURSE_UX_1_136_PROOF: % is not SECURITY DEFINER / search_path '''' / authenticated-only', f;
        END IF;
    END LOOP;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.fn_lesson__reading_minutes(jsonb)'::regprocedure)
       OR has_function_privilege('authenticated', 'public.fn_lesson__reading_minutes(jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_lesson__reading_minutes(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'COURSE_UX_1_136_PROOF: reading minutes helper is SECURITY DEFINER or client-executable';
    END IF;
    IF has_table_privilege('authenticated', 'public.lesson_reading_sessions', 'INSERT') OR has_table_privilege('authenticated', 'public.lesson_reading_sessions', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.lesson_quick_check_attempts', 'INSERT') OR has_table_privilege('authenticated', 'public.lesson_quick_check_attempts', 'UPDATE')
       OR has_table_privilege('anon', 'public.lesson_reading_sessions', 'SELECT') OR has_table_privilege('anon', 'public.lesson_quick_check_attempts', 'SELECT') THEN
        RAISE EXCEPTION 'COURSE_UX_1_136_PROOF: evidence tables have client writes or anon reads';
    END IF;
    IF public.fn_lesson__reading_minutes('[{"id":"a","type":"paragraph","text":"one two three"}]'::jsonb) <> 1
       OR public.fn_lesson__reading_minutes(jsonb_build_array(jsonb_build_object('id', 'a', 'type', 'paragraph', 'text', repeat('w ', 401)))) <> 3 THEN
        RAISE EXCEPTION 'COURSE_UX_1_136_PROOF: reading minutes rule';
    END IF;
END
$proof$;
