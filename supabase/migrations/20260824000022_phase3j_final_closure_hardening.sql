-- ============================================================================
-- COURAGE LIBRARY — PHASE 3J: FINAL CLOSURE HARDENING
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. DROP LEGACY 2-ARGUMENT OVERLOAD
DROP FUNCTION IF EXISTS public.fn_generate_daily_recommendations(UUID, DATE);

-- 2. HARDEN STATUS TRANSITION RPC
CREATE OR REPLACE FUNCTION public.fn_update_daily_recommendation_status(
    p_recommendation_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_rec RECORD;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    IF p_status NOT IN ('COMPLETED', 'DISMISSED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid status. Must be COMPLETED or DISMISSED');
    END IF;

    -- Lock row
    SELECT * INTO v_rec
    FROM public.daily_study_recommendations
    WHERE id = p_recommendation_id
    FOR UPDATE;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recommendation not found');
    END IF;

    IF v_rec.user_id != v_user_id AND auth.role() != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: You do not own this recommendation');
    END IF;

    -- Idempotent return if already in desired state
    IF v_rec.status = p_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'recommendation_id', v_rec.id,
            'status', v_rec.status,
            'already_updated', true
        );
    END IF;

    -- Strict Lifecycle Enforcement: Terminal states cannot regress
    IF v_rec.status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Illegal transition: COMPLETED recommendation cannot be updated to ' || p_status);
    ELSIF v_rec.status = 'DISMISSED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Illegal transition: DISMISSED recommendation cannot be updated to ' || p_status);
    END IF;

    -- Update status
    UPDATE public.daily_study_recommendations
    SET status = p_status,
        completed_at = CASE WHEN p_status = 'COMPLETED' THEN now() ELSE completed_at END
    WHERE id = v_rec.id;

    RETURN jsonb_build_object(
        'success', true,
        'recommendation_id', v_rec.id,
        'status', p_status,
        'completed_at', CASE WHEN p_status = 'COMPLETED' THEN now() ELSE v_rec.completed_at END
    );
END;
$$;


-- 3. HARDEN DIAGNOSTIC ASSESSMENT COMPLETION WITH EXACT EXAM MAPPING
CREATE OR REPLACE FUNCTION public.fn_complete_diagnostic_assessment(
    p_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_attempt RECORD;
    v_exam_id UUID;
    v_diagnostic RECORD;
    v_result RECORD;
    v_result_id UUID;
    v_weak_topics UUID[] := '{}';
    v_strong_topics UUID[] := '{}';
    v_accuracy NUMERIC(5,2) := 0.00;
    v_baseline_readiness NUMERIC(5,2) := 0.00;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Verify attempt ownership
    SELECT * INTO v_attempt
    FROM public.test_attempts
    WHERE id = p_attempt_id;

    IF v_attempt IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Test attempt not found');
    END IF;

    IF v_attempt.user_id != v_user_id AND auth.role() != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Forbidden: You do not own this test attempt');
    END IF;

    -- Verify attempt is completed in Phase 3B
    IF v_attempt.status NOT IN ('COMPLETED', 'EVALUATED', 'SUBMITTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot complete diagnostic: Attempt is still ' || v_attempt.status);
    END IF;

    -- Resolve authoritative exam context from mock_templates
    SELECT exam_id INTO v_exam_id
    FROM public.mock_templates
    WHERE id = v_attempt.mock_template_id;

    -- Deterministic diagnostic lookup via composite UNIQUE(exam_id, mock_template_id)
    SELECT * INTO v_diagnostic
    FROM public.diagnostic_assessments
    WHERE exam_id = v_exam_id
      AND mock_template_id = v_attempt.mock_template_id
      AND is_active = true;

    IF v_diagnostic IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'This attempt does not correspond to an active diagnostic assessment');
    END IF;

    -- Idempotency check
    SELECT * INTO v_result
    FROM public.user_diagnostic_results
    WHERE attempt_id = p_attempt_id;

    IF v_result IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'diagnostic_result_id', v_result.id,
            'overall_score', v_result.overall_score,
            'accuracy_pct', v_result.accuracy_pct,
            'baseline_readiness_pct', v_result.baseline_readiness_pct,
            'already_completed', true
        );
    END IF;

    -- Compute accuracy
    IF v_attempt.total_questions > 0 THEN
        v_accuracy := round((COALESCE(v_attempt.correct_count, 0)::numeric / v_attempt.total_questions::numeric) * 100.00, 2);
    END IF;

    v_baseline_readiness := v_accuracy;

    -- Identify weak & strong topics deterministically
    SELECT ARRAY_AGG(topic_id) INTO v_weak_topics
    FROM (
        SELECT q.topic_id
        FROM public.attempt_answers aa
        JOIN public.questions q ON q.id = aa.question_id
        WHERE aa.attempt_id = p_attempt_id AND aa.is_correct = false AND q.topic_id IS NOT NULL
        GROUP BY q.topic_id
        ORDER BY count(*) DESC, q.topic_id ASC
        LIMIT 3
    ) w;

    SELECT ARRAY_AGG(topic_id) INTO v_strong_topics
    FROM (
        SELECT q.topic_id
        FROM public.attempt_answers aa
        JOIN public.questions q ON q.id = aa.question_id
        WHERE aa.attempt_id = p_attempt_id AND aa.is_correct = true AND q.topic_id IS NOT NULL
        GROUP BY q.topic_id
        ORDER BY count(*) DESC, q.topic_id ASC
        LIMIT 3
    ) s;

    -- Insert User Diagnostic Result snapshot
    INSERT INTO public.user_diagnostic_results (
        user_id, diagnostic_assessment_id, attempt_id,
        overall_score, accuracy_pct, weak_topic_ids, strong_topic_ids,
        baseline_readiness_pct, completed_at
    ) VALUES (
        v_attempt.user_id, v_diagnostic.id, p_attempt_id,
        COALESCE(v_attempt.total_score, 0.00), v_accuracy,
        COALESCE(v_weak_topics, '{}'), COALESCE(v_strong_topics, '{}'),
        v_baseline_readiness, now()
    ) RETURNING id INTO v_result_id;

    RETURN jsonb_build_object(
        'success', true,
        'diagnostic_result_id', v_result_id,
        'overall_score', COALESCE(v_attempt.total_score, 0.00),
        'accuracy_pct', v_accuracy,
        'weak_topic_count', COALESCE(array_length(v_weak_topics, 1), 0),
        'strong_topic_count', COALESCE(array_length(v_strong_topics, 1), 0),
        'baseline_readiness_pct', v_baseline_readiness
    );
