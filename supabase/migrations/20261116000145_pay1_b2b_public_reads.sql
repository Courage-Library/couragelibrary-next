-- =====================================================================================================================
-- 145 PAY-1 B2b part 2, step 1 (owner GO 2026-11-15, "Narrow DEFINER reads"): the public pages' reads of mock_tests /
-- question_versions, before the client grants on those tables are revoked (146). Owner conditions:
--   1. each function returns only what the page shows (ids, titles, counts, flags) — never question text, options,
--      answers, explanations or model answers;
--   2. the filters are hard-coded here (published, non-dynamic, active template, not QA fixture content; PUBLISHED +
--      current + published question); no caller-supplied filter can widen them (the only argument narrows to one exam);
--   3. SECURITY DEFINER, STABLE, read-only, search_path '' (owner choice, rule #54); EXECUTE for anon + authenticated
--      (+ service_role) only on these five; allow-list + RLS P-9 SECDEF_PUBLIC_OK with a reason each.
--   fn_public_exam_mocks(p_exam_id)   the exam page's mock list (≤ 60, by title): id, title, minutes, questions, marks,
--                                     is_free, test_type
--   fn_public_mock_counts()           the landing page's published mock count per exam (exam_id, published_mocks)
--   fn_public_hindi_question_count()  the landing "in Hindi" claim: the number of current, published Hindi questions
--   fn_public_mock_shape(p_mock_test_id)  the CA hub quiz card's figures (questions, minutes, marks) of ONE published,
--                                     non-dynamic mock; no row otherwise
--   fn_public_ca_daily_mock_id(p_date)  the CA date page: the id of that date's published daily CA mock
--                                     (slug ca-daily-YYYY-MM-DD, built inside), or null
-- The same visibility the session reads had under RLS (mock_tests: published + non-dynamic; mock_templates: is_active;
-- question_versions: PUBLISHED; questions: published). No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_public_exam_mocks(p_exam_id uuid)
RETURNS TABLE (id uuid, title text, duration_minutes integer, total_questions integer, total_marks numeric, is_free boolean, test_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT m.id, m.title::text, m.duration_minutes::integer, m.total_questions::integer, m.total_marks::numeric, m.is_free, t.test_type::text
      FROM public.mock_tests m
      JOIN public.mock_templates t ON t.id = m.template_id
     WHERE t.exam_id = p_exam_id
       AND t.is_active = true
       AND m.status = 'published'
       AND m.is_dynamic = false
       AND m.slug NOT LIKE 'qa-fixture-run-%'
     ORDER BY m.title ASC
     LIMIT 60;
$$;

CREATE OR REPLACE FUNCTION public.fn_public_mock_counts()
RETURNS TABLE (exam_id uuid, published_mocks integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT t.exam_id, count(*)::integer
      FROM public.mock_tests m
      JOIN public.mock_templates t ON t.id = m.template_id
     WHERE t.is_active = true
       AND m.status = 'published'
       AND m.is_dynamic = false
       AND m.slug NOT LIKE 'qa-fixture-run-%'
     GROUP BY t.exam_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_public_hindi_question_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT count(*)::integer
      FROM public.question_versions qv
      JOIN public.questions q ON q.id = qv.question_id
     WHERE qv.language = 'hi'
       AND qv.lifecycle_status = 'PUBLISHED'
       AND qv.is_current = true
       AND q.status = 'published';
$$;

CREATE OR REPLACE FUNCTION public.fn_public_mock_shape(p_mock_test_id uuid)
RETURNS TABLE (total_questions integer, duration_minutes integer, total_marks numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT m.total_questions::integer, m.duration_minutes::integer, m.total_marks::numeric
      FROM public.mock_tests m
     WHERE m.id = p_mock_test_id
       AND m.status = 'published'
       AND m.is_dynamic = false
       AND m.slug NOT LIKE 'qa-fixture-run-%';
$$;

CREATE OR REPLACE FUNCTION public.fn_public_ca_daily_mock_id(p_date date)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT m.id
      FROM public.mock_tests m
     WHERE m.slug = 'ca-daily-' || to_char(p_date, 'YYYY-MM-DD')
       AND m.status = 'published'
       AND m.is_dynamic = false
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_public_mock_shape(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_public_ca_daily_mock_id(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_public_mock_shape(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_public_ca_daily_mock_id(date) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_public_exam_mocks(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_public_mock_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_public_hindi_question_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_public_exam_mocks(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_public_mock_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_public_hindi_question_count() TO anon, authenticated, service_role;
