-- ============================================================================
-- COURAGE LIBRARY â€” PHASE 3N: MULTIPLAYER QUIZ BATTLES & LIVE PEER CHALLENGES
-- Target Schema: couragelibrary-next
-- Baseline: 89 Base Tables -> Target: 93 Base Tables
-- ============================================================================

-- 1. TABLE: quiz_battle_rooms
CREATE TABLE IF NOT EXISTS public.quiz_battle_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT NOT NULL,
    battle_type TEXT NOT NULL DEFAULT '1v1' CHECK (battle_type IN ('1v1', 'GROUP_SPEED', 'TOURNAMENT')),
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    access_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (access_tier IN ('FREE', 'PRO')),
    max_participants INTEGER NOT NULL DEFAULT 2 CHECK (max_participants BETWEEN 2 AND 10),
    total_rounds INTEGER NOT NULL DEFAULT 5 CHECK (total_rounds BETWEEN 3 AND 20),
    time_per_question_seconds INTEGER NOT NULL DEFAULT 15 CHECK (time_per_question_seconds BETWEEN 5 AND 60),
    question_ids UUID[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'READY', 'COUNTDOWN', 'ACTIVE', 'ROUND_CLOSING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round >= 1),
    round_started_at TIMESTAMPTZ,
    round_ends_at TIMESTAMPTZ,
    winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_battle_room_code UNIQUE (room_code)
);

ALTER TABLE public.quiz_battle_rooms ADD COLUMN IF NOT EXISTS access_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (access_tier IN ('FREE', 'PRO'));

CREATE INDEX IF NOT EXISTS idx_qbr_status_topic ON public.quiz_battle_rooms (status, topic_id, is_private) WHERE status = 'WAITING';
CREATE INDEX IF NOT EXISTS idx_qbr_room_code ON public.quiz_battle_rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_qbr_created_by ON public.quiz_battle_rooms (created_by_user_id);


-- 2. TABLE: quiz_battle_participants
CREATE TABLE IF NOT EXISTS public.quiz_battle_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.quiz_battle_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_ready BOOLEAN NOT NULL DEFAULT false,
    final_score INTEGER NOT NULL DEFAULT 0 CHECK (final_score >= 0),
    rank INTEGER CHECK (rank >= 1),
    total_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (total_time_ms >= 0),
    is_winner BOOLEAN NOT NULL DEFAULT false,
    coins_awarded INTEGER NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
    elo_delta INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_room_participant UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_qbp_room ON public.quiz_battle_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_qbp_user ON public.quiz_battle_participants (user_id);


-- 3. TABLE: quiz_battle_round_answers
CREATE TABLE IF NOT EXISTS public.quiz_battle_round_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.quiz_battle_rooms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL CHECK (round_number >= 1),
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
    score_points INTEGER NOT NULL DEFAULT 0 CHECK (score_points >= 0),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_room_round_user_answer UNIQUE (room_id, user_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_qbra_room_round ON public.quiz_battle_round_answers (room_id, round_number);
CREATE INDEX IF NOT EXISTS idx_qbra_user ON public.quiz_battle_round_answers (user_id);


-- 4. TABLE: user_battle_stats
CREATE TABLE IF NOT EXISTS public.user_battle_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    elo_rating INTEGER NOT NULL DEFAULT 1200 CHECK (elo_rating BETWEEN 500 AND 3000),
    total_battles INTEGER NOT NULL DEFAULT 0 CHECK (total_battles >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
    current_win_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_win_streak >= 0),
    highest_win_streak INTEGER NOT NULL DEFAULT 0 CHECK (highest_win_streak >= 0),
    total_correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (total_correct_answers >= 0),
    average_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (average_latency_ms >= 0),
    last_battle_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubs_elo ON public.user_battle_stats (elo_rating DESC);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.quiz_battle_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_qbr_select ON public.quiz_battle_rooms;
CREATE POLICY p_qbr_select ON public.quiz_battle_rooms
    FOR SELECT TO public
    USING (
        status IN ('WAITING', 'READY', 'COUNTDOWN', 'ACTIVE', 'COMPLETED') AND (
            is_private = false OR
            created_by_user_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM public.quiz_battle_participants qbp
                WHERE qbp.room_id = quiz_battle_rooms.id
                  AND qbp.user_id = auth.uid()
            ) OR
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        )
    );

