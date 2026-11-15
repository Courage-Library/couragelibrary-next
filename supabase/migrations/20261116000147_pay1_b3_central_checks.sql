-- =====================================================================================================================
-- 147 PAY-1 B3 part 1 (owner decisions 2026-11-15, PAY_1_DESIGN.md §10 / §11): the database side of "every Free / Pro
-- check through the central function". Compatible with the app on main AND with the B3 app (nothing here is called by
-- name from the app except the new fn_access_allowed_many, which only B3 uses).
--   1. Seeds (decision 9; only rows no admin has changed, updated_by IS NULL): FEATURE MISTAKE_VAULT → FREE (viewing);
--      new FEATURE MISTAKE_DRILLS PRO.
--   2. fn_access_allowed_many(kind, keys[]): the SAME rule as fn_access_allowed for a list of keys in one call (course /
--      lesson lists): switch off → allowed; FREE → allowed; anon → refused; else the caller's own Pro. ≤ 500 keys.
--      DEFINER, STABLE, search_path ''; anon + authenticated (P-9 SECDEF_PUBLIC_OK: tier + boolean per key only).
--   3. Policies on the central check (decision 3 / 4): discussion_threads.p_threads_read_public (a course lesson's thread:
--      fn_access_allowed('COURSE', course)); flashcards.p_fcards_select (a PRO deck beyond card 3:
--      fn_access_allowed('FEATURE','FLASHCARDS')). The old rule read user_entitlements without revoked_at / starts_at.
--   4. search_indexes: both read policies dropped (decision 7; no reader; read_auth tested a type no longer issued).
--   5. fn_submit_flashcard_review: the same FLASHCARDS check instead of its own entitlement read.
--   6. Battles (decision 6): FREE arenas / rooms only — fn_find_or_create_battle_room (3-arg) / fn_join_battle_by_code
--      refuse anything else (their PRO check read a status column nothing writes, so PRO never worked).
-- Functions keep their grants (CREATE OR REPLACE keeps the ACL) and their recorded search_path. No BEGIN / COMMIT.
-- =====================================================================================================================

-- 1. seeds
UPDATE public.access_policies SET tier = 'FREE', updated_at = now()
 WHERE item_kind = 'FEATURE' AND item_key = 'MISTAKE_VAULT' AND tier = 'PRO' AND updated_by IS NULL;
INSERT INTO public.access_policies (item_kind, item_key, tier) VALUES ('FEATURE', 'MISTAKE_DRILLS', 'PRO')
    ON CONFLICT (item_kind, item_key) DO NOTHING;

-- 2. the batched central check
CREATE OR REPLACE FUNCTION public.fn_access_allowed_many(p_kind text, p_keys text[])
RETURNS TABLE (item_key text, tier text, allowed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_on  boolean;
    v_pro boolean := false;
BEGIN
    IF p_keys IS NULL OR cardinality(p_keys) = 0 THEN
        RETURN;
    END IF;
    IF cardinality(p_keys) > 500 THEN
        RAISE EXCEPTION 'too many keys (max 500)' USING ERRCODE = '22023';
    END IF;
    SELECT s.paywall_enabled INTO v_on FROM public.access_settings s WHERE s.id;
    IF v_on IS TRUE AND auth.uid() IS NOT NULL THEN
        v_pro := public.fn_has_pro_self();
    END IF;
    RETURN QUERY
        SELECT k.key, t.tier, (v_on IS DISTINCT FROM true OR t.tier = 'FREE' OR v_pro)
          FROM (SELECT DISTINCT unnest(p_keys) AS key) k
          CROSS JOIN LATERAL (SELECT public.fn_access_tier(p_kind, k.key) AS tier) t;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_access_allowed_many(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_access_allowed_many(text, text[]) TO anon, authenticated, service_role;

-- 3. policies on the central check
ALTER POLICY "p_threads_read_public" ON public."discussion_threads"
    USING (((status <> 'ARCHIVED'::text) AND ((lesson_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ((public.course_lessons cl
     JOIN public.course_modules cm ON ((cm.id = cl.module_id)))
     JOIN public.courses c ON ((c.id = cm.course_id)))
  WHERE ((cl.id = discussion_threads.lesson_id) AND (public.fn_access_allowed('COURSE', c.id::text) OR (COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'service_role'::text) OR public.fn_jwt_is_admin_or_staff())))))));

ALTER POLICY "p_fcards_select" ON public."flashcards"
    USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.flashcard_decks fd
  WHERE ((fd.id = flashcards.deck_id) AND (fd.is_published = true) AND ((fd.author_id = auth.uid()) OR ((fd.is_curated = true) AND ((fd.access_tier = 'FREE'::text) OR (flashcards.card_order <= 3) OR public.fn_access_allowed('FEATURE', 'FLASHCARDS') OR (COALESCE((auth.jwt() ->> 'role'::text), ''::text) = 'service_role'::text) OR public.fn_jwt_is_admin_or_staff()))))))));

-- 4. search_indexes: no reader
DROP POLICY "p_search_indexes_read_public" ON public.search_indexes;
DROP POLICY "p_search_indexes_read_auth" ON public.search_indexes;

-- 5. flashcard review
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
        -- PAY-1 B3 (147): the central check (the admin's FLASHCARDS tier + the paywall switch + the caller's own Pro)
        v_has_pro := public.fn_access_allowed('FEATURE', 'FLASHCARDS');

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

-- 6. battles
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

    -- PAY-1 B3 (147, owner decision 6): FREE arenas only for now; the tier never comes from the client
    IF p_access_tier IS DISTINCT FROM 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This battle arena is not available');
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

    -- PAY-1 B3 (147, owner decision 6): FREE rooms only for now
    IF v_access_tier IS DISTINCT FROM 'FREE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This battle room is not available');
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
