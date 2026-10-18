-- SECDEF-S2-1 (SECDEF-AUDIT F-1, architect ruling 2026-10-18): fn_finalize_battle_room verifies its caller.
-- Before: granted to authenticated with no caller check — any signed-in user could finalize any finished /
-- cancelled / expired room (winner, ELO, stats writes). After: the caller must be a participant of that room
-- (auth.uid() in quiz_battle_participants) or the service role; otherwise 42501 BATTLE_FINALIZE_FORBIDDEN.
-- Body otherwise byte-identical (generated from the captured live definition); CREATE OR REPLACE keeps the ACL
-- (authenticated + service_role EXECUTE stay: services/battle.service.ts and fn_submit_battle_round_answer call it);
-- search_path stays pinned. Other battle RPCs reviewed: they already check participation (or are join / create by
-- design) — none has the same flaw. Rollback: docs/database/rollback/089_rollback.sql

DO $pre$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.fn_finalize_battle_room(uuid)'::regprocedure) <> '089cbc7ae5115e4ddf8f1fb4dd411960' THEN
    RAISE EXCEPTION 'SECDEF-S2-1 089 precondition: fn_finalize_battle_room differs from the audited definition';
  END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.fn_finalize_battle_room(p_room_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- SECDEF-S2-1 (F-1): only a participant of the room, or the service role, may finalize it
    IF NOT (
        COALESCE(auth.role(), '') = 'service_role'
        OR EXISTS (SELECT 1 FROM public.quiz_battle_participants bp WHERE bp.room_id = p_room_id AND bp.user_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'BATTLE_FINALIZE_FORBIDDEN: caller is not a participant of room %', p_room_id USING ERRCODE = '42501';
    END IF;

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
$function$;

DO $post$
DECLARE
  f record;
BEGIN
  SELECT p.prosecdef, p.proconfig, p.prosrc,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
         has_function_privilege('service_role', p.oid, 'EXECUTE') svc_x,
         has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
         EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x
    INTO f FROM pg_proc p WHERE p.oid = 'public.fn_finalize_battle_room(uuid)'::regprocedure;
  IF NOT f.prosecdef OR NOT coalesce(f.proconfig, '{}') @> ARRAY['search_path=public, pg_temp']
     OR NOT f.auth_x OR NOT f.svc_x OR f.anon_x OR f.public_x
     OR position('BATTLE_FINALIZE_FORBIDDEN' in f.prosrc) = 0 THEN
    RAISE EXCEPTION 'SECDEF-S2-1 089 postcondition failed';
  END IF;
END
$post$;
