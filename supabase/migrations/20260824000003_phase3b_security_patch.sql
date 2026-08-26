-- ============================================================================
-- COURAGE LIBRARY — PHASE 3B SECURITY & INTEGRITY PATCH
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. P0: DATA INTEGRITY — PREVENT MOCK/SECTION CROSS-REFERENCING
-- ============================================================================

-- Add composite unique constraint on mock_sections(id, mock_test_id)
ALTER TABLE public.mock_sections
    ADD CONSTRAINT uq_mock_sections_id_test UNIQUE (id, mock_test_id);

-- Replace simple foreign key on mock_questions with composite foreign key
ALTER TABLE public.mock_questions
    DROP CONSTRAINT IF EXISTS mock_questions_mock_section_id_fkey;

ALTER TABLE public.mock_questions
    ADD CONSTRAINT fk_mock_questions_section_test
    FOREIGN KEY (mock_section_id, mock_test_id)
    REFERENCES public.mock_sections(id, mock_test_id)
    ON DELETE RESTRICT;

-- ============================================================================
-- 2. P0 & P1: ATTEMPT ANSWERS CONSISTENCY & EXTENSIBILITY
-- ============================================================================

-- Drop old check constraint on selected_option_key to support future question types (e.g., T/F, Multi)
ALTER TABLE public.attempt_answers
    DROP CONSTRAINT IF EXISTS attempt_answers_selected_option_key_check;

ALTER TABLE public.attempt_answers
    ADD CONSTRAINT chk_attempt_answers_option_len CHECK (length(selected_option_key) <= 50);

-- Trigger to automatically populate question_version_id from mock_questions
-- and strip any client-supplied is_correct / evaluated_marks values
CREATE OR REPLACE FUNCTION public.fn_sanitize_attempt_answer()
RETURNS TRIGGER AS $$
DECLARE
    v_qversion_id UUID;
    v_attempt_status TEXT;
BEGIN
    -- Verify attempt is still in progress
    SELECT status INTO v_attempt_status
    FROM public.test_attempts
    WHERE id = NEW.attempt_id;

    IF v_attempt_status != 'in_progress' THEN
        RAISE EXCEPTION 'Cannot modify answers for a non-active attempt (Status: %)', v_attempt_status;
    END IF;

    -- Look up question_version_id from mock_questions (server-authoritative)
    SELECT question_version_id INTO v_qversion_id
    FROM public.mock_questions
    WHERE id = NEW.mock_question_id;

    IF v_qversion_id IS NULL THEN
        RAISE EXCEPTION 'Invalid mock_question_id %', NEW.mock_question_id;
    END IF;

    NEW.question_version_id := v_qversion_id;

    -- If not service_role, neutralize scoring fields so clients cannot self-evaluate
    IF current_user != 'service_role' AND current_user != 'postgres' THEN
        NEW.is_correct := NULL;
        NEW.evaluated_marks := NULL;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sanitize_attempt_answer ON public.attempt_answers;
CREATE TRIGGER trg_sanitize_attempt_answer
    BEFORE INSERT OR UPDATE ON public.attempt_answers
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_sanitize_attempt_answer();

-- ============================================================================
-- 3. P0: RLS FIX — PREVENT UNPUBLISHED MOCK DATA LEAKAGE
-- ============================================================================

-- Drop insecure public read policies
DROP POLICY IF EXISTS "Public read mock_sections" ON public.mock_sections;
DROP POLICY IF EXISTS "Public read mock_questions" ON public.mock_questions;
DROP POLICY IF EXISTS "Public read question_sources" ON public.question_sources;

-- Recreate strict published-only RLS policies
CREATE POLICY "Public read published mock_sections" ON public.mock_sections
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.mock_tests mt
            WHERE mt.id = mock_test_id AND mt.status = 'published'
        )
    );

CREATE POLICY "Public read published mock_questions" ON public.mock_questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.mock_tests mt
            WHERE mt.id = mock_test_id AND mt.status = 'published'
        )
    );

CREATE POLICY "Public read question_sources" ON public.question_sources
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            WHERE q.id = question_id AND q.status = 'published'
        )
    );

-- ============================================================================
-- 4. P1: ATTEMPT STATE SECURITY & CLIENT PERMISSIONS
-- ============================================================================

-- Tighten test_attempts UPDATE policy: only active in_progress attempts can be touched
DROP POLICY IF EXISTS "Users can update own in-progress attempts" ON public.test_attempts;
CREATE POLICY "Users can heartbeat own in-progress attempts" ON public.test_attempts
    FOR UPDATE USING (
        auth.uid() = user_id AND status = 'in_progress'
    )
    WITH CHECK (
        auth.uid() = user_id AND status = 'in_progress'
    );

-- Revoke write privileges on scoring columns from authenticated role
REVOKE UPDATE (status, submitted_at, time_taken_seconds) ON public.test_attempts FROM authenticated;
GRANT UPDATE (last_activity_at) ON public.test_attempts TO authenticated;

-- Revoke write privileges on is_correct and evaluated_marks from authenticated role
REVOKE INSERT (is_correct, evaluated_marks) ON public.attempt_answers FROM authenticated;
REVOKE UPDATE (is_correct, evaluated_marks, question_version_id, attempt_id, mock_question_id) ON public.attempt_answers FROM authenticated;
GRANT INSERT (attempt_id, mock_question_id, selected_option_key, is_marked_for_review, time_spent_seconds) ON public.attempt_answers TO authenticated;
GRANT UPDATE (selected_option_key, is_marked_for_review, time_spent_seconds) ON public.attempt_answers TO authenticated;

-- Ensure service_role has full control
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
