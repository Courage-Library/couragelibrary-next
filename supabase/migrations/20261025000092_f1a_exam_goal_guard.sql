-- =====================================================================================================================
-- 092 F1-a — exam goal guard (NOT APPLIED until the architect's "go"; rollback: docs/database/rollback/092_rollback.sql)
--
-- Finding (F1-a investigation, 2026-10-25): students write public.user_exam_goals DIRECTLY (authenticated has
-- INSERT/UPDATE/DELETE; policy "Users can manage own exam goals" = own rows only). Nothing checks that a goal's cycle
-- belongs to its exam, that the exam is open, or how many goals are active. exam_cycles is already read-only for
-- clients (SELECT grant only, no write policy) — a student can never create a canonical cycle row.
--
-- This migration, for EVERY write path (table grant, app actions, fn_save_onboarding):
--   1. a goal must point at a cycle OF ITS OWN exam (checked on insert and whenever exam / cycle change);
--   2. activating a goal needs an ACTIVE exam and an EXISTING cycle in status active / upcoming — never creates one;
--   3. at most 3 active goals per user (same rule as onboarding), serialised per user (advisory xact lock).
-- The guard is SECURITY INVOKER (no new SECURITY DEFINER function; #54 ratchet unchanged). Re-saving the same goal is
-- idempotent: the count excludes the row's own (exam, cycle), so onboarding re-runs and ON CONFLICT upserts pass.
-- Errors are fixed codes (GOAL_CYCLE_MISMATCH, GOAL_EXAM_NOT_OPEN, GOALS_LIMIT; SQLSTATE 23514) — no data in messages.
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction (a COMMIT
-- inside the file would end that transaction early — F1-a incident, 2026-10-25).
-- =====================================================================================================================

-- 0. pre-check: existing rows must already satisfy the rules (the table is empty on 2026-10-25; abort otherwise)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.user_exam_goals g
                WHERE NOT EXISTS (SELECT 1 FROM public.exam_cycles c WHERE c.id = g.exam_cycle_id AND c.exam_id = g.exam_id)) THEN
        RAISE EXCEPTION '092 PRECHECK: a goal points at a cycle of another exam';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_exam_goals WHERE is_active GROUP BY user_id HAVING count(*) > 3) THEN
        RAISE EXCEPTION '092 PRECHECK: a user has more than 3 active goals';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_user_exam_goals_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_active integer;
BEGIN
    -- 1. the cycle belongs to the goal's exam (insert, or exam / cycle changed)
    IF TG_OP = 'INSERT' OR OLD.exam_id <> NEW.exam_id OR OLD.exam_cycle_id <> NEW.exam_cycle_id THEN
        IF NOT EXISTS (SELECT 1 FROM public.exam_cycles c WHERE c.id = NEW.exam_cycle_id AND c.exam_id = NEW.exam_id) THEN
            RAISE EXCEPTION 'GOAL_CYCLE_MISMATCH' USING ERRCODE = '23514';
        END IF;
    END IF;

    -- 2 + 3. activating (new active row, false → true, or an active row moved to another user / exam / cycle)
    IF NEW.is_active AND (TG_OP = 'INSERT' OR NOT OLD.is_active OR OLD.user_id <> NEW.user_id
                          OR OLD.exam_id <> NEW.exam_id OR OLD.exam_cycle_id <> NEW.exam_cycle_id) THEN
        IF NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = NEW.exam_id AND e.is_active)
           OR NOT EXISTS (SELECT 1 FROM public.exam_cycles c WHERE c.id = NEW.exam_cycle_id AND c.status IN ('active', 'upcoming')) THEN
            RAISE EXCEPTION 'GOAL_EXAM_NOT_OPEN' USING ERRCODE = '23514';
        END IF;
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user_exam_goals:' || NEW.user_id::text, 0));
        SELECT count(*) INTO v_active
          FROM public.user_exam_goals g
         WHERE g.user_id = NEW.user_id
           AND g.is_active
           AND NOT (g.exam_id = NEW.exam_id AND g.exam_cycle_id = NEW.exam_cycle_id);
        IF v_active >= 3 THEN
            RAISE EXCEPTION 'GOALS_LIMIT' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_user_exam_goals_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_exam_goals_guard ON public.user_exam_goals;
CREATE TRIGGER trg_user_exam_goals_guard
    BEFORE INSERT OR UPDATE ON public.user_exam_goals
    FOR EACH ROW EXECUTE FUNCTION public.fn_user_exam_goals_guard();

-- exam_cycles stays canonical / admin-only: state the (already effective) client write ban explicitly
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exam_cycles FROM anon, authenticated;
