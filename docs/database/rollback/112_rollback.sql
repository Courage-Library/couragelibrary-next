-- Rollback for 20261026000112_coins_freeze.sql: restores the three previous bodies (coin awards ON again).
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_award_gamification_reward(p_user_id uuid, p_event_type text, p_source_type text, p_source_id uuid, p_idempotency_key text, p_calculated_coins integer, p_reason_code text DEFAULT 'STANDARD'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_event_id UUID;
    v_ledger_id UUID;
    v_current_bal INTEGER;
    v_lifetime_earned INTEGER;
    v_new_bal INTEGER;
    v_new_earned INTEGER;
BEGIN
    SELECT id INTO v_event_id FROM public.gamification_events WHERE idempotency_key = p_idempotency_key;
    IF v_event_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'event_id', v_event_id);
    END IF;

    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, reason_code, calculated_coins,
        actual_coins_awarded, metadata, processed_at
    ) VALUES (
        p_user_id, p_event_type, p_source_type, p_source_id, p_idempotency_key,
        'VERIFIED', CASE WHEN p_calculated_coins > 0 THEN 'REWARDED' ELSE 'ZERO_REWARD' END,
        p_reason_code, p_calculated_coins, p_calculated_coins, p_metadata, now()
    ) RETURNING id INTO v_event_id;

    IF p_calculated_coins > 0 THEN
        INSERT INTO public.coin_wallets (user_id, current_balance, lifetime_earned, lifetime_spent)
        VALUES (p_user_id, 0, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;

        SELECT current_balance, lifetime_earned INTO v_current_bal, v_lifetime_earned
        FROM public.coin_wallets WHERE user_id = p_user_id FOR UPDATE;

        v_new_bal := v_current_bal + p_calculated_coins;
        v_new_earned := v_lifetime_earned + p_calculated_coins;

        INSERT INTO public.coin_ledger (
            user_id, transaction_type, amount, direction, balance_after,
            source_event_id, source_type, source_id, reason_code, idempotency_key, metadata
        ) VALUES (
            p_user_id, 'CREDIT', p_calculated_coins, 'CREDIT', v_new_bal,
            v_event_id, p_source_type, p_source_id, p_reason_code, 'ledger_' || p_idempotency_key, p_metadata
        ) RETURNING id INTO v_ledger_id;

        UPDATE public.coin_wallets
        SET current_balance = v_new_bal,
            lifetime_earned = v_new_earned,
            last_transaction_at = now(),
            updated_at = now()
        WHERE user_id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'coins_awarded', p_calculated_coins);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mark_accepted_answer(p_thread_id uuid, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_msg_author_id UUID;
    v_msg_thread_id UUID;
    v_is_staff BOOLEAN;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
        public.fn_jwt_is_admin_or_staff()
    );

    SELECT author_id INTO v_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thread not found');
    END IF;

    IF v_author_id != v_user_id AND NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only thread author or staff can mark accepted answer');
    END IF;

    SELECT thread_id, author_id INTO v_msg_thread_id, v_msg_author_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND OR v_msg_thread_id != p_thread_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message does not belong to this thread');
    END IF;

    UPDATE public.discussion_threads
    SET accepted_answer_id = p_message_id,
        status = 'RESOLVED',
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3D Gamification Event: Award 25 coins for accepted answer
    v_event_key := 'disc_accepted_' || p_thread_id || '_' || p_message_id;
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_msg_author_id, 'ACCEPTED_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
        'VERIFIED', 'REWARDED', 25, 25,
        jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Phase 3H Notification to Answer Author
    IF v_msg_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_msg_author_id, 'ACADEMIC', 'HIGH',
            'Your answer was accepted!',
            'Your solution was marked as the accepted answer (+25 coins bonus).',
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
            'disc_notif_accepted_' || p_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', p_thread_id,
        'accepted_answer_id', p_message_id,
        'status', 'RESOLVED'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_vote_discussion_message(p_message_id uuid, p_vote_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_msg_author_id UUID;
    v_thread_id UUID;
    v_new_count INTEGER;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT author_id, thread_id INTO v_msg_author_id, v_thread_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF p_vote_action = 'ADD' THEN
        INSERT INTO public.discussion_votes (message_id, user_id)
        VALUES (p_message_id, v_user_id)
        ON CONFLICT (message_id, user_id) DO NOTHING;
    ELSIF p_vote_action = 'REMOVE' THEN
        DELETE FROM public.discussion_votes
        WHERE message_id = p_message_id AND user_id = v_user_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid vote action. Must be ADD or REMOVE');
    END IF;

    SELECT count(*) INTO v_new_count
    FROM public.discussion_votes
    WHERE message_id = p_message_id;

    UPDATE public.discussion_messages
    SET upvote_count = v_new_count,
        updated_at = now()
    WHERE id = p_message_id;

    -- Phase 3D Milestone Bonus (At 5 upvotes, award 10 coins)
    IF v_new_count >= 5 THEN
        v_event_key := 'disc_upvote_milestone_5_' || p_message_id;
        INSERT INTO public.gamification_events (
            user_id, event_type, source_type, source_id, idempotency_key,
            verification_status, reward_status, calculated_coins, actual_coins_awarded,
            metadata, occurred_at
        ) VALUES (
            v_msg_author_id, 'HELPFUL_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
            'VERIFIED', 'REWARDED', 10, 10,
            jsonb_build_object('message_id', p_message_id, 'milestone', 5),
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'upvote_count', v_new_count
    );
END;
$function$;

COMMIT;
