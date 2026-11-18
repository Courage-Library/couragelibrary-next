-- =====================================================================================================================
-- Rollback for 141 PAY-1 B2a (supabase/migrations/20261116000141_pay1_b2a_access_policy.sql).
-- ROLLBACK-CHAIN: run first: 147_rollback.sql
-- Removes the access policy: the six functions, access_settings and access_policies. WARNING: every Free / Pro setting
-- the admin changed after the apply is lost with the table (take a backup first; the ACCESS_POLICY_* / PAYWALL_SET
-- audit rows in admin_audit_logs stay). Only safe while nothing reads the policy yet (B2b / B3 route checks through
-- fn_access_allowed — roll those back first). Run inside ONE transaction (no BEGIN / COMMIT here).
-- ALSO roll back 143 (and 142) FIRST: 143's trigger and guards call the policy. This rollback would still run without
-- them (plpgsql bodies are not dependency-tracked, so the chain probe cannot see it), but every later mock_tests insert
-- and every lesson / practice answer would then fail. Latest first: 143 → 142 → 141.
-- =====================================================================================================================
DROP FUNCTION IF EXISTS public.fn_paywall_set(boolean, uuid, text);
DROP FUNCTION IF EXISTS public.fn_access_policy_clear(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_access_policy_set(text, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_access_allowed(text, text);
DROP FUNCTION IF EXISTS public.fn_has_pro_self();
DROP FUNCTION IF EXISTS public.fn_access_tier(text, text);
DROP TABLE IF EXISTS public.access_settings;
DROP TABLE IF EXISTS public.access_policies;
