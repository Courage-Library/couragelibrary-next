-- =====================================================================================================================
-- 108 ACTIVITY-INSERT-SWEEP + COINS-OFF-1 — fn_complete_deck_review_session works again and awards NO coins
-- Architect CONDITIONAL GO 2026-10-25 (chunked smoke + dry-run must pass). Rollback: docs/database/rollback/108_rollback.sql
-- No BEGIN / COMMIT: the runner owns the transaction. Generated from the live definition.
-- Fix (101 pattern) of the activity insert; COINS-OFF-1: the "10 coins bonus per deck per day" reward-event insert is
-- REMOVED (coin rewards: re-enable in F10 via the coin ledger).
-- =====================================================================================================================

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

    -- Phase 3C Activity Logging (108, 101 pattern): only with a deck topic; allowed event type + metadata.kind +
    -- resource_slug; analytics can NEVER fail the completion.
    IF v_topic_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.learning_activity_events (
                user_id, topic_id, resource_slug, event_type, metadata, occurred_at
            ) VALUES (
                v_user_id, v_topic_id, 'flashcards/deck/' || p_deck_id, 'TOPIC_LEARNING_ACTIVITY',
                jsonb_build_object('kind', 'FLASHCARD_DECK_COMPLETED', 'deck_id', p_deck_id, 'cards_reviewed', v_reviewed_today),
                now()
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- analytics only
        END;
    END IF;

    -- COINS-OFF-1 (architect, 2026-10-25): coin rewards: re-enable in F10 via the coin ledger.
    -- (The former reward-event insert was removed here; this function awards no coins.)

    RETURN jsonb_build_object(
        'success', true,
        'deck_id', p_deck_id,
        'cards_reviewed_today', v_reviewed_today,
        'completed_at', now()
    );
END;
$function$;
