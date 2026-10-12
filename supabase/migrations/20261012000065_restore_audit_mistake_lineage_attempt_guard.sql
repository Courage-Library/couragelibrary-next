-- =============================================================================
-- COURAGE LIBRARY — DRIFT-1b: FOUNDATION RESTORE (forward-only, hardened)
-- Migration: 20261012000065_restore_audit_mistake_lineage_attempt_guard.sql
--
-- Re-creates, hardened, ONLY the objects required from never-applied migrations
-- 033 / 037 / 052 (which are SUPERSEDED_NOT_APPLIED and must never be replayed):
--   1. Admin authorization helper (JWT app_metadata only — never user_metadata, never public.users)
--   2. premium_system_configs        (from 037)
--   3. admin_audit_logs, append-only (from 037)
--   4. Mistake-vault lineage + errata (from 052)
--   5. Active-daily-attempt uniqueness guard (from 033), preceded by the D6 data fix
--
-- Every new table: RLS on, explicit REVOKE from PUBLIC/anon/authenticated, minimal grants
-- (Supabase default privileges would otherwise grant ALL to anon/authenticated).
-- Every SECURITY DEFINER function: pinned search_path, EXECUTE only for the roles listed.
-- Idempotent.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ADMIN AUTHORIZATION HELPER
--    Used by RLS policies below. SECURITY INVOKER: reads the caller's verified JWT.
--    app_metadata is writable only with the service role (post SEC-1A rule).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'staff');
$$;

REVOKE ALL ON FUNCTION public.fn_jwt_is_admin_or_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_jwt_is_admin_or_staff() TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. premium_system_configs (037 columns)
--    No anon access; authenticated non-admins see nothing; admins (app_metadata) read;
--    writes only via the service role (server-side admin client).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.premium_system_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_domain TEXT NOT NULL,
    config_key TEXT NOT NULL UNIQUE,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    config_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_premium_config_domain CHECK (config_domain IN ('GLOBAL', 'EXAM', 'TEST_TYPE', 'GENERATOR_POLICY'))
);

CREATE INDEX IF NOT EXISTS idx_premium_system_configs_domain_enabled ON public.premium_system_configs (config_domain, is_enabled);

ALTER TABLE public.premium_system_configs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.premium_system_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.premium_system_configs TO authenticated;
GRANT ALL ON public.premium_system_configs TO service_role;

DROP POLICY IF EXISTS "premium_configs_admin_read" ON public.premium_system_configs;
CREATE POLICY "premium_configs_admin_read"
    ON public.premium_system_configs
    FOR SELECT
    TO authenticated
    USING (public.fn_jwt_is_admin_or_staff());

