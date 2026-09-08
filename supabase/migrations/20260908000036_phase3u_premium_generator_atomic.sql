-- ============================================================================
-- COURAGE LIBRARY — PHASE 3U: ATOMIC DYNAMIC MOCK INSTANCE CREATION
-- Target Database: couragelibrary-next
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_create_dynamic_mock_instance_atomic(
    p_user_id UUID,
    p_exam_id UUID,
    p_template_id UUID,
    p_title TEXT,
    p_slug TEXT,
    p_test_type TEXT,
    p_quota_key TEXT,
    p_duration_minutes INTEGER,
    p_marks_per_question NUMERIC,
    p_negative_mark NUMERIC,
    p_metadata JSONB,
    p_questions JSONB,
    p_ttl_hours INTEGER DEFAULT 48
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
    v_expires_at TIMESTAMPTZ := v_now + (p_ttl_hours || ' hours')::INTERVAL;
    v_mock_test_id UUID;
    v_section_id UUID;
    v_total_questions INT;
    v_total_marks NUMERIC(6, 2);
    v_q RECORD;
    v_order INT := 1;
    v_subject_id UUID;
BEGIN
    v_total_questions := jsonb_array_length(p_questions);
    IF v_total_questions = 0 THEN
        RAISE EXCEPTION 'CANNOT_CREATE_EMPTY_TEST';
    END IF;

    v_total_marks := v_total_questions * p_marks_per_question;

    -- Extract subject_id from first question if available
    IF (p_questions->0) ? 'subject_id' AND (p_questions->0->>'subject_id') IS NOT NULL THEN
        v_subject_id := (p_questions->0->>'subject_id')::UUID;
    ELSE
        v_subject_id := NULL;
    END IF;

    -- 1. Insert mock_tests row
    INSERT INTO public.mock_tests (
        template_id,
        title,
        slug,
        status,
        duration_minutes,
        total_questions,
        total_marks,
        is_free,
        is_dynamic,
        created_for_user_id,
        lifecycle_status,
        expires_at,
        generation_metadata
    ) VALUES (
        p_template_id,
        p_title,
        p_slug,
        'published',
        p_duration_minutes,
        v_total_questions,
        v_total_marks,
        false,
        true,
        p_user_id,
        'GENERATED',
        v_expires_at,
        p_metadata
    ) RETURNING id INTO v_mock_test_id;

    -- 2. Insert mock_sections row
    INSERT INTO public.mock_sections (
        mock_test_id,
        subject_id,
        section_name,
        section_order,
        num_questions,
        marks_per_question,
        negative_mark,
        duration_minutes
    ) VALUES (
        v_mock_test_id,
        v_subject_id,
        'Practice Section',
        1,
        v_total_questions,
        p_marks_per_question,
        p_negative_mark,
        p_duration_minutes
    ) RETURNING id INTO v_section_id;

    -- 3. Insert mock_questions rows in atomic loop
    FOR v_q IN SELECT * FROM jsonb_to_recordset(p_questions) AS x(
        question_version_id UUID,
        subject_id UUID,
        question_order INT,
        marks NUMERIC,
        negative_mark NUMERIC
    )
    LOOP
        INSERT INTO public.mock_questions (
            mock_test_id,
            mock_section_id,
            question_version_id,
            question_order,
            marks,
            negative_mark
        ) VALUES (
            v_mock_test_id,
            v_section_id,
            v_q.question_version_id,
            COALESCE(v_q.question_order, v_order),
            COALESCE(v_q.marks, p_marks_per_question),
            COALESCE(v_q.negative_mark, p_negative_mark)
        );
        v_order := v_order + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'mock_test_id', v_mock_test_id,
        'slug', p_slug,
        'title', p_title,
        'test_type', p_test_type,
        'quota_key', p_quota_key,
        'total_questions', v_total_questions,
        'total_marks', v_total_marks,
        'duration_minutes', p_duration_minutes,
        'lifecycle_status', 'GENERATED',
        'expires_at', v_expires_at,
        'is_dynamic', true,
        'is_free', false
    );
END;
$$;

-- Grant execution to service_role & authenticated
GRANT EXECUTE ON FUNCTION public.fn_create_dynamic_mock_instance_atomic(
    UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, NUMERIC, NUMERIC, JSONB, JSONB, INTEGER
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
