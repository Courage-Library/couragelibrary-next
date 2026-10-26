-- Rollback for 20261026000110_ml_helpers_service_role.sql. Run as ONE transaction by the operator.
-- WARNING: restores the 095 state in which every service-role vault INSERT / UPDATE fails (no mistakes recorded).
BEGIN;

REVOKE EXECUTE ON FUNCTION public.fn_ml_ist_today() FROM service_role;
REVOKE EXECUTE ON FUNCTION public.fn_ml_day_start(date) FROM service_role;

COMMIT;
