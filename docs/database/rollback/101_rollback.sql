-- Rollback for 20261025000101_community_reply_fix.sql: restores the previous fn_post_discussion_message body
-- (which fails every reply with 23502 — COMMUNITY-REPLY-1). Run as ONE transaction by the operator.
BEGIN;

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
            v_thread_author_id, 'ACADEMIC', 'NORMAL',
            'New reply on your discussion',
            substring(trim(p_content_markdown) from 1 for 120),
            '/discussions/' || p_thread_id,
            jsonb_build_object('thread_id', p_thread_id, 'message_id', v_message_id),
            'disc_reply_thread_' || v_message_id,
            now()
        ) ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
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
$function$;

COMMIT;
