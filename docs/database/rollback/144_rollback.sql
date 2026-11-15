-- =====================================================================================================================
-- Rollback for 144 PAY-1 B2b (supabase/migrations/20261116000144_pay1_b2b_reserved_questions.sql).
-- ROLLBACK-CHAIN: run first: none
-- Drops fn_reserved_question_ids. Roll back the app code that calls it first (practice would fail closed: no questions
-- delivered). Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
DROP FUNCTION IF EXISTS public.fn_reserved_question_ids();
