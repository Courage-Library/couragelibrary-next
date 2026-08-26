-- ============================================================================
-- COURAGE LIBRARY — PHASE 3E: RPC AUTHORIZATION & SECURITY HARDENING
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Hardened Article Publishing Function with Staff Role Check
CREATE OR REPLACE FUNCTION public.fn_publish_article_version(
    p_article_id UUID,
    p_content_body TEXT,
    p_content_format TEXT DEFAULT 'MARKDOWN',
    p_changelog TEXT DEFAULT NULL,
    p_author_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_next_version INTEGER;
    v_version_id UUID;
BEGIN
    v_caller_id := auth.uid();
    
    IF v_caller_id IS NOT NULL THEN
        SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
        IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'content_manager', 'editor', 'teacher') THEN
            RAISE EXCEPTION 'Unauthorized: Caller does not have permission to publish article versions';
        END IF;
    END IF;

    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
    FROM public.article_versions WHERE article_id = p_article_id;

    UPDATE public.article_versions
    SET is_current = false
    WHERE article_id = p_article_id AND is_current = true;

    INSERT INTO public.article_versions (
        article_id, version_number, content_format, content_body,
        changelog, is_current, created_by, published_at
    ) VALUES (
        p_article_id, v_next_version, p_content_format, p_content_body,
        p_changelog, true, COALESCE(v_caller_id, p_author_id), now()
    ) RETURNING id INTO v_version_id;

    UPDATE public.articles
    SET status = 'PUBLISHED',
        published_at = now(),
        updated_at = now()
    WHERE id = p_article_id;

    RETURN jsonb_build_object('success', true, 'version_id', v_version_id, 'version_number', v_next_version);
END;
$$;

-- 2. Entitlement-Aware "Learn More" Dynamic Resolution Function
CREATE OR REPLACE FUNCTION public.fn_resolve_learn_more(
    p_question_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_target_user_id UUID;
    v_topic_id UUID;
    v_topic_name TEXT;
    v_has_pro BOOLEAN := false;
    v_rec RECORD;
    v_is_entitled BOOLEAN := false;
BEGIN
    v_target_user_id := COALESCE(p_user_id, auth.uid());

    IF v_target_user_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_target_user_id
              AND entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_has_pro;
    END IF;

    SELECT q.canonical_topic_id, t.name INTO v_topic_id, v_topic_name
    FROM public.questions q
    JOIN public.topics t ON t.id = q.canonical_topic_id
    WHERE q.id = p_question_id;

    IF v_topic_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Topic not found for question');
    END IF;

    SELECT 
        lr.id AS learning_resource_id,
        lr.resource_type,
        lr.title,
        lr.slug,
        lr.access_level,
        COALESCE(a.slug, cl.slug) AS content_slug,
        a.excerpt,
        cm.course_id,
        lrt.is_primary,
        lrt.relevance_score
    INTO v_rec
    FROM public.learning_resource_topics lrt
    JOIN public.learning_resources lr ON lr.id = lrt.learning_resource_id AND lr.status = 'PUBLISHED'
    LEFT JOIN public.articles a ON a.learning_resource_id = lr.id AND a.status = 'PUBLISHED'
    LEFT JOIN public.course_lessons cl ON cl.learning_resource_id = lr.id AND cl.is_published = true
    LEFT JOIN public.course_modules cm ON cm.id = cl.module_id
    WHERE lrt.topic_id = v_topic_id
    ORDER BY 
        lrt.is_primary DESC,
        CASE WHEN lr.resource_type = 'REVISION_NOTE' THEN 1
             WHEN lr.resource_type = 'ARTICLE' THEN 2
             WHEN lr.resource_type = 'COURSE_LESSON' THEN 3
             ELSE 4 END,
        lrt.relevance_score DESC
    LIMIT 1;

    IF v_rec IS NULL THEN
        RETURN jsonb_build_object('success', false, 'topic_id', v_topic_id, 'topic_name', v_topic_name, 'message', 'No published learning resource found for topic');
    END IF;

    IF v_rec.access_level = 'FREE' THEN
        v_is_entitled := true;
    ELSIF v_rec.access_level = 'PRO' AND v_has_pro THEN
        v_is_entitled := true;
    ELSIF v_rec.access_level = 'PAID_COURSE' AND v_target_user_id IS NOT NULL AND v_rec.course_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_target_user_id
              AND entitlement_type = 'COURSE_PURCHASE'
              AND course_id = v_rec.course_id
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    ELSE
        v_is_entitled := false;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'topic_id', v_topic_id,
        'topic_name', v_topic_name,
        'learning_resource_id', v_rec.learning_resource_id,
        'resource_type', v_rec.resource_type,
        'title', v_rec.title,
        'slug', v_rec.slug,
        'access_level', v_rec.access_level,
        'content_slug', v_rec.content_slug,
        'excerpt', v_rec.excerpt,
        'is_primary', v_rec.is_primary,
        'relevance_score', v_rec.relevance_score,
        'is_entitled', v_is_entitled,
        'has_pro', v_has_pro,
        'is_locked', NOT v_is_entitled
    );
END;
$$;

-- 3. Tighten Execute Permissions
REVOKE EXECUTE ON FUNCTION public.fn_publish_article_version FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_publish_article_version TO service_role;

GRANT EXECUTE ON FUNCTION public.fn_resolve_learn_more TO anon, authenticated, service_role;
