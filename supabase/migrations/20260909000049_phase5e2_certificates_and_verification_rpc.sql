-- ============================================================================
-- COURAGE LIBRARY — PHASE 5E.2: CERTIFICATES & SECURE VERIFICATION
-- Migration: 20260909000049_phase5e2_certificates_and_verification_rpc.sql
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Create live_test_certificate_policies Table
CREATE TABLE IF NOT EXISTS public.live_test_certificate_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID REFERENCES public.live_test_events(id) ON DELETE CASCADE, -- NULL = Global Default Policy
    policy_code TEXT NOT NULL DEFAULT 'DEFAULT_CERT_POLICY',
    certificate_type TEXT NOT NULL CHECK (certificate_type IN ('PARTICIPATION', 'COMPLETION', 'MERIT', 'PODIUM')),
    min_rank INTEGER,
    max_rank INTEGER,
    min_percentile NUMERIC(5, 2),
    max_percentile NUMERIC(5, 2),
    min_score_percentage NUMERIC(5, 2),
    title_template TEXT NOT NULL,
    subtitle_template TEXT NOT NULL,
    badge_code TEXT,
    priority INTEGER NOT NULL DEFAULT 100,
    policy_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cert_policy_event_type_ver UNIQUE (live_test_event_id, certificate_type, policy_version)
);

-- Index for fast policy lookup
CREATE INDEX IF NOT EXISTS idx_live_cert_policies_event_active 
ON public.live_test_certificate_policies(live_test_event_id, is_active);

-- 2. Seed Default Global Certificate Policies (Templates when event-specific policy is not set)
INSERT INTO public.live_test_certificate_policies (
    live_test_event_id, policy_code, certificate_type, min_rank, max_rank, min_percentile, max_percentile, min_score_percentage, title_template, subtitle_template, badge_code, priority, policy_version, is_active
) VALUES
    (NULL, 'GLOBAL_CERT_POLICY_V1', 'PODIUM', 1, 3, NULL, NULL, NULL, 'Certificate of Podium Excellence', 'Awarded for achieving National Podium Standing in the All-India Championship', 'PODIUM_GOLD', 10, 1, true),
    (NULL, 'GLOBAL_CERT_POLICY_V1', 'MERIT', NULL, NULL, 90.00, 100.00, NULL, 'Certificate of National Merit', 'Awarded for outstanding Top-Decile performance in the All-India Championship', 'TOP_DECILE_WARRIOR', 20, 1, true),
    (NULL, 'GLOBAL_CERT_POLICY_V1', 'COMPLETION', NULL, NULL, NULL, NULL, 0.00, 'Certificate of Examination Completion', 'Awarded for successfully attempting and completing the All-India Live Mock Examination', 'COMPLETION_WARRIOR', 30, 1, true),
    (NULL, 'GLOBAL_CERT_POLICY_V1', 'PARTICIPATION', NULL, NULL, NULL, NULL, NULL, 'Certificate of Participation', 'Awarded for active participation in the All-India Live Mock Examination', 'PARTICIPANT_WARRIOR', 40, 1, true)
ON CONFLICT (live_test_event_id, certificate_type, policy_version) DO NOTHING;

