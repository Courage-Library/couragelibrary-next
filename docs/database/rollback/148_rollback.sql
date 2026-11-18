-- =====================================================================================================================
-- Rollback for 148 PAY-1 cleanup (supabase/migrations/20261118000148_pay1_cleanup.sql).
-- ROLLBACK-CHAIN: run first: none
-- Roll the APP back first (the 148 app calls the 6-argument fn_exam_course_launch_set and never reads access_mode).
-- Restores the exact live definitions read 2026-11-18 from the pre-148 backup (pre-148-pay1-cleanup, resilient):
--   exam_course_launches.access_mode (NOT NULL DEFAULT 'FREE_ALL', its CHECK, comment and the anon / authenticated column
--   read) — every row comes back as FREE_ALL, which is what every row was (148 refused to run otherwise);
--   the 7-argument fn_exam_course_launch_set (INVOKER, service_role) instead of the 6-argument one;
--   fn_gated_course_document_ids (INVOKER; anon, authenticated, service_role);
--   the five SECURITY DEFINER functions (service_role only) — re-add their scripts/secdef/allowlist.json entries and
--   raise max total by 5 / B-service by 3 in the same change.
-- Byte check (local copy, 2026-11-18): every restored definition equals the pre-148 one, except that three live bodies
-- (fn_authorize_and_start_test_attempt, fn_check_premium_access_and_quota, fn_create_dynamic_mock_instance_atomic) were
-- stored with CRLF line ends by their apply before CRLF-1; this file is LF (.gitattributes), so they come back with LF —
-- the same code otherwise.
-- Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================

-- FREE_N column + the 7-argument launch function + the gating function
ALTER TABLE public.exam_course_launches ADD COLUMN access_mode text NOT NULL DEFAULT 'FREE_ALL';
ALTER TABLE public.exam_course_launches ADD CONSTRAINT exam_course_launches_access_mode_check CHECK ((access_mode = ANY (ARRAY['FREE_ALL'::text, 'FREE_N'::text])));
COMMENT ON COLUMN public.exam_course_launches.access_mode IS 'LAUNCH-MODE-1: FREE_ALL = every lesson free; FREE_N = the first N per master chapter free, the rest Pro (refused while no Pro plan is active / payments are off).';
GRANT SELECT (access_mode) ON public.exam_course_launches TO anon, authenticated;

