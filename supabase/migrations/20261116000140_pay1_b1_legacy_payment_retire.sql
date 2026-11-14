-- =====================================================================================================================
-- 140 PAY-1 B1 (PAY-LEGACY-RETIRE-1): drop the three legacy payment functions.
--   fn_create_payment_order        legacy client order RPC; client EXECUTE revoked by 113; no caller
--   fn_process_payment_webhook     legacy webhook RPC (106); no caller (F9 webhook uses the 114 functions)
--   fn_verify_and_fulfill_payment  legacy fulfil (064/106); no caller; writes user_entitlements columns that do not exist
-- All three: SECURITY DEFINER, EXECUTE only for postgres / service_role, nothing depends on them, no other function calls
-- them (checked read-only on production 2026-11-14). The F9 path (migrations 113/114) is untouched.
-- Rollback: docs/database/rollback/140_rollback.sql recreates them byte-exactly (pg_get_functiondef) with the same grants.
-- No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================
DROP FUNCTION IF EXISTS public.fn_create_payment_order(p_order_type text, p_plan_id uuid, p_course_id uuid, p_coupon_code text, p_gateway text, p_idempotency_key text);
DROP FUNCTION IF EXISTS public.fn_process_payment_webhook(p_gateway text, p_gateway_event_id text, p_event_type text, p_payload jsonb, p_signature_verified boolean);
DROP FUNCTION IF EXISTS public.fn_verify_and_fulfill_payment(p_order_id uuid, p_gateway_payment_id text, p_gateway_signature text, p_payment_method text, p_amount numeric, p_billing_name text, p_billing_address text, p_billing_state text);
