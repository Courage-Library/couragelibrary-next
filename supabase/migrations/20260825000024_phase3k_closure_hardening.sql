-- ============================================================================
-- COURAGE LIBRARY — PHASE 3K: FINAL CLOSURE HARDENING & REMEDIATION
-- Target Schema: couragelibrary-next
-- ============================================================================

-- 1. HARDEN RLS ON search_indexes
ALTER TABLE public.search_indexes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_search_indexes_read_public ON public.search_indexes;
DROP POLICY IF EXISTS p_search_indexes_read_auth ON public.search_indexes;
DROP POLICY IF EXISTS p_search_indexes_staff_all ON public.search_indexes;

CREATE POLICY p_search_indexes_read_public ON public.search_indexes
    FOR SELECT TO anon
    USING (is_published = true AND access_tier = 'FREE');

CREATE POLICY p_search_indexes_read_auth ON public.search_indexes
    FOR SELECT TO authenticated
    USING (
        is_published = true AND (
            access_tier = 'FREE' OR
            EXISTS (
                SELECT 1 FROM public.user_entitlements
                WHERE user_id = auth.uid()
                  AND entitlement_type = 'SUBSCRIPTION'
                  AND is_active = true
                  AND (expires_at IS NULL OR expires_at > now())
            ) OR
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        )
    );

CREATE POLICY p_search_indexes_staff_all ON public.search_indexes
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- 2. HARDEN RLS ON user_search_history
ALTER TABLE public.user_search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_user_search_history_own ON public.user_search_history;
DROP POLICY IF EXISTS p_user_search_history_select_own ON public.user_search_history;
DROP POLICY IF EXISTS p_user_search_history_delete_own ON public.user_search_history;

CREATE POLICY p_user_search_history_select_own ON public.user_search_history
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_user_search_history_delete_own ON public.user_search_history
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());


-- 3. HARDEN RLS ON popular_search_terms
ALTER TABLE public.popular_search_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_popular_search_terms_read_public ON public.popular_search_terms;
DROP POLICY IF EXISTS p_popular_search_terms_staff_all ON public.popular_search_terms;

CREATE POLICY p_popular_search_terms_read_public ON public.popular_search_terms
    FOR SELECT TO public
    USING (is_blocked = false AND search_count >= 10);

CREATE POLICY p_popular_search_terms_staff_all ON public.popular_search_terms
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- 4. HARDEN fn_universal_search
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
    v_facets JSONB := '{}'::jsonb;
    v_total_count INTEGER := 0;
    v_effective_limit INTEGER := LEAST(GREATEST(p_limit, 1), 50);
    v_effective_offset INTEGER := GREATEST(p_offset, 0);
