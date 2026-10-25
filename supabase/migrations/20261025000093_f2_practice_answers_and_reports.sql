-- =====================================================================================================================
-- 093 F2 (decision #79) — topic practice answers + "Report this question"
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/093_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- 1. public.practice_answers — one row per answered practice / diagnostic question (needed later by the Revision Engine,
--    F5). Owner-only SELECT; NO client write grant: rows are written only by fn_check_practice_answer.
-- 2. fn_check_practice_answer (SECURITY DEFINER, search_path '', EXECUTE authenticated only) — the ONLY way a client
--    learns a correct answer / explanation: for ONE question, AFTER its answer is recorded. Serves only published,
--    current, servable versions of published questions (087 predicate). Rate limit: 30 answers per rolling minute and
--    1500 per rolling day per user (bounds bulk key scraping). Idempotent per (set, version): a repeat returns the stored
--    result without a second row. A wrong / skipped answer is recorded in the canonical Mistake Vault through the
--    canonical writer fn_record_mistake_occurrence (same transaction; source CUSTOM_PRACTICE / DIAGNOSTIC_ASSESSMENT,
--    source_reference_id = the practice answer) — no second mistake store, no service role in the request path.
-- 3. "Report this question" REUSES the canonical errata store public.question_errata_reports (its admin review flow and
--    fn_revoke_mistakes_by_errata already hang off it — a second report table would split them):
--    - writes only via fn_report_question (SECURITY DEFINER): 4 reasons (wrong answer key / typo or unclear /
--      translation error / other), optional note ≤ 500 chars, one report per user per question (advisory-locked
--      check; 2 legacy duplicate pairs exist, so no unique index), 20 reports per rolling day per user;
--    - client INSERT and SELECT revoked, both client policies dropped → admin-only read (service role / admin pages);
--      no user ever sees another user's report;
--    - issue_type gains TRANSLATION_ERROR; the note may be empty (description length 0..3000; legacy rows unchanged).
-- Errors are fixed codes only — no data, no SQL text.
-- =====================================================================================================================

-- ------------------------------------------------------------------ 1. practice answers
CREATE TABLE IF NOT EXISTS public.practice_answers (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id         uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    question_version_id uuid NOT NULL REFERENCES public.question_versions(id) ON DELETE CASCADE,
    selected_option_key text CHECK (selected_option_key IS NULL OR selected_option_key IN ('A', 'B', 'C', 'D')),
    is_correct          boolean NOT NULL,
    answered_at         timestamptz NOT NULL DEFAULT now(),
    time_taken_ms       integer CHECK (time_taken_ms IS NULL OR (time_taken_ms >= 0 AND time_taken_ms <= 3600000)),
    set_id              uuid NOT NULL,
    mode                text NOT NULL CHECK (mode IN ('TOPIC', 'DIAGNOSTIC')),
    language            text NOT NULL CHECK (language IN ('en', 'hi')),
    CONSTRAINT uq_practice_answer_per_set UNIQUE (user_id, set_id, question_version_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_answers_user_time ON public.practice_answers (user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_answers_user_question ON public.practice_answers (user_id, question_id);

ALTER TABLE public.practice_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.practice_answers TO authenticated;
DROP POLICY IF EXISTS p_practice_answers_select_own ON public.practice_answers;
CREATE POLICY p_practice_answers_select_own ON public.practice_answers
    FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ------------------------------------------------------------------ 2. check one answer
CREATE OR REPLACE FUNCTION public.fn_check_practice_answer(
    p_question_version_id uuid,
    p_selected_option_key text,
    p_time_taken_ms integer,
    p_set_id uuid,
    p_mode text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid      uuid := auth.uid();
    v_qid      uuid;
    v_lang     text;
    v_key      text;
    v_expl     text;
    v_prev     public.practice_answers%ROWTYPE;
    v_id       uuid;
    v_correct  boolean;
    v_mistake  jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_version_id IS NULL OR p_set_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('TOPIC', 'DIAGNOSTIC')
       OR (p_selected_option_key IS NOT NULL AND p_selected_option_key NOT IN ('A', 'B', 'C', 'D'))
       OR (p_time_taken_ms IS NOT NULL AND (p_time_taken_ms < 0 OR p_time_taken_ms > 3600000)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT v.question_id, v.language INTO v_qid, v_lang
      FROM public.question_versions v
      JOIN public.questions q ON q.id = v.question_id
     WHERE v.id = p_question_version_id
       AND v.lifecycle_status = 'PUBLISHED'
       AND v.is_current
       AND q.status = 'published';
    IF v_qid IS NULL OR NOT public.fn_qf_version_is_servable(p_question_version_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- serialise this user's answers (rate-limit counts and the per-set idempotency check stay exact)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('practice_answers:' || v_uid::text, 0));

    SELECT * INTO v_prev FROM public.practice_answers
     WHERE user_id = v_uid AND set_id = p_set_id AND question_version_id = p_question_version_id;
    IF NOT FOUND THEN
        IF (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > now() - interval '1 minute') >= 30
           OR (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > now() - interval '1 day') >= 1500 THEN
            RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
        END IF;
    END IF;

    SELECT a.correct_option_key, a.explanation_md INTO v_key, v_expl
      FROM public.question_answers a WHERE a.question_version_id = p_question_version_id;
    IF v_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    IF v_prev.id IS NOT NULL THEN
        -- repeat within the same set: the stored result, no second row (no re-answer farming)
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ANSWERED', 'practice_answer_id', v_prev.id,
            'question_id', v_prev.question_id, 'is_correct', v_prev.is_correct, 'selected_option_key', v_prev.selected_option_key,
            'correct_option_key', v_key, 'explanation_md', v_expl);
    END IF;

    v_correct := p_selected_option_key IS NOT NULL AND p_selected_option_key = v_key;
    INSERT INTO public.practice_answers (user_id, question_id, question_version_id, selected_option_key, is_correct, time_taken_ms, set_id, mode, language)
    VALUES (v_uid, v_qid, p_question_version_id, p_selected_option_key, v_correct, p_time_taken_ms, p_set_id, p_mode, v_lang)
    RETURNING id INTO v_id;

    -- a wrong (or skipped) answer goes to the canonical Mistake Vault through its canonical writer, in this same
    -- transaction (vault upsert + occurrence with lineage: source_reference_id = this practice answer)
    IF NOT v_correct THEN
        v_mistake := public.fn_record_mistake_occurrence(
            v_uid, v_qid,
            CASE p_mode WHEN 'DIAGNOSTIC' THEN 'DIAGNOSTIC_ASSESSMENT' ELSE 'CUSTOM_PRACTICE' END,
            v_id,
            (SELECT o.id FROM public.question_options o WHERE o.question_version_id = p_question_version_id AND o.option_key = p_selected_option_key),
            CASE WHEN p_time_taken_ms IS NULL THEN NULL ELSE (p_time_taken_ms / 1000) END,
            'UNCLASSIFIED', 50, p_question_version_id, NULL);
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'practice_answer_id', v_id, 'question_id', v_qid,
        'is_correct', v_correct, 'selected_option_key', p_selected_option_key, 'correct_option_key', v_key, 'explanation_md', v_expl,
        'saved_to_mistakes', coalesce((v_mistake ->> 'success')::boolean, false));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_check_practice_answer(uuid, text, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_check_practice_answer(uuid, text, integer, uuid, text) TO authenticated;

-- ------------------------------------------------------------------ 3. reports (canonical errata store)
ALTER TABLE public.question_errata_reports DROP CONSTRAINT IF EXISTS question_errata_reports_issue_type_check;
ALTER TABLE public.question_errata_reports ADD CONSTRAINT question_errata_reports_issue_type_check CHECK (issue_type = ANY (ARRAY[
    'INCORRECT_ANSWER', 'QUESTION_TEXT_ERROR', 'TYPO', 'AMBIGUOUS', 'OUTDATED_INFORMATION', 'DUPLICATE',
    'INCORRECT_EXPLANATION', 'FORMATTING', 'OTHER', 'TRANSLATION_ERROR']));
ALTER TABLE public.question_errata_reports DROP CONSTRAINT IF EXISTS question_errata_reports_description_check;
ALTER TABLE public.question_errata_reports ADD CONSTRAINT question_errata_reports_description_check CHECK (length(description) <= 3000);

DROP POLICY IF EXISTS "Users can create errata reports" ON public.question_errata_reports;
DROP POLICY IF EXISTS "Users can read own errata reports" ON public.question_errata_reports;
REVOKE INSERT, SELECT, UPDATE, DELETE, TRUNCATE ON public.question_errata_reports FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_errata_reporter_question ON public.question_errata_reports (reporter_user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_errata_reporter_created ON public.question_errata_reports (reporter_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_report_question(
    p_question_id uuid,
    p_question_version_id uuid,
    p_reason text,
    p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_uid   uuid := auth.uid();
    v_issue text;
    v_note  text := pg_catalog.btrim(coalesce(p_note, ''));
    v_id    uuid;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    v_issue := CASE p_reason
        WHEN 'WRONG_ANSWER_KEY' THEN 'INCORRECT_ANSWER'
        WHEN 'TYPO_OR_UNCLEAR' THEN 'TYPO'
        WHEN 'TRANSLATION_ERROR' THEN 'TRANSLATION_ERROR'
        WHEN 'OTHER' THEN 'OTHER'
    END;
    IF v_issue IS NULL OR p_question_id IS NULL OR p_question_version_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    IF pg_catalog.char_length(v_note) > 500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOTE_TOO_LONG');
    END IF;
    -- the version must belong to the question, and the question must be one students can see
    IF NOT EXISTS (SELECT 1 FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id
                    WHERE v.id = p_question_version_id AND v.question_id = p_question_id
                      AND v.lifecycle_status IN ('PUBLISHED', 'SUPERSEDED') AND q.status IN ('published', 'archived')) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('errata_reports:' || v_uid::text, 0));
    IF EXISTS (SELECT 1 FROM public.question_errata_reports WHERE reporter_user_id = v_uid AND question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'ALREADY_REPORTED');
    END IF;
    IF (SELECT count(*) FROM public.question_errata_reports WHERE reporter_user_id = v_uid AND created_at > now() - interval '1 day') >= 20 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    INSERT INTO public.question_errata_reports (reporter_user_id, question_id, question_version_id, issue_type, description, status)
    VALUES (v_uid, p_question_id, p_question_version_id, v_issue, v_note, 'OPEN')
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'code', 'REPORTED');
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_report_question(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_report_question(uuid, uuid, text, text) TO authenticated;
