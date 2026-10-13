-- =============================================================================
-- COURAGE LIBRARY — GAP2-2b: RETIRE THE LEGACY LEARNING STACK (decision #21)
-- Migration: 20261013000073_gap2_2b_retire_legacy_learning.sql
--
-- learning_units → learning_documents → document_versions is the only learning store (#12).
-- Old article/course content is not migrated (#5). Nothing is dropped: the legacy tables move to
-- schema `retired` (no anon/authenticated/PUBLIC privileges, no USAGE, not a PostgREST schema).
-- A later RETIRED-CLEANUP phase drops them with owner approval.
--
-- 1. Schema retired (USAGE revoked from PUBLIC, anon, authenticated).
-- 2. retired.gap2_2b_legacy_refs — old values of every dependent public column.
-- 3. Dependent columns re-pointed to learning_documents:
--      discussion_threads.article_id            → learning_document_id (FK SET NULL)
--      batch_curriculum_assignments.article_id  → learning_document_id (FK SET NULL)
--      daily_study_recommendations.resource_id  → learning_document_id (FK SET NULL)
--      course_lessons.learning_resource_id      → dropped (learning_document_id exists since 072)
--    The single-context / XOR checks now count learning_document_id instead of article_id.
--    New columns inherit the existing table-level grants (no column-level grants exist).
-- 4. Functions: fn_create_discussion_thread, fn_create_batch_assignment (discovered dependent),
--    fn_complete_course_lesson, fn_reconcile_search_indexes re-pointed to learning_documents;
--    fn_generate_daily_recommendations deprecated (no student-reachable caller → empty result);
--    fn_publish_article_version dropped (definition preserved below). CREATE OR REPLACE keeps
--    each function's existing ACL; SECURITY DEFINER + search_path as before.
-- 5. learning_resources, learning_resource_topics, articles, article_versions → schema retired;
--    all privileges revoked from PUBLIC, anon, authenticated.
-- 6. Proof block; NOTIFY pgrst to reload the schema cache.
-- Rollback: docs/database/rollback/073_rollback.sql
--
-- Preserved definition of the dropped public.fn_publish_article_version
-- (ACL before drop: postgres=X, service_role=X):
--   CREATE OR REPLACE FUNCTION public.fn_publish_article_version(p_article_id uuid, p_content_body text, p_content_format text DEFAULT 'MARKDOWN'::text, p_changelog text DEFAULT NULL::text, p_author_id uuid DEFAULT NULL::uuid)
--    RETURNS jsonb
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--   AS $function$
--   DECLARE
--       v_caller_id UUID;
--       v_caller_role TEXT;
--       v_next_version INTEGER;
--       v_version_id UUID;
--   BEGIN
--       v_caller_id := auth.uid();
--       
--       IF v_caller_id IS NOT NULL THEN
--           SELECT role INTO v_caller_role FROM public.user_profiles WHERE id = v_caller_id;
--           IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'content_manager', 'editor', 'teacher') THEN
--               RAISE EXCEPTION 'Unauthorized: Caller does not have permission to publish article versions';
--           END IF;
--       END IF;
--   
--       SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
--       FROM public.article_versions WHERE article_id = p_article_id;
--   
--       UPDATE public.article_versions
--       SET is_current = false
--       WHERE article_id = p_article_id AND is_current = true;
--   
--       INSERT INTO public.article_versions (
--           article_id, version_number, content_format, content_body,
--           changelog, is_current, created_by, published_at
--       ) VALUES (
--           p_article_id, v_next_version, p_content_format, p_content_body,
--           p_changelog, true, COALESCE(v_caller_id, p_author_id), now()
--       ) RETURNING id INTO v_version_id;
--   
--       UPDATE public.articles
--       SET status = 'PUBLISHED',
--           published_at = now(),
--           updated_at = now()
--       WHERE id = p_article_id;
--   
--       RETURN jsonb_build_object('success', true, 'version_id', v_version_id, 'version_number', v_next_version);
--   END;
--   $function$
-- =============================================================================

-- 0. Preconditions + expected counts ------------------------------------------------------
CREATE TEMP TABLE gap2_2b_expect ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM public.learning_resources)        AS lr,
    (SELECT count(*) FROM public.learning_resource_topics)  AS lrt,
    (SELECT count(*) FROM public.articles)                  AS art,
    (SELECT count(*) FROM public.article_versions)          AS artv,
    (SELECT count(article_id) FROM public.discussion_threads)            AS ref_dt,
    (SELECT count(article_id) FROM public.batch_curriculum_assignments)  AS ref_bca,
    (SELECT count(resource_id) FROM public.daily_study_recommendations)  AS ref_dsr,
    (SELECT count(learning_resource_id) FROM public.course_lessons)      AS ref_cl;

DO $$
BEGIN
    IF to_regnamespace('retired') IS NOT NULL AND EXISTS (
        SELECT 1 FROM pg_class WHERE relnamespace = to_regnamespace('retired')
          AND relname IN ('learning_resources','learning_resource_topics','articles','article_versions')) THEN
        RAISE EXCEPTION 'GAP2_2B_PRECONDITION: legacy tables already present in schema retired';
    END IF;
END $$;

-- 1. Schema retired -----------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS retired;
REVOKE ALL ON SCHEMA retired FROM PUBLIC;
REVOKE ALL ON SCHEMA retired FROM anon, authenticated;

-- 2. Legacy reference preservation ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retired.gap2_2b_legacy_refs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table text        NOT NULL,
    source_pk    jsonb       NOT NULL,
    column_name  text        NOT NULL,
    old_value    text        NOT NULL,
    retired_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO retired.gap2_2b_legacy_refs (source_table, source_pk, column_name, old_value)
SELECT 'discussion_threads', jsonb_build_object('id', id), 'article_id', article_id::text
FROM public.discussion_threads WHERE article_id IS NOT NULL;
INSERT INTO retired.gap2_2b_legacy_refs (source_table, source_pk, column_name, old_value)
SELECT 'batch_curriculum_assignments', jsonb_build_object('id', id), 'article_id', article_id::text
FROM public.batch_curriculum_assignments WHERE article_id IS NOT NULL;
INSERT INTO retired.gap2_2b_legacy_refs (source_table, source_pk, column_name, old_value)
SELECT 'daily_study_recommendations', jsonb_build_object('id', id), 'resource_id', resource_id::text
FROM public.daily_study_recommendations WHERE resource_id IS NOT NULL;
INSERT INTO retired.gap2_2b_legacy_refs (source_table, source_pk, column_name, old_value)
SELECT 'course_lessons', jsonb_build_object('id', id), 'learning_resource_id', learning_resource_id::text
FROM public.course_lessons WHERE learning_resource_id IS NOT NULL;

-- 3. Dependent columns -------------------------------------------------------------------------
-- discussion_threads
ALTER TABLE public.discussion_threads DROP CONSTRAINT check_exact_single_context;
ALTER TABLE public.discussion_threads ADD COLUMN learning_document_id uuid NULL;
ALTER TABLE public.discussion_threads
    ADD CONSTRAINT discussion_threads_learning_document_id_fkey
    FOREIGN KEY (learning_document_id) REFERENCES public.learning_documents(id) ON DELETE SET NULL;
DROP INDEX IF EXISTS public.idx_threads_article;
ALTER TABLE public.discussion_threads DROP COLUMN article_id;
CREATE INDEX idx_threads_learning_document ON public.discussion_threads (learning_document_id, created_at DESC)
    WHERE learning_document_id IS NOT NULL;
ALTER TABLE public.discussion_threads ADD CONSTRAINT check_exact_single_context CHECK (
    (CASE WHEN question_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN learning_document_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END) = 1);

-- batch_curriculum_assignments
ALTER TABLE public.batch_curriculum_assignments DROP CONSTRAINT chk_assignment_content_xor;
ALTER TABLE public.batch_curriculum_assignments ADD COLUMN learning_document_id uuid NULL;
ALTER TABLE public.batch_curriculum_assignments
    ADD CONSTRAINT batch_curriculum_assignments_learning_document_id_fkey
    FOREIGN KEY (learning_document_id) REFERENCES public.learning_documents(id) ON DELETE SET NULL;
ALTER TABLE public.batch_curriculum_assignments DROP COLUMN article_id;
ALTER TABLE public.batch_curriculum_assignments ADD CONSTRAINT chk_assignment_content_xor
    CHECK (num_nonnulls(mock_test_id, course_id, course_lesson_id, flashcard_deck_id, learning_document_id, topic_id) = 1);

-- daily_study_recommendations
ALTER TABLE public.daily_study_recommendations ADD COLUMN learning_document_id uuid NULL;
ALTER TABLE public.daily_study_recommendations
    ADD CONSTRAINT daily_study_recommendations_learning_document_id_fkey
    FOREIGN KEY (learning_document_id) REFERENCES public.learning_documents(id) ON DELETE SET NULL;
ALTER TABLE public.daily_study_recommendations DROP COLUMN resource_id;

-- course_lessons (learning_document_id already exists, migration 072)
ALTER TABLE public.course_lessons DROP COLUMN learning_resource_id;

-- 4. Functions -----------------------------------------------------------------------------
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
    v_document_id UUID := NULL;
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
        -- GAP2-2b: ARTICLE context = a PUBLISHED learning document (legacy stack retired).
        IF NOT EXISTS (
            SELECT 1 FROM public.learning_documents
            WHERE id = p_context_id AND status = 'PUBLISHED' AND current_published_version_id IS NOT NULL
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced article does not exist');
        END IF;
        v_document_id := p_context_id;
    ELSIF p_context_type = 'TOPIC' THEN 
        IF NOT EXISTS (SELECT 1 FROM public.topics WHERE id = p_context_id) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Referenced topic does not exist');
        END IF;
        v_topic_id := p_context_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Invalid context_type');
    END IF;

    INSERT INTO public.discussion_threads (
        context_type, question_id, lesson_id, learning_document_id, topic_id,
        author_id, title, status, message_count, last_activity_at
    ) VALUES (
        p_context_type, v_q_id, v_lesson_id, v_document_id, v_topic_id,
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
    v_document_id UUID;
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
    ELSIF p_assignment_type = 'ARTICLE' THEN v_document_id := p_content_id; -- GAP2-2b: learning_documents
    ELSIF p_assignment_type = 'MISTAKE_DRILL' THEN v_topic_id := p_content_id;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Invalid assignment type');
    END IF;

    INSERT INTO public.batch_curriculum_assignments (
        batch_id, institute_id, title, instructions_md, assignment_type,
        mock_test_id, course_id, course_lesson_id, flashcard_deck_id, learning_document_id, topic_id,
        due_at, assigned_by_user_id
    ) VALUES (
        p_batch_id, v_inst_id, p_title, p_instructions_md, p_assignment_type,
        v_mock_id, v_course_id, v_lesson_id, v_deck_id, v_document_id, v_topic_id,
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
    v_learning_doc_id UUID;
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
        cl.learning_document_id,
        cl.is_free_preview,
        c.id AS course_id,
        c.access_tier
    INTO v_lesson_type, v_duration, v_learning_doc_id, v_is_preview, v_course_id, v_course_tier
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

    IF v_learning_doc_id IS NOT NULL THEN
        -- GAP2-2b: canonical topic via learning_documents → learning_units (decision #12).
        SELECT u.topic_id INTO v_canonical_topic_id
        FROM public.learning_documents d
        JOIN public.learning_units u ON u.id = d.learning_unit_id
        WHERE d.id = v_learning_doc_id;

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

    -- 1+2. Learning documents (GAP2-2b; replaces the retired legacy stack). Only servable
    -- documents are indexed: PUBLISHED, current version published (review_status PUBLISHED),
    -- active unit. DRAFT / unpublished / archived documents are never indexed.
    INSERT INTO public.search_indexes (
        entity_type, source_id, canonical_url, title_en, title_hi,
        body_snippet_en, body_snippet_hi, normalized_keywords,
        subject_id, topic_id, category, access_tier, is_published, quality_rank, source_updated_at
    )
    SELECT
        'ARTICLE', d.id, '/articles/' || d.canonical_slug, u.title, null,
        replace(lower(d.document_type::text), '_', ' ') || COALESCE(' for ' || t.name, ''), null,
        lower(u.title || ' ' || COALESCE(t.name, '')),
        t.subject_id, u.topic_id, 'ARTICLE', CASE WHEN d.access_level = 'PRO' THEN 'PRO' ELSE 'FREE' END,
        true, 200, GREATEST(d.updated_at, v.updated_at)
    FROM public.learning_documents d
    JOIN public.learning_units u ON u.id = d.learning_unit_id AND u.is_active = true
    JOIN public.document_versions v ON v.id = d.current_published_version_id
         AND v.is_published = true AND v.review_status = 'PUBLISHED'
    LEFT JOIN public.topics t ON t.id = u.topic_id
    WHERE d.status = 'PUBLISHED'
    ON CONFLICT (entity_type, source_id) DO UPDATE
        SET canonical_url = EXCLUDED.canonical_url,
            title_en = EXCLUDED.title_en,
            body_snippet_en = EXCLUDED.body_snippet_en,
            normalized_keywords = EXCLUDED.normalized_keywords,
            subject_id = EXCLUDED.subject_id,
            topic_id = EXCLUDED.topic_id,
            access_tier = EXCLUDED.access_tier,
            is_published = EXCLUDED.is_published,
            source_updated_at = EXCLUDED.source_updated_at,
            indexed_at = now();

    -- Entries that are no longer servable (or came from the retired stack) are unpublished.
    UPDATE public.search_indexes si
    SET is_published = false, indexed_at = now()
    WHERE si.is_published = true
      AND (
        si.entity_type = 'RESOURCE'
        OR (si.entity_type = 'ARTICLE' AND NOT EXISTS (
            SELECT 1
            FROM public.learning_documents d
            JOIN public.learning_units u ON u.id = d.learning_unit_id AND u.is_active = true
            JOIN public.document_versions v ON v.id = d.current_published_version_id
                 AND v.is_published = true AND v.review_status = 'PUBLISHED'
            WHERE d.id = si.source_id AND d.status = 'PUBLISHED'))
      );

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
BEGIN
    -- GAP2-2b: deprecated. No student-reachable caller exists (no app code, no SQL caller, no cron);
    -- the old body read the retired legacy learning stack. Deterministic empty result;
    -- signature, SECURITY DEFINER, search_path and grants unchanged. Replacement: LOOP-1.
    RAISE NOTICE 'deprecated: fn_generate_daily_recommendations (GAP2-2b) — no recommendations generated; see LOOP-1';
    RETURN jsonb_build_object(
        'success', true,
        'deprecated', true,
        'user_id', COALESCE(p_user_id, auth.uid()),
        'recommendation_date', p_date,
        'engine_version', p_engine_version,
        'tasks_generated', 0
    );
END;
$function$;

DROP FUNCTION public.fn_publish_article_version(uuid, text, text, text, uuid);

-- 5. Move the legacy tables to schema retired ---------------------------------------------------
ALTER TABLE public.article_versions          SET SCHEMA retired;
ALTER TABLE public.articles                  SET SCHEMA retired;
ALTER TABLE public.learning_resource_topics  SET SCHEMA retired;
ALTER TABLE public.learning_resources        SET SCHEMA retired;

REVOKE ALL ON ALL TABLES IN SCHEMA retired FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA retired FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retired FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA retired FROM anon, authenticated;

-- 6. Proof ----------------------------------------------------------------------------------------
DO $$
DECLARE
    e record;
    v_bad text;
BEGIN
    SELECT * INTO e FROM pg_temp.gap2_2b_expect;

    IF (SELECT count(*) FROM retired.learning_resources) <> e.lr
       OR (SELECT count(*) FROM retired.learning_resource_topics) <> e.lrt
       OR (SELECT count(*) FROM retired.articles) <> e.art
       OR (SELECT count(*) FROM retired.article_versions) <> e.artv THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: retired row counts differ from pre-migration counts';
    END IF;

    IF (SELECT count(*) FROM retired.gap2_2b_legacy_refs WHERE source_table = 'discussion_threads') <> e.ref_dt
       OR (SELECT count(*) FROM retired.gap2_2b_legacy_refs WHERE source_table = 'batch_curriculum_assignments') <> e.ref_bca
       OR (SELECT count(*) FROM retired.gap2_2b_legacy_refs WHERE source_table = 'daily_study_recommendations') <> e.ref_dsr
       OR (SELECT count(*) FROM retired.gap2_2b_legacy_refs WHERE source_table = 'course_lessons') <> e.ref_cl THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: legacy_refs rows differ from pre-migration non-null dependent values';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
               AND relname IN ('learning_resources','learning_resource_topics','articles','article_versions')) THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: a legacy table is still in public';
    END IF;

    IF has_schema_privilege('anon', 'retired', 'USAGE') OR has_schema_privilege('authenticated', 'retired', 'USAGE') THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: anon/authenticated have USAGE on retired';
    END IF;

    SELECT string_agg(c.relname || ':' || r.rolname, ', ') INTO v_bad
    FROM pg_class c CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
    WHERE c.relnamespace = 'retired'::regnamespace AND c.relkind IN ('r', 'p', 'S')
      AND (has_table_privilege(r.rolname, c.oid, 'SELECT') OR has_table_privilege(r.rolname, c.oid, 'INSERT')
           OR has_table_privilege(r.rolname, c.oid, 'UPDATE') OR has_table_privilege(r.rolname, c.oid, 'DELETE'));
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: privileges remain on retired tables: %', v_bad;
    END IF;

    SELECT string_agg(p.proname, ', ') INTO v_bad
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
      -- '/articles/' URL path literals (the student route) are not table references.
      AND p.prosrc ~ '(?<!/)\m(learning_resources|learning_resource_topics|articles|article_versions)\M(?!/)';
    IF v_bad IS NOT NULL THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: public functions still reference retired tables: %', v_bad;
    END IF;

    IF to_regprocedure('public.fn_publish_article_version(uuid,text,text,text,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: fn_publish_article_version still exists';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND (
           (table_name IN ('discussion_threads', 'batch_curriculum_assignments') AND column_name = 'article_id')
        OR (table_name = 'daily_study_recommendations' AND column_name = 'resource_id')
        OR (table_name = 'course_lessons' AND column_name = 'learning_resource_id'))) THEN
        RAISE EXCEPTION 'GAP2_2B_PROOF: a legacy dependent column is still present';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- End of 073.
