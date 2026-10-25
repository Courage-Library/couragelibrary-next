-- =====================================================================================================================
-- 105 NULL-BYPASS-2 — deny branches that a NULL value could skip (`IF <deny condition> THEN` is not taken when the
-- condition is NULL). Architect GO 2026-10-25. Rollback: docs/database/rollback/105_rollback.sql
-- No BEGIN / COMMIT here: the runner owns the transaction. Generated from the live definitions (exact substitutions).
-- Report: docs/reports/security/NULL_BYPASS_2.md
--
--   fn_submit_flashcard_review: author-less private deck (author_id nullable) passed the private-deck check
--     (v_author_id != v_user_id = NULL) → IS DISTINCT FROM; a NULL rating passed `NOT BETWEEN` → rejected.
--   fn_submit_battle_round_answer: with round_started_at NULL (nullable) the "round not started" check was skipped and
--     the latency became GREATEST(0, NULL) = 0 (the best speed score) → a round without a start time refuses answers;
--     a NULL round number → IS DISTINCT FROM.
--   fn_syllabus_publish (staff, defence in depth): `NOT (report->>'ok')::boolean` → `IS NOT TRUE` (fails closed).
-- Same signatures, SECURITY DEFINER, search_path and grants. Payment functions with the same pattern are NOT changed
-- here (hard limit; listed in the report for a separate payments ruling).
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_submit_flashcard_review(p_card_id uuid, p_rating integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck_id UUID;
    v_topic_id UUID;
    v_access_tier TEXT;
    v_card_order INTEGER;
    v_is_curated BOOLEAN;
    v_author_id UUID;
    v_has_pro BOOLEAN := false;
    
    v_prev_rep INTEGER := 0;
    v_prev_interval INTEGER := 1;
    v_prev_ef NUMERIC(4,2) := 2.50;
    v_prev_correct INTEGER := 0;
    v_prev_total INTEGER := 0;
    
    v_new_rep INTEGER;
    v_new_interval INTEGER;
    v_new_ef NUMERIC(4,2);
    v_new_correct INTEGER;
    v_next_due TIMESTAMPTZ;
    
    v_total_cards INTEGER;
    v_mastered_cards INTEGER;
    v_learning_cards INTEGER;
    v_new_cards INTEGER;
    v_mastery_pct NUMERIC(5,2);
    v_gamification_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 4 THEN -- 105: NULL rating rejected
        RETURN jsonb_build_object('success', false, 'error', 'Rating must be an integer between 1 and 4 (1=AGAIN, 2=HARD, 3=GOOD, 4=EASY)');
    END IF;

    -- Validate card and parent deck
    SELECT fc.deck_id, fc.card_order, fd.topic_id, fd.access_tier, fd.is_curated, fd.author_id
    INTO v_deck_id, v_card_order, v_topic_id, v_access_tier, v_is_curated, v_author_id
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    WHERE fc.id = p_card_id AND fc.is_active = true AND fd.is_published = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Flashcard not found or inactive');
    END IF;

    -- Private deck check
    IF NOT v_is_curated AND v_author_id IS DISTINCT FROM v_user_id AND NOT ( -- 105: an author-less private deck is private
        COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
        public.fn_jwt_is_admin_or_staff()
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied to private deck');
    END IF;

    -- Entitlement verification for PRO curated decks
    IF v_is_curated AND v_access_tier = 'PRO' AND v_card_order > 3 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements ue
            WHERE ue.user_id = v_user_id
              AND ue.is_active = true
              AND (ue.expires_at IS NULL OR ue.expires_at > now())
        ) INTO v_has_pro;

        IF NOT v_has_pro AND NOT (
            COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
            public.fn_jwt_is_admin_or_staff()
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO subscription required to review full deck');
        END IF;
    END IF;

    -- Fetch current card review state if exists
    SELECT repetition_level, interval_days, ease_factor, consecutive_correct, total_reviews
    INTO v_prev_rep, v_prev_interval, v_prev_ef, v_prev_correct, v_prev_total
    FROM public.user_flashcard_reviews
    WHERE user_id = v_user_id AND card_id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_prev_rep := 0;
        v_prev_interval := 1;
        v_prev_ef := 2.50;
        v_prev_correct := 0;
        v_prev_total := 0;
    END IF;

    -- SM-2 Mathematical Interval Scaling
    IF p_rating = 1 THEN -- AGAIN (Fail / Reset)
        v_new_rep := 0;
        v_new_interval := 1;
        v_new_correct := 0;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.20);
    ELSIF p_rating = 2 THEN -- HARD (Struggled)
        v_new_rep := v_prev_rep + 1;
        v_new_interval := GREATEST(1, floor(v_prev_interval * 1.20)::integer);
        v_new_correct := v_prev_correct + 1;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.15);
    ELSIF p_rating = 3 THEN -- GOOD (Standard Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 1;
        ELSIF v_prev_rep = 1 THEN
            v_new_interval := 6;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := v_prev_ef;
    ELSE -- EASY (Effortless Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 4;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef * 1.30)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := LEAST(3.50, v_prev_ef + 0.15);
    END IF;

    -- Bound interval between 1 and 365 days
    v_new_interval := LEAST(365, GREATEST(1, v_new_interval));
    v_next_due := now() + (v_new_interval * INTERVAL '1 day');

    -- Upsert card review state
    INSERT INTO public.user_flashcard_reviews (
        user_id, card_id, deck_id, repetition_level, interval_days,
        ease_factor, last_rating, last_reviewed_at, next_review_due_at,
        total_reviews, consecutive_correct, updated_at
    ) VALUES (
        v_user_id, p_card_id, v_deck_id, v_new_rep, v_new_interval,
        v_new_ef, p_rating, now(), v_next_due,
        v_prev_total + 1, v_new_correct, now()
    )
    ON CONFLICT (user_id, card_id) DO UPDATE
        SET repetition_level = EXCLUDED.repetition_level,
            interval_days = EXCLUDED.interval_days,
            ease_factor = EXCLUDED.ease_factor,
            last_rating = EXCLUDED.last_rating,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            next_review_due_at = EXCLUDED.next_review_due_at,
            total_reviews = EXCLUDED.total_reviews,
            consecutive_correct = EXCLUDED.consecutive_correct,
            updated_at = now();

    -- Recalculate deck progress projection
    SELECT count(*) INTO v_total_cards
    FROM public.flashcards WHERE deck_id = v_deck_id AND is_active = true;

    SELECT 
        COUNT(CASE WHEN ufr.repetition_level >= 3 THEN 1 END),
        COUNT(CASE WHEN ufr.repetition_level BETWEEN 1 AND 2 THEN 1 END)
    INTO v_mastered_cards, v_learning_cards
    FROM public.user_flashcard_reviews ufr
    WHERE ufr.user_id = v_user_id AND ufr.deck_id = v_deck_id;

    v_new_cards := GREATEST(0, v_total_cards - (v_mastered_cards + v_learning_cards));
    IF v_total_cards > 0 THEN
        v_mastery_pct := ROUND(((v_mastered_cards::numeric / v_total_cards::numeric) * 100.0), 2);
    ELSE
        v_mastery_pct := 0.00;
    END IF;

    INSERT INTO public.user_deck_progress (
        user_id, deck_id, total_cards_mastered, total_cards_learning,
        total_cards_new, mastery_percentage, last_reviewed_at, updated_at
    ) VALUES (
        v_user_id, v_deck_id, v_mastered_cards, v_learning_cards,
        v_new_cards, v_mastery_pct, now(), now()
    )
    ON CONFLICT (user_id, deck_id) DO UPDATE
        SET total_cards_mastered = EXCLUDED.total_cards_mastered,
            total_cards_learning = EXCLUDED.total_cards_learning,
            total_cards_new = EXCLUDED.total_cards_new,
            mastery_percentage = EXCLUDED.mastery_percentage,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            updated_at = now();

    -- Phase 3C Learning Activity Event
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'FLASHCARD_CARD_REVIEWED',
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating, 'interval_days', v_new_interval),
        now()
    );

    -- Phase 3D Gamification Reward (1 coin per card per day)
    v_gamification_key := 'fdeck_card_' || p_card_id || '_' || v_user_id || '_' || to_char(now(), 'YYYY-MM-DD');
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_user_id, 'FLASHCARD_CARD_REVIEWED', 'FLASHCARD', p_card_id, v_gamification_key,
        'VERIFIED', 'REWARDED', 1, 1,
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'card_id', p_card_id,
        'deck_id', v_deck_id,
        'rating', p_rating,
        'repetition_level', v_new_rep,
        'interval_days', v_new_interval,
        'ease_factor', v_new_ef,
        'next_review_due_at', v_next_due,
        'mastery_percentage', v_mastery_pct
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_submit_battle_round_answer(p_room_id uuid, p_round_number integer, p_selected_option_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_status TEXT;
    v_current_round INTEGER;
    v_total_rounds INTEGER;
    v_question_ids UUID[];
    v_round_started_at TIMESTAMPTZ;
    v_round_ends_at TIMESTAMPTZ;
    v_time_per_q INTEGER;
    v_q_id UUID;
    v_is_correct BOOLEAN := false;
    v_latency_ms INTEGER;
    v_score_points INTEGER := 0;
    v_received_at TIMESTAMPTZ := clock_timestamp();
    v_answered_count INTEGER;
    v_participant_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Lock room row for atomic evaluation
    SELECT status, current_round, total_rounds, question_ids, round_started_at, round_ends_at, time_per_question_seconds
    INTO v_room_status, v_current_round, v_total_rounds, v_question_ids, v_round_started_at, v_round_ends_at, v_time_per_q
    FROM public.quiz_battle_rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Room not found');
    END IF;

    IF v_room_status NOT IN ('COUNTDOWN', 'ACTIVE') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Battle is not active');
    END IF;

    -- Reject submissions before round starts
    IF v_round_started_at IS NULL OR v_received_at < v_round_started_at THEN -- 105: no answer before the round has a start time
        RETURN jsonb_build_object('success', false, 'error', 'Round has not started yet');
    END IF;

    IF p_round_number IS DISTINCT FROM v_current_round THEN -- 105: NULL round rejected
        RETURN jsonb_build_object('success', false, 'error', 'Answer is not for the current active round');
    END IF;

    v_q_id := v_question_ids[p_round_number];

    -- Verify user is a participant
    IF NOT EXISTS (SELECT 1 FROM public.quiz_battle_participants WHERE room_id = p_room_id AND user_id = v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'User is not a participant in this battle');
    END IF;

    -- Check if already answered this round
    IF EXISTS (SELECT 1 FROM public.quiz_battle_round_answers WHERE room_id = p_room_id AND user_id = v_user_id AND round_number = p_round_number) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You have already submitted an answer for this round');
    END IF;

    -- Server-authoritative timing calculation
    v_latency_ms := GREATEST(0, (EXTRACT(MILLISECONDS FROM (v_received_at - v_round_started_at)))::integer);

    -- Check answer correctness against Phase 3A versioning
    SELECT (qo.option_key = qa.correct_option_key) INTO v_is_correct
    FROM public.question_options qo
    JOIN public.question_versions qv ON qo.question_version_id = qv.id
    JOIN public.question_answers qa ON qa.question_version_id = qv.id
    WHERE qo.id = p_selected_option_id AND qv.question_id = v_q_id AND qv.is_current = true;

    IF v_is_correct IS NULL THEN
        v_is_correct := false;
    END IF;

    -- Late / Timeout check (grace buffer 500ms)
    IF v_received_at > (v_round_ends_at + INTERVAL '500 milliseconds') THEN
        v_is_correct := false;
        v_score_points := 0;
    ELSIF v_is_correct THEN
        -- Speed points: 100 base + up to 50 speed bonus
        v_score_points := 100 + GREATEST(0, floor((1.0 - (v_latency_ms::numeric / 15000.0)) * 50.0)::integer);
    ELSE
        v_score_points := 0;
    END IF;

    -- Insert answer record
    INSERT INTO public.quiz_battle_round_answers (
        room_id, user_id, round_number, question_id,
        selected_option_id, is_correct, latency_ms, score_points, received_at
    ) VALUES (
        p_room_id, v_user_id, p_round_number, v_q_id,
        p_selected_option_id, v_is_correct, v_latency_ms, v_score_points, v_received_at
    );

    -- Update participant aggregate score
    UPDATE public.quiz_battle_participants
    SET final_score = final_score + v_score_points,
        total_time_ms = total_time_ms + v_latency_ms,
        updated_at = now()
    WHERE room_id = p_room_id AND user_id = v_user_id;

    -- Check if all participants answered this round
    SELECT count(*) INTO v_participant_count FROM public.quiz_battle_participants WHERE room_id = p_room_id;
    SELECT count(*) INTO v_answered_count FROM public.quiz_battle_round_answers WHERE room_id = p_room_id AND round_number = p_round_number;

    IF v_answered_count >= v_participant_count THEN
        IF p_round_number < v_total_rounds THEN
            -- Transition to next round with 3-second inter-round break
            UPDATE public.quiz_battle_rooms
            SET current_round = current_round + 1,
                status = 'ACTIVE',
                round_started_at = now() + INTERVAL '3 seconds',
                round_ends_at = now() + INTERVAL '3 seconds' + (v_time_per_q * INTERVAL '1 second'),
                updated_at = now()
            WHERE id = p_room_id;
        ELSE
            -- Final round completed -> Finalize
            PERFORM public.fn_finalize_battle_room(p_room_id);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'round_number', p_round_number,
        'is_correct', v_is_correct,
        'score_points', v_score_points,
        'latency_ms', v_latency_ms
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_syllabus_publish(p_version_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v public.exam_syllabus_versions;
  v_report jsonb;
  v_prev uuid;
BEGIN
  PERFORM public.fn_syllabus__assert_role(true);
  v := public.fn_syllabus__require_draft(p_version_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || v.exam_id::text, 0));
  v_report := public.fn_syllabus__validate(p_version_id);
  IF (v_report ->> 'ok')::boolean IS NOT TRUE THEN -- 105: a missing / NULL ok fails closed
    -- fail closed: nothing written, nothing audited
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_FAILED', 'version_id', p_version_id, 'report', v_report);
  END IF;
  SELECT id INTO v_prev FROM public.exam_syllabus_versions
   WHERE exam_id = v.exam_id AND exam_cycle_id IS NOT DISTINCT FROM v.exam_cycle_id
     AND status = 'PUBLISHED' AND is_active AND id <> p_version_id
   FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE public.exam_syllabus_versions SET status = 'ARCHIVED', is_active = false, archived_at = now(), updated_at = now()
     WHERE id = v_prev;
  END IF;
  UPDATE public.exam_syllabus_versions
     SET status = 'PUBLISHED', is_active = true, published_at = now(), published_by = auth.uid(), updated_at = now()
   WHERE id = p_version_id;
  PERFORM public.fn_syllabus__audit('SYLLABUS_PUBLISH', 'exam_syllabus_version', p_version_id,
    CASE WHEN v_prev IS NULL THEN NULL ELSE jsonb_build_object('archived_version_id', v_prev) END,
    jsonb_build_object('exam_id', v.exam_id, 'exam_cycle_id', v.exam_cycle_id, 'version_number', v.version_number,
                       'previous_version_id', v_prev, 'counts', v_report -> 'counts', 'warning_count', v_report -> 'warning_count'));
  RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'archived_previous_version_id', v_prev,
                            'counts', v_report -> 'counts', 'warnings', v_report -> 'warnings');
END;
$function$;
