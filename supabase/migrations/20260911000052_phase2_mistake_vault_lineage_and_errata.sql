-- ============================================================================
-- COURAGE LIBRARY — PHASE 2: MISTAKE VAULT FOUNDATION & LINEAGE HARDENING
-- Migration: 20260911000052_phase2_mistake_vault_lineage_and_errata.sql
-- Target Schema: couragelibrary-next
-- ============================================================================

-- 1. TABLE PRIVILEGES HARDENING
GRANT ALL ON TABLE public.user_mistake_vault TO authenticated, service_role;
GRANT ALL ON TABLE public.user_mistake_occurrences TO authenticated, service_role;
GRANT ALL ON TABLE public.user_mistake_drills TO authenticated, service_role;
GRANT ALL ON TABLE public.mistake_cognitive_types TO authenticated, service_role;
GRANT SELECT ON TABLE public.mistake_cognitive_types TO anon, authenticated, service_role;


-- 2. SCHEMA EVOLUTION: USER_MISTAKE_OCCURRENCES LINEAGE & STATUS
ALTER TABLE public.user_mistake_occurrences
    ADD COLUMN IF NOT EXISTS question_version_id UUID REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS attempt_answer_id UUID,
    ADD COLUMN IF NOT EXISTS occurrence_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (occurrence_status IN ('ACTIVE', 'REVOKED_ERRATA', 'REVOKED_VOID', 'SUPERSEDED')),
    ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revocation_reason TEXT;

-- Lineage and performance indexes
CREATE INDEX IF NOT EXISTS idx_umo_qv ON public.user_mistake_occurrences (question_version_id);
CREATE INDEX IF NOT EXISTS idx_umo_attempt_answer ON public.user_mistake_occurrences (attempt_answer_id);
CREATE INDEX IF NOT EXISTS idx_umo_status ON public.user_mistake_occurrences (user_id, occurrence_status);

-- Idempotency constraint: An exact attempt_answer can only produce at most one mistake occurrence
CREATE UNIQUE INDEX IF NOT EXISTS uq_umo_attempt_answer 
    ON public.user_mistake_occurrences (attempt_answer_id) 
    WHERE attempt_answer_id IS NOT NULL;


-- ============================================================================
-- 3. UPDATED RUNTIME RPC: fn_record_mistake_occurrence
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_record_mistake_occurrence(
    p_user_id UUID,
    p_question_id UUID,
    p_source_context TEXT,
    p_source_reference_id UUID DEFAULT NULL,
    p_selected_option_id UUID DEFAULT NULL,
    p_response_time_seconds INTEGER DEFAULT NULL,
    p_cognitive_type_id TEXT DEFAULT 'UNCLASSIFIED',
    p_confidence_pct INTEGER DEFAULT 50,
    p_question_version_id UUID DEFAULT NULL,
    p_attempt_answer_id UUID DEFAULT NULL
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
    v_target_version_id UUID := p_question_version_id;
    v_existing_occurrence_id UUID;
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

    -- 1. Idempotency Gate: If attempt_answer_id is provided, check if already recorded
    IF p_attempt_answer_id IS NOT NULL THEN
        SELECT id, vault_id INTO v_existing_occurrence_id, v_vault_id
        FROM public.user_mistake_occurrences
        WHERE attempt_answer_id = p_attempt_answer_id;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'vault_id', v_vault_id,
                'occurrence_id', v_existing_occurrence_id,
                'question_id', p_question_id,
                'idempotent_replay', true
            );
        END IF;
    END IF;

    -- 2. Lookup topic/subject from questions
    SELECT q.canonical_topic_id, t.subject_id
    INTO v_topic_id, v_subject_id
    FROM public.questions q
    LEFT JOIN public.topics t ON q.canonical_topic_id = t.id
    WHERE q.id = p_question_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Question not found');
    END IF;

    -- 3. Deterministic Question Version Resolution (if not explicitly provided)
    IF v_target_version_id IS NULL THEN
        SELECT id INTO v_target_version_id
        FROM public.question_versions
        WHERE question_id = p_question_id AND is_current = true
        ORDER BY version_number DESC
        LIMIT 1;
    END IF;

    -- 4. Atomic Upsert into user_mistake_vault
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

    -- 5. Insert into immutable occurrences ledger with exact version & attempt answer provenance
    INSERT INTO public.user_mistake_occurrences (
        vault_id, user_id, question_id, question_version_id, attempt_answer_id,
        source_context, source_reference_id, selected_option_id, response_time_seconds,
        inferred_cognitive_type_id, heuristic_confidence_pct, occurrence_status, occurred_at
    ) VALUES (
        v_vault_id, p_user_id, p_question_id, v_target_version_id, p_attempt_answer_id,
        p_source_context, p_source_reference_id, p_selected_option_id, p_response_time_seconds,
        COALESCE(p_cognitive_type_id, 'UNCLASSIFIED'),
        GREATEST(0, LEAST(100, COALESCE(p_confidence_pct, 50))), 'ACTIVE', now()
    ) RETURNING id INTO v_existing_occurrence_id;

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', v_vault_id,
        'occurrence_id', v_existing_occurrence_id,
        'question_id', p_question_id,
        'question_version_id', v_target_version_id,
        'status', CASE WHEN v_status = 'MASTERED' THEN 'REVISITING' ELSE COALESCE(v_status, 'UNRESOLVED') END
    );
