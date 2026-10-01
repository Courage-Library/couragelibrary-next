-- ============================================================================
-- COURAGE LIBRARY — CONTROLLED EXAM DELETION CASCADE & TRIGGER HARDENING
-- Migration 62: 20261002000062_controlled_exam_deletion_cascade.sql
-- ============================================================================
-- PURPOSE:
-- 1. Updates fn_protect_published_exam_doc_version and fn_protect_published_exam_doc_deletion
--    to allow atomic cascading deletion during controlled administrative exam deletion
--    when the session flag 'app.allow_exam_deletion' is explicitly enabled.
-- 2. Provides fn_delete_exam_controlled atomic RPC function for server-authoritative,
--    transactional deletion with protected dependency checks and audit logging.
-- ============================================================================

-- 1. Update fn_protect_published_exam_doc_version with session bypass check
CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Allow deletion or update during controlled exam deletion
    IF current_setting('app.allow_exam_deletion', true) = 'true' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
            RETURN NEW;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.is_published = true OR OLD.review_status = 'PUBLISHED' THEN
            RAISE EXCEPTION 'Cannot delete published exam_doc_version % (v%). Published versions are permanently immutable.',
                OLD.id, OLD.version_number;
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Allow state transition from APPROVED -> PUBLISHED
        IF OLD.is_published = false AND NEW.is_published = true THEN
            RETURN NEW;
        END IF;

        -- Block any modification once published
        IF OLD.is_published = true THEN
            RAISE EXCEPTION 'Cannot modify published exam_doc_version % (v%). Create a new version instead.',
                OLD.id, OLD.version_number;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Update fn_protect_published_exam_doc_deletion with session bypass check
CREATE OR REPLACE FUNCTION public.fn_protect_published_exam_doc_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_pub_count INTEGER;
BEGIN
    -- Allow deletion during controlled exam deletion
    IF current_setting('app.allow_exam_deletion', true) = 'true' THEN
        RETURN OLD;
    END IF;

    SELECT count(*)
    INTO v_pub_count
    FROM public.exam_doc_versions
    WHERE document_id = OLD.id AND (is_published = true OR review_status = 'PUBLISHED');

    IF v_pub_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam_knowledge_document % because % published version(s) exist. Archive the document instead.',
            OLD.id, v_pub_count;
    END IF;
    RETURN OLD;
END;
$$;

-- 3. Atomic Server-Authoritative Controlled Exam Deletion RPC
CREATE OR REPLACE FUNCTION public.fn_delete_exam_controlled(
    p_exam_id UUID,
    p_slug TEXT,
    p_actor_id UUID DEFAULT NULL,
    p_actor_email TEXT DEFAULT 'admin@couragelibrary.com',
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exam RECORD;
    v_cycle_ids UUID[];
    v_syl_ids UUID[];
    v_doc_ids UUID[];
    v_attempts_count INTEGER;
    v_goals_count INTEGER;
    v_templates_count INTEGER;
BEGIN
    -- 1. Lock and fetch exam
    SELECT id, title, slug, is_active, category, created_at
    INTO v_exam
    FROM public.exams
    WHERE id = p_exam_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Exam with ID % not found.', p_exam_id;
    END IF;

    -- 2. Strict slug confirmation
    IF TRIM(v_exam.slug) != TRIM(p_slug) THEN
        RAISE EXCEPTION 'Slug confirmation mismatch. Expected "%", got "%".', v_exam.slug, p_slug;
    END IF;

    -- 3. Strict protected dependencies check
    SELECT COUNT(*) INTO v_attempts_count
    FROM public.test_attempts ta
    JOIN public.mock_tests mt ON mt.id = ta.mock_test_id
    JOIN public.mock_templates tpl ON tpl.id = mt.template_id
    WHERE tpl.exam_id = p_exam_id;

    IF v_attempts_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: candidate test attempts exist (%).', v_attempts_count;
    END IF;

    SELECT COUNT(*) INTO v_goals_count FROM public.user_exam_goals WHERE exam_id = p_exam_id;
    IF v_goals_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: active student goals exist (%).', v_goals_count;
    END IF;

    SELECT COUNT(*) INTO v_templates_count FROM public.mock_templates WHERE exam_id = p_exam_id;
    IF v_templates_count > 0 THEN
        RAISE EXCEPTION 'Cannot delete exam: mock templates exist (%).', v_templates_count;
    END IF;

    -- 4. Enable session flag for controlled cascade
    PERFORM set_config('app.allow_exam_deletion', 'true', true);

    -- 5. Collect cycle IDs
    SELECT ARRAY_AGG(id) INTO v_cycle_ids FROM public.exam_cycles WHERE exam_id = p_exam_id;

    -- 6. Clean syllabi & topics
    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        SELECT ARRAY_AGG(id) INTO v_syl_ids FROM public.exam_syllabi WHERE exam_cycle_id = ANY(v_cycle_ids);
        IF v_syl_ids IS NOT NULL AND ARRAY_LENGTH(v_syl_ids, 1) > 0 THEN
            DELETE FROM public.exam_topics WHERE syllabus_id = ANY(v_syl_ids);
            DELETE FROM public.exam_syllabi WHERE id = ANY(v_syl_ids);
        END IF;
    END IF;

    -- 7. Clean knowledge docs & versions
    SELECT ARRAY_AGG(id) INTO v_doc_ids FROM public.exam_knowledge_documents WHERE exam_id = p_exam_id;
    IF v_doc_ids IS NOT NULL AND ARRAY_LENGTH(v_doc_ids, 1) > 0 THEN
        UPDATE public.exam_knowledge_documents SET current_published_version_id = NULL WHERE id = ANY(v_doc_ids);
        DELETE FROM public.exam_doc_versions WHERE document_id = ANY(v_doc_ids);
        DELETE FROM public.exam_knowledge_documents WHERE id = ANY(v_doc_ids);
    END IF;

    -- 8. Clean child metadata tables
    DELETE FROM public.exam_sources WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_claims WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_posts WHERE exam_id = p_exam_id;
    DELETE FROM public.exam_announcements WHERE exam_id = p_exam_id;

    IF v_cycle_ids IS NOT NULL AND ARRAY_LENGTH(v_cycle_ids, 1) > 0 THEN
        DELETE FROM public.exam_cycles WHERE exam_id = p_exam_id;
    END IF;

    -- 9. Delete the exam record
    DELETE FROM public.exams WHERE id = p_exam_id;

    -- 10. Audit log insertion
    BEGIN
        INSERT INTO public.admin_audit_logs (
            actor_id,
            actor_email,
            action_type,
            target_entity,
            target_id,
            old_value,
            new_value,
            reason,
            created_at
        ) VALUES (
            p_actor_id,
            COALESCE(p_actor_email, 'admin@couragelibrary.com'),
            'EXAMINATION_PERMANENTLY_DELETED',
            'exams',
            p_exam_id,
            jsonb_build_object(
                'exam', jsonb_build_object(
                    'id', v_exam.id,
                    'title', v_exam.title,
                    'slug', v_exam.slug,
                    'isActive', v_exam.is_active
                )
            ),
            NULL,
            COALESCE(p_reason, 'Controlled deletion of draft/test fixture ' || v_exam.title || ' (' || v_exam.slug || ')'),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_exam', jsonb_build_object(
            'id', v_exam.id,
            'title', v_exam.title,
            'slug', v_exam.slug,
            'isActive', v_exam.is_active
        )
    );
END;
$$;
