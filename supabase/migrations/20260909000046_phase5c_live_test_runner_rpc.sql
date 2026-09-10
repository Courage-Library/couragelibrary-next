-- ============================================================================
-- COURAGE LIBRARY — PHASE 5C: LIVE MOCK TEST RUNNER INTEGRATION
-- Migration 46: Atomic Live Test Start, Answer Persistence & Submission RPCs
-- ============================================================================

-- 1. Atomic Live Test Attempt Start / Resume Function
CREATE OR REPLACE FUNCTION public.fn_start_or_resume_live_test_attempt(
    p_event_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_reg RECORD;
    v_instance RECORD;
    v_attempt RECORD;
    v_now TIMESTAMPTZ := now();
    v_effective_end TIMESTAMPTZ;
    v_remaining_seconds INTEGER;
    v_is_late_joined BOOLEAN := false;
    v_new_attempt_id UUID;
BEGIN
    -- 1. Fetch Event with row-level lock
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_FOUND',
            'message', 'The requested live test event does not exist.'
        );
    END IF;

    -- 2. Verify Event Status is startable
    IF v_event.status NOT IN ('READY', 'LIVE') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_STARTABLE',
            'message', 'This live test event is not currently active.'
        );
    END IF;

    -- 3. Verify Server-Authoritative Timing Window
    IF v_now < v_event.event_start_at THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_NOT_STARTED',
            'message', 'The live test event has not started yet.'
        );
    END IF;

    IF v_now > (v_event.event_end_at + (v_event.grace_period_seconds * INTERVAL '1 second')) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EVENT_EXPIRED',
            'message', 'The live test event window and grace period have ended.'
        );
    END IF;

    -- 4. Validate Registration Ownership & State
    SELECT * INTO v_reg
    FROM public.live_test_registrations
    WHERE live_test_event_id = p_event_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_reg.status NOT IN ('REGISTERED', 'ATTENDED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'REGISTRATION_REQUIRED',
            'message', 'You must have an active registration for this live mock test.'
        );
    END IF;

    -- 5. Check if attempt already exists for this candidate & mock test
    SELECT * INTO v_attempt
    FROM public.test_attempts
    WHERE mock_test_id = v_event.mock_test_id
      AND user_id = p_user_id
      AND started_at >= (v_event.event_start_at - INTERVAL '1 hour')
    ORDER BY started_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Calculate authoritative effective end time & remaining seconds
    v_effective_end := v_event.event_end_at;
    v_remaining_seconds := GREATEST(0, EXTRACT(EPOCH FROM (v_effective_end - v_now))::INTEGER);

    IF FOUND THEN
        -- Check if attempt was already submitted or finalized
        IF v_attempt.status IN ('submitted', 'auto_submitted', 'completed', 'evaluated') THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'ATTEMPT_ALREADY_SUBMITTED',
                'attempt_id', v_attempt.id,
                'submitted_at', v_attempt.submitted_at,
                'message', 'This live test attempt has already been submitted.'
            );
        END IF;

        -- Update last activity on resume
        UPDATE public.test_attempts
        SET last_activity_at = v_now, updated_at = v_now
        WHERE id = v_attempt.id;

        RETURN jsonb_build_object(
            'success', true,
            'already_started', true,
            'attempt_id', v_attempt.id,
            'mock_test_id', v_event.mock_test_id,
            'event_id', p_event_id,
            'started_at', v_attempt.started_at,
            'effective_end_at', v_effective_end,
            'remaining_seconds', v_remaining_seconds,
            'duration_minutes', v_event.duration_minutes,
            'is_late_joined', (v_attempt.started_at > (v_event.event_start_at + INTERVAL '1 minute'))
        );
    END IF;

    -- 6. Late Join Cutoff Enforcement for First-Time Entry
    IF v_event.late_join_cutoff_minutes > 0 THEN
        IF v_now > (v_event.event_start_at + (v_event.late_join_cutoff_minutes * INTERVAL '1 minute')) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'LATE_JOIN_WINDOW_EXPIRED',
                'message', 'The late entry cutoff window for this live event has passed.'
            );
        END IF;
    END IF;

    IF v_now > (v_event.event_start_at + INTERVAL '1 minute') THEN
        v_is_late_joined := true;
    END IF;

    -- 7. Atomically Create New Test Attempt
    INSERT INTO public.test_attempts (
        mock_test_id,
        user_id,
        started_at,
        last_activity_at,
        time_taken_seconds,
        status
    )
    VALUES (
        v_event.mock_test_id,
        p_user_id,
        v_now,
        v_now,
        0,
        'in_progress'
    )
    RETURNING id INTO v_new_attempt_id;

    -- 8. Transition Registration Status: REGISTERED -> ATTENDED
    IF v_reg.status = 'REGISTERED' THEN
        UPDATE public.live_test_registrations
        SET status = 'ATTENDED', updated_at = v_now
        WHERE id = v_reg.id;
    END IF;

    -- 9. Increment Event Started Counter
    UPDATE public.live_test_events
    SET current_started_count = current_started_count + 1, updated_at = v_now
    WHERE id = p_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_started', false,
        'attempt_id', v_new_attempt_id,
        'mock_test_id', v_event.mock_test_id,
        'event_id', p_event_id,
        'started_at', v_now,
        'effective_end_at', v_effective_end,
        'remaining_seconds', v_remaining_seconds,
        'duration_minutes', v_event.duration_minutes,
        'is_late_joined', v_is_late_joined
    );
