-- ============================================================================
-- COURAGE LIBRARY — PHASE 3J: STUDENT INTELLIGENCE & RECOMMENDATION ENGINE
-- Target Database: couragelibrary-next
-- Tables: 5 New Tables (72 -> 77 Total)
-- ============================================================================

-- 1. Diagnostic Assessments Catalog (Templates)
CREATE TABLE IF NOT EXISTS public.diagnostic_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    mock_template_id UUID NOT NULL REFERENCES public.mock_templates(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (length(title) <= 150),
    description TEXT,
    target_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (target_duration_minutes > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_diagnostic UNIQUE (exam_id, mock_template_id)
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_assessments_exam ON public.diagnostic_assessments(exam_id) WHERE is_active = true;

-- 2. User Diagnostic Results (Baseline Snapshot)
CREATE TABLE IF NOT EXISTS public.user_diagnostic_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    diagnostic_assessment_id UUID NOT NULL REFERENCES public.diagnostic_assessments(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL UNIQUE REFERENCES public.test_attempts(id) ON DELETE RESTRICT,
    overall_score NUMERIC(6,2) NOT NULL,
    accuracy_pct NUMERIC(5,2) NOT NULL CHECK (accuracy_pct BETWEEN 0.00 AND 100.00),
    weak_topic_ids UUID[] NOT NULL DEFAULT '{}',
    strong_topic_ids UUID[] NOT NULL DEFAULT '{}',
    baseline_readiness_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (baseline_readiness_pct BETWEEN 0.00 AND 100.00),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_diagnostic_results_user ON public.user_diagnostic_results(user_id, completed_at DESC);

-- 3. Daily Study Recommendations (Immutable Daily Snapshots)
CREATE TABLE IF NOT EXISTS public.daily_study_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recommendation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    priority_rank INTEGER NOT NULL CHECK (priority_rank BETWEEN 1 AND 5),
    action_type TEXT NOT NULL CHECK (action_type IN ('PRACTICE_WEAK_TOPIC', 'SPACED_REVISION', 'LEARN_RESOURCE', 'MINI_MOCK', 'COURSE_LESSON')),
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    resource_id UUID REFERENCES public.learning_resources(id) ON DELETE SET NULL,
    course_lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE SET NULL,
    custom_practice_id UUID REFERENCES public.custom_practice_sessions(id) ON DELETE SET NULL,
    priority_score NUMERIC(8,2) NOT NULL CHECK (priority_score >= 0),
    reason_code TEXT NOT NULL CHECK (reason_code IN ('LOW_MASTERY', 'FORGETTING_DUE', 'PREREQUISITE_GAP', 'DIAGNOSTIC_WEAKNESS', 'EXAM_APPROACHING', 'DAILY_STREAK_GOAL')),
    reason_text_snapshot TEXT NOT NULL CHECK (length(reason_text_snapshot) <= 250),
    signal_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    engine_version TEXT NOT NULL DEFAULT 'v1.0',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'DISMISSED')),
    completed_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_daily_rec_rank UNIQUE (user_id, recommendation_date, priority_rank)
);

CREATE INDEX IF NOT EXISTS idx_daily_recommendations_user_date ON public.daily_study_recommendations(user_id, recommendation_date);
CREATE INDEX IF NOT EXISTS idx_daily_recommendations_status ON public.daily_study_recommendations(user_id, status);

-- 4. Exam Cutoff Benchmarks (Historical & Projected Benchmarks)
CREATE TABLE IF NOT EXISTS public.exam_cutoff_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    exam_cycle_id UUID NOT NULL REFERENCES public.exam_cycles(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('UR', 'OBC', 'SC', 'ST', 'EWS', 'PWD', 'EX_SERVICEMEN', 'ALL')),
    stage TEXT NOT NULL DEFAULT 'TIER_1' CHECK (stage IN ('TIER_1', 'TIER_2', 'PRELIMS', 'MAINS', 'FINAL')),
    total_marks NUMERIC(6,2) NOT NULL CHECK (total_marks > 0),
    cutoff_marks NUMERIC(6,2) NOT NULL CHECK (cutoff_marks >= 0),
    cutoff_pct NUMERIC(5,2) GENERATED ALWAYS AS (ROUND((cutoff_marks / total_marks) * 100.00, 2)) STORED,
    year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    provenance_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_exam_cutoff_cycle_cat UNIQUE (exam_id, exam_cycle_id, category, stage)
);

