-- =====================================================================================================================
-- 098 AUTH-1 2b-3 — admin MFA in the database: the shared staff predicate requires an AAL2 JWT when switched on
-- Architect GO 2026-10-25 (after 099 closed). Rollback: docs/database/rollback/098_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- 1. public.security_settings — ONE row (id = true): admin_mfa_required (default FALSE → today's behaviour exactly).
--    RLS on; readable by every role (the predicate below runs as the caller; the value is not sensitive); no client
--    write grant — only the service role / an operator changes it (docs/auth/ADMIN_MFA.md: switch it on together with
--    ADMIN_MFA_REQUIRED, after the owner has enrolled an authenticator).
-- 2. fn_jwt_is_admin_or_staff() (used by 46 RLS policies and 4 functions) = role admin / staff AND (flag off OR the
--    JWT's aal claim is 'aal2'). Still SQL, STABLE, NOT security definer (SECDEF ratchet unchanged).
--    Not covered (follow-up MFA-DB-2): 43 policies and 15 functions that read app_metadata.role inline — the app guard
--    (lib/auth/require-admin.ts) protects every admin page / action / route that reaches them.
-- =====================================================================================================================

CREATE TABLE IF NOT EXISTS public.security_settings (
    id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
    admin_mfa_required boolean NOT NULL DEFAULT false,
    updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.security_settings (id, admin_mfa_required) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.security_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.security_settings TO anon, authenticated;
GRANT SELECT, UPDATE (admin_mfa_required, updated_at) ON public.security_settings TO service_role;
DROP POLICY IF EXISTS p_security_settings_read ON public.security_settings;
CREATE POLICY p_security_settings_read ON public.security_settings FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin_or_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'staff')
       AND (NOT COALESCE((SELECT s.admin_mfa_required FROM public.security_settings s WHERE s.id), false)
            OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2');
$function$;