BEGIN
    v_clean_query := trim(p_query);
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'query', '',
            'total_count', 0,
            'results', '[]'::jsonb,
            'facets', jsonb_build_object(
                'entity_types', '{}'::jsonb,
                'access_tiers', '{}'::jsonb
            )
        );
    END IF;

    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    IF v_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'SUBSCRIPTION'
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_has_pro;
    END IF;

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

    WITH authorized_candidates AS (
        SELECT
            s.id as result_id,
            s.entity_type,
            s.source_id,
            s.canonical_url as deep_link,
            COALESCE(s.title_en, s.title_hi, 'Untitled') as title,
            COALESCE(s.body_snippet_en, s.body_snippet_hi, '') as snippet,
            s.exam_id,
            s.subject_id,
            s.topic_id,
            s.category,
            s.year,
            s.access_tier,
            s.quality_rank,
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
        COUNT(*),
        COALESCE(jsonb_agg(
            jsonb_build_object(
                'result_id', sub.result_id,
                'entity_type', sub.entity_type,
                'source_id', sub.source_id,
                'title', sub.title,
                'snippet', sub.snippet,
                'deep_link', sub.deep_link,
                'exam_id', sub.exam_id,
                'topic_id', sub.topic_id,
                'access_tier', sub.access_tier,
                'relevance_score', sub.relevance_score
            )
        ), '[]'::jsonb),
        jsonb_build_object(
            'entity_types', COALESCE((
                SELECT jsonb_object_agg(entity_type, type_count)
                FROM (SELECT entity_type, count(*) as type_count FROM authorized_candidates GROUP BY entity_type) t
            ), '{}'::jsonb),
            'access_tiers', COALESCE((
                SELECT jsonb_object_agg(access_tier, tier_count)
                FROM (SELECT access_tier, count(*) as tier_count FROM authorized_candidates GROUP BY access_tier) a
            ), '{}'::jsonb)
        )
    INTO v_total_count, v_results, v_facets
    FROM (
        SELECT * FROM authorized_candidates
        ORDER BY relevance_score DESC, quality_rank DESC, result_id ASC
        LIMIT v_effective_limit OFFSET v_effective_offset
    ) sub;

    RETURN jsonb_build_object(
        'success', true,
        'query', v_clean_query,
        'has_pro_access', v_has_pro,
        'total_count', COALESCE(v_total_count, 0),
        'limit', v_effective_limit,
        'offset', v_effective_offset,
        'facets', v_facets,
        'results', v_results
    );
END;
$$;


-- 5. HARDEN fn_log_user_search
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
    v_detected_lang TEXT := 'EN';
BEGIN
    IF v_clean_query IS NULL OR length(v_clean_query) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Query cannot be empty');
    END IF;

    IF length(v_clean_query) > 100 THEN
        v_clean_query := substring(v_clean_query from 1 for 100);
    END IF;

    IF v_clean_query ~ '[\u0900-\u097F]' THEN
        v_detected_lang := 'HI';
    ELSE
        v_detected_lang := 'EN';
    END IF;

    v_query_hash := md5(lower(v_clean_query));

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.user_search_history (
            user_id, query_text, result_count, clicked_entity_type, clicked_source_id, searched_at
        ) VALUES (
            v_user_id, v_clean_query, p_result_count, p_clicked_entity_type, p_clicked_source_id, now()
        );
    END IF;

    INSERT INTO public.search_query_logs (
        query_hash, sanitized_query, result_count, is_zero_result, execution_latency_ms, language_detected, created_at
    ) VALUES (
        v_query_hash, lower(v_clean_query), p_result_count, (p_result_count = 0 OR p_is_zero_result), LEAST(p_latency_ms, 60000), v_detected_lang, now()
    );

    RETURN jsonb_build_object('success', true, 'language_detected', v_detected_lang);
END;
$$;


-- 6. INDEX RECONCILIATION HELPER RPC
CREATE OR REPLACE FUNCTION public.fn_reconcile_search_indexes()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF auth.role() != 'service_role' AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- 1. Learning Resources
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'RESOURCE', lr.id, '/resources/' || lr.slug, lr.title, null,
        lr.description, null, lower(lr.title || ' ' || COALESCE(lr.description, '')),
        CASE WHEN lr.access_level = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        (lr.status = 'PUBLISHED'), 300, lr.updated_at
    FROM public.learning_resources lr
    WHERE lr.status = 'PUBLISHED'
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            access_tier = EXCLUDED.access_tier,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- 2. Articles
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'ARTICLE', a.id, '/learn/article/' || a.slug, COALESCE(lr.title, a.meta_title, 'Article'), null,
        COALESCE(a.excerpt, a.meta_description, lr.description, ''), null,
        lower(COALESCE(lr.title, a.meta_title, '') || ' ' || COALESCE(a.excerpt, a.meta_description, '')),
        'ARTICLE', CASE WHEN lr.access_level = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        (a.status = 'PUBLISHED'), 200, a.updated_at
    FROM public.articles a
    LEFT JOIN public.learning_resources lr ON lr.id = a.learning_resource_id
    WHERE a.status = 'PUBLISHED'
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- 3. Courses
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'COURSE', c.id, '/courses/' || c.slug, c.title, null,
        c.description, null, lower(c.title || ' ' || COALESCE(c.description, '')),
        'COURSE', CASE WHEN c.access_tier = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        c.is_published, 500, c.updated_at
    FROM public.courses c
    WHERE c.is_published = true
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- 4. Exam Announcements
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        exam_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'ANNOUNCEMENT', ea.id, '/exams/announcements/' || ea.id, ea.title, null,
        ea.summary, null, lower(ea.title || ' ' || COALESCE(ea.summary, '')),
        ea.exam_id, 'ANNOUNCEMENT', 'FREE', ea.is_published, 150, ea.updated_at
    FROM public.exam_announcements ea
    WHERE ea.is_published = true
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    SELECT count(*) INTO v_count FROM public.search_indexes WHERE is_published = true;

    RETURN jsonb_build_object(
        'success', true,
        'published_index_count', v_count,
        'reconciled_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_universal_search(TEXT, TEXT[], UUID, UUID, TEXT, INTEGER, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_universal_search(TEXT, TEXT[], UUID, UUID, TEXT, INTEGER, INTEGER) TO authenticated, service_role, anon;

REVOKE EXECUTE ON FUNCTION public.fn_log_user_search(TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_log_user_search(TEXT, INTEGER, INTEGER, BOOLEAN, TEXT, UUID) TO authenticated, service_role, anon;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_reconcile_search_indexes() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
