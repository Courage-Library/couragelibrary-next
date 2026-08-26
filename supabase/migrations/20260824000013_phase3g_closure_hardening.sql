-- ============================================================================
-- COURAGE LIBRARY — PHASE 3G: CLOSURE HARDENING & INTEGRATION PASS
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Composite Key on question_versions for strict question-version integrity
ALTER TABLE public.question_versions
    ADD CONSTRAINT uq_question_version_pair UNIQUE (id, question_id);

-- 2. Enforce Composite Foreign Keys on Bookmarks and Errata Reports
ALTER TABLE public.user_question_bookmarks
    DROP CONSTRAINT IF EXISTS user_question_bookmarks_question_version_id_fkey,
    ADD CONSTRAINT fk_uqb_question_version_pair
    FOREIGN KEY (question_version_id, question_id)
    REFERENCES public.question_versions(id, question_id) ON DELETE RESTRICT;

ALTER TABLE public.question_errata_reports
    DROP CONSTRAINT IF EXISTS question_errata_reports_question_version_id_fkey,
    ADD CONSTRAINT fk_qer_question_version_pair
    FOREIGN KEY (question_version_id, question_id)
    REFERENCES public.question_versions(id, question_id) ON DELETE RESTRICT;

-- 3. Bookmark Folder Ownership Trigger
CREATE OR REPLACE FUNCTION public.fn_validate_bookmark_folder_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.folder_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_bookmark_folders
            WHERE id = NEW.folder_id AND user_id = NEW.user_id
        ) THEN
            RAISE EXCEPTION 'Ownership violation: Bookmark folder does not belong to user';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bookmark_folder_ownership ON public.user_question_bookmarks;
CREATE TRIGGER trg_validate_bookmark_folder_ownership
    BEFORE INSERT OR UPDATE OF folder_id, user_id ON public.user_question_bookmarks
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_bookmark_folder_ownership();

-- 4. Practice Session Lifecycle & Immutability Trigger
CREATE OR REPLACE FUNCTION public.fn_enforce_practice_session_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Reject modification of frozen fields once READY, ACTIVE, SUBMITTED, or ABANDONED
    IF OLD.status IN ('READY', 'ACTIVE', 'SUBMITTED', 'ABANDONED') THEN
        IF NEW.question_version_ids_json != OLD.question_version_ids_json OR
           NEW.total_questions != OLD.total_questions OR
           NEW.session_mode != OLD.session_mode OR
           NEW.target_topic_ids_json != OLD.target_topic_ids_json THEN
            RAISE EXCEPTION 'Immutability violation: Frozen question snapshot cannot be modified';
        END IF;
    END IF;

    -- Enforce legal state transitions
    IF NEW.status != OLD.status THEN
        IF OLD.status = 'DRAFT' AND NEW.status NOT IN ('READY', 'ABANDONED') THEN
            RAISE EXCEPTION 'Illegal transition: DRAFT can only transition to READY or ABANDONED';
        ELSIF OLD.status = 'READY' AND NEW.status NOT IN ('ACTIVE', 'ABANDONED') THEN
            RAISE EXCEPTION 'Illegal transition: READY can only transition to ACTIVE or ABANDONED';
        ELSIF OLD.status = 'ACTIVE' AND NEW.status NOT IN ('SUBMITTED', 'ABANDONED') THEN
            RAISE EXCEPTION 'Illegal transition: ACTIVE can only transition to SUBMITTED or ABANDONED';
        ELSIF OLD.status IN ('SUBMITTED', 'ABANDONED') THEN
            RAISE EXCEPTION 'Terminal state violation: Cannot modify session from %', OLD.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_practice_session_lifecycle ON public.custom_practice_sessions;
CREATE TRIGGER trg_enforce_practice_session_lifecycle
    BEFORE UPDATE ON public.custom_practice_sessions
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_practice_session_lifecycle();

-- 5. Errata State Machine Trigger
CREATE OR REPLACE FUNCTION public.fn_enforce_errata_state_machine()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status != OLD.status THEN
        IF OLD.status = 'OPEN' AND NEW.status NOT IN ('UNDER_REVIEW', 'REJECTED') THEN
            RAISE EXCEPTION 'Illegal transition: OPEN can only transition to UNDER_REVIEW or REJECTED';
        ELSIF OLD.status = 'UNDER_REVIEW' AND NEW.status NOT IN ('VERIFIED', 'REJECTED') THEN
            RAISE EXCEPTION 'Illegal transition: UNDER_REVIEW can only transition to VERIFIED or REJECTED';
        ELSIF OLD.status = 'VERIFIED' AND NEW.status NOT IN ('RESOLVED') THEN
            RAISE EXCEPTION 'Illegal transition: VERIFIED can only transition to RESOLVED';
        ELSIF OLD.status IN ('RESOLVED', 'REJECTED') THEN
            RAISE EXCEPTION 'Terminal state violation: Errata report is already closed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_errata_state_machine ON public.question_errata_reports;
