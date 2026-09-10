-- ============================================================================
-- COURAGE LIBRARY — PHASE 5D: RESULT ENGINE & NATIONAL RANK COMPUTATION
-- Migration 47: Ranking Snapshots, Leaderboards, Evaluation & Publication RPCs
-- ============================================================================

-- 1. Add active_snapshot_version column to live_test_events if not present
ALTER TABLE public.live_test_events
ADD COLUMN IF NOT EXISTS active_snapshot_version INTEGER;

-- 2. Create live_test_ranking_snapshots Table
CREATE TABLE IF NOT EXISTS public.live_test_ranking_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID NOT NULL REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    snapshot_version INTEGER NOT NULL DEFAULT 1,
    total_participants INTEGER NOT NULL DEFAULT 0,
    highest_score NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    average_score NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    lowest_score NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    is_finalized BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT false,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_live_test_snapshots_event_version UNIQUE (live_test_event_id, snapshot_version)
);

-- 3. Create live_test_leaderboard_entries Table
CREATE TABLE IF NOT EXISTS public.live_test_leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id UUID NOT NULL REFERENCES public.live_test_ranking_snapshots(id) ON DELETE CASCADE,
    live_test_event_id UUID NOT NULL REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    attempt_id UUID NOT NULL REFERENCES public.test_attempts(id) ON DELETE RESTRICT,
    rank INTEGER NOT NULL,
    dense_rank INTEGER NOT NULL,
    percentile NUMERIC(5, 2) NOT NULL,
    total_score NUMERIC(6, 2) NOT NULL,
    max_score NUMERIC(6, 2) NOT NULL,
    accuracy_percentage NUMERIC(5, 2) NOT NULL,
    correct_count INTEGER NOT NULL,
    incorrect_count INTEGER NOT NULL,
    unanswered_count INTEGER NOT NULL,
    time_spent_seconds INTEGER NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_live_test_leaderboard_snapshot_user UNIQUE (snapshot_id, user_id)
);

-- 4. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_live_snapshots_event_active ON public.live_test_ranking_snapshots(live_test_event_id, is_active);
CREATE INDEX IF NOT EXISTS idx_live_leaderboard_snapshot_rank ON public.live_test_leaderboard_entries(snapshot_id, rank ASC);
CREATE INDEX IF NOT EXISTS idx_live_leaderboard_user ON public.live_test_leaderboard_entries(user_id, live_test_event_id);

-- 5. Row Level Security Policies
ALTER TABLE public.live_test_ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Admin / service role full access
CREATE POLICY p_live_snapshots_admin_all ON public.live_test_ranking_snapshots
FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY p_live_leaderboard_admin_all ON public.live_test_leaderboard_entries
FOR ALL USING (true) WITH CHECK (true);

-- Candidate / public SELECT allowed only when event is PUBLISHED and snapshot is active
CREATE POLICY p_live_snapshots_public_read ON public.live_test_ranking_snapshots
FOR SELECT USING (
    is_active = true AND
    EXISTS (SELECT 1 FROM public.live_test_events e WHERE e.id = live_test_event_id AND e.status = 'PUBLISHED')
);

CREATE POLICY p_live_leaderboard_public_read ON public.live_test_leaderboard_entries
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.live_test_ranking_snapshots s
        JOIN public.live_test_events e ON e.id = s.live_test_event_id
        WHERE s.id = snapshot_id AND s.is_active = true AND e.status = 'PUBLISHED'
    )
);