END;
$$;


-- ============================================================================
-- 4. NEW RPC: fn_recompute_mistake_profile
-- Recalculates candidate mistake profile based strictly on valid ACTIVE occurrences
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_recompute_mistake_profile(
    p_user_id UUID,
    p_question_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_active_count INTEGER;
    v_latest_mistake_at TIMESTAMPTZ;
    v_earliest_mistake_at TIMESTAMPTZ;
    v_vault_id UUID;
    v_current_status TEXT;
BEGIN
    SELECT id, lifecycle_status INTO v_vault_id, v_current_status
    FROM public.user_mistake_vault
    WHERE user_id = p_user_id AND question_id = p_question_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mistake vault profile not found');
    END IF;

    -- Count strictly ACTIVE (non-revoked) mistake occurrences
    SELECT 
        count(*),
        max(occurred_at),
        min(occurred_at)
    INTO 
        v_active_count,
        v_latest_mistake_at,
        v_earliest_mistake_at
    FROM public.user_mistake_occurrences
    WHERE user_id = p_user_id 
      AND question_id = p_question_id
      AND occurrence_status = 'ACTIVE';

    IF v_active_count = 0 THEN
        -- All occurrences have been revoked via errata/void -> mark as MASTERED / neutralized
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = 0,
            consecutive_correct_in_remediation = 2,
            lifecycle_status = 'MASTERED',
            mastered_at = now(),
            updated_at = now()
        WHERE id = v_vault_id;
    ELSE
        -- Update active count and timestamps to reflect valid evidence
        UPDATE public.user_mistake_vault
        SET total_mistakes_count = v_active_count,
            first_mistake_at = COALESCE(v_earliest_mistake_at, first_mistake_at),
            last_mistake_at = COALESCE(v_latest_mistake_at, last_mistake_at),
            updated_at = now()
        WHERE id = v_vault_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'vault_id', v_vault_id,
        'active_mistakes_count', v_active_count,
        'lifecycle_status', CASE WHEN v_active_count = 0 THEN 'MASTERED' ELSE v_current_status END
    );
END;
$$;


-- ============================================================================
-- 5. NEW RPC: fn_revoke_mistakes_by_errata
-- Authoritatively revokes mistake evidence when a question key was authoritatively corrected
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_revoke_mistakes_by_errata(
    p_question_version_id UUID,
    p_corrected_option_id UUID,
    p_reason TEXT,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_revoked_count INTEGER := 0;
    v_user_rec RECORD;
BEGIN
    -- Only staff or service_role can trigger authoritative errata revocation
    IF v_caller_id IS NOT NULL THEN
        IF NOT (
            (auth.jwt()->>'role') IN ('admin', 'staff', 'service_role') OR
            ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff'))
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Administrative privileges required');
        END IF;
    END IF;

    IF p_question_version_id IS NULL OR p_corrected_option_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid question version or corrected option ID');
    END IF;

    -- 1. Identify distinct users affected by this errata correction
    FOR v_user_rec IN (
        SELECT DISTINCT user_id, question_id
        FROM public.user_mistake_occurrences
        WHERE question_version_id = p_question_version_id
          AND selected_option_id = p_corrected_option_id
          AND occurrence_status = 'ACTIVE'
    )
    LOOP
        -- 2. Mark occurrences as REVOKED_ERRATA without physical row deletion
        UPDATE public.user_mistake_occurrences
        SET occurrence_status = 'REVOKED_ERRATA',
            revoked_at = now(),
            revocation_reason = COALESCE(p_reason, 'Authoritative errata answer key correction')
        WHERE user_id = v_user_rec.user_id
          AND question_version_id = p_question_version_id
          AND selected_option_id = p_corrected_option_id
          AND occurrence_status = 'ACTIVE';

        GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

        -- 3. Safely recompute the candidate's mistake aggregate profile
        PERFORM public.fn_recompute_mistake_profile(v_user_rec.user_id, v_user_rec.question_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'question_version_id', p_question_version_id,
        'corrected_option_id', p_corrected_option_id,
        'revoked_occurrences_count', v_revoked_count
    );
END;
$$;


-- ============================================================================
-- 6. PERMISSIONS & SCHEMA NOTIFY
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(UUID, UUID, TEXT, UUID, UUID, INTEGER, TEXT, INTEGER, UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_record_mistake_occurrence(UUID, UUID, TEXT, UUID, UUID, INTEGER, TEXT, INTEGER, UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_recompute_mistake_profile(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_recompute_mistake_profile(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_revoke_mistakes_by_errata(UUID, UUID, TEXT, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_revoke_mistakes_by_errata(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
