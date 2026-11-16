-- =====================================================================================================================
-- Rollback for 147 PAY-1 B3 part 1 (supabase/migrations/20261116000147_pay1_b3_central_checks.sql).
-- ROLLBACK-CHAIN: run first: none
-- Restores the live definitions read 2026-11-15 (functions, the two policies, both search_indexes policies), drops
-- fn_access_allowed_many (roll the B3 APP back first: it calls it), and reverts the two seed rows where no admin has changed
-- them since. Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
CREATE OR REPLACE FUNCTION public.fn_join_battle_by_code(p_room_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_status TEXT;
    v_access_tier TEXT;
    v_participant_count INTEGER;
    v_max_participants INTEGER;
    v_time_per_q INTEGER;
    v_is_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_room_code IS NULL OR length(trim(p_room_code)) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid room code');
    END IF;

    SELECT id, status, access_tier, max_participants, time_per_question_seconds
    INTO v_room_id, v_status, v_access_tier, v_max_participants, v_time_per_q
    FROM public.quiz_battle_rooms
    WHERE room_code = upper(trim(p_room_code))
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Battle room not found');
    END IF;

    IF v_status != 'WAITING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Battle room is not open for joining (Status: ' || v_status || ')');
    END IF;

    -- Verify entitlement if PRO room
    IF v_access_tier = 'PRO' THEN
        SELECT (status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())) INTO v_is_pro
        FROM public.user_entitlements
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF NOT COALESCE(v_is_pro, false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO entitlement required to join this room');
        END IF;
    END IF;

    SELECT count(*) INTO v_participant_count
    FROM public.quiz_battle_participants
    WHERE room_id = v_room_id;

    IF v_participant_count >= v_max_participants THEN
        RETURN jsonb_build_object('success', false, 'error', 'Battle room is full');
    END IF;

    INSERT INTO public.user_battle_stats (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
    VALUES (v_room_id, v_user_id, true)
    ON CONFLICT (room_id, user_id) DO NOTHING;

    -- Start countdown when full
    IF (v_participant_count + 1) >= v_max_participants THEN
        UPDATE public.quiz_battle_rooms
        SET status = 'COUNTDOWN',
            current_round = 1,
            round_started_at = now() + INTERVAL '5 seconds',
            round_ends_at = now() + INTERVAL '5 seconds' + (v_time_per_q * INTERVAL '1 second'),
            updated_at = now()
        WHERE id = v_room_id;

        RETURN jsonb_build_object(
            'success', true,
            'room_id', v_room_id,
            'status', 'COUNTDOWN',
            'countdown_seconds', 5
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'room_id', v_room_id,
        'status', 'WAITING'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_find_or_create_battle_room(p_topic_id uuid DEFAULT NULL::uuid, p_is_private boolean DEFAULT false, p_access_tier text DEFAULT 'FREE'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_room_code TEXT;
    v_q_ids UUID[];
    v_is_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Entitlement verification for PRO battles (Phase 3I)
    IF p_access_tier = 'PRO' THEN
        SELECT (status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())) INTO v_is_pro
        FROM public.user_entitlements
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF NOT COALESCE(v_is_pro, false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO entitlement required for this battle arena');
        END IF;
    END IF;

    -- Ensure initial user_battle_stats exists
    INSERT INTO public.user_battle_stats (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- If public matchmaking, attempt to find an open waiting room
    IF NOT p_is_private THEN
        SELECT id, room_code INTO v_room_id, v_room_code
        FROM public.quiz_battle_rooms
        WHERE status = 'WAITING'
          AND is_private = false
          AND access_tier = p_access_tier
          AND (p_topic_id IS NULL AND topic_id IS NULL OR topic_id = p_topic_id)
          AND created_by_user_id != v_user_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF FOUND THEN
            -- Join this room
            INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
            VALUES (v_room_id, v_user_id, true)
            ON CONFLICT (room_id, user_id) DO NOTHING;

            -- Transition room to READY and start countdown
            UPDATE public.quiz_battle_rooms
            SET status = 'COUNTDOWN',
                current_round = 1,
                round_started_at = now() + INTERVAL '5 seconds',
                round_ends_at = now() + INTERVAL '5 seconds' + (time_per_question_seconds * INTERVAL '1 second'),
                updated_at = now()
            WHERE id = v_room_id;

            RETURN jsonb_build_object(
                'success', true,
                'room_id', v_room_id,
                'room_code', v_room_code,
                'action', 'JOINED',
                'status', 'COUNTDOWN',
                'countdown_seconds', 5
            );
        END IF;
    END IF;

    -- Strict question pool selection: If topic requested, must have >= 3 questions in topic
    IF p_topic_id IS NOT NULL THEN
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
              AND canonical_topic_id = p_topic_id
            ORDER BY random()
            LIMIT 5
        ) q_sample;

        IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 3 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient active questions available for requested topic');
        END IF;
    ELSE
        -- Global / random battle pool
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
            ORDER BY random()
            LIMIT 5
        ) q_global;

        IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 3 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient active questions available in global pool');
        END IF;
    END IF;

    -- Generate cryptographically safe 6-char room code
    v_room_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    INSERT INTO public.quiz_battle_rooms (
        room_code, battle_type, topic_id, created_by_user_id,
        is_private, access_tier, max_participants, total_rounds, time_per_question_seconds,
        question_ids, status
    ) VALUES (
        v_room_code, '1v1', p_topic_id, v_user_id,
        p_is_private, p_access_tier, 2, array_length(v_q_ids, 1), 15,
        v_q_ids, 'WAITING'
    ) RETURNING id INTO v_room_id;

    INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
    VALUES (v_room_id, v_user_id, true);

    RETURN jsonb_build_object(
        'success', true,
        'room_id', v_room_id,
        'room_code', v_room_code,
        'action', 'CREATED',
        'status', 'WAITING'
    );
END;
$function$;

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

    -- Phase 3C Learning Activity Event (107 FLASHCARD-REVIEW-1): only when the deck has a topic (topic_id is NOT NULL);
    -- an allowed event type with the flashcard kind in metadata and a resource_slug; analytics can NEVER fail the review.
    IF v_topic_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.learning_activity_events (
                user_id, topic_id, resource_slug, event_type, metadata, occurred_at
            ) VALUES (
                v_user_id, v_topic_id, 'flashcards/card/' || p_card_id, 'TOPIC_LEARNING_ACTIVITY',
                jsonb_build_object('kind', 'FLASHCARD_CARD_REVIEWED', 'deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating, 'interval_days', v_new_interval),
                now()
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- analytics only: the review is already written
        END;
    END IF;

    -- COINS-OFF-1 (architect, 2026-10-25): coin rewards: re-enable in F10 via the coin ledger.
    -- (The former reward-event insert was removed here; this function awards no coins.)

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

CREATE POLICY "p_search_indexes_read_public" ON public.search_indexes
    FOR SELECT TO anon
    USING (is_published = true AND access_tier = 'FREE');
CREATE POLICY "p_search_indexes_read_auth" ON public.search_indexes
    FOR SELECT TO authenticated
    USING (((is_published = true) AND ((access_tier = 'FREE'::text) OR (EXISTS ( SELECT 1
   FROM user_entitlements
  WHERE ((user_entitlements.user_id = auth.uid()) AND (user_entitlements.entitlement_type = 'SUBSCRIPTION'::text) AND (user_entitlements.is_active = true) AND ((user_entitlements.expires_at IS NULL) OR (user_entitlements.expires_at > now()))))) OR (COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'service_role'::text) OR public.fn_jwt_is_admin_or_staff())));

ALTER POLICY "p_fcards_select" ON public."flashcards"
    USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM flashcard_decks fd
  WHERE ((fd.id = flashcards.deck_id) AND (fd.is_published = true) AND ((fd.author_id = auth.uid()) OR ((fd.is_curated = true) AND ((fd.access_tier = 'FREE'::text) OR (flashcards.card_order <= 3) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_entitlements ue
          WHERE ((ue.user_id = auth.uid()) AND (ue.is_active = true) AND ((ue.expires_at IS NULL) OR (ue.expires_at > now())))))) OR (COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'service_role'::text) OR public.fn_jwt_is_admin_or_staff()))))))));

