-- ============================================================================
-- COURAGE LIBRARY — PHASE 5E.3: ACHIEVEMENTS & BADGES ENGINE
-- Migration: 20260909000050_phase5e3_achievements_and_badges_rpc.sql
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Extend badges check constraints safely for modern achievement tiers and categories
DO $$
BEGIN
    ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_category_check;
    ALTER TABLE public.badges ADD CONSTRAINT badges_category_check 
        CHECK (category IN ('CONSISTENCY', 'VOLUME', 'MASTERY', 'PRECISION', 'PROVENANCE', 'SPECIAL', 'MILESTONE', 'NATIONAL', 'PODIUM', 'PERSONAL_BEST', 'IMPROVEMENT'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE public.badges DROP CONSTRAINT IF EXISTS badges_tier_check;
    ALTER TABLE public.badges ADD CONSTRAINT badges_tier_check 
        CHECK (tier IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Seed Master Badges Catalog (Phase 3D Foundation Integration)
INSERT INTO public.badges (
    code, title, description, category, tier, coin_reward, icon_url, criteria_json, display_order, is_active
) VALUES
    ('FIRST_LIVE_TEST', 'Live Test Pioneer', 'Completed first valid live mock examination', 'MILESTONE', 'BRONZE', 0, 'award', '{"type":"FIRST_LIVE_TEST"}'::jsonb, 10, true),
    ('LIVE_TEST_COMPLETED_3', 'Live Exam Veteran III', 'Completed 3 evaluated live mock examinations', 'MILESTONE', 'SILVER', 0, 'award', '{"type":"LIVE_TEST_COMPLETED_3"}'::jsonb, 20, true),
    ('LIVE_TEST_COMPLETED_5', 'Live Exam Veteran V', 'Completed 5 evaluated live mock examinations', 'MILESTONE', 'GOLD', 0, 'award', '{"type":"LIVE_TEST_COMPLETED_5"}'::jsonb, 30, true),
    ('LIVE_TEST_COMPLETED_10', 'Live Exam Legend X', 'Completed 10 evaluated live mock examinations', 'MILESTONE', 'PLATINUM', 0, 'award', '{"type":"LIVE_TEST_COMPLETED_10"}'::jsonb, 40, true),
    ('PODIUM_GOLD', 'National Champion (Rank 1)', 'Secured Rank 1 in All-India Live Championship', 'PODIUM', 'PLATINUM', 0, 'trophy', '{"type":"PODIUM_GOLD"}'::jsonb, 1, true),
    ('PODIUM_SILVER', 'National Runner-Up (Rank 2)', 'Secured Rank 2 in All-India Live Championship', 'PODIUM', 'GOLD', 0, 'trophy', '{"type":"PODIUM_SILVER"}'::jsonb, 2, true),
    ('PODIUM_BRONZE', 'National 2nd Runner-Up (Rank 3)', 'Secured Rank 3 in All-India Live Championship', 'PODIUM', 'BRONZE', 0, 'trophy', '{"type":"PODIUM_BRONZE"}'::jsonb, 3, true),
    ('NATIONAL_TOP_10', 'Top 10 National Merit', 'Ranked in the National Top 10 in All-India Live Exam', 'NATIONAL', 'GOLD', 0, 'medal', '{"type":"NATIONAL_TOP_10"}'::jsonb, 15, true),
    ('NATIONAL_TOP_50', 'Top 50 National Merit', 'Ranked in the National Top 50 in All-India Live Exam', 'NATIONAL', 'SILVER', 0, 'medal', '{"type":"NATIONAL_TOP_50"}'::jsonb, 25, true),
    ('NATIONAL_TOP_100', 'Top 100 National Merit', 'Ranked in the National Top 100 in All-India Live Exam', 'NATIONAL', 'BRONZE', 0, 'medal', '{"type":"NATIONAL_TOP_100"}'::jsonb, 35, true),
    ('NATIONAL_TOP_1_PERCENT', 'Top 1% National Elite', 'Achieved 99th+ National Percentile in All-India Exam', 'NATIONAL', 'PLATINUM', 0, 'zap', '{"type":"NATIONAL_TOP_1_PERCENT"}'::jsonb, 12, true),
    ('NATIONAL_TOP_5_PERCENT', 'Top 5% National Achiever', 'Achieved 95th+ National Percentile in All-India Exam', 'NATIONAL', 'GOLD', 0, 'zap', '{"type":"NATIONAL_TOP_5_PERCENT"}'::jsonb, 22, true),
    ('NATIONAL_TOP_10_PERCENT', 'Top 10% Decile Achiever', 'Achieved 90th+ National Percentile in All-India Exam', 'NATIONAL', 'SILVER', 0, 'zap', '{"type":"NATIONAL_TOP_10_PERCENT"}'::jsonb, 32, true),
    ('PERSONAL_BEST_SCORE', 'Personal Best Score', 'Exceeded prior highest score in this exam family', 'PERSONAL_BEST', 'BRONZE', 0, 'trending-up', '{"type":"PERSONAL_BEST_SCORE"}'::jsonb, 50, true),
    ('PERSONAL_BEST_RANK', 'Personal Best Rank', 'Achieved personal highest national rank in this exam family', 'PERSONAL_BEST', 'SILVER', 0, 'trending-up', '{"type":"PERSONAL_BEST_RANK"}'::jsonb, 51, true),
    ('PERSONAL_BEST_PERCENTILE', 'Personal Best Percentile', 'Achieved personal highest percentile in this exam family', 'PERSONAL_BEST', 'SILVER', 0, 'trending-up', '{"type":"PERSONAL_BEST_PERCENTILE"}'::jsonb, 52, true),
    ('CONSISTENT_PERFORMER_3', 'Consistency Streak (3 Exams)', 'Completed 3 consecutive live exams in the same exam family', 'CONSISTENCY', 'SILVER', 0, 'flame', '{"type":"CONSISTENT_PERFORMER_3"}'::jsonb, 60, true),
    ('CONSISTENT_PERFORMER_5', 'Consistency Streak (5 Exams)', 'Completed 5 consecutive live exams in the same exam family', 'CONSISTENCY', 'GOLD', 0, 'flame', '{"type":"CONSISTENT_PERFORMER_5"}'::jsonb, 61, true)
ON CONFLICT (code) DO UPDATE SET 
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    is_active = true,
    updated_at = now();

-- 3. Create live_test_achievement_definitions Table
CREATE TABLE IF NOT EXISTS public.live_test_achievement_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_code TEXT NOT NULL REFERENCES public.badges(code) ON DELETE RESTRICT,
    category TEXT NOT NULL CHECK (category IN ('MILESTONE', 'NATIONAL', 'PODIUM', 'PERSONAL_BEST', 'IMPROVEMENT', 'CONSISTENCY')),
    condition_type TEXT NOT NULL CHECK (condition_type IN ('COMPLETION_COUNT', 'RANK_THRESHOLD', 'PERCENTILE_THRESHOLD', 'PERSONAL_BEST', 'IMPROVEMENT', 'CONSECUTIVE_COMPLETIONS')),
    condition_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_repeatable BOOLEAN NOT NULL DEFAULT false,
    scope TEXT NOT NULL DEFAULT 'GLOBAL' CHECK (scope IN ('GLOBAL', 'EXAM', 'EVENT')),
    priority INTEGER NOT NULL DEFAULT 100,
    policy_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ach_def_code_version UNIQUE (badge_code, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_live_ach_def_code_active 
ON public.live_test_achievement_definitions(badge_code, is_active);

-- 4. Seed V1 Achievement Definitions
INSERT INTO public.live_test_achievement_definitions (
    badge_code, category, condition_type, condition_config, is_repeatable, scope, priority, policy_version, is_active
) VALUES
    ('FIRST_LIVE_TEST', 'MILESTONE', 'COMPLETION_COUNT', '{"min_completed": 1}'::jsonb, false, 'GLOBAL', 10, 1, true),
    ('LIVE_TEST_COMPLETED_3', 'MILESTONE', 'COMPLETION_COUNT', '{"min_completed": 3}'::jsonb, false, 'GLOBAL', 20, 1, true),
    ('LIVE_TEST_COMPLETED_5', 'MILESTONE', 'COMPLETION_COUNT', '{"min_completed": 5}'::jsonb, false, 'GLOBAL', 30, 1, true),
    ('LIVE_TEST_COMPLETED_10', 'MILESTONE', 'COMPLETION_COUNT', '{"min_completed": 10}'::jsonb, false, 'GLOBAL', 40, 1, true),
    ('PODIUM_GOLD', 'PODIUM', 'RANK_THRESHOLD', '{"exact_rank": 1}'::jsonb, true, 'EVENT', 5, 1, true),
    ('PODIUM_SILVER', 'PODIUM', 'RANK_THRESHOLD', '{"exact_rank": 2}'::jsonb, true, 'EVENT', 6, 1, true),
    ('PODIUM_BRONZE', 'PODIUM', 'RANK_THRESHOLD', '{"exact_rank": 3}'::jsonb, true, 'EVENT', 7, 1, true),
    ('NATIONAL_TOP_10', 'NATIONAL', 'RANK_THRESHOLD', '{"min_rank": 1, "max_rank": 10}'::jsonb, true, 'EVENT', 15, 1, true),
    ('NATIONAL_TOP_50', 'NATIONAL', 'RANK_THRESHOLD', '{"min_rank": 1, "max_rank": 50}'::jsonb, true, 'EVENT', 25, 1, true),
    ('NATIONAL_TOP_100', 'NATIONAL', 'RANK_THRESHOLD', '{"min_rank": 1, "max_rank": 100}'::jsonb, true, 'EVENT', 35, 1, true),
    ('NATIONAL_TOP_1_PERCENT', 'NATIONAL', 'PERCENTILE_THRESHOLD', '{"min_percentile": 99.00}'::jsonb, true, 'EVENT', 12, 1, true),
    ('NATIONAL_TOP_5_PERCENT', 'NATIONAL', 'PERCENTILE_THRESHOLD', '{"min_percentile": 95.00}'::jsonb, true, 'EVENT', 22, 1, true),
    ('NATIONAL_TOP_10_PERCENT', 'NATIONAL', 'PERCENTILE_THRESHOLD', '{"min_percentile": 90.00}'::jsonb, true, 'EVENT', 32, 1, true),
    ('PERSONAL_BEST_SCORE', 'PERSONAL_BEST', 'PERSONAL_BEST', '{"metric": "SCORE"}'::jsonb, true, 'EXAM', 50, 1, true),
    ('PERSONAL_BEST_RANK', 'PERSONAL_BEST', 'PERSONAL_BEST', '{"metric": "RANK"}'::jsonb, true, 'EXAM', 51, 1, true),
    ('PERSONAL_BEST_PERCENTILE', 'PERSONAL_BEST', 'PERSONAL_BEST', '{"metric": "PERCENTILE"}'::jsonb, true, 'EXAM', 52, 1, true),
    ('CONSISTENT_PERFORMER_3', 'CONSISTENCY', 'CONSECUTIVE_COMPLETIONS', '{"consecutive_count": 3}'::jsonb, false, 'EXAM', 60, 1, true),
    ('CONSISTENT_PERFORMER_5', 'CONSISTENCY', 'CONSECUTIVE_COMPLETIONS', '{"consecutive_count": 5}'::jsonb, false, 'EXAM', 61, 1, true)
ON CONFLICT (badge_code, policy_version) DO NOTHING;

-- 5. Create live_test_achievement_awards Table (Evidence Ledger)
CREATE TABLE IF NOT EXISTS public.live_test_achievement_awards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_code TEXT NOT NULL REFERENCES public.badges(code) ON DELETE RESTRICT,
    definition_id UUID NOT NULL REFERENCES public.live_test_achievement_definitions(id) ON DELETE RESTRICT,
    live_test_event_id UUID REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    snapshot_id UUID REFERENCES public.live_test_ranking_snapshots(id) ON DELETE RESTRICT,
    attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE SET NULL,
    
    -- Evidence & Academic Snapshot
    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    achieved_rank INTEGER,
    achieved_percentile NUMERIC(5, 2),
    achieved_score NUMERIC(6, 2),
    
    -- Lifecycle
    status TEXT NOT NULL CHECK (status IN ('AWARDED', 'SUPERSEDED', 'REVOKED')) DEFAULT 'AWARDED',
    superseded_by_id UUID REFERENCES public.live_test_achievement_awards(id) ON DELETE SET NULL,
    revocation_reason TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    idempotency_key TEXT NOT NULL UNIQUE,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_live_ach_awards_user ON public.live_test_achievement_awards(user_id, status);
CREATE INDEX IF NOT EXISTS idx_live_ach_awards_event ON public.live_test_achievement_awards(live_test_event_id, status);
CREATE INDEX IF NOT EXISTS idx_live_ach_awards_badge ON public.live_test_achievement_awards(badge_code);

-- 6. Row Level Security Policies
ALTER TABLE public.live_test_achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_achievement_awards ENABLE ROW LEVEL SECURITY;

-- Policies: live_test_achievement_definitions
DROP POLICY IF EXISTS p_live_ach_def_public_read ON public.live_test_achievement_definitions;
CREATE POLICY p_live_ach_def_public_read ON public.live_test_achievement_definitions
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS p_live_ach_def_admin_all ON public.live_test_achievement_definitions;
CREATE POLICY p_live_ach_def_admin_all ON public.live_test_achievement_definitions
FOR ALL USING (true) WITH CHECK (true);

-- Policies: live_test_achievement_awards
DROP POLICY IF EXISTS p_live_ach_awards_owner_read ON public.live_test_achievement_awards;
CREATE POLICY p_live_ach_awards_owner_read ON public.live_test_achievement_awards
FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS p_live_ach_awards_admin_all ON public.live_test_achievement_awards;
CREATE POLICY p_live_ach_awards_admin_all ON public.live_test_achievement_awards
FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- 7. RPC: fn_evaluate_live_test_achievements
-- Evaluates achievement eligibility across all participants of an active snapshot.
-- Idempotent, set-based, evidence-backed, and synchronizes with public.user_badges.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_evaluate_live_test_achievements(
    p_event_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_snapshot RECORD;
    v_entry RECORD;
    v_def RECORD;
    v_badge RECORD;
    v_now TIMESTAMPTZ := now();
    v_start_time TIMESTAMPTZ := clock_timestamp();
    
    v_evaluated_count INTEGER := 0;
    v_new_awards_count INTEGER := 0;
    v_superseded_count INTEGER := 0;
    
    v_idempotency_key TEXT;
    v_evidence JSONB;
    v_lifetime_completed INTEGER;
    v_prev_pb_score NUMERIC(6, 2);
    v_prev_pb_rank INTEGER;
    v_prev_pb_pct NUMERIC(5, 2);
    v_prev_attempts_count INTEGER;
    v_streak_count INTEGER;
    v_streak_events_count INTEGER;
    v_existing_award RECORD;
    v_badge_id UUID;
    v_execution_ms NUMERIC(10, 2);
BEGIN
    -- 1. Validate Event
    SELECT * INTO v_event
    FROM public.live_test_events
    WHERE id = p_event_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Live test event not found'
        );
    END IF;

    -- 2. Validate Active Ranking Snapshot
    SELECT * INTO v_snapshot
    FROM public.live_test_ranking_snapshots
    WHERE live_test_event_id = p_event_id
      AND is_active = true
    ORDER BY snapshot_version DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No active ranking snapshot found for event'
        );
    END IF;

    -- 3. Errata Model C Supersession Handling
    -- If awards already exist for this event under an older snapshot, mark them SUPERSEDED
    UPDATE public.live_test_achievement_awards
    SET status = 'SUPERSEDED',
        updated_at = v_now
    WHERE live_test_event_id = p_event_id
      AND snapshot_id <> v_snapshot.id
      AND status = 'AWARDED';
    
    GET DIAGNOSTICS v_superseded_count = ROW_COUNT;

    -- 4. Process all candidates in active leaderboard snapshot
    FOR v_entry IN
        SELECT *
        FROM public.live_test_leaderboard_entries
        WHERE snapshot_id = v_snapshot.id
        ORDER BY rank ASC NULLS LAST
    LOOP
        v_evaluated_count := v_evaluated_count + 1;

        -- Candidate Lifetime Completed Valid Live Tests (Milestones)
        SELECT COUNT(DISTINCT lte.id) INTO v_lifetime_completed
        FROM public.test_attempts ta
        JOIN public.live_test_events lte ON ta.mock_test_id = lte.mock_test_id
        WHERE ta.user_id = v_entry.user_id
          AND ta.status IN ('SUBMITTED', 'AUTO_SUBMITTED', 'COMPLETED', 'EVALUATED')
          AND lte.status IN ('CONCLUDED', 'EVALUATING', 'EVALUATED', 'PUBLISHED');

        -- Candidate Prior PB Stats in same exam scope (excluding current attempt/event)
        SELECT 
            COUNT(*),
            MAX(le.total_score),
            MIN(le.rank),
            MAX(le.percentile)
        INTO 
            v_prev_attempts_count,
            v_prev_pb_score,
            v_prev_pb_rank,
            v_prev_pb_pct
        FROM public.live_test_leaderboard_entries le
        JOIN public.live_test_events ev ON le.live_test_event_id = ev.id
        JOIN public.live_test_ranking_snapshots snap ON le.snapshot_id = snap.id
        WHERE le.user_id = v_entry.user_id
          AND ev.exam_id = v_event.exam_id
          AND ev.id <> p_event_id
          AND snap.is_active = true
          AND le.rank IS NOT NULL;

        -- Candidate Exam Streak: Count of consecutive published events participated in
        WITH recent_published_events AS (
            SELECT id, row_number() OVER (ORDER BY start_time DESC) as rn
            FROM public.live_test_events
            WHERE exam_id = v_event.exam_id
              AND status IN ('CONCLUDED', 'EVALUATED', 'PUBLISHED')
              AND start_time <= v_event.start_time
            LIMIT 5
        ),
        user_attended_recent AS (
            SELECT rpe.rn
            FROM recent_published_events rpe
            JOIN public.live_test_leaderboard_entries le ON le.live_test_event_id = rpe.id
            JOIN public.live_test_ranking_snapshots sn ON le.snapshot_id = sn.id
            WHERE le.user_id = v_entry.user_id
              AND sn.is_active = true
        )
        SELECT 
            (SELECT COUNT(*) FROM recent_published_events),
            (SELECT COUNT(*) FROM user_attended_recent WHERE rn <= 3),
            (SELECT COUNT(*) FROM user_attended_recent WHERE rn <= 5)
        INTO v_streak_events_count, v_streak_count, v_lifetime_completed;

        -- Iterate active definitions and evaluate rules
        FOR v_def IN
            SELECT d.*, b.id as badge_master_id, b.title as badge_title
            FROM public.live_test_achievement_definitions d
            JOIN public.badges b ON d.badge_code = b.code
            WHERE d.is_active = true
            ORDER BY d.priority ASC
        LOOP
            v_idempotency_key := NULL;
            v_evidence := '{}'::jsonb;

            -- RULE 1: Milestone Completion Counts
            IF v_def.condition_type = 'COMPLETION_COUNT' THEN
                IF (v_def.badge_code = 'FIRST_LIVE_TEST' AND v_lifetime_completed >= 1) OR
                   (v_def.badge_code = 'LIVE_TEST_COMPLETED_3' AND v_lifetime_completed >= 3) OR
                   (v_def.badge_code = 'LIVE_TEST_COMPLETED_5' AND v_lifetime_completed >= 5) OR
                   (v_def.badge_code = 'LIVE_TEST_COMPLETED_10' AND v_lifetime_completed >= 10) THEN
                    
                    v_idempotency_key := 'ACH_GLOBAL_' || v_entry.user_id::text || '_' || v_def.badge_code;
                    v_evidence := jsonb_build_object(
                        'lifetime_completed_count', v_lifetime_completed,
                        'qualifying_event_id', p_event_id,
                        'qualifying_snapshot_id', v_snapshot.id,
                        'condition_type', v_def.condition_type
                    );
                END IF;

            -- RULE 2: Podium & Rank Thresholds
            ELSIF v_def.condition_type = 'RANK_THRESHOLD' THEN
                IF (v_def.badge_code = 'PODIUM_GOLD' AND v_entry.rank = 1) OR
                   (v_def.badge_code = 'PODIUM_SILVER' AND v_entry.rank = 2) OR
                   (v_def.badge_code = 'PODIUM_BRONZE' AND v_entry.rank = 3) OR
                   (v_def.badge_code = 'NATIONAL_TOP_10' AND v_entry.rank <= 10) OR
                   (v_def.badge_code = 'NATIONAL_TOP_50' AND v_entry.rank <= 50) OR
                   (v_def.badge_code = 'NATIONAL_TOP_100' AND v_entry.rank <= 100) THEN
                    
                    v_idempotency_key := 'ACH_EVENT_' || p_event_id::text || '_' || v_entry.user_id::text || '_' || v_def.badge_code || '_v' || v_def.policy_version::text;
                    v_evidence := jsonb_build_object(
                        'achieved_rank', v_entry.rank,
                        'total_participants', v_snapshot.total_participants,
                        'event_title', v_event.title,
                        'condition_type', v_def.condition_type
                    );
                END IF;

            -- RULE 3: Percentile Thresholds
            ELSIF v_def.condition_type = 'PERCENTILE_THRESHOLD' THEN
                IF (v_def.badge_code = 'NATIONAL_TOP_1_PERCENT' AND v_entry.percentile >= 99.00) OR
                   (v_def.badge_code = 'NATIONAL_TOP_5_PERCENT' AND v_entry.percentile >= 95.00) OR
                   (v_def.badge_code = 'NATIONAL_TOP_10_PERCENT' AND v_entry.percentile >= 90.00) THEN
                    
                    v_idempotency_key := 'ACH_EVENT_' || p_event_id::text || '_' || v_entry.user_id::text || '_' || v_def.badge_code || '_v' || v_def.policy_version::text;
                    v_evidence := jsonb_build_object(
                        'achieved_percentile', v_entry.percentile,
                        'total_participants', v_snapshot.total_participants,
                        'event_title', v_event.title,
                        'condition_type', v_def.condition_type
                    );
                END IF;

            -- RULE 4: Personal Bests (Same Exam Scope)
            ELSIF v_def.condition_type = 'PERSONAL_BEST' AND v_prev_attempts_count >= 1 THEN
                IF v_def.badge_code = 'PERSONAL_BEST_SCORE' AND v_entry.total_score > coalesce(v_prev_pb_score, -999) THEN
                    v_idempotency_key := 'ACH_EXAM_' || v_event.exam_id::text || '_' || v_entry.user_id::text || '_PB_SCORE_' || p_event_id::text;
                    v_evidence := jsonb_build_object(
                        'metric', 'SCORE',
                        'previous_best_score', v_prev_pb_score,
                        'new_score', v_entry.total_score,
                        'score_delta', round(v_entry.total_score - v_prev_pb_score, 2),
                        'exam_id', v_event.exam_id
                    );
                ELSIF v_def.badge_code = 'PERSONAL_BEST_RANK' AND v_entry.rank < coalesce(v_prev_pb_rank, 999999) THEN
                    v_idempotency_key := 'ACH_EXAM_' || v_event.exam_id::text || '_' || v_entry.user_id::text || '_PB_RANK_' || p_event_id::text;
                    v_evidence := jsonb_build_object(
                        'metric', 'RANK',
                        'previous_best_rank', v_prev_pb_rank,
                        'new_rank', v_entry.rank,
                        'rank_improvement_percentage', round(((v_prev_pb_rank - v_entry.rank)::numeric / v_prev_pb_rank::numeric) * 100.0, 2),
                        'exam_id', v_event.exam_id
                    );
                ELSIF v_def.badge_code = 'PERSONAL_BEST_PERCENTILE' AND v_entry.percentile > coalesce(v_prev_pb_pct, -1) THEN
                    v_idempotency_key := 'ACH_EXAM_' || v_event.exam_id::text || '_' || v_entry.user_id::text || '_PB_PCT_' || p_event_id::text;
                    v_evidence := jsonb_build_object(
                        'metric', 'PERCENTILE',
                        'previous_best_percentile', v_prev_pb_pct,
                        'new_percentile', v_entry.percentile,
                        'percentile_delta', round(v_entry.percentile - v_prev_pb_pct, 2),
                        'exam_id', v_event.exam_id
                    );
                END IF;

            -- RULE 5: Consistency Streaks (Same Exam Scope)
            ELSIF v_def.condition_type = 'CONSECUTIVE_COMPLETIONS' THEN
                IF v_def.badge_code = 'CONSISTENT_PERFORMER_3' AND v_streak_count >= 3 THEN
                    v_idempotency_key := 'ACH_EXAM_' || v_event.exam_id::text || '_' || v_entry.user_id::text || '_CONSISTENT_3';
                    v_evidence := jsonb_build_object(
                        'consecutive_events_count', 3,
                        'exam_id', v_event.exam_id,
                        'qualifying_event_id', p_event_id
                    );
                ELSIF v_def.badge_code = 'CONSISTENT_PERFORMER_5' AND v_streak_count >= 5 THEN
                    v_idempotency_key := 'ACH_EXAM_' || v_event.exam_id::text || '_' || v_entry.user_id::text || '_CONSISTENT_5';
                    v_evidence := jsonb_build_object(
                        'consecutive_events_count', 5,
                        'exam_id', v_event.exam_id,
                        'qualifying_event_id', p_event_id
                    );
                END IF;
            END IF;

            -- If qualified, insert award record and synchronize user_badges
            IF v_idempotency_key IS NOT NULL THEN
                INSERT INTO public.live_test_achievement_awards (
                    user_id,
                    badge_code,
                    definition_id,
                    live_test_event_id,
                    snapshot_id,
                    attempt_id,
                    evidence_json,
                    achieved_rank,
                    achieved_percentile,
                    achieved_score,
                    status,
                    idempotency_key,
                    awarded_at
                ) VALUES (
                    v_entry.user_id,
                    v_def.badge_code,
                    v_def.id,
                    p_event_id,
                    v_snapshot.id,
                    v_entry.attempt_id,
                    v_evidence,
                    v_entry.rank,
                    v_entry.percentile,
                    v_entry.total_score,
                    'AWARDED',
                    v_idempotency_key,
                    v_now
                )
                ON CONFLICT (idempotency_key) DO NOTHING;

                IF FOUND THEN
                    v_new_awards_count := v_new_awards_count + 1;

                    -- Synchronize unique candidate badge ownership in public.user_badges (honors uq_user_badges)
                    INSERT INTO public.user_badges (
                        user_id,
                        badge_id,
                        coins_awarded,
                        earned_at
                    ) VALUES (
                        v_entry.user_id,
                        v_def.badge_master_id,
                        0,
                        v_now
                    )
                    ON CONFLICT (user_id, badge_id) DO NOTHING;

                    -- Dispatch celebratory notification (if user_notifications exists)
                    BEGIN
                        INSERT INTO public.user_notifications (
                            user_id,
                            category,
                            priority,
                            title,
                            body,
                            action_url,
                            metadata_json,
                            idempotency_key
                        ) VALUES (
                            v_entry.user_id,
                            'GAMIFICATION',
                            'NORMAL',
                            '🏆 Achievement Unlocked: ' || v_def.badge_title,
                            'Congratulations! You unlocked the ' || v_def.badge_title || ' badge in ' || v_event.title || '.',
                            '/achievements',
                            jsonb_build_object('badge_code', v_def.badge_code, 'event_id', p_event_id),
                            'NOTIF_ACH_' || v_idempotency_key
                        )
                        ON CONFLICT (idempotency_key) DO NOTHING;
                    EXCEPTION WHEN OTHERS THEN
                        NULL;
                    END;
                END IF;
            END IF;

        END LOOP;
    END LOOP;

    v_execution_ms := round((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000)::numeric, 2);

    -- 5. Record operational audit log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        actor_id,
        action,
        previous_state,
        new_state,
        metadata
    ) VALUES (
        p_event_id,
        p_admin_id,
        'EVALUATE_ACHIEVEMENTS',
        jsonb_build_object('snapshot_id', v_snapshot.id),
        jsonb_build_object(
            'evaluated_candidates', v_evaluated_count,
            'new_awards_count', v_new_awards_count,
            'superseded_awards_count', v_superseded_count,
            'execution_ms', v_execution_ms
        ),
        jsonb_build_object('timestamp', v_now)
    );

    RETURN jsonb_build_object(
        'success', true,
        'eventId', p_event_id,
        'snapshotId', v_snapshot.id,
        'evaluatedCandidates', v_evaluated_count,
        'newAwardsCount', v_new_awards_count,
        'supersededAwardsCount', v_superseded_count,
        'executionMs', v_execution_ms
    );
END;
$$;


-- ============================================================================
-- 8. RPC: fn_revoke_live_test_achievement_award
-- Revokes an achievement award due to disciplinary action or attempt voiding.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_revoke_live_test_achievement_award(
    p_award_id UUID,
    p_admin_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_award RECORD;
    v_remaining_valid_count INTEGER;
    v_badge RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_award
    FROM public.live_test_achievement_awards
    WHERE id = p_award_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Achievement award record not found'
        );
    END IF;

    IF v_award.status = 'REVOKED' THEN
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Award is already revoked'
        );
    END IF;

    -- Update award status to REVOKED
    UPDATE public.live_test_achievement_awards
    SET status = 'REVOKED',
        revocation_reason = p_reason,
        revoked_at = v_now,
        revoked_by = p_admin_id,
        updated_at = v_now
    WHERE id = p_award_id;

    -- Check if user has any other valid AWARDED records for this badge
    SELECT COUNT(*) INTO v_remaining_valid_count
    FROM public.live_test_achievement_awards
    WHERE user_id = v_award.user_id
      AND badge_code = v_award.badge_code
      AND status = 'AWARDED';

    -- If zero valid awards left, remove badge from user_badges
    IF v_remaining_valid_count = 0 THEN
        SELECT id INTO v_badge
        FROM public.badges
        WHERE code = v_award.badge_code;

        IF FOUND THEN
            DELETE FROM public.user_badges
            WHERE user_id = v_award.user_id
              AND badge_id = v_badge.id;
        END IF;
    END IF;

    -- Log to operational audit logs
    IF v_award.live_test_event_id IS NOT NULL THEN
        INSERT INTO public.live_test_audit_logs (
            live_test_event_id,
            actor_id,
            action,
            previous_state,
            new_state,
            metadata
        ) VALUES (
            v_award.live_test_event_id,
            p_admin_id,
            'REVOKE_ACHIEVEMENT_AWARD',
            jsonb_build_object('award_id', p_award_id, 'badge_code', v_award.badge_code, 'user_id', v_award.user_id),
            jsonb_build_object('status', 'REVOKED', 'reason', p_reason),
            jsonb_build_object('timestamp', v_now)
        );
    END IF;

    -- Log to platform admin audit logs
    INSERT INTO public.admin_audit_logs (
        actor_id,
        actor_email,
        action_type,
        target_entity,
        target_id,
        old_value,
        new_value,
        reason
    ) VALUES (
        p_admin_id,
        coalesce((SELECT email FROM auth.users WHERE id = p_admin_id), 'system@couragelibrary.com'),
        'REVOKE_ACHIEVEMENT',
        'live_test_achievement_awards',
        p_award_id::text,
        jsonb_build_object('status', v_award.status, 'badge_code', v_award.badge_code),
        jsonb_build_object('status', 'REVOKED', 'reason', p_reason),
        p_reason
    );

    RETURN jsonb_build_object(
        'success', true,
        'awardId', p_award_id,
        'badgeCode', v_award.badge_code,
        'userId', v_award.user_id,
        'status', 'REVOKED',
        'badgeRemovedFromUserCollection', (v_remaining_valid_count = 0)
    );
END;
$$;