END;
$$;


-- 4. HARDEN FIRST-TIME SPACED REPETITION CONCURRENCY
CREATE OR REPLACE FUNCTION public.fn_update_spaced_repetition_review(
    p_user_id UUID,
    p_question_id UUID DEFAULT NULL,
    p_topic_id UUID DEFAULT NULL,
    p_quality INTEGER DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_schedule RECORD;
    v_new_level INTEGER;
    v_new_interval INTEGER;
    v_new_ease NUMERIC(4,2);
    v_next_review TIMESTAMPTZ;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_id is required');
    END IF;

    IF p_quality < 0 OR p_quality > 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'p_quality must be between 0 and 5');
    END IF;

    IF (p_question_id IS NULL AND p_topic_id IS NULL) OR
       (p_question_id IS NOT NULL AND p_topic_id IS NOT NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Exactly one of question_id or topic_id must be supplied');
    END IF;

    -- Row-locked lookup
    IF p_question_id IS NOT NULL THEN
        SELECT * INTO v_schedule
        FROM public.spaced_repetition_schedules
        WHERE user_id = p_user_id AND question_id = p_question_id
        FOR UPDATE;
    ELSE
        SELECT * INTO v_schedule
        FROM public.spaced_repetition_schedules
        WHERE user_id = p_user_id AND topic_id = p_topic_id
        FOR UPDATE;
    END IF;

    IF v_schedule IS NULL THEN
        IF p_quality >= 3 THEN
            v_new_level := 2;
            v_new_interval := 3;
            v_new_ease := 2.50;
        ELSE
            v_new_level := 1;
            v_new_interval := 1;
            v_new_ease := 2.50;
        END IF;

        v_next_review := now() + (v_new_interval || ' days')::interval;

        -- Concurrency-Safe First-Time Insert with ON CONFLICT DO UPDATE
        IF p_question_id IS NOT NULL THEN
            INSERT INTO public.spaced_repetition_schedules (
                user_id, question_id, topic_id, repetition_level,
                interval_days, ease_factor, last_reviewed_at, next_review_at, review_count
            ) VALUES (
                p_user_id, p_question_id, NULL, v_new_level,
                v_new_interval, v_new_ease, now(), v_next_review, 1
            )
            ON CONFLICT (user_id, question_id) DO UPDATE
                SET repetition_level = EXCLUDED.repetition_level,
                    interval_days = EXCLUDED.interval_days,
                    ease_factor = EXCLUDED.ease_factor,
                    last_reviewed_at = now(),
                    next_review_at = EXCLUDED.next_review_at,
                    review_count = public.spaced_repetition_schedules.review_count + 1,
                    updated_at = now();
        ELSE
            INSERT INTO public.spaced_repetition_schedules (
                user_id, question_id, topic_id, repetition_level,
                interval_days, ease_factor, last_reviewed_at, next_review_at, review_count
            ) VALUES (
                p_user_id, NULL, p_topic_id, v_new_level,
                v_new_interval, v_new_ease, now(), v_next_review, 1
            )
            ON CONFLICT (user_id, topic_id) DO UPDATE
                SET repetition_level = EXCLUDED.repetition_level,
                    interval_days = EXCLUDED.interval_days,
                    ease_factor = EXCLUDED.ease_factor,
                    last_reviewed_at = now(),
                    next_review_at = EXCLUDED.next_review_at,
                    review_count = public.spaced_repetition_schedules.review_count + 1,
                    updated_at = now();
        END IF;
    ELSE
        IF p_quality >= 3 THEN
            v_new_level := v_schedule.repetition_level + 1;
            v_new_interval := round(v_schedule.interval_days * v_schedule.ease_factor);
            IF v_new_interval < 1 THEN v_new_interval := 1; END IF;
            v_new_ease := v_schedule.ease_factor + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02));
            IF v_new_ease < 1.30 THEN v_new_ease := 1.30; END IF;
        ELSE
            v_new_level := 1;
            v_new_interval := 1;
            v_new_ease := GREATEST(1.30, v_schedule.ease_factor - 0.20);
        END IF;

        v_next_review := now() + (v_new_interval || ' days')::interval;

        UPDATE public.spaced_repetition_schedules
        SET repetition_level = v_new_level,
            interval_days = v_new_interval,
            ease_factor = v_new_ease,
            last_reviewed_at = now(),
            next_review_at = v_next_review,
            review_count = review_count + 1,
            updated_at = now()
        WHERE id = v_schedule.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'repetition_level', v_new_level,
        'interval_days', v_new_interval,
        'ease_factor', v_new_ease,
        'next_review_at', v_next_review
    );
