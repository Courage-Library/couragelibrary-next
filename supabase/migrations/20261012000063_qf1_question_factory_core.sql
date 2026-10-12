-- =============================================================================
-- COURAGE LIBRARY — QF-1 QUESTION FACTORY CORE
-- Migration: 20261012000063_qf1_question_factory_core.sql
--
-- Governed question pipeline:
--   Context → Prompt (CL-QUESTION-AUTHOR-v1.0) → External AI (untrusted) → Importer
--   → 5 Gates → DRAFT → Human Review → Atomic Publish (immutable) → Candidate-visible.
--
-- Contents:
--   0. Pre-flight guards (read-only; abort if unsafe)
--   1. question_versions lifecycle columns (candidate-safe only)
--   2. question_import_batches + question_version_authoring (service-role only)
--   3. fn_question_stem_checksum (single definition of duplicate normalisation)
--   4. Deterministic, idempotent backfill of the new columns
--   5. Indexes (incl. at most one current version per question)
--   6. Factory functions (SECURITY DEFINER, service_role only)
--   7. Integrity / immutability triggers
--   8. Candidate RLS: published-only reads (after mock_questions pre-check)
--   9. Consumer hardening of SQL selectors (practice sessions, mistake drills)
--
-- Idempotent: every DDL is guarded; the backfill only touches never-backfilled rows.
-- No existing question/version/option/answer data is modified except the backfill
-- of the NEW columns (lifecycle_status, content_checksum) and one
-- question_version_authoring row per existing version (origin LEGACY_UNKNOWN).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. PRE-FLIGHT GUARDS
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_multi_current INTEGER;
BEGIN
    -- The new unique index allows at most one is_current=true version per question.
    -- Fixing legacy duplicates would modify existing data, so abort instead.
    SELECT count(*) INTO v_multi_current
    FROM (
        SELECT question_id
        FROM public.question_versions
        WHERE is_current = true
        GROUP BY question_id
        HAVING count(*) > 1
    ) d;

    IF v_multi_current > 0 THEN
        RAISE EXCEPTION 'QF1_PRECHECK_FAILED: % question(s) have more than one is_current=true version. Resolve manually before applying QF-1.', v_multi_current;
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. question_versions: lifecycle columns
--    Only fields candidates may see or the engine needs live here. Internal
--    authoring / review fields live in question_version_authoring (section 2).
-- -----------------------------------------------------------------------------
ALTER TABLE public.question_versions
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS content_checksum TEXT;