-- 3. Create live_test_certificates Table
CREATE TABLE IF NOT EXISTS public.live_test_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    live_test_event_id UUID NOT NULL REFERENCES public.live_test_events(id) ON DELETE CASCADE,
    snapshot_id UUID NOT NULL REFERENCES public.live_test_ranking_snapshots(id) ON DELETE RESTRICT,
    policy_id UUID NOT NULL REFERENCES public.live_test_certificate_policies(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES public.test_attempts(id) ON DELETE SET NULL,
    
    -- Public Identifiers
    certificate_number TEXT NOT NULL UNIQUE,
    verification_code TEXT NOT NULL UNIQUE,
    
    -- Academic Performance Snapshot
    certificate_type TEXT NOT NULL CHECK (certificate_type IN ('PARTICIPATION', 'COMPLETION', 'MERIT', 'PODIUM')),
    candidate_display_name TEXT NOT NULL,
    event_title TEXT NOT NULL,
    final_score NUMERIC(6, 2) NOT NULL,
    max_score NUMERIC(6, 2) NOT NULL,
    final_rank INTEGER,
    final_percentile NUMERIC(5, 2),
    total_participants INTEGER NOT NULL,
    
    -- Lifecycle & Errata Linkage
    status TEXT NOT NULL CHECK (status IN ('ELIGIBLE', 'ISSUED', 'REVOKED', 'SUPERSEDED')) DEFAULT 'ISSUED',
    reissue_version INTEGER NOT NULL DEFAULT 1,
    superseded_by_id UUID REFERENCES public.live_test_certificates(id) ON DELETE SET NULL,
    revocation_reason TEXT,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    
    -- Cryptographic Integrity
    signature_key_id TEXT NOT NULL DEFAULT 'v1',
    cryptographic_signature TEXT NOT NULL,
    canonical_payload_hash TEXT NOT NULL,
    
    -- Metadata & Timestamps
    template_version TEXT NOT NULL DEFAULT 'v1_classic',
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT uq_live_cert_event_user_type_ver UNIQUE (live_test_event_id, user_id, certificate_type, reissue_version)
);

-- Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_live_certs_user ON public.live_test_certificates(user_id, live_test_event_id);
CREATE INDEX IF NOT EXISTS idx_live_certs_code ON public.live_test_certificates(verification_code);
CREATE INDEX IF NOT EXISTS idx_live_certs_event_status ON public.live_test_certificates(live_test_event_id, status);

-- 4. Create live_test_certificate_verifications Table (Telemetry & Audit)
CREATE TABLE IF NOT EXISTS public.live_test_certificate_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id UUID REFERENCES public.live_test_certificates(id) ON DELETE CASCADE,
    verification_code_queried TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL,
    verification_status TEXT NOT NULL,
    ip_hash TEXT NOT NULL,
    user_agent TEXT,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_cert_verif_code ON public.live_test_certificate_verifications(verification_code_queried, verified_at DESC);

-- 5. Row Level Security Policies
ALTER TABLE public.live_test_certificate_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_test_certificate_verifications ENABLE ROW LEVEL SECURITY;

-- Policies: live_test_certificate_policies
DROP POLICY IF EXISTS p_live_cert_policies_public_read ON public.live_test_certificate_policies;
CREATE POLICY p_live_cert_policies_public_read ON public.live_test_certificate_policies
FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS p_live_cert_policies_admin_all ON public.live_test_certificate_policies;
CREATE POLICY p_live_cert_policies_admin_all ON public.live_test_certificate_policies
FOR ALL USING (true) WITH CHECK (true);

-- Policies: live_test_certificates
-- Regular users can only read their own issued certificates
DROP POLICY IF EXISTS p_live_certs_owner_read ON public.live_test_certificates;
CREATE POLICY p_live_certs_owner_read ON public.live_test_certificates
FOR SELECT USING (auth.uid() = user_id);

-- Admin / service role full access
DROP POLICY IF EXISTS p_live_certs_admin_all ON public.live_test_certificates;
CREATE POLICY p_live_certs_admin_all ON public.live_test_certificates
FOR ALL USING (true) WITH CHECK (true);

-- Policies: live_test_certificate_verifications
DROP POLICY IF EXISTS p_live_cert_verif_admin_all ON public.live_test_certificate_verifications;
CREATE POLICY p_live_cert_verif_admin_all ON public.live_test_certificate_verifications
FOR ALL USING (true) WITH CHECK (true);


