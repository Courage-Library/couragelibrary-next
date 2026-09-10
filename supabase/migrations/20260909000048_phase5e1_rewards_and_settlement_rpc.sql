-- ============================================================================
-- COURAGE LIBRARY — PHASE 5E.1: REWARDS & CL SETTLEMENT ENGINE
-- Migration: 20260909000048_phase5e1_rewards_and_settlement_rpc.sql
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Create live_test_reward_policies Table
CREATE TABLE IF NOT EXISTS public.live_test_reward_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID REFERENCES public.live_test_events(id) ON DELETE CASCADE, -- NULL = Global Default Policy
    policy_code TEXT NOT NULL DEFAULT 'DEFAULT_LIVE_POLICY',
    tier_name TEXT NOT NULL,
    min_rank INTEGER,
    max_rank INTEGER,
    min_percentile NUMERIC(5, 2),
    max_percentile NUMERIC(5, 2),
    coin_reward INTEGER NOT NULL CHECK (coin_reward >= 0),
    policy_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_live_reward_policy_event_tier_ver UNIQUE (live_test_event_id, tier_name, policy_version)
);

-- Index for fast policy lookup
CREATE INDEX IF NOT EXISTS idx_live_reward_policies_event_active 
ON public.live_test_reward_policies(live_test_event_id, is_active);

-- 2. Seed Default Global Live Test Reward Policies (Global template when event-specific policy is not set)
INSERT INTO public.live_test_reward_policies (
    live_test_event_id, policy_code, tier_name, min_rank, max_rank, min_percentile, max_percentile, coin_reward, policy_version, is_active
) VALUES
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'PODIUM_RANK_1', 1, 1, NULL, NULL, 500, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'PODIUM_RANK_2', 2, 2, NULL, NULL, 300, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'PODIUM_RANK_3', 3, 3, NULL, NULL, 200, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_10', 4, 10, NULL, NULL, 100, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_50', 11, 50, NULL, NULL, 50, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_100', 51, 100, NULL, NULL, 25, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_1_PERCENT', NULL, NULL, 99.00, 100.00, 30, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_5_PERCENT', NULL, NULL, 95.00, 98.99, 15, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'TOP_10_PERCENT', NULL, NULL, 90.00, 94.99, 10, 1, true),
    (NULL, 'GLOBAL_LIVE_POLICY_V1', 'PARTICIPANT_BASE', NULL, NULL, NULL, NULL, 5, 1, true)
ON CONFLICT (live_test_event_id, tier_name, policy_version) DO NOTHING;

-- 3. Create live_test_reward_settlements Table
CREATE TABLE IF NOT EXISTS public.live_test_reward_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID NOT NULL REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.live_test_ranking_snapshots(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE SET NULL,
    reward_tier TEXT NOT NULL,
    coins_awarded INTEGER NOT NULL CHECK (coins_awarded >= 0),
    settlement_version INTEGER NOT NULL DEFAULT 1,
    settlement_status TEXT NOT NULL CHECK (settlement_status IN ('SETTLED', 'TOPPED_UP', 'PROTECTED_DROP', 'VOIDED', 'NO_REWARD', 'UNCHANGED')),
    ledger_id UUID REFERENCES public.coin_ledger(id) ON DELETE SET NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_live_reward_settle_event_user_ver UNIQUE (live_test_event_id, user_id, settlement_version)
);

-- Indexes for settlements
CREATE INDEX IF NOT EXISTS idx_live_reward_settle_event ON public.live_test_reward_settlements(live_test_event_id);
CREATE INDEX IF NOT EXISTS idx_live_reward_settle_user ON public.live_test_reward_settlements(user_id);
CREATE INDEX IF NOT EXISTS idx_live_reward_settle_snapshot ON public.live_test_reward_settlements(snapshot_id);

-- 4. Enable Row Level Security
ALTER TABLE public.live_test_reward_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_reward_settlements ENABLE ROW LEVEL SECURITY;

-- Policies for live_test_reward_policies
CREATE POLICY p_live_reward_policies_read ON public.live_test_reward_policies
FOR SELECT USING (true);

CREATE POLICY p_live_reward_policies_admin ON public.live_test_reward_policies
FOR ALL USING (true) WITH CHECK (true);