CREATE TRIGGER trg_enforce_errata_state_machine
    BEFORE UPDATE OF status ON public.question_errata_reports
    FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_errata_state_machine();

-- 6. Hardened Practice Generator with Full Mode Semantics
CREATE OR REPLACE FUNCTION public.fn_generate_custom_practice_session(
    p_title TEXT,
    p_session_mode TEXT,
    p_topic_ids UUID[] DEFAULT NULL,
    p_question_count INTEGER DEFAULT 20,
    p_manual_question_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_count INTEGER;
    v_version_ids UUID[];
    v_session_id UUID;
    v_weak_topic_ids UUID[];
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    v_count := LEAST(GREATEST(p_question_count, 5), 100);

    IF p_session_mode = 'MANUAL_SELECTION' THEN
        IF p_manual_question_ids IS NULL OR array_length(p_manual_question_ids, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'No question IDs provided for manual selection');
        END IF;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE q.id = ANY(p_manual_question_ids) AND qv.is_current = true
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'BOOKMARKED' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT uqb.question_version_id AS id
            FROM public.user_question_bookmarks uqb
            JOIN public.questions q ON q.id = uqb.question_id
            JOIN public.question_versions qv ON qv.id = uqb.question_version_id
            WHERE uqb.user_id = v_user_id
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY uqb.created_at DESC
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'WRONG_QUESTIONS' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.attempt_answers aa
            JOIN public.test_attempts ta ON ta.id = aa.attempt_id
            JOIN public.mock_questions mq ON mq.id = aa.mock_question_id
            JOIN public.question_versions qv ON qv.id = mq.question_version_id
            JOIN public.questions q ON q.id = qv.question_id
            WHERE ta.user_id = v_user_id
              AND aa.is_correct = false
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            GROUP BY qv.id
            ORDER BY COUNT(aa.id) DESC
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'WEAK_TOPICS' THEN
        -- Resolve lowest mastery topics for user
        SELECT ARRAY_AGG(canonical_topic_id) INTO v_weak_topic_ids
        FROM (
            SELECT canonical_topic_id
            FROM public.user_topic_mastery
            WHERE user_id = v_user_id
              AND (p_topic_ids IS NULL OR canonical_topic_id = ANY(p_topic_ids))
            ORDER BY mastery_score ASC, confidence_level ASC
            LIMIT 5
        ) wt;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND (v_weak_topic_ids IS NOT NULL AND q.canonical_topic_id = ANY(v_weak_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'FORGOTTEN_TOPICS' THEN
        -- Resolve topics with oldest evaluation recency (decay)
        SELECT ARRAY_AGG(canonical_topic_id) INTO v_weak_topic_ids
        FROM (
            SELECT canonical_topic_id
            FROM public.user_topic_mastery
            WHERE user_id = v_user_id
              AND (p_topic_ids IS NULL OR canonical_topic_id = ANY(p_topic_ids))
            ORDER BY last_evaluated_at ASC
            LIMIT 5
        ) ft;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND (v_weak_topic_ids IS NOT NULL AND q.canonical_topic_id = ANY(v_weak_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'PYQ' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT DISTINCT qv.id
            FROM public.question_sources qs
            JOIN public.questions q ON q.id = qs.question_id
            JOIN public.question_versions qv ON qv.question_id = q.id AND qv.is_current = true
            WHERE qs.source_type = 'PYQ'
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY qv.id
            LIMIT v_count
        ) qv;

    ELSE
        -- MIXED: Blend of bookmarks, wrong questions, weak topics, and PYQs
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;
    END IF;

    IF v_version_ids IS NULL OR array_length(v_version_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No qualifying questions found for selected criteria');
    END IF;

    INSERT INTO public.custom_practice_sessions (
        user_id, title, session_mode, target_topic_ids_json,
        total_questions, question_version_ids_json, status, created_at
    ) VALUES (
        v_user_id, COALESCE(p_title, 'Custom Practice - ' || p_session_mode),
        p_session_mode, to_jsonb(p_topic_ids),
        array_length(v_version_ids, 1), to_jsonb(v_version_ids),
        'READY', now()
    ) RETURNING id INTO v_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'question_count', array_length(v_version_ids, 1),
        'question_version_ids', v_version_ids
    );
END;
$$;

-- 7. Phase 3B Test Engine Bridge: Start Practice Session
CREATE OR REPLACE FUNCTION public.fn_start_custom_practice_session(
    p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_session RECORD;
    v_attempt_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    SELECT * INTO v_session
    FROM public.custom_practice_sessions
    WHERE id = p_session_id AND user_id = v_user_id;

    IF v_session IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session not found');
    END IF;

    IF v_session.status != 'READY' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session cannot be started from status: ' || v_session.status);
    END IF;

    -- Create linked Phase 3B test attempt if not already present
    IF v_session.test_attempt_id IS NULL THEN
        INSERT INTO public.test_attempts (
            user_id, status, started_at
        ) VALUES (
            v_user_id, 'in_progress', now()
        ) RETURNING id INTO v_attempt_id;

        UPDATE public.custom_practice_sessions
        SET test_attempt_id = v_attempt_id,
            status = 'ACTIVE'
        WHERE id = p_session_id;
    ELSE
        UPDATE public.custom_practice_sessions
        SET status = 'ACTIVE'
        WHERE id = p_session_id;
        v_attempt_id := v_session.test_attempt_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', p_session_id,
        'test_attempt_id', v_attempt_id,
        'status', 'ACTIVE',
        'question_version_ids', v_session.question_version_ids_json
    );
END;
$$;

-- 8. Financially Atomic Staff Errata Resolution
CREATE OR REPLACE FUNCTION public.fn_resolve_errata_report(
    p_report_id UUID,
    p_resolution_status TEXT,
    p_resolution_notes TEXT DEFAULT NULL,
    p_bounty_coins INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_reviewer_id UUID;
    v_reviewer_role TEXT;
    v_report RECORD;
    v_event_id UUID;
    v_reward_res JSONB;
BEGIN
    v_reviewer_id := auth.uid();
    IF v_reviewer_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Authentication required for staff review';
    END IF;

    SELECT role INTO v_reviewer_role FROM public.user_profiles WHERE id = v_reviewer_id;
    IF v_reviewer_role IS NULL OR v_reviewer_role NOT IN ('admin', 'content_manager', 'editor', 'teacher') THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not have permission to review errata reports';
    END IF;

    -- Lock report row
    SELECT * INTO v_report
    FROM public.question_errata_reports
    WHERE id = p_report_id
    FOR UPDATE;

    IF v_report IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Report not found');
    END IF;

    -- Financial atomicity: credit bounty reward via Phase 3D engine
    IF p_resolution_status IN ('VERIFIED', 'RESOLVED') AND v_report.reward_coins_granted = 0 AND p_bounty_coins > 0 THEN
        v_reward_res := public.fn_award_gamification_reward(
            v_report.reporter_user_id,
            'ERRATA_BOUNTY',
            p_bounty_coins,
            'bounty:errata:' || v_report.id::text,
            jsonb_build_object('report_id', v_report.id, 'question_id', v_report.question_id)
        );

        IF (v_reward_res->>'success')::boolean != true THEN
            RAISE EXCEPTION 'Reward pipeline error: Failed to award errata bounty coins';
        END IF;

        v_event_id := (v_reward_res->>'event_id')::uuid;
    END IF;

    UPDATE public.question_errata_reports
    SET status = p_resolution_status,
        reviewer_user_id = v_reviewer_id,
        resolution_notes = p_resolution_notes,
        reward_coins_granted = CASE WHEN p_resolution_status IN ('VERIFIED', 'RESOLVED') THEN p_bounty_coins ELSE 0 END,
        gamification_event_id = COALESCE(v_event_id, gamification_event_id),
        updated_at = now()
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
        'success', true,
        'report_id', p_report_id,
        'status', p_resolution_status,
        'bounty_coins_awarded', CASE WHEN p_resolution_status IN ('VERIFIED', 'RESOLVED') THEN p_bounty_coins ELSE 0 END
    );
END;
$$;

-- Permissions & Grants
REVOKE ALL ON public.question_errata_reports FROM authenticated;
GRANT SELECT, INSERT ON public.question_errata_reports TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(TEXT, TEXT, UUID[], INTEGER, UUID[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_generate_custom_practice_session(TEXT, TEXT, UUID[], INTEGER, UUID[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_start_custom_practice_session(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_start_custom_practice_session(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_resolve_errata_report(UUID, TEXT, TEXT, INTEGER) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_resolve_errata_report(UUID, TEXT, TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