DROP FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_exam_course_launch_set(p_exam_id uuid, p_exam_cycle_id uuid, p_status text, p_access_mode text, p_coverage jsonb, p_actor_id uuid, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_old    public.exam_course_launches%ROWTYPE;
    v_new    public.exam_course_launches%ROWTYPE;
    v_action text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LAUNCH: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_status IS NULL OR p_status NOT IN ('LIVE', 'PAUSED') THEN RAISE EXCEPTION 'LAUNCH: status must be LIVE or PAUSED' USING ERRCODE = '22023'; END IF;
    IF p_access_mode IS NULL OR p_access_mode NOT IN ('FREE_ALL', 'FREE_N') THEN RAISE EXCEPTION 'LAUNCH: access mode must be FREE_ALL or FREE_N' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'LAUNCH: exam not found' USING ERRCODE = 'P0002'; END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'LAUNCH: the cycle does not belong to this exam' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_course_launch:' || p_exam_id::text, 0));
    SELECT * INTO v_old FROM public.exam_course_launches WHERE exam_id = p_exam_id AND exam_cycle_id IS NOT DISTINCT FROM p_exam_cycle_id FOR UPDATE;
    IF p_status = 'LIVE' THEN
        IF p_coverage IS NULL OR jsonb_typeof(p_coverage) <> 'object' OR NOT (p_coverage ? 'total' AND p_coverage ? 'en') THEN
            RAISE EXCEPTION 'LAUNCH: a coverage snapshot is required to launch' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = p_exam_id AND status = 'PUBLISHED' AND is_active) THEN
            RAISE EXCEPTION 'LAUNCH: the exam has no published syllabus' USING ERRCODE = 'P0001';
        END IF;
        -- EXAM-LOGO-1 (126): a course goes live only with its conducting body's logo (or the exam's own override)
        IF NOT EXISTS (SELECT 1 FROM public.exams e JOIN public.conducting_orgs o ON o.id = e.org_id
                        WHERE e.id = p_exam_id AND (e.logo_override_sha256 IS NOT NULL OR o.logo_sha256 IS NOT NULL)) THEN
            RAISE EXCEPTION 'LAUNCH: the exam needs its conducting body''s logo first (Exams › Conducting bodies)' USING ERRCODE = 'P0001';
        END IF;
        -- LAUNCH-MODE-1: no paywall nobody can pay for
        IF p_access_mode = 'FREE_N' AND NOT EXISTS (SELECT 1 FROM public.pro_plan_versions WHERE active) THEN
            RAISE EXCEPTION 'LAUNCH: FREE_N needs payments: no Pro plan is active, so the Pro lessons could not be bought. Launch with FREE_ALL instead.' USING ERRCODE = 'P0001';
        END IF;
    ELSIF v_old.id IS NULL OR v_old.status <> 'LIVE' THEN
        RAISE EXCEPTION 'LAUNCH: only a LIVE course can be paused' USING ERRCODE = 'P0001';
    END IF;
    IF v_old.id IS NOT NULL AND v_old.status = p_status AND (p_status = 'PAUSED' OR v_old.access_mode = p_access_mode) THEN
        RAISE EXCEPTION 'LAUNCH: the course is already %', p_status USING ERRCODE = 'P0001';
    END IF;
    v_action := CASE WHEN p_status = 'PAUSED' THEN 'EXAM_COURSE_PAUSE'
                     WHEN v_old.id IS NOT NULL AND v_old.status = 'LIVE' THEN 'EXAM_COURSE_MODE'
                     ELSE 'EXAM_COURSE_LAUNCH' END;
    IF v_old.id IS NULL THEN
        INSERT INTO public.exam_course_launches (exam_id, exam_cycle_id, status, access_mode, coverage, launched_by, launched_by_email, changed_by_email)
        VALUES (p_exam_id, p_exam_cycle_id, p_status, p_access_mode, p_coverage, p_actor_id, p_actor_email, p_actor_email)
        RETURNING * INTO v_new;
    ELSE
        UPDATE public.exam_course_launches
           SET status = p_status,
               access_mode = CASE WHEN p_status = 'LIVE' THEN p_access_mode ELSE access_mode END,
               coverage = CASE WHEN p_status = 'LIVE' THEN p_coverage ELSE coverage END,
               launched_by = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN p_actor_id ELSE launched_by END,
               launched_by_email = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN p_actor_email ELSE launched_by_email END,
               launched_at = CASE WHEN v_action = 'EXAM_COURSE_LAUNCH' THEN now() ELSE launched_at END,
               changed_by_email = p_actor_email, changed_at = now()
         WHERE id = v_old.id
        RETURNING * INTO v_new;
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, v_action, 'exam_course_launch', v_new.id::text,
            CASE WHEN v_old.id IS NULL THEN NULL ELSE jsonb_build_object('status', v_old.status, 'access_mode', v_old.access_mode) END,
            jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'status', v_new.status, 'access_mode', v_new.access_mode, 'coverage', v_new.coverage), NULL);
    RETURN jsonb_build_object('id', v_new.id, 'status', v_new.status, 'access_mode', v_new.access_mode);
END
$function$;

REVOKE ALL ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_gated_course_document_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
    SELECT DISTINCT (l ->> 'document_id')::uuid
      FROM public.exam_course_launches x
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(public.fn_exam_course_outline(x.exam_id, x.exam_cycle_id, 'en') -> 'chapters', '[]'::jsonb)) ch
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(ch -> 'lessons', '[]'::jsonb)) l
     WHERE x.status = 'LIVE' AND x.access_mode = 'FREE_N'
$function$;

REVOKE ALL ON FUNCTION public.fn_gated_course_document_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_gated_course_document_ids() TO anon, authenticated, service_role;

