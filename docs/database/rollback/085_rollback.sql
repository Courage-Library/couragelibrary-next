-- =============================================================================
-- ROLLBACK for 20261016000085_drill1_server_authoritative_drills.sql
--
-- Restores the pre-085 drill functions exactly (bodies byte-identical to the live definitions captured before 085,
-- search_path 'public, pg_temp', ACL postgres=X / authenticated=X / service_role=X). WARNING: the restored submit
-- function grades the client's answer list and calls fn_award_gamification_reward; the app of DRILL-1 calls the new
-- generate signature, so revert the commit together with this rollback.
-- Order: 085 first (085 → 084 → 083 → 082 → 081 → …).
-- =============================================================================

DROP FUNCTION public.fn_generate_mistake_drill(uuid[], uuid, text);

CREATE OR REPLACE FUNCTION public.fn_generate_mistake_drill(p_topic_id uuid DEFAULT NULL::uuid, p_cognitive_type_id text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_limit INTEGER := GREATEST(1, LEAST(20, COALESCE(p_limit, 10)));
    v_drill_id UUID;
    v_drill_questions JSONB;
    v_q_ids UUID[];
    v_total INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT array_agg(question_id) INTO v_q_ids
    FROM (
        SELECT question_id
        FROM public.user_mistake_vault
        WHERE user_id = v_user_id
          AND lifecycle_status IN ('UNRESOLVED', 'REVISITING')
          AND (p_topic_id IS NULL OR topic_id = p_topic_id)
          AND (p_cognitive_type_id IS NULL OR primary_cognitive_type_id = p_cognitive_type_id OR user_override_cognitive_type_id = p_cognitive_type_id)
        ORDER BY last_mistake_at DESC
        LIMIT v_limit
    ) q_set;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No unmastered mistakes found for requested criteria');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'question_id', q.id,
            'question_text', qv.question_text,
            'topic_id', q.canonical_topic_id,
            'options', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', qo.id,
                        'option_key', qo.option_key,
                        'option_text', qo.option_text,
                        'order_index', qo.order_index
                    ) ORDER BY qo.order_index
                )
                FROM public.question_options qo
                WHERE qo.question_version_id = qv.id
            )
        )
    ) INTO v_drill_questions
    FROM public.questions q
    JOIN public.question_versions qv
      ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
    WHERE q.id = ANY(v_q_ids)
      AND q.status = 'published';

    v_total := COALESCE(jsonb_array_length(v_drill_questions), 0);
    IF v_total < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No published questions available for requested criteria');
    END IF;

    INSERT INTO public.user_mistake_drills (
        user_id, topic_id, cognitive_type_id, total_questions,
        questions_data, status
    ) VALUES (
        v_user_id, p_topic_id, p_cognitive_type_id, v_total,
        v_drill_questions, 'IN_PROGRESS'
    ) RETURNING id INTO v_drill_id;

    RETURN jsonb_build_object(
        'success', true,
        'drill_id', v_drill_id,
        'total_questions', v_total,
        'questions', v_drill_questions
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_submit_mistake_drill(p_drill_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_drill_status TEXT;
    v_total_questions INTEGER;
    v_topic_id UUID;
    v_item JSONB;
    v_q_id UUID;
    v_opt_id UUID;
    v_time_spent INTEGER;
    v_is_correct BOOLEAN;
    v_correct_count INTEGER := 0;
    v_resolved_count INTEGER := 0;
    v_vault_id UUID;
    v_streak INTEGER;
    v_reward_res JSONB;
    v_coins_awarded INTEGER := 0;
    v_daily_drills_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Lock drill row
    SELECT status, total_questions, topic_id
    INTO v_drill_status, v_total_questions, v_topic_id
    FROM public.user_mistake_drills
    WHERE id = p_drill_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Drill session not found');
    END IF;

    IF v_drill_status != 'IN_PROGRESS' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Drill session is already completed or expired');
    END IF;

    -- Evaluate each answer item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
        v_q_id := (v_item->>'question_id')::uuid;
        v_opt_id := (v_item->>'selected_option_id')::uuid;
        v_time_spent := COALESCE((v_item->>'time_spent_seconds')::integer, 0);

        -- Check answer correctness against Phase 3A
        SELECT (qo.option_key = qa.correct_option_key) INTO v_is_correct
        FROM public.question_options qo
        JOIN public.question_versions qv ON qo.question_version_id = qv.id
        JOIN public.question_answers qa ON qa.question_version_id = qv.id
        WHERE qo.id = v_opt_id AND qv.question_id = v_q_id AND qv.is_current = true;

        IF v_is_correct IS NULL THEN
            v_is_correct := false;
        END IF;

        -- Update vault state
        SELECT id, consecutive_correct_in_remediation INTO v_vault_id, v_streak
        FROM public.user_mistake_vault
        WHERE user_id = v_user_id AND question_id = v_q_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_is_correct THEN
                v_correct_count := v_correct_count + 1;
                v_streak := v_streak + 1;

                IF v_streak >= 2 THEN
                    -- Graduate to MASTERED
                    UPDATE public.user_mistake_vault
                    SET consecutive_correct_in_remediation = v_streak,
                        lifecycle_status = 'MASTERED',
                        mastered_at = now(),
                        last_practiced_at = now(),
                        updated_at = now()
                    WHERE id = v_vault_id;
                    v_resolved_count := v_resolved_count + 1;
                ELSE
                    -- Progress to REVISITING
                    UPDATE public.user_mistake_vault
                    SET consecutive_correct_in_remediation = v_streak,
                        lifecycle_status = 'REVISITING',
                        last_practiced_at = now(),
                        updated_at = now()
                    WHERE id = v_vault_id;
                END IF;
            ELSE
                -- Failed in drill: reset streak and log occurrence
                UPDATE public.user_mistake_vault
                SET total_mistakes_count = total_mistakes_count + 1,
                    consecutive_correct_in_remediation = 0,
                    lifecycle_status = 'UNRESOLVED',
                    last_mistake_at = now(),
                    last_practiced_at = now(),
                    updated_at = now()
                WHERE id = v_vault_id;

                INSERT INTO public.user_mistake_occurrences (
                    vault_id, user_id, question_id, source_context, source_reference_id,
                    selected_option_id, response_time_seconds, occurred_at
                ) VALUES (
                    v_vault_id, v_user_id, v_q_id, 'MISTAKE_DRILL', p_drill_id,
                    v_opt_id, v_time_spent, now()
                );
            END IF;
        END IF;
    END LOOP;

    -- Phase 3D Gamification Reward: 5 coins if qualifying (>= 5 questions, max 3/day)
    IF v_total_questions >= 5 THEN
        SELECT count(*) INTO v_daily_drills_count
        FROM public.user_mistake_drills
        WHERE user_id = v_user_id
          AND status = 'COMPLETED'
          AND coins_awarded > 0
          AND completed_at >= CURRENT_DATE;

        IF v_daily_drills_count < 3 THEN
            v_coins_awarded := 5;
            v_reward_res := public.fn_award_gamification_reward(
                v_user_id,
                'MISTAKE_DRILL_COMPLETED',
                'MISTAKE_DRILL',
                p_drill_id,
                'mistake_drill_' || p_drill_id || '_' || v_user_id,
                5,
                'MISTAKE_DRILL_COMPLETION',
                jsonb_build_object('drill_id', p_drill_id, 'correct_count', v_correct_count, 'resolved_count', v_resolved_count)
            );
        END IF;
    END IF;

    -- Complete Drill
    UPDATE public.user_mistake_drills
    SET status = 'COMPLETED',
        correct_count = v_correct_count,
        mistakes_resolved_count = v_resolved_count,
        coins_awarded = v_coins_awarded,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_drill_id;

    -- Phase 3C Activity Logging
    IF v_topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_user_id, v_topic_id, 'mistake-drill-' || p_drill_id, 'TOPIC_LEARNING_ACTIVITY',
            COALESCE(v_total_questions * 30, 60),
            jsonb_build_object('activity_type', 'MISTAKE_DRILL', 'drill_id', p_drill_id, 'score', v_correct_count),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'drill_id', p_drill_id,
        'total_questions', v_total_questions,
        'correct_count', v_correct_count,
        'mistakes_resolved_count', v_resolved_count,
        'coins_awarded', v_coins_awarded
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_generate_mistake_drill(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_submit_mistake_drill(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_generate_mistake_drill(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_submit_mistake_drill(uuid, jsonb) TO authenticated, service_role;

DO $$
BEGIN
    IF to_regprocedure('public.fn_generate_mistake_drill(uuid[],uuid,text)') IS NOT NULL
       OR to_regprocedure('public.fn_generate_mistake_drill(uuid,text,integer)') IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK_085_PROOF: generate signature not restored';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