-- Baseline configuration (037 seed, unchanged values).
INSERT INTO public.premium_system_configs (config_domain, config_key, is_enabled, config_value)
VALUES (
    'GLOBAL',
    'GLOBAL_PREMIUM_STATUS',
    true,
    jsonb_build_object(
        'is_premium_enabled', true,
        'maintenance_mode', false,
        'maintenance_message', 'Premium practice systems are currently undergoing scheduled maintenance. Daily Mocks remain active.',
        'emergency_disable_reason', null
    )
)
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO public.premium_system_configs (config_domain, config_key, is_enabled, config_value)
VALUES (
    'GENERATOR_POLICY',
    'DEFAULT_GENERATOR_POLICY',
    true,
    jsonb_build_object(
        'dynamic_test_ttl_hours', 48,
        'min_pool_multiplier', 3,
        'max_weak_area_ratio', 0.70,
        'min_syllabus_ratio', 0.30,
        'max_active_dynamic_tests_per_user', 5
    )
)
ON CONFLICT (config_key) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3. admin_audit_logs (037 columns) — append-only
--    service_role: SELECT + INSERT only (no UPDATE/DELETE/TRUNCATE privilege);
--    admins (app_metadata) read; everyone else nothing.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT NOT NULL,
    action_type TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs (target_entity, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs (action_type, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;

DROP POLICY IF EXISTS "admin_audit_logs_admin_read" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_logs_admin_read"
    ON public.admin_audit_logs
    FOR SELECT
    TO authenticated
    USING (public.fn_jwt_is_admin_or_staff());

CREATE OR REPLACE FUNCTION public.fn_prevent_admin_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: admin_audit_logs is append-only (% blocked)', TG_OP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_prevent_admin_audit_log_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_admin_audit_log_mutation ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_admin_audit_log_mutation
    BEFORE UPDATE OR DELETE ON public.admin_audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_admin_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_prevent_admin_audit_log_truncate ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_admin_audit_log_truncate
    BEFORE TRUNCATE ON public.admin_audit_logs
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_prevent_admin_audit_log_mutation();


-- -----------------------------------------------------------------------------
-- 4. MISTAKE-VAULT LINEAGE & ERRATA (052, rewritten)
--    Differences from 052: no GRANT ALL to authenticated on mistake tables; the 8-arg
--    fn_record_mistake_occurrence (030) is replaced, not overloaded; all three RPCs are
--    service_role-only with internal caller checks; errata revocation counts accumulate.
--    Existing rows: only the NEW columns are populated — occurrence_status = 'ACTIVE'
--    (column default) for existing user_mistake_occurrences rows; all other new columns NULL.
--    user_mistake_vault rows are not touched by this migration.
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_mistake_occurrences
    ADD COLUMN IF NOT EXISTS question_version_id UUID REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS attempt_answer_id UUID,
    ADD COLUMN IF NOT EXISTS occurrence_status TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_umo_occurrence_status') THEN
        ALTER TABLE public.user_mistake_occurrences
            ADD CONSTRAINT chk_umo_occurrence_status
            CHECK (occurrence_status IN ('ACTIVE', 'REVOKED_ERRATA', 'REVOKED_VOID', 'SUPERSEDED'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_umo_qv ON public.user_mistake_occurrences (question_version_id);
CREATE INDEX IF NOT EXISTS idx_umo_attempt_answer ON public.user_mistake_occurrences (attempt_answer_id);
CREATE INDEX IF NOT EXISTS idx_umo_status ON public.user_mistake_occurrences (user_id, occurrence_status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_umo_attempt_answer
    ON public.user_mistake_occurrences (attempt_answer_id)
    WHERE attempt_answer_id IS NOT NULL;

-- Replace (not overload) the 030 signature so named-argument calls stay unambiguous.
DROP FUNCTION IF EXISTS public.fn_record_mistake_occurrence(uuid, uuid, text, uuid, uuid, integer, text, integer);

CREATE OR REPLACE FUNCTION public.fn_record_mistake_occurrence(
    p_user_id UUID,
    p_question_id UUID,
    p_source_context TEXT,
    p_source_reference_id UUID DEFAULT NULL,
    p_selected_option_id UUID DEFAULT NULL,
    p_response_time_seconds INTEGER DEFAULT NULL,
    p_cognitive_type_id TEXT DEFAULT 'UNCLASSIFIED',
    p_confidence_pct INTEGER DEFAULT 50,
    p_question_version_id UUID DEFAULT NULL,
    p_attempt_answer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_vault_id UUID;
    v_topic_id UUID;
    v_subject_id UUID;
    v_status TEXT;
    v_target_version_id UUID := p_question_version_id;
    v_occurrence_id UUID;
BEGIN
    -- Caller must be the target user, an admin/staff (app_metadata), or the service role (no JWT user).
    IF v_caller_id IS NOT NULL AND v_caller_id <> p_user_id AND NOT public.fn_jwt_is_admin_or_staff() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    -- Idempotency: one occurrence per attempt answer.
    IF p_attempt_answer_id IS NOT NULL THEN
        SELECT id, vault_id INTO v_occurrence_id, v_vault_id
        FROM public.user_mistake_occurrences
        WHERE attempt_answer_id = p_attempt_answer_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'vault_id', v_vault_id, 'occurrence_id', v_occurrence_id,
                                      'question_id', p_question_id, 'idempotent_replay', true);
        END IF;
    END IF;

    SELECT q.canonical_topic_id, t.subject_id INTO v_topic_id, v_subject_id
    FROM public.questions q
    LEFT JOIN public.topics t ON t.id = q.canonical_topic_id
    WHERE q.id = p_question_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Question not found');
    END IF;

    -- Version provenance: explicit version, else the current PUBLISHED version (QF-1 invariant).
    IF v_target_version_id IS NULL THEN
        SELECT id INTO v_target_version_id
        FROM public.question_versions
        WHERE question_id = p_question_id AND is_current = true AND lifecycle_status = 'PUBLISHED'
        LIMIT 1;
    END IF;

    SELECT id, lifecycle_status INTO v_vault_id, v_status
    FROM public.user_mistake_vault
    WHERE user_id = p_user_id AND question_id = p_question_id
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = total_mistakes_count + 1,
            consecutive_correct_in_remediation = 0,
            lifecycle_status = CASE WHEN lifecycle_status = 'MASTERED' THEN 'REVISITING' ELSE lifecycle_status END,
            primary_cognitive_type_id = CASE WHEN p_cognitive_type_id <> 'UNCLASSIFIED' THEN p_cognitive_type_id ELSE primary_cognitive_type_id END,
            last_mistake_at = now(),
            updated_at = now()
        WHERE id = v_vault_id;
    ELSE
        INSERT INTO public.user_mistake_vault (
            user_id, question_id, topic_id, subject_id,
            total_mistakes_count, consecutive_correct_in_remediation,
            lifecycle_status, primary_cognitive_type_id, first_mistake_at, last_mistake_at
        ) VALUES (
            p_user_id, p_question_id, v_topic_id, v_subject_id,
            1, 0, 'UNRESOLVED', COALESCE(p_cognitive_type_id, 'UNCLASSIFIED'), now(), now()
        ) RETURNING id INTO v_vault_id;
    END IF;

    INSERT INTO public.user_mistake_occurrences (
        vault_id, user_id, question_id, question_version_id, attempt_answer_id,
        source_context, source_reference_id, selected_option_id, response_time_seconds,
        inferred_cognitive_type_id, heuristic_confidence_pct, occurrence_status, occurred_at
    ) VALUES (
        v_vault_id, p_user_id, p_question_id, v_target_version_id, p_attempt_answer_id,
        p_source_context, p_source_reference_id, p_selected_option_id, p_response_time_seconds,
        COALESCE(p_cognitive_type_id, 'UNCLASSIFIED'),
        GREATEST(0, LEAST(100, COALESCE(p_confidence_pct, 50))), 'ACTIVE', now()
    ) RETURNING id INTO v_occurrence_id;

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', v_vault_id,
        'occurrence_id', v_occurrence_id,
        'question_id', p_question_id,
        'question_version_id', v_target_version_id,
        'status', CASE WHEN v_status = 'MASTERED' THEN 'REVISITING' ELSE COALESCE(v_status, 'UNRESOLVED') END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_recompute_mistake_profile(
    p_user_id UUID,
    p_question_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_active_count INTEGER;
    v_latest TIMESTAMPTZ;
    v_earliest TIMESTAMPTZ;
    v_vault_id UUID;
    v_current_status TEXT;
BEGIN
    IF v_caller_id IS NOT NULL AND NOT public.fn_jwt_is_admin_or_staff() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Administrative privileges required');
    END IF;

    SELECT id, lifecycle_status INTO v_vault_id, v_current_status
    FROM public.user_mistake_vault
    WHERE user_id = p_user_id AND question_id = p_question_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mistake vault profile not found');
    END IF;

    SELECT count(*), max(occurred_at), min(occurred_at)
    INTO v_active_count, v_latest, v_earliest
    FROM public.user_mistake_occurrences
    WHERE user_id = p_user_id AND question_id = p_question_id AND occurrence_status = 'ACTIVE';

    IF v_active_count = 0 THEN
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = 1,  -- CHECK (total_mistakes_count >= 1); profile neutralized via MASTERED
            consecutive_correct_in_remediation = 2,
            lifecycle_status = 'MASTERED',
            mastered_at = now(),
            updated_at = now()
        WHERE id = v_vault_id;
    ELSE
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = v_active_count,
            first_mistake_at = COALESCE(v_earliest, first_mistake_at),
            last_mistake_at = COALESCE(v_latest, last_mistake_at),
            updated_at = now()
        WHERE id = v_vault_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', v_vault_id,
        'active_mistakes_count', v_active_count,
        'lifecycle_status', CASE WHEN v_active_count = 0 THEN 'MASTERED' ELSE v_current_status END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_revoke_mistakes_by_errata(
    p_question_version_id UUID,
    p_corrected_option_id UUID,
    p_reason TEXT,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_revoked_total INTEGER := 0;
    v_rows INTEGER;
    v_user_rec RECORD;
BEGIN
    IF v_caller_id IS NOT NULL AND NOT public.fn_jwt_is_admin_or_staff() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Administrative privileges required');
    END IF;

    IF p_question_version_id IS NULL OR p_corrected_option_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid question version or corrected option ID');
    END IF;

    FOR v_user_rec IN (
        SELECT DISTINCT user_id, question_id
        FROM public.user_mistake_occurrences
        WHERE question_version_id = p_question_version_id
          AND selected_option_id = p_corrected_option_id
          AND occurrence_status = 'ACTIVE'
    )
    LOOP
        UPDATE public.user_mistake_occurrences
        SET occurrence_status = 'REVOKED_ERRATA',
            revoked_at = now(),
            revocation_reason = COALESCE(p_reason, 'Authoritative errata answer key correction')
        WHERE user_id = v_user_rec.user_id
          AND question_version_id = p_question_version_id
          AND selected_option_id = p_corrected_option_id
          AND occurrence_status = 'ACTIVE';
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_revoked_total := v_revoked_total + v_rows;

        PERFORM public.fn_recompute_mistake_profile(v_user_rec.user_id, v_user_rec.question_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'question_version_id', p_question_version_id,
        'corrected_option_id', p_corrected_option_id,
        'revoked_occurrences_count', v_revoked_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_record_mistake_occurrence(uuid, uuid, text, uuid, uuid, integer, text, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_recompute_mistake_profile(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_revoke_mistakes_by_errata(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(uuid, uuid, text, uuid, uuid, integer, text, integer, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_recompute_mistake_profile(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_revoke_mistakes_by_errata(uuid, uuid, text, uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- 5. ACTIVE-DAILY-ATTEMPT GUARD (033, rewritten)
-- 5a. D6 data fix: within each duplicate group of in-progress attempts for the same
--     (user, mock test, IST day), keep the NEWEST and mark the older ones 'abandoned'
--     (an existing test_attempts_status_check value; excluded from the index below and
--     not counted as a submission by the trigger). DRIFT-1b found exactly one group
--     (4 attempts → 3 abandoned). Aborts if more rows would be touched than expected.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_to_abandon INTEGER;
BEGIN
    SELECT count(*) INTO v_to_abandon
    FROM (
        SELECT id, row_number() OVER (
                   PARTITION BY user_id, mock_test_id, ((started_at AT TIME ZONE 'Asia/Kolkata')::date)
                   ORDER BY started_at DESC, id DESC) AS rn
        FROM public.test_attempts
        WHERE status = 'in_progress' AND submitted_at IS NULL
    ) ranked
    WHERE rn > 1;

    IF v_to_abandon > 3 THEN
        RAISE EXCEPTION 'D6_UNEXPECTED_DUPLICATES: % attempts would be abandoned (expected <= 3). Re-run DRIFT-1b analysis.', v_to_abandon;
    END IF;

    UPDATE public.test_attempts t
    SET status = 'abandoned',
        updated_at = now()
    FROM (
        SELECT id, row_number() OVER (
                   PARTITION BY user_id, mock_test_id, ((started_at AT TIME ZONE 'Asia/Kolkata')::date)
                   ORDER BY started_at DESC, id DESC) AS rn
        FROM public.test_attempts
        WHERE status = 'in_progress' AND submitted_at IS NULL
    ) ranked
    WHERE t.id = ranked.id AND ranked.rn > 1;
END $$;

-- 5b. At most one in-progress attempt per (user, mock test, IST day).
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_attempts_single_active_daily
    ON public.test_attempts (user_id, mock_test_id, ((started_at AT TIME ZONE 'Asia/Kolkata')::date))
    WHERE status = 'in_progress' AND submitted_at IS NULL;

-- 5c. Lifecycle trigger (033 rules, matching AssessmentService.startOrResumeAttempt):
--     recurring daily mocks → one attempt per IST occurrence; other mocks → one attempt ever;
--     at most one active attempt. Changes vs 033: pinned search_path via function attribute
--     (instead of SET LOCAL), statuses aligned with test_attempts_status_check.
CREATE OR REPLACE FUNCTION public.trg_enforce_mock_attempt_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_daily_recurring BOOLEAN := false;
    v_attempt_date DATE;
    v_submitted_count INTEGER := 0;
    v_active_count INTEGER := 0;
BEGIN
    IF NEW.mock_test_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_attempt_date := (COALESCE(NEW.started_at, now()) AT TIME ZONE 'Asia/Kolkata')::date;

    SELECT EXISTS (
        SELECT 1
        FROM public.mock_tests mt
        JOIN public.mock_templates tpl ON tpl.id = mt.template_id
        WHERE mt.id = NEW.mock_test_id
          AND (
              tpl.test_type IN ('daily', 'daily_sectional', 'sectional')
              OR tpl.slug LIKE '%-daily-%' OR tpl.slug LIKE '%-daily'
              OR mt.slug LIKE '%-daily-%' OR mt.slug LIKE '%-daily'
          )
    ) INTO v_is_daily_recurring;

    IF v_is_daily_recurring THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || ':' || NEW.mock_test_id::text || ':' || v_attempt_date::text, 0));

        SELECT count(*) INTO v_submitted_count
        FROM public.test_attempts
        WHERE user_id = NEW.user_id
          AND mock_test_id = NEW.mock_test_id
          AND (started_at AT TIME ZONE 'Asia/Kolkata')::date = v_attempt_date
          AND (submitted_at IS NOT NULL OR status IN ('submitted', 'auto_submitted'));
        IF v_submitted_count > 0 THEN
            RAISE EXCEPTION 'MOCK_OCCURRENCE_ALREADY_SUBMITTED: an attempt for this scheduled occurrence (%, IST) was already submitted', v_attempt_date
                USING ERRCODE = '23505';
        END IF;

        IF NEW.status = 'in_progress' AND NEW.submitted_at IS NULL THEN
            SELECT count(*) INTO v_active_count
            FROM public.test_attempts
            WHERE user_id = NEW.user_id
              AND mock_test_id = NEW.mock_test_id
              AND (started_at AT TIME ZONE 'Asia/Kolkata')::date = v_attempt_date
              AND status = 'in_progress' AND submitted_at IS NULL;
            IF v_active_count > 0 THEN
                RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS: an in-progress attempt already exists for this occurrence (%, IST)', v_attempt_date
                    USING ERRCODE = '23505';
            END IF;
        END IF;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text || ':' || NEW.mock_test_id::text, 0));

        SELECT count(*) INTO v_submitted_count
        FROM public.test_attempts
        WHERE user_id = NEW.user_id
          AND mock_test_id = NEW.mock_test_id
          AND (submitted_at IS NOT NULL OR status IN ('submitted', 'auto_submitted'));
        IF v_submitted_count > 0 THEN
            RAISE EXCEPTION 'MOCK_ALREADY_SUBMITTED: this mock test was already submitted'
                USING ERRCODE = '23505';
        END IF;

        IF NEW.status = 'in_progress' AND NEW.submitted_at IS NULL THEN
            SELECT count(*) INTO v_active_count
            FROM public.test_attempts
            WHERE user_id = NEW.user_id
              AND mock_test_id = NEW.mock_test_id
              AND status = 'in_progress' AND submitted_at IS NULL;
            IF v_active_count > 0 THEN
                RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS: an in-progress attempt already exists for this mock test'
                    USING ERRCODE = '23505';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_enforce_mock_attempt_lifecycle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_test_attempts_lifecycle_check ON public.test_attempts;
CREATE TRIGGER trg_test_attempts_lifecycle_check
    BEFORE INSERT ON public.test_attempts
    FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_mock_attempt_lifecycle();

-- End of 065.
