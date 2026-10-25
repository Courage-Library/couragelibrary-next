-- =====================================================================================================================
-- 099 ATTEMPT-INTEGRITY-1 + PLAYER-RESUME-SERVER (Q6 part B)
-- NOT APPLIED until the architect's "go" (suspected security issue reported 2026-10-25). Rollback:
-- docs/database/rollback/099_rollback.sql. No BEGIN / COMMIT here: the runner owns the transaction.
--
-- FINDING: `authenticated` holds TABLE-LEVEL INSERT / UPDATE on public.test_attempts and public.attempt_answers
-- (relacl authenticated=arw). The 2026-08 column REVOKEs (status / submitted_at / time_taken_seconds, is_correct /
-- evaluated_marks …) therefore never took effect — PostgreSQL ignores a column revoke while a table grant exists. With
-- the existing RLS a student could, through PostgREST: move started_at of their own in-progress attempt forward (more
-- exam time — the server computes the deadline from it); insert an attempt with any status / started_at; write
-- is_correct / evaluated_marks on their answers before submit. Every app write to test_attempts uses the service role;
-- students only upsert their answers (saveAnswer) — so narrowing breaks nothing.
--
-- 1. test_attempts: no client INSERT; client UPDATE only (last_activity_at, last_question_order, visited_orders) —
--    RLS (own, in_progress) unchanged.
-- 2. attempt_answers: client INSERT only (attempt_id, mock_question_id, selected_option_key, is_marked_for_review,
--    time_spent_seconds, updated_at); client UPDATE only (selected_option_key, is_marked_for_review, time_spent_seconds,
--    updated_at). INSERT / UPDATE policies also require the server deadline (started_at + duration + 30 s for answers in
--    flight) — the database refuses late answers even when the app check is bypassed.
-- 3. PLAYER-RESUME-SERVER: test_attempts.last_question_order (≥ 1) + visited_orders (≤ 1000 entries) — the resume
--    position comes from the server; localStorage becomes a cache only.
-- =====================================================================================================================

ALTER TABLE public.test_attempts
    ADD COLUMN IF NOT EXISTS last_question_order integer CHECK (last_question_order IS NULL OR last_question_order >= 1),
    ADD COLUMN IF NOT EXISTS visited_orders integer[] CHECK (visited_orders IS NULL OR cardinality(visited_orders) <= 1000);

-- 1 + 3: test_attempts client writes
REVOKE INSERT, UPDATE ON public.test_attempts FROM anon, authenticated;
GRANT UPDATE (last_activity_at, last_question_order, visited_orders) ON public.test_attempts TO authenticated;
DROP POLICY IF EXISTS "Users can create own attempts" ON public.test_attempts;

-- 2: attempt_answers client writes (columns) + the server deadline in RLS
REVOKE INSERT, UPDATE ON public.attempt_answers FROM anon, authenticated;
GRANT INSERT (attempt_id, mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds, updated_at) ON public.attempt_answers TO authenticated;
GRANT UPDATE (selected_option_key, is_marked_for_review, time_spent_seconds, updated_at) ON public.attempt_answers TO authenticated;

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
