-- Rollback for 20261025000103_attempt_answers_question_in_mock.sql: restores the 099 answer policies (attempt own +
-- in progress + deadline, without the question-in-mock check). Run as ONE transaction by the operator.
BEGIN;

DROP POLICY IF EXISTS "Users can insert own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    );
DROP POLICY IF EXISTS "Users can update own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    );

COMMIT;
