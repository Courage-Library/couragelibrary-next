-- ============================================================================
-- COURAGE LIBRARY â€” PHASE 3P: FACULTY COACHING BATCHES & INSTITUTIONAL COHORTS
-- Migration: 20260825000031_phase3p_institutional_batches.sql
-- Target Schema: couragelibrary-next
-- Baseline: 97 PostgreSQL Base Tables -> Expected: 101 Base Tables
-- ============================================================================

-- 1. TABLE: institutes
CREATE TABLE IF NOT EXISTS public.institutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    website_url TEXT,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
    is_verified BOOLEAN NOT NULL DEFAULT false,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_institute_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_institutes_owner ON public.institutes (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_institutes_status ON public.institutes (status) WHERE status = 'ACTIVE';


-- 2. TABLE: institute_batches
CREATE TABLE IF NOT EXISTS public.institute_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    target_exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    max_capacity INTEGER NOT NULL DEFAULT 100 CHECK (max_capacity BETWEEN 1 AND 5000),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED')),
    start_date DATE,
    end_date DATE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_institute_batch_slug UNIQUE (institute_id, slug),
    CONSTRAINT chk_batch_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_batches_institute ON public.institute_batches (institute_id, status);
CREATE INDEX IF NOT EXISTS idx_batches_exam ON public.institute_batches (target_exam_id);


-- 3. TABLE: batch_memberships
CREATE TABLE IF NOT EXISTS public.batch_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.institute_batches(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'FACULTY', 'MENTOR', 'INSTITUTE_ADMIN')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED')),
    invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_batch_user_membership UNIQUE (batch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_bm_user ON public.batch_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_bm_batch_role ON public.batch_memberships (batch_id, role, status);
CREATE INDEX IF NOT EXISTS idx_bm_institute ON public.batch_memberships (institute_id);


-- 4. TABLE: batch_curriculum_assignments
CREATE TABLE IF NOT EXISTS public.batch_curriculum_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.institute_batches(id) ON DELETE CASCADE,
    institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    instructions_md TEXT,
    assignment_type TEXT NOT NULL CHECK (assignment_type IN ('MOCK_TEST', 'COURSE', 'COURSE_LESSON', 'FLASHCARD_DECK', 'ARTICLE', 'MISTAKE_DRILL')),
    
    mock_test_id UUID REFERENCES public.mock_tests(id) ON DELETE CASCADE,
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    course_lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE CASCADE,
    flashcard_deck_id UUID REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
    
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    due_at TIMESTAMPTZ,
    available_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    assigned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT chk_assignment_content_xor CHECK (
        num_nonnulls(mock_test_id, course_id, course_lesson_id, flashcard_deck_id, article_id, topic_id) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_bca_batch_due ON public.batch_curriculum_assignments (batch_id, due_at, status);
CREATE INDEX IF NOT EXISTS idx_bca_institute ON public.batch_curriculum_assignments (institute_id);


-- ============================================================================
-- NON-RECURSIVE SECURITY DEFINER HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_is_institute_member(
    p_institute_id UUID,
    p_user_id UUID,
    p_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_institute_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;
    
    -- Check owner
    IF EXISTS (SELECT 1 FROM public.institutes WHERE id = p_institute_id AND owner_user_id = p_user_id) THEN
        RETURN true;
    END IF;

    -- Check active batch memberships in this institute
    RETURN EXISTS (
        SELECT 1 FROM public.batch_memberships
        WHERE institute_id = p_institute_id
          AND user_id = p_user_id
          AND status = 'ACTIVE'
          AND (p_roles IS NULL OR role = ANY(p_roles))
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_is_batch_member(
    p_batch_id UUID,
    p_user_id UUID,
    p_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_batch_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

    RETURN EXISTS (
        SELECT 1 FROM public.batch_memberships
        WHERE batch_id = p_batch_id
          AND user_id = p_user_id
          AND status = 'ACTIVE'
          AND (p_roles IS NULL OR role = ANY(p_roles))
    );
END;
$$;


CREATE OR REPLACE FUNCTION public.fn_has_batch_faculty_access(
    p_batch_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inst_id UUID;
BEGIN
    IF p_batch_id IS NULL OR p_user_id IS NULL THEN RETURN false; END IF;

    SELECT institute_id INTO v_inst_id FROM public.institute_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN RETURN false; END IF;

    -- Check if owner of institute
    IF EXISTS (SELECT 1 FROM public.institutes WHERE id = v_inst_id AND owner_user_id = p_user_id) THEN
        RETURN true;
    END IF;

    -- Check if assigned FACULTY, MENTOR, or INSTITUTE_ADMIN in this specific batch
    RETURN EXISTS (
        SELECT 1 FROM public.batch_memberships
        WHERE batch_id = p_batch_id
          AND user_id = p_user_id
          AND status = 'ACTIVE'
          AND role IN ('FACULTY', 'MENTOR', 'INSTITUTE_ADMIN')
    );
END;
$$;


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.institutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_institutes_select ON public.institutes;
CREATE POLICY p_institutes_select ON public.institutes
    FOR SELECT TO authenticated
    USING (
        is_verified = true OR
        owner_user_id = auth.uid() OR
        public.fn_is_institute_member(id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_institutes_manage_owner ON public.institutes;
CREATE POLICY p_institutes_manage_owner ON public.institutes
    FOR ALL TO authenticated
    USING (
        owner_user_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        owner_user_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.institute_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_batches_select ON public.institute_batches;
CREATE POLICY p_batches_select ON public.institute_batches
    FOR SELECT TO authenticated
    USING (
        public.fn_is_batch_member(id, auth.uid()) OR
        public.fn_is_institute_member(institute_id, auth.uid(), ARRAY['INSTITUTE_ADMIN']) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_batches_manage_faculty ON public.institute_batches;
CREATE POLICY p_batches_manage_faculty ON public.institute_batches
    FOR ALL TO authenticated
    USING (
        public.fn_has_batch_faculty_access(id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        public.fn_has_batch_faculty_access(id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.batch_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_bm_select ON public.batch_memberships;
CREATE POLICY p_bm_select ON public.batch_memberships
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid() OR
        public.fn_is_batch_member(batch_id, auth.uid()) OR
        public.fn_is_institute_member(institute_id, auth.uid(), ARRAY['INSTITUTE_ADMIN']) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_bm_manage_faculty ON public.batch_memberships;
CREATE POLICY p_bm_manage_faculty ON public.batch_memberships
    FOR ALL TO authenticated
    USING (
        public.fn_has_batch_faculty_access(batch_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        public.fn_has_batch_faculty_access(batch_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


ALTER TABLE public.batch_curriculum_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_bca_select ON public.batch_curriculum_assignments;
CREATE POLICY p_bca_select ON public.batch_curriculum_assignments
    FOR SELECT TO authenticated
    USING (
        (status = 'PUBLISHED' AND public.fn_is_batch_member(batch_id, auth.uid())) OR
        public.fn_has_batch_faculty_access(batch_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

DROP POLICY IF EXISTS p_bca_manage_faculty ON public.batch_curriculum_assignments;
CREATE POLICY p_bca_manage_faculty ON public.batch_curriculum_assignments
    FOR ALL TO authenticated
    USING (
        public.fn_has_batch_faculty_access(batch_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        public.fn_has_batch_faculty_access(batch_id, auth.uid()) OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- ============================================================================
-- RUNTIME RPCS (SECURITY DEFINER)
-- ============================================================================

-- 1. fn_enroll_batch_student (Row-locked Capacity Check)
CREATE OR REPLACE FUNCTION public.fn_enroll_batch_student(
    p_batch_id UUID,
    p_student_user_id UUID,
    p_role TEXT DEFAULT 'STUDENT'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_inst_id UUID;
    v_max_cap INTEGER;
    v_cur_count INTEGER;
    v_membership_id UUID;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(p_batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            (COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff'))
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    -- Concurrency Lock: Lock batch row before evaluating capacity
    SELECT institute_id, max_capacity
    INTO v_inst_id, v_max_cap
    FROM public.institute_batches
    WHERE id = p_batch_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Batch not found');
    END IF;

    -- Count active students
    SELECT count(*) INTO v_cur_count
    FROM public.batch_memberships
    WHERE batch_id = p_batch_id AND role = 'STUDENT' AND status = 'ACTIVE';

    IF p_role = 'STUDENT' AND v_cur_count >= v_max_cap THEN
        RETURN jsonb_build_object('success', false, 'error', 'Batch has reached maximum capacity (' || v_max_cap || ')');
    END IF;

    -- Upsert membership
    INSERT INTO public.batch_memberships (
        batch_id, institute_id, user_id, role, status, invited_by_user_id, joined_at
    ) VALUES (
        p_batch_id, v_inst_id, p_student_user_id, COALESCE(p_role, 'STUDENT'), 'ACTIVE', v_caller_id, now()
    )
    ON CONFLICT (batch_id, user_id) DO UPDATE
    SET role = EXCLUDED.role,
        status = 'ACTIVE',
        left_at = NULL,
        updated_at = now()
    RETURNING id INTO v_membership_id;

    RETURN jsonb_build_object(
        'success', true,
        'membership_id', v_membership_id,
        'batch_id', p_batch_id,
        'user_id', p_student_user_id,
        'role', COALESCE(p_role, 'STUDENT'),
        'current_active_count', v_cur_count + 1
    );
END;
$$;


-- 2. fn_create_batch_assignment
CREATE OR REPLACE FUNCTION public.fn_create_batch_assignment(
    p_batch_id UUID,
    p_title TEXT,
    p_assignment_type TEXT,
    p_content_id UUID,
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_instructions_md TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_inst_id UUID;
    v_assignment_id UUID;
    v_mock_id UUID;
    v_course_id UUID;
    v_lesson_id UUID;
    v_deck_id UUID;
    v_article_id UUID;
    v_topic_id UUID;
BEGIN
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(p_batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            (COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff'))
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    SELECT institute_id INTO v_inst_id FROM public.institute_batches WHERE id = p_batch_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Batch not found'); END IF;

    -- Map explicit typed content FK
    IF p_assignment_type = 'MOCK_TEST' THEN v_mock_id := p_content_id;
    ELSIF p_assignment_type = 'COURSE' THEN v_course_id := p_content_id;
    ELSIF p_assignment_type = 'COURSE_LESSON' THEN v_lesson_id := p_content_id;
    ELSIF p_assignment_type = 'FLASHCARD_DECK' THEN v_deck_id := p_content_id;
    ELSIF p_assignment_type = 'ARTICLE' THEN v_article_id := p_content_id;
    ELSIF p_assignment_type = 'MISTAKE_DRILL' THEN v_topic_id := p_content_id;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Invalid assignment type');
    END IF;

    INSERT INTO public.batch_curriculum_assignments (
        batch_id, institute_id, title, instructions_md, assignment_type,
        mock_test_id, course_id, course_lesson_id, flashcard_deck_id, article_id, topic_id,
        due_at, assigned_by_user_id
    ) VALUES (
        p_batch_id, v_inst_id, p_title, p_instructions_md, p_assignment_type,
        v_mock_id, v_course_id, v_lesson_id, v_deck_id, v_article_id, v_topic_id,
        p_due_at, v_caller_id
    ) RETURNING id INTO v_assignment_id;

    RETURN jsonb_build_object('success', true, 'assignment_id', v_assignment_id);
END;
$$;


-- 3. fn_get_batch_assignment_progress
CREATE OR REPLACE FUNCTION public.fn_get_batch_assignment_progress(
    p_assignment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_assignment RECORD;
    v_student_count INTEGER;
    v_completed_count INTEGER := 0;
BEGIN
    SELECT * INTO v_assignment FROM public.batch_curriculum_assignments WHERE id = p_assignment_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Assignment not found'); END IF;

    -- Verify caller is faculty/admin for batch or global staff
    IF v_caller_id IS NOT NULL AND
       NOT public.fn_has_batch_faculty_access(v_assignment.batch_id, v_caller_id) AND
       NOT (
            COALESCE(auth.jwt()->>'role', '') IN ('admin', 'staff', 'service_role') OR
            (COALESCE(auth.jwt()->'app_metadata'->>'role', '') IN ('admin', 'staff'))
       ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
    END IF;

    SELECT count(*) INTO v_student_count
    FROM public.batch_memberships
    WHERE batch_id = v_assignment.batch_id AND role = 'STUDENT' AND status = 'ACTIVE';

    -- Derive completion by assignment type from existing Phase 3B/3F/3M/3O tables
    IF v_assignment.assignment_type = 'MOCK_TEST' THEN
        SELECT count(DISTINCT ta.user_id) INTO v_completed_count
        FROM public.test_attempts ta
        JOIN public.batch_memberships bm ON ta.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND ta.mock_test_id = v_assignment.mock_test_id
          AND ta.status = 'completed'
          AND ta.started_at >= v_assignment.available_from;
    ELSIF v_assignment.assignment_type = 'FLASHCARD_DECK' THEN
        SELECT count(DISTINCT udp.user_id) INTO v_completed_count
        FROM public.user_deck_progress udp
        JOIN public.batch_memberships bm ON udp.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND udp.deck_id = v_assignment.flashcard_deck_id
          AND udp.total_cards_mastered >= 5;
    ELSIF v_assignment.assignment_type = 'COURSE_LESSON' THEN
        SELECT count(DISTINCT ulc.user_id) INTO v_completed_count
        FROM public.user_lesson_completions ulc
        JOIN public.batch_memberships bm ON ulc.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND ulc.lesson_id = v_assignment.course_lesson_id;
    ELSIF v_assignment.assignment_type = 'MISTAKE_DRILL' THEN
        SELECT count(DISTINCT umd.user_id) INTO v_completed_count
        FROM public.user_mistake_drills umd
        JOIN public.batch_memberships bm ON umd.user_id = bm.user_id
        WHERE bm.batch_id = v_assignment.batch_id
          AND bm.status = 'ACTIVE'
          AND umd.status = 'COMPLETED'
          AND umd.started_at >= v_assignment.available_from;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'assignment_id', p_assignment_id,
        'total_students', v_student_count,
        'completed_students', v_completed_count,
        'completion_rate_pct', CASE WHEN v_student_count > 0 THEN round((v_completed_count::numeric / v_student_count::numeric) * 100, 1) ELSE 0 END
    );
END;
$$;


-- ============================================================================
-- PERMISSIONS & SCHEMA NOTIFY
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.fn_is_institute_member(UUID, UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_is_batch_member(UUID, UUID, TEXT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_has_batch_faculty_access(UUID, UUID) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.fn_enroll_batch_student(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_create_batch_assignment(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_get_batch_assignment_progress(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';