-- Policies for live_test_reward_settlements
CREATE POLICY p_live_reward_settle_user_read ON public.live_test_reward_settlements
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY p_live_reward_settle_admin ON public.live_test_reward_settlements
FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. RPC: fn_distribute_live_test_rewards
-- Server-authoritative, atomic reward distribution enforcing Model A publication finality
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_distribute_live_test_rewards(
    p_event_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_snapshot RECORD;
    v_entry RECORD;
    v_policy RECORD;
    
    v_settlement_version INTEGER;
    v_best_tier TEXT;
    v_best_coins INTEGER;
    v_prev_coins_total INTEGER;
    v_delta INTEGER;
    
    v_idempotency_key TEXT;
    v_ledger_id UUID;
    v_current_bal INTEGER;
    v_lifetime_earned INTEGER;
    v_new_bal INTEGER;
    v_new_earned INTEGER;
    
    v_processed_count INTEGER := 0;
    v_settled_count INTEGER := 0;
    v_topup_count INTEGER := 0;
    v_protected_count INTEGER := 0;
    v_unchanged_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_total_coins_distributed INTEGER := 0;
    v_start_time TIMESTAMPTZ := clock_timestamp();
    v_execution_ms NUMERIC;
BEGIN
    -- 1. Validate Event
    SELECT * INTO v_event FROM public.live_test_events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Live test event not found.');
    END IF;

    IF v_event.status != 'PUBLISHED' AND p_admin_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Rewards can only be distributed for PUBLISHED events.'
        );
    END IF;

    -- 2. Fetch Active Snapshot
    SELECT * INTO v_snapshot 
    FROM public.live_test_ranking_snapshots 
    WHERE live_test_event_id = p_event_id AND is_active = true 
    ORDER BY snapshot_version DESC 
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No active ranking snapshot found for this event.'
        );
    END IF;

    v_settlement_version := v_snapshot.snapshot_version;

    -- 3. Iterate through all leaderboard entries in the active snapshot
    FOR v_entry IN
        SELECT 
            e.id AS entry_id,
            e.user_id,
            e.attempt_id,
            e.rank,
            e.percentile,
            e.total_score,
            e.max_score,
            e.accuracy_percentage,
            e.correct_count,
            e.incorrect_count,
            e.unanswered_count,
            e.time_spent_seconds
        FROM public.live_test_leaderboard_entries e
        WHERE e.snapshot_id = v_snapshot.id
        ORDER BY e.rank ASC, e.user_id ASC
    LOOP
        v_processed_count := v_processed_count + 1;
        v_best_tier := 'NO_REWARD';
        v_best_coins := 0;

        -- 4. Evaluate highest matching reward policy tier
        -- Check event-specific policy first, fallback to global defaults
        FOR v_policy IN
            SELECT * FROM public.live_test_reward_policies
            WHERE is_active = true
              AND (live_test_event_id = p_event_id OR live_test_event_id IS NULL)
            ORDER BY 
              (CASE WHEN live_test_event_id = p_event_id THEN 0 ELSE 1 END) ASC,
              coin_reward DESC
        LOOP
            -- Check Exact Rank Match
            IF v_policy.min_rank IS NOT NULL AND v_policy.max_rank IS NOT NULL THEN
                IF v_entry.rank >= v_policy.min_rank AND v_entry.rank <= v_policy.max_rank THEN
                    IF v_policy.coin_reward > v_best_coins THEN
                        v_best_coins := v_policy.coin_reward;
                        v_best_tier := v_policy.tier_name;
                    END IF;
                END IF;
            -- Check Percentile Match
            ELSIF v_policy.min_percentile IS NOT NULL AND v_policy.max_percentile IS NOT NULL THEN
                IF v_entry.percentile >= v_policy.min_percentile AND v_entry.percentile <= v_policy.max_percentile THEN
                    IF v_policy.coin_reward > v_best_coins THEN
                        v_best_coins := v_policy.coin_reward;
                        v_best_tier := v_policy.tier_name;
                    END IF;
                END IF;
            -- Check Participant Base Match
            ELSIF v_policy.tier_name = 'PARTICIPANT_BASE' THEN
                IF v_policy.coin_reward > v_best_coins THEN
                    v_best_coins := v_policy.coin_reward;
                    v_best_tier := v_policy.tier_name;
                END IF;
            END IF;
        END LOOP;

        -- 5. Calculate Prior Awarded Coins for this user on this event across previous settlement versions
        SELECT COALESCE(SUM(coins_awarded), 0) INTO v_prev_coins_total
        FROM public.live_test_reward_settlements
        WHERE live_test_event_id = p_event_id
          AND user_id = v_entry.user_id;

        -- 6. Check if settlement for this exact version already exists
        IF EXISTS (
            SELECT 1 FROM public.live_test_reward_settlements
            WHERE live_test_event_id = p_event_id
              AND user_id = v_entry.user_id
              AND settlement_version = v_settlement_version
        ) THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE; -- Idempotent skip
        END IF;

        -- 7. Build Canonical Idempotency Key
        v_idempotency_key := 'LIVE_REWARD_' || p_event_id || '_' || v_entry.user_id || '_' || v_best_tier || '_' || v_snapshot.id || '_v' || v_settlement_version;
        v_ledger_id := NULL;

        -- 8. Apply Settlement Logic
        IF v_prev_coins_total = 0 THEN
            -- Case A: First-time settlement
            IF v_best_coins > 0 THEN
                -- Upsert wallet
                INSERT INTO public.coin_wallets (user_id, current_balance, lifetime_earned, lifetime_spent)
                VALUES (v_entry.user_id, 0, 0, 0)
                ON CONFLICT (user_id) DO NOTHING;

                -- Lock wallet for atomic balance update
                SELECT current_balance, lifetime_earned INTO v_current_bal, v_lifetime_earned
                FROM public.coin_wallets WHERE user_id = v_entry.user_id FOR UPDATE;

                v_new_bal := v_current_bal + v_best_coins;
                v_new_earned := v_lifetime_earned + v_best_coins;

                -- Insert into coin_ledger
                INSERT INTO public.coin_ledger (
                    user_id, transaction_type, amount, direction, balance_after,
                    source_type, source_id, reason_code, idempotency_key, metadata
                ) VALUES (
                    v_entry.user_id, 'CREDIT', v_best_coins, 'CREDIT', v_new_bal,
                    'LIVE_TEST_EVENT', p_event_id, 'LIVE_RANK_REWARD_' || v_best_tier, 'ledger_' || v_idempotency_key,
                    jsonb_build_object(
                        'event_id', p_event_id,
                        'snapshot_id', v_snapshot.id,
                        'snapshot_version', v_settlement_version,
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'reward_tier', v_best_tier,
                        'is_topup', false
                    )
                ) RETURNING id INTO v_ledger_id;

                -- Update wallet cache
                UPDATE public.coin_wallets
                SET current_balance = v_new_bal,
                    lifetime_earned = v_new_earned,
                    last_transaction_at = now(),
                    updated_at = now()
                WHERE user_id = v_entry.user_id;

                -- Record settlement
                INSERT INTO public.live_test_reward_settlements (
                    live_test_event_id, snapshot_id, user_id, attempt_id, reward_tier,
                    coins_awarded, settlement_version, settlement_status, ledger_id,
                    idempotency_key, metadata
                ) VALUES (
                    p_event_id, v_snapshot.id, v_entry.user_id, v_entry.attempt_id, v_best_tier,
                    v_best_coins, v_settlement_version, 'SETTLED', v_ledger_id,
                    v_idempotency_key,
                    jsonb_build_object(
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'total_score', v_entry.total_score,
                        'previous_entitlement', 0,
                        'current_entitlement', v_best_coins
                    )
                );

                v_settled_count := v_settled_count + 1;
                v_total_coins_distributed := v_total_coins_distributed + v_best_coins;
            ELSE
                -- Zero reward eligible
                INSERT INTO public.live_test_reward_settlements (
                    live_test_event_id, snapshot_id, user_id, attempt_id, reward_tier,
                    coins_awarded, settlement_version, settlement_status, ledger_id,
                    idempotency_key, metadata
                ) VALUES (
                    p_event_id, v_snapshot.id, v_entry.user_id, v_entry.attempt_id, v_best_tier,
                    0, v_settlement_version, 'NO_REWARD', NULL,
                    v_idempotency_key,
                    jsonb_build_object('rank', v_entry.rank, 'percentile', v_entry.percentile)
                );
            END IF;

        ELSE
            -- Case B: Subsequent settlement (Errata snapshot recalculation)
            IF v_best_coins > v_prev_coins_total THEN
                -- Sub-case B1: Entitlement increased -> Award positive delta only
                v_delta := v_best_coins - v_prev_coins_total;

                -- Upsert wallet
                INSERT INTO public.coin_wallets (user_id, current_balance, lifetime_earned, lifetime_spent)
                VALUES (v_entry.user_id, 0, 0, 0)
                ON CONFLICT (user_id) DO NOTHING;

                -- Lock wallet
                SELECT current_balance, lifetime_earned INTO v_current_bal, v_lifetime_earned
                FROM public.coin_wallets WHERE user_id = v_entry.user_id FOR UPDATE;

                v_new_bal := v_current_bal + v_delta;
                v_new_earned := v_lifetime_earned + v_delta;

                -- Insert into coin_ledger
                INSERT INTO public.coin_ledger (
                    user_id, transaction_type, amount, direction, balance_after,
                    source_type, source_id, reason_code, idempotency_key, metadata
                ) VALUES (
                    v_entry.user_id, 'CREDIT', v_delta, 'CREDIT', v_new_bal,
                    'LIVE_TEST_EVENT', p_event_id, 'LIVE_RANK_REWARD_TOPUP', 'ledger_' || v_idempotency_key,
                    jsonb_build_object(
                        'event_id', p_event_id,
                        'snapshot_id', v_snapshot.id,
                        'snapshot_version', v_settlement_version,
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'reward_tier', v_best_tier,
                        'is_topup', true,
                        'previous_total_coins', v_prev_coins_total,
                        'new_tier_total', v_best_coins
                    )
                ) RETURNING id INTO v_ledger_id;

                -- Update wallet cache
                UPDATE public.coin_wallets
                SET current_balance = v_new_bal,
                    lifetime_earned = v_new_earned,
                    last_transaction_at = now(),
                    updated_at = now()
                WHERE user_id = v_entry.user_id;

                -- Record settlement
                INSERT INTO public.live_test_reward_settlements (
                    live_test_event_id, snapshot_id, user_id, attempt_id, reward_tier,
                    coins_awarded, settlement_version, settlement_status, ledger_id,
                    idempotency_key, metadata
                ) VALUES (
                    p_event_id, v_snapshot.id, v_entry.user_id, v_entry.attempt_id, v_best_tier,
                    v_delta, v_settlement_version, 'TOPPED_UP', v_ledger_id,
                    v_idempotency_key,
                    jsonb_build_object(
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'previous_entitlement', v_prev_coins_total,
                        'current_entitlement', v_best_coins,
                        'topup_delta', v_delta
                    )
                );

                v_topup_count := v_topup_count + 1;
                v_total_coins_distributed := v_total_coins_distributed + v_delta;

            ELSIF v_best_coins < v_prev_coins_total THEN
                -- Sub-case B2: Entitlement decreased -> Model A Publication Finality: DO NOT CLAW BACK
                INSERT INTO public.live_test_reward_settlements (
                    live_test_event_id, snapshot_id, user_id, attempt_id, reward_tier,
                    coins_awarded, settlement_version, settlement_status, ledger_id,
                    idempotency_key, metadata
                ) VALUES (
                    p_event_id, v_snapshot.id, v_entry.user_id, v_entry.attempt_id, v_best_tier,
                    0, v_settlement_version, 'PROTECTED_DROP', NULL,
                    v_idempotency_key,
                    jsonb_build_object(
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'reason', 'ERRATA_RANK_DEMOTION_AFTER_PUBLICATION',
                        'previous_entitlement', v_prev_coins_total,
                        'current_entitlement', v_best_coins,
                        'retained_coins', v_prev_coins_total
                    )
                );

                v_protected_count := v_protected_count + 1;

            ELSE
                -- Sub-case B3: Entitlement unchanged
                INSERT INTO public.live_test_reward_settlements (
                    live_test_event_id, snapshot_id, user_id, attempt_id, reward_tier,
                    coins_awarded, settlement_version, settlement_status, ledger_id,
                    idempotency_key, metadata
                ) VALUES (
                    p_event_id, v_snapshot.id, v_entry.user_id, v_entry.attempt_id, v_best_tier,
                    0, v_settlement_version, 'UNCHANGED', NULL,
                    v_idempotency_key,
                    jsonb_build_object(
                        'rank', v_entry.rank,
                        'percentile', v_entry.percentile,
                        'retained_coins', v_prev_coins_total
                    )
                );

                v_unchanged_count := v_unchanged_count + 1;
            END IF;
        END IF;
    END LOOP;

    v_execution_ms := ROUND((EXTRACT(EPOCH FROM clock_timestamp() - v_start_time) * 1000)::numeric, 2);

    -- 9. Audit Logging
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        action,
        actor_id,
        payload
    ) VALUES (
        p_event_id,
        'REWARDS_DISTRIBUTED',
        p_admin_id,
        jsonb_build_object(
            'snapshot_id', v_snapshot.id,
            'snapshot_version', v_settlement_version,
            'processed_count', v_processed_count,
            'settled_count', v_settled_count,
            'topup_count', v_topup_count,
            'protected_count', v_protected_count,
            'unchanged_count', v_unchanged_count,
            'skipped_count', v_skipped_count,
            'total_coins_distributed', v_total_coins_distributed,
            'execution_ms', v_execution_ms
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'snapshot_id', v_snapshot.id,
        'snapshot_version', v_settlement_version,
        'processed_count', v_processed_count,
        'settled_count', v_settled_count,
        'topup_count', v_topup_count,
        'protected_count', v_protected_count,
        'unchanged_count', v_unchanged_count,
        'skipped_count', v_skipped_count,
        'total_coins_distributed', v_total_coins_distributed,
        'execution_ms', v_execution_ms
    );
END;
$$;
