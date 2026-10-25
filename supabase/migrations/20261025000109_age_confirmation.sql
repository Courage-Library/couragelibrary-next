-- =====================================================================================================================
-- 109 AGE-18 — owner decision (legal, 2026-10-25): couragelibrary.in is 18+ only. Revised per the architect (one column).
-- Architect CONDITIONAL GO 2026-10-25 (smoke + dry-run must pass). Rollback: docs/database/rollback/109_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- ONE canonical column: user_profiles.adult_confirmed_at (added by 096; the leaderboard / public-profile 18+ checks
-- already read it). No new column, no back-fill.
-- fn_confirm_age(): the client entrypoint for the site-wide 18+ confirmation — auth.uid() only; sets adult_confirmed_at
-- ONCE (coalesce: never overwritten, never cleared). The column stays NOT client-writable (096 grants client UPDATE on
-- an explicit column list without it). SECURITY DEFINER, search_path '', EXECUTE for authenticated only.
-- The gate's fast flag lives in auth app_metadata (adult_confirmed), written ONLY by the server with the service role
-- after this RPC succeeds — never from user_metadata (#60: users can write that).
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_confirm_age()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_at  timestamptz;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    UPDATE public.user_profiles
       SET adult_confirmed_at = coalesce(adult_confirmed_at, pg_catalog.now()),
           updated_at         = pg_catalog.now()
     WHERE id = v_uid
    RETURNING adult_confirmed_at INTO v_at;
    IF v_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NO_PROFILE');
    END IF;
    RETURN jsonb_build_object('success', true, 'code', 'CONFIRMED', 'adult_confirmed_at', v_at);
END
$$;
REVOKE ALL ON FUNCTION public.fn_confirm_age() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_confirm_age() TO authenticated;
