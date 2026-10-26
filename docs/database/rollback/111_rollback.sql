-- Rollback for 20261026000111_admin_mfa_flag_secdef.sql: restores the 098 state (client-readable flag; RLS P-6 fails again).
BEGIN;

GRANT SELECT ON public.security_settings TO anon, authenticated;
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

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
       AND (NOT COALESCE((SELECT s.admin_mfa_required FROM public.security_settings s WHERE s.id), false)
            OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2');
$function$;

DROP FUNCTION IF EXISTS public.fn_admin_mfa_required();

COMMIT;