-- the five legacy premium / flashcard functions (SECURITY DEFINER, service_role only)
CREATE OR REPLACE FUNCTION public.fn_authorize_and_start_test_attempt(p_user_id uuid, p_mock_test_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_authorize_and_start_test_attempt(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_check_premium_access_and_quota(p_user_id uuid, p_exam_id uuid DEFAULT NULL::uuid, p_test_type text DEFAULT 'FULL_LENGTH'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_check_premium_access_and_quota(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_create_dynamic_mock_instance_atomic(p_user_id uuid, p_exam_id uuid, p_template_id uuid, p_title text, p_slug text, p_test_type text, p_quota_key text, p_duration_minutes integer, p_marks_per_question numeric, p_negative_mark numeric, p_metadata jsonb, p_questions jsonb, p_ttl_hours integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_expires_at TIMESTAMPTZ := v_now + (p_ttl_hours || ' hours')::INTERVAL;
    v_mock_test_id UUID;
    v_section_id UUID;
    v_total_questions INT;
    v_total_marks NUMERIC(6, 2);
    v_q RECORD;
    v_order INT := 1;
    v_subject_id UUID;
BEGIN
    v_total_questions := jsonb_array_length(p_questions);
    IF v_total_questions = 0 THEN
        RAISE EXCEPTION 'CANNOT_CREATE_EMPTY_TEST';
    END IF;

    v_total_marks := v_total_questions * p_marks_per_question;

    -- Extract subject_id from first question if available
    IF (p_questions->0) ? 'subject_id' AND (p_questions->0->>'subject_id') IS NOT NULL THEN
        v_subject_id := (p_questions->0->>'subject_id')::UUID;
    ELSE
        v_subject_id := NULL;
    END IF;

    -- 1. Insert mock_tests row
    INSERT INTO public.mock_tests (
        template_id,
        title,
        slug,
        status,
        duration_minutes,
        total_questions,
        total_marks,
        is_free,
        is_dynamic,
        created_for_user_id,
        lifecycle_status,
        expires_at,
        generation_metadata
    ) VALUES (
        p_template_id,
        p_title,
        p_slug,
        'published',
        p_duration_minutes,
        v_total_questions,
        v_total_marks,
        false,
        true,
        p_user_id,
        'GENERATED',
        v_expires_at,
        p_metadata
    ) RETURNING id INTO v_mock_test_id;

    -- 2. Insert mock_sections row
    INSERT INTO public.mock_sections (
        mock_test_id,
        subject_id,
        section_name,
        section_order,
        num_questions,
        marks_per_question,
        negative_mark,
        duration_minutes
    ) VALUES (
        v_mock_test_id,
        v_subject_id,
        'Practice Section',
        1,
        v_total_questions,
        p_marks_per_question,
        p_negative_mark,
        p_duration_minutes
    ) RETURNING id INTO v_section_id;

    -- 3. Insert mock_questions rows in atomic loop
    FOR v_q IN SELECT * FROM jsonb_to_recordset(p_questions) AS x(
        question_version_id UUID,
        subject_id UUID,
        question_order INT,
        marks NUMERIC,
        negative_mark NUMERIC
    )
    LOOP
        INSERT INTO public.mock_questions (
            mock_test_id,
            mock_section_id,
            question_version_id,
            question_order,
            marks,
            negative_mark
        ) VALUES (
            v_mock_test_id,
            v_section_id,
            v_q.question_version_id,
            COALESCE(v_q.question_order, v_order),
            COALESCE(v_q.marks, p_marks_per_question),
            COALESCE(v_q.negative_mark, p_negative_mark)
        );
        v_order := v_order + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'mock_test_id', v_mock_test_id,
        'slug', p_slug,
        'title', p_title,
        'test_type', p_test_type,
        'quota_key', p_quota_key,
        'total_questions', v_total_questions,
        'total_marks', v_total_marks,
        'duration_minutes', p_duration_minutes,
        'lifecycle_status', 'GENERATED',
        'expires_at', v_expires_at,
        'is_dynamic', true,
        'is_free', false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_get_due_flashcards(p_deck_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(card_id uuid, deck_id uuid, card_order integer, front_markdown_en text, front_markdown_hi text, back_markdown_en text, back_markdown_hi text, mnemonic_en text, mnemonic_hi text, latex_formulas text[], hint text, explanation text, repetition_level integer, interval_days integer, ease_factor numeric, next_review_due_at timestamp with time zone, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements ue
        WHERE ue.user_id = v_user_id
          AND ue.is_active = true
          AND (ue.expires_at IS NULL OR ue.expires_at > now())
    ) INTO v_has_pro;

    RETURN QUERY
    SELECT 
        fc.id AS card_id,
        fc.deck_id,
        fc.card_order,
        fc.front_markdown_en,
        fc.front_markdown_hi,
        fc.back_markdown_en,
        fc.back_markdown_hi,
        fc.mnemonic_en,
        fc.mnemonic_hi,
        fc.latex_formulas,
        fc.hint,
        fc.explanation,
        COALESCE(ufr.repetition_level, 0) AS repetition_level,
        COALESCE(ufr.interval_days, 1) AS interval_days,
        COALESCE(ufr.ease_factor, 2.50) AS ease_factor,
        ufr.next_review_due_at,
        (ufr.id IS NULL) AS is_new
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    LEFT JOIN public.user_flashcard_reviews ufr ON ufr.card_id = fc.id AND ufr.user_id = v_user_id
    WHERE fc.is_active = true
      AND fd.is_published = true
      AND (p_deck_id IS NULL OR fc.deck_id = p_deck_id)
      AND (
          fd.author_id = v_user_id OR
          (fd.is_curated = true AND (
              fd.access_tier = 'FREE' OR
              fc.card_order <= 3 OR
              v_has_pro OR
              COALESCE(auth.jwt()->>'role', '') = 'service_role' OR
              public.fn_jwt_is_admin_or_staff()
          ))
      )
      AND (ufr.next_review_due_at IS NULL OR ufr.next_review_due_at <= now())
    ORDER BY 
        CASE WHEN ufr.next_review_due_at IS NOT NULL THEN 0 ELSE 1 END,
        ufr.next_review_due_at ASC,
        fc.card_order ASC
    LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_due_flashcards(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_due_flashcards(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_create_custom_flashcard_deck(p_title text, p_description text DEFAULT NULL::text, p_topic_id uuid DEFAULT NULL::uuid, p_cards jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_slug TEXT;
    v_deck_id UUID;
    v_card_count INTEGER := 0;
    v_card JSONB;
    v_order INTEGER := 1;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) < 3 OR length(p_title) > 200 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deck title must be between 3 and 200 characters');
    END IF;

    v_slug := 'deck-' || lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(gen_random_uuid()::text from 1 for 8);

    INSERT INTO public.flashcard_decks (
        slug, title_en, description, topic_id, author_id,
        is_curated, access_tier, is_published, card_count
    ) VALUES (
        v_slug, trim(p_title), trim(p_description), p_topic_id, v_user_id,
        false, 'FREE', true, 0
    ) RETURNING id INTO v_deck_id;

    IF jsonb_typeof(p_cards) = 'array' THEN
        FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
        LOOP
            IF v_card->>'front' IS NOT NULL AND length(trim(v_card->>'front')) > 0 AND
               v_card->>'back' IS NOT NULL AND length(trim(v_card->>'back')) > 0 THEN
                
                INSERT INTO public.flashcards (
                    deck_id, card_order, front_markdown_en, back_markdown_en,
                    hint, explanation
                ) VALUES (
                    v_deck_id, v_order, trim(v_card->>'front'), trim(v_card->>'back'),
                    trim(v_card->>'hint'), trim(v_card->>'explanation')
                );
                
                v_order := v_order + 1;
                v_card_count := v_card_count + 1;
            END IF;
        END LOOP;
        
        UPDATE public.flashcard_decks
        SET card_count = v_card_count
        WHERE id = v_deck_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deck_id', v_deck_id,
        'slug', v_slug,
        'card_count', v_card_count
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_custom_flashcard_deck(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(text, text, uuid, jsonb) TO service_role;

DO $proof$
BEGIN
    IF to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, jsonb, uuid, text)') IS NOT NULL
       OR to_regprocedure('public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)') IS NULL
       OR to_regprocedure('public.fn_gated_course_document_ids()') IS NULL
       OR to_regprocedure('public.fn_authorize_and_start_test_attempt(uuid, uuid)') IS NULL
       OR to_regprocedure('public.fn_check_premium_access_and_quota(uuid, uuid, text)') IS NULL
       OR to_regprocedure('public.fn_create_dynamic_mock_instance_atomic(uuid, uuid, uuid, text, text, text, text, integer, numeric, numeric, jsonb, jsonb, integer)') IS NULL
       OR to_regprocedure('public.fn_get_due_flashcards(uuid, integer)') IS NULL
       OR to_regprocedure('public.fn_create_custom_flashcard_deck(text, text, uuid, jsonb)') IS NULL THEN
        RAISE EXCEPTION 'ROLLBACK_148_PROOF: the pre-148 functions are not back';
    END IF;
    IF NOT has_column_privilege('anon', 'public.exam_course_launches', 'access_mode', 'SELECT')
       OR has_function_privilege('authenticated', 'public.fn_authorize_and_start_test_attempt(uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_get_due_flashcards(uuid, integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_exam_course_launch_set(uuid, uuid, text, text, jsonb, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'ROLLBACK_148_PROOF: grants are not as before 148';
    END IF;
END
$proof$;
