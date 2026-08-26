-- ============================================================================
-- COURAGE LIBRARY â€” PHASE 3O: SMART MISTAKE VAULT & COGNITIVE REMEDIATION
-- Migration: 20260825000030_phase3o_mistake_vault.sql
-- Target Schema: couragelibrary-next
-- Baseline: 93 PostgreSQL Base Tables -> Expected: 97 Base Tables
-- ============================================================================

-- 1. TABLE: mistake_cognitive_types
CREATE TABLE IF NOT EXISTS public.mistake_cognitive_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation_guidance TEXT NOT NULL,
    default_remediation_action TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Cognitive Taxonomy
INSERT INTO public.mistake_cognitive_types (id, name, description, remediation_guidance, default_remediation_action, display_order)
VALUES 
    ('CONCEPTUAL_GAP', 'Conceptual Gap', 'Core underlying theoretical concept was not understood or applied incorrectly.', 'Review topic foundational article and conceptual notes before re-attempting.', 'REVIEW_ARTICLE', 1),
    ('CALCULATION_SLIP', 'Calculation Slip', 'Concept was understood but an arithmetic, algebraic or sign error occurred.', 'Practice untimed step-by-step arithmetic verification drills.', 'CALCULATION_DRILL', 2),
    ('MISREAD_QUESTION', 'Misread Question / Keyword Slip', 'Question conditions (e.g. NOT, EXCEPT, ALWAYS, incorrect units) were misread.', 'Slow down and highlight qualifier keywords in the question prompt.', 'KEYWORD_PRACTICE', 3),
    ('TIME_PANIC', 'Time Pressure / Rush', 'Rushed through the question due to test countdown or clock pressure.', 'Practice pacing drills with standard per-question time boundaries.', 'PACING_DRILL', 4),
    ('FORMULA_CONFUSION', 'Formula / Identity Confusion', 'Recalled the wrong formula, wrong constants, or wrong variable substitutions.', 'Review formula flashcard deck and practice formula derivation.', 'FLASHCARD_REVIEW', 5),
    ('DISTRACTOR_TRAP', 'Distractor Trap', 'Fell for an intentional tempting distractor representing a common fallacy.', 'Analyze the explanation to understand why the chosen distractor is flawed.', 'DISTRACTOR_ANALYSIS', 6),
    ('UNCLASSIFIED', 'Unclassified / General Mistake', 'Mistake reason could not be deterministically inferred from telemetry.', 'Review full detailed question explanation and key concepts.', 'EXPLANATION_REVIEW', 7)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    remediation_guidance = EXCLUDED.remediation_guidance,
    default_remediation_action = EXCLUDED.default_remediation_action,
    display_order = EXCLUDED.display_order;