-- ============================================================================
-- 6. RPC: fn_evaluate_live_test_event
-- Evaluates submitted/auto-submitted attempts against immutable question versions,
-- computes scores, competition ranks, exact percentiles, and stages ranking snapshot.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_evaluate_live_test_event(
    p_event_id UUID,
    p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_instance RECORD;
    v_now TIMESTAMPTZ := now();
    v_new_snapshot_id UUID;
    v_snapshot_version INTEGER := 1;
    v_evaluated_count INTEGER := 0;
    v_highest_score NUMERIC(6, 2) := 0.00;
    v_lowest_score NUMERIC(6, 2) := 0.00;
    v_avg_score NUMERIC(6, 2) := 0.00;
    v_total_participants INTEGER := 0;
BEGIN
    -- 1. Lock event row and check state
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'EVENT_NOT_FOUND', 'message', 'Event not found.');
    END IF;

    -- Allowed source states for evaluation (including PUBLISHED for errata recalculation)
    IF v_event.status NOT IN ('GRACE_PERIOD', 'PROCESSING', 'RESULTS_READY', 'LIVE', 'PUBLISHED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_EVENT_STATE',
            'message', 'Event is not in an evaluatable state (' || v_event.status || ').'
        );
    END IF;

    -- 2. Fetch frozen instance paper
    SELECT * INTO v_instance
    FROM public.live_test_instances
    WHERE live_test_event_id = p_event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INSTANCE_NOT_FOUND', 'message', 'Frozen paper instance not found.');
    END IF;

    -- Update status to PROCESSING
    UPDATE public.live_test_events
    SET status = 'PROCESSING', updated_at = v_now
    WHERE id = p_event_id;

    -- Determine next snapshot version
    SELECT COALESCE(MAX(snapshot_version), 0) + 1 INTO v_snapshot_version
    FROM public.live_test_ranking_snapshots
    WHERE live_test_event_id = p_event_id;

    -- 3. Create candidate temporary evaluation staging table
    CREATE TEMP TABLE tmp_evaluated_candidates (
        attempt_id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        mock_test_id UUID NOT NULL,
        total_questions INTEGER NOT NULL,
        attempted_count INTEGER NOT NULL,
        correct_count INTEGER NOT NULL,
        incorrect_count INTEGER NOT NULL,
        unanswered_count INTEGER NOT NULL,
        total_score NUMERIC(6, 2) NOT NULL,
        max_score NUMERIC(6, 2) NOT NULL,
        accuracy_percentage NUMERIC(5, 2) NOT NULL,
        time_spent_seconds INTEGER NOT NULL,
        rank INTEGER,
        dense_rank INTEGER,
        percentile NUMERIC(5, 2)
    ) ON COMMIT DROP;

    -- Populate attempt answers evaluation and candidate aggregates
    INSERT INTO tmp_evaluated_candidates (
        attempt_id,
        user_id,
        mock_test_id,
        total_questions,
        attempted_count,
        correct_count,
        incorrect_count,
        unanswered_count,
        total_score,
        max_score,
        accuracy_percentage,
        time_spent_seconds
    )
    SELECT
        a.id AS attempt_id,
        a.user_id,
        a.mock_test_id,
        v_instance.total_questions,
        COUNT(CASE WHEN ans.selected_option_key IS NOT NULL THEN 1 END)::INTEGER AS attempted_count,
        COUNT(CASE WHEN ans.selected_option_key IS NOT NULL AND ans.selected_option_key = qa.correct_option_key THEN 1 END)::INTEGER AS correct_count,
        COUNT(CASE WHEN ans.selected_option_key IS NOT NULL AND ans.selected_option_key <> qa.correct_option_key THEN 1 END)::INTEGER AS incorrect_count,
        (v_instance.total_questions - COUNT(CASE WHEN ans.selected_option_key IS NOT NULL THEN 1 END))::INTEGER AS unanswered_count,
        COALESCE(SUM(
            CASE
                WHEN ans.selected_option_key IS NULL THEN 0.00
                WHEN ans.selected_option_key = qa.correct_option_key THEN mq.marks
                ELSE -mq.negative_mark
            END
        ), 0.00)::NUMERIC(6, 2) AS total_score,
        v_instance.total_marks AS max_score,
        CASE
            WHEN COUNT(CASE WHEN ans.selected_option_key IS NOT NULL THEN 1 END) = 0 THEN 0.00
            ELSE ROUND((COUNT(CASE WHEN ans.selected_option_key IS NOT NULL AND ans.selected_option_key = qa.correct_option_key THEN 1 END)::NUMERIC / COUNT(CASE WHEN ans.selected_option_key IS NOT NULL THEN 1 END)::NUMERIC) * 100.0, 2)::NUMERIC(5, 2)
        END AS accuracy_percentage,
        COALESCE(a.time_taken_seconds, 0) AS time_spent_seconds
    FROM public.test_attempts a
    JOIN public.mock_questions mq ON mq.mock_test_id = a.mock_test_id
    JOIN public.question_answers qa ON qa.question_version_id = mq.question_version_id
    LEFT JOIN public.attempt_answers ans ON ans.attempt_id = a.id AND ans.mock_question_id = mq.id
    WHERE a.mock_test_id = v_event.mock_test_id
      AND a.status IN ('submitted', 'auto_submitted', 'completed', 'evaluated')
    GROUP BY a.id, a.user_id, a.mock_test_id, a.time_taken_seconds;

    SELECT COUNT(*) INTO v_total_participants FROM tmp_evaluated_candidates;

    IF v_total_participants > 0 THEN
        -- 4. Calculate Standard Competition Rank (1224) & Dense Rank
        UPDATE tmp_evaluated_candidates t
        SET
            rank = r.calc_rank,
            dense_rank = r.calc_dense_rank
        FROM (
            SELECT
                attempt_id,
                RANK() OVER (
                    ORDER BY
                        total_score DESC,
                        accuracy_percentage DESC,
                        correct_count DESC,
                        time_spent_seconds ASC
                ) AS calc_rank,
                DENSE_RANK() OVER (
                    ORDER BY
                        total_score DESC,
                        accuracy_percentage DESC,
                        correct_count DESC,
                        time_spent_seconds ASC
                ) AS calc_dense_rank
            FROM tmp_evaluated_candidates
        ) r
        WHERE t.attempt_id = r.attempt_id;

        -- 5. Calculate Standard Competition Percentile: ((N_below + 0.5 * N_equal) / N_total) * 100
        UPDATE tmp_evaluated_candidates t
        SET percentile = ROUND(
            ((p.n_below::NUMERIC + (0.5 * p.n_equal::NUMERIC)) / v_total_participants::NUMERIC) * 100.0,
            2
        )::NUMERIC(5, 2)
        FROM (
            SELECT
                curr.attempt_id,
                COUNT(CASE WHEN (
                    other.total_score < curr.total_score OR
                    (other.total_score = curr.total_score AND other.accuracy_percentage < curr.accuracy_percentage) OR
                    (other.total_score = curr.total_score AND other.accuracy_percentage = curr.accuracy_percentage AND other.correct_count < curr.correct_count) OR
                    (other.total_score = curr.total_score AND other.accuracy_percentage = curr.accuracy_percentage AND other.correct_count = curr.correct_count AND other.time_spent_seconds > curr.time_spent_seconds)
                ) THEN 1 END) AS n_below,
                COUNT(CASE WHEN (
                    other.total_score = curr.total_score AND
                    other.accuracy_percentage = curr.accuracy_percentage AND
                    other.correct_count = curr.correct_count AND
                    other.time_spent_seconds = curr.time_spent_seconds
                ) THEN 1 END) AS n_equal
            FROM tmp_evaluated_candidates curr
            CROSS JOIN tmp_evaluated_candidates other
            GROUP BY curr.attempt_id
        ) p
        WHERE t.attempt_id = p.attempt_id;

        -- Calculate Summary Metrics
        SELECT
            MAX(total_score),
            MIN(total_score),
            ROUND(AVG(total_score), 2)
        INTO
            v_highest_score,
            v_lowest_score,
            v_avg_score
        FROM tmp_evaluated_candidates;

        -- 6. Upsert into core test_results
        INSERT INTO public.test_results (
            attempt_id,
            user_id,
            mock_test_id,
            total_questions,
            attempted_count,
            correct_count,
            incorrect_count,
            unanswered_count,
            total_score,
            max_score,
            accuracy_percentage,
            time_spent_seconds,
            rank,
            percentile,
            evaluated_at
        )
        SELECT
            attempt_id,
            user_id,
            mock_test_id,
            total_questions,
            attempted_count,
            correct_count,
            incorrect_count,
            unanswered_count,
            total_score,
            max_score,
            accuracy_percentage,
            time_spent_seconds,
            rank,
            percentile,
            v_now
        FROM tmp_evaluated_candidates
        ON CONFLICT (attempt_id)
        DO UPDATE SET
            total_questions = EXCLUDED.total_questions,
            attempted_count = EXCLUDED.attempted_count,
            correct_count = EXCLUDED.correct_count,
            incorrect_count = EXCLUDED.incorrect_count,
            unanswered_count = EXCLUDED.unanswered_count,
            total_score = EXCLUDED.total_score,
            max_score = EXCLUDED.max_score,
            accuracy_percentage = EXCLUDED.accuracy_percentage,
            time_spent_seconds = EXCLUDED.time_spent_seconds,
            rank = EXCLUDED.rank,
            percentile = EXCLUDED.percentile,
            evaluated_at = v_now;

        -- Update is_correct on attempt_answers
        UPDATE public.attempt_answers ans
        SET
            is_correct = (ans.selected_option_key IS NOT NULL AND ans.selected_option_key = qa.correct_option_key),
            evaluated_marks = CASE
                WHEN ans.selected_option_key IS NULL THEN 0.00
                WHEN ans.selected_option_key = qa.correct_option_key THEN mq.marks
                ELSE -mq.negative_mark
            END,
            updated_at = v_now
        FROM public.mock_questions mq
        JOIN public.question_answers qa ON qa.question_version_id = mq.question_version_id
        WHERE mq.mock_test_id = v_event.mock_test_id
          AND ans.mock_question_id = mq.id
          AND ans.attempt_id IN (SELECT attempt_id FROM tmp_evaluated_candidates);
    END IF;

    -- 7. Insert into live_test_ranking_snapshots (staged: is_active = false, is_finalized = true)
    INSERT INTO public.live_test_ranking_snapshots (
        live_test_event_id,
        snapshot_version,
        total_participants,
        highest_score,
        average_score,
        lowest_score,
        is_finalized,
        is_active,
        computed_at
    )
    VALUES (
        p_event_id,
        v_snapshot_version,
        v_total_participants,
        COALESCE(v_highest_score, 0.00),
        COALESCE(v_avg_score, 0.00),
        COALESCE(v_lowest_score, 0.00),
        true,
        false,
        v_now
    )
    RETURNING id INTO v_new_snapshot_id;

    -- 8. Bulk insert into live_test_leaderboard_entries
    IF v_total_participants > 0 THEN
        INSERT INTO public.live_test_leaderboard_entries (
            snapshot_id,
            live_test_event_id,
            user_id,
            attempt_id,
            rank,
            dense_rank,
            percentile,
            total_score,
            max_score,
            accuracy_percentage,
            correct_count,
            incorrect_count,
            unanswered_count,
            time_spent_seconds,
            is_public
        )
        SELECT
            v_new_snapshot_id,
            p_event_id,
            user_id,
            attempt_id,
            rank,
            dense_rank,
            percentile,
            total_score,
            max_score,
            accuracy_percentage,
            correct_count,
            incorrect_count,
            unanswered_count,
            time_spent_seconds,
            true
        FROM tmp_evaluated_candidates
        ORDER BY
            total_score DESC,
            accuracy_percentage DESC,
            correct_count DESC,
            time_spent_seconds ASC,
            user_id ASC;
    END IF;

    -- 9. Transition event status to RESULTS_READY
    UPDATE public.live_test_events
    SET status = 'RESULTS_READY', updated_at = v_now
    WHERE id = p_event_id;

    -- 10. Record immutable audit log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        action,
        actor_id,
        old_state,
        new_state,
        reason
    )
    VALUES (
        p_event_id,
        'EVALUATE_EVENT',
        p_actor_id,
        jsonb_build_object('status', v_event.status),
        jsonb_build_object(
            'status', 'RESULTS_READY',
            'snapshot_id', v_new_snapshot_id,
            'snapshot_version', v_snapshot_version,
            'total_participants', v_total_participants
        ),
        'Authoritative batch evaluation completed successfully'
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'status', 'RESULTS_READY',
        'snapshot_id', v_new_snapshot_id,
        'snapshot_version', v_snapshot_version,
        'evaluated_count', v_total_participants,
        'highest_score', v_highest_score,
        'average_score', v_avg_score
    );