ALTER POLICY "p_threads_read_public" ON public."discussion_threads"
    USING (((status <> 'ARCHIVED'::text) AND ((lesson_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((course_lessons cl
     JOIN course_modules cm ON ((cm.id = cl.module_id)))
     JOIN courses c ON ((c.id = cm.course_id)))
  WHERE ((cl.id = discussion_threads.lesson_id) AND ((cl.is_free_preview = true) OR (c.access_tier = 'FREE'::text) OR ((auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM user_entitlements ue
          WHERE ((ue.user_id = auth.uid()) AND (ue.is_active = true) AND ((ue.expires_at IS NULL) OR (ue.expires_at > now())))))) OR (COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'service_role'::text) OR public.fn_jwt_is_admin_or_staff())))))));

DROP FUNCTION IF EXISTS public.fn_access_allowed_many(text, text[]);

DELETE FROM public.access_policies WHERE item_kind = 'FEATURE' AND item_key = 'MISTAKE_DRILLS' AND updated_by IS NULL;
UPDATE public.access_policies SET tier = 'PRO'
 WHERE item_kind = 'FEATURE' AND item_key = 'MISTAKE_VAULT' AND tier = 'FREE' AND updated_by IS NULL;

-- 7. the four client RPCs without the feature guards (live definitions 2026-11-16)
CREATE OR REPLACE FUNCTION public.fn_memory_lock_add(p_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_block text;   -- PAY-1 B2b
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
    -- PAY-1 B2b (paths D / F, D2 + E1 = b): never the key of a question in the caller's own open attempt, nor of one
    -- reserved for a PRO mock (whatever the paywall switch)
    v_block := public.fn_answer_blocked(v_uid, p_question_id);
    IF v_block IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', v_block);
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

CREATE OR REPLACE FUNCTION public.fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_block text;   -- PAY-1 B2b
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
    -- PAY-1 B2b (paths D / F, D2 + E1 = b): never the key of a question in the caller's own open attempt, nor of one
    -- reserved for a PRO mock (whatever the paywall switch)
    v_block := public.fn_answer_blocked(v_uid, v_qid);
    IF v_block IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', v_block);
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

CREATE OR REPLACE FUNCTION public.fn_generate_mistake_drill(p_vault_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_cognitive_type_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_ids uuid[];
    v_questions jsonb;
    v_total integer;
    v_drill_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'error', 'Authentication required to generate a drill.');
    END IF;

    -- distinct ids, first-seen order, at most 20
    SELECT array_agg(d.id ORDER BY d.first_ord) INTO v_ids
    FROM (SELECT u.id, min(u.ord) AS first_ord
            FROM unnest(coalesce(p_vault_ids, '{}'::uuid[])) WITH ORDINALITY AS u(id, ord)
           WHERE u.id IS NOT NULL
           GROUP BY u.id) d;
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOTHING_TO_DRILL', 'error', 'No eligible mistakes to drill.');
    END IF;
    IF cardinality(v_ids) > 20 THEN
        v_ids := v_ids[1:20];
    END IF;

    -- ownership: every requested vault row must belong to the caller
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS i(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.user_mistake_vault v WHERE v.id = i.id AND v.user_id = v_user_id)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'A requested mistake does not belong to you.');
    END IF;

    -- pre-submit projection: no correct key, no explanation (PublicDrillQuestion shape)
    SELECT jsonb_agg(s.item ORDER BY s.ord) INTO v_questions
    FROM (
        SELECT u.ord,
               jsonb_build_object(
                   'vault_id', v.id,
                   'question_id', v.question_id,
                   'question_version_id', qv.id,
                   'question_text', coalesce(qv.question_text, ''),
                   'primary_cognitive_type_id', v.primary_cognitive_type_id,
                   'consecutive_correct', v.consecutive_correct_in_remediation,
                   'options', coalesce((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id', o.id, 'option_key', o.option_key, 'content_text', o.option_text,
                                  'option_text', o.option_text, 'option_order', coalesce(o.order_index, 0))
                              ORDER BY o.order_index NULLS LAST, o.option_key)
                         FROM public.question_options o WHERE o.question_version_id = qv.id), '[]'::jsonb),
                   'context', jsonb_build_object(
                       'cognitive_type_name', coalesce(ct.name, v.primary_cognitive_type_id),
                       'total_mistakes_count', v.total_mistakes_count,
                       'consecutive_correct', v.consecutive_correct_in_remediation,
                       'last_mistake_at', v.last_mistake_at,
                       'user_custom_notes', v.user_custom_notes)
               ) AS item
          FROM unnest(v_ids) WITH ORDINALITY AS u(id, ord)
          JOIN public.user_mistake_vault v ON v.id = u.id AND v.user_id = v_user_id
          JOIN public.questions q ON q.id = v.question_id AND q.status = 'published'
          JOIN public.question_versions qv ON qv.question_id = q.id AND qv.is_current AND qv.lifecycle_status = 'PUBLISHED'
          LEFT JOIN public.mistake_cognitive_types ct ON ct.id = v.primary_cognitive_type_id
         WHERE public.fn_qf_version_is_servable(qv.id) -- QB-KEY-1 (087): shared valid-key predicate
    ) s;

    v_total := coalesce(jsonb_array_length(v_questions), 0);
    IF v_total < 1 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOTHING_TO_DRILL', 'error', 'None of the selected mistakes has a gradable published question.');
    END IF;

    INSERT INTO public.user_mistake_drills (user_id, topic_id, cognitive_type_id, total_questions, questions_data, status)
    VALUES (v_user_id, p_topic_id, p_cognitive_type_id, v_total, v_questions, 'IN_PROGRESS')
    RETURNING id INTO v_drill_id;

    RETURN jsonb_build_object('success', true, 'drill_id', v_drill_id, 'total_questions', v_total, 'questions', v_questions);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_submit_mistake_drill(p_drill_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_drill record;
    v_q jsonb;
    v_ans jsonb;
    v_version_id uuid;
    v_sel_opt uuid;
    v_sel_key text;
    v_correct text;
    v_expl text;
    v_is_correct boolean;
    v_ungradable boolean;
    v_vault record;
    v_prev integer;
    v_new integer;
    v_status text;
    v_rt integer;
    v_rows integer;
    v_correct_count integer := 0;
    v_mastered integer := 0;
    v_revisiting integer := 0;
    v_unresolved integer := 0;
    v_total integer;
    v_eval jsonb;
    v_evals jsonb := '[]'::jsonb;
    v_stored jsonb := '[]'::jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'error', 'Authentication required to submit a drill.');
    END IF;

    SELECT d.id, d.status, d.total_questions, d.topic_id, d.questions_data, d.correct_count, d.mistakes_resolved_count, d.coins_awarded
      INTO v_drill
      FROM public.user_mistake_drills d
     WHERE d.id = p_drill_id AND d.user_id = v_user_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Drill session not found.');
    END IF;

    -- idempotent: a completed drill returns its stored result; nothing is written again
    IF v_drill.status = 'COMPLETED' THEN
        SELECT coalesce(jsonb_agg(x.e -> 'evaluation' ORDER BY x.o), '[]'::jsonb) INTO v_evals
          FROM jsonb_array_elements(v_drill.questions_data) WITH ORDINALITY AS x(e, o)
         WHERE x.e ? 'evaluation';
        v_total := v_drill.total_questions;
        RETURN jsonb_build_object(
            'success', true, 'idempotent', true, 'drill_id', v_drill.id,
            'summary', jsonb_build_object(
                'total_questions', v_total,
                'correct_count', v_drill.correct_count,
                'accuracy_pct', CASE WHEN v_total > 0 THEN round(v_drill.correct_count * 100.0 / v_total, 1) ELSE 0 END,
                'mastered_count', v_drill.mistakes_resolved_count,
                'revisiting_count', (SELECT count(*) FROM jsonb_array_elements(v_evals) e WHERE e ->> 'new_status' = 'REVISITING' AND (e ->> 'is_correct')::boolean),
                'unresolved_count', (SELECT count(*) FROM jsonb_array_elements(v_evals) e
                                      WHERE NOT coalesce((e ->> 'is_correct')::boolean, false) AND NOT coalesce((e ->> 'ungradable')::boolean, false)),
                'coins_awarded', v_drill.coins_awarded),
            'evaluations', v_evals);
    END IF;
    IF v_drill.status <> 'IN_PROGRESS' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_OPEN', 'error', 'This drill session is no longer open.');
    END IF;
    IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ANSWERS', 'error', 'Answers must be a list.');
    END IF;

    v_total := jsonb_array_length(v_drill.questions_data);

    -- grade the DRILL's questions (client-sent correctness / score are never read)
    FOR v_q IN SELECT x.e FROM jsonb_array_elements(v_drill.questions_data) WITH ORDINALITY AS x(e, o) ORDER BY x.o
    LOOP
        v_version_id := nullif(v_q ->> 'question_version_id', '')::uuid;
        v_sel_opt := NULL;
        v_sel_key := NULL;
        v_rt := NULL;

        SELECT y.a INTO v_ans
          FROM jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) WITH ORDINALITY AS y(a, i)
         WHERE jsonb_typeof(y.a) = 'object' AND y.a ->> 'question_id' = v_q ->> 'question_id'
         ORDER BY y.i LIMIT 1;

        IF v_ans IS NOT NULL THEN
            -- the selected option must be one of the compiled version's options (by id when sent, else by key)
            IF nullif(v_ans ->> 'selected_option_id', '') IS NOT NULL THEN
                SELECT o.id, o.option_key INTO v_sel_opt, v_sel_key
                  FROM public.question_options o
                 WHERE o.question_version_id = v_version_id AND o.id::text = v_ans ->> 'selected_option_id';
            ELSIF nullif(v_ans ->> 'selected_option_key', '') IS NOT NULL THEN
                SELECT o.id, o.option_key INTO v_sel_opt, v_sel_key
                  FROM public.question_options o
                 WHERE o.question_version_id = v_version_id AND o.option_key = v_ans ->> 'selected_option_key';
            END IF;
            IF jsonb_typeof(v_ans -> 'response_time_seconds') = 'number' THEN
                v_rt := greatest(0, round((v_ans ->> 'response_time_seconds')::numeric))::integer;
            END IF;
        END IF;

        v_correct := NULL;
        v_expl := NULL;
        SELECT a.correct_option_key, a.explanation_md INTO v_correct, v_expl
          FROM public.question_answers a WHERE a.question_version_id = v_version_id;
        v_ungradable := v_correct IS NULL;
        v_is_correct := NOT v_ungradable AND v_sel_key IS NOT NULL AND v_sel_key = v_correct;

        SELECT v.id, v.consecutive_correct_in_remediation, v.total_mistakes_count, v.lifecycle_status INTO v_vault
          FROM public.user_mistake_vault v
         WHERE v.id = nullif(v_q ->> 'vault_id', '')::uuid AND v.user_id = v_user_id
           FOR UPDATE;

        v_prev := coalesce(v_vault.consecutive_correct_in_remediation, 0);
        v_new := v_prev;
        v_status := coalesce(v_vault.lifecycle_status, 'UNRESOLVED');

        IF v_ungradable THEN
            NULL; -- no answer key for the compiled version: never graded, never mutates the vault
        ELSIF v_is_correct THEN
            v_correct_count := v_correct_count + 1;
            v_new := v_prev + 1;
            IF v_new >= 2 THEN
                v_status := 'MASTERED';
                v_mastered := v_mastered + 1;
            ELSE
                v_status := 'REVISITING';
                v_revisiting := v_revisiting + 1;
            END IF;
            IF v_vault.id IS NOT NULL THEN
                UPDATE public.user_mistake_vault
                   SET consecutive_correct_in_remediation = v_new,
                       lifecycle_status = v_status,
                       last_practiced_at = now(),
                       mastered_at = CASE WHEN v_status = 'MASTERED' THEN now() ELSE NULL END,
                       updated_at = now()
                 WHERE id = v_vault.id AND user_id = v_user_id;
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: vault update affected % rows', v_rows; END IF;
            END IF;
        ELSE
            v_unresolved := v_unresolved + 1;
            v_new := 0;
            v_status := 'UNRESOLVED';
            IF v_vault.id IS NOT NULL THEN
                UPDATE public.user_mistake_vault
                   SET consecutive_correct_in_remediation = 0,
                       lifecycle_status = 'UNRESOLVED',
                       total_mistakes_count = coalesce(v_vault.total_mistakes_count, 0) + 1,
                       last_mistake_at = now(),
                       last_practiced_at = now(),
                       updated_at = now()
                 WHERE id = v_vault.id AND user_id = v_user_id;
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: vault update affected % rows', v_rows; END IF;

                INSERT INTO public.user_mistake_occurrences (
                    vault_id, user_id, question_id, question_version_id, source_context, source_reference_id,
                    selected_option_id, response_time_seconds, occurred_at)
                VALUES (v_vault.id, v_user_id, (v_q ->> 'question_id')::uuid, v_version_id, 'MISTAKE_DRILL', p_drill_id,
                        v_sel_opt, v_rt, now());
            END IF;
        END IF;

        v_eval := jsonb_build_object(
            'question_id', v_q ->> 'question_id',
            'question_text', coalesce(v_q ->> 'question_text', ''),
            'options', coalesce(v_q -> 'options', '[]'::jsonb),
            'selected_option_key', v_sel_key,
            'correct_option_key', v_correct,
            'is_correct', v_is_correct,
            'ungradable', v_ungradable,
            'explanation', v_expl,
            'previous_consecutive', v_prev,
            'new_consecutive', v_new,
            'new_status', v_status);
        v_evals := v_evals || jsonb_build_array(v_eval);
        v_stored := v_stored || jsonb_build_array(v_q || jsonb_build_object('evaluation', v_eval));
    END LOOP;

    -- complete the drill (row-count checked; coins_awarded stays 0 — no reward function is called)
    UPDATE public.user_mistake_drills
       SET status = 'COMPLETED',
           correct_count = v_correct_count,
           mistakes_resolved_count = v_mastered,
           coins_awarded = 0,
           questions_data = v_stored,
           completed_at = now(),
           updated_at = now()
     WHERE id = p_drill_id AND user_id = v_user_id AND status = 'IN_PROGRESS';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: drill completion affected % rows', v_rows; END IF;

    -- learning activity (as the previous RPC did), only for topic-scoped drills
    IF v_drill.topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at)
        VALUES (v_user_id, v_drill.topic_id, 'mistake-drill-' || p_drill_id, 'TOPIC_LEARNING_ACTIVITY', NULL,
                jsonb_build_object('activity_type', 'MISTAKE_DRILL', 'drill_id', p_drill_id, 'score', v_correct_count), now());
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'idempotent', false, 'drill_id', p_drill_id,
        'summary', jsonb_build_object(
            'total_questions', v_total,
            'correct_count', v_correct_count,
            'accuracy_pct', CASE WHEN v_total > 0 THEN round(v_correct_count * 100.0 / v_total, 1) ELSE 0 END,
            'mastered_count', v_mastered,
            'revisiting_count', v_revisiting,
            'unresolved_count', v_unresolved,
            'coins_awarded', 0),
        'evaluations', v_evals);
END;
$function$;
