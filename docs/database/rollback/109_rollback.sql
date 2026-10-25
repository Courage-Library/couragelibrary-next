-- Rollback for 20261025000109_age_confirmation.sql. Run as ONE transaction by the operator.
-- Drops fn_confirm_age only. adult_confirmed_at values it set stay (the same self-declared fact 096 records).
-- Turn AGE_GATE_ENABLED off first, otherwise unconfirmed users are sent to /confirm-age and cannot confirm.
BEGIN;

DROP FUNCTION IF EXISTS public.fn_confirm_age();

COMMIT;
