-- =====================================================================================================================
-- 103 (= "099b", 099-KEYCHECK) — a student's answer must belong to a question of the attempt's own mock
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/103_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- FINDING (rolled-back test as the QA student, 2026-10-25): the 099 answer policies check the attempt (own, in progress,
-- inside the deadline) but not the question. A student could save an answer with a mock_question_id from ANOTHER mock,
-- or move an existing answer onto one (UPDATE of mock_question_id, granted for the PostgREST upsert keys).
-- trg_sanitize_attempt_answer only checks that the mock question exists. Scoring is not affected (submit iterates the
-- attempt's own mock questions; client rows keep is_correct / evaluated_marks NULL), but the row is junk tied to a
-- foreign question.
--
-- FIX: both client policies (INSERT WITH CHECK; UPDATE USING + WITH CHECK) also require the mock question to belong to
-- the attempt's mock. RLS only: the service-role paths (adaptive engine, live tests, submit) are unchanged. Moving an
-- answer between two questions of the SAME attempt stays possible (equivalent to answering that question; scoring reads
-- one row per question of the mock).
-- =====================================================================================================================

DROP POLICY IF EXISTS "Users can insert own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta
              JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
              JOIN public.mock_questions mq ON mq.mock_test_id = ta.mock_test_id AND mq.id = attempt_answers.mock_question_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    );

DROP POLICY IF EXISTS "Users can update own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta
              JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
              JOIN public.mock_questions mq ON mq.mock_test_id = ta.mock_test_id AND mq.id = attempt_answers.mock_question_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.test_attempts ta
              JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
              JOIN public.mock_questions mq ON mq.mock_test_id = ta.mock_test_id AND mq.id = attempt_answers.mock_question_id
             WHERE ta.id = attempt_answers.attempt_id AND ta.user_id = auth.uid() AND ta.status = 'in_progress'
               AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
        )
    );
