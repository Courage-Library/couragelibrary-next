-- Rollback for 20261026000114_f9_pricing_functions.sql. Run as ONE transaction by the operator (before 113's rollback).
BEGIN;

DROP FUNCTION IF EXISTS public.fn_revoke_library_pro(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_grant_library_pro(uuid, timestamptz, uuid);
DROP FUNCTION IF EXISTS public.fn_refund_pro_payment(text, integer, text);
DROP FUNCTION IF EXISTS public.fn_mark_pro_order_failed(text);
DROP FUNCTION IF EXISTS public.fn_fulfil_pro_order(text, text, integer, text, text);
DROP FUNCTION IF EXISTS public.fn_attach_gateway_order(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_create_pro_order(uuid, text, text);
DROP FUNCTION IF EXISTS public.fn_has_pro(uuid);

COMMIT;