-- New versions are never current until fn_publish_question_version makes them so.
ALTER TABLE public.question_versions ALTER COLUMN is_current SET DEFAULT false;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_versions_lifecycle_status') THEN
        ALTER TABLE public.question_versions
            ADD CONSTRAINT chk_question_versions_lifecycle_status
            CHECK (lifecycle_status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','REJECTED','SUPERSEDED'));
    END IF;

    -- Going forward a version can only be current when PUBLISHED.
    -- NOT VALID: legacy rows are not re-validated (no data rewrite); every new
    -- INSERT/UPDATE is checked.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_question_versions_current_is_published') THEN
        ALTER TABLE public.question_versions
            ADD CONSTRAINT chk_question_versions_current_is_published
            CHECK (NOT is_current OR lifecycle_status = 'PUBLISHED') NOT VALID;
    END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 2. question_import_batches + question_version_authoring (service role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origin TEXT NOT NULL CHECK (origin IN ('MANUAL','CSV_IMPORT','AI_EXTERNAL','ERRATA')),
    contract_version TEXT,
    context_hash TEXT,
    target_topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE RESTRICT,
    target_exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    submitted_count INTEGER NOT NULL DEFAULT 0 CHECK (submitted_count >= 0),
    accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
    rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
    gate_report JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_import_batches ENABLE ROW LEVEL SECURITY;
-- Intentionally NO anon/authenticated policies.
REVOKE ALL ON public.question_import_batches FROM anon, authenticated;
GRANT ALL ON public.question_import_batches TO service_role;

-- Internal authoring / review record: exactly one row per question version.
-- Never candidate-readable (RLS on, no anon/authenticated policies, privileges revoked).
CREATE TABLE IF NOT EXISTS public.question_version_authoring (
    version_id UUID PRIMARY KEY REFERENCES public.question_versions(id) ON DELETE RESTRICT,
    origin TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (origin IN ('MANUAL','CSV_IMPORT','AI_EXTERNAL','ERRATA','LEGACY_UNKNOWN')),
    contract_version TEXT,
    context_hash TEXT,
    authoring_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    import_batch_id UUID REFERENCES public.question_import_batches(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_version_authoring ENABLE ROW LEVEL SECURITY;
-- Intentionally NO anon/authenticated policies.
REVOKE ALL ON public.question_version_authoring FROM anon, authenticated;
GRANT ALL ON public.question_version_authoring TO service_role;


-- -----------------------------------------------------------------------------
-- 3. fn_question_stem_checksum — THE single definition of duplicate normalisation
--    lowercase → Unicode NFKC → strip punctuation (keep letters, digits, operators
--    + - * / = < > ^ % and decimal points between digits) → collapse whitespace → trim
--    → sha256 hex.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_question_stem_checksum(p_stem TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT encode(
        sha256(convert_to(
            btrim(regexp_replace(
                regexp_replace(
                    regexp_replace(
                        lower(normalize(COALESCE(p_stem, ''), NFKC)),
                        '[!"#$&''(),:;?@\[\]\\_`{|}~“”‘’«»…–—·।॥]', ' ', 'g'),
                    '(^|[^0-9])\.|\.([^0-9]|$)', '\1 \2', 'g'),
                '\s+', ' ', 'g')),
            'UTF8')),
        'hex');
$$;


-- -----------------------------------------------------------------------------
-- 4. BACKFILL (deterministic, idempotent)
--    Only versions that have never been backfilled (no authoring row yet) are
--    touched. PUBLISHED where published_at IS NOT NULL OR parent question is
--    published; otherwise DRAFT. No other question_versions column is changed.
--    Every such version then receives one authoring row (origin LEGACY_UNKNOWN).
--    Runs before the integrity triggers exist (section 7).
-- -----------------------------------------------------------------------------
UPDATE public.question_versions qv
SET lifecycle_status = CASE
        WHEN qv.published_at IS NOT NULL OR q.status = 'published' THEN 'PUBLISHED'
        ELSE 'DRAFT'
    END,
    content_checksum = public.fn_question_stem_checksum(qv.question_text)
FROM public.questions q
WHERE q.id = qv.question_id
  AND qv.content_checksum IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.question_version_authoring a WHERE a.version_id = qv.id);

INSERT INTO public.question_version_authoring (version_id, origin)
SELECT qv.id, 'LEGACY_UNKNOWN'
FROM public.question_versions qv
WHERE NOT EXISTS (SELECT 1 FROM public.question_version_authoring a WHERE a.version_id = qv.id)
ON CONFLICT (version_id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. INDEXES
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_question_versions_lifecycle_status ON public.question_versions (lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_question_versions_content_checksum ON public.question_versions (content_checksum);
CREATE INDEX IF NOT EXISTS idx_question_version_authoring_batch ON public.question_version_authoring (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_question_version_authoring_origin ON public.question_version_authoring (origin);
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_versions_one_current
    ON public.question_versions (question_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_question_import_batches_topic ON public.question_import_batches (target_topic_id, created_at DESC);


-- -----------------------------------------------------------------------------
-- 6. FACTORY FUNCTIONS
--    All lifecycle writes set the transaction-local flag app.qf_lifecycle_write,
--    which the integrity triggers (section 7) require.
-- -----------------------------------------------------------------------------

-- 6a. Read-only exact-duplicate lookup used by Gate 5 (the TS side never hashes).
CREATE OR REPLACE FUNCTION public.fn_qf_find_exact_duplicates(
    p_topic_id UUID,
    p_stems TEXT[],
    p_exclude_question_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'index', s.ord - 1,
            'checksum', s.checksum,
            'duplicate_version_id', (
                SELECT qv.id
                FROM public.question_versions qv
                JOIN public.questions q ON q.id = qv.question_id
                WHERE q.canonical_topic_id = p_topic_id
                  AND qv.content_checksum = s.checksum
                  AND qv.lifecycle_status <> 'REJECTED'
                  AND (p_exclude_question_id IS NULL OR qv.question_id <> p_exclude_question_id)
                ORDER BY qv.created_at
                LIMIT 1
            )
        ) ORDER BY s.ord
    ), '[]'::jsonb)
    FROM (
        SELECT t.ord, public.fn_question_stem_checksum(t.stem) AS checksum
        FROM unnest(p_stems) WITH ORDINALITY AS t(stem, ord)
    ) s;
$$;

-- 6b. Shared item validation (defence in depth behind the TS gates).
CREATE OR REPLACE FUNCTION public.fn_qf_assert_item_shape(p_item JSONB, p_label TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_keys TEXT[];
BEGIN
    IF p_item IS NULL OR jsonb_typeof(p_item) <> 'object' THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % is not an object', p_label;
    END IF;
    IF COALESCE(btrim(p_item->>'stem'), '') = '' THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % has an empty stem', p_label;
    END IF;
    IF char_length(p_item->>'stem') > 2000 THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % stem exceeds 2000 characters', p_label;
    END IF;
    IF jsonb_typeof(p_item->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_item->'options') <> 4 THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % must have exactly 4 options', p_label;
    END IF;
    SELECT array_agg(o->>'key' ORDER BY o->>'key') INTO v_keys
    FROM jsonb_array_elements(p_item->'options') o;
    IF v_keys IS DISTINCT FROM ARRAY['A','B','C','D'] THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % option keys must be exactly A, B, C, D', p_label;
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_item->'options') o WHERE COALESCE(btrim(o->>'text'), '') = '') THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % has an empty option text', p_label;
    END IF;
    IF NOT (COALESCE(p_item->>'correct_key', '') = ANY (v_keys)) THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % correct_key is not one of the options', p_label;
    END IF;
    IF char_length(COALESCE(p_item->>'explanation_md', '')) < 40 THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % explanation must be at least 40 characters', p_label;
    END IF;
    IF p_item ?| ARRAY['question_image_url', 'image_url', 'imageUrl']
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_item->'options') o WHERE o ?| ARRAY['option_image_url', 'image_url', 'imageUrl']) THEN
        RAISE EXCEPTION 'QF_ITEM_INVALID: % images are not accepted in QF-1', p_label;
    END IF;
END;
$$;

-- 6c. Atomic batch import: all accepted items become DRAFT versions, or nothing is written.
CREATE OR REPLACE FUNCTION public.fn_import_question_drafts(p_batch JSONB, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_origin TEXT := p_batch->>'origin';
    v_topic_id UUID := NULLIF(p_batch->>'target_topic_id', '')::uuid;
    v_subtopic_id UUID := NULLIF(p_batch->>'target_subtopic_id', '')::uuid;
    v_exam_id UUID := NULLIF(p_batch->>'target_exam_id', '')::uuid;
    v_items JSONB := p_batch->'items';
    v_count INTEGER;
    v_batch_id UUID;
    v_item JSONB;
    v_idx INTEGER;
    v_label TEXT;
    v_checksum TEXT;
    v_dup UUID;
    v_question_id UUID;
    v_version_id UUID;
    v_pyq JSONB;
    v_pyq_exam_title TEXT;
    v_pyq_year INTEGER;
    v_results JSONB := '[]'::jsonb;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;
    IF v_origin IS NULL OR v_origin NOT IN ('AI_EXTERNAL', 'CSV_IMPORT', 'MANUAL') THEN
        RAISE EXCEPTION 'QF_INVALID_ORIGIN: %', COALESCE(v_origin, 'null');
    END IF;
    IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
        RAISE EXCEPTION 'QF_BATCH_INVALID: items must be an array';
    END IF;
    v_count := jsonb_array_length(v_items);
    IF v_count < 1 OR v_count > 25 THEN
        RAISE EXCEPTION 'QF_BATCH_SIZE: % items (allowed 1-25)', v_count;
    END IF;

    -- Taxonomy is re-checked inside the transaction; this function never creates taxonomy.
    IF v_topic_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.topics WHERE id = v_topic_id AND is_active = true) THEN
        RAISE EXCEPTION 'QF_TOPIC_NOT_FOUND: target topic does not exist or is inactive';
    END IF;
    IF v_subtopic_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.subtopics WHERE id = v_subtopic_id AND topic_id = v_topic_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'QF_SUBTOPIC_INVALID: subtopic does not belong to the target topic or is inactive';
    END IF;
    IF v_exam_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exams WHERE id = v_exam_id AND is_active = true) THEN
        RAISE EXCEPTION 'QF_EXAM_INVALID: target exam does not exist or is inactive';
    END IF;

    INSERT INTO public.question_import_batches (
        origin, contract_version, context_hash, target_topic_id, target_exam_id,
        submitted_count, accepted_count, rejected_count, gate_report, created_by
    ) VALUES (
        v_origin, p_batch->>'contract_version', p_batch->>'context_hash', v_topic_id, v_exam_id,
        GREATEST(COALESCE((p_batch->>'submitted_count')::int, v_count), v_count), v_count,
        GREATEST(COALESCE((p_batch->>'rejected_count')::int, 0), 0),
        COALESCE(p_batch->'gate_report', '{}'::jsonb), p_actor
    ) RETURNING id INTO v_batch_id;

    FOR v_idx IN 0 .. v_count - 1 LOOP
        v_item := v_items -> v_idx;
        v_label := format('item %s (%s)', v_idx + 1, COALESCE(v_item->>'client_ref', '?'));
        PERFORM public.fn_qf_assert_item_shape(v_item, v_label);

        -- Race-safe exact-duplicate check: serialize on (topic, checksum).
        v_checksum := public.fn_question_stem_checksum(v_item->>'stem');
        PERFORM pg_advisory_xact_lock(hashtextextended(v_topic_id::text || ':' || v_checksum, 0));

        SELECT qv.id INTO v_dup
        FROM public.question_versions qv
        JOIN public.questions q ON q.id = qv.question_id
        WHERE q.canonical_topic_id = v_topic_id
          AND qv.content_checksum = v_checksum
          AND qv.lifecycle_status <> 'REJECTED'
        LIMIT 1;

        IF v_dup IS NOT NULL THEN
            RAISE EXCEPTION 'QF_DUPLICATE: % duplicates existing question version %', v_label, left(v_dup::text, 8);
        END IF;

        INSERT INTO public.questions (canonical_topic_id, subtopic_id, status)
        VALUES (v_topic_id, v_subtopic_id, 'draft')
        RETURNING id INTO v_question_id;

        INSERT INTO public.question_versions (
            question_id, version_number, question_text, difficulty, language, options_type,
            is_current, lifecycle_status, content_checksum
        ) VALUES (
            v_question_id, 1, v_item->>'stem', COALESCE(v_item->>'difficulty', 'medium'),
            COALESCE(v_item->>'language', 'en'), 'text',
            false, 'DRAFT', v_checksum
        ) RETURNING id INTO v_version_id;

        INSERT INTO public.question_version_authoring (
            version_id, origin, contract_version, context_hash, authoring_metadata, import_batch_id, created_by
        ) VALUES (
            v_version_id, v_origin, p_batch->>'contract_version', p_batch->>'context_hash',
            COALESCE(v_item->'authoring_metadata', '{}'::jsonb), v_batch_id, p_actor
        );

        INSERT INTO public.question_options (question_version_id, option_key, option_text, order_index)
        SELECT v_version_id, o->>'key', o->>'text', ascii(o->>'key') - 64
        FROM jsonb_array_elements(v_item->'options') o;

        INSERT INTO public.question_answers (question_version_id, correct_option_key, explanation_md)
        VALUES (v_version_id, v_item->>'correct_key', v_item->>'explanation_md');

        IF v_exam_id IS NOT NULL THEN
            INSERT INTO public.exam_question_mappings (exam_id, question_id)
            VALUES (v_exam_id, v_question_id)
            ON CONFLICT (exam_id, question_id) DO NOTHING;
        END IF;

        -- Only genuine PYQs become question_sources rows (ADAPTED provenance stays in authoring_metadata).
        v_pyq := v_item->'pyq';
        IF v_item->>'source_type' = 'PYQ' THEN
            IF v_pyq IS NULL OR jsonb_typeof(v_pyq) <> 'object' THEN
                RAISE EXCEPTION 'QF_PYQ_INVALID: % is PYQ but has no provenance', v_label;
            END IF;
            SELECT title INTO v_pyq_exam_title FROM public.exams WHERE id = NULLIF(v_pyq->>'exam_id', '')::uuid;
            v_pyq_year := NULLIF(v_pyq->>'year', '')::int;
            IF v_pyq_exam_title IS NULL OR v_pyq_year IS NULL
               OR v_pyq_year < 1950 OR v_pyq_year > EXTRACT(YEAR FROM now())::int THEN
                RAISE EXCEPTION 'QF_PYQ_INVALID: % has an unknown exam or implausible year', v_label;
            END IF;
            INSERT INTO public.question_sources (question_id, source_type, exam_name, year, shift, tier_stage)
            VALUES (v_question_id, 'PYQ', v_pyq_exam_title, v_pyq_year,
                    NULLIF(v_pyq->>'shift', ''), NULLIF(v_pyq->>'tier', ''));
        END IF;

        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'client_ref', v_item->>'client_ref',
            'question_id', v_question_id,
            'version_id', v_version_id
        ));
    END LOOP;

    RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'items', v_results);
