-- =====================================================================================================================
-- Rollback for 146 PAY-1 B2b (supabase/migrations/20261116000146_pay1_b2b_content_revoke.sql).
-- ROLLBACK-CHAIN: run first: none
-- Restores the client grants exactly as they were before 146 (read from the catalog 2026-11-15) and the three old
-- policies, then drops the two helpers. Pre-approved by the owner for an immediate rollback if the browser journey or
-- a smoke fails right after the apply. Run inside ONE transaction (no BEGIN / COMMIT here).
-- =====================================================================================================================
GRANT SELECT ON public.question_versions TO anon, authenticated;
GRANT SELECT ON public.question_options TO anon, authenticated;
GRANT SELECT ON public.mock_questions TO anon, authenticated;
GRANT SELECT ON public.mock_tests TO authenticated;
GRANT SELECT (id, template_id, title, slug, status, duration_minutes, total_questions, total_marks, is_free, scheduled_for,
              published_at, created_at, updated_at, series_id, is_dynamic, lifecycle_status, expires_at)
    ON public.mock_tests TO anon;

DROP POLICY "Users can insert own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can insert own attempt answers" ON public.attempt_answers
    FOR INSERT
    WITH CHECK (EXISTS (SELECT 1
       FROM ((public.test_attempts ta
         JOIN public.mock_tests mt ON ((mt.id = ta.mock_test_id)))
         JOIN public.mock_questions mq ON (((mq.mock_test_id = ta.mock_test_id) AND (mq.id = attempt_answers.mock_question_id))))
      WHERE ((ta.id = attempt_answers.attempt_id) AND (ta.user_id = auth.uid()) AND (ta.status = 'in_progress'::text)
        AND (now() <= ((ta.started_at + make_interval(mins => mt.duration_minutes)) + '00:00:30'::interval)))));

DROP POLICY "Users can update own attempt answers" ON public.attempt_answers;
CREATE POLICY "Users can update own attempt answers" ON public.attempt_answers
    FOR UPDATE
    USING (EXISTS (SELECT 1
       FROM ((public.test_attempts ta
         JOIN public.mock_tests mt ON ((mt.id = ta.mock_test_id)))
         JOIN public.mock_questions mq ON (((mq.mock_test_id = ta.mock_test_id) AND (mq.id = attempt_answers.mock_question_id))))
      WHERE ((ta.id = attempt_answers.attempt_id) AND (ta.user_id = auth.uid()) AND (ta.status = 'in_progress'::text)
        AND (now() <= ((ta.started_at + make_interval(mins => mt.duration_minutes)) + '00:00:30'::interval)))))
    WITH CHECK (EXISTS (SELECT 1
       FROM ((public.test_attempts ta
         JOIN public.mock_tests mt ON ((mt.id = ta.mock_test_id)))
         JOIN public.mock_questions mq ON (((mq.mock_test_id = ta.mock_test_id) AND (mq.id = attempt_answers.mock_question_id))))
      WHERE ((ta.id = attempt_answers.attempt_id) AND (ta.user_id = auth.uid()) AND (ta.status = 'in_progress'::text)
        AND (now() <= ((ta.started_at + make_interval(mins => mt.duration_minutes)) + '00:00:30'::interval)))));

DROP POLICY "Public read published mock_sections" ON public.mock_sections;
CREATE POLICY "Public read published mock_sections" ON public.mock_sections
    FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.mock_tests mt WHERE ((mt.id = mock_sections.mock_test_id) AND (mt.status = 'published'::text))));

DROP FUNCTION IF EXISTS public.fn_mock_test_published(uuid);
DROP FUNCTION IF EXISTS public.fn_attempt_answer_writable(uuid, uuid);
