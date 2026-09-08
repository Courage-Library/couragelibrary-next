-- ============================================================================
-- COURAGE LIBRARY — PHASE 3T: PREMIUM ENTITLEMENT & ATOMIC QUOTA ENFORCEMENT
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Extend subscription_plans with feature_flags & quota definitions
ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Extend user_entitlements with custom_limits & plan_id
ALTER TABLE public.user_entitlements
    ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS custom_limits JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Index for entitlement lookup with active window
CREATE INDEX IF NOT EXISTS idx_user_entitlements_active_window
    ON public.user_entitlements (user_id, entitlement_type, is_active, starts_at, expires_at);

-- ============================================================================
-- 3. HELPER: Resolve canonical quota key & default limits
-- Supported Keys: FULL_LENGTH, PYQ, SECTIONAL, TOPIC, CHALLENGE, WEAK_AREA, MISTAKE_REVISION, PERSONALIZED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_quota_key(p_test_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_norm TEXT := UPPER(TRIM(p_test_type));
BEGIN
    IF v_norm IN ('FULL_LENGTH', 'FULL', 'PRO_MOCK', 'PRO_FULL_LENGTH') THEN
        RETURN 'FULL_LENGTH';
    ELSIF v_norm IN ('PYQ', 'PYQ_SHIFT', 'PREVIOUS_YEAR') THEN
        RETURN 'PYQ';
    ELSIF v_norm IN ('SECTIONAL', 'DAILY_SECTIONAL', 'SPEED_DRILL') THEN
        RETURN 'SECTIONAL';
    ELSIF v_norm IN ('TOPIC', 'TOPIC_TEST') THEN
        RETURN 'TOPIC';
    ELSIF v_norm IN ('CHALLENGE', 'CHALLENGE_MOCK') THEN
        RETURN 'CHALLENGE';
    ELSIF v_norm IN ('WEAK_AREA', 'WEAK_AREA_DRILL') THEN
        RETURN 'WEAK_AREA';
    ELSIF v_norm IN ('MISTAKE_REVISION', 'REVISION', 'MISTAKE_TEST') THEN
        RETURN 'MISTAKE_REVISION';
    ELSIF v_norm IN ('PERSONALIZED', 'DYNAMIC', 'CUSTOM_PRACTICE') THEN
        RETURN 'PERSONALIZED';
    ELSE
        RETURN 'FULL_LENGTH';
    END IF;
END;
$$;

-- ============================================================================
-- 4. Authoritative Read-Only Premium Access & Quota Check Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_premium_access_and_quota(
    p_user_id UUID,
    p_exam_id UUID DEFAULT NULL,
    p_test_type TEXT DEFAULT 'FULL_LENGTH'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_entitlement RECORD;
    v_quota_limit INT := 30;
    v_quota_key TEXT;
    v_used_count INT := 0;
    v_has_future BOOLEAN := false;
    v_has_expired BOOLEAN := false;
BEGIN
    -- Canonical Quota Key Resolution
    v_quota_key := public.fn_resolve_quota_key(p_test_type);

    -- Default Limits for PRO
    IF v_quota_key = 'FULL_LENGTH' THEN
        v_quota_limit := 30;
    ELSIF v_quota_key = 'PYQ' THEN
        v_quota_limit := 20;
    ELSIF v_quota_key = 'SECTIONAL' THEN
        v_quota_limit := 50;
    ELSIF v_quota_key = 'TOPIC' THEN
        v_quota_limit := 100;
    ELSIF v_quota_key = 'CHALLENGE' THEN
        v_quota_limit := 20;
    ELSIF v_quota_key = 'WEAK_AREA' THEN
        v_quota_limit := 30;
    ELSIF v_quota_key = 'MISTAKE_REVISION' THEN
        v_quota_limit := -1; -- Unlimited
    ELSIF v_quota_key = 'PERSONALIZED' THEN
        v_quota_limit := 30;
    END IF;

    -- Find active matching entitlement with strict precedence:
    -- 1. Exam-specific PRO_SUBSCRIPTION
    -- 2. Exam-specific PROMOTIONAL_PASS
    -- 3. Platform-wide PRO_SUBSCRIPTION (exam_id IS NULL)
    -- 4. Platform-wide PROMOTIONAL_PASS (exam_id IS NULL)
    -- 5. Latest expires_at DESC NULLS FIRST (longest access)
    -- 6. Latest created_at DESC
    SELECT ue.id, ue.entitlement_type, ue.exam_id, ue.starts_at, ue.expires_at, 
           ue.custom_limits, sp.feature_flags
    INTO v_entitlement
    FROM public.user_entitlements ue
    LEFT JOIN public.subscription_plans sp ON ue.plan_id = sp.id
    WHERE ue.user_id = p_user_id
      AND ue.is_active = true
      AND ue.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
      AND (p_exam_id IS NULL OR ue.exam_id IS NULL OR ue.exam_id = p_exam_id)
      AND ue.starts_at <= v_now
      AND (ue.expires_at IS NULL OR ue.expires_at > v_now)
    ORDER BY 
      (CASE 
        WHEN ue.exam_id IS NOT NULL AND ue.exam_id = p_exam_id AND ue.entitlement_type = 'PRO_SUBSCRIPTION' THEN 1
        WHEN ue.exam_id IS NOT NULL AND ue.exam_id = p_exam_id AND ue.entitlement_type = 'PROMOTIONAL_PASS' THEN 2
        WHEN ue.exam_id IS NULL AND ue.entitlement_type = 'PRO_SUBSCRIPTION' THEN 3
        WHEN ue.exam_id IS NULL AND ue.entitlement_type = 'PROMOTIONAL_PASS' THEN 4
        ELSE 5 
      END) ASC,
      ue.expires_at DESC NULLS FIRST,
      ue.created_at DESC
    LIMIT 1;

    -- If no active entitlement found, determine specific inactive reason
    IF v_entitlement.id IS NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = p_user_id 
              AND is_active = true
              AND starts_at > v_now
        ) INTO v_has_future;

        IF v_has_future THEN
            RETURN jsonb_build_object(
                'has_access', false,
                'status', 'PREMIUM_NOT_STARTED',
                'error_code', 'PREMIUM_NOT_STARTED',
                'quota_key', v_quota_key,
                'message', 'Your Premium subscription starts in the future.'
            );
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = p_user_id 
              AND (expires_at IS NOT NULL AND expires_at <= v_now)
        ) INTO v_has_expired;

        IF v_has_expired THEN
            RETURN jsonb_build_object(
                'has_access', false,
                'status', 'PREMIUM_EXPIRED',
                'error_code', 'PREMIUM_EXPIRED',
                'quota_key', v_quota_key,
                'message', 'Your Premium subscription has expired.'
            );
        END IF;

        RETURN jsonb_build_object(
            'has_access', false,
            'status', 'PREMIUM_REQUIRED',
            'error_code', 'PREMIUM_REQUIRED',
            'quota_key', v_quota_key,
            'message', 'Active Premium subscription required.'
        );
    END IF;

    -- Override quota limit from custom_limits or feature_flags
    IF v_entitlement.custom_limits ? v_quota_key THEN
        v_quota_limit := (v_entitlement.custom_limits->>v_quota_key)::INT;
    ELSIF v_entitlement.custom_limits ? ('max_' || LOWER(v_quota_key)) THEN
        v_quota_limit := (v_entitlement.custom_limits->>('max_' || LOWER(v_quota_key)))::INT;
    ELSIF v_entitlement.feature_flags ? 'mock_quotas' AND (v_entitlement.feature_flags->'mock_quotas') ? v_quota_key THEN
        v_quota_limit := (v_entitlement.feature_flags->'mock_quotas'->v_quota_key->>'limit')::INT;
    ELSIF v_entitlement.feature_flags ? v_quota_key THEN
        v_quota_limit := (v_entitlement.feature_flags->>v_quota_key)::INT;
    ELSIF v_entitlement.feature_flags ? ('max_' || LOWER(v_quota_key)) THEN
        v_quota_limit := (v_entitlement.feature_flags->>('max_' || LOWER(v_quota_key)))::INT;
    END IF;

    -- Calculate usage for this specific quota key in the active entitlement window
    IF v_quota_limit != -1 THEN
        SELECT COUNT(ta.id) INTO v_used_count
        FROM public.test_attempts ta
        JOIN public.mock_tests mt ON ta.mock_test_id = mt.id
        JOIN public.mock_templates tmpl ON mt.template_id = tmpl.id
        WHERE ta.user_id = p_user_id
          AND mt.is_free = false
          AND public.fn_resolve_quota_key(tmpl.test_type) = v_quota_key
          AND ta.started_at >= v_entitlement.starts_at
          AND (v_entitlement.expires_at IS NULL OR ta.started_at <= v_entitlement.expires_at)
          AND ta.status IN ('in_progress', 'submitted', 'completed', 'auto_submitted', 'abandoned');
    END IF;

    RETURN jsonb_build_object(
        'has_access', (v_quota_limit = -1 OR v_used_count < v_quota_limit),
        'status', (CASE WHEN v_quota_limit != -1 AND v_used_count >= v_quota_limit THEN 'QUOTA_EXHAUSTED' ELSE 'ACTIVE' END),
        'entitlement_id', v_entitlement.id,
        'entitlement_type', v_entitlement.entitlement_type,
        'starts_at', v_entitlement.starts_at,
        'expires_at', v_entitlement.expires_at,
        'quota_key', v_quota_key,
        'test_type', p_test_type,
        'quota_limit', v_quota_limit,
        'quota_used', v_used_count,
        'quota_remaining', (CASE WHEN v_quota_limit = -1 THEN -1 ELSE GREATEST(0, v_quota_limit - v_used_count) END)
    );
