-- =====================================================================================================================
-- 142 PAY-1 B2a fix (owner GO 2026-11-15): access_settings is no longer client-readable.
-- 141 gave access_settings a blanket client read policy (USING (true)) so the INVOKER central check could read the
-- paywall switch. The permanent RLS rule P-6 forbids blanket policies on non-allow-listed tables, and the table cannot be
-- allow-listed (P-6b: it carries updated_by). Now:
--   access_settings  read policy dropped; SELECT revoked from anon / authenticated (service_role only, as every write)
--   fn_access_allowed  same rule, now SECURITY DEFINER (it reads the switch itself); still returns only true / false for
--                      the CALLER (auth.uid() comes from the request claims, unchanged under DEFINER); EXECUTE for anon /
--                      authenticated / service_role stays (P-9 SECDEF_PUBLIC_OK, reviewed: a boolean, no data)
-- Nothing reads the policy yet (the switch is off). No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================

DROP POLICY IF EXISTS p_access_settings_read ON public.access_settings;
REVOKE ALL ON public.access_settings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_access_allowed(p_kind text, p_key text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
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
        RETURN false;                     -- anon never holds Pro
    END IF;
    RETURN public.fn_has_pro_self();
END;
$$;

REVOKE ALL ON FUNCTION public.fn_access_allowed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_access_allowed(text, text) TO anon, authenticated, service_role;
