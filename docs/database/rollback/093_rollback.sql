-- Rollback for 20261025000093_f2_practice_answers_and_reports.sql (F2 practice answers + reports).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- WARNING: drops public.practice_answers and every practice answer in it (back it up first if it holds data).
-- Restores the errata table's pre-093 client access exactly (policies, grants, constraints); reports filed through
-- fn_report_question stay (an empty note would violate the old 10-char description check → padded to 10 chars first;
-- TRANSLATION_ERROR reports are re-typed OTHER, the only lossless fallback).
BEGIN;

DROP FUNCTION IF EXISTS public.fn_check_practice_answer(uuid, text, integer, uuid, text);
DROP FUNCTION IF EXISTS public.fn_report_question(uuid, uuid, text, text);
DROP TABLE IF EXISTS public.practice_answers;

UPDATE public.question_errata_reports SET issue_type = 'OTHER' WHERE issue_type = 'TRANSLATION_ERROR';
UPDATE public.question_errata_reports SET description = rpad(description, 10, '.') WHERE length(description) < 10;
ALTER TABLE public.question_errata_reports DROP CONSTRAINT IF EXISTS question_errata_reports_issue_type_check;
ALTER TABLE public.question_errata_reports ADD CONSTRAINT question_errata_reports_issue_type_check CHECK (issue_type = ANY (ARRAY[
    'INCORRECT_ANSWER', 'QUESTION_TEXT_ERROR', 'TYPO', 'AMBIGUOUS', 'OUTDATED_INFORMATION', 'DUPLICATE',
    'INCORRECT_EXPLANATION', 'FORMATTING', 'OTHER']));
ALTER TABLE public.question_errata_reports DROP CONSTRAINT IF EXISTS question_errata_reports_description_check;
ALTER TABLE public.question_errata_reports ADD CONSTRAINT question_errata_reports_description_check CHECK (length(description) >= 10 AND length(description) <= 3000);

DROP INDEX IF EXISTS public.idx_errata_reporter_question;
DROP INDEX IF EXISTS public.idx_errata_reporter_created;

GRANT INSERT, SELECT ON public.question_errata_reports TO authenticated;
CREATE POLICY "Users can create errata reports" ON public.question_errata_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);
CREATE POLICY "Users can read own errata reports" ON public.question_errata_reports FOR SELECT USING (auth.uid() = reporter_user_id);

COMMIT;
