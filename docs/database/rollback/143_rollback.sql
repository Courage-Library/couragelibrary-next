-- =====================================================================================================================
-- Rollback for 143 PAY-1 B2b part 1 (supabase/migrations/20261116000143_pay1_b2b_answer_and_lesson_guards.sql).
-- ROLLBACK-CHAIN: run first: none
-- Restores the six functions byte-exactly as they were before 143 (pg_get_functiondef, production 2026-11-15) with the
-- same grants, and drops the trigger and the two new functions. Free policy rows the trigger wrote stay (harmless).
-- Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
CREATE OR REPLACE FUNCTION public.fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson_quick_check_answer(p_document_id uuid, p_language text, p_block_id text, p_option_id text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson_progress_save(p_document_id uuid, p_language text, p_status text, p_last_block_id text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_award     jsonb;
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
    -- COURSE-UX-1 (137): lesson coins, once, at this transition only
    v_award := public.fn_lesson__award_coins(v_user, p_document_id, v_correct = cardinality(v_checks));
    RETURN jsonb_build_object('status', 'COMPLETED', 'completed', true, 'already', false,
                              'all_correct', v_correct = cardinality(v_checks),
                              'coins_awarded', coalesce((v_award ->> 'coins_awarded')::int, 0), 'coins_reason', v_award ->> 'reason');
END
$function$;
REVOKE ALL ON FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_lesson_complete(p_document_id uuid, p_language text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_check_practice_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_set_id uuid, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid      uuid := auth.uid();
    v_qid      uuid;
    v_lang     text;
    v_key      text;
    v_expl     text;
    v_prev     public.practice_answers%ROWTYPE;
    v_id       uuid;
    v_correct  boolean;
    v_mistake  jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_version_id IS NULL OR p_set_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('TOPIC', 'DIAGNOSTIC')
       OR (p_selected_option_key IS NOT NULL AND p_selected_option_key NOT IN ('A', 'B', 'C', 'D'))
       OR (p_time_taken_ms IS NOT NULL AND (p_time_taken_ms < 0 OR p_time_taken_ms > 3600000)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT v.question_id, v.language INTO v_qid, v_lang
      FROM public.question_versions v
      JOIN public.questions q ON q.id = v.question_id
     WHERE v.id = p_question_version_id
       AND v.lifecycle_status = 'PUBLISHED'
       AND v.is_current
       AND q.status = 'published';
    IF v_qid IS NULL OR NOT public.fn_qf_version_is_servable(p_question_version_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- serialise this user's answers (rate-limit counts and the per-set idempotency check stay exact)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('practice_answers:' || v_uid::text, 0));

    SELECT * INTO v_prev FROM public.practice_answers
     WHERE user_id = v_uid AND set_id = p_set_id AND question_version_id = p_question_version_id;
    IF NOT FOUND THEN
        IF (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > now() - interval '1 minute') >= 30
           OR (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > now() - interval '1 day') >= 1500 THEN
            RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
        END IF;
    END IF;

    SELECT a.correct_option_key, a.explanation_md INTO v_key, v_expl
      FROM public.question_answers a WHERE a.question_version_id = p_question_version_id;
    IF v_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    IF v_prev.id IS NOT NULL THEN
        -- repeat within the same set: the stored result, no second row (no re-answer farming)
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ANSWERED', 'practice_answer_id', v_prev.id,
            'question_id', v_prev.question_id, 'is_correct', v_prev.is_correct, 'selected_option_key', v_prev.selected_option_key,
            'correct_option_key', v_key, 'explanation_md', v_expl);
    END IF;

    v_correct := p_selected_option_key IS NOT NULL AND p_selected_option_key = v_key;
    INSERT INTO public.practice_answers (user_id, question_id, question_version_id, selected_option_key, is_correct, time_taken_ms, set_id, mode, language)
    VALUES (v_uid, v_qid, p_question_version_id, p_selected_option_key, v_correct, p_time_taken_ms, p_set_id, p_mode, v_lang)
    RETURNING id INTO v_id;

    -- a wrong (or skipped) answer goes to the canonical Mistake Vault through its canonical writer, in this same
    -- transaction (vault upsert + occurrence with lineage: source_reference_id = this practice answer)
    IF NOT v_correct THEN
        v_mistake := public.fn_record_mistake_occurrence(
            v_uid, v_qid,
            CASE p_mode WHEN 'DIAGNOSTIC' THEN 'DIAGNOSTIC_ASSESSMENT' ELSE 'CUSTOM_PRACTICE' END,
            v_id,
            (SELECT o.id FROM public.question_options o WHERE o.question_version_id = p_question_version_id AND o.option_key = p_selected_option_key),
            CASE WHEN p_time_taken_ms IS NULL THEN NULL ELSE (p_time_taken_ms / 1000) END,
            'UNCLASSIFIED', 50, p_question_version_id, NULL);
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'practice_answer_id', v_id, 'question_id', v_qid,
        'is_correct', v_correct, 'selected_option_key', p_selected_option_key, 'correct_option_key', v_key, 'explanation_md', v_expl,
        'saved_to_mistakes', coalesce((v_mistake ->> 'success')::boolean, false));
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_check_practice_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_set_id uuid, p_mode text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_practice_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_set_id uuid, p_mode text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_memory_lock_add(p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid   uuid := auth.uid();
    v_topic uuid;
    v_ok    boolean;
    v_rows  integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT q.canonical_topic_id,
           EXISTS (SELECT 1 FROM public.question_versions v WHERE v.question_id = q.id AND v.is_current AND v.lifecycle_status = 'PUBLISHED' AND public.fn_qf_version_is_servable(v.id))
      INTO v_topic, v_ok
      FROM public.questions q WHERE q.id = p_question_id AND q.status = 'published';
    IF v_ok IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('memory_lock_add:' || v_uid::text, 0));
    IF EXISTS (SELECT 1 FROM public.user_mistake_vault WHERE user_id = v_uid AND question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ADDED');
    END IF;
    IF (SELECT count(*) FROM public.user_mistake_vault WHERE user_id = v_uid AND ml_source = 'manual' AND created_at > pg_catalog.now() - interval '1 day') >= 100 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;
    INSERT INTO public.user_mistake_vault (user_id, question_id, topic_id, total_mistakes_count, ml_source)
    VALUES (v_uid, p_question_id, v_topic, 0, 'manual')
    ON CONFLICT (user_id, question_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'code', CASE WHEN v_rows = 1 THEN 'ADDED' ELSE 'ALREADY_ADDED' END);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_memory_lock_add(p_question_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_memory_lock_add(p_question_id uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_uid      uuid := auth.uid();
    v_today    date := public.fn_ml_ist_today();
    v_qid      uuid;
    v_lang     text;
    v_item     record;
    v_prev     record;
    v_key      text;
    v_expl     text;
    v_correct  boolean;
    v_answer   uuid;
    v_exam     date;
    v_interval integer;
    v_days     integer;
    v_cap      integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_version_id IS NULL OR p_session_id IS NULL
       OR (p_selected_option_key IS NOT NULL AND p_selected_option_key NOT IN ('A', 'B', 'C', 'D'))
       OR (p_time_taken_ms IS NOT NULL AND (p_time_taken_ms < 0 OR p_time_taken_ms > 3600000)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT v.question_id, v.language INTO v_qid, v_lang
      FROM public.question_versions v
      JOIN public.questions q ON q.id = v.question_id
     WHERE v.id = p_question_version_id AND v.lifecycle_status = 'PUBLISHED' AND v.is_current AND q.status = 'published';
    IF v_qid IS NULL OR NOT public.fn_qf_version_is_servable(p_question_version_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- serialise this user's answers (shared with topic practice: one rate limit, exact idempotency)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('practice_answers:' || v_uid::text, 0));

    SELECT * INTO v_item FROM public.user_mistake_vault WHERE user_id = v_uid AND question_id = v_qid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_IN_MEMORY_LOCK');
    END IF;

    SELECT a.correct_option_key, a.explanation_md INTO v_key, v_expl FROM public.question_answers a WHERE a.question_version_id = p_question_version_id;
    IF v_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- idempotent per (session, version): a retried call returns the stored result and the CURRENT schedule, no 2nd step
    SELECT * INTO v_prev FROM public.practice_answers WHERE user_id = v_uid AND set_id = p_session_id AND question_version_id = p_question_version_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'idempotent', true, 'is_correct', v_prev.is_correct,
            'correct_option_key', v_key, 'explanation_md', v_expl,
            'due_on', (v_item.ml_due_at AT TIME ZONE 'Asia/Kolkata')::date, 'interval_days', v_item.ml_interval_days, 'state', v_item.ml_state);
    END IF;
    IF (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > pg_catalog.now() - interval '1 minute') >= 30
       OR (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > pg_catalog.now() - interval '1 day') >= 1500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    v_correct := p_selected_option_key IS NOT NULL AND p_selected_option_key = v_key;
    INSERT INTO public.practice_answers (user_id, question_id, question_version_id, selected_option_key, is_correct, time_taken_ms, set_id, mode, language)
    VALUES (v_uid, v_qid, p_question_version_id, p_selected_option_key, v_correct, p_time_taken_ms, p_session_id, 'MEMORY_LOCK',
            CASE WHEN v_lang IN ('en', 'hi') THEN v_lang ELSE 'en' END)
    RETURNING id INTO v_answer;

    IF v_correct THEN
        IF v_item.ml_last_advance_on IS DISTINCT FROM v_today THEN            -- one step per IST calendar day
            v_interval := public.fn_ml_next_step(v_item.ml_interval_days);
            SELECT o.exam_date INTO v_exam FROM public.user_onboarding o WHERE o.user_id = v_uid;
            IF v_exam IS NOT NULL AND v_exam >= v_today THEN
                v_cap := GREATEST(1, (v_exam - v_today) / 2);
                v_interval := LEAST(v_interval, v_cap);
            END IF;
            v_days := v_item.ml_consecutive_correct_days + 1;
            UPDATE public.user_mistake_vault
               SET ml_interval_days = v_interval,
                   ml_consecutive_correct_days = v_days,
                   ml_state = CASE WHEN v_days >= 2 AND v_interval >= 7 THEN 'locked' WHEN v_days >= 1 THEN 'review' ELSE 'learning' END,
                   ml_last_result = 'correct', ml_last_reviewed_at = pg_catalog.now(), ml_last_advance_on = v_today,
                   ml_due_at = public.fn_ml_day_start(v_today + v_interval), updated_at = pg_catalog.now()
             WHERE id = v_item.id;
        ELSE
            UPDATE public.user_mistake_vault SET ml_last_result = 'correct', ml_last_reviewed_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE id = v_item.id;
        END IF;
    ELSE
        -- the canonical mistake writer; the vault trigger applies the wrong step (interval 1, lapses + 1)
        PERFORM public.fn_record_mistake_occurrence(v_uid, v_qid, 'MEMORY_LOCK', v_answer, NULL,
            CASE WHEN p_time_taken_ms IS NULL THEN NULL ELSE p_time_taken_ms / 1000 END, 'UNCLASSIFIED', 50, p_question_version_id, NULL);
    END IF;

    SELECT * INTO v_item FROM public.user_mistake_vault WHERE id = v_item.id;
    RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'idempotent', false, 'is_correct', v_correct,
        'correct_option_key', v_key, 'explanation_md', v_expl,
        'due_on', (v_item.ml_due_at AT TIME ZONE 'Asia/Kolkata')::date, 'interval_days', v_item.ml_interval_days, 'state', v_item.ml_state);
END
$function$;
REVOKE ALL ON FUNCTION public.fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid) TO authenticated;

DROP TRIGGER IF EXISTS trg_mock_tests_default_access ON public.mock_tests;
DROP FUNCTION IF EXISTS public.fn_mock_tests_default_access();
DROP FUNCTION IF EXISTS public.fn_answer_blocked(uuid, uuid);
