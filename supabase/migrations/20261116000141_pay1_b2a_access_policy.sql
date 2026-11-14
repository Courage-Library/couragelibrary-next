-- =====================================================================================================================
-- 141 PAY-1 B2a: the admin-controlled access policy (design docs/payments/PAY_1_DESIGN.md §7; owner requirement
-- 2026-11-14 "Free vs Pro fully admin-controlled, not hard-coded").
--   access_policies  one row per item (kind + key) → FREE / PRO; key '*' = the default for that kind. No client grant at
--                    all (read through fn_access_tier; written only through the audited service-role functions).
--   access_settings  ONE row: paywall_enabled (default FALSE). While false, everything stays reachable exactly as today
--                    (DEPLOY-BEFORE-ACTIVATE; switched on at the payments cutover, PAY-1 B8).
--   fn_access_tier(kind, key)     the resolved tier: exact → parent (a MOCK_TEST → its MOCK_SERIES) → the kind default →
--                                 'PRO' (fail-closed: unknown kind / item / missing row = PRO). SECURITY DEFINER, STABLE,
--                                 EXECUTE for anon / authenticated (public_ok: it returns only 'FREE' or 'PRO', and it
--                                 must work for visitors and inside RLS whatever the client grants on mock_tests).
--   fn_access_allowed(kind, key)  THE central check: switch off → true; tier FREE → true; else the caller's own Pro.
--                                 INVOKER (usable in RLS and by anon); the only privileged step is fn_has_pro_self().
--   fn_has_pro_self()             the CALLER's Pro (fn_has_pro(auth.uid())); SECURITY DEFINER, authenticated only.
--   fn_access_policy_set / _clear / fn_paywall_set   service_role only; validated; every change audited in
--                                 admin_audit_logs (actor, item, old → new).
--   Seed (owner decision D1 + PREMIUM_CA): FEATURE ADVANCED_ANALYTICS / MISTAKE_VAULT / MEMORY_LOCK / PREMIUM_CA = PRO,
--   FLASHCARDS = FREE; MOCK_TEST '*' and MOCK_SERIES '*' = PRO with an explicit FREE row for every mock that is free
--   today (is_free = true); LESSON / COURSE / TOPIC '*' = FREE (FREE_ALL).
-- Nothing reads these yet except the new admin page: B2b / B3 route every Pro decision through fn_access_allowed.
-- No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================

