-- Rollback for 20261025000099_attempt_integrity_and_position.sql.
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- WARNING: restores the pre-099 TABLE-LEVEL client INSERT / UPDATE on test_attempts and attempt_answers (the integrity
-- gap 099 closes) and drops the resume position columns. Only for an emergency; re-apply 099 afterwards.
BEGIN;

DROP POLICY IF EXISTS "Users can insert own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.test_attempts WHERE test_attempts.id = attempt_answers.attempt_id AND test_attempts.user_id = auth.uid() AND test_attempts.status = 'in_progress'));
DROP POLICY IF EXISTS "Users can update own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.test_attempts WHERE test_attempts.id = attempt_answers.attempt_id AND test_attempts.user_id = auth.uid() AND test_attempts.status = 'in_progress'));
CREATE POLICY "Users can create own attempts" ON public.test_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT INSERT, UPDATE ON public.attempt_answers TO authenticated;
GRANT INSERT, UPDATE ON public.test_attempts TO authenticated;

ALTER TABLE public.test_attempts DROP COLUMN IF EXISTS last_question_order, DROP COLUMN IF EXISTS visited_orders;

COMMIT;
