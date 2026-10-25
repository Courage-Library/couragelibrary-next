-- Rollback for 20261025000108_deck_session_activity.sql: restores the previous fn_complete_deck_review_session (fails on every call; reward-event insert present).
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_complete_deck_review_session(p_deck_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_topic_id UUID;
    v_reviewed_today INTEGER;
    v_gamification_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT topic_id INTO v_topic_id
    FROM public.flashcard_decks
    WHERE id = p_deck_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deck not found');
    END IF;

    SELECT count(*) INTO v_reviewed_today
    FROM public.user_flashcard_reviews
    WHERE user_id = v_user_id AND deck_id = p_deck_id AND last_reviewed_at >= CURRENT_DATE;

    IF v_reviewed_today = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No cards reviewed today in this deck');
    END IF;

    -- Phase 3C Activity Logging
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'FLASHCARD_DECK_COMPLETED',
        jsonb_build_object('deck_id', p_deck_id, 'cards_reviewed', v_reviewed_today),
        now()
    );

    -- Phase 3D Bonus Gamification Event (10 coins bonus per deck per day)
    v_gamification_key := 'fdeck_deck_' || p_deck_id || '_' || v_user_id || '_' || to_char(now(), 'YYYY-MM-DD');
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_user_id, 'FLASHCARD_DECK_COMPLETED', 'FLASHCARD_DECK', p_deck_id, v_gamification_key,
        'VERIFIED', 'REWARDED', 10, 10,
        jsonb_build_object('deck_id', p_deck_id, 'cards_reviewed', v_reviewed_today),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'deck_id', p_deck_id,
        'cards_reviewed_today', v_reviewed_today,
        'completed_at', now()
    );
END;
$function$;

COMMIT;
