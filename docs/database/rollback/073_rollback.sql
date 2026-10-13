-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 073 (gap2_2b_retire_legacy_learning)
-- NOT a migration. Apply only with owner approval, in ONE transaction, then mark the 073 ledger
-- row ROLLED_BACK. Restores: the four legacy tables to public (with their original grants:
-- anon/authenticated SELECT), the dependent columns + FKs + checks + indexes with their values
-- from retired.gap2_2b_legacy_refs, and the original definitions of the six functions.
-- Rows written to the new learning_document_id columns after 073 are discarded.
-- =============================================================================

-- 1. Tables back to public + original grants ------------------------------------------------------
ALTER TABLE retired.learning_resources        SET SCHEMA public;
ALTER TABLE retired.learning_resource_topics  SET SCHEMA public;
ALTER TABLE retired.articles                  SET SCHEMA public;
ALTER TABLE retired.article_versions          SET SCHEMA public;
GRANT SELECT ON public.learning_resources, public.learning_resource_topics, public.articles, public.article_versions TO anon, authenticated;

-- 2. Dependent columns --------------------------------------------------------------------------------
-- course_lessons.learning_resource_id
ALTER TABLE public.course_lessons ADD COLUMN learning_resource_id uuid NULL;
UPDATE public.course_lessons t SET learning_resource_id = r.old_value::uuid
FROM retired.gap2_2b_legacy_refs r
WHERE r.source_table = 'course_lessons' AND r.column_name = 'learning_resource_id' AND (r.source_pk->>'id')::uuid = t.id;
ALTER TABLE public.course_lessons ADD CONSTRAINT course_lessons_learning_resource_id_key UNIQUE (learning_resource_id);
ALTER TABLE public.course_lessons ADD CONSTRAINT course_lessons_learning_resource_id_fkey
    FOREIGN KEY (learning_resource_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL;

-- daily_study_recommendations.resource_id
ALTER TABLE public.daily_study_recommendations ADD COLUMN resource_id uuid NULL;
UPDATE public.daily_study_recommendations t SET resource_id = r.old_value::uuid
FROM retired.gap2_2b_legacy_refs r
WHERE r.source_table = 'daily_study_recommendations' AND r.column_name = 'resource_id' AND (r.source_pk->>'id')::uuid = t.id;
ALTER TABLE public.daily_study_recommendations ADD CONSTRAINT daily_study_recommendations_resource_id_fkey
    FOREIGN KEY (resource_id) REFERENCES public.learning_resources(id) ON DELETE SET NULL;
ALTER TABLE public.daily_study_recommendations DROP COLUMN learning_document_id;

-- batch_curriculum_assignments.article_id
ALTER TABLE public.batch_curriculum_assignments DROP CONSTRAINT chk_assignment_content_xor;
ALTER TABLE public.batch_curriculum_assignments ADD COLUMN article_id uuid NULL;
UPDATE public.batch_curriculum_assignments t SET article_id = r.old_value::uuid
FROM retired.gap2_2b_legacy_refs r
WHERE r.source_table = 'batch_curriculum_assignments' AND r.column_name = 'article_id' AND (r.source_pk->>'id')::uuid = t.id;
ALTER TABLE public.batch_curriculum_assignments ADD CONSTRAINT batch_curriculum_assignments_article_id_fkey
    FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;
ALTER TABLE public.batch_curriculum_assignments DROP COLUMN learning_document_id;
ALTER TABLE public.batch_curriculum_assignments ADD CONSTRAINT chk_assignment_content_xor
    CHECK (num_nonnulls(mock_test_id, course_id, course_lesson_id, flashcard_deck_id, article_id, topic_id) = 1);

-- discussion_threads.article_id
ALTER TABLE public.discussion_threads DROP CONSTRAINT check_exact_single_context;
ALTER TABLE public.discussion_threads ADD COLUMN article_id uuid NULL;
UPDATE public.discussion_threads t SET article_id = r.old_value::uuid
FROM retired.gap2_2b_legacy_refs r
WHERE r.source_table = 'discussion_threads' AND r.column_name = 'article_id' AND (r.source_pk->>'id')::uuid = t.id;
ALTER TABLE public.discussion_threads ADD CONSTRAINT discussion_threads_article_id_fkey
    FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS public.idx_threads_learning_document;
ALTER TABLE public.discussion_threads DROP COLUMN learning_document_id;
CREATE INDEX idx_threads_article ON public.discussion_threads USING btree (article_id, created_at DESC) WHERE (article_id IS NOT NULL);
ALTER TABLE public.discussion_threads ADD CONSTRAINT check_exact_single_context CHECK (
    (CASE WHEN question_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN article_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END) = 1);

-- 3. Original function definitions ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_discussion_thread(p_context_type text, p_context_id uuid, p_title text, p_initial_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_create_batch_assignment(p_batch_id uuid, p_title text, p_assignment_type text, p_content_id uuid, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_instructions_md text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_complete_course_lesson(p_lesson_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID;
    v_course_id UUID;
    v_lesson_type TEXT;
    v_duration INTEGER;
    v_learning_res_id UUID;
    v_canonical_topic_id UUID;
    v_is_preview BOOLEAN;
    v_course_tier TEXT;
    v_is_entitled BOOLEAN := false;
    v_curr_record RECORD;
    v_total_lessons INTEGER;
    v_completed_lessons INTEGER;
    v_progress_pct NUMERIC(5,2);
    v_is_course_done BOOLEAN := false;
    v_idempotency_key TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    SELECT 
        cl.lesson_type,
        cl.duration_seconds,
        cl.learning_resource_id,
        cl.is_free_preview,
        c.id AS course_id,
        c.access_tier
    INTO v_lesson_type, v_duration, v_learning_res_id, v_is_preview, v_course_id, v_course_tier
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    JOIN public.courses c ON c.id = cm.course_id
    WHERE cl.id = p_lesson_id AND cl.is_published = true;

    IF v_course_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Lesson not found or unpublished');
    END IF;

    IF v_is_preview = true OR v_course_tier = 'FREE' THEN
        v_is_entitled := true;
    ELSIF v_course_tier = 'PRO' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type IN ('PRO_SUBSCRIPTION', 'PROMOTIONAL_PASS')
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    ELSIF v_course_tier = 'PAID' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements
            WHERE user_id = v_user_id
              AND entitlement_type = 'COURSE_PURCHASE'
              AND course_id = v_course_id
              AND is_active = true
              AND (expires_at IS NULL OR expires_at > now())
        ) INTO v_is_entitled;
    END IF;

    IF NOT v_is_entitled THEN
        RETURN jsonb_build_object('success', false, 'error', 'Entitlement required to complete lesson');
    END IF;

    SELECT * INTO v_curr_record
    FROM public.user_lesson_completions
    WHERE user_id = v_user_id AND lesson_id = p_lesson_id;

    IF v_lesson_type = 'VIDEO' AND v_duration > 0 THEN
        IF v_curr_record IS NULL OR 
           v_curr_record.max_watched_seconds < (0.85 * v_duration) OR 
           v_curr_record.verified_seconds_spent < (0.70 * v_duration) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Completion criteria not met',
                'max_watched_seconds', COALESCE(v_curr_record.max_watched_seconds, 0),
                'required_max_watched', ROUND(0.85 * v_duration),
                'verified_seconds_spent', COALESCE(v_curr_record.verified_seconds_spent, 0),
                'required_verified_spent', ROUND(0.70 * v_duration)
            );
        END IF;
    ELSE
        IF v_curr_record IS NOT NULL AND v_curr_record.verified_seconds_spent < LEAST(60, 0.50 * COALESCE(v_duration, 120)) THEN
            IF v_curr_record.verified_seconds_spent < 15 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Minimum reading dwell time required before completion');
            END IF;
        END IF;
    END IF;

    INSERT INTO public.user_lesson_completions (
        user_id, course_id, lesson_id, is_completed, completed_at, last_interaction_at
    ) VALUES (
        v_user_id, v_course_id, p_lesson_id, true, now(), now()
    ) ON CONFLICT (user_id, lesson_id) DO UPDATE SET
        is_completed = true,
        completed_at = COALESCE(user_lesson_completions.completed_at, now()),
        updated_at = now();

    PERFORM 1 FROM public.user_course_progress
    WHERE user_id = v_user_id AND course_id = v_course_id
    FOR UPDATE;

    SELECT COUNT(cl.id) INTO v_total_lessons
    FROM public.course_lessons cl
    JOIN public.course_modules cm ON cm.id = cl.module_id
    WHERE cm.course_id = v_course_id AND cl.is_published = true;

    SELECT COUNT(DISTINCT ulc.lesson_id) INTO v_completed_lessons
    FROM public.user_lesson_completions ulc
    JOIN public.course_lessons cl ON cl.id = ulc.lesson_id
    JOIN public.course_modules cm ON cm.id = cl.module_id
    WHERE ulc.user_id = v_user_id
      AND cm.course_id = v_course_id
      AND ulc.is_completed = true
      AND cl.is_published = true;

    IF v_total_lessons > 0 THEN
        v_progress_pct := ROUND((v_completed_lessons::numeric / v_total_lessons::numeric) * 100.0, 2);
    ELSE
        v_progress_pct := 0.00;
    END IF;

    IF v_progress_pct >= 100.00 THEN
        v_is_course_done := true;
    END IF;

    INSERT INTO public.user_course_progress (
        user_id, course_id, total_lessons, completed_lessons,
        progress_pct, last_lesson_id, is_completed, completed_at, last_accessed_at
    ) VALUES (
        v_user_id, v_course_id, v_total_lessons, v_completed_lessons,
        v_progress_pct, p_lesson_id, v_is_course_done,
        CASE WHEN v_is_course_done THEN now() ELSE NULL END, now()
    ) ON CONFLICT (user_id, course_id) DO UPDATE SET
        total_lessons = v_total_lessons,
        completed_lessons = v_completed_lessons,
        progress_pct = v_progress_pct,
        last_lesson_id = p_lesson_id,
        is_completed = v_is_course_done,
        completed_at = CASE 
            WHEN v_is_course_done AND user_course_progress.completed_at IS NULL THEN now()
            ELSE user_course_progress.completed_at END,
        last_accessed_at = now(),
        updated_at = now();

    IF v_learning_res_id IS NOT NULL THEN
        SELECT topic_id INTO v_canonical_topic_id
        FROM public.learning_resource_topics
        WHERE learning_resource_id = v_learning_res_id
        ORDER BY is_primary DESC, relevance_score DESC
        LIMIT 1;

        IF v_canonical_topic_id IS NOT NULL THEN
            v_idempotency_key := 'lesson_completed:' || v_user_id::text || ':' || p_lesson_id::text;
            
            INSERT INTO public.learning_activity_events (
                user_id,
                topic_id,
                event_type,
                resource_type,
                resource_id,
                idempotency_key,
                event_payload
            ) VALUES (
                v_user_id,
                v_canonical_topic_id,
                'LESSON_COMPLETED',
                'COURSE_LESSON',
                p_lesson_id,
                v_idempotency_key,
                jsonb_build_object(
                    'course_id', v_course_id,
                    'lesson_id', p_lesson_id,
                    'duration_seconds', v_duration,
                    'completed_at', now()
                )
            ) ON CONFLICT (idempotency_key) DO NOTHING;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'lesson_id', p_lesson_id,
        'is_completed', true,
        'completed_lessons', v_completed_lessons,
        'total_lessons', v_total_lessons,
        'progress_pct', v_progress_pct,
        'is_course_completed', v_is_course_done
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reconcile_search_indexes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_daily_recommendations(p_user_id uuid DEFAULT NULL::uuid, p_date date DEFAULT CURRENT_DATE, p_engine_version text DEFAULT 'v1.0'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_caller UUID := auth.uid();
    v_target_user UUID;
    v_existing_count INTEGER;
    v_weak_topic RECORD;
    v_spaced_item RECORD;
    v_learn_res RECORD;
    v_exam_goal RECORD;
    v_days_to_exam INTEGER := NULL;
    v_urgency_score NUMERIC(5,2) := 0.00;
    v_has_pro BOOLEAN := false;

    v_candidates JSONB[] := '{}';
    v_cand JSONB;
    v_rank INTEGER := 1;
BEGIN
    IF v_caller IS NOT NULL AND auth.role() != 'service_role' THEN
        IF p_user_id IS NOT NULL AND p_user_id != v_caller THEN
            RETURN jsonb_build_object('success', false, 'error', 'Forbidden: Cannot generate recommendations for another user');
        END IF;
        v_target_user := v_caller;
    ELSE
        v_target_user := COALESCE(p_user_id, v_caller);
    END IF;

    IF v_target_user IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: user_id required');
    END IF;

    SELECT COUNT(*) INTO v_existing_count
    FROM public.daily_study_recommendations
    WHERE user_id = v_target_user
      AND recommendation_date = p_date
      AND engine_version = p_engine_version;

    IF v_existing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'user_id', v_target_user,
            'recommendation_date', p_date,
            'engine_version', p_engine_version,
            'task_count', v_existing_count,
            'already_generated', true
        );
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements
        WHERE user_id = v_target_user
          AND entitlement_type = 'SUBSCRIPTION'
          AND status = 'ACTIVE'
          AND (valid_until IS NULL OR valid_until > now())
    ) INTO v_has_pro;

    SELECT * INTO v_exam_goal
    FROM public.user_exam_goals
    WHERE user_id = v_target_user AND is_primary = true
    LIMIT 1;

    IF v_exam_goal.target_exam_date IS NOT NULL AND v_exam_goal.target_exam_date > CURRENT_DATE THEN
        v_days_to_exam := (v_exam_goal.target_exam_date - CURRENT_DATE);
        v_urgency_score := round(GREATEST(0.00, LEAST(15.00, 15.00 - (v_days_to_exam::numeric / 10.00))), 2);
    ELSE
        v_days_to_exam := NULL;
        v_urgency_score := 0.00;
    END IF;

    -- CANDIDATE 1: Practice Weak Topic
    SELECT utm.topic_id, t.name as topic_name, utm.mastery_score,
           COALESCE((
               SELECT COUNT(*)
               FROM public.attempt_answers aa
               JOIN public.questions q ON q.id = aa.question_id
               WHERE aa.attempt_id IN (
                   SELECT id FROM public.test_attempts
                   WHERE user_id = v_target_user AND started_at >= (now() - interval '7 days')
               ) AND aa.is_correct = false AND q.topic_id = utm.topic_id
           ), 0) as recent_errors
    INTO v_weak_topic
    FROM public.user_topic_mastery utm
    JOIN public.topics t ON t.id = utm.topic_id
    WHERE utm.user_id = v_target_user
    ORDER BY utm.mastery_score ASC
    LIMIT 1;

    IF v_weak_topic.topic_id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := round((1.00 - v_weak_topic.mastery_score) * 40.00, 2);
            e_score NUMERIC(5,2) := round(LEAST(25.00, v_weak_topic.recent_errors * 5.00), 2);
            f_score NUMERIC(5,2) := 0.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'PRACTICE_WEAK_TOPIC',
                'topic_id', v_weak_topic.topic_id,
                'resource_id', null,
                'priority_score', tot_score,
                'reason_code', 'LOW_MASTERY',
                'reason_text', 'Focus practice on ' || v_weak_topic.topic_name || ' (Mastery: ' || round(v_weak_topic.mastery_score * 100, 0)::text || '%)',
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'mastery_score', v_weak_topic.mastery_score,
                    'recent_errors', v_weak_topic.recent_errors,
                    'days_to_exam', v_days_to_exam,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- CANDIDATE 2: Spaced Repetition Due
    SELECT srs.id, srs.question_id, srs.topic_id, srs.repetition_level, srs.interval_days,
           t.name as topic_name
    INTO v_spaced_item
    FROM public.spaced_repetition_schedules srs
    LEFT JOIN public.topics t ON t.id = srs.topic_id
    WHERE srs.user_id = v_target_user AND srs.next_review_at <= now()
    ORDER BY srs.next_review_at ASC
    LIMIT 1;

    IF v_spaced_item.id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := 10.00;
            e_score NUMERIC(5,2) := 0.00;
            f_score NUMERIC(5,2) := 20.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'SPACED_REVISION',
                'topic_id', v_spaced_item.topic_id,
                'resource_id', null,
                'priority_score', tot_score,
                'reason_code', 'FORGETTING_DUE',
                'reason_text', 'Spaced review scheduled for ' || COALESCE(v_spaced_item.topic_name, 'Topic') || ' retention reinforcement',
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'repetition_level', v_spaced_item.repetition_level,
                    'interval_days', v_spaced_item.interval_days,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- CANDIDATE 3: Learn Resource (Entitlement-Aware)
    SELECT lr.id, lr.title, lr.topic_id, lr.is_premium
    INTO v_learn_res
    FROM public.learning_resources lr
    WHERE lr.is_published = true
      AND (lr.is_premium = false OR v_has_pro = true)
    ORDER BY lr.created_at DESC
    LIMIT 1;

    IF v_learn_res.id IS NOT NULL THEN
        DECLARE
            w_score NUMERIC(5,2) := 5.00;
            e_score NUMERIC(5,2) := 0.00;
            f_score NUMERIC(5,2) := 5.00;
            tot_score NUMERIC(5,2) := w_score + e_score + f_score + v_urgency_score;
        BEGIN
            v_candidates := array_append(v_candidates, jsonb_build_object(
                'action_type', 'LEARN_RESOURCE',
                'topic_id', v_learn_res.topic_id,
                'resource_id', v_learn_res.id,
                'priority_score', tot_score,
                'reason_code', 'DAILY_STREAK_GOAL',
                'reason_text', 'Read: ' || v_learn_res.title,
                'signals', jsonb_build_object(
                    'weakness_score', w_score,
                    'error_score', e_score,
                    'forgetting_score', f_score,
                    'urgency_score', v_urgency_score,
                    'total_score', tot_score,
                    'is_premium', v_learn_res.is_premium,
                    'has_pro_access', v_has_pro,
                    'engine_version', p_engine_version
                )
            ));
        END;
    END IF;

    -- SCORE-BASED SORTING & IMMUTABLE INSERT (MAX 3 TASKS)
    FOR v_cand IN
        SELECT elem
        FROM unnest(v_candidates) AS elem
        ORDER BY (elem->>'priority_score')::numeric DESC, (elem->>'action_type') ASC
        LIMIT 3
    LOOP
        INSERT INTO public.daily_study_recommendations (
            user_id, recommendation_date, priority_rank, action_type,
            topic_id, resource_id, priority_score, reason_code, reason_text_snapshot,
            signal_snapshot_json, engine_version, status
        ) VALUES (
            v_target_user, p_date, v_rank, (v_cand->>'action_type'),
            (v_cand->>'topic_id')::uuid, (v_cand->>'resource_id')::uuid,
            (v_cand->>'priority_score')::numeric, (v_cand->>'reason_code'),
            (v_cand->>'reason_text'), (v_cand->'signals'),
            p_engine_version, 'PENDING'
        );
        v_rank := v_rank + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_target_user,
        'recommendation_date', p_date,
        'engine_version', p_engine_version,
        'tasks_generated', v_rank - 1
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_publish_article_version(p_article_id uuid, p_content_body text, p_content_format text DEFAULT 'MARKDOWN'::text, p_changelog text DEFAULT NULL::text, p_author_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.fn_publish_article_version(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_publish_article_version(uuid, text, text, text, uuid) TO service_role;

-- 4. Remove the retired schema objects created by 073 ----------------------------------------------
DROP TABLE retired.gap2_2b_legacy_refs;
DROP SCHEMA retired;

NOTIFY pgrst, 'reload schema';

-- End of 073 rollback.