END;
$$;

-- 6d. Edit a DRAFT / CHANGES_REQUESTED version (app re-runs gates G1/G2/G5 first).
CREATE OR REPLACE FUNCTION public.fn_update_question_draft(
    p_version_id UUID,
    p_actor UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_version RECORD;
    v_topic_id UUID;
    v_checksum TEXT;
    v_dup UUID;
    v_opt JSONB;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT * INTO v_version FROM public.question_versions WHERE id = p_version_id FOR UPDATE;
    IF v_version IS NULL THEN
        RAISE EXCEPTION 'QF_VERSION_NOT_FOUND';
    END IF;
    IF v_version.lifecycle_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
        RAISE EXCEPTION 'QF_ILLEGAL_TRANSITION: only DRAFT or CHANGES_REQUESTED versions can be edited (current: %)', v_version.lifecycle_status;
    END IF;

    PERFORM public.fn_qf_assert_item_shape(p_payload, 'edited version');

    SELECT canonical_topic_id INTO v_topic_id FROM public.questions WHERE id = v_version.question_id;
    v_checksum := public.fn_question_stem_checksum(p_payload->>'stem');
    PERFORM pg_advisory_xact_lock(hashtextextended(v_topic_id::text || ':' || v_checksum, 0));

    SELECT qv.id INTO v_dup
    FROM public.question_versions qv
    JOIN public.questions q ON q.id = qv.question_id
    WHERE q.canonical_topic_id = v_topic_id
      AND qv.content_checksum = v_checksum
      AND qv.lifecycle_status <> 'REJECTED'
      AND qv.question_id <> v_version.question_id
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
        RAISE EXCEPTION 'QF_DUPLICATE: edited stem duplicates existing question version %', left(v_dup::text, 8);
    END IF;

    PERFORM set_config('app.qf_lifecycle_write', 'on', true);

    UPDATE public.question_versions
    SET question_text = p_payload->>'stem',
        difficulty = COALESCE(p_payload->>'difficulty', difficulty),
        language = COALESCE(p_payload->>'language', language),
        content_checksum = v_checksum,
        lifecycle_status = 'DRAFT',
        is_current = false
    WHERE id = p_version_id;

    UPDATE public.question_version_authoring
    SET authoring_metadata = COALESCE(p_payload->'authoring_metadata', authoring_metadata),
        updated_at = now()
    WHERE version_id = p_version_id;

    FOR v_opt IN SELECT * FROM jsonb_array_elements(p_payload->'options') LOOP
        UPDATE public.question_options
        SET option_text = v_opt->>'text'
        WHERE question_version_id = p_version_id AND option_key = v_opt->>'key';
    END LOOP;

    UPDATE public.question_answers
    SET correct_option_key = p_payload->>'correct_key',
        explanation_md = p_payload->>'explanation_md',
        updated_at = now()
    WHERE question_version_id = p_version_id;

    PERFORM set_config('app.qf_lifecycle_write', 'off', true);

    RETURN jsonb_build_object('success', true, 'version_id', p_version_id, 'lifecycle_status', 'DRAFT');
END;
$$;

-- 6d-bis. Revision: a new DRAFT version of an existing question (used by the admin
--         question manager instead of editing a frozen version in place).
CREATE OR REPLACE FUNCTION public.fn_create_question_revision(
    p_question_id UUID,
    p_actor UUID,
    p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_topic_id UUID;
    v_next_version INTEGER;
    v_checksum TEXT;
    v_dup UUID;
    v_version_id UUID;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT canonical_topic_id INTO v_topic_id FROM public.questions WHERE id = p_question_id FOR UPDATE;
    IF v_topic_id IS NULL THEN
        RAISE EXCEPTION 'QF_QUESTION_NOT_FOUND';
    END IF;

    -- One open revision at a time keeps the review queue unambiguous.
    IF EXISTS (
        SELECT 1 FROM public.question_versions
        WHERE question_id = p_question_id
          AND lifecycle_status IN ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED')
    ) THEN
        RAISE EXCEPTION 'QF_REVISION_EXISTS: this question already has an open draft/review version; edit that instead';
    END IF;

    PERFORM public.fn_qf_assert_item_shape(p_payload, 'revision');

    v_checksum := public.fn_question_stem_checksum(p_payload->>'stem');
    PERFORM pg_advisory_xact_lock(hashtextextended(v_topic_id::text || ':' || v_checksum, 0));
    SELECT qv.id INTO v_dup
    FROM public.question_versions qv
    JOIN public.questions q ON q.id = qv.question_id
    WHERE q.canonical_topic_id = v_topic_id
      AND qv.content_checksum = v_checksum
      AND qv.lifecycle_status <> 'REJECTED'
      AND qv.question_id <> p_question_id
    LIMIT 1;
    IF v_dup IS NOT NULL THEN
        RAISE EXCEPTION 'QF_DUPLICATE: revised stem duplicates existing question version %', left(v_dup::text, 8);
    END IF;

    SELECT COALESCE(max(version_number), 0) + 1 INTO v_next_version
    FROM public.question_versions WHERE question_id = p_question_id;

    INSERT INTO public.question_versions (
        question_id, version_number, question_text, difficulty, language, options_type,
        is_current, lifecycle_status, content_checksum
    ) VALUES (
        p_question_id, v_next_version, p_payload->>'stem', COALESCE(p_payload->>'difficulty', 'medium'),
        COALESCE(p_payload->>'language', 'en'), 'text',
        false, 'DRAFT', v_checksum
    ) RETURNING id INTO v_version_id;

    INSERT INTO public.question_version_authoring (version_id, origin, authoring_metadata, created_by)
    VALUES (v_version_id, 'MANUAL', COALESCE(p_payload->'authoring_metadata', '{}'::jsonb), p_actor);

    INSERT INTO public.question_options (question_version_id, option_key, option_text, order_index)
    SELECT v_version_id, o->>'key', o->>'text', ascii(o->>'key') - 64
    FROM jsonb_array_elements(p_payload->'options') o;

    INSERT INTO public.question_answers (question_version_id, correct_option_key, explanation_md)
    VALUES (v_version_id, p_payload->>'correct_key', p_payload->>'explanation_md');

    RETURN jsonb_build_object('success', true, 'question_id', p_question_id, 'version_id', v_version_id, 'version_number', v_next_version);
END;
$$;

-- 6e. Review state machine.
CREATE OR REPLACE FUNCTION public.fn_transition_question_version(
    p_version_id UUID,
    p_to TEXT,
    p_actor UUID,
    p_notes TEXT DEFAULT NULL,
    p_checklist JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_version RECORD;
    v_question_status TEXT;
    v_required TEXT[] := ARRAY['correct_key_verified','explanation_correct','no_ambiguity','topic_correct','difficulty_sensible','provenance_verified'];
    v_key TEXT;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT * INTO v_version FROM public.question_versions WHERE id = p_version_id FOR UPDATE;
    IF v_version IS NULL THEN
        RAISE EXCEPTION 'QF_VERSION_NOT_FOUND';
    END IF;

    IF NOT (
        (v_version.lifecycle_status = 'DRAFT' AND p_to = 'IN_REVIEW')
        OR (v_version.lifecycle_status = 'IN_REVIEW' AND p_to IN ('CHANGES_REQUESTED', 'APPROVED', 'REJECTED'))
        OR (v_version.lifecycle_status = 'CHANGES_REQUESTED' AND p_to = 'DRAFT')
    ) THEN
        RAISE EXCEPTION 'QF_ILLEGAL_TRANSITION: % -> % is not allowed', v_version.lifecycle_status, COALESCE(p_to, 'null');
    END IF;

    IF p_to = 'APPROVED' THEN
        IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' OR p_checklist = '{}'::jsonb THEN
            RAISE EXCEPTION 'QF_CHECKLIST_REQUIRED: approval requires the reviewer checklist';
        END IF;
        FOREACH v_key IN ARRAY v_required LOOP
            IF COALESCE((p_checklist->>v_key)::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QF_CHECKLIST_REQUIRED: checklist item "%" must be confirmed', v_key;
            END IF;
        END LOOP;
    END IF;

    IF p_to IN ('CHANGES_REQUESTED', 'REJECTED') AND COALESCE(btrim(p_notes), '') = '' THEN
        RAISE EXCEPTION 'QF_NOTES_REQUIRED: % requires reviewer notes', p_to;
    END IF;

    PERFORM set_config('app.qf_lifecycle_write', 'on', true);

    UPDATE public.question_versions
    SET lifecycle_status = p_to,
        is_current = false
    WHERE id = p_version_id;

    -- Review record (internal; never candidate-readable).
    INSERT INTO public.question_version_authoring (version_id, origin)
    VALUES (p_version_id, 'LEGACY_UNKNOWN')
    ON CONFLICT (version_id) DO NOTHING;

    UPDATE public.question_version_authoring
    SET reviewed_by = CASE WHEN p_to IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN p_actor ELSE reviewed_by END,
        reviewed_at = CASE WHEN p_to IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN now() ELSE reviewed_at END,
        review_notes = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE review_notes END,
        authoring_metadata = CASE
            WHEN p_to = 'APPROVED' THEN authoring_metadata || jsonb_build_object('review_checklist', p_checklist)
            ELSE authoring_metadata
        END,
        updated_at = now()
    WHERE version_id = p_version_id;

    -- Question-level flag mirrors review state only while the question is not yet published.
    SELECT status INTO v_question_status FROM public.questions WHERE id = v_version.question_id FOR UPDATE;
    IF v_question_status IS DISTINCT FROM 'published' THEN
        UPDATE public.questions
        SET status = CASE WHEN p_to IN ('IN_REVIEW', 'APPROVED') THEN 'review' ELSE 'draft' END,
            updated_at = now()
        WHERE id = v_version.question_id;
    END IF;

    PERFORM set_config('app.qf_lifecycle_write', 'off', true);

    RETURN jsonb_build_object(
        'success', true,
        'version_id', p_version_id,
        'from', v_version.lifecycle_status,
        'to', p_to
    );
END;
$$;

-- 6f. Atomic publish: APPROVED → PUBLISHED, previous current → SUPERSEDED, question published.
CREATE OR REPLACE FUNCTION public.fn_publish_question_version(p_version_id UUID, p_actor UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_version RECORD;
    v_previous UUID;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT * INTO v_version FROM public.question_versions WHERE id = p_version_id FOR UPDATE;
    IF v_version IS NULL THEN
        RAISE EXCEPTION 'QF_VERSION_NOT_FOUND';
    END IF;
    IF v_version.lifecycle_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'QF_ILLEGAL_TRANSITION: only APPROVED versions can be published (current: %)', v_version.lifecycle_status;
    END IF;

    -- Lock the question and all its versions (deterministic order).
    PERFORM 1 FROM public.questions WHERE id = v_version.question_id FOR UPDATE;
    PERFORM 1 FROM public.question_versions WHERE question_id = v_version.question_id ORDER BY id FOR UPDATE;

    PERFORM set_config('app.qf_lifecycle_write', 'on', true);

    UPDATE public.question_versions
    SET is_current = false,
        lifecycle_status = CASE WHEN lifecycle_status = 'PUBLISHED' THEN 'SUPERSEDED' ELSE lifecycle_status END
    WHERE question_id = v_version.question_id
      AND id <> p_version_id
      AND is_current = true
    RETURNING id INTO v_previous;

    UPDATE public.question_versions
    SET lifecycle_status = 'PUBLISHED',
        published_at = now(),
        is_current = true
    WHERE id = p_version_id;

    UPDATE public.questions
    SET status = 'published',
        updated_at = now()
    WHERE id = v_version.question_id;

    PERFORM set_config('app.qf_lifecycle_write', 'off', true);

    RETURN jsonb_build_object(
        'success', true,
        'version_id', p_version_id,
        'question_id', v_version.question_id,
        'superseded_version_id', v_previous
    );
END;
$$;

-- Grants: service_role only.
DO $$
DECLARE
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY ARRAY[
        'public.fn_question_stem_checksum(TEXT)',
        'public.fn_qf_find_exact_duplicates(UUID, TEXT[], UUID)',
        'public.fn_qf_assert_item_shape(JSONB, TEXT)',
        'public.fn_import_question_drafts(JSONB, UUID)',
        'public.fn_update_question_draft(UUID, UUID, JSONB)',
        'public.fn_create_question_revision(UUID, UUID, JSONB)',
        'public.fn_transition_question_version(UUID, TEXT, UUID, TEXT, JSONB)',
        'public.fn_publish_question_version(UUID, UUID)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 7. INTEGRITY / IMMUTABILITY TRIGGERS
--    Errata flow inspected before adding: fn_resolve_errata_report only updates
--    question_errata_reports (never question rows), so these triggers do not break it.
-- -----------------------------------------------------------------------------

-- 7a. question_versions: lifecycle changes only via QF functions; frozen content.
CREATE OR REPLACE FUNCTION public.fn_qf_enforce_question_version_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_qf_write BOOLEAN := COALESCE(current_setting('app.qf_lifecycle_write', true), '') = 'on';
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.lifecycle_status <> 'DRAFT' AND NOT v_qf_write THEN
            RAISE EXCEPTION 'QF_LIFECYCLE_VIOLATION: new question versions must start as DRAFT';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.lifecycle_status IN ('IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: % version % cannot be deleted', OLD.lifecycle_status, OLD.id;
        END IF;
        RETURN OLD;
    END IF;

    -- UPDATE
    IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status AND NOT v_qf_write THEN
        RAISE EXCEPTION 'QF_LIFECYCLE_VIOLATION: lifecycle_status may only change through Question Factory functions';
    END IF;

    IF OLD.lifecycle_status NOT IN ('DRAFT', 'CHANGES_REQUESTED') THEN
        IF NEW.question_id IS DISTINCT FROM OLD.question_id
           OR NEW.version_number IS DISTINCT FROM OLD.version_number
           OR NEW.question_text IS DISTINCT FROM OLD.question_text
           OR NEW.difficulty IS DISTINCT FROM OLD.difficulty
           OR NEW.language IS DISTINCT FROM OLD.language
           OR NEW.options_type IS DISTINCT FROM OLD.options_type
           OR NEW.question_image_url IS DISTINCT FROM OLD.question_image_url
           OR NEW.content_checksum IS DISTINCT FROM OLD.content_checksum THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: content of % version % is frozen', OLD.lifecycle_status, OLD.id;
        END IF;
    END IF;

    IF OLD.lifecycle_status IN ('PUBLISHED', 'SUPERSEDED') THEN
        IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: % version % is frozen', OLD.lifecycle_status, OLD.id;
        END IF;
        IF NEW.is_current IS DISTINCT FROM OLD.is_current AND NOT v_qf_write THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: is_current of % version % changes only via fn_publish_question_version', OLD.lifecycle_status, OLD.id;
        END IF;
        IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
           AND NOT (OLD.lifecycle_status = 'PUBLISHED' AND NEW.lifecycle_status = 'SUPERSEDED') THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: % -> % is not allowed', OLD.lifecycle_status, NEW.lifecycle_status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qf_question_version_integrity ON public.question_versions;
CREATE TRIGGER trg_qf_question_version_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.question_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_enforce_question_version_integrity();

-- 7b. question_options / question_answers: editable only while the version is DRAFT / CHANGES_REQUESTED.
CREATE OR REPLACE FUNCTION public.fn_qf_enforce_question_child_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_state TEXT;
    v_new_state TEXT;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        SELECT lifecycle_status INTO v_old_state FROM public.question_versions WHERE id = OLD.question_version_id;
    END IF;
    IF TG_OP IN ('UPDATE', 'INSERT') THEN
        SELECT lifecycle_status INTO v_new_state FROM public.question_versions WHERE id = NEW.question_version_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF v_old_state IN ('IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: % rows of a % version cannot be deleted', TG_TABLE_NAME, v_old_state;
        END IF;
        RETURN OLD;
    END IF;

    IF (v_old_state IS NOT NULL AND v_old_state NOT IN ('DRAFT', 'CHANGES_REQUESTED'))
       OR (v_new_state IS NOT NULL AND v_new_state NOT IN ('DRAFT', 'CHANGES_REQUESTED')) THEN
        RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: % rows of a % version are frozen', TG_TABLE_NAME, COALESCE(v_new_state, v_old_state);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qf_question_options_integrity ON public.question_options;
CREATE TRIGGER trg_qf_question_options_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_enforce_question_child_integrity();

DROP TRIGGER IF EXISTS trg_qf_question_answers_integrity ON public.question_answers;
CREATE TRIGGER trg_qf_question_answers_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.question_answers
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_enforce_question_child_integrity();

-- 7b-bis. question_version_authoring: written only by QF functions; frozen once the
--         version is PUBLISHED / SUPERSEDED. FK cascades that only NULL out
--         created_by / reviewed_by / import_batch_id (e.g. auth user deletion) are allowed.
CREATE OR REPLACE FUNCTION public.fn_qf_enforce_authoring_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT;
    v_qf_write BOOLEAN := COALESCE(current_setting('app.qf_lifecycle_write', true), '') = 'on';
    v_fk_nulling_only BOOLEAN;
BEGIN
    SELECT lifecycle_status INTO v_state FROM public.question_versions WHERE id = OLD.version_id;

    IF TG_OP = 'DELETE' THEN
        IF v_state IN ('IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
            RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: authoring record of a % version cannot be deleted', v_state;
        END IF;
        RETURN OLD;
    END IF;

    v_fk_nulling_only :=
        NEW.version_id = OLD.version_id
        AND NEW.origin IS NOT DISTINCT FROM OLD.origin
        AND NEW.contract_version IS NOT DISTINCT FROM OLD.contract_version
        AND NEW.context_hash IS NOT DISTINCT FROM OLD.context_hash
        AND NEW.authoring_metadata IS NOT DISTINCT FROM OLD.authoring_metadata
        AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
        AND NEW.review_notes IS NOT DISTINCT FROM OLD.review_notes
        AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
        AND (NEW.created_by IS NOT DISTINCT FROM OLD.created_by OR NEW.created_by IS NULL)
        AND (NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_by IS NULL)
        AND (NEW.import_batch_id IS NOT DISTINCT FROM OLD.import_batch_id OR NEW.import_batch_id IS NULL);
    IF v_fk_nulling_only THEN
        RETURN NEW;
    END IF;

    IF v_state IN ('PUBLISHED', 'SUPERSEDED') THEN
        RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: authoring/review record of % version % is frozen', v_state, OLD.version_id;
    END IF;
    IF NOT v_qf_write AND (
        NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
    ) THEN
        RAISE EXCEPTION 'QF_LIFECYCLE_VIOLATION: review fields change only through Question Factory functions';
    END IF;
    IF NEW.version_id IS DISTINCT FROM OLD.version_id
       OR NEW.origin IS DISTINCT FROM OLD.origin
       OR NEW.contract_version IS DISTINCT FROM OLD.contract_version
       OR NEW.context_hash IS DISTINCT FROM OLD.context_hash
       OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'QF_IMMUTABLE_VERSION: provenance of version % is immutable', OLD.version_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qf_question_version_authoring_integrity ON public.question_version_authoring;
CREATE TRIGGER trg_qf_question_version_authoring_integrity
    BEFORE UPDATE OR DELETE ON public.question_version_authoring
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_enforce_authoring_integrity();

-- 7c. questions.status = 'published' may only be set by fn_publish_question_version.
--     Exception: restoring an ARCHIVED question whose current version is already
--     PUBLISHED (it passed review + publish before it was archived).
CREATE OR REPLACE FUNCTION public.fn_qf_guard_question_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.status = 'published'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published')
       AND COALESCE(current_setting('app.qf_lifecycle_write', true), '') <> 'on' THEN
        IF TG_OP = 'UPDATE' AND OLD.status = 'archived' AND EXISTS (
            SELECT 1 FROM public.question_versions
            WHERE question_id = NEW.id AND is_current = true AND lifecycle_status = 'PUBLISHED'
        ) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'QF_PUBLICATION_VIOLATION: questions are published only through fn_publish_question_version';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qf_question_publication_guard ON public.questions;
CREATE TRIGGER trg_qf_question_publication_guard
    BEFORE INSERT OR UPDATE OF status ON public.questions
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_guard_question_publication();

-- 7d. Any new test/quiz/mock row must reference a PUBLISHED current version.
--     Covers every mock builder path (admin, dynamic/premium/adaptive RPC, live tests).
--     Existing rows are untouched (insert/update guard only).
CREATE OR REPLACE FUNCTION public.fn_qf_guard_mock_question_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.question_versions
        WHERE id = NEW.question_version_id
          AND lifecycle_status = 'PUBLISHED'
          AND is_current = true
    ) THEN
        RAISE EXCEPTION 'QF_UNPUBLISHED_VERSION_IN_TEST: question version % is not the current PUBLISHED version', NEW.question_version_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_qf_mock_question_version_guard ON public.mock_questions;
CREATE TRIGGER trg_qf_mock_question_version_guard
    BEFORE INSERT OR UPDATE OF question_version_id ON public.mock_questions
    FOR EACH ROW EXECUTE FUNCTION public.fn_qf_guard_mock_question_version();

REVOKE ALL ON FUNCTION public.fn_qf_enforce_question_version_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_enforce_question_child_integrity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_guard_question_publication() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_guard_mock_question_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_enforce_authoring_integrity() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 8. CANDIDATE RLS — published-only reads
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_unpublished_mock_refs INTEGER;
    v_answer_policies INTEGER;
BEGIN
    -- Pre-check: every existing test question must reference a published (or, on a
    -- re-run, superseded) version, otherwise tightening RLS would break live tests.
    SELECT count(*) INTO v_unpublished_mock_refs
    FROM public.mock_questions mq
    JOIN public.question_versions qv ON qv.id = mq.question_version_id
    WHERE qv.lifecycle_status NOT IN ('PUBLISHED', 'SUPERSEDED');

    IF v_unpublished_mock_refs > 0 THEN
        RAISE EXCEPTION 'QF1_PRECHECK_FAILED: % mock_questions reference non-PUBLISHED versions after backfill. RLS not tightened.', v_unpublished_mock_refs;
    END IF;

    -- Answers must stay server-only.
    SELECT count(*) INTO v_answer_policies
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'question_answers'
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[];

    IF v_answer_policies > 0 THEN
        RAISE EXCEPTION 'QF1_PRECHECK_FAILED: question_answers has % anon/authenticated/public policies; answers must be server-only.', v_answer_policies;
    END IF;
END $$;

-- Versions: PUBLISHED (live) and SUPERSEDED (previously published, needed for
-- historical attempt review). Drafts and review states are never candidate-readable.
DROP POLICY IF EXISTS "Public read published question versions" ON public.question_versions;
DROP POLICY IF EXISTS "QF1 candidate read published question versions" ON public.question_versions;
CREATE POLICY "QF1 candidate read published question versions"
    ON public.question_versions
    FOR SELECT
    USING (lifecycle_status IN ('PUBLISHED', 'SUPERSEDED'));

DROP POLICY IF EXISTS "Public read question options" ON public.question_options;
DROP POLICY IF EXISTS "QF1 candidate read published question options" ON public.question_options;
CREATE POLICY "QF1 candidate read published question options"
    ON public.question_options
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.question_versions qv
            WHERE qv.id = question_options.question_version_id
              AND qv.lifecycle_status IN ('PUBLISHED', 'SUPERSEDED')
        )
    );

-- Exam ↔ question mappings: candidates see mappings of published questions only
-- (previously USING (true) exposed draft question ids). Service role bypasses RLS.
DROP POLICY IF EXISTS "Public read exam question mappings" ON public.exam_question_mappings;
DROP POLICY IF EXISTS "QF1 candidate read published exam question mappings" ON public.exam_question_mappings;
CREATE POLICY "QF1 candidate read published exam question mappings"
    ON public.exam_question_mappings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            WHERE q.id = exam_question_mappings.question_id
              AND q.status = 'published'
        )
    );


-- -----------------------------------------------------------------------------
-- 9. CONSUMER HARDENING — SQL selectors build only from the current PUBLISHED version
--    Signatures and grants unchanged (CREATE OR REPLACE keeps existing grants).
-- -----------------------------------------------------------------------------

-- 9a. Custom practice sessions (latest prior definition: 20260824000013 line 117).
--     Only the version filters change; BOOKMARKED / WRONG_QUESTIONS now resolve to the
--     question's current PUBLISHED version instead of the historical one.
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
            WHERE q.id = ANY(p_manual_question_ids)
              AND qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published'
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'BOOKMARKED' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.user_question_bookmarks uqb
            JOIN public.questions q ON q.id = uqb.question_id
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE uqb.user_id = v_user_id
              AND q.status = 'published'
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
            JOIN public.question_versions hv ON hv.id = mq.question_version_id
            JOIN public.questions q ON q.id = hv.question_id
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE ta.user_id = v_user_id
              AND aa.is_correct = false
              AND q.status = 'published'
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            GROUP BY qv.id
            ORDER BY COUNT(aa.id) DESC
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'WEAK_TOPICS' THEN
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
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published'
              AND (v_weak_topic_ids IS NOT NULL AND q.canonical_topic_id = ANY(v_weak_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'FORGOTTEN_TOPICS' THEN
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
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published'
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
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE qs.source_type = 'PYQ'
              AND q.status = 'published'
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY qv.id
            LIMIT v_count
        ) qv;

    ELSE
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published'
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

-- 9b. Mistake drills (latest prior definition: 20260825000030 line 305).
--     Only the version filter and the question count (now counted from the
--     questions actually included) change.
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
    v_total INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

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
    JOIN public.question_versions qv
      ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
    WHERE q.id = ANY(v_q_ids)
      AND q.status = 'published';

    v_total := COALESCE(jsonb_array_length(v_drill_questions), 0);
    IF v_total < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No published questions available for requested criteria');
    END IF;

    INSERT INTO public.user_mistake_drills (
        user_id, topic_id, cognitive_type_id, total_questions,
        questions_data, status
    ) VALUES (
        v_user_id, p_topic_id, p_cognitive_type_id, v_total,
        v_drill_questions, 'IN_PROGRESS'
    ) RETURNING id INTO v_drill_id;

    RETURN jsonb_build_object(
        'success', true,
        'drill_id', v_drill_id,
        'total_questions', v_total,
        'questions', v_drill_questions
    );
END;
$$;

-- End of QF-1 migration.
