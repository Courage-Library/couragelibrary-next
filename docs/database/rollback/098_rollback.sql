-- Rollback for 20261025000098_admin_mfa_db.sql (admin MFA in the database).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- Restores fn_jwt_is_admin_or_staff() exactly as before 098 (role check only) and drops the settings table.
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_jwt_is_admin_or_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'staff');
$function$;

DROP TABLE IF EXISTS public.security_settings;

COMMIT;
