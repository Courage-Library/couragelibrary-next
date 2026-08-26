-- ============================================================================
-- COURAGE LIBRARY — PHASE 3H: RUNTIME FUNCTIONS & NOTIFICATION ENGINE
-- Target Database: couragelibrary-next
-- ============================================================================

-- Function 1: Atomic User Notification Dispatcher with Preference & Anti-Spam Guards
CREATE OR REPLACE FUNCTION public.fn_send_user_notification(
    p_user_id UUID,
    p_template_code TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_body TEXT DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'SYSTEM',
    p_priority TEXT DEFAULT 'NORMAL',
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_prefs RECORD;
    v_template RECORD;
    v_final_title TEXT;
    v_final_body TEXT;
    v_final_url TEXT;
    v_final_cat TEXT;
    v_final_priority TEXT;
    v_nudge_count INTEGER;
    v_notif_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user_id');
    END IF;

    -- 1. Check user notification preferences
    SELECT * INTO v_prefs
    FROM public.user_notification_preferences
    WHERE user_id = p_user_id;

    IF v_prefs IS NOT NULL THEN
        IF NOT v_prefs.in_app_enabled THEN
            RETURN jsonb_build_object('success', false, 'skipped', 'In-app notifications disabled by user');
        END IF;

        IF p_category = 'EXAM_ALERT' AND NOT v_prefs.exam_alerts_enabled THEN
            RETURN jsonb_build_object('success', false, 'skipped', 'Exam alerts disabled by user');
        ELSIF p_category = 'ACADEMIC' AND NOT v_prefs.academic_reminders_enabled THEN
            RETURN jsonb_build_object('success', false, 'skipped', 'Academic reminders disabled by user');
        ELSIF p_category = 'GAMIFICATION' AND NOT v_prefs.gamification_alerts_enabled THEN
            RETURN jsonb_build_object('success', false, 'skipped', 'Gamification alerts disabled by user');
        END IF;
    END IF;

    -- 2. Anti-spam fatigue limit: Max 3 automated academic/gamification nudges per 24 hours
    IF p_category IN ('ACADEMIC', 'GAMIFICATION') AND p_priority NOT IN ('URGENT') THEN
        SELECT COUNT(*) INTO v_nudge_count
        FROM public.user_notifications
        WHERE user_id = p_user_id
          AND category IN ('ACADEMIC', 'GAMIFICATION')
          AND created_at >= (now() - interval '24 hours');

        IF v_nudge_count >= 3 THEN
            RETURN jsonb_build_object('success', false, 'skipped', '24-hour retention nudge limit reached');
        END IF;
    END IF;

    -- 3. Resolve template or direct payload
    IF p_template_code IS NOT NULL THEN
        SELECT * INTO v_template
        FROM public.notification_templates
        WHERE template_code = p_template_code AND is_active = true;

        IF v_template IS NOT NULL THEN
            v_final_title := COALESCE(p_title, v_template.title_template);
            v_final_body := COALESCE(p_body, v_template.body_template);
            v_final_url := COALESCE(p_action_url, v_template.action_url_template);
            v_final_cat := COALESCE(v_template.category, p_category);
            v_final_priority := COALESCE(v_template.priority, p_priority);
        ELSE
            v_final_title := p_title;
            v_final_body := p_body;
            v_final_url := p_action_url;
            v_final_cat := p_category;
            v_final_priority := p_priority;
        END IF;
    ELSE
        v_final_title := p_title;
        v_final_body := p_body;
        v_final_url := p_action_url;
        v_final_cat := p_category;
        v_final_priority := p_priority;
    END IF;

    IF v_final_title IS NULL OR v_final_body IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notification title and body are required');
    END IF;

    -- 4. Insert with idempotency protection
    INSERT INTO public.user_notifications (
        user_id, template_id, category, priority, title,
        body, action_url, metadata_json, idempotency_key, created_at
    ) VALUES (
        p_user_id, v_template.id, v_final_cat, v_final_priority, v_final_title,
        v_final_body, v_final_url, p_metadata, p_idempotency_key, now()
    ) ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NULL AND p_idempotency_key IS NOT NULL THEN
        -- Idempotent duplicate intercepted
        SELECT id INTO v_notif_id FROM public.user_notifications WHERE idempotency_key = p_idempotency_key;
        RETURN jsonb_build_object('success', true, 'notification_id', v_notif_id, 'duplicate', true);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notif_id,
        'duplicate', false
    );
END;
$$;

-- Function 2: Staff Exam Announcement Publisher & Student Fan-Out
CREATE OR REPLACE FUNCTION public.fn_publish_exam_announcement(
    p_exam_id UUID,
    p_exam_cycle_id UUID,
    p_announcement_type TEXT,
    p_title TEXT,
    p_summary TEXT,
    p_source_url TEXT DEFAULT NULL,
    p_priority TEXT DEFAULT 'HIGH'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_staff_id UUID;
    v_staff_role TEXT;
    v_announcement_id UUID;
    v_target_user RECORD;
    v_recipient_count INTEGER := 0;
    v_idempotency_prefix TEXT;
BEGIN
    v_staff_id := auth.uid();
    IF v_staff_id IS NOT NULL THEN
        SELECT role INTO v_staff_role FROM public.user_profiles WHERE id = v_staff_id;
        IF v_staff_role IS NULL OR v_staff_role NOT IN ('admin', 'content_manager', 'editor') THEN
            RAISE EXCEPTION 'Unauthorized: Caller does not have permission to publish exam announcements';
        END IF;
    END IF;

    -- Insert announcement
    INSERT INTO public.exam_announcements (
        exam_id, exam_cycle_id, announcement_type, title,
        summary, official_source_url, priority, is_published,
        published_at, created_by_user_id, created_at, updated_at
    ) VALUES (
        p_exam_id, p_exam_cycle_id, p_announcement_type, p_title,
        p_summary, p_source_url, p_priority, true,
        now(), v_staff_id, now(), now()
    ) RETURNING id INTO v_announcement_id;

    -- Fan-out in-app notification to all students enrolled in this exam goal
    FOR v_target_user IN
        SELECT DISTINCT user_id
        FROM public.user_exam_goals
        WHERE exam_id = p_exam_id AND is_active = true
    LOOP
        v_idempotency_prefix := 'announcement:' || v_target_user.user_id::text || ':' || v_announcement_id::text;
        
        PERFORM public.fn_send_user_notification(
            p_user_id := v_target_user.user_id,
            p_title := p_title,
            p_body := p_summary,
            p_action_url := '/exams/' || p_exam_id::text || '/announcements',
            p_category := 'EXAM_ALERT',
            p_priority := p_priority,
            p_idempotency_key := v_idempotency_prefix,
            p_metadata := jsonb_build_object('announcement_id', v_announcement_id, 'exam_id', p_exam_id)
        );
        v_recipient_count := v_recipient_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'announcement_id', v_announcement_id,
        'fan_out_recipients', v_recipient_count
    );
END;
$$;

-- Function 3: Secure Student Mark Notification Read
CREATE OR REPLACE FUNCTION public.fn_mark_notification_as_read(
    p_notification_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_updated INTEGER;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    UPDATE public.user_notifications
    SET is_read = true,
        read_at = now()
    WHERE id = p_notification_id AND user_id = v_user_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Notification not found or access denied');
    END IF;

    RETURN jsonb_build_object('success', true, 'notification_id', p_notification_id, 'is_read', true);
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION public.fn_send_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_send_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_publish_exam_announcement(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_publish_exam_announcement(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_mark_notification_as_read(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_mark_notification_as_read(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
