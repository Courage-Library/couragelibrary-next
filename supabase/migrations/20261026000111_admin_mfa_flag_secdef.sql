-- =====================================================================================================================
-- 111 P6-MFA-FLAG — security_settings is no longer client-readable (architect ruling on RLS P-6, 2026-10-26)
-- Architect CONDITIONAL GO (chunked smoke AS the real roles + dry-run must ALL pass). Rollback: docs/database/rollback/111_rollback.sql
-- No BEGIN / COMMIT: the runner owns the transaction.
--
-- 098 let anon / authenticated SELECT public.security_settings (policy USING (true)) because the staff predicates run as
-- the caller. The P-6 permanent rule forbids a blanket client read outside the allow-list, and the architect ruled NOT to
-- allow-list it. Instead:
--   fn_admin_mfa_required() — STABLE SECURITY DEFINER, search_path '', returns ONLY the one boolean flag (false when the
--     row is missing). EXECUTE for authenticated / service_role — the roles that can run the predicates (anon has never
--     held EXECUTE on fn_jwt_is_admin_or_staff / fn_jwt_is_admin, so it needs nothing here; least privilege).
--   fn_jwt_is_admin_or_staff() and fn_jwt_is_admin() read the flag through it (same logic, same signatures).
--   REVOKE SELECT on security_settings from anon / authenticated; DROP the client read policy. The service role keeps
--     SELECT / UPDATE (admin_mfa_required, updated_at) as granted by 098.
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_admin_mfa_required()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE((SELECT s.admin_mfa_required FROM public.security_settings s WHERE s.id), false);
$$;
REVOKE ALL ON FUNCTION public.fn_admin_mfa_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_admin_mfa_required() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_admin_mfa_required() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin_or_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'staff')
       AND (NOT public.fn_admin_mfa_required()
            OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2');
$function$;

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
       AND (NOT public.fn_admin_mfa_required()
            OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2');
$function$;

DROP POLICY IF EXISTS p_security_settings_read ON public.security_settings;
REVOKE SELECT ON public.security_settings FROM anon, authenticated;