DROP POLICY IF EXISTS p_qbr_manage_staff ON public.quiz_battle_rooms;
CREATE POLICY p_qbr_manage_staff ON public.quiz_battle_rooms
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.quiz_battle_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_qbp_select ON public.quiz_battle_participants;
CREATE POLICY p_qbp_select ON public.quiz_battle_participants
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.quiz_battle_participants p2
            WHERE p2.room_id = quiz_battle_participants.room_id
              AND p2.user_id = auth.uid()
        ) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_qbp_manage_staff ON public.quiz_battle_participants;
CREATE POLICY p_qbp_manage_staff ON public.quiz_battle_participants
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.quiz_battle_round_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_qbra_select ON public.quiz_battle_round_answers;
CREATE POLICY p_qbra_select ON public.quiz_battle_round_answers
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.quiz_battle_rooms qbr
            WHERE qbr.id = quiz_battle_round_answers.room_id
              AND qbr.status = 'COMPLETED'
              AND EXISTS (
                  SELECT 1 FROM public.quiz_battle_participants qbp
                  WHERE qbp.room_id = qbr.id AND qbp.user_id = auth.uid()
              )
        ) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_qbra_manage_staff ON public.quiz_battle_round_answers;
CREATE POLICY p_qbra_manage_staff ON public.quiz_battle_round_answers
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.user_battle_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ubs_select_public ON public.user_battle_stats;
CREATE POLICY p_ubs_select_public ON public.user_battle_stats
    FOR SELECT TO public
    USING (true);

DROP POLICY IF EXISTS p_ubs_manage_staff ON public.user_battle_stats;
CREATE POLICY p_ubs_manage_staff ON public.user_battle_stats
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- ============================================================================
-- RUNTIME RPCS (SECURITY DEFINER)
-- ============================================================================

-- 1. fn_find_or_create_battle_room
CREATE OR REPLACE FUNCTION public.fn_find_or_create_battle_room(
    p_topic_id UUID DEFAULT NULL,
    p_is_private BOOLEAN DEFAULT false,
    p_access_tier TEXT DEFAULT 'FREE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;


-- 2. fn_join_battle_by_code
CREATE OR REPLACE FUNCTION public.fn_join_battle_by_code(
    p_room_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;


-- 3. fn_get_active_battle_round (SANITIZED CLIENT RETRIEVAL â€” ZERO FUTURE QUESTION OR ANSWER LEAKAGE)
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

    -- Verify user is a participant
    IF NOT EXISTS (SELECT 1 FROM public.quiz_battle_participants WHERE room_id = p_room_id AND user_id = v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied');
    END IF;

    SELECT status, current_round, total_rounds, question_ids, round_started_at, round_ends_at
    INTO v_status, v_current_round, v_total_rounds, v_question_ids, v_round_started_at, v_round_ends_at
    FROM public.quiz_battle_rooms
    WHERE id = p_room_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Room not found');
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


-- 4. fn_submit_battle_round_answer
CREATE OR REPLACE FUNCTION public.fn_submit_battle_round_answer(
    p_room_id UUID,
    p_round_number INTEGER,
    p_selected_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    IF v_received_at < v_round_started_at THEN
        RETURN jsonb_build_object('success', false, 'error', 'Round has not started yet');
    END IF;

    IF p_round_number != v_current_round THEN
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
$$;


-- 5. fn_finalize_battle_room
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

    -- Dispatch Phase 3D Gamification Reward for Winner (20 coins)
    IF v_winner_id IS NOT NULL THEN
        INSERT INTO public.gamification_events (
            user_id, event_type, source_type, source_id, idempotency_key,
            verification_status, reward_status, calculated_coins, actual_coins_awarded,
            metadata, occurred_at
        ) VALUES (
            v_winner_id, 'QUIZ_BATTLE_WON', 'QUIZ_BATTLE_ROOM', p_room_id,
            'battle_win_' || p_room_id || '_' || v_winner_id,
            'VERIFIED', 'REWARDED', 20, 20,
            jsonb_build_object('room_id', p_room_id, 'score', GREATEST(COALESCE(v_p1_score,0), COALESCE(v_p2_score,0))),
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
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


-- ============================================================================
-- PERMISSIONS & SCHEMA NOTIFY
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_find_or_create_battle_room(UUID, BOOLEAN, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_find_or_create_battle_room(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_join_battle_by_code(TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_join_battle_by_code(TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_get_active_battle_round(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_get_active_battle_round(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_submit_battle_round_answer(UUID, INTEGER, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_submit_battle_round_answer(UUID, INTEGER, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_finalize_battle_room(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_finalize_battle_room(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';