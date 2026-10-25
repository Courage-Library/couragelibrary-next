-- Rollback for 20261025000092_f1a_exam_goal_guard.sql (F1-a exam goal guard).
-- Removes the trigger and its INVOKER function. The exam_cycles REVOKE is not undone: clients never had write grants
-- on exam_cycles (SELECT only, verified 2026-10-25), so there is nothing to restore. No data is changed.
BEGIN;
DROP TRIGGER IF EXISTS trg_user_exam_goals_guard ON public.user_exam_goals;
DROP FUNCTION IF EXISTS public.fn_user_exam_goals_guard();
COMMIT;