CREATE TABLE IF NOT EXISTS public.access_policies (
    item_kind  text        NOT NULL CHECK (item_kind IN ('FEATURE', 'MOCK_SERIES', 'MOCK_TEST', 'COURSE', 'LESSON', 'TOPIC')),
    item_key   text        NOT NULL CHECK (item_key = '*' OR item_key ~ '^[A-Za-z0-9_-]{1,64}$'),
    tier       text        NOT NULL CHECK (tier IN ('FREE', 'PRO')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid        NULL,
    PRIMARY KEY (item_kind, item_key)
);
ALTER TABLE public.access_policies ENABLE ROW LEVEL SECURITY;   -- no client policy: clients read it only via fn_access_tier
REVOKE ALL ON public.access_policies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_policies TO service_role;

CREATE TABLE IF NOT EXISTS public.access_settings (
    id              boolean     PRIMARY KEY DEFAULT true CHECK (id),
    paywall_enabled boolean     NOT NULL DEFAULT false,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    updated_by      uuid        NULL
);
ALTER TABLE public.access_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.access_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.access_settings TO anon, authenticated;
GRANT SELECT, UPDATE ON public.access_settings TO service_role;
DROP POLICY IF EXISTS p_access_settings_read ON public.access_settings;
CREATE POLICY p_access_settings_read ON public.access_settings FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.access_settings (id, paywall_enabled) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------ the resolved tier (DEFINER; returns FREE / PRO only)
CREATE OR REPLACE FUNCTION public.fn_access_tier(p_kind text, p_key text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_tier   text;
    v_series uuid;
BEGIN
    IF p_kind IS NULL OR p_key IS NULL THEN
        RETURN 'PRO';
    END IF;
    SELECT tier INTO v_tier FROM public.access_policies WHERE item_kind = p_kind AND item_key = p_key;
    IF v_tier IS NOT NULL THEN
        RETURN v_tier;
    END IF;
    -- parent: a mock test inherits its series' explicit tier
    IF p_kind = 'MOCK_TEST' AND p_key ~ '^[0-9a-fA-F-]{36}$' THEN
        SELECT m.series_id INTO v_series FROM public.mock_tests m WHERE m.id = p_key::uuid;
        IF v_series IS NOT NULL THEN
            SELECT tier INTO v_tier FROM public.access_policies WHERE item_kind = 'MOCK_SERIES' AND item_key = v_series::text;
            IF v_tier IS NOT NULL THEN
                RETURN v_tier;
            END IF;
        END IF;
    END IF;
    SELECT tier INTO v_tier FROM public.access_policies WHERE item_kind = p_kind AND item_key = '*';
    RETURN COALESCE(v_tier, 'PRO'); -- fail-closed: unknown kind / missing default = PRO
END;
$$;

-- ------------------------------------------------------------------ the caller's own Pro (the one privileged step)
CREATE OR REPLACE FUNCTION public.fn_has_pro_self()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE public.fn_has_pro(auth.uid()) END;
$$;

-- ------------------------------------------------------------------ THE central check
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

-- ------------------------------------------------------------------ admin writes (service_role only, audited)
CREATE OR REPLACE FUNCTION public.fn_access_policy_set(p_kind text, p_key text, p_tier text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_old text;
BEGIN
    IF p_kind NOT IN ('FEATURE', 'MOCK_SERIES', 'MOCK_TEST', 'COURSE', 'LESSON', 'TOPIC') OR p_kind IS NULL THEN
        RAISE EXCEPTION 'ACCESS_POLICY: unknown item kind' USING ERRCODE = '22023';
    END IF;
    IF p_key IS NULL OR NOT (p_key = '*' OR p_key ~ '^[A-Za-z0-9_-]{1,64}$') THEN
        RAISE EXCEPTION 'ACCESS_POLICY: invalid item key' USING ERRCODE = '22023';
    END IF;
    IF p_tier IS NULL OR p_tier NOT IN ('FREE', 'PRO') THEN
        RAISE EXCEPTION 'ACCESS_POLICY: tier must be FREE or PRO' USING ERRCODE = '22023';
    END IF;
    IF p_actor_email IS NULL OR length(trim(p_actor_email)) = 0 THEN
        RAISE EXCEPTION 'ACCESS_POLICY: actor required' USING ERRCODE = '22023';
    END IF;
    SELECT tier INTO v_old FROM public.access_policies WHERE item_kind = p_kind AND item_key = p_key FOR UPDATE;
    INSERT INTO public.access_policies (item_kind, item_key, tier, updated_at, updated_by)
    VALUES (p_kind, p_key, p_tier, now(), p_actor_id)
    ON CONFLICT (item_kind, item_key) DO UPDATE SET tier = EXCLUDED.tier, updated_at = now(), updated_by = EXCLUDED.updated_by;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'ACCESS_POLICY_SET', 'access_policies', p_kind || ':' || p_key,
            CASE WHEN v_old IS NULL THEN NULL ELSE jsonb_build_object('tier', v_old) END, jsonb_build_object('tier', p_tier), NULL);
    RETURN jsonb_build_object('kind', p_kind, 'key', p_key, 'old_tier', v_old, 'new_tier', p_tier);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_access_policy_clear(p_kind text, p_key text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_old text;
BEGIN
    IF p_key = '*' THEN
        RAISE EXCEPTION 'ACCESS_POLICY: a kind default cannot be cleared (set it instead)' USING ERRCODE = '22023';
    END IF;
    IF p_actor_email IS NULL OR length(trim(p_actor_email)) = 0 THEN
        RAISE EXCEPTION 'ACCESS_POLICY: actor required' USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.access_policies WHERE item_kind = p_kind AND item_key = p_key RETURNING tier INTO v_old;
    IF v_old IS NULL THEN
        RETURN jsonb_build_object('kind', p_kind, 'key', p_key, 'cleared', false);
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'ACCESS_POLICY_CLEAR', 'access_policies', p_kind || ':' || p_key, jsonb_build_object('tier', v_old), NULL, NULL);
    RETURN jsonb_build_object('kind', p_kind, 'key', p_key, 'cleared', true, 'old_tier', v_old);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_paywall_set(p_enabled boolean, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_old boolean;
BEGIN
    IF p_enabled IS NULL OR p_actor_email IS NULL OR length(trim(p_actor_email)) = 0 THEN
        RAISE EXCEPTION 'ACCESS_POLICY: enabled and actor required' USING ERRCODE = '22023';
    END IF;
    SELECT paywall_enabled INTO v_old FROM public.access_settings WHERE id FOR UPDATE;
    UPDATE public.access_settings SET paywall_enabled = p_enabled, updated_at = now(), updated_by = p_actor_id WHERE id;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'PAYWALL_SET', 'access_settings', 'paywall_enabled',
            jsonb_build_object('paywall_enabled', v_old), jsonb_build_object('paywall_enabled', p_enabled), NULL);
    RETURN jsonb_build_object('old', v_old, 'new', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_access_tier(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_access_allowed(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_has_pro_self() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_access_policy_set(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_access_policy_clear(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_paywall_set(boolean, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_access_tier(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_access_allowed(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_has_pro_self() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_access_policy_set(text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_access_policy_clear(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_paywall_set(boolean, uuid, text) TO service_role;

-- ------------------------------------------------------------------ seed (D1 + PREMIUM_CA); never overwrites a row
INSERT INTO public.access_policies (item_kind, item_key, tier) VALUES
    ('FEATURE', 'ADVANCED_ANALYTICS', 'PRO'),
    ('FEATURE', 'MISTAKE_VAULT', 'PRO'),
    ('FEATURE', 'MEMORY_LOCK', 'PRO'),
    ('FEATURE', 'PREMIUM_CA', 'PRO'),
    ('FEATURE', 'FLASHCARDS', 'FREE'),
    ('MOCK_TEST', '*', 'PRO'),
    ('MOCK_SERIES', '*', 'PRO'),
    ('LESSON', '*', 'FREE'),
    ('COURSE', '*', 'FREE'),
    ('TOPIC', '*', 'FREE')
ON CONFLICT (item_kind, item_key) DO NOTHING;
-- every mock that is free today stays free (explicit rows; the admin can flip them)
INSERT INTO public.access_policies (item_kind, item_key, tier)
SELECT 'MOCK_TEST', m.id::text, 'FREE' FROM public.mock_tests m WHERE m.is_free = true
ON CONFLICT (item_kind, item_key) DO NOTHING;
