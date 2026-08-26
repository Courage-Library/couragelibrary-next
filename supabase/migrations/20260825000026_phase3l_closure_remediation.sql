-- ============================================================================
-- COURAGE LIBRARY — PHASE 3L: CLOSURE REMEDIATION & FORENSIC HARDENING
-- Target Schema: couragelibrary-next
-- ============================================================================

-- 1. HARDEN RLS ON discussion_threads (Prevent Direct Student Mutation Bypass)
ALTER TABLE public.discussion_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_threads_update_own ON public.discussion_threads;
DROP POLICY IF EXISTS p_threads_update_staff ON public.discussion_threads;
DROP POLICY IF EXISTS p_threads_read_public ON public.discussion_threads;

-- Public read: Exclude archived; for lesson contexts in PRO courses, verify entitlement
CREATE POLICY p_threads_read_public ON public.discussion_threads
    FOR SELECT TO public
    USING (
        status != 'ARCHIVED' AND (
            lesson_id IS NULL OR
            EXISTS (
                SELECT 1 FROM public.course_lessons cl
                JOIN public.course_modules cm ON cm.id = cl.module_id
                JOIN public.courses c ON c.id = cm.course_id
                WHERE cl.id = discussion_threads.lesson_id
                  AND (
                      cl.is_free_preview = true OR
                      c.access_tier = 'FREE' OR
                      (auth.uid() IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public.user_entitlements ue
                          WHERE ue.user_id = auth.uid()
                            AND ue.is_active = true
                            AND (ue.expires_at IS NULL OR ue.expires_at > now())
                      )) OR
                      auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
                      (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
                  )
            )
        )
    );

-- Student Update Policy: Direct update is restricted strictly to staff/service_role
-- Student state modifications MUST use the validated SECURITY DEFINER RPCs
CREATE POLICY p_threads_update_staff ON public.discussion_threads
    FOR UPDATE TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- 2. HARDEN RLS ON discussion_messages (Prevent Faculty Self-Verification & Upvote Tampering)
ALTER TABLE public.discussion_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_messages_update_own ON public.discussion_messages;
DROP POLICY IF EXISTS p_messages_update_staff ON public.discussion_messages;

CREATE POLICY p_messages_update_staff ON public.discussion_messages
    FOR UPDATE TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- 3. EDIT MESSAGE RPC (Safe Content Editing for Author without touching protected columns)
CREATE OR REPLACE FUNCTION public.fn_edit_discussion_message(
    p_message_id UUID,
    p_content_markdown TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_is_deleted BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT author_id, is_deleted INTO v_author_id, v_is_deleted
    FROM public.discussion_messages
    WHERE id = p_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF v_is_deleted THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot edit a deleted message');
    END IF;

    IF v_author_id != v_user_id AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'You can only edit your own messages');
    END IF;

    UPDATE public.discussion_messages
    SET content_markdown = trim(p_content_markdown),
        updated_at = now()
    WHERE id = p_message_id;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'updated_at', now()
    );
END;
$$;


-- 4. HARDEN fn_create_discussion_thread (With Activity Logging)
CREATE OR REPLACE FUNCTION public.fn_create_discussion_thread(
    p_context_type TEXT,
    p_context_id UUID,
    p_title TEXT,
    p_initial_content TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_id UUID;
    v_message_id UUID;
    v_q_id UUID := NULL;
    v_lesson_id UUID := NULL;
    v_article_id UUID := NULL;
    v_topic_id UUID := NULL;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) < 5 OR length(p_title) > 250 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Title must be between 5 and 250 characters');
    END IF;

    IF p_initial_content IS NULL OR length(trim(p_initial_content)) < 2 OR length(p_initial_content) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Initial content must be between 2 and 10000 characters');
    END IF;

    IF p_context_type = 'QUESTION' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.questions WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced question does not exist');
        END IF;
        v_q_id := p_context_id;
    ELSIF p_context_type = 'LESSON' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced lesson does not exist');
        END IF;
        v_lesson_id := p_context_id;
    ELSIF p_context_type = 'ARTICLE' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.articles WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced article does not exist');
        END IF;
        v_article_id := p_context_id;
    ELSIF p_context_type = 'TOPIC' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced topic does not exist');
        END IF;
        v_topic_id := p_context_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid context_type');
    END IF;

    INSERT INTO public.discussion_threads (
        context_type, question_id, lesson_id, article_id, topic_id,
        author_id, title, status, message_count, last_activity_at
    ) VALUES (
        p_context_type, v_q_id, v_lesson_id, v_article_id, v_topic_id,
        v_user_id, trim(p_title), 'OPEN', 1, now()
    ) RETURNING id INTO v_thread_id;

    INSERT INTO public.discussion_messages (
        thread_id, author_id, parent_message_id, content_markdown
    ) VALUES (
        v_thread_id, v_user_id, NULL, trim(p_initial_content)
    ) RETURNING id INTO v_message_id;

    -- Phase 3C Activity Logging
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'COMMUNITY_DOUBT_ASKED',
        jsonb_build_object('thread_id', v_thread_id, 'context_type', p_context_type, 'context_id', p_context_id),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', v_thread_id,
        'root_message_id', v_message_id
    );
