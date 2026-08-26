-- ============================================================================
-- COURAGE LIBRARY — PHASE 3F: RUNTIME RPC FUNCTIONS
-- Target Database: couragelibrary-next
-- ============================================================================

-- Function 1: Server-Authoritative Playback Heartbeat with Velocity & Anti-Cheat Capping
CREATE OR REPLACE FUNCTION public.fn_update_lesson_playback_position(
    p_lesson_id UUID,
    p_position_seconds INTEGER,
    p_elapsed_real_seconds INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_duration INTEGER;
    v_is_preview BOOLEAN;
    v_course_tier TEXT;
    v_is_entitled BOOLEAN := false;
    v_curr_record RECORD;
    v_server_delta NUMERIC;
    v_valid_elapsed INTEGER;
    v_max_jump INTEGER;
    v_new_max_watched INTEGER;
    v_new_verified_spent INTEGER;
    v_session_count INTEGER := 1;
    v_capped_position INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    IF p_position_seconds < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid position: Cannot be negative');
    END IF;

    -- 1. Fetch lesson and course metadata
    SELECT 
        cl.duration_seconds,
        cl.is_free_preview,
        c.id AS course_id,
        c.access_tier
    INTO v_duration, v_is_preview, v_course_id, v_course_tier
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    JOIN public.courses c ON c.id = cm.course_id
    WHERE cl.id = p_lesson_id AND cl.is_published = true;

    IF v_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lesson not found or unpublished');
    END IF;

    -- 2. Entitlement verification
    IF v_is_preview = true OR v_course_tier = 'FREE' THEN
        v_is_entitled := true;
    ELSIF v_course_tier = 'PRO' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    ELSIF v_course_tier = 'PAID' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'COURSE_PURCHASE'
              AND course_id = v_course_id
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    END IF;

    IF NOT v_is_entitled THEN
        RETURN jsonb_build_object('success', false, 'error', 'Entitlement required to access lesson');
    END IF;

    -- 3. Position capping
    IF v_duration > 0 AND p_position_seconds > (v_duration + 5) THEN
        v_capped_position := v_duration;
    ELSE
        v_capped_position := p_position_seconds;
    END IF;

    -- 4. Load existing playback state
    SELECT * INTO v_curr_record
    FROM public.user_lesson_completions
    WHERE user_id = v_user_id AND lesson_id = p_lesson_id;

    IF v_curr_record IS NOT NULL THEN
        -- Calculate server wall-clock delta
        v_server_delta := EXTRACT(EPOCH FROM (now() - v_curr_record.last_interaction_at));
        
        -- Session attempt check (30 min inactivity threshold)
        IF v_server_delta > 1800 THEN
            v_session_count := v_curr_record.session_attempt_count + 1;
            v_valid_elapsed := LEAST(COALESCE(p_elapsed_real_seconds, 10), 30);
        ELSE
            v_session_count := v_curr_record.session_attempt_count;
            -- Validated elapsed: bounded by client elapsed, server elapsed + tolerance, and max 30s
            v_valid_elapsed := LEAST(COALESCE(p_elapsed_real_seconds, 10), GREATEST(1, v_server_delta::integer + 2), 30);
        END IF;

        -- Velocity cap: max advancement is valid_elapsed * 2.0 (2x speed)
        v_max_jump := v_valid_elapsed * 2;
        v_new_max_watched := GREATEST(v_curr_record.max_watched_seconds, LEAST(v_curr_record.max_watched_seconds + v_max_jump, v_capped_position));
        v_new_verified_spent := v_curr_record.verified_seconds_spent + v_valid_elapsed;

        UPDATE public.user_lesson_completions
        SET playback_position_seconds = v_capped_position,
            max_watched_seconds = v_new_max_watched,
            verified_seconds_spent = v_new_verified_spent,
            session_attempt_count = v_session_count,
            last_interaction_at = now(),
            updated_at = now()
        WHERE user_id = v_user_id AND lesson_id = p_lesson_id;
    ELSE
        v_valid_elapsed := LEAST(COALESCE(p_elapsed_real_seconds, 10), 30);
        v_new_max_watched := LEAST(v_valid_elapsed * 2, v_capped_position);
        v_new_verified_spent := v_valid_elapsed;

        INSERT INTO public.user_lesson_completions (
            user_id, course_id, lesson_id, playback_position_seconds,
            max_watched_seconds, verified_seconds_spent, session_attempt_count,
            last_interaction_at
        ) VALUES (
            v_user_id, v_course_id, p_lesson_id, v_capped_position,
            v_new_max_watched, v_new_verified_spent, 1,
            now()
        );
    END IF;

    -- 5. Update course-level last accessed pointer
    INSERT INTO public.user_course_progress (
        user_id, course_id, last_lesson_id, last_accessed_at
    ) VALUES (
        v_user_id, v_course_id, p_lesson_id, now()
    ) ON CONFLICT (user_id, course_id) DO UPDATE SET
        last_lesson_id = p_lesson_id,
        last_accessed_at = now(),
        updated_at = now();

    RETURN jsonb_build_object(
        'success', true,
        'lesson_id', p_lesson_id,
        'playback_position_seconds', v_capped_position,
        'max_watched_seconds', v_new_max_watched,
        'verified_seconds_spent', v_new_verified_spent
    );
END;
$$;

-- Function 2: Server-Authoritative Lesson Completion Engine
CREATE OR REPLACE FUNCTION public.fn_complete_course_lesson(
    p_lesson_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_lesson_type TEXT;
    v_duration INTEGER;
    v_learning_res_id UUID;
    v_canonical_topic_id UUID;
    v_is_preview BOOLEAN;
    v_course_tier TEXT;
    v_is_entitled BOOLEAN := false;
    v_curr_record RECORD;
    v_total_lessons INTEGER;
    v_completed_lessons INTEGER;
    v_progress_pct NUMERIC(5,2);
    v_is_course_done BOOLEAN := false;
    v_idempotency_key TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    -- 1. Fetch lesson and course metadata
    SELECT 
        cl.lesson_type,
        cl.duration_seconds,
        cl.learning_resource_id,
        cl.is_free_preview,
        c.id AS course_id,
        c.access_tier
    INTO v_lesson_type, v_duration, v_learning_res_id, v_is_preview, v_course_id, v_course_tier
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    JOIN public.courses c ON c.id = cm.course_id
    WHERE cl.id = p_lesson_id AND cl.is_published = true;

    IF v_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lesson not found or unpublished');
    END IF;

    -- 2. Entitlement verification
    IF v_is_preview = true OR v_course_tier = 'FREE' THEN
        v_is_entitled := true;
    ELSIF v_course_tier = 'PRO' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    ELSIF v_course_tier = 'PAID' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'COURSE_PURCHASE'
              AND course_id = v_course_id
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    END IF;

    IF NOT v_is_entitled THEN
        RETURN jsonb_build_object('success', false, 'error', 'Entitlement required to complete lesson');
    END IF;

    -- 3. Verify server-authoritative completion threshold
    SELECT * INTO v_curr_record
    FROM public.user_lesson_completions
    WHERE user_id = v_user_id AND lesson_id = p_lesson_id;

    IF v_lesson_type = 'VIDEO' AND v_duration > 0 THEN
        IF v_curr_record IS NULL OR 
           v_curr_record.max_watched_seconds < (0.85 * v_duration) OR 
           v_curr_record.verified_seconds_spent < (0.70 * v_duration) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Completion criteria not met',
                'max_watched_seconds', COALESCE(v_curr_record.max_watched_seconds, 0),
                'required_max_watched', ROUND(0.85 * v_duration),
                'verified_seconds_spent', COALESCE(v_curr_record.verified_seconds_spent, 0),
                'required_verified_spent', ROUND(0.70 * v_duration)
            );
        END IF;
    ELSE
        -- TEXT / ARTICLE / QUIZ lessons: require minimum verified dwell time
        IF v_curr_record IS NOT NULL AND v_curr_record.verified_seconds_spent < LEAST(60, 0.50 * COALESCE(v_duration, 120)) THEN
            -- Allow completion if at least 15s verified
            IF v_curr_record.verified_seconds_spent < 15 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Minimum reading dwell time required before completion');
            END IF;
        END IF;
    END IF;

    -- 4. Mark lesson completed (Idempotent)
    INSERT INTO public.user_lesson_completions (
        user_id, course_id, lesson_id, is_completed, completed_at, last_interaction_at
    ) VALUES (
        v_user_id, v_course_id, p_lesson_id, true, now(), now()
    ) ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        is_completed = true,
        completed_at = COALESCE(user_lesson_completions.completed_at, now()),
        updated_at = now();

    -- 5. Lock course progress row and recalculate aggregate percentage
    PERFORM 1 FROM public.user_course_progress
    WHERE user_id = v_user_id AND course_id = v_course_id
    FOR UPDATE;

    SELECT COUNT(cl.id) INTO v_total_lessons
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    WHERE cm.course_id = v_course_id AND cl.is_published = true;

    SELECT COUNT(DISTINCT ulc.lesson_id) INTO v_completed_lessons
    FROM public.user_lesson_completions ulc
    JOIN public.course_lessons cl ON cl.id = ulc.lesson_id
    JOIN public.course_modules cm ON cm.id = cl.module_id
    WHERE ulc.user_id = v_user_id
      AND cm.course_id = v_course_id
      AND ulc.is_completed = true
      AND cl.is_published = true;

    IF v_total_lessons > 0 THEN
        v_progress_pct := ROUND((v_completed_lessons::numeric / v_total_lessons::numeric) * 100.0, 2);
    ELSE
        v_progress_pct := 0.00;
    END IF;

    IF v_progress_pct >= 100.00 THEN
        v_is_course_done := true;
    END IF;

    INSERT INTO public.user_course_progress (
        user_id, course_id, total_lessons, completed_lessons,
        progress_pct, last_lesson_id, is_completed, completed_at, last_accessed_at
    ) VALUES (
        v_user_id, v_course_id, v_total_lessons, v_completed_lessons,
        v_progress_pct, p_lesson_id, v_is_course_done,
        CASE WHEN v_is_course_done THEN now() ELSE NULL END, now()
    ) ON CONFLICT (user_id, course_id) DO UPDATE SET
        total_lessons = v_total_lessons,
        completed_lessons = v_completed_lessons,
        progress_pct = v_progress_pct,
        last_lesson_id = p_lesson_id,
        is_completed = v_is_course_done,
        completed_at = CASE 
            WHEN v_is_course_done AND user_course_progress.completed_at IS NULL THEN now()
            ELSE user_course_progress.completed_at END,
        last_accessed_at = now(),
        updated_at = now();

    -- 6. Resolve canonical topic from learning resource
    IF v_learning_res_id IS NOT NULL THEN
        SELECT topic_id INTO v_canonical_topic_id
        FROM public.learning_resource_topics
        WHERE learning_resource_id = v_learning_res_id
        ORDER BY is_primary DESC, relevance_score DESC
        LIMIT 1;

        -- 7. Emit idempotent learning activity event (Theory Coverage Only)
        IF v_canonical_topic_id IS NOT NULL THEN
            v_idempotency_key := 'lesson_completed:' || v_user_id::text || ':' || p_lesson_id::text;
            
            INSERT INTO public.learning_activity_events (
                user_id,
                topic_id,
                event_type,
                resource_type,
                resource_id,
                idempotency_key,
                event_payload
            ) VALUES (
                v_user_id,
                v_canonical_topic_id,
                'LESSON_COMPLETED',
                'COURSE_LESSON',
                p_lesson_id,
                v_idempotency_key,
                jsonb_build_object(
                    'course_id', v_course_id,
                    'lesson_id', p_lesson_id,
                    'duration_seconds', v_duration,
                    'completed_at', now()
                )
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lesson_id', p_lesson_id,
        'is_completed', true,
        'completed_lessons', v_completed_lessons,
        'total_lessons', v_total_lessons,
        'progress_pct', v_progress_pct,
        'is_course_completed', v_is_course_done
    );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.fn_update_lesson_playback_position(UUID, INTEGER, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_update_lesson_playback_position(UUID, INTEGER, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_complete_course_lesson(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_complete_course_lesson(UUID) TO authenticated, service_role;
