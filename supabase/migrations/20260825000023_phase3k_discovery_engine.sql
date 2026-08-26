-- ============================================================================
-- COURAGE LIBRARY — PHASE 3K: UNIVERSAL BILINGUAL SEARCH & DISCOVERY ENGINE
-- Target Schema: couragelibrary-next
-- Expected Table Count: 77 -> 81 Tables
-- ============================================================================

-- 0. ENABLE PG_TRGM EXTENSION
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. TABLE: search_indexes (Materialized Universal Full-Text Projection)
CREATE TABLE IF NOT EXISTS public.search_indexes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('QUESTION', 'ARTICLE', 'RESOURCE', 'COURSE', 'LESSON', 'ANNOUNCEMENT')),
    source_id UUID NOT NULL,
    canonical_url TEXT NOT NULL CHECK (length(canonical_url) <= 300),
    title_en TEXT,
    title_hi TEXT,
    body_snippet_en TEXT,
    body_snippet_hi TEXT,
    normalized_keywords TEXT NOT NULL DEFAULT '',
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    category TEXT,
    year INTEGER CHECK (year BETWEEN 2000 AND 2100),
    access_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (access_tier IN ('FREE', 'PRO', 'COURSE_ONLY')),
    is_published BOOLEAN NOT NULL DEFAULT true,
    quality_rank INTEGER NOT NULL DEFAULT 100 CHECK (quality_rank BETWEEN 0 AND 1000),
    
    -- Dual Full-Text Vectors (English + Devanagari Hindi)
    search_vector_en tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title_en, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(normalized_keywords, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(body_snippet_en, '')), 'C')
    ) STORED,
    
    search_vector_hi tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title_hi, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(normalized_keywords, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(body_snippet_hi, '')), 'C')
    ) STORED,
    
    source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_search_entity_source UNIQUE (entity_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_search_vector_en ON public.search_indexes USING GIN (search_vector_en);
CREATE INDEX IF NOT EXISTS idx_search_vector_hi ON public.search_indexes USING GIN (search_vector_hi);
CREATE INDEX IF NOT EXISTS idx_search_trgm_title_en ON public.search_indexes USING GIN (title_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_trgm_title_hi ON public.search_indexes USING GIN (title_hi gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_search_facets ON public.search_indexes (entity_type, exam_id, topic_id, access_tier) WHERE is_published = true;


-- 2. TABLE: user_search_history (Student-Private Search History)
CREATE TABLE IF NOT EXISTS public.user_search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL CHECK (length(query_text) <= 150),
    result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
    clicked_entity_type TEXT CHECK (clicked_entity_type IN ('QUESTION', 'ARTICLE', 'RESOURCE', 'COURSE', 'LESSON', 'ANNOUNCEMENT')),
    clicked_source_id UUID,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_search_history_user ON public.user_search_history(user_id, searched_at DESC);


-- 3. TABLE: popular_search_terms (Trending & Suggested Searches)
CREATE TABLE IF NOT EXISTS public.popular_search_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_query TEXT NOT NULL UNIQUE CHECK (length(normalized_query) <= 100),
    display_title_en TEXT NOT NULL,
    display_title_hi TEXT,
    category TEXT DEFAULT 'GENERAL',
    search_count INTEGER NOT NULL DEFAULT 1 CHECK (search_count >= 1),
    trend_score NUMERIC(8,2) NOT NULL DEFAULT 1.00 CHECK (trend_score >= 0),
    is_promoted BOOLEAN NOT NULL DEFAULT false,
    is_blocked BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_popular_search_trend ON public.popular_search_terms(trend_score DESC) WHERE is_blocked = false;


-- 4. TABLE: search_query_logs (Telemetry & Zero-Result Analytics)
CREATE TABLE IF NOT EXISTS public.search_query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_hash TEXT NOT NULL,
    sanitized_query TEXT NOT NULL CHECK (length(sanitized_query) <= 150),
    result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
    is_zero_result BOOLEAN NOT NULL DEFAULT false,
    execution_latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (execution_latency_ms >= 0),
    language_detected TEXT NOT NULL DEFAULT 'EN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_query_logs_zero ON public.search_query_logs(created_at DESC) WHERE is_zero_result = true;


-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE public.search_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popular_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_query_logs ENABLE ROW LEVEL SECURITY;

-- search_indexes policies
DROP POLICY IF EXISTS p_search_indexes_read_public ON public.search_indexes;
CREATE POLICY p_search_indexes_read_public ON public.search_indexes
    FOR SELECT TO public
    USING (is_published = true);

DROP POLICY IF EXISTS p_search_indexes_staff_all ON public.search_indexes;
CREATE POLICY p_search_indexes_staff_all ON public.search_indexes
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- user_search_history policies
DROP POLICY IF EXISTS p_user_search_history_own ON public.user_search_history;
CREATE POLICY p_user_search_history_own ON public.user_search_history
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- popular_search_terms policies
DROP POLICY IF EXISTS p_popular_search_terms_read_public ON public.popular_search_terms;
CREATE POLICY p_popular_search_terms_read_public ON public.popular_search_terms
    FOR SELECT TO public
    USING (is_blocked = false);

DROP POLICY IF EXISTS p_popular_search_terms_staff_all ON public.popular_search_terms;
CREATE POLICY p_popular_search_terms_staff_all ON public.popular_search_terms
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- search_query_logs policies
DROP POLICY IF EXISTS p_search_query_logs_staff ON public.search_query_logs;
CREATE POLICY p_search_query_logs_staff ON public.search_query_logs
    FOR SELECT TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- ============================================================================
-- RUNTIME FUNCTIONS & RPCS
-- ============================================================================

-- 1. UNIVERSAL SEARCH RPC
CREATE OR REPLACE FUNCTION public.fn_universal_search(
    p_query TEXT,
    p_entity_types TEXT[] DEFAULT NULL,
    p_exam_id UUID DEFAULT NULL,
    p_topic_id UUID DEFAULT NULL,
    p_access_tier TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_pro BOOLEAN := false;
    v_clean_query TEXT;
    v_tsquery_en tsquery;
    v_tsquery_hi tsquery;
    v_results JSONB := '[]'::jsonb;
    v_total_count INTEGER := 0;
    v_effective_limit INTEGER := LEAST(GREATEST(p_limit, 1), 50);
    v_effective_offset INTEGER := GREATEST(p_offset, 0);
BEGIN
    -- Input sanitization
    v_clean_query := trim(p_query);
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'query', '',
            'total_count', 0,
            'results', '[]'::jsonb
        );
    END IF;

    -- Query length cap
    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    -- Check Pro Entitlement status (Phase 3I)
    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'SUBSCRIPTION'
              AND status = 'ACTIVE'
              AND (valid_until IS NULL OR valid_until > now())
        ) INTO v_has_pro;
    END IF;

    -- Generate safe tsquery objects
    BEGIN
        v_tsquery_en := plainto_tsquery('english', v_clean_query);
    EXCEPTION WHEN OTHERS THEN
        v_tsquery_en := to_tsquery('english', '');
    END;

    BEGIN
        v_tsquery_hi := plainto_tsquery('simple', v_clean_query);
    EXCEPTION WHEN OTHERS THEN
        v_tsquery_hi := to_tsquery('simple', '');
    END;

    -- Execute search with pre-ranking entitlement filtering
    WITH ranked_candidates AS (
        SELECT
            s.id as result_id,
            s.entity_type,
            s.source_id,
            s.canonical_url as deep_link,
            COALESCE(s.title_en, s.title_hi, 'Untitled') as title,
            s.title_en,
            s.title_hi,
            COALESCE(s.body_snippet_en, s.body_snippet_hi, '') as snippet,
            s.exam_id,
            s.subject_id,
            s.topic_id,
            s.category,
            s.year,
            s.access_tier,
            s.quality_rank,
            -- Relevance Formula: 0.50*FTS + 0.30*Trigram + 0.10*ExactTitle + 0.10*Quality
            (
                0.50 * GREATEST(
                    CASE WHEN v_tsquery_en IS NOT NULL AND s.search_vector_en @@ v_tsquery_en THEN ts_rank(s.search_vector_en, v_tsquery_en) ELSE 0.0 END,
                    CASE WHEN v_tsquery_hi IS NOT NULL AND s.search_vector_hi @@ v_tsquery_hi THEN ts_rank(s.search_vector_hi, v_tsquery_hi) ELSE 0.0 END
                ) +
                0.30 * GREATEST(
                    similarity(COALESCE(s.title_en, ''), v_clean_query),
                    similarity(COALESCE(s.title_hi, ''), v_clean_query)
                ) +
                0.10 * (CASE WHEN lower(COALESCE(s.title_en, '')) = lower(v_clean_query) OR COALESCE(s.title_hi, '') = v_clean_query THEN 1.0 ELSE 0.0 END) +
                0.10 * (s.quality_rank::numeric / 1000.0)
            )::numeric(5,4) as relevance_score
        FROM public.search_indexes s
        WHERE s.is_published = true
          -- Pre-ranking entitlement guard
          AND (v_has_pro = true OR auth.role() = 'service_role' OR s.access_tier = 'FREE')
          AND (p_entity_types IS NULL OR s.entity_type = ANY(p_entity_types))
          AND (p_exam_id IS NULL OR s.exam_id = p_exam_id)
          AND (p_topic_id IS NULL OR s.topic_id = p_topic_id)
          AND (p_access_tier IS NULL OR s.access_tier = p_access_tier)
          AND (
              (v_tsquery_en IS NOT NULL AND s.search_vector_en @@ v_tsquery_en) OR
              (v_tsquery_hi IS NOT NULL AND s.search_vector_hi @@ v_tsquery_hi) OR
              similarity(COALESCE(s.title_en, ''), v_clean_query) > 0.20 OR
              similarity(COALESCE(s.title_hi, ''), v_clean_query) > 0.20 OR
              s.normalized_keywords ILIKE '%' || v_clean_query || '%'
          )
    )
    SELECT
        COUNT(*) OVER() as full_count,
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'result_id', rc.result_id,
                'entity_type', rc.entity_type,
                'source_id', rc.source_id,
                'title', rc.title,
                'snippet', rc.snippet,
                'deep_link', rc.deep_link,
                'exam_id', rc.exam_id,
                'topic_id', rc.topic_id,
                'access_tier', rc.access_tier,
                'relevance_score', rc.relevance_score
            ) ORDER BY rc.relevance_score DESC, rc.quality_rank DESC
        ), '[]'::jsonb)
    INTO v_total_count, v_results
    FROM (
        SELECT * FROM ranked_candidates
        ORDER BY relevance_score DESC, quality_rank DESC
        LIMIT v_effective_limit OFFSET v_effective_offset
    ) rc;

    RETURN jsonb_build_object(
        'success', true,
        'query', v_clean_query,
        'has_pro_access', v_has_pro,
        'total_count', COALESCE(v_total_count, 0),
        'limit', v_effective_limit,
        'offset', v_effective_offset,
        'results', v_results
    );