-- 2. TABLE: user_mistake_vault
CREATE TABLE IF NOT EXISTS public.user_mistake_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    total_mistakes_count INTEGER NOT NULL DEFAULT 1 CHECK (total_mistakes_count >= 1),
    consecutive_correct_in_remediation INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_correct_in_remediation >= 0),
    lifecycle_status TEXT NOT NULL DEFAULT 'UNRESOLVED' CHECK (lifecycle_status IN ('UNRESOLVED', 'REVISITING', 'MASTERED')),
    primary_cognitive_type_id TEXT NOT NULL DEFAULT 'UNCLASSIFIED' REFERENCES public.mistake_cognitive_types(id),
    user_override_cognitive_type_id TEXT REFERENCES public.mistake_cognitive_types(id),
    user_custom_notes TEXT,
    first_mistake_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_mistake_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_practiced_at TIMESTAMPTZ,
    mastered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_question_mistake UNIQUE (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_umv_user_status ON public.user_mistake_vault (user_id, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_umv_user_topic ON public.user_mistake_vault (user_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_umv_user_last_mistake ON public.user_mistake_vault (user_id, last_mistake_at DESC);


-- 3. TABLE: user_mistake_occurrences
CREATE TABLE IF NOT EXISTS public.user_mistake_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES public.user_mistake_vault(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    source_context TEXT NOT NULL CHECK (source_context IN ('MOCK_TEST', 'CUSTOM_PRACTICE', 'QUIZ_BATTLE', 'FLASHCARD_REVIEW', 'MISTAKE_DRILL', 'DIAGNOSTIC_ASSESSMENT')),
    source_reference_id UUID,
    selected_option_id UUID REFERENCES public.question_options(id) ON DELETE SET NULL,
    response_time_seconds INTEGER CHECK (response_time_seconds >= 0),
    inferred_cognitive_type_id TEXT NOT NULL DEFAULT 'UNCLASSIFIED' REFERENCES public.mistake_cognitive_types(id),
    heuristic_confidence_pct INTEGER NOT NULL DEFAULT 50 CHECK (heuristic_confidence_pct BETWEEN 0 AND 100),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_umo_vault ON public.user_mistake_occurrences (vault_id);
CREATE INDEX IF NOT EXISTS idx_umo_user_occurred ON public.user_mistake_occurrences (user_id, occurred_at DESC);


-- 4. TABLE: user_mistake_drills
CREATE TABLE IF NOT EXISTS public.user_mistake_drills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    cognitive_type_id TEXT REFERENCES public.mistake_cognitive_types(id) ON DELETE SET NULL,
    total_questions INTEGER NOT NULL CHECK (total_questions BETWEEN 1 AND 50),
    correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    questions_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED')),
    mistakes_resolved_count INTEGER NOT NULL DEFAULT 0 CHECK (mistakes_resolved_count >= 0),
    coins_awarded INTEGER NOT NULL DEFAULT 0 CHECK (coins_awarded >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_umd_user_status ON public.user_mistake_drills (user_id, status);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.mistake_cognitive_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_mct_select ON public.mistake_cognitive_types;
CREATE POLICY p_mct_select ON public.mistake_cognitive_types
    FOR SELECT TO public
    USING (true);

DROP POLICY IF EXISTS p_mct_manage_staff ON public.mistake_cognitive_types;
CREATE POLICY p_mct_manage_staff ON public.mistake_cognitive_types
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.user_mistake_vault ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_umv_select ON public.user_mistake_vault;
CREATE POLICY p_umv_select ON public.user_mistake_vault
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_umv_update_user ON public.user_mistake_vault;
CREATE POLICY p_umv_update_user ON public.user_mistake_vault
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_umv_manage_staff ON public.user_mistake_vault;
CREATE POLICY p_umv_manage_staff ON public.user_mistake_vault
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.user_mistake_occurrences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_umo_select ON public.user_mistake_occurrences;
CREATE POLICY p_umo_select ON public.user_mistake_occurrences
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_umo_manage_staff ON public.user_mistake_occurrences;
CREATE POLICY p_umo_manage_staff ON public.user_mistake_occurrences
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.user_mistake_drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_umd_select ON public.user_mistake_drills;
CREATE POLICY p_umd_select ON public.user_mistake_drills
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_umd_manage_staff ON public.user_mistake_drills;
CREATE POLICY p_umd_manage_staff ON public.user_mistake_drills
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- ============================================================================
-- RUNTIME RPCS (SECURITY DEFINER)
-- ============================================================================

-- 1. fn_record_mistake_occurrence
CREATE OR REPLACE FUNCTION public.fn_record_mistake_occurrence(
    p_user_id UUID,
    p_question_id UUID,
    p_source_context TEXT,
    p_source_reference_id UUID DEFAULT NULL,
    p_selected_option_id UUID DEFAULT NULL,
    p_response_time_seconds INTEGER DEFAULT NULL,
    p_cognitive_type_id TEXT DEFAULT 'UNCLASSIFIED',
    p_confidence_pct INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_vault_id UUID;
    v_topic_id UUID;
    v_subject_id UUID;
    v_status TEXT;
    v_existing_cognitive TEXT;
BEGIN
    -- Authenticated check: caller must be target user or staff/service_role
    IF v_caller_id IS NOT NULL AND v_caller_id != p_user_id THEN
        IF NOT (
            (auth.jwt()->>'role') IN ('admin', 'staff', 'service_role') OR
            ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff'))
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
        END IF;
    END IF;

    -- Lookup topic/subject from Phase 3A
    SELECT q.canonical_topic_id, t.subject_id
    INTO v_topic_id, v_subject_id
    FROM public.questions q
    LEFT JOIN public.topics t ON q.canonical_topic_id = t.id
    WHERE q.id = p_question_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Question not found');
    END IF;

    -- Atomic Upsert into user_mistake_vault
    SELECT id, lifecycle_status, primary_cognitive_type_id
    INTO v_vault_id, v_status, v_existing_cognitive
    FROM public.user_mistake_vault
    WHERE user_id = p_user_id AND question_id = p_question_id
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = total_mistakes_count + 1,
            consecutive_correct_in_remediation = 0,
            lifecycle_status = CASE WHEN lifecycle_status = 'MASTERED' THEN 'REVISITING' ELSE lifecycle_status END,
            primary_cognitive_type_id = CASE WHEN p_cognitive_type_id != 'UNCLASSIFIED' THEN p_cognitive_type_id ELSE primary_cognitive_type_id END,
            last_mistake_at = now(),
            updated_at = now()
        WHERE id = v_vault_id;
    ELSE
        INSERT INTO public.user_mistake_vault (
            user_id, question_id, topic_id, subject_id,
            total_mistakes_count, consecutive_correct_in_remediation,
            lifecycle_status, primary_cognitive_type_id, first_mistake_at, last_mistake_at
        ) VALUES (
            p_user_id, p_question_id, v_topic_id, v_subject_id,
            1, 0, 'UNRESOLVED', COALESCE(p_cognitive_type_id, 'UNCLASSIFIED'), now(), now()
        ) RETURNING id INTO v_vault_id;
    END IF;

    -- Insert into immutable occurrences ledger
    INSERT INTO public.user_mistake_occurrences (
        vault_id, user_id, question_id, source_context, source_reference_id,
        selected_option_id, response_time_seconds, inferred_cognitive_type_id,
        heuristic_confidence_pct, occurred_at
    ) VALUES (
        v_vault_id, p_user_id, p_question_id, p_source_context, p_source_reference_id,
        p_selected_option_id, p_response_time_seconds, COALESCE(p_cognitive_type_id, 'UNCLASSIFIED'),
        GREATEST(0, LEAST(100, COALESCE(p_confidence_pct, 50))), now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', v_vault_id,
        'question_id', p_question_id,
        'status', CASE WHEN v_status = 'MASTERED' THEN 'REVISITING' ELSE COALESCE(v_status, 'UNRESOLVED') END
    );
END;
$$;


-- 2. fn_generate_mistake_drill
CREATE OR REPLACE FUNCTION public.fn_generate_mistake_drill(
    p_topic_id UUID DEFAULT NULL,
    p_cognitive_type_id TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_limit INTEGER := GREATEST(1, LEAST(20, COALESCE(p_limit, 10)));
    v_drill_id UUID;
    v_drill_questions JSONB;
    v_q_ids UUID[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Select unmastered question IDs from user's vault
    SELECT array_agg(question_id) INTO v_q_ids
    FROM (
        SELECT question_id
        FROM public.user_mistake_vault
        WHERE user_id = v_user_id
          AND lifecycle_status IN ('UNRESOLVED', 'REVISITING')
          AND (p_topic_id IS NULL OR topic_id = p_topic_id)
          AND (p_cognitive_type_id IS NULL OR primary_cognitive_type_id = p_cognitive_type_id OR user_override_cognitive_type_id = p_cognitive_type_id)
        ORDER BY last_mistake_at DESC
        LIMIT v_limit
    ) q_set;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No unmastered mistakes found for requested criteria');
    END IF;

    -- Compile sanitized question payloads (scrubbed of is_correct & explanations)
    SELECT jsonb_agg(
        jsonb_build_object(
            'question_id', q.id,
            'question_text', qv.question_text,
            'topic_id', q.canonical_topic_id,
            'options', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', qo.id,
                        'option_key', qo.option_key,
                        'option_text', qo.option_text,
                        'order_index', qo.order_index
                    ) ORDER BY qo.order_index
                )
                FROM public.question_options qo
                WHERE qo.question_version_id = qv.id
            )
        )
    ) INTO v_drill_questions
    FROM public.questions q
    JOIN public.question_versions qv ON qv.question_id = q.id AND qv.is_current = true
    WHERE q.id = ANY(v_q_ids);

    -- Create drill session
    INSERT INTO public.user_mistake_drills (
        user_id, topic_id, cognitive_type_id, total_questions,
        questions_data, status
    ) VALUES (
        v_user_id, p_topic_id, p_cognitive_type_id, array_length(v_q_ids, 1),
        v_drill_questions, 'IN_PROGRESS'
    ) RETURNING id INTO v_drill_id;

    RETURN jsonb_build_object(
        'success', true,
        'drill_id', v_drill_id,
        'total_questions', array_length(v_q_ids, 1),
        'questions', v_drill_questions
    );
END;
$$;


-- 3. fn_submit_mistake_drill
CREATE OR REPLACE FUNCTION public.fn_submit_mistake_drill(
    p_drill_id UUID,
    p_answers JSONB -- Array of { question_id: UUID, selected_option_id: UUID, time_spent_seconds: INT }
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_drill_status TEXT;
    v_total_questions INTEGER;
    v_topic_id UUID;
    v_item JSONB;
    v_q_id UUID;
    v_opt_id UUID;
    v_time_spent INTEGER;
    v_is_correct BOOLEAN;
    v_correct_count INTEGER := 0;
    v_resolved_count INTEGER := 0;
    v_vault_id UUID;
    v_streak INTEGER;
    v_reward_res JSONB;
    v_coins_awarded INTEGER := 0;
    v_daily_drills_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Lock drill row
    SELECT status, total_questions, topic_id
    INTO v_drill_status, v_total_questions, v_topic_id
    FROM public.user_mistake_drills
    WHERE id = p_drill_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Drill session not found');
    END IF;

    IF v_drill_status != 'IN_PROGRESS' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Drill session is already completed or expired');
    END IF;

    -- Evaluate each answer item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_answers)
    LOOP
        v_q_id := (v_item->>'question_id')::uuid;
        v_opt_id := (v_item->>'selected_option_id')::uuid;
        v_time_spent := COALESCE((v_item->>'time_spent_seconds')::integer, 0);

        -- Check answer correctness against Phase 3A
        SELECT (qo.option_key = qa.correct_option_key) INTO v_is_correct
        FROM public.question_options qo
        JOIN public.question_versions qv ON qo.question_version_id = qv.id
        JOIN public.question_answers qa ON qa.question_version_id = qv.id
        WHERE qo.id = v_opt_id AND qv.question_id = v_q_id AND qv.is_current = true;

        IF v_is_correct IS NULL THEN
            v_is_correct := false;
        END IF;

        -- Update vault state
        SELECT id, consecutive_correct_in_remediation INTO v_vault_id, v_streak
        FROM public.user_mistake_vault
        WHERE user_id = v_user_id AND question_id = v_q_id
        FOR UPDATE;

        IF FOUND THEN
            IF v_is_correct THEN
                v_correct_count := v_correct_count + 1;
                v_streak := v_streak + 1;

                IF v_streak >= 2 THEN
                    -- Graduate to MASTERED
                    UPDATE public.user_mistake_vault
                    SET consecutive_correct_in_remediation = v_streak,
                        lifecycle_status = 'MASTERED',
                        mastered_at = now(),
                        last_practiced_at = now(),
                        updated_at = now()
                    WHERE id = v_vault_id;
                    v_resolved_count := v_resolved_count + 1;
                ELSE
                    -- Progress to REVISITING
                    UPDATE public.user_mistake_vault
                    SET consecutive_correct_in_remediation = v_streak,
                        lifecycle_status = 'REVISITING',
                        last_practiced_at = now(),
                        updated_at = now()
                    WHERE id = v_vault_id;
                END IF;
            ELSE
                -- Failed in drill: reset streak and log occurrence
                UPDATE public.user_mistake_vault
                SET total_mistakes_count = total_mistakes_count + 1,
                    consecutive_correct_in_remediation = 0,
                    lifecycle_status = 'UNRESOLVED',
                    last_mistake_at = now(),
                    last_practiced_at = now(),
                    updated_at = now()
                WHERE id = v_vault_id;

                INSERT INTO public.user_mistake_occurrences (
                    vault_id, user_id, question_id, source_context, source_reference_id,
                    selected_option_id, response_time_seconds, occurred_at
                ) VALUES (
                    v_vault_id, v_user_id, v_q_id, 'MISTAKE_DRILL', p_drill_id,
                    v_opt_id, v_time_spent, now()
                );
            END IF;
        END IF;
    END LOOP;

    -- Phase 3D Gamification Reward: 5 coins if qualifying (>= 5 questions, max 3/day)
    IF v_total_questions >= 5 THEN
        SELECT count(*) INTO v_daily_drills_count
        FROM public.user_mistake_drills
        WHERE user_id = v_user_id
          AND status = 'COMPLETED'
          AND coins_awarded > 0
          AND completed_at >= CURRENT_DATE;

        IF v_daily_drills_count < 3 THEN
            v_coins_awarded := 5;
            v_reward_res := public.fn_award_gamification_reward(
                v_user_id,
                'MISTAKE_DRILL_COMPLETED',
                'MISTAKE_DRILL',
                p_drill_id,
                'mistake_drill_' || p_drill_id || '_' || v_user_id,
                5,
                'MISTAKE_DRILL_COMPLETION',
                jsonb_build_object('drill_id', p_drill_id, 'correct_count', v_correct_count, 'resolved_count', v_resolved_count)
            );
        END IF;
    END IF;

    -- Complete Drill
    UPDATE public.user_mistake_drills
    SET status = 'COMPLETED',
        correct_count = v_correct_count,
        mistakes_resolved_count = v_resolved_count,
        coins_awarded = v_coins_awarded,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_drill_id;

    -- Phase 3C Activity Logging
    IF v_topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (
            user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at
        ) VALUES (
            v_user_id, v_topic_id, 'mistake-drill-' || p_drill_id, 'TOPIC_LEARNING_ACTIVITY',
            COALESCE(v_total_questions * 30, 60),
            jsonb_build_object('activity_type', 'MISTAKE_DRILL', 'drill_id', p_drill_id, 'score', v_correct_count),
            now()
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'drill_id', p_drill_id,
        'total_questions', v_total_questions,
        'correct_count', v_correct_count,
        'mistakes_resolved_count', v_resolved_count,
        'coins_awarded', v_coins_awarded
    );
END;
$$;


-- 4. fn_override_mistake_cognitive_type
CREATE OR REPLACE FUNCTION public.fn_override_mistake_cognitive_type(
    p_vault_id UUID,
    p_user_override_type_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.mistake_cognitive_types WHERE id = p_user_override_type_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid cognitive type');
    END IF;

    UPDATE public.user_mistake_vault
    SET user_override_cognitive_type_id = p_user_override_type_id,
        updated_at = now()
    WHERE id = p_vault_id AND user_id = v_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mistake record not found or permission denied');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', p_vault_id,
        'user_override_cognitive_type_id', p_user_override_type_id
    );
END;
$$;


-- ============================================================================
-- PERMISSIONS & SCHEMA NOTIFY
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(UUID, UUID, TEXT, UUID, UUID, INTEGER, TEXT, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(UUID, UUID, TEXT, UUID, UUID, INTEGER, TEXT, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_generate_mistake_drill(UUID, TEXT, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_generate_mistake_drill(UUID, TEXT, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_submit_mistake_drill(UUID, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_submit_mistake_drill(UUID, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_override_mistake_cognitive_type(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';