-- =====================================================================================================================
-- Rollback for 142 PAY-1 B2a fix (supabase/migrations/20261116000142_pay1_b2a_access_settings_private.sql).
-- ROLLBACK-CHAIN: run first: none
-- Restores 141's state: fn_access_allowed SECURITY INVOKER (141 body) and the client read on access_settings (which the
-- RLS gate P-6 flags — roll back only together with 141). Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
CREATE OR REPLACE FUNCTION public.fn_access_allowed(p_kind text, p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
    v_on boolean;
BEGIN
    SELECT paywall_enabled INTO v_on FROM public.access_settings WHERE id;
    IF v_on IS DISTINCT FROM true THEN
        RETURN true;                      -- paywall switch off (or no row): today's behaviour
    END IF;
    IF public.fn_access_tier(p_kind, p_key) = 'FREE' THEN
        RETURN true;
    END IF;
    IF auth.uid() IS NULL THEN
        RETURN false;                     -- anon never holds Pro (fn_has_pro_self is not granted to anon)
    END IF;
    RETURN public.fn_has_pro_self();
END;
$$;
REVOKE ALL ON FUNCTION public.fn_access_allowed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_access_allowed(text, text) TO anon, authenticated, service_role;

GRANT SELECT ON public.access_settings TO anon, authenticated;
DROP POLICY IF EXISTS p_access_settings_read ON public.access_settings;
CREATE POLICY p_access_settings_read ON public.access_settings FOR SELECT TO anon, authenticated USING (true);
