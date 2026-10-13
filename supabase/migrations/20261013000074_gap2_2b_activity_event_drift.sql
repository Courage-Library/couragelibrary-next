-- =============================================================================
-- COURAGE LIBRARY — GAP2-2b (follow-up): ACTIVITY-EVENT DRIFT IN RE-POINTED FUNCTIONS
-- Migration: 20261013000074_gap2_2b_activity_event_drift.sql
--
-- Functions only (no schema, policy or grant change). Found by the GAP2-2b DB tests after 073:
-- 1. fn_create_discussion_thread: its activity-log insert into learning_activity_events could never
--    succeed (missing NOT NULL resource_slug / topic_id; event_type 'COMMUNITY_DOUBT_ASKED' is not
--    allowed by learning_activity_events_event_type_check), so no thread could be created. Removed.
-- 2. fn_complete_course_lesson: the lesson-completed event used columns that were never deployed.
--    Rewritten to the deployed shape (event_type 'ARTICLE_COMPLETED', resource_slug = the lesson's
--    learning document slug, metadata), once per user + lesson.
-- CREATE OR REPLACE keeps each function's ACL; SECURITY DEFINER + search_path unchanged.
-- Rollback: docs/database/rollback/073_rollback.sql restores the pre-073 definitions (covers 074).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_create_discussion_thread(p_context_type text, p_context_id uuid, p_title text, p_initial_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_id UUID;
    v_message_id UUID;
    v_q_id UUID := NULL;
    v_lesson_id UUID := NULL;
    v_document_id UUID := NULL;
    v_topic_id UUID := NULL;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) < 5 OR length(p_title) > 250 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Title must be between 5 and 250 characters');
    END IF;

    IF p_initial_content IS NULL OR length(trim(p_initial_content)) < 2 OR length(p_initial_content) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial content must be between 2 and 10000 characters');
    END IF;

    IF p_context_type = 'QUESTION' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced question does not exist');
        END IF;
        v_q_id := p_context_id;
    ELSIF p_context_type = 'LESSON' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced lesson does not exist');
        END IF;
        v_lesson_id := p_context_id;
    ELSIF p_context_type = 'ARTICLE' THEN 
        -- GAP2-2b: ARTICLE context = a PUBLISHED learning document (legacy stack retired).
        IF NOT EXISTS (
            SELECT 1 FROM public.learning_documents
            WHERE id = p_context_id AND status = 'PUBLISHED' AND current_published_version_id IS NOT NULL
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced article does not exist');
        END IF;
        v_document_id := p_context_id;
    ELSIF p_context_type = 'TOPIC' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced topic does not exist');
        END IF;
        v_topic_id := p_context_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid context_type');
    END IF;

    INSERT INTO public.discussion_threads (
        context_type, question_id, lesson_id, learning_document_id, topic_id,
        author_id, title, status, message_count, last_activity_at
    ) VALUES (
        p_context_type, v_q_id, v_lesson_id, v_document_id, v_topic_id,
        v_user_id, trim(p_title), 'OPEN', 1, now()
    ) RETURNING id INTO v_thread_id;

    INSERT INTO public.discussion_messages (
        thread_id, author_id, parent_message_id, content_markdown
    ) VALUES (
        v_thread_id, v_user_id, NULL, trim(p_initial_content)
    ) RETURNING id INTO v_message_id;

    -- GAP2-2b (074): the former activity-log insert is removed. learning_activity_events requires
    -- topic_id + resource_slug and its event_type check does not allow the community doubt event, so
    -- that insert failed for every context and no thread could ever be created. Community activity
    -- events are backlog (LOOP-1 / DRIFT); no schema change in this phase.

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', v_thread_id,
        'root_message_id', v_message_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_complete_course_lesson(p_lesson_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_lesson_type TEXT;
    v_duration INTEGER;
    v_learning_doc_id UUID;
    v_canonical_topic_id UUID;
    v_is_preview BOOLEAN;
    v_course_tier TEXT;
    v_is_entitled BOOLEAN := false;
    v_curr_record RECORD;
    v_total_lessons INTEGER;
    v_completed_lessons INTEGER;
    v_progress_pct NUMERIC(5,2);
    v_is_course_done BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    SELECT 
        cl.lesson_type,
        cl.duration_seconds,
        cl.learning_document_id,
        cl.is_free_preview,
        c.id AS course_id,
        c.access_tier
    INTO v_lesson_type, v_duration, v_learning_doc_id, v_is_preview, v_course_id, v_course_tier
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    JOIN public.courses c ON c.id = cm.course_id
    WHERE cl.id = p_lesson_id AND cl.is_published = true;

    IF v_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lesson not found or unpublished');
    END IF;

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
        IF v_curr_record IS NOT NULL AND v_curr_record.verified_seconds_spent < LEAST(60, 0.50 * COALESCE(v_duration, 120)) THEN
            IF v_curr_record.verified_seconds_spent < 15 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Minimum reading dwell time required before completion');
            END IF;
        END IF;
    END IF;

    INSERT INTO public.user_lesson_completions (
        user_id, course_id, lesson_id, is_completed, completed_at, last_interaction_at
    ) VALUES (
        v_user_id, v_course_id, p_lesson_id, true, now(), now()
    ) ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        is_completed = true,
        completed_at = COALESCE(user_lesson_completions.completed_at, now()),
        updated_at = now();

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

    IF v_learning_doc_id IS NOT NULL THEN
        -- GAP2-2b: canonical topic via learning_documents → learning_units (decision #12).
        SELECT u.topic_id INTO v_canonical_topic_id
        FROM public.learning_documents d
        JOIN public.learning_units u ON u.id = d.learning_unit_id
        WHERE d.id = v_learning_doc_id;

        IF v_canonical_topic_id IS NOT NULL THEN
            -- GAP2-2b (074): written in the deployed learning_activity_events shape. The former column
            -- list and event type were never deployed, so this insert could not succeed.
            -- Once per user + lesson (the table has no idempotency column).
            INSERT INTO public.learning_activity_events (user_id, topic_id, resource_slug, event_type, metadata, occurred_at)
            SELECT v_user_id, v_canonical_topic_id, d.canonical_slug, 'ARTICLE_COMPLETED',
                   jsonb_build_object('course_id', v_course_id, 'lesson_id', p_lesson_id,
                                      'learning_document_id', v_learning_doc_id, 'duration_seconds', v_duration),
                   now()
            FROM public.learning_documents d
            WHERE d.id = v_learning_doc_id
              AND NOT EXISTS (
                  SELECT 1 FROM public.learning_activity_events e
                  WHERE e.user_id = v_user_id AND e.event_type = 'ARTICLE_COMPLETED'
                    AND e.metadata->>'lesson_id' = p_lesson_id::text
              );
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
$function$;

DO $$
BEGIN
    IF (SELECT prosrc FROM pg_proc WHERE proname = 'fn_create_discussion_thread' AND pronamespace = 'public'::regnamespace) ~ 'COMMUNITY_DOUBT_ASKED' THEN
        RAISE EXCEPTION 'GAP2_2B_074_PROOF: discussion activity insert still present';
    END IF;
    IF (SELECT prosrc FROM pg_proc WHERE proname = 'fn_complete_course_lesson' AND pronamespace = 'public'::regnamespace) ~ '(idempotency_key|event_payload|resource_type)' THEN
        RAISE EXCEPTION 'GAP2_2B_074_PROOF: course lesson event still uses undeployed columns';
    END IF;
END $$;

-- End of 074.
