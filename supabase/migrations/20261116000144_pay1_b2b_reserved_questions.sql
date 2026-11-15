-- =====================================================================================================================
-- 144 PAY-1 B2b part 2, step 1 (owner GO 2026-11-15, E1 = b): the questions RESERVED for PRO mocks, for the server.
--   fn_reserved_question_ids()  the question ids (any version) assigned to a mock whose access tier is PRO
--                               (fn_access_tier — the admin-controlled policy, whatever the paywall switch: D2). Practice
--                               delivery and topic counts (server-side reads, service role) leave these out, so a question
--                               reserved for a PRO mock never reaches practice or Memory Lock. Read-only; SECURITY DEFINER;
--                               EXECUTE for service_role only (no client may list it).
-- The same rule as fn_answer_blocked's RESERVED_FOR_MOCK (143), which refuses the ANSWER; this one keeps the question
-- out of the delivered set. No BEGIN / COMMIT: the runner owns the transaction.
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_reserved_question_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT DISTINCT qv.question_id
      FROM public.mock_questions mq
      JOIN public.question_versions qv ON qv.id = mq.question_version_id
     WHERE public.fn_access_tier('MOCK_TEST', mq.mock_test_id::text) = 'PRO';
$$;

REVOKE ALL ON FUNCTION public.fn_reserved_question_ids() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reserved_question_ids() TO service_role;