END;
$$;


-- 2. USER SEARCH LOGGING RPC
CREATE OR REPLACE FUNCTION public.fn_log_user_search(
    p_query TEXT,
    p_result_count INTEGER DEFAULT 0,
    p_latency_ms INTEGER DEFAULT 0,
    p_is_zero_result BOOLEAN DEFAULT false,
    p_clicked_entity_type TEXT DEFAULT NULL,
    p_clicked_source_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_query TEXT := trim(p_query);
    v_query_hash TEXT;
BEGIN
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Query cannot be empty');
    END IF;

    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    v_query_hash := md5(lower(v_clean_query));

    -- Record in student-private search history if authenticated
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.user_search_history (
            user_id, query_text, result_count, clicked_entity_type, clicked_source_id, searched_at
        ) VALUES (
            v_user_id, v_clean_query, p_result_count, p_clicked_entity_type, p_clicked_source_id, now()
        );
    END IF;

    -- Record in anonymized telemetry logs (0 PII)
    INSERT INTO public.search_query_logs (
        query_hash, sanitized_query, result_count, is_zero_result, execution_latency_ms, created_at
    ) VALUES (
        v_query_hash, lower(v_clean_query), p_result_count, (p_result_count = 0 OR p_is_zero_result), p_latency_ms, now()
    );

    RETURN jsonb_build_object('success', true);
END;
$$;


-- 3. CLEAR USER SEARCH HISTORY RPC
CREATE OR REPLACE FUNCTION public.fn_clear_user_search_history()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deleted_count INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    DELETE FROM public.user_search_history
    WHERE user_id = v_user_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_count', v_deleted_count
    );
END;
$$;


-- ============================================================================
-- GRANTS & PERMISSIONS
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.fn_universal_search(TEXT, TEXT[], UUID, UUID, TEXT, INTEGER, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_universal_search(TEXT, TEXT[], UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role, anon;

REVOKE EXECUTE ON FUNCTION public.fn_log_user_search(TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_log_user_search(TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, UUID) TO authenticated, service_role, anon;

REVOKE EXECUTE ON FUNCTION public.fn_clear_user_search_history() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_clear_user_search_history() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