END;
$$;

-- ============================================================================
-- 7. RPC: fn_publish_live_test_results
-- Atomically activates the specified ranking snapshot and transitions event to PUBLISHED.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_publish_live_test_results(
    p_event_id UUID,
    p_snapshot_version INTEGER,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_snapshot RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validate Event & Lock
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'EVENT_NOT_FOUND', 'message', 'Event not found.');
    END IF;

    IF v_event.status NOT IN ('RESULTS_READY', 'PUBLISHED') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_EVENT_STATE',
            'message', 'Results cannot be published from current state: ' || v_event.status
        );
    END IF;

    -- 2. Find target snapshot
    SELECT * INTO v_snapshot
    FROM public.live_test_ranking_snapshots
    WHERE live_test_event_id = p_event_id AND snapshot_version = p_snapshot_version;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SNAPSHOT_NOT_FOUND',
            'message', 'Target ranking snapshot version ' || p_snapshot_version || ' does not exist.'
        );
    END IF;

    -- 3. Atomic Snapshot Activation: Deactivate others, activate target
    UPDATE public.live_test_ranking_snapshots
    SET is_active = false, updated_at = v_now
    WHERE live_test_event_id = p_event_id;

    UPDATE public.live_test_ranking_snapshots
    SET is_active = true, updated_at = v_now
    WHERE id = v_snapshot.id;

    -- 4. Transition Event to PUBLISHED
    UPDATE public.live_test_events
    SET status = 'PUBLISHED',
        active_snapshot_version = p_snapshot_version,
        result_publish_at = COALESCE(result_publish_at, v_now),
        updated_at = v_now
    WHERE id = p_event_id;

    -- 5. Audit Log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        action,
        actor_id,
        old_state,
        new_state,
        reason
    )
    VALUES (
        p_event_id,
        'PUBLISH_RESULTS',
        p_actor_id,
        jsonb_build_object('status', v_event.status, 'active_snapshot_version', v_event.active_snapshot_version),
        jsonb_build_object('status', 'PUBLISHED', 'active_snapshot_version', p_snapshot_version, 'snapshot_id', v_snapshot.id),
        COALESCE(p_reason, 'Official live test result publication')
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'status', 'PUBLISHED',
        'active_snapshot_version', p_snapshot_version,
        'snapshot_id', v_snapshot.id,
        'total_participants', v_snapshot.total_participants
    );
