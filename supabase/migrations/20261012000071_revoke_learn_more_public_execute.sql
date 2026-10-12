-- =============================================================================
-- COURAGE LIBRARY — GAP2-1b: D1 SECURITY FIX
-- Migration: 20261012000071_revoke_learn_more_public_execute.sql
--
-- fn_resolve_learn_more(p_question_id, p_user_id) is SECURITY DEFINER and trusts a
-- caller-supplied p_user_id, so any anon/authenticated caller could read another
-- user's PRO / course entitlement. It has no callers in app code; it will be
-- rewritten in GAP2-2. Until then it is service_role only.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_resolve_learn_more(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolve_learn_more(uuid, uuid) TO service_role;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.fn_resolve_learn_more(uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_resolve_learn_more(uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'D1_REVOKE_FAILED: anon/authenticated can still execute fn_resolve_learn_more';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.fn_resolve_learn_more(uuid, uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'D1_REVOKE_FAILED: service_role lost EXECUTE on fn_resolve_learn_more';
    END IF;
END $$;

-- End of 071.
