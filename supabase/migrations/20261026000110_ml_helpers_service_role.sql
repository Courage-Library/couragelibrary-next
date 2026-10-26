-- =====================================================================================================================
-- 110 ML-TRIGGER-GRANT-1 — mistakes are recorded again (regression from 095, found by the 2026-10-25 nightly)
-- NOT APPLIED until the architect's "go" (suspected data-loss issue). Rollback: docs/database/rollback/110_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- Cause: 095 (F5 Memory Lock) added the trigger trg_umv_ml_schedule (BEFORE INSERT OR UPDATE on user_mistake_vault) whose
-- function fn_ml_vault_schedule (SECURITY INVOKER) calls the helpers fn_ml_ist_today() and fn_ml_day_start(date). 095
-- revoked EXECUTE on those helpers from everyone but the owner, so every vault INSERT / UPDATE made by the service role —
-- MistakeService.recordExamMistakes after a mock submit — fails with 42501 "permission denied for function
-- fn_ml_ist_today", and the app swallows the error: no wrong answer has been recorded since 095 (2026-10-25 ~14:26 UTC;
-- last vault row 10:50 UTC; one submitted attempt since — the CI QA student's).
-- Fix (least privilege): EXECUTE on the two pure date helpers for service_role only. They read no data
-- (IST "today" / start of an IST day). anon / authenticated stay without EXECUTE (authenticated has no vault write grant;
-- fn_memory_lock_answer is SECURITY DEFINER and unaffected). No new SECURITY DEFINER function.
-- =====================================================================================================================

GRANT EXECUTE ON FUNCTION public.fn_ml_ist_today() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ml_day_start(date) TO service_role;