CREATE INDEX IF NOT EXISTS idx_cutoff_benchmarks_exam ON public.exam_cutoff_benchmarks(exam_id, exam_cycle_id, category);

-- 5. Spaced Repetition Schedules (Pacing State)
CREATE TABLE IF NOT EXISTS public.spaced_repetition_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
    repetition_level INTEGER NOT NULL DEFAULT 1 CHECK (repetition_level >= 1),
    interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
    last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_review_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 day'),
    review_count INTEGER NOT NULL DEFAULT 1 CHECK (review_count >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_spaced_target CHECK (
        (question_id IS NOT NULL AND topic_id IS NULL) OR
        (topic_id IS NOT NULL AND question_id IS NULL)
    ),
    CONSTRAINT uq_user_spaced_question UNIQUE (user_id, question_id),
    CONSTRAINT uq_user_spaced_topic UNIQUE (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_spaced_schedules_user_next ON public.spaced_repetition_schedules(user_id, next_review_at);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.diagnostic_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_diagnostic_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_study_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_cutoff_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaced_repetition_schedules ENABLE ROW LEVEL SECURITY;

-- diagnostic_assessments
DROP POLICY IF EXISTS p_diagnostic_assessments_select ON public.diagnostic_assessments;
CREATE POLICY p_diagnostic_assessments_select ON public.diagnostic_assessments
    FOR SELECT TO authenticated USING (is_active = true);

-- user_diagnostic_results
DROP POLICY IF EXISTS p_user_diagnostic_results_select ON public.user_diagnostic_results;
CREATE POLICY p_user_diagnostic_results_select ON public.user_diagnostic_results
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- daily_study_recommendations
DROP POLICY IF EXISTS p_daily_recommendations_select ON public.daily_study_recommendations;
CREATE POLICY p_daily_recommendations_select ON public.daily_study_recommendations
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS p_daily_recommendations_update ON public.daily_study_recommendations;
CREATE POLICY p_daily_recommendations_update ON public.daily_study_recommendations
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- exam_cutoff_benchmarks
DROP POLICY IF EXISTS p_exam_cutoff_benchmarks_select ON public.exam_cutoff_benchmarks;
CREATE POLICY p_exam_cutoff_benchmarks_select ON public.exam_cutoff_benchmarks
    FOR SELECT TO authenticated USING (true);

-- spaced_repetition_schedules
DROP POLICY IF EXISTS p_spaced_repetition_schedules_select ON public.spaced_repetition_schedules;
CREATE POLICY p_spaced_repetition_schedules_select ON public.spaced_repetition_schedules
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Service Role Full Access
DROP POLICY IF EXISTS p_diagnostic_assessments_service ON public.diagnostic_assessments;
CREATE POLICY p_diagnostic_assessments_service ON public.diagnostic_assessments FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_user_diagnostic_results_service ON public.user_diagnostic_results;
CREATE POLICY p_user_diagnostic_results_service ON public.user_diagnostic_results FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_daily_recommendations_service ON public.daily_study_recommendations;
CREATE POLICY p_daily_recommendations_service ON public.daily_study_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_exam_cutoff_benchmarks_service ON public.exam_cutoff_benchmarks;
CREATE POLICY p_exam_cutoff_benchmarks_service ON public.exam_cutoff_benchmarks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_spaced_repetition_schedules_service ON public.spaced_repetition_schedules;
CREATE POLICY p_spaced_repetition_schedules_service ON public.spaced_repetition_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- RUNTIME STORED PROCEDURES (RPCS)
-- ============================================================================

-- 1. Complete Diagnostic Assessment RPC
CREATE OR REPLACE FUNCTION public.fn_complete_diagnostic_assessment(
    p_attempt_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_attempt RECORD;
    v_diagnostic RECORD;
    v_result RECORD;
    v_result_id UUID;
    v_weak_topics UUID[] := '{}';
    v_strong_topics UUID[] := '{}';
    v_accuracy NUMERIC(5,2) := 0.00;
    v_baseline_readiness NUMERIC(5,2) := 0.00;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Check if attempt exists and belongs to user
    SELECT * INTO v_attempt
    FROM public.test_attempts
    WHERE id = p_attempt_id AND user_id = v_user_id;

    IF v_attempt IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Test attempt not found');
    END IF;

    -- Check if diagnostic assessment maps to this test template
    SELECT * INTO v_diagnostic
    FROM public.diagnostic_assessments
    WHERE mock_template_id = v_attempt.mock_template_id;

    IF v_diagnostic IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'This attempt does not correspond to a registered diagnostic assessment');
    END IF;

    -- Idempotency check
    SELECT * INTO v_result
    FROM public.user_diagnostic_results
    WHERE attempt_id = p_attempt_id;

    IF v_result IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'diagnostic_result_id', v_result.id,
            'overall_score', v_result.overall_score,
            'accuracy_pct', v_result.accuracy_pct,
            'baseline_readiness_pct', v_result.baseline_readiness_pct,
            'already_completed', true
        );
    END IF;

    -- Compute accuracy
    IF v_attempt.total_questions > 0 THEN
        v_accuracy := round((COALESCE(v_attempt.correct_count, 0)::numeric / v_attempt.total_questions::numeric) * 100.00, 2);
    END IF;

    v_baseline_readiness := v_accuracy;

    -- Identify weak & strong topics from attempt section analytics
    SELECT ARRAY_AGG(topic_id) INTO v_weak_topics
    FROM (
        SELECT q.topic_id
        FROM public.attempt_answers aa
        JOIN public.questions q ON q.id = aa.question_id
        WHERE aa.attempt_id = p_attempt_id AND aa.is_correct = false AND q.topic_id IS NOT NULL
        GROUP BY q.topic_id
        ORDER BY count(*) DESC
        LIMIT 3
    ) w;

    SELECT ARRAY_AGG(topic_id) INTO v_strong_topics
    FROM (
        SELECT q.topic_id
        FROM public.attempt_answers aa
        JOIN public.questions q ON q.id = aa.question_id
        WHERE aa.attempt_id = p_attempt_id AND aa.is_correct = true AND q.topic_id IS NOT NULL
        GROUP BY q.topic_id
        ORDER BY count(*) DESC
        LIMIT 3
    ) s;

    -- Insert User Diagnostic Result snapshot
    INSERT INTO public.user_diagnostic_results (
        user_id, diagnostic_assessment_id, attempt_id,
        overall_score, accuracy_pct, weak_topic_ids, strong_topic_ids,
        baseline_readiness_pct, completed_at
    ) VALUES (
        v_user_id, v_diagnostic.id, p_attempt_id,
        COALESCE(v_attempt.total_score, 0.00), v_accuracy,
        COALESCE(v_weak_topics, '{}'), COALESCE(v_strong_topics, '{}'),
        v_baseline_readiness, now()
    ) RETURNING id INTO v_result_id;

    RETURN jsonb_build_object(
        'success', true,
        'diagnostic_result_id', v_result_id,
        'overall_score', COALESCE(v_attempt.total_score, 0.00),
        'accuracy_pct', v_accuracy,
        'weak_topic_count', COALESCE(array_length(v_weak_topics, 1), 0),
        'strong_topic_count', COALESCE(array_length(v_strong_topics, 1), 0),
        'baseline_readiness_pct', v_baseline_readiness
    );
END;
$$;


-- 2. Generate Daily Recommendations RPC (Deterministic V1 Scoring Engine)
CREATE OR REPLACE FUNCTION public.fn_generate_daily_recommendations(
    p_user_id UUID DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target_user UUID := COALESCE(p_user_id, auth.uid());
    v_existing_count INTEGER;
    v_weak_topic RECORD;
    v_spaced_item RECORD;
    v_learn_res RECORD;
    v_rank INTEGER := 1;
BEGIN
    IF v_target_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Idempotency check: Return existing recommendation feed if already generated today
    SELECT COUNT(*) INTO v_existing_count
    FROM public.daily_study_recommendations
    WHERE user_id = v_target_user AND recommendation_date = p_date;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'user_id', v_target_user,
            'recommendation_date', p_date,
            'task_count', v_existing_count,
            'already_generated', true
        );
    END IF;

    -- Task 1: Practice Weak Topic (Mastery Deficit - Max 40 pts + Error Recency 25 pts)
    SELECT utm.topic_id, t.name as topic_name, utm.mastery_score
    INTO v_weak_topic
    FROM public.user_topic_mastery utm
    JOIN public.topics t ON t.id = utm.topic_id
    WHERE utm.user_id = v_target_user
    ORDER BY utm.mastery_score ASC
    LIMIT 1;

    IF v_weak_topic.topic_id IS NOT NULL THEN
        INSERT INTO public.daily_study_recommendations (
            user_id, recommendation_date, priority_rank, action_type,
            topic_id, priority_score, reason_code, reason_text_snapshot,
            signal_snapshot_json, engine_version, status
        ) VALUES (
            v_target_user, p_date, v_rank, 'PRACTICE_WEAK_TOPIC',
            v_weak_topic.topic_id, round((1.00 - v_weak_topic.mastery_score) * 40.00 + 25.00, 2),
            'LOW_MASTERY', 'Focus practice on ' || v_weak_topic.topic_name || ' (Mastery: ' || round(v_weak_topic.mastery_score * 100, 0)::text || '%)',
            jsonb_build_object('mastery_score', v_weak_topic.mastery_score, 'source', 'user_topic_mastery'),
            'v1.0', 'PENDING'
        );
        v_rank := v_rank + 1;
    END IF;

    -- Task 2: Spaced Repetition Due (Forgetting Curve Due - 20 pts)
    SELECT srs.id, srs.question_id, srs.topic_id
    INTO v_spaced_item
    FROM public.spaced_repetition_schedules srs
    WHERE srs.user_id = v_target_user AND srs.next_review_at <= now()
    ORDER BY srs.next_review_at ASC
    LIMIT 1;

    IF v_spaced_item.id IS NOT NULL THEN
        INSERT INTO public.daily_study_recommendations (
            user_id, recommendation_date, priority_rank, action_type,
            topic_id, priority_score, reason_code, reason_text_snapshot,
            signal_snapshot_json, engine_version, status
        ) VALUES (
            v_target_user, p_date, v_rank, 'SPACED_REVISION',
            v_spaced_item.topic_id, 35.00,
            'FORGETTING_DUE', 'Spaced review scheduled for retention reinforcement',
            jsonb_build_object('schedule_id', v_spaced_item.id, 'source', 'spaced_repetition_schedules'),
            'v1.0', 'PENDING'
        );
        v_rank := v_rank + 1;
    END IF;

    -- Task 3: Learn High-Yield Resource / Daily Quiz
    SELECT lr.id, lr.title, lr.topic_id
    INTO v_learn_res
    FROM public.learning_resources lr
    WHERE lr.is_published = true
    LIMIT 1;

    IF v_learn_res.id IS NOT NULL AND v_rank <= 3 THEN
        INSERT INTO public.daily_study_recommendations (
            user_id, recommendation_date, priority_rank, action_type,
            resource_id, topic_id, priority_score, reason_code, reason_text_snapshot,
            signal_snapshot_json, engine_version, status
        ) VALUES (
            v_target_user, p_date, v_rank, 'LEARN_RESOURCE',
            v_learn_res.id, v_learn_res.topic_id, 25.00,
            'DAILY_STREAK_GOAL', 'Read: ' || v_learn_res.title,
            jsonb_build_object('resource_id', v_learn_res.id, 'source', 'learning_resources'),
            'v1.0', 'PENDING'
        );
        v_rank := v_rank + 1;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_user,
        'recommendation_date', p_date,
        'tasks_generated', v_rank - 1
    );
