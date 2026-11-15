-- =====================================================================================================================
-- Rollback for 145 PAY-1 B2b (supabase/migrations/20261116000145_pay1_b2b_public_reads.sql).
-- ROLLBACK-CHAIN: run first: none
-- Drops the five public read functions. Roll back 146 (the client revoke) and the app code that calls them FIRST:
-- without them the landing counts / exam mock list / Hindi claim fall back to their honest "no data" views.
-- Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
DROP FUNCTION IF EXISTS public.fn_public_ca_daily_mock_id(date);
DROP FUNCTION IF EXISTS public.fn_public_mock_shape(uuid);
DROP FUNCTION IF EXISTS public.fn_public_hindi_question_count();
DROP FUNCTION IF EXISTS public.fn_public_mock_counts();
DROP FUNCTION IF EXISTS public.fn_public_exam_mocks(uuid);