END;
$$;


-- 5. HARDEN fn_post_discussion_message (With Notification & Activity)
CREATE OR REPLACE FUNCTION public.fn_post_discussion_message(
    p_thread_id UUID,
    p_content_markdown TEXT,
    p_parent_message_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_status TEXT;
    v_thread_title TEXT;
    v_thread_author_id UUID;
    v_message_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT status, title, author_id INTO v_thread_status, v_thread_title, v_thread_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discussion thread not found');
    END IF;

    IF v_thread_status IN ('LOCKED', 'ARCHIVED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Discussion thread is locked/archived');
    END IF;

    INSERT INTO public.discussion_messages (
        thread_id, author_id, parent_message_id, content_markdown
    ) VALUES (
        p_thread_id, v_user_id, p_parent_message_id, trim(p_content_markdown)
    ) RETURNING id INTO v_message_id;

    UPDATE public.discussion_threads
    SET message_count = message_count + 1,
        last_activity_at = now(),
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3H Notification to Thread Author (if different from replier)
    IF v_thread_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_thread_author_id, 'COMMUNITY', 'NORMAL',
            'New reply on your discussion',
            substring(trim(p_content_markdown) from 1 for 120),
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
            'disc_reply_thread_' || v_message_id,
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    -- Phase 3C Activity Logging
    INSERT INTO public.learning_activity_events (
        user_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, 'COMMUNITY_DOUBT_ANSWERED',
        jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'thread_id', p_thread_id
    );
END;
$$;


-- 6. HARDEN fn_mark_accepted_answer (With Phase 3D Gamification & Phase 3H Notification)
CREATE OR REPLACE FUNCTION public.fn_mark_accepted_answer(
    p_thread_id UUID,
    p_message_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_author_id UUID;
    v_msg_author_id UUID;
    v_msg_thread_id UUID;
    v_is_staff BOOLEAN;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

    SELECT author_id INTO v_author_id
    FROM public.discussion_threads
    WHERE id = p_thread_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thread not found');
    END IF;

    IF v_author_id != v_user_id AND NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only thread author or staff can mark accepted answer');
    END IF;

    SELECT thread_id, author_id INTO v_msg_thread_id, v_msg_author_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND OR v_msg_thread_id != p_thread_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message does not belong to this thread');
    END IF;

    UPDATE public.discussion_threads
    SET accepted_answer_id = p_message_id,
        status = 'RESOLVED',
        updated_at = now()
    WHERE id = p_thread_id;

    -- Phase 3D Gamification Event: Award 25 coins for accepted answer
    v_event_key := 'disc_accepted_' || p_thread_id || '_' || p_message_id;
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_msg_author_id, 'ACCEPTED_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
        'VERIFIED', 'PROCESSED', 25, 25,
        jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Phase 3H Notification to Answer Author
    IF v_msg_author_id != v_user_id THEN
        INSERT INTO public.user_notifications (
            user_id, category, priority, title, body, action_url,
            metadata_json, idempotency_key, created_at
        ) VALUES (
            v_msg_author_id, 'COMMUNITY', 'HIGH',
            'Your answer was accepted!',
            'Your solution was marked as the accepted answer (+25 coins bonus).',
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', p_message_id),
            'disc_notif_accepted_' || p_message_id,
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', p_thread_id,
        'accepted_answer_id', p_message_id,
        'status', 'RESOLVED'
    );
END;
$$;


-- 7. HARDEN fn_vote_discussion_message (With Gamification Milestone)
CREATE OR REPLACE FUNCTION public.fn_vote_discussion_message(
    p_message_id UUID,
    p_vote_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_msg_author_id UUID;
    v_thread_id UUID;
    v_new_count INTEGER;
    v_event_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT author_id, thread_id INTO v_msg_author_id, v_thread_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF p_vote_action = 'ADD' THEN
        INSERT INTO public.discussion_votes (message_id, user_id)
        VALUES (p_message_id, v_user_id)
        ON CONFLICT (message_id, user_id) DO NOTHING;
    ELSIF p_vote_action = 'REMOVE' THEN
        DELETE FROM public.discussion_votes
        WHERE message_id = p_message_id AND user_id = v_user_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid vote action. Must be ADD or REMOVE');
    END IF;

    SELECT count(*) INTO v_new_count
    FROM public.discussion_votes
    WHERE message_id = p_message_id;

    UPDATE public.discussion_messages
    SET upvote_count = v_new_count,
        updated_at = now()
    WHERE id = p_message_id;

    -- Phase 3D Milestone Bonus (At 5 upvotes, award 10 coins)
    IF v_new_count >= 5 THEN
        v_event_key := 'disc_upvote_milestone_5_' || p_message_id;
        INSERT INTO public.gamification_events (
            user_id, event_type, source_type, source_id, idempotency_key,
            verification_status, reward_status, calculated_coins, actual_coins_awarded,
            metadata, occurred_at
        ) VALUES (
            v_msg_author_id, 'HELPFUL_ANSWER_BONUS', 'DISCUSSION_MESSAGE', p_message_id, v_event_key,
            'VERIFIED', 'PROCESSED', 10, 10,
            jsonb_build_object('message_id', p_message_id, 'milestone', 5),
            now()
        ) ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'upvote_count', v_new_count
    );
END;
$$;


-- 8. HARDEN fn_flag_discussion_content (With Target Validation)
CREATE OR REPLACE FUNCTION public.fn_flag_discussion_content(
    p_target_type TEXT,
    p_target_id UUID,
    p_reason TEXT,
    p_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_flag_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_target_type NOT IN ('THREAD', 'MESSAGE') THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_type must be THREAD or MESSAGE');
    END IF;

    IF p_reason NOT IN ('SPAM', 'TOXICITY', 'INAPPROPRIATE', 'MISINFORMATION', 'DUPLICATE', 'OTHER') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reason');
    END IF;

    -- Validate target existence
    IF p_target_type = 'THREAD' AND NOT EXISTS (SELECT 1 FROM public.discussion_threads WHERE id = p_target_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target thread does not exist');
    ELSIF p_target_type = 'MESSAGE' AND NOT EXISTS (SELECT 1 FROM public.discussion_messages WHERE id = p_target_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target message does not exist');
    END IF;

    INSERT INTO public.discussion_moderation_flags (
        target_type, target_id, reported_by_user_id, reason, details, status
    ) VALUES (
        p_target_type, p_target_id, v_user_id, p_reason, trim(p_details), 'PENDING'
    ) ON CONFLICT (target_type, target_id, reported_by_user_id)
    DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details, created_at = now()
    RETURNING id INTO v_flag_id;

    RETURN jsonb_build_object(
        'success', true,
        'flag_id', v_flag_id,
        'status', 'PENDING'
    );
END;
$$;


-- 9. UPDATE fn_reconcile_search_indexes (Include Resolved Public Discussions)
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

    -- 5. Public Resolved Discussion Threads
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        topic_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'DISCUSSION', dt.id, '/discussions/' || dt.id, dt.title, null,
        COALESCE(dm.content_markdown, dt.title), null,
        lower(dt.title || ' ' || COALESCE(dm.content_markdown, '')),
        dt.topic_id, 'COMMUNITY', 'FREE', (dt.status IN ('OPEN', 'RESOLVED')), 180, dt.updated_at
    FROM public.discussion_threads dt
    LEFT JOIN public.discussion_messages dm ON dm.id = dt.accepted_answer_id
    WHERE dt.status IN ('OPEN', 'RESOLVED')
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

REVOKE EXECUTE ON FUNCTION public.fn_edit_discussion_message(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_edit_discussion_message(UUID, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