END;
$$;


-- 5. HARDEN DAILY RECOMMENDATION ENGINE (SCORE-BASED SORTING & ZERO-GOAL URGENCY)
CREATE OR REPLACE FUNCTION public.fn_generate_daily_recommendations(
    p_user_id UUID DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE,
    p_engine_version TEXT DEFAULT 'v1.0'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_target_user UUID;
    v_existing_count INTEGER;
    v_weak_topic RECORD;
    v_spaced_item RECORD;
    v_learn_res RECORD;
    v_exam_goal RECORD;
    v_days_to_exam INTEGER := NULL;
    v_urgency_score NUMERIC(5,2) := 0.00;
    v_has_pro BOOLEAN := false;

    -- Candidate record structure
    v_candidates JSONB[] := '{}';
    v_cand JSONB;
    v_rank INTEGER := 1;
BEGIN
    -- Cross-User Guard
    IF v_caller IS NOT NULL AND auth.role() != 'service_role' THEN
        IF p_user_id IS NOT NULL AND p_user_id != v_caller THEN
            RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Cannot generate recommendations for another user');
        END IF;
        v_target_user := v_caller;
    ELSE
        v_target_user := COALESCE(p_user_id, v_caller);
    END IF;

    IF v_target_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user_id required');
    END IF;

    -- Idempotency check with engine_version
    SELECT COUNT(*) INTO v_existing_count
    FROM public.daily_study_recommendations
    WHERE user_id = v_target_user
      AND recommendation_date = p_date
      AND engine_version = p_engine_version;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'user_id', v_target_user,
            'recommendation_date', p_date,
            'engine_version', p_engine_version,
            'task_count', v_existing_count,
            'already_generated', true
        );
    END IF;

    -- Check Pro Entitlement status (Phase 3I)
    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements
        WHERE user_id = v_target_user
          AND entitlement_type = 'SUBSCRIPTION'
          AND status = 'ACTIVE'
          AND (valid_until IS NULL OR valid_until > now())
    ) INTO v_has_pro;

    -- Calculate exam urgency (ONLY if a future exam date exists)
    SELECT * INTO v_exam_goal
    FROM public.user_exam_goals
    WHERE user_id = v_target_user AND is_primary = true
    LIMIT 1;

    IF v_exam_goal.target_exam_date IS NOT NULL AND v_exam_goal.target_exam_date > CURRENT_DATE THEN
        v_days_to_exam := (v_exam_goal.target_exam_date - CURRENT_DATE);
        v_urgency_score := round(GREATEST(0.00, LEAST(15.00, 15.00 - (v_days_to_exam::numeric / 10.00))), 2);
    ELSE
        v_days_to_exam := NULL;
        v_urgency_score := 0.00;
    END IF;

    -- =========================================================================
    -- CANDIDATE 1: Practice Weak Topic
    -- =========================================================================
    SELECT utm.topic_id, t.name as topic_name, utm.mastery_score,
           COALESCE((
               SELECT COUNT(*)
               FROM public.attempt_answers aa
               JOIN public.questions q ON q.id = aa.question_id
               WHERE aa.attempt_id IN (
                   SELECT id FROM public.test_attempts
                   WHERE user_id = v_target_user AND started_at >= (now() - interval '7 days')
               ) AND aa.is_correct = false AND q.topic_id = utm.topic_id
           ), 0) as recent_errors
    INTO v_weak_topic
    FROM public.user_topic_mastery utm
    JOIN public.topics t ON t.id = utm.topic_id
    WHERE utm.user_id = v_target_user
    ORDER BY utm.mastery_score ASC
    LIMIT 1;

    IF v_weak_topic.topic_id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := round((1.00 - v_weak_topic.mastery_score) * 40.00, 2);
            e_score NUMERIC(5,2) := round(LEAST(25.00, v_weak_topic.recent_errors * 5.00), 2);
            f_score NUMERIC(5,2) := 0.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'PRACTICE_WEAK_TOPIC',
                'topic_id', v_weak_topic.topic_id,
                'resource_id', null,
                'priority_score', tot_score,
                'reason_code', 'LOW_MASTERY',
                'reason_text', 'Focus practice on ' || v_weak_topic.topic_name || ' (Mastery: ' || round(v_weak_topic.mastery_score * 100, 0)::text || '%)',
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'mastery_score', v_weak_topic.mastery_score,
                    'recent_errors', v_weak_topic.recent_errors,
                    'days_to_exam', v_days_to_exam,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- =========================================================================
    -- CANDIDATE 2: Spaced Repetition Due
    -- =========================================================================
    SELECT srs.id, srs.question_id, srs.topic_id, srs.repetition_level, srs.interval_days,
           t.name as topic_name
    INTO v_spaced_item
    FROM public.spaced_repetition_schedules srs
    LEFT JOIN public.topics t ON t.id = srs.topic_id
    WHERE srs.user_id = v_target_user AND srs.next_review_at <= now()
    ORDER BY srs.next_review_at ASC
    LIMIT 1;

    IF v_spaced_item.id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := 10.00;
            e_score NUMERIC(5,2) := 0.00;
            f_score NUMERIC(5,2) := 20.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'SPACED_REVISION',
                'topic_id', v_spaced_item.topic_id,
                'resource_id', null,
                'priority_score', tot_score,
                'reason_code', 'FORGETTING_DUE',
                'reason_text', 'Spaced review scheduled for ' || COALESCE(v_spaced_item.topic_name, 'Topic') || ' retention reinforcement',
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'repetition_level', v_spaced_item.repetition_level,
                    'interval_days', v_spaced_item.interval_days,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- =========================================================================
    -- CANDIDATE 3: Learn Resource (Entitlement-Aware)
    -- =========================================================================
    SELECT lr.id, lr.title, lr.topic_id, lr.is_premium
    INTO v_learn_res
    FROM public.learning_resources lr
    WHERE lr.is_published = true
      AND (lr.is_premium = false OR v_has_pro = true)
    ORDER BY lr.created_at DESC
    LIMIT 1;

    IF v_learn_res.id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := 5.00;
            e_score NUMERIC(5,2) := 0.00;
            f_score NUMERIC(5,2) := 5.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'LEARN_RESOURCE',
                'topic_id', v_learn_res.topic_id,
                'resource_id', v_learn_res.id,
                'priority_score', tot_score,
                'reason_code', 'DAILY_STREAK_GOAL',
                'reason_text', 'Read: ' || v_learn_res.title,
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'is_premium', v_learn_res.is_premium,
                    'has_pro_access', v_has_pro,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- =========================================================================
    -- SCORE-BASED SORTING & IMMUTABLE INSERT (MAX 3 TASKS)
    -- =========================================================================
    FOR v_cand IN
        SELECT elem
        FROM unnest(v_candidates) AS elem
        ORDER BY (elem->>'priority_score')::numeric DESC, (elem->>'action_type') ASC
        LIMIT 3
    LOOP
        INSERT INTO public.daily_study_recommendations (
            user_id, recommendation_date, priority_rank, action_type,
            topic_id, resource_id, priority_score, reason_code, reason_text_snapshot,
            signal_snapshot_json, engine_version, status
        ) VALUES (
            v_target_user, p_date, v_rank, (v_cand->>'action_type'),
            (v_cand->>'topic_id')::uuid, (v_cand->>'resource_id')::uuid,
            (v_cand->>'priority_score')::numeric, (v_cand->>'reason_code'),
            (v_cand->>'reason_text'), (v_cand->'signals'),
            p_engine_version, 'PENDING'
        );
        v_rank := v_rank + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_user,
        'recommendation_date', p_date,
        'engine_version', p_engine_version,
        'tasks_generated', v_rank - 1
    );
END;
$$;

-- Revoke & Grant Execute Permissions
REVOKE EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(UUID, DATE, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(UUID, DATE, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_update_daily_recommendation_status(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_update_spaced_repetition_review(UUID, UUID, UUID, INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_update_spaced_repetition_review(UUID, UUID, UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
