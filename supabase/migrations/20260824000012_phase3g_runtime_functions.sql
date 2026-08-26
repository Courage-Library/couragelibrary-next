-- ============================================================================
-- COURAGE LIBRARY — PHASE 3G: RUNTIME FUNCTIONS & BOUNTY PIPELINE
-- Target Database: couragelibrary-next
-- ============================================================================

-- Function 1: Generate Deterministic Custom Practice Session
CREATE OR REPLACE FUNCTION public.fn_generate_custom_practice_session(
    p_title TEXT,
    p_session_mode TEXT,
    p_topic_ids UUID[] DEFAULT NULL,
    p_question_count INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_count INTEGER;
    v_version_ids UUID[];
    v_session_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    v_count := LEAST(GREATEST(p_question_count, 5), 100);

    -- Candidate selection based on mode
    IF p_session_mode = 'BOOKMARKED' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT uqb.question_version_id AS id
            FROM public.user_question_bookmarks uqb
            JOIN public.questions q ON q.id = uqb.question_id
            JOIN public.question_versions qv ON qv.id = uqb.question_version_id
            WHERE uqb.user_id = v_user_id
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY uqb.created_at DESC
            LIMIT v_count
        ) qv;
    ELSIF p_session_mode = 'WRONG_QUESTIONS' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT DISTINCT qv.id
            FROM public.attempt_answers aa
            JOIN public.test_attempts ta ON ta.id = aa.attempt_id
            JOIN public.mock_questions mq ON mq.id = aa.mock_question_id
            JOIN public.question_versions qv ON qv.id = mq.question_version_id
            JOIN public.questions q ON q.id = qv.question_id
            WHERE ta.user_id = v_user_id
              AND aa.is_correct = false
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY qv.id
            LIMIT v_count
        ) qv;
    ELSE
        -- Default: Weak topics / Topic selection / Mixed
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;
    END IF;

    IF v_version_ids IS NULL OR array_length(v_version_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No qualifying questions found for selected criteria');
    END IF;

    -- Create practice session with frozen question versions
    INSERT INTO public.custom_practice_sessions (
        user_id, title, session_mode, target_topic_ids_json,
        total_questions, question_version_ids_json, status, created_at
    ) VALUES (
        v_user_id, COALESCE(p_title, 'Custom Practice - ' || p_session_mode),
        p_session_mode, to_jsonb(p_topic_ids),
        array_length(v_version_ids, 1), to_jsonb(v_version_ids),
        'READY', now()
    ) RETURNING id INTO v_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'question_count', array_length(v_version_ids, 1),
        'question_version_ids', v_version_ids
    );
END;
$$;

-- Function 2: Staff Errata Resolution & Gamification Bounty Pipeline
CREATE OR REPLACE FUNCTION public.fn_resolve_errata_report(
    p_report_id UUID,
    p_resolution_status TEXT, -- 'VERIFIED', 'RESOLVED', 'REJECTED'
    p_resolution_notes TEXT DEFAULT NULL,
    p_bounty_coins INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reviewer_id UUID;
    v_reviewer_role TEXT;
    v_report RECORD;
    v_event_id UUID;
    v_reward_res JSONB;
BEGIN
    v_reviewer_id := auth.uid();
    IF v_reviewer_id IS NOT NULL THEN
        SELECT role INTO v_reviewer_role FROM public.user_profiles WHERE id = v_reviewer_id;
        IF v_reviewer_role IS NULL OR v_reviewer_role NOT IN ('admin', 'content_manager', 'editor', 'teacher') THEN
            RAISE EXCEPTION 'Unauthorized: Caller does not have permission to review errata reports';
        END IF;
    END IF;

    SELECT * INTO v_report FROM public.question_errata_reports WHERE id = p_report_id;
    IF v_report IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report not found');
    END IF;

    IF p_resolution_status IN ('VERIFIED', 'RESOLVED') AND v_report.reward_coins_granted = 0 AND p_bounty_coins > 0 THEN
        -- Award gamification reward via Phase 3D atomic pipeline
        v_reward_res := public.fn_award_gamification_reward(
            v_report.reporter_user_id,
            'ERRATA_BOUNTY',
            p_bounty_coins,
            'bounty:errata:' || v_report.id::text,
            jsonb_build_object('report_id', v_report.id, 'question_id', v_report.question_id)
        );

        IF (v_reward_res->>'success')::boolean = true THEN
            v_event_id := (v_reward_res->>'event_id')::uuid;
        END IF;
    END IF;

    UPDATE public.question_errata_reports
    SET status = p_resolution_status,
        reviewer_user_id = COALESCE(v_reviewer_id, reviewer_user_id),
        resolution_notes = p_resolution_notes,
        reward_coins_granted = CASE WHEN p_resolution_status IN ('VERIFIED', 'RESOLVED') THEN p_bounty_coins ELSE 0 END,
        gamification_event_id = COALESCE(v_event_id, gamification_event_id),
        updated_at = now()
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
        'success', true,
        'report_id', p_report_id,
        'status', p_resolution_status,
        'bounty_coins_awarded', CASE WHEN p_resolution_status IN ('VERIFIED', 'RESOLVED') THEN p_bounty_coins ELSE 0 END
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(TEXT, TEXT, UUID[], INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(TEXT, TEXT, UUID[], INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_errata_report(UUID, TEXT, TEXT, INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_resolve_errata_report(UUID, TEXT, TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