-- ============================================================================
-- 6. RPC: fn_generate_live_test_certificates
-- Generates tamper-evident certificates for all eligible candidates in an active snapshot.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_generate_live_test_certificates(
    p_event_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_event RECORD;
    v_snapshot RECORD;
    v_entry RECORD;
    v_policy RECORD;
    v_user_profile RECORD;
    v_user_name TEXT;
    v_cert_type TEXT;
    v_policy_id UUID;
    v_cert_number TEXT;
    v_verif_code TEXT;
    v_canonical_payload TEXT;
    v_payload_hash TEXT;
    v_signature TEXT;
    v_existing_cert RECORD;
    v_generated_count INT := 0;
    v_superseded_count INT := 0;
    v_skipped_count INT := 0;
    v_now TIMESTAMPTZ := now();
    v_now_iso TEXT;
    v_crockford_chars TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    v_rand_part TEXT;
    v_i INT;
BEGIN
    -- 1. Validate event exists and is PUBLISHED
    SELECT * INTO v_event FROM public.live_test_events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Live test event with ID % not found.', p_event_id;
    END IF;

    IF v_event.status != 'PUBLISHED' THEN
        RAISE EXCEPTION 'Cannot generate certificates for event in status %. Event must be PUBLISHED.', v_event.status;
    END IF;

    -- 2. Fetch active finalized snapshot
    SELECT * INTO v_snapshot
    FROM public.live_test_ranking_snapshots
    WHERE live_test_event_id = p_event_id AND is_active = true AND is_finalized = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active finalized ranking snapshot found for event %.', p_event_id;
    END IF;

    -- 3. Iterate through all leaderboard entries in the active snapshot
    FOR v_entry IN
        SELECT e.*, a.status AS attempt_status
        FROM public.live_test_leaderboard_entries e
        LEFT JOIN public.test_attempts a ON a.id = e.attempt_id
        WHERE e.snapshot_id = v_snapshot.id
        ORDER BY e.rank ASC
    LOOP
        -- Determine candidate display name
        SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_entry.user_id;
        IF v_user_name IS NULL OR length(trim(v_user_name)) = 0 THEN
            v_user_name := 'Candidate ' || substring(v_entry.user_id::text from 1 for 8);
        END IF;

        -- Find highest matching policy for this candidate
        v_cert_type := NULL;
        v_policy_id := NULL;

        -- Check Podium (Rank 1..3)
        SELECT id, certificate_type INTO v_policy_id, v_cert_type
        FROM public.live_test_certificate_policies
        WHERE (live_test_event_id = p_event_id OR live_test_event_id IS NULL)
          AND certificate_type = 'PODIUM'
          AND is_active = true
          AND (min_rank IS NULL OR v_entry.rank >= min_rank)
          AND (max_rank IS NULL OR v_entry.rank <= max_rank)
        ORDER BY live_test_event_id NULLS LAST, priority ASC
        LIMIT 1;

        -- If not Podium, check Merit (Percentile >= 90.00)
        IF v_cert_type IS NULL THEN
            SELECT id, certificate_type INTO v_policy_id, v_cert_type
            FROM public.live_test_certificate_policies
            WHERE (live_test_event_id = p_event_id OR live_test_event_id IS NULL)
              AND certificate_type = 'MERIT'
              AND is_active = true
              AND (min_percentile IS NULL OR v_entry.percentile >= min_percentile)
              AND (max_percentile IS NULL OR v_entry.percentile <= max_percentile)
            ORDER BY live_test_event_id NULLS LAST, priority ASC
            LIMIT 1;
        END IF;

        -- If not Merit, check Completion (Submitted test attempt)
        IF v_cert_type IS NULL AND v_entry.attempt_status IN ('SUBMITTED', 'AUTO_SUBMITTED', 'COMPLETED', 'EVALUATED') THEN
            SELECT id, certificate_type INTO v_policy_id, v_cert_type
            FROM public.live_test_certificate_policies
            WHERE (live_test_event_id = p_event_id OR live_test_event_id IS NULL)
              AND certificate_type = 'COMPLETION'
              AND is_active = true
            ORDER BY live_test_event_id NULLS LAST, priority ASC
            LIMIT 1;
        END IF;

        -- Fallback to Participation
        IF v_cert_type IS NULL THEN
            SELECT id, certificate_type INTO v_policy_id, v_cert_type
            FROM public.live_test_certificate_policies
            WHERE (live_test_event_id = p_event_id OR live_test_event_id IS NULL)
              AND certificate_type = 'PARTICIPATION'
              AND is_active = true
            ORDER BY live_test_event_id NULLS LAST, priority ASC
            LIMIT 1;
        END IF;

        -- If an eligible policy was found, generate or update certificate
        IF v_cert_type IS NOT NULL AND v_policy_id IS NOT NULL THEN
            -- Check if certificate for this user and event already exists under previous snapshot/version
            SELECT * INTO v_existing_cert
            FROM public.live_test_certificates
            WHERE live_test_event_id = p_event_id
              AND user_id = v_entry.user_id
              AND status = 'ISSUED';

            IF FOUND THEN
                IF v_existing_cert.snapshot_id = v_snapshot.id AND v_existing_cert.certificate_type = v_cert_type THEN
                    -- Already issued for this exact snapshot and tier -> skip (idempotent)
                    v_skipped_count := v_skipped_count + 1;
                    CONTINUE;
                ELSE
                    -- Errata recalculation producing higher snapshot or tier -> mark old cert SUPERSEDED
                    UPDATE public.live_test_certificates
                    SET status = 'SUPERSEDED',
                        updated_at = v_now
                    WHERE id = v_existing_cert.id;
                    
                    v_superseded_count := v_superseded_count + 1;
                END IF;
            END IF;

            -- Generate random 8-character Crockford token for cert number
            v_rand_part := '';
            FOR v_i IN 1..8 LOOP
                v_rand_part := v_rand_part || substr(v_crockford_chars, ((abs(get_byte(gen_random_bytes(1), 0)) % 32) + 1), 1);
            END LOOP;
            v_cert_number := 'CL-2026-LIVE-' || upper(substring(p_event_id::text from 1 for 8)) || '-' || v_rand_part;

            -- Generate 12-character Crockford verification code: CLV-XXXX-XXXX-XXXX
            v_rand_part := '';
            FOR v_i IN 1..12 LOOP
                v_rand_part := v_rand_part || substr(v_crockford_chars, ((abs(get_byte(gen_random_bytes(1), 0)) % 32) + 1), 1);
            END LOOP;
            v_verif_code := 'CLV-' || substring(v_rand_part from 1 for 4) || '-' || substring(v_rand_part from 5 for 4) || '-' || substring(v_rand_part from 9 for 4);

            -- Construct Canonical Payload and Hash
            v_now_iso := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
            v_canonical_payload := 'CL_CERT_V1|' || p_event_id::text || '|' || v_entry.user_id::text || '|' || v_snapshot.id::text || '|' || v_cert_type || '|' || to_char(v_entry.total_score, 'FM999990.00') || '|' || coalesce(v_entry.rank::text, 'NULL') || '|' || to_char(v_entry.percentile, 'FM990.00') || '|1|' || v_now_iso;
            v_payload_hash := encode(digest(v_canonical_payload, 'sha256'), 'hex');
            v_signature := encode(hmac(v_payload_hash, 'COURAGE_LIVE_CERT_SIGNING_KEY_V1', 'sha256'), 'hex');

            -- Insert certificate record
            INSERT INTO public.live_test_certificates (
                live_test_event_id,
                snapshot_id,
                policy_id,
                user_id,
                attempt_id,
                certificate_number,
                verification_code,
                certificate_type,
                candidate_display_name,
                event_title,
                final_score,
                max_score,
                final_rank,
                final_percentile,
                total_participants,
                status,
                reissue_version,
                superseded_by_id,
                signature_key_id,
                cryptographic_signature,
                canonical_payload_hash,
                template_version,
                issued_at,
                created_at,
                updated_at
            ) VALUES (
                p_event_id,
                v_snapshot.id,
                v_policy_id,
                v_entry.user_id,
                v_entry.attempt_id,
                v_cert_number,
                v_verif_code,
                v_cert_type,
                v_user_name,
                v_event.title,
                v_entry.total_score,
                v_entry.max_score,
                v_entry.rank,
                v_entry.percentile,
                v_snapshot.total_participants,
                'ISSUED',
                CASE WHEN v_existing_cert.id IS NOT NULL THEN v_existing_cert.reissue_version + 1 ELSE 1 END,
                NULL,
                'v1',
                v_signature,
                v_payload_hash,
                'v1_classic',
                v_now,
                v_now,
                v_now
            );

            -- Link previous cert to this new cert if superseded
            IF v_existing_cert.id IS NOT NULL THEN
                UPDATE public.live_test_certificates
                SET superseded_by_id = (SELECT id FROM public.live_test_certificates WHERE verification_code = v_verif_code)
                WHERE id = v_existing_cert.id;
            END IF;

            v_generated_count := v_generated_count + 1;
        END IF;
    END LOOP;

    -- 4. Record audit log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        actor_id,
        action,
        previous_state,
        new_state,
        metadata
    ) VALUES (
        p_event_id,
        p_admin_id,
        'GENERATE_CERTIFICATES',
        jsonb_build_object('event_status', v_event.status),
        jsonb_build_object('snapshot_id', v_snapshot.id, 'snapshot_version', v_snapshot.snapshot_version),
        jsonb_build_object(
            'generated_count', v_generated_count,
            'superseded_count', v_superseded_count,
            'skipped_count', v_skipped_count
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'event_id', p_event_id,
        'snapshot_id', v_snapshot.id,
        'generated_count', v_generated_count,
        'superseded_count', v_superseded_count,
        'skipped_count', v_skipped_count
    );
END;
$$;


-- ============================================================================
-- 7. RPC: fn_verify_live_test_certificate_public
-- Public unauthenticated verification lookup with strict PII masking.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_verify_live_test_certificate_public(
    p_verification_code TEXT,
    p_ip_hash TEXT DEFAULT 'UNTRACKED'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_code TEXT := upper(trim(p_verification_code));
    v_cert RECORD;
    v_superseded_by RECORD;
    v_masked_name TEXT;
    v_name_parts TEXT[];
BEGIN
    -- Query certificate by verification code
    SELECT c.*, e.launch_date
    INTO v_cert
    FROM public.live_test_certificates c
    JOIN public.live_test_events e ON e.id = c.live_test_event_id
    WHERE upper(c.verification_code) = v_code;

    -- If not found, log telemetry and return NOT_FOUND
    IF NOT FOUND THEN
        INSERT INTO public.live_test_certificate_verifications (
            certificate_id, verification_code_queried, is_valid, verification_status, ip_hash
        ) VALUES (
            NULL, v_code, false, 'NOT_FOUND', p_ip_hash
        );

        RETURN jsonb_build_object(
            'valid', false,
            'status', 'NOT_FOUND',
            'error', 'No certificate matches the provided verification code.'
        );
    END IF;

    -- Record telemetry for query
    INSERT INTO public.live_test_certificate_verifications (
        certificate_id, verification_code_queried, is_valid, verification_status, ip_hash
    ) VALUES (
        v_cert.id, v_code, (v_cert.status = 'ISSUED'), v_cert.status, p_ip_hash
    );

    -- Apply Privacy Data Minimization: Mask candidate name (e.g. Rahul Sharma -> Rahul S.)
    v_name_parts := string_to_array(trim(v_cert.candidate_display_name), ' ');
    IF array_length(v_name_parts, 1) > 1 THEN
        v_masked_name := v_name_parts[1] || ' ' || substring(v_name_parts[array_length(v_name_parts, 1)] from 1 for 1) || '.';
    ELSE
        v_masked_name := v_cert.candidate_display_name;
    END IF;

    -- If certificate is SUPERSEDED, lookup replacement certificate details
    IF v_cert.status = 'SUPERSEDED' AND v_cert.superseded_by_id IS NOT NULL THEN
        SELECT certificate_number, verification_code INTO v_superseded_by
        FROM public.live_test_certificates
        WHERE id = v_cert.superseded_by_id;

        RETURN jsonb_build_object(
            'valid', false,
            'status', 'SUPERSEDED',
            'certificate_number', v_cert.certificate_number,
            'certificate_type', v_cert.certificate_type,
            'candidate_display_name', v_masked_name,
            'event_title', v_cert.event_title,
            'event_date', v_cert.launch_date,
            'issued_at', v_cert.issued_at,
            'superseded_notice', 'This certificate was superseded following official result recalculation.',
            'replacement_certificate_number', v_superseded_by.certificate_number,
            'replacement_verification_code', v_superseded_by.verification_code
        );
    END IF;

    -- If certificate is REVOKED
    IF v_cert.status = 'REVOKED' THEN
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'REVOKED',
            'certificate_number', v_cert.certificate_number,
            'certificate_type', v_cert.certificate_type,
            'candidate_display_name', v_masked_name,
            'event_title', v_cert.event_title,
            'revoked_at', v_cert.revoked_at,
            'revocation_reason', v_cert.revocation_reason
        );
    END IF;

    -- Return valid active certificate verification projection
    RETURN jsonb_build_object(
        'valid', true,
        'status', v_cert.status,
        'certificate_number', v_cert.certificate_number,
        'verification_code', v_cert.verification_code,
        'certificate_type', v_cert.certificate_type,
        'candidate_display_name', v_masked_name,
        'event_title', v_cert.event_title,
        'event_date', v_cert.launch_date,
        'score', v_cert.final_score,
        'max_score', v_cert.max_score,
        'rank', v_cert.final_rank,
        'percentile', v_cert.final_percentile,
        'total_participants', v_cert.total_participants,
        'issued_at', v_cert.issued_at,
        'authenticity_seal', 'VERIFIED_AUTHENTIC_BY_COURAGE_LIBRARY'
    );
END;
$$;


-- ============================================================================
-- 8. RPC: fn_revoke_live_test_certificate
-- Administrative revocation with reason and immutable audit log.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_revoke_live_test_certificate(
    p_certificate_id UUID,
    p_admin_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_cert RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_cert FROM public.live_test_certificates WHERE id = p_certificate_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Certificate with ID % not found.', p_certificate_id;
    END IF;

    IF v_cert.status = 'REVOKED' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Certificate is already revoked.');
    END IF;

    UPDATE public.live_test_certificates
    SET status = 'REVOKED',
        revocation_reason = coalesce(p_reason, 'Administrative disciplinary revocation'),
        revoked_at = v_now,
        revoked_by = p_admin_id,
        updated_at = v_now
    WHERE id = p_certificate_id;

    -- Record audit log
    INSERT INTO public.live_test_audit_logs (
        live_test_event_id,
        actor_id,
        action,
        previous_state,
        new_state,
        metadata
    ) VALUES (
        v_cert.live_test_event_id,
        p_admin_id,
        'REVOKE_CERTIFICATE',
        jsonb_build_object('certificate_id', v_cert.id, 'status', v_cert.status),
        jsonb_build_object('certificate_id', v_cert.id, 'status', 'REVOKED'),
        jsonb_build_object('reason', p_reason, 'revoked_at', v_now)
    );

    RETURN jsonb_build_object(
        'success', true,
        'certificate_id', p_certificate_id,
        'status', 'REVOKED'
    );
END;
$$;
