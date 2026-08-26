-- ============================================================================
-- COURAGE LIBRARY — PHASE 3D: GAMIFICATION & MOTIVATIONAL SYSTEM SCHEMA
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. REWARD POLICIES (SYSTEM CONFIGURATION CATALOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reward_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_code TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    base_coins INTEGER NOT NULL DEFAULT 0 CHECK (base_coins >= 0),
    performance_bonus_coins INTEGER NOT NULL DEFAULT 0 CHECK (performance_bonus_coins >= 0),
    consistency_bonus_coins INTEGER NOT NULL DEFAULT 0 CHECK (consistency_bonus_coins >= 0),
    improvement_bonus_coins INTEGER NOT NULL DEFAULT 0 CHECK (improvement_bonus_coins >= 0),
    daily_limit_count INTEGER DEFAULT 1,
    cooldown_seconds INTEGER DEFAULT 0,
    min_duration_seconds INTEGER DEFAULT 0,
    eligibility_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    policy_version TEXT NOT NULL DEFAULT 'v1_default',
    is_active BOOLEAN NOT NULL DEFAULT true,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. GAMIFICATION EVENTS (CENTRAL AUDITABLE EVENT BRIDGE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gamification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    idempotency_key TEXT NOT NULL UNIQUE,
    verification_status TEXT NOT NULL DEFAULT 'VERIFIED' CHECK (verification_status IN ('VERIFIED', 'SUSPICIOUS', 'REJECTED')),
    reward_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (reward_status IN ('PENDING', 'REWARDED', 'ZERO_REWARD', 'FAILED')),
    reason_code TEXT NOT NULL DEFAULT 'STANDARD',
    calculated_coins INTEGER NOT NULL DEFAULT 0,
    actual_coins_awarded INTEGER NOT NULL DEFAULT 0,
    policy_version TEXT NOT NULL DEFAULT 'v1_default',
    metadata JSONB DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
);

-- ============================================================================
-- 3. COIN LEDGER (IMMUTABLE FINANCIAL SOURCE OF TRUTH)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coin_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('CREDIT', 'DEBIT', 'REVERSAL', 'ADMIN_ADJUSTMENT')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    source_event_id UUID REFERENCES public.gamification_events(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL,
    source_id UUID,
    reversal_of_ledger_id UUID REFERENCES public.coin_ledger(id) ON DELETE RESTRICT,
    reason_code TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    admin_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. COIN WALLETS (CACHED WORKING BALANCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coin_wallets (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
    lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
    lifetime_spent INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
    freezes_held INTEGER NOT NULL DEFAULT 0 CHECK (freezes_held >= 0 AND freezes_held <= 2),
    is_locked BOOLEAN NOT NULL DEFAULT false,
    last_transaction_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. USER STREAKS (WORKING STREAK STATE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_streaks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
    last_qualifying_date DATE,
    freezes_consumed_count INTEGER NOT NULL DEFAULT 0 CHECK (freezes_consumed_count >= 0),
    last_freeze_used_date DATE,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    is_frozen BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. STREAK ACTIVITY LOGS (DAILY QUALIFYING EVIDENCE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.streak_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    activity_date DATE NOT NULL,
    qualifying_action_type TEXT NOT NULL CHECK (qualifying_action_type IN ('MOCK_TEST', 'CA_QUIZ', 'STUDY_PLAN_TASKS', 'PRACTICE_DRILL', 'FREEZE_APPLIED')),
    source_id UUID,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_streak_activity_user_date UNIQUE (user_id, activity_date, qualifying_action_type)
);

-- ============================================================================
-- 7. BADGES (MASTER ACHIEVEMENT CATALOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('CONSISTENCY', 'VOLUME', 'MASTERY', 'PRECISION', 'PROVENANCE', 'SPECIAL')),
    tier TEXT NOT NULL CHECK (tier IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY')),
    coin_reward INTEGER NOT NULL DEFAULT 0 CHECK (coin_reward >= 0),
    icon_url TEXT,
    criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 8. USER BADGES (EARNED ACHIEVEMENTS SNAPSHOT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE RESTRICT,
    source_event_id UUID REFERENCES public.gamification_events(id) ON DELETE SET NULL,
    coins_awarded INTEGER NOT NULL DEFAULT 0,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_badges UNIQUE (user_id, badge_id)
);

-- ============================================================================
-- 9. REWARD CATALOG (STORE ITEMS CATALOG)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reward_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    reward_type TEXT NOT NULL CHECK (reward_type IN ('DIGITAL', 'PHYSICAL', 'FEATURE_UNLOCK', 'COSMETIC', 'PROMOTIONAL')),
    coin_cost INTEGER NOT NULL CHECK (coin_cost > 0),
    stock_quantity INTEGER NOT NULL DEFAULT -1 CHECK (stock_quantity >= -1),
    image_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 10. REWARD CLAIMS (ORDER FULFILLMENT STATE MACHINE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_id UUID NOT NULL REFERENCES public.reward_catalog(id) ON DELETE RESTRICT,
    coins_spent INTEGER NOT NULL CHECK (coins_spent > 0),
    ledger_transaction_id UUID REFERENCES public.coin_ledger(id) ON DELETE RESTRICT,
    reversal_ledger_id UUID REFERENCES public.coin_ledger(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED', 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'REJECTED', 'CANCELLED', 'REFUNDED', 'FULFILLED'
    )),
    shipping_full_name TEXT,
    shipping_phone TEXT,
    shipping_address TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_pincode TEXT,
    tracking_code TEXT,
    admin_notes TEXT,
    fulfilled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 11. LEADERBOARD WEEKLY SNAPSHOTS (BIFURCATED RANKINGS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.leaderboard_weekly_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start_date DATE NOT NULL,
    leaderboard_type TEXT NOT NULL CHECK (leaderboard_type IN ('WEEKLY_EFFORT', 'EXAM_PERFORMANCE')),
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL CHECK (rank > 0),
    score_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    study_minutes INTEGER NOT NULL DEFAULT 0,
    tasks_completed_count INTEGER NOT NULL DEFAULT 0,
    questions_attempted_count INTEGER NOT NULL DEFAULT 0,
    accuracy_pct NUMERIC(5, 2),
    snapshot_generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_leaderboard_exam_nullity CHECK (
        (leaderboard_type = 'WEEKLY_EFFORT' AND exam_id IS NULL) OR
        (leaderboard_type = 'EXAM_PERFORMANCE' AND exam_id IS NOT NULL)
    ),
    CONSTRAINT uq_leaderboard_weekly_snap UNIQUE (week_start_date, leaderboard_type, COALESCE(exam_id, '00000000-0000-0000-0000-000000000000'::uuid), user_id)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gamification_events_user_time ON public.gamification_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gamification_events_source ON public.gamification_events(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_coin_ledger_user_created ON public.coin_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_source ON public.coin_ledger(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_user_streaks_last_date ON public.user_streaks(last_qualifying_date);
CREATE INDEX IF NOT EXISTS idx_streak_activity_logs_user_date ON public.streak_activity_logs(user_id, activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON public.user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON public.user_badges(badge_id);

CREATE INDEX IF NOT EXISTS idx_reward_catalog_type ON public.reward_catalog(reward_type, is_active);
CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON public.reward_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_claims_status ON public.reward_claims(status);

CREATE INDEX IF NOT EXISTS idx_leaderboard_weekly_lookup ON public.leaderboard_weekly_snapshots(week_start_date, leaderboard_type, rank);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.reward_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gamification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_weekly_snapshots ENABLE ROW LEVEL SECURITY;

-- 1. Public Read Policies
CREATE POLICY "Public read active badges" ON public.badges
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read active reward catalog" ON public.reward_catalog
    FOR SELECT USING (is_active = true);

CREATE POLICY "Public read leaderboard snapshots" ON public.leaderboard_weekly_snapshots
    FOR SELECT USING (true);

-- 2. Student Read-Only Policies (Own Data Only)
CREATE POLICY "Users can read own gamification events" ON public.gamification_events
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own coin ledger" ON public.coin_ledger
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own coin wallet" ON public.coin_wallets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own streaks" ON public.user_streaks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own streak logs" ON public.streak_activity_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own badges" ON public.user_badges
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can read own reward claims" ON public.reward_claims
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================================================
-- ATOMIC STORED PROCEDURES / RPC FUNCTIONS
-- ============================================================================

-- Function 1: Award Gamification Reward (Atomic Credit)
CREATE OR REPLACE FUNCTION public.fn_award_gamification_reward(
    p_user_id UUID,
    p_event_type TEXT,
    p_source_type TEXT,
    p_source_id UUID,
    p_idempotency_key TEXT,
    p_calculated_coins INTEGER,
    p_reason_code TEXT DEFAULT 'STANDARD',
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_event_id UUID;
    v_ledger_id UUID;
    v_current_bal INTEGER;
    v_lifetime_earned INTEGER;
    v_new_bal INTEGER;
    v_new_earned INTEGER;
BEGIN
    -- 1. Check if idempotency key already processed
    SELECT id INTO v_event_id FROM public.gamification_events WHERE idempotency_key = p_idempotency_key;
    IF v_event_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'idempotent', true, 'event_id', v_event_id);
    END IF;

    -- 2. Insert event
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, reason_code, calculated_coins,
        actual_coins_awarded, metadata, processed_at
    ) VALUES (
        p_user_id, p_event_type, p_source_type, p_source_id, p_idempotency_key,
        'VERIFIED', CASE WHEN p_calculated_coins > 0 THEN 'REWARDED' ELSE 'ZERO_REWARD' END,
        p_reason_code, p_calculated_coins, p_calculated_coins, p_metadata, now()
    ) RETURNING id INTO v_event_id;

    -- 3. If coins > 0, lock wallet and credit ledger
    IF p_calculated_coins > 0 THEN
        -- Upsert wallet if not exists
        INSERT INTO public.coin_wallets (user_id, current_balance, lifetime_earned, lifetime_spent)
        VALUES (p_user_id, 0, 0, 0)
        ON CONFLICT (user_id) DO NOTHING;

        -- Lock wallet row
        SELECT current_balance, lifetime_earned INTO v_current_bal, v_lifetime_earned
        FROM public.coin_wallets WHERE user_id = p_user_id FOR UPDATE;

        v_new_bal := v_current_bal + p_calculated_coins;
        v_new_earned := v_lifetime_earned + p_calculated_coins;

        -- Insert ledger entry
        INSERT INTO public.coin_ledger (
            user_id, transaction_type, amount, direction, balance_after,
            source_event_id, source_type, source_id, reason_code, idempotency_key, metadata
        ) VALUES (
            p_user_id, 'CREDIT', p_calculated_coins, 'CREDIT', v_new_bal,
            v_event_id, p_source_type, p_source_id, p_reason_code, 'ledger_' || p_idempotency_key, p_metadata
        ) RETURNING id INTO v_ledger_id;

        -- Update wallet
        UPDATE public.coin_wallets
        SET current_balance = v_new_bal,
            lifetime_earned = v_new_earned,
            last_transaction_at = now(),
            updated_at = now()
        WHERE user_id = p_user_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'event_id', v_event_id, 'coins_awarded', p_calculated_coins);
END;
$$;

-- Function 2: Claim Reward Item (Atomic Debit & Stock Check)
CREATE OR REPLACE FUNCTION public.fn_claim_reward_item(
    p_user_id UUID,
    p_reward_id UUID,
    p_idempotency_key TEXT,
    p_shipping_name TEXT DEFAULT NULL,
    p_shipping_phone TEXT DEFAULT NULL,
    p_shipping_address TEXT DEFAULT NULL,
    p_shipping_city TEXT DEFAULT NULL,
    p_shipping_state TEXT DEFAULT NULL,
    p_shipping_pincode TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cost INTEGER;
    v_stock INTEGER;
    v_is_active BOOLEAN;
    v_current_bal INTEGER;
    v_lifetime_spent INTEGER;
    v_new_bal INTEGER;
    v_new_spent INTEGER;
    v_ledger_id UUID;
    v_claim_id UUID;
BEGIN
    -- 1. Lock reward catalog row and verify availability
    SELECT coin_cost, stock_quantity, is_active INTO v_cost, v_stock, v_is_active
    FROM public.reward_catalog WHERE id = p_reward_id FOR UPDATE;

    IF NOT FOUND OR NOT v_is_active THEN
        RAISE EXCEPTION 'Reward item is not available or does not exist';
    END IF;

    IF v_stock != -1 AND v_stock <= 0 THEN
        RAISE EXCEPTION 'Reward item is out of stock';
    END IF;

    -- 2. Lock user wallet and verify balance
    SELECT current_balance, lifetime_spent INTO v_current_bal, v_lifetime_spent
    FROM public.coin_wallets WHERE user_id = p_user_id FOR UPDATE;

    IF v_current_bal IS NULL OR v_current_bal < v_cost THEN
        RAISE EXCEPTION 'Insufficient coin balance';
    END IF;

    -- 3. Decrement stock if finite
    IF v_stock != -1 THEN
        UPDATE public.reward_catalog
        SET stock_quantity = stock_quantity - 1, updated_at = now()
        WHERE id = p_reward_id;
    END IF;

    -- 4. Calculate new balances
    v_new_bal := v_current_bal - v_cost;
    v_new_spent := v_lifetime_spent + v_cost;

    -- 5. Insert ledger DEBIT
    INSERT INTO public.coin_ledger (
        user_id, transaction_type, amount, direction, balance_after,
        source_type, source_id, reason_code, idempotency_key
    ) VALUES (
        p_user_id, 'DEBIT', v_cost, 'DEBIT', v_new_bal,
        'reward_claim', p_reward_id, 'STORE_PURCHASE', p_idempotency_key
    ) RETURNING id INTO v_ledger_id;

    -- 6. Update user wallet
    UPDATE public.coin_wallets
    SET current_balance = v_new_bal,
        lifetime_spent = v_new_spent,
        last_transaction_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id;

    -- 7. Create reward claim
    INSERT INTO public.reward_claims (
        user_id, reward_id, coins_spent, ledger_transaction_id, status,
        shipping_full_name, shipping_phone, shipping_address, shipping_city,
        shipping_state, shipping_pincode
    ) VALUES (
        p_user_id, p_reward_id, v_cost, v_ledger_id, 'REQUESTED',
        p_shipping_name, p_shipping_phone, p_shipping_address, p_shipping_city,
        p_shipping_state, p_shipping_pincode
    ) RETURNING id INTO v_claim_id;

    RETURN jsonb_build_object('success', true, 'claim_id', v_claim_id, 'ledger_id', v_ledger_id, 'remaining_balance', v_new_bal);
END;
$$;

-- Function 3: Reverse Reward Claim (Refund / Reversal)
CREATE OR REPLACE FUNCTION public.fn_reverse_reward_claim(
    p_claim_id UUID,
    p_admin_id UUID,
    p_reason TEXT DEFAULT 'ADMIN_REFUND'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_reward_id UUID;
    v_coins INTEGER;
    v_orig_ledger_id UUID;
    v_stock INTEGER;
    v_current_bal INTEGER;
    v_new_bal INTEGER;
    v_reversal_ledger_id UUID;
BEGIN
    -- 1. Lock reward claim row
    SELECT user_id, reward_id, coins_spent, ledger_transaction_id INTO v_user_id, v_reward_id, v_coins, v_orig_ledger_id
    FROM public.reward_claims WHERE id = p_claim_id AND status IN ('REQUESTED', 'APPROVED', 'PROCESSING') FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Claim not found or cannot be refunded in current status';
    END IF;

    -- 2. Lock user wallet
    SELECT current_balance INTO v_current_bal
    FROM public.coin_wallets WHERE user_id = v_user_id FOR UPDATE;

    v_new_bal := v_current_bal + v_coins;

    -- 3. Insert Reversal CREDIT ledger transaction
    INSERT INTO public.coin_ledger (
        user_id, transaction_type, amount, direction, balance_after,
        source_type, source_id, reversal_of_ledger_id, reason_code,
        idempotency_key, admin_user_id
    ) VALUES (
        v_user_id, 'REVERSAL', v_coins, 'CREDIT', v_new_bal,
        'reward_claim_refund', p_claim_id, v_orig_ledger_id, p_reason,
        'reversal_' || p_claim_id::text, p_admin_id
    ) RETURNING id INTO v_reversal_ledger_id;

    -- 4. Update wallet balance (lifetime_spent remains unchanged)
    UPDATE public.coin_wallets
    SET current_balance = v_new_bal,
        last_transaction_at = now(),
        updated_at = now()
    WHERE user_id = v_user_id;

    -- 5. Restore stock if finite
    SELECT stock_quantity INTO v_stock FROM public.reward_catalog WHERE id = v_reward_id FOR UPDATE;
    IF v_stock != -1 THEN
        UPDATE public.reward_catalog SET stock_quantity = stock_quantity + 1 WHERE id = v_reward_id;
    END IF;

    -- 6. Update claim status to REFUNDED
    UPDATE public.reward_claims
    SET status = 'REFUNDED',
        reversal_ledger_id = v_reversal_ledger_id,
        admin_notes = COALESCE(admin_notes, '') || ' [Refunded by admin: ' || p_reason || ']',
        updated_at = now()
    WHERE id = p_claim_id;

    RETURN jsonb_build_object('success', true, 'reversal_ledger_id', v_reversal_ledger_id, 'refunded_coins', v_coins);
END;
$$;

-- Function 4: Record Qualifying Streak Activity (Atomic Row Lock)
CREATE OR REPLACE FUNCTION public.fn_record_qualifying_streak_activity(
    p_user_id UUID,
    p_action_type TEXT,
    p_source_id UUID,
    p_duration_seconds INTEGER DEFAULT 0,
    p_timezone TEXT DEFAULT 'Asia/Kolkata'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today DATE;
    v_last_qualifying_date DATE;
    v_current_streak INTEGER;
    v_longest_streak INTEGER;
    v_freezes_held INTEGER;
    v_new_streak INTEGER;
BEGIN
    v_today := (now() AT TIME ZONE p_timezone)::DATE;

    -- 1. Insert daily qualifying activity log (idempotent via unique constraint)
    INSERT INTO public.streak_activity_logs (
        user_id, activity_date, qualifying_action_type, source_id, duration_seconds, timezone
    ) VALUES (
        p_user_id, v_today, p_action_type, p_source_id, p_duration_seconds, p_timezone
    ) ON CONFLICT (user_id, activity_date, qualifying_action_type) DO NOTHING;

    -- 2. Upsert user_streaks record
    INSERT INTO public.user_streaks (user_id, current_streak, longest_streak, timezone)
    VALUES (p_user_id, 0, 0, p_timezone)
    ON CONFLICT (user_id) DO NOTHING;

    -- 3. Lock user_streaks row for atomic evaluation
    SELECT current_streak, longest_streak, last_qualifying_date
    INTO v_current_streak, v_longest_streak, v_last_qualifying_date
    FROM public.user_streaks WHERE user_id = p_user_id FOR UPDATE;

    -- Already qualified today
    IF v_last_qualifying_date = v_today THEN
        RETURN jsonb_build_object('success', true, 'status', 'ALREADY_QUALIFIED_TODAY', 'streak', v_current_streak);
    END IF;

    -- Consecutive Day
    IF v_last_qualifying_date = v_today - INTERVAL '1 day' THEN
        v_new_streak := v_current_streak + 1;
    -- Missed Day (Check Freeze)
    ELSIF v_last_qualifying_date < v_today - INTERVAL '1 day' THEN
        SELECT freezes_held INTO v_freezes_held FROM public.coin_wallets WHERE user_id = p_user_id FOR UPDATE;
        IF v_freezes_held > 0 AND v_last_qualifying_date = v_today - INTERVAL '2 days' THEN
            -- Consume 1 freeze token and keep streak
            UPDATE public.coin_wallets SET freezes_held = freezes_held - 1 WHERE user_id = p_user_id;
            UPDATE public.user_streaks 
            SET freezes_consumed_count = freezes_consumed_count + 1,
                last_freeze_used_date = v_today - INTERVAL '1 day'
            WHERE user_id = p_user_id;
            v_new_streak := v_current_streak + 1;
        ELSE
            -- Reset streak
            v_new_streak := 1;
        END IF;
    ELSE
        -- Initial streak
        v_new_streak := 1;
    END IF;

    -- Update user_streaks
    UPDATE public.user_streaks
    SET current_streak = v_new_streak,
        longest_streak = GREATEST(v_longest_streak, v_new_streak),
        last_qualifying_date = v_today,
        updated_at = now()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object('success', true, 'status', 'STREAK_INCREMENTED', 'streak', v_new_streak);
END;
$$;