END;
$$;


-- 3. Update Spaced Repetition Review RPC
CREATE OR REPLACE FUNCTION public.fn_update_spaced_repetition_review(
    p_user_id UUID,
    p_question_id UUID DEFAULT NULL,
    p_topic_id UUID DEFAULT NULL,
    p_quality INTEGER DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_schedule RECORD;
    v_new_level INTEGER;
    v_new_interval INTEGER;
    v_new_ease NUMERIC(4,2);
    v_next_review TIMESTAMPTZ;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'user_id is required');
    END IF;

    IF p_question_id IS NULL AND p_topic_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'question_id or topic_id is required');
    END IF;

    -- Lookup existing schedule
    IF p_question_id IS NOT NULL THEN
        SELECT * INTO v_schedule
        FROM public.spaced_repetition_schedules
        WHERE user_id = p_user_id AND question_id = p_question_id;
    ELSE
        SELECT * INTO v_schedule
        FROM public.spaced_repetition_schedules
        WHERE user_id = p_user_id AND topic_id = p_topic_id;
    END IF;

    -- Modified SM-2 Algorithm Calculation
    IF v_schedule IS NULL THEN
        -- First review
        IF p_quality >= 3 THEN
            v_new_level := 2;
            v_new_interval := 3;
            v_new_ease := 2.50;
        ELSE
            v_new_level := 1;
            v_new_interval := 1;
            v_new_ease := 2.50;
        END IF;

        v_next_review := now() + (v_new_interval || ' days')::interval;

        INSERT INTO public.spaced_repetition_schedules (
            user_id, question_id, topic_id, repetition_level,
            interval_days, ease_factor, last_reviewed_at, next_review_at, review_count
        ) VALUES (
            p_user_id, p_question_id, p_topic_id, v_new_level,
            v_new_interval, v_new_ease, now(), v_next_review, 1
        );
    ELSE
        -- Existing schedule progression
        IF p_quality >= 3 THEN
            v_new_level := v_schedule.repetition_level + 1;
            v_new_interval := round(v_schedule.interval_days * v_schedule.ease_factor);
            IF v_new_interval < 1 THEN v_new_interval := 1; END IF;
            v_new_ease := v_schedule.ease_factor + (0.1 - (5 - p_quality) * (0.08 + (5 - p_quality) * 0.02));
            IF v_new_ease < 1.30 THEN v_new_ease := 1.30; END IF;
        ELSE
            -- Failed recall: reset to level 1 and 1 day interval
            v_new_level := 1;
            v_new_interval := 1;
            v_new_ease := GREATEST(1.30, v_schedule.ease_factor - 0.20);
        END IF;

        v_next_review := now() + (v_new_interval || ' days')::interval;

        UPDATE public.spaced_repetition_schedules
        SET repetition_level = v_new_level,
            interval_days = v_new_interval,
            ease_factor = v_new_ease,
            last_reviewed_at = now(),
            next_review_at = v_next_review,
            review_count = review_count + 1,
            updated_at = now()
        WHERE id = v_schedule.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'repetition_level', v_new_level,
        'interval_days', v_new_interval,
        'next_review_at', v_next_review
    );
END;
$$;

-- Revoke & Grant Execute Permissions
REVOKE EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_complete_diagnostic_assessment(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(UUID, DATE) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_generate_daily_recommendations(UUID, DATE) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_update_spaced_repetition_review(UUID, UUID, UUID, INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_update_spaced_repetition_review(UUID, UUID, UUID, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
