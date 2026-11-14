-- Rollback for 20261103000137_lesson_coins_earn.sql (COURSE-UX-1). Only on an owner / architect instruction.
-- Restores the exact 136 fn_lesson_complete (no award), removes the award helper, the LESSON_COMPLETED policy and the
-- COINS_LESSON_EARN switch. Coins already credited stay in the ledger (a reversal is a separate, explicit decision).
-- ROLLBACK-CHAIN: run first: none
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
DROP FUNCTION IF EXISTS public.fn_lesson__award_coins(uuid, uuid, boolean);
DELETE FROM public.premium_system_configs WHERE config_key = 'COINS_LESSON_EARN';
DELETE FROM public.reward_policies WHERE policy_code = 'LESSON_COMPLETED';
