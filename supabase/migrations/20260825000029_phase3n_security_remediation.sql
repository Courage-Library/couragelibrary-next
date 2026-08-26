-- ============================================================================
-- COURAGE LIBRARY â€” PHASE 3N: SECURITY REMEDIATION & HARDENING
-- Migration: 20260825000029_phase3n_security_remediation.sql
-- Target Schema: couragelibrary-next
-- Baseline: 93 PostgreSQL Base Tables (Preserved)
-- ============================================================================

-- 1. SECURITY DEFINER HELPER TO ELIMINATE RLS RECURSION (FINDING 1)
CREATE OR REPLACE FUNCTION public.fn_is_battle_participant(
    p_room_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_room_id IS NULL OR p_user_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.quiz_battle_participants
        WHERE room_id = p_room_id AND user_id = p_user_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_battle_participant(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_is_battle_participant(UUID, UUID) TO authenticated, service_role;


-- 2. REVISE RLS POLICIES TO USE THE HELPER FUNCTION
DROP POLICY IF EXISTS p_qbp_select ON public.quiz_battle_participants;
CREATE POLICY p_qbp_select ON public.quiz_battle_participants
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        public.fn_is_battle_participant(quiz_battle_participants.room_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_qbra_select ON public.quiz_battle_round_answers;
CREATE POLICY p_qbra_select ON public.quiz_battle_round_answers
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        (
            EXISTS (
                SELECT 1 FROM public.quiz_battle_rooms qbr
                WHERE qbr.id = quiz_battle_round_answers.room_id
                  AND qbr.status = 'COMPLETED'
            ) AND
            public.fn_is_battle_participant(quiz_battle_round_answers.room_id, auth.uid())
        ) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_qbr_select ON public.quiz_battle_rooms;
CREATE POLICY p_qbr_select ON public.quiz_battle_rooms
    FOR SELECT TO public
    USING (
        status IN ('WAITING', 'READY', 'COUNTDOWN', 'ACTIVE', 'COMPLETED') AND (
            is_private = false OR
            created_by_user_id = auth.uid() OR
            public.fn_is_battle_participant(quiz_battle_rooms.id, auth.uid()) OR
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        )
    );


-- 3. QUESTION ID DIRECT ENUMERATION LEAKAGE MASKING (FINDING 3)
-- Revoke column-level SELECT on question_ids for ordinary clients
REVOKE SELECT (question_ids) ON public.quiz_battle_rooms FROM anon, authenticated;


-- 4. REMEDIATE fn_get_active_battle_round (FINDING 5: COUNTDOWN -> ACTIVE TRANSITION)
CREATE OR REPLACE FUNCTION public.fn_get_active_battle_round(
    p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_status TEXT;
    v_current_round INTEGER;
    v_total_rounds INTEGER;
    v_question_ids UUID[];
    v_round_started_at TIMESTAMPTZ;
    v_round_ends_at TIMESTAMPTZ;
    v_q_id UUID;
    v_qv_id UUID;
    v_question_text TEXT;
    v_options JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Verify user is a participant using helper
    IF NOT public.fn_is_battle_participant(p_room_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;

    SELECT status, current_round, total_rounds, question_ids, round_started_at, round_ends_at
    INTO v_status, v_current_round, v_total_rounds, v_question_ids, v_round_started_at, v_round_ends_at
    FROM public.quiz_battle_rooms
    WHERE id = p_room_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Room not found');
    END IF;

    -- Finding 5: Server-authoritative transition from COUNTDOWN to ACTIVE
    IF v_status = 'COUNTDOWN' AND clock_timestamp() >= v_round_started_at THEN
        UPDATE public.quiz_battle_rooms
        SET status = 'ACTIVE', updated_at = now()
        WHERE id = p_room_id AND status = 'COUNTDOWN';
        v_status := 'ACTIVE';
    END IF;

    IF v_status NOT IN ('COUNTDOWN', 'ACTIVE', 'ROUND_CLOSING') THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', v_status,
            'current_round', v_current_round,
            'total_rounds', v_total_rounds
        );
    END IF;

    v_q_id := v_question_ids[v_current_round];

    -- Fetch current question version
    SELECT id, question_text INTO v_qv_id, v_question_text
    FROM public.question_versions
    WHERE question_id = v_q_id AND is_current = true
    LIMIT 1;

    -- Fetch scrubbed options (strictly NO is_correct or explanation)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', qo.id,
            'option_key', qo.option_key,
            'option_text', qo.option_text,
            'order_index', qo.order_index
        ) ORDER BY qo.order_index
    ) INTO v_options
    FROM public.question_options qo
    WHERE qo.question_version_id = v_qv_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_status,
        'current_round', v_current_round,
        'total_rounds', v_total_rounds,
        'round_started_at', v_round_started_at,
        'round_ends_at', v_round_ends_at,
        'question_id', v_q_id,
        'question_text', v_question_text,
        'options', COALESCE(v_options, '[]'::jsonb)
    );
END;
$$;


-- 5. REMEDIATE fn_finalize_battle_room (FINDING 2: CANONICAL PHASE 3D COIN REWARD)
CREATE OR REPLACE FUNCTION public.fn_finalize_battle_room(
    p_room_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_room_status TEXT;
    v_current_round INTEGER;
    v_total_rounds INTEGER;
    v_round_ends_at TIMESTAMPTZ;
    v_winner_id UUID := NULL;
    v_p1_id UUID;
    v_p2_id UUID;
    v_p1_score INTEGER;
    v_p2_score INTEGER;
    v_p1_time INTEGER;
    v_p2_time INTEGER;
    v_p1_elo INTEGER;
    v_p2_elo INTEGER;
    v_p1_games INTEGER;
    v_p2_games INTEGER;
    v_p1_k INTEGER;
    v_p2_k INTEGER;
    v_ea NUMERIC;
    v_eb NUMERIC;
    v_sa NUMERIC := 0.5;
    v_sb NUMERIC := 0.5;
    v_delta_a INTEGER := 0;
    v_delta_b INTEGER := 0;
    v_topic_id UUID;
    v_rematch_count INTEGER;
    v_answered_count INTEGER;
    v_participant_count INTEGER;
    v_reward_res JSONB;
BEGIN
    SELECT status, current_round, total_rounds, round_ends_at, topic_id
    INTO v_room_status, v_current_round, v_total_rounds, v_round_ends_at, v_topic_id
    FROM public.quiz_battle_rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Room not found');
    END IF;

    IF v_room_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_COMPLETED');
    END IF;

    -- Guard against unauthorized premature finalization
    SELECT count(*) INTO v_participant_count FROM public.quiz_battle_participants WHERE room_id = p_room_id;
    SELECT count(*) INTO v_answered_count FROM public.quiz_battle_round_answers WHERE room_id = p_room_id AND round_number = v_total_rounds;

    IF v_room_status NOT IN ('CANCELLED', 'EXPIRED') THEN
        IF v_current_round < v_total_rounds OR (v_answered_count < v_participant_count AND clock_timestamp() < v_round_ends_at) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Cannot finalize battle before final round is complete');
        END IF;
    END IF;

    -- Fetch participants sorted by score DESC, total_time_ms ASC
    SELECT user_id, final_score, total_time_ms INTO v_p1_id, v_p1_score, v_p1_time
    FROM public.quiz_battle_participants
    WHERE room_id = p_room_id
    ORDER BY final_score DESC, total_time_ms ASC
    LIMIT 1 OFFSET 0;

    SELECT user_id, final_score, total_time_ms INTO v_p2_id, v_p2_score, v_p2_time
    FROM public.quiz_battle_participants
    WHERE room_id = p_room_id
    ORDER BY final_score DESC, total_time_ms ASC
    LIMIT 1 OFFSET 1;

    -- Determine winner
    IF v_p1_score > v_p2_score OR (v_p1_score = v_p2_score AND v_p1_time < v_p2_time) THEN
        v_winner_id := v_p1_id;
        v_sa := 1.0;
        v_sb := 0.0;
    ELSIF v_p2_score > v_p1_score OR (v_p1_score = v_p2_score AND v_p2_time < v_p1_time) THEN
        v_winner_id := v_p2_id;
        v_sa := 0.0;
        v_sb := 1.0;
    ELSE
        v_winner_id := NULL; -- Draw
        v_sa := 0.5;
        v_sb := 0.5;
    END IF;

    -- Calculate ELO Ratings if 2 players
    IF v_p1_id IS NOT NULL AND v_p2_id IS NOT NULL THEN
        SELECT elo_rating, total_battles INTO v_p1_elo, v_p1_games
        FROM public.user_battle_stats WHERE user_id = v_p1_id;
        IF v_p1_elo IS NULL THEN v_p1_elo := 1200; v_p1_games := 0; END IF;

        SELECT elo_rating, total_battles INTO v_p2_elo, v_p2_games
        FROM public.user_battle_stats WHERE user_id = v_p2_id;
        IF v_p2_elo IS NULL THEN v_p2_elo := 1200; v_p2_games := 0; END IF;

        v_p1_k := CASE WHEN v_p1_games <= 20 THEN 32 ELSE 16 END;
        v_p2_k := CASE WHEN v_p2_games <= 20 THEN 32 ELSE 16 END;

        v_ea := 1.0 / (1.0 + power(10.0, (v_p2_elo - v_p1_elo)::numeric / 400.0));
        v_eb := 1.0 / (1.0 + power(10.0, (v_p1_elo - v_p2_elo)::numeric / 400.0));

        -- Anti-rematch limit: Check games played together today
        SELECT count(*) INTO v_rematch_count
        FROM public.quiz_battle_participants p1
        JOIN public.quiz_battle_participants p2 ON p1.room_id = p2.room_id
        JOIN public.quiz_battle_rooms r ON p1.room_id = r.id
        WHERE p1.user_id = v_p1_id AND p2.user_id = v_p2_id AND r.status = 'COMPLETED' AND p1.created_at >= CURRENT_DATE;

        IF v_rematch_count < 5 THEN
            v_delta_a := round(v_p1_k * (v_sa - v_ea))::integer;
            v_delta_b := round(v_p2_k * (v_sb - v_eb))::integer;
        ELSE
            v_delta_a := 0;
            v_delta_b := 0;
        END IF;

        -- Update P1 Stats
        INSERT INTO public.user_battle_stats (
            user_id, elo_rating, total_battles, wins, losses, draws, last_battle_at, updated_at
        ) VALUES (
            v_p1_id, GREATEST(500, LEAST(3000, v_p1_elo + v_delta_a)), 1,
            CASE WHEN v_sa = 1.0 THEN 1 ELSE 0 END,
            CASE WHEN v_sa = 0.0 THEN 1 ELSE 0 END,
            CASE WHEN v_sa = 0.5 THEN 1 ELSE 0 END,
            now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE
            SET elo_rating = GREATEST(500, LEAST(3000, public.user_battle_stats.elo_rating + v_delta_a)),
                total_battles = public.user_battle_stats.total_battles + 1,
                wins = public.user_battle_stats.wins + (CASE WHEN v_sa = 1.0 THEN 1 ELSE 0 END),
                losses = public.user_battle_stats.losses + (CASE WHEN v_sa = 0.0 THEN 1 ELSE 0 END),
                draws = public.user_battle_stats.draws + (CASE WHEN v_sa = 0.5 THEN 1 ELSE 0 END),
                last_battle_at = now(),
                updated_at = now();

        -- Update P2 Stats
        INSERT INTO public.user_battle_stats (
            user_id, elo_rating, total_battles, wins, losses, draws, last_battle_at, updated_at
        ) VALUES (
            v_p2_id, GREATEST(500, LEAST(3000, v_p2_elo + v_delta_b)), 1,
            CASE WHEN v_sb = 1.0 THEN 1 ELSE 0 END,
            CASE WHEN v_sb = 0.0 THEN 1 ELSE 0 END,
            CASE WHEN v_sb = 0.5 THEN 1 ELSE 0 END,
            now(), now()
        )
        ON CONFLICT (user_id) DO UPDATE
            SET elo_rating = GREATEST(500, LEAST(3000, public.user_battle_stats.elo_rating + v_delta_b)),
                total_battles = public.user_battle_stats.total_battles + 1,
                wins = public.user_battle_stats.wins + (CASE WHEN v_sb = 1.0 THEN 1 ELSE 0 END),
                losses = public.user_battle_stats.losses + (CASE WHEN v_sb = 0.0 THEN 1 ELSE 0 END),
                draws = public.user_battle_stats.draws + (CASE WHEN v_sb = 0.5 THEN 1 ELSE 0 END),
                last_battle_at = now(),
                updated_at = now();

        -- Update Participant records
        UPDATE public.quiz_battle_participants
        SET rank = (CASE WHEN user_id = v_p1_id THEN (CASE WHEN v_sa >= v_sb THEN 1 ELSE 2 END) ELSE (CASE WHEN v_sb > v_sa THEN 1 ELSE 2 END) END),
            is_winner = (user_id = v_winner_id),
            elo_delta = (CASE WHEN user_id = v_p1_id THEN v_delta_a ELSE v_delta_b END),
            coins_awarded = (CASE WHEN user_id = v_winner_id THEN 20 ELSE 2 END),
            updated_at = now()
        WHERE room_id = p_room_id;
    END IF;

    -- Update Room status
    UPDATE public.quiz_battle_rooms
    SET status = 'COMPLETED',
        winner_user_id = v_winner_id,
        updated_at = now()
    WHERE id = p_room_id;

    -- Finding 2: Award coins via canonical Phase 3D authority fn_award_gamification_reward
    IF v_winner_id IS NOT NULL THEN
        v_reward_res := public.fn_award_gamification_reward(
            v_winner_id,
            'QUIZ_BATTLE_WON',
            'QUIZ_BATTLE_ROOM',
            p_room_id,
            'battle_win_' || p_room_id || '_' || v_winner_id,
            20,
            'QUIZ_BATTLE_WIN_REWARD',
            jsonb_build_object('room_id', p_room_id, 'score', GREATEST(COALESCE(v_p1_score,0), COALESCE(v_p2_score,0)))
        );
    END IF;

    -- Phase 3C Activity Logging (TOPIC_LEARNING_ACTIVITY)
    IF v_p1_id IS NOT NULL AND v_topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_p1_id, v_topic_id, 'quiz-battle-' || p_room_id, 'TOPIC_LEARNING_ACTIVITY', COALESCE(v_p1_time / 1000, 0),
            jsonb_build_object('activity_type', 'QUIZ_BATTLE', 'room_id', p_room_id, 'score', v_p1_score, 'is_winner', (v_p1_id = v_winner_id)),
            now()
        );
    END IF;

    IF v_p2_id IS NOT NULL AND v_topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_p2_id, v_topic_id, 'quiz-battle-' || p_room_id, 'TOPIC_LEARNING_ACTIVITY', COALESCE(v_p2_time / 1000, 0),
            jsonb_build_object('activity_type', 'QUIZ_BATTLE', 'room_id', p_room_id, 'score', v_p2_score, 'is_winner', (v_p2_id = v_winner_id)),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'room_id', p_room_id,
        'winner_user_id', v_winner_id,
        'status', 'COMPLETED'
    );
END;
$$;

NOTIFY pgrst, 'reload schema';