END;
$$;

-- ============================================================================
-- 8. RPC: fn_void_live_test_attempt
-- Invalidates an attempt and logs audit details.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_void_live_test_attempt(
    p_attempt_id UUID,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_attempt RECORD;
    v_event RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT a.*, e.id AS event_id INTO v_attempt
    FROM public.test_attempts a
    JOIN public.live_test_events e ON e.mock_test_id = a.mock_test_id
    WHERE a.id = p_attempt_id
    FOR UPDATE OF a;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ATTEMPT_NOT_FOUND', 'message', 'Attempt not found.');
    END IF;

    UPDATE public.test_attempts
    SET status = 'invalidated', updated_at = v_now
    WHERE id = p_attempt_id;

    -- Audit log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        action,
        actor_id,
        old_state,
        new_state,
        reason
    )
    VALUES (
        v_attempt.event_id,
        'VOID_ATTEMPT',
        p_actor_id,
        jsonb_build_object('attempt_id', p_attempt_id, 'old_status', v_attempt.status),
        jsonb_build_object('attempt_id', p_attempt_id, 'new_status', 'invalidated'),
        COALESCE(p_reason, 'Administrative disqualification')
    );

    RETURN jsonb_build_object(
        'success', true,
        'attempt_id', p_attempt_id,
        'status', 'invalidated',
        'message', 'Attempt successfully invalidated.'
    );
END;
$$;
