-- =====================================================================================================================
-- 107 FLASHCARD-REVIEW-1 + COINS-OFF-1 — fn_submit_flashcard_review works again and awards NO coins
-- Architect CONDITIONAL GO 2026-10-25 (chunked smoke + dry-run must pass). Rollback: docs/database/rollback/107_rollback.sql
-- No BEGIN / COMMIT: the runner owns the transaction. Generated from the live (post-105) definition.
--
-- Cause: the activity insert omitted resource_slug (NOT NULL), could carry a NULL topic_id and used an event_type the
-- CHECK rejects, so every review failed. Fix (101 pattern): topic from the deck (no topic = no row), resource_slug
-- 'flashcards/card/<id>', event_type TOPIC_LEARNING_ACTIVITY + metadata.kind, insert guarded (analytics never fails the
-- review). COINS-OFF-1: the "1 coin per card per day" reward-event insert is REMOVED (coin rewards: re-enable in F10 via
-- the coin ledger). The 102 / 105 access gates are untouched.
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