END;
$$;

-- ============================================================================
-- 5. Authoritative Concurrency-Safe Quota Authorization & Attempt Starter Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_authorize_and_start_test_attempt(
    p_user_id UUID,
    p_mock_test_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_mock RECORD;
    v_existing_attempt RECORD;
    v_entitlement RECORD;
    v_quota_limit INT := 30;
    v_quota_key TEXT;
    v_used_count INT := 0;
    v_new_attempt_id UUID;
    v_has_future BOOLEAN := false;
    v_has_expired BOOLEAN := false;
BEGIN
    -- 1. Fetch target mock test with template metadata
    SELECT mt.id, mt.title, mt.is_free, mt.is_dynamic, mt.created_for_user_id,
           mt.status, mt.lifecycle_status, mt.expires_at, tmpl.id AS template_id, tmpl.exam_id, tmpl.test_type
    INTO v_mock
    FROM public.mock_tests mt
    JOIN public.mock_templates tmpl ON mt.template_id = tmpl.id
    WHERE mt.id = p_mock_test_id;

    IF v_mock.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'TEST_UNAVAILABLE',
            'message', 'Target mock test does not exist or is inactive.'
        );
    END IF;

    -- 2. Verify candidate ownership for dynamic tests
    IF v_mock.is_dynamic = true AND (v_mock.created_for_user_id IS NULL OR v_mock.created_for_user_id != p_user_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'UNAUTHORIZED_TEST_ACCESS',
            'message', 'You are not authorized to access this personalized test.'
        );
    END IF;

    -- 3. Idempotency Check: Existing attempts for this user and test
    SELECT id, status, started_at, submitted_at
    INTO v_existing_attempt
    FROM public.test_attempts
    WHERE user_id = p_user_id
      AND mock_test_id = p_mock_test_id
    ORDER BY started_at DESC
    LIMIT 1;

    -- If there is an active in-progress attempt, return it immediately (No quota re-consumption)
    IF v_existing_attempt.id IS NOT NULL AND v_existing_attempt.status = 'in_progress' AND v_existing_attempt.submitted_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_existing_attempt', true,
            'attempt_id', v_existing_attempt.id,
            'status', 'in_progress',
            'message', 'Resumed existing in-progress attempt.'
        );
    END IF;

    -- 4. TTL Check for Dynamic Tests (only if not already in-progress)
    IF v_mock.is_dynamic = true AND v_mock.expires_at IS NOT NULL AND v_mock.expires_at <= v_now THEN
        UPDATE public.mock_tests
        SET lifecycle_status = 'ARCHIVED',
            updated_at = v_now
        WHERE id = p_mock_test_id AND lifecycle_status = 'GENERATED';

        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'TEST_EXPIRED',
            'message', 'This generated dynamic test has expired and is no longer available.'
        );
    END IF;

    -- 5. If this is a Free Test (e.g. Daily Mock):
    -- Quota does NOT apply. Daily Mock triggers and occurrence resolvers govern it.
    IF v_mock.is_free = true THEN
        INSERT INTO public.test_attempts (
            user_id,
            mock_test_id,
            status,
            started_at,
            last_activity_at
        ) VALUES (
            p_user_id,
            p_mock_test_id,
            'in_progress',
            v_now,
            v_now
        ) RETURNING id INTO v_new_attempt_id;

        RETURN jsonb_build_object(
            'success', true,
            'is_new_attempt', true,
            'is_free', true,
            'attempt_id', v_new_attempt_id,
            'message', 'Free mock test attempt started.'
        );
    END IF;

    -- 6. Non-daily / Premium tests: Forbid re-taking already submitted tests
    IF v_existing_attempt.id IS NOT NULL AND v_existing_attempt.status IN ('submitted', 'completed', 'auto_submitted') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'TEST_ALREADY_SUBMITTED',
            'attempt_id', v_existing_attempt.id,
            'message', 'You have already submitted this mock test.'
        );
    END IF;

    -- 7. Resolve Canonical Quota Key
    v_quota_key := public.fn_resolve_quota_key(v_mock.test_type);

    -- Default Limits for PRO
    IF v_quota_key = 'FULL_LENGTH' THEN
        v_quota_limit := 30;
    ELSIF v_quota_key = 'PYQ' THEN
        v_quota_limit := 20;
    ELSIF v_quota_key = 'SECTIONAL' THEN
        v_quota_limit := 50;
    ELSIF v_quota_key = 'TOPIC' THEN
        v_quota_limit := 100;
    ELSIF v_quota_key = 'CHALLENGE' THEN
        v_quota_limit := 20;
    ELSIF v_quota_key = 'WEAK_AREA' THEN
        v_quota_limit := 30;
    ELSIF v_quota_key = 'MISTAKE_REVISION' THEN
        v_quota_limit := -1;
    ELSIF v_quota_key = 'PERSONALIZED' THEN
        v_quota_limit := 30;
    END IF;

    -- 8. PREMIUM ENTITLEMENT CHECK WITH ROW LOCK (SELECT FOR UPDATE)
    -- Guarantees serializability under concurrent requests for the same candidate.
    SELECT ue.id, ue.entitlement_type, ue.exam_id, ue.starts_at, ue.expires_at, 
           ue.custom_limits, sp.feature_flags
    INTO v_entitlement
    FROM public.user_entitlements ue
    LEFT JOIN public.subscription_plans sp ON ue.plan_id = sp.id
    WHERE ue.user_id = p_user_id
      AND ue.is_active = true
      AND ue.entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
      AND (v_mock.exam_id IS NULL OR ue.exam_id IS NULL OR ue.exam_id = v_mock.exam_id)
      AND ue.starts_at <= v_now
      AND (ue.expires_at IS NULL OR ue.expires_at > v_now)
    ORDER BY 
      (CASE 
        WHEN ue.exam_id IS NOT NULL AND ue.exam_id = v_mock.exam_id AND ue.entitlement_type = 'PRO_SUBSCRIPTION' THEN 1
        WHEN ue.exam_id IS NOT NULL AND ue.exam_id = v_mock.exam_id AND ue.entitlement_type = 'PROMOTIONAL_PASS' THEN 2
        WHEN ue.exam_id IS NULL AND ue.entitlement_type = 'PRO_SUBSCRIPTION' THEN 3
        WHEN ue.exam_id IS NULL AND ue.entitlement_type = 'PROMOTIONAL_PASS' THEN 4
        ELSE 5 
      END) ASC,
      ue.expires_at DESC NULLS FIRST,
      ue.created_at DESC
    LIMIT 1
    FOR UPDATE OF ue;

    -- If no active entitlement locked
    IF v_entitlement.id IS NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = p_user_id 
              AND is_active = true
              AND starts_at > v_now
        ) INTO v_has_future;

        IF v_has_future THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'PREMIUM_NOT_STARTED',
                'quota_key', v_quota_key,
                'message', 'Your Premium subscription starts in the future.'
            );
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = p_user_id 
              AND (expires_at IS NOT NULL AND expires_at <= v_now)
        ) INTO v_has_expired;

        IF v_has_expired THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'PREMIUM_EXPIRED',
                'quota_key', v_quota_key,
                'message', 'Your Premium subscription has expired. Please renew.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'PREMIUM_REQUIRED',
            'quota_key', v_quota_key,
            'message', 'Active Premium subscription required to take this mock.'
        );
    END IF;

    -- Override from custom_limits or feature_flags
    IF v_entitlement.custom_limits ? v_quota_key THEN
        v_quota_limit := (v_entitlement.custom_limits->>v_quota_key)::INT;
    ELSIF v_entitlement.custom_limits ? ('max_' || LOWER(v_quota_key)) THEN
        v_quota_limit := (v_entitlement.custom_limits->>('max_' || LOWER(v_quota_key)))::INT;
    ELSIF v_entitlement.feature_flags ? 'mock_quotas' AND (v_entitlement.feature_flags->'mock_quotas') ? v_quota_key THEN
        v_quota_limit := (v_entitlement.feature_flags->'mock_quotas'->v_quota_key->>'limit')::INT;
    ELSIF v_entitlement.feature_flags ? v_quota_key THEN
        v_quota_limit := (v_entitlement.feature_flags->>v_quota_key)::INT;
    ELSIF v_entitlement.feature_flags ? ('max_' || LOWER(v_quota_key)) THEN
        v_quota_limit := (v_entitlement.feature_flags->>('max_' || LOWER(v_quota_key)))::INT;
    END IF;

    -- 9. Calculate authoritative count within entitlement window for this quota key
    IF v_quota_limit != -1 THEN
        SELECT COUNT(ta.id) INTO v_used_count
        FROM public.test_attempts ta
        JOIN public.mock_tests mt ON ta.mock_test_id = mt.id
        JOIN public.mock_templates tmpl ON mt.template_id = tmpl.id
        WHERE ta.user_id = p_user_id
          AND mt.is_free = false
          AND public.fn_resolve_quota_key(tmpl.test_type) = v_quota_key
          AND ta.started_at >= v_entitlement.starts_at
          AND (v_entitlement.expires_at IS NULL OR ta.started_at <= v_entitlement.expires_at)
          AND ta.status IN ('in_progress', 'submitted', 'completed', 'auto_submitted', 'abandoned');

        IF v_used_count >= v_quota_limit THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'QUOTA_EXHAUSTED',
                'quota_key', v_quota_key,
                'quota_limit', v_quota_limit,
                'quota_used', v_used_count,
                'message', 'Monthly quota exhausted for ' || v_quota_key || ' tests.'
            );
        END IF;
    END IF;

    -- 10. Quota available -> Insert attempt atomically
    INSERT INTO public.test_attempts (
        user_id,
        mock_test_id,
        status,
        started_at,
        last_activity_at
    ) VALUES (
        p_user_id,
        p_mock_test_id,
        'in_progress',
        v_now,
        v_now
    ) RETURNING id INTO v_new_attempt_id;

    -- Update dynamic test lifecycle if applicable
    IF v_mock.is_dynamic = true THEN
        UPDATE public.mock_tests
        SET lifecycle_status = 'IN_PROGRESS',
            updated_at = v_now
        WHERE id = p_mock_test_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_new_attempt', true,
        'is_premium', true,
        'attempt_id', v_new_attempt_id,
        'quota_key', v_quota_key,
        'quota_limit', v_quota_limit,
        'quota_used', v_used_count + 1,
        'quota_remaining', (CASE WHEN v_quota_limit = -1 THEN -1 ELSE GREATEST(0, v_quota_limit - (v_used_count + 1)) END),
        'message', 'Premium mock test attempt successfully started.'
    );
END;
$$;

-- Role Grants
GRANT EXECUTE ON FUNCTION public.fn_resolve_quota_key(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_check_premium_access_and_quota(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_authorize_and_start_test_attempt(UUID, UUID) TO authenticated, service_role;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
