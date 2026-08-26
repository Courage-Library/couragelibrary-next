-- ============================================================================
-- COURAGE LIBRARY â€” PHASE 3Q: DESCRIPTIVE ANSWER EVALUATION & RUBRIC ENGINE
-- Migration: 20260825000032_phase3q_descriptive_evaluations.sql
-- Baseline: 101 PostgreSQL Base Tables
-- Target: 105 PostgreSQL Base Tables (+4 Tables)
-- ============================================================================

-- 1. QUESTION BANK: descriptive_questions
CREATE TABLE IF NOT EXISTS public.descriptive_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    question_text TEXT NOT NULL,
    max_marks NUMERIC(6,2) NOT NULL DEFAULT 15.00 CHECK (max_marks > 0),
    word_limit_min INTEGER CHECK (word_limit_min IS NULL OR word_limit_min >= 0),
    word_limit_max INTEGER NOT NULL DEFAULT 250 CHECK (word_limit_max >= 50),
    time_limit_minutes INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    model_answer_md TEXT,
    evaluation_guidelines_md TEXT,
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_word_limits CHECK (word_limit_min IS NULL OR word_limit_max >= word_limit_min)
);

CREATE INDEX IF NOT EXISTS idx_dq_exam_topic ON public.descriptive_questions (exam_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_dq_published ON public.descriptive_questions (is_published);

-- 2. EVALUATION RUBRICS: evaluation_rubrics
CREATE TABLE IF NOT EXISTS public.evaluation_rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_total_score NUMERIC(6,2) NOT NULL DEFAULT 100.00 CHECK (max_total_score > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_er_exam ON public.evaluation_rubrics (exam_id);

-- 3. STUDENT SUBMISSIONS: user_descriptive_submissions
CREATE TABLE IF NOT EXISTS public.user_descriptive_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.descriptive_questions(id) ON DELETE CASCADE,
    rubric_id UUID REFERENCES public.evaluation_rubrics(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES public.institute_batches(id) ON DELETE SET NULL,
    institute_id UUID REFERENCES public.institutes(id) ON DELETE SET NULL,
    assignment_id UUID REFERENCES public.batch_curriculum_assignments(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
    submission_type TEXT NOT NULL DEFAULT 'TYPED_TEXT' CHECK (submission_type IN ('TYPED_TEXT', 'ATTACHED_SCRIPT_PDF', 'HYBRID')),
    answer_text TEXT,
    attachment_url TEXT,
    attachment_page_count INTEGER CHECK (attachment_page_count IS NULL OR attachment_page_count > 0),
    word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
    time_spent_seconds INTEGER CHECK (time_spent_seconds IS NULL OR time_spent_seconds >= 0),
    status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'EVALUATED', 'RETURNED_FOR_REVISION', 'ARCHIVED')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_question_attempt UNIQUE (user_id, question_id, attempt_number),
    CONSTRAINT chk_submission_content CHECK (answer_text IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_uds_user_status ON public.user_descriptive_submissions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_uds_batch_status ON public.user_descriptive_submissions (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_uds_question ON public.user_descriptive_submissions (question_id);

-- 4. SCORECARDS: submission_evaluations
CREATE TABLE IF NOT EXISTS public.submission_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.user_descriptive_submissions(id) ON DELETE CASCADE,
    evaluator_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    evaluator_type TEXT NOT NULL DEFAULT 'HUMAN_FACULTY' CHECK (evaluator_type IN ('HUMAN_FACULTY', 'AI_ASSISTED', 'HYBRID', 'PEER_REVIEW')),
    rubric_id UUID REFERENCES public.evaluation_rubrics(id) ON DELETE SET NULL,
    rubric_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    rubric_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_score_awarded NUMERIC(6,2) NOT NULL CHECK (total_score_awarded >= 0),
    percentage_score NUMERIC(5,2) NOT NULL CHECK (percentage_score BETWEEN 0.00 AND 100.00),
    strengths_feedback TEXT,
    weaknesses_feedback TEXT,
    improvement_suggestions TEXT,
    model_answer_comparison_md TEXT,
    evaluation_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (evaluation_status IN ('DRAFT', 'COMPLETED', 'DISPUTED', 'REVISED')),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_submission_evaluation UNIQUE (submission_id)
);

CREATE INDEX IF NOT EXISTS idx_se_submission ON public.submission_evaluations (submission_id);
CREATE INDEX IF NOT EXISTS idx_se_evaluator ON public.submission_evaluations (evaluator_user_id);

-- ============================================================================
-- 5. NON-RECURSIVE SECURITY DEFINER HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_can_evaluate_submission(
    p_submission_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF p_submission_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

    SELECT * INTO v_sub FROM public.user_descriptive_submissions WHERE id = p_submission_id;
    IF NOT FOUND THEN RETURN false; END IF;

    -- Global staff/admin can always evaluate
    IF (COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')) THEN
        RETURN true;
    END IF;

    -- If institutional batch submission, verify faculty access in that batch via Phase 3P
    IF v_sub.batch_id IS NOT NULL THEN
        RETURN public.fn_has_batch_faculty_access(v_sub.batch_id, p_user_id);
    END IF;

    -- If institute level submission without batch, verify institute admin/owner
    IF v_sub.institute_id IS NOT NULL THEN
        RETURN public.fn_is_institute_member(v_sub.institute_id, p_user_id, ARRAY['INSTITUTE_ADMIN']);
    END IF;

    RETURN false;
END;
$$;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.descriptive_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_descriptive_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_evaluations ENABLE ROW LEVEL SECURITY;

-- descriptive_questions
CREATE POLICY "Public can view published descriptive questions"
    ON public.descriptive_questions FOR SELECT
    USING (is_published = true);

CREATE POLICY "Staff can manage descriptive questions"
    ON public.descriptive_questions FOR ALL
    TO authenticated
    USING (
        COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
    );

-- evaluation_rubrics
CREATE POLICY "Public can view active evaluation rubrics"
    ON public.evaluation_rubrics FOR SELECT
    USING (is_active = true);

CREATE POLICY "Staff can manage evaluation rubrics"
    ON public.evaluation_rubrics FOR ALL
    TO authenticated
    USING (
        COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
    );

-- user_descriptive_submissions
CREATE POLICY "Students can view own submissions"
    ON public.user_descriptive_submissions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Students can create own submissions"
    ON public.user_descriptive_submissions FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Students can update own draft submissions"
    ON public.user_descriptive_submissions FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid() AND status IN ('DRAFT', 'RETURNED_FOR_REVISION'))
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Faculty can view batch submissions"
    ON public.user_descriptive_submissions FOR SELECT
    TO authenticated
    USING (
        batch_id IS NOT NULL AND
        public.fn_has_batch_faculty_access(batch_id, auth.uid())
    );

CREATE POLICY "Staff can manage all submissions"
    ON public.user_descriptive_submissions FOR ALL
    TO authenticated
    USING (
        COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
    );

-- submission_evaluations
CREATE POLICY "Students can view evaluations of own submissions"
    ON public.submission_evaluations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_descriptive_submissions
            WHERE id = submission_evaluations.submission_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Faculty can view and manage assigned evaluations"
    ON public.submission_evaluations FOR ALL
    TO authenticated
    USING (public.fn_can_evaluate_submission(submission_id, auth.uid()))
    WITH CHECK (public.fn_can_evaluate_submission(submission_id, auth.uid()));

CREATE POLICY "Staff can manage all evaluations"
    ON public.submission_evaluations FOR ALL
    TO authenticated
    USING (
        COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
        COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
    );

-- ============================================================================
-- 7. RUNTIME SECURITY DEFINER RPCS
-- ============================================================================

-- 7.1 fn_submit_descriptive_answer
CREATE OR REPLACE FUNCTION public.fn_submit_descriptive_answer(
    p_question_id UUID,
    p_answer_text TEXT DEFAULT NULL,
    p_attachment_url TEXT DEFAULT NULL,
    p_submission_type TEXT DEFAULT 'TYPED_TEXT',
    p_batch_id UUID DEFAULT NULL,
    p_assignment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_q RECORD;
    v_inst_id UUID;
    v_attempt INTEGER;
    v_word_count INTEGER := 0;
    v_sub_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Validate question exists and is published
    SELECT * INTO v_q FROM public.descriptive_questions WHERE id = p_question_id AND is_published = true;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Descriptive question not found or unpublished');
    END IF;

    -- Validate batch membership if submitted under a batch
    IF p_batch_id IS NOT NULL THEN
        SELECT institute_id INTO v_inst_id FROM public.institute_batches WHERE id = p_batch_id;
        IF NOT public.fn_is_batch_member(p_batch_id, v_user_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'You are not an active member of this batch');
        END IF;
    END IF;

    -- Calculate word count if text provided
    IF p_answer_text IS NOT NULL AND length(trim(p_answer_text)) > 0 THEN
        v_word_count := array_length(regexp_split_to_array(trim(p_answer_text), '\s+'), 1);
    END IF;

    -- Calculate attempt number atomically
    SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt
    FROM public.user_descriptive_submissions
    WHERE user_id = v_user_id AND question_id = p_question_id;

    -- Insert submission
    INSERT INTO public.user_descriptive_submissions (
        user_id, question_id, batch_id, institute_id, assignment_id,
        attempt_number, submission_type, answer_text, attachment_url,
        word_count, status, submitted_at
    ) VALUES (
        v_user_id, p_question_id, p_batch_id, v_inst_id, p_assignment_id,
        v_attempt, p_submission_type, p_answer_text, p_attachment_url,
        v_word_count, 'SUBMITTED', now()
    ) RETURNING id INTO v_sub_id;

    RETURN jsonb_build_object(
        'success', true,
        'submission_id', v_sub_id,
        'attempt_number', v_attempt,
        'word_count', v_word_count,
        'status', 'SUBMITTED'
    );
END;
$$;


-- 7.2 fn_evaluate_descriptive_submission
CREATE OR REPLACE FUNCTION public.fn_evaluate_descriptive_submission(
    p_submission_id UUID,
    p_rubric_scores JSONB,
    p_total_score NUMERIC,
    p_strengths TEXT DEFAULT NULL,
    p_weaknesses TEXT DEFAULT NULL,
    p_suggestions TEXT DEFAULT NULL,
    p_model_comparison TEXT DEFAULT NULL,
    p_evaluator_type TEXT DEFAULT 'HUMAN_FACULTY'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_sub RECORD;
    v_q RECORD;
    v_rubric_snapshot JSONB := '{}'::jsonb;
    v_eval_id UUID;
    v_percentage NUMERIC(5,2);
    v_reward_res JSONB;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_can_evaluate_submission(p_submission_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff')
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    -- Concurrency Lock: Lock submission row before evaluating
    SELECT * INTO v_sub FROM public.user_descriptive_submissions WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
    END IF;

    IF v_sub.status NOT IN ('SUBMITTED', 'IN_REVIEW', 'RETURNED_FOR_REVISION') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Submission is already evaluated or archived');
    END IF;

    SELECT * INTO v_q FROM public.descriptive_questions WHERE id = v_sub.question_id;

    -- Snapshot rubric criteria if rubric assigned
    IF v_sub.rubric_id IS NOT NULL THEN
        SELECT criteria INTO v_rubric_snapshot FROM public.evaluation_rubrics WHERE id = v_sub.rubric_id;
    END IF;

    -- Calculate percentage
    IF v_q.max_marks > 0 THEN
        v_percentage := round(LEAST(100.00, GREATEST(0.00, (p_total_score / v_q.max_marks) * 100.00)), 2);
    ELSE
        v_percentage := 0.00;
    END IF;

    -- Insert or update canonical evaluation scorecard
    INSERT INTO public.submission_evaluations (
        submission_id, evaluator_user_id, evaluator_type, rubric_id,
        rubric_snapshot, rubric_scores, total_score_awarded, percentage_score,
        strengths_feedback, weaknesses_feedback, improvement_suggestions,
        model_answer_comparison_md, evaluation_status, completed_at
    ) VALUES (
        p_submission_id, v_caller_id, COALESCE(p_evaluator_type, 'HUMAN_FACULTY'), v_sub.rubric_id,
        v_rubric_snapshot, p_rubric_scores, p_total_score, v_percentage,
        p_strengths, p_weaknesses, p_suggestions,
        p_model_comparison, 'COMPLETED', now()
    )
    ON CONFLICT (submission_id) DO UPDATE
    SET evaluator_user_id = EXCLUDED.evaluator_user_id,
        evaluator_type = EXCLUDED.evaluator_type,
        rubric_snapshot = EXCLUDED.rubric_snapshot,
        rubric_scores = EXCLUDED.rubric_scores,
        total_score_awarded = EXCLUDED.total_score_awarded,
        percentage_score = EXCLUDED.percentage_score,
        strengths_feedback = EXCLUDED.strengths_feedback,
        weaknesses_feedback = EXCLUDED.weaknesses_feedback,
        improvement_suggestions = EXCLUDED.improvement_suggestions,
        model_answer_comparison_md = EXCLUDED.model_answer_comparison_md,
        evaluation_status = 'COMPLETED',
        completed_at = now(),
        updated_at = now()
    RETURNING id INTO v_eval_id;

    -- Update submission status
    UPDATE public.user_descriptive_submissions
    SET status = 'EVALUATED', updated_at = now()
    WHERE id = p_submission_id;

    -- Phase 3D Gamification Reward: 10 coins for completed evaluation
    v_reward_res := public.fn_award_gamification_reward(
        v_sub.user_id,
        'DESCRIPTIVE_EVALUATION_COMPLETED',
        'DESCRIPTIVE_SUBMISSION',
        p_submission_id,
        'descriptive_eval_' || p_submission_id || '_' || v_sub.user_id,
        10,
        'DESCRIPTIVE_EVALUATION_REWARD',
        jsonb_build_object('submission_id', p_submission_id, 'score', p_total_score, 'percentage', v_percentage)
    );

    -- Phase 3C Activity Logging
    IF v_q.topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_sub.user_id, v_q.topic_id, 'descriptive-' || v_q.slug, 'TOPIC_LEARNING_ACTIVITY',
            COALESCE(v_sub.time_spent_seconds, 600),
            jsonb_build_object('activity_type', 'DESCRIPTIVE_ESSAY', 'submission_id', p_submission_id, 'percentage', v_percentage),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'evaluation_id', v_eval_id,
        'submission_id', p_submission_id,
        'total_score_awarded', p_total_score,
        'percentage_score', v_percentage,
        'status', 'EVALUATED'
    );
END;
$$;