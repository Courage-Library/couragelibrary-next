-- =====================================================================================================================
-- 101 COMMUNITY-REPLY-1 — fn_post_discussion_message no longer fails every reply (function-only change)
-- Architect conditional GO 2026-10-25 (apply only if dry-run + rolled-back smoke all pass).
-- Rollback: docs/database/rollback/101_rollback.sql (the previous body). No BEGIN / COMMIT: the runner owns the transaction.
--
-- Cause: the "Phase 3C" activity insert into learning_activity_events omitted topic_id and resource_slug (both NOT NULL)
-- and used event_type 'COMMUNITY_DOUBT_ANSWERED', which the table's CHECK does not allow — so every reply raised 23502.
-- Fix (function only; no column made nullable, no constraint changed):
--   * the activity row takes topic_id from the THREAD (topic_id_node_type is a generated column); a thread without a
--     topic writes no row;
--   * resource_slug = 'community/thread/<id>'; event_type = 'TOPIC_LEARNING_ACTIVITY' (allowed) with
--     metadata.kind = 'COMMUNITY_DOUBT_ANSWERED';
--   * the insert sits in its own BEGIN … EXCEPTION block: analytics can never fail the reply.
-- Same signature, SECURITY DEFINER, search_path and EXECUTE grants (CREATE OR REPLACE keeps them); allow-list unchanged.
-- =====================================================================================================================

CREATE OR REPLACE FUNCTION public.fn_post_discussion_message(p_thread_id uuid, p_content_markdown text, p_parent_message_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_status TEXT;
    v_thread_title TEXT;
    v_thread_author_id UUID;
    v_message_id UUID;
    v_thread_topic_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT status, title, author_id, topic_id
      INTO v_thread_status, v_thread_title, v_thread_author_id, v_thread_topic_id
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
            v_thread_author_id, 'ACADEMIC', 'NORMAL',
            'New reply on your discussion',
            substring(trim(p_content_markdown) from 1 for 120),
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
            'disc_reply_thread_' || v_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
    END IF;

    -- Phase 3C Activity Logging (101): only when the thread has a topic (topic_id is NOT NULL); an allowed event type
    -- with the community kind in metadata; analytics can NEVER fail the reply (any error here skips the row).
    IF v_thread_topic_id IS NOT NULL THEN
        BEGIN
            INSERT INTO public.learning_activity_events (
                user_id, topic_id, resource_slug, event_type, metadata, occurred_at
            ) VALUES (
                v_user_id, v_thread_topic_id, 'community/thread/' || p_thread_id,
                'TOPIC_LEARNING_ACTIVITY',
                jsonb_build_object('kind', 'COMMUNITY_DOUBT_ANSWERED', 'thread_id', p_thread_id, 'message_id', v_message_id),
                now()
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- analytics only: the reply is already written
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'thread_id', p_thread_id
    );
END;
$function$;