END;
$$;

-- 2. Atomic Live Test Answer Save Function with Expiry Auto-Submit
CREATE OR REPLACE FUNCTION public.fn_save_live_test_answer(
    p_attempt_id UUID,
    p_user_id UUID,
    p_mock_question_id UUID,
    p_question_version_id UUID,
    p_selected_option_key TEXT,
    p_is_marked_for_review BOOLEAN DEFAULT false,
    p_time_spent_seconds INTEGER DEFAULT 0,
    p_client_sequence INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_attempt RECORD;
    v_event RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validate Attempt & Ownership
    SELECT a.*, e.id AS live_event_id, e.event_end_at, e.grace_period_seconds, e.status AS event_status
    INTO v_attempt
    FROM public.test_attempts a
    JOIN public.live_test_events e ON e.mock_test_id = a.mock_test_id
    WHERE a.id = p_attempt_id AND a.user_id = p_user_id
    FOR UPDATE OF a;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ATTEMPT_NOT_FOUND',
            'message', 'Active test attempt not found.'
        );
    END IF;

    -- 2. Check if already submitted
    IF v_attempt.status IN ('submitted', 'auto_submitted', 'completed', 'evaluated') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ATTEMPT_ALREADY_SUBMITTED',
            'message', 'Attempt has already been finalized.'
        );
    END IF;

    -- 3. Check Authoritative Expiry (Event End + Grace Period)
    IF v_now > (v_attempt.event_end_at + (v_attempt.grace_period_seconds * INTERVAL '1 second')) THEN
        -- Auto-submit on expiry detection
        UPDATE public.test_attempts
        SET status = 'auto_submitted',
            submitted_at = v_now,
            time_taken_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::INTEGER),
            updated_at = v_now
        WHERE id = p_attempt_id;

        UPDATE public.live_test_events
        SET current_submitted_count = current_submitted_count + 1, updated_at = v_now
        WHERE id = v_attempt.live_event_id;

        RETURN jsonb_build_object(
            'success', false,
            'code', 'TIME_EXPIRED',
            'auto_submitted', true,
            'message', 'Exam window has expired. Attempt was automatically submitted.'
        );
    END IF;

    -- 4. Upsert Answer into attempt_answers
    INSERT INTO public.attempt_answers (
        attempt_id,
        mock_question_id,
        question_version_id,
        selected_option_key,
        is_marked_for_review,
        time_spent_seconds,
        updated_at
    )
    VALUES (
        p_attempt_id,
        p_mock_question_id,
        p_question_version_id,
        p_selected_option_key,
        COALESCE(p_is_marked_for_review, false),
        COALESCE(p_time_spent_seconds, 0),
        v_now
    )
    ON CONFLICT (attempt_id, mock_question_id)
    DO UPDATE SET
        selected_option_key = EXCLUDED.selected_option_key,
        is_marked_for_review = EXCLUDED.is_marked_for_review,
        time_spent_seconds = EXCLUDED.time_spent_seconds,
        updated_at = v_now;

    -- Update attempt last_activity
    UPDATE public.test_attempts
    SET last_activity_at = v_now, updated_at = v_now
    WHERE id = p_attempt_id;

    RETURN jsonb_build_object(
        'success', true,
        'synced_at', v_now,
        'client_sequence', p_client_sequence
    );
END;
$$;

-- 3. Atomic Live Test Attempt Submission Function
CREATE OR REPLACE FUNCTION public.fn_submit_live_test_attempt(
    p_attempt_id UUID,
    p_user_id UUID,
    p_auto_submitted BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_attempt RECORD;
    v_event RECORD;
    v_now TIMESTAMPTZ := now();
    v_final_status TEXT;
BEGIN
    -- 1. Validate Attempt & Lock Row
    SELECT a.*, e.id AS live_event_id
    INTO v_attempt
    FROM public.test_attempts a
    JOIN public.live_test_events e ON e.mock_test_id = a.mock_test_id
    WHERE a.id = p_attempt_id AND a.user_id = p_user_id
    FOR UPDATE OF a;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ATTEMPT_NOT_FOUND',
            'message', 'Attempt not found or unauthorized.'
        );
    END IF;

    -- 2. Idempotent Handling if already finalized
    IF v_attempt.status IN ('submitted', 'auto_submitted', 'completed', 'evaluated') THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_submitted', true,
            'submitted_at', v_attempt.submitted_at,
            'status', v_attempt.status,
            'message', 'Attempt was already submitted.'
        );
    END IF;

    -- 3. Finalize Attempt Status
    v_final_status := CASE WHEN p_auto_submitted THEN 'auto_submitted' ELSE 'submitted' END;

    UPDATE public.test_attempts
    SET status = v_final_status,
        submitted_at = v_now,
        time_taken_seconds = GREATEST(0, EXTRACT(EPOCH FROM (v_now - started_at))::INTEGER),
        updated_at = v_now
    WHERE id = p_attempt_id;

    -- 4. Increment Event Submitted Counter
    UPDATE public.live_test_events
    SET current_submitted_count = current_submitted_count + 1, updated_at = v_now
    WHERE id = v_attempt.live_event_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_submitted', false,
        'submitted_at', v_now,
        'status', v_final_status,
        'time_taken_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_attempt.started_at))::INTEGER),
        'message', 'Your submission has been securely recorded. Results will be available when published.'
    );
END;
$$;
