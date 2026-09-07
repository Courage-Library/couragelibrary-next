-- ============================================================================
-- COURAGE LIBRARY — PHASE 3R: MOCK ATTEMPT OCCURRENCE UNIQUENESS & LIFECYCLE HARDENING
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Partial Unique Index: Exactly 1 in-progress attempt per (user_id, mock_test_id, occurrence date)
-- Accommodates recurring weekly daily mocks while guaranteeing at the database level that no candidate
-- can have duplicate active in-progress attempts for the same scheduled calendar occurrence.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_attempts_single_active_daily
    ON public.test_attempts (user_id, mock_test_id, ((started_at AT TIME ZONE 'Asia/Kolkata')::DATE))
    WHERE status = 'in_progress' AND submitted_at IS NULL;

-- 2. Database-level Lifecycle Invariant Enforcement Trigger
-- Enforces:
--   a) Recurring Daily Mocks: ONE ATTEMPT PER SCHEDULED OCCURRENCE (IST calendar date).
--      Allows Week 1 Monday (1 attempt), Week 2 Monday (1 attempt), etc.
--      Within the same occurrence: Attempt #1 allowed, Attempt #2 rejected.
--   b) Standard / One-Time Mocks: ONE ATTEMPT EVER.
--   c) Transaction-level 64-bit advisory locking with hashtextextended serializes competing inserts.
--   d) Hardened with SET LOCAL search_path = public, pg_temp; (SECURITY DEFINER protection).

CREATE OR REPLACE FUNCTION public.trg_enforce_mock_attempt_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    v_is_daily_recurring BOOLEAN := false;
    v_current_attempt_date DATE;
    v_submitted_count INT := 0;
    v_active_count INT := 0;
    v_advisory_key BIGINT;
BEGIN
    -- SECURITY DEFINER Hardening: Lock search_path to public and pg_temp
    SET LOCAL search_path = public, pg_temp;

    -- Calculate IST calendar date of the attempt
    v_current_attempt_date := (COALESCE(NEW.started_at, now()) AT TIME ZONE 'Asia/Kolkata')::DATE;

    -- Determine if target mock test belongs to a recurring daily template
    SELECT EXISTS (
        SELECT 1 
        FROM public.mock_tests mt
        JOIN public.mock_templates tpl ON mt.template_id = tpl.id
        WHERE mt.id = NEW.mock_test_id
          AND (
              tpl.test_type IN ('daily', 'daily_sectional', 'sectional')
              OR tpl.slug LIKE '%-daily-%'
              OR tpl.slug LIKE '%-daily'
              OR mt.slug LIKE '%-daily-%'
              OR mt.slug LIKE '%-daily'
          )
    ) INTO v_is_daily_recurring;

    -- 64-bit advisory lock key to avoid 32-bit hashtext collisions
    IF v_is_daily_recurring THEN
        v_advisory_key := hashtextextended(NEW.user_id::text || ':' || NEW.mock_test_id::text || ':' || v_current_attempt_date::text, 0);
    ELSE
        v_advisory_key := hashtextextended(NEW.user_id::text || ':' || NEW.mock_test_id::text, 0);
    END IF;

    -- Acquire transaction-level advisory lock
    PERFORM pg_advisory_xact_lock(v_advisory_key);

    IF v_is_daily_recurring THEN
        -- ====================================================================
        -- RECURRING DAILY MOCK INVARIANTS (BOUNDED BY IST CALENDAR OCCURRENCE)
        -- ====================================================================

        -- Rule 1: ONE ATTEMPT PER OCCURRENCE
        -- Reject if a submitted/completed attempt already exists for THIS occurrence date (IST)
        SELECT COUNT(*) INTO v_submitted_count
        FROM public.test_attempts
        WHERE user_id = NEW.user_id
          AND mock_test_id = NEW.mock_test_id
          AND (started_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_current_attempt_date
          AND (submitted_at IS NOT NULL OR status IN ('submitted', 'completed', 'evaluated', 'auto_submitted'));

        IF v_submitted_count > 0 THEN
            RAISE EXCEPTION 'MOCK_OCCURRENCE_ALREADY_SUBMITTED: Candidate % has already submitted an attempt for scheduled mock % on % (IST)',
                NEW.user_id, NEW.mock_test_id, v_current_attempt_date
                USING ERRCODE = '23505'; -- unique_violation
        END IF;

        -- Rule 2: SINGLE ACTIVE ATTEMPT PER OCCURRENCE
        IF NEW.status = 'in_progress' AND NEW.submitted_at IS NULL THEN
            SELECT COUNT(*) INTO v_active_count
            FROM public.test_attempts
            WHERE user_id = NEW.user_id
              AND mock_test_id = NEW.mock_test_id
              AND (started_at AT TIME ZONE 'Asia/Kolkata')::DATE = v_current_attempt_date
              AND status = 'in_progress'
              AND submitted_at IS NULL;

            IF v_active_count > 0 THEN
                RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS: An in-progress attempt already exists for candidate % on mock % for % (IST)',
                    NEW.user_id, NEW.mock_test_id, v_current_attempt_date
                    USING ERRCODE = '23505'; -- unique_violation
            END IF;
        END IF;

    ELSE
        -- ====================================================================
        -- ONE-TIME / NON-RECURRING MOCK INVARIANTS (LIFETIME BOUNDARY)
        -- ====================================================================

        -- Rule 1: ONE ATTEMPT EVER
        SELECT COUNT(*) INTO v_submitted_count
        FROM public.test_attempts
        WHERE user_id = NEW.user_id
          AND mock_test_id = NEW.mock_test_id
          AND (submitted_at IS NOT NULL OR status IN ('submitted', 'completed', 'evaluated', 'auto_submitted'));

        IF v_submitted_count > 0 THEN
            RAISE EXCEPTION 'MOCK_ALREADY_SUBMITTED: Candidate % has already submitted an attempt for mock test %',
                NEW.user_id, NEW.mock_test_id
                USING ERRCODE = '23505'; -- unique_violation
        END IF;

        -- Rule 2: SINGLE ACTIVE ATTEMPT
        IF NEW.status = 'in_progress' AND NEW.submitted_at IS NULL THEN
            SELECT COUNT(*) INTO v_active_count
            FROM public.test_attempts
            WHERE user_id = NEW.user_id
              AND mock_test_id = NEW.mock_test_id
              AND status = 'in_progress'
              AND submitted_at IS NULL;

            IF v_active_count > 0 THEN
                RAISE EXCEPTION 'ACTIVE_ATTEMPT_EXISTS: An in-progress attempt already exists for candidate % on mock test %',
                    NEW.user_id, NEW.mock_test_id
                    USING ERRCODE = '23505'; -- unique_violation
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on public.test_attempts
DROP TRIGGER IF EXISTS trg_test_attempts_lifecycle_check ON public.test_attempts;
CREATE TRIGGER trg_test_attempts_lifecycle_check
    BEFORE INSERT ON public.test_attempts
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_enforce_mock_attempt_lifecycle();

-- Revoke default public execution, grant only to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.trg_enforce_mock_attempt_lifecycle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_enforce_mock_attempt_lifecycle() TO authenticated, service_role, postgres;
