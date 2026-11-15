-- =====================================================================================================================
-- 146 PAY-1 B2b part 2, step 2 (owner GO 2026-11-15, D2 + E1 = b): clients lose every direct read of the question /
-- mock content tables. Step 1 (released, b4c5335) moved every app read server-side (service role, visibility stated)
-- or to the narrow public reads of 145; this closes the database side.
--   1. Two SECURITY DEFINER helpers (STABLE, search_path '', a boolean only) for the three policies that read these
--      tables as the caller and would otherwise fail under the revoke:
--        fn_attempt_answer_writable(attempt, mock question)  the caller's OWN in-progress attempt, inside its time
--                                                             (+ 30 s grace), and the question belongs to that mock —
--                                                             exactly the old attempt_answers INSERT / UPDATE rule
--        fn_mock_test_published(mock)                         the mock is published — the old mock_sections rule
--   2. The three policies rewritten to call them (same semantics).
--   3. REVOKE SELECT from anon + authenticated on question_versions, question_options, mock_questions, mock_tests
--      (table grants AND the anon column grants on mock_tests). service_role keeps its access; the RLS policies on
--      the four tables stay (inert for clients now).
-- Rollback: docs/database/rollback/146_rollback.sql restores the exact grants and the old policies.
-- No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_attempt_answer_writable(p_attempt_id uuid, p_mock_question_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.test_attempts ta
          JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
          JOIN public.mock_questions mq ON mq.mock_test_id = ta.mock_test_id AND mq.id = p_mock_question_id
         WHERE ta.id = p_attempt_id
           AND ta.user_id = auth.uid()
           AND ta.status = 'in_progress'
           AND now() <= ta.started_at + make_interval(mins => mt.duration_minutes) + interval '30 seconds'
    );
$$;

CREATE OR REPLACE FUNCTION public.fn_mock_test_published(p_mock_test_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.mock_tests mt WHERE mt.id = p_mock_test_id AND mt.status = 'published');
$$;

REVOKE ALL ON FUNCTION public.fn_attempt_answer_writable(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_mock_test_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_attempt_answer_writable(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_mock_test_published(uuid) TO anon, authenticated, service_role;

DROP POLICY "Users can insert own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT
    WITH CHECK (public.fn_attempt_answer_writable(attempt_id, mock_question_id));

DROP POLICY "Users can update own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE
    USING (public.fn_attempt_answer_writable(attempt_id, mock_question_id))
    WITH CHECK (public.fn_attempt_answer_writable(attempt_id, mock_question_id));

DROP POLICY "Public read published mock_sections" ON public.mock_sections;
CREATE POLICY "Public read published mock_sections" ON public.mock_sections
    FOR SELECT
    USING (public.fn_mock_test_published(mock_test_id));

REVOKE SELECT ON public.question_versions FROM anon, authenticated;
REVOKE SELECT ON public.question_options FROM anon, authenticated;
REVOKE SELECT ON public.mock_questions FROM anon, authenticated;
REVOKE SELECT ON public.mock_tests FROM anon, authenticated;
REVOKE SELECT (id, template_id, title, slug, status, duration_minutes, total_questions, total_marks, is_free, scheduled_for,
               published_at, created_at, updated_at, series_id, is_dynamic, lifecycle_status, expires_at)
    ON public.mock_tests FROM anon;
