-- ============================================================================
-- COURAGE LIBRARY — PHASE 3H: CLOSURE HARDENING & SECURITY ACCEPTANCE
-- Target Database: couragelibrary-next
-- ============================================================================

-- 1. Exam & Exam-Cycle Integrity Trigger on exam_announcements
CREATE OR REPLACE FUNCTION public.fn_validate_exam_announcement_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.exam_cycle_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.exam_cycles
            WHERE id = NEW.exam_cycle_id AND exam_id = NEW.exam_id
        ) THEN
            RAISE EXCEPTION 'Integrity violation: Exam cycle does not belong to the selected exam';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_exam_announcement_cycle ON public.exam_announcements;
CREATE TRIGGER trg_validate_exam_announcement_cycle
    BEFORE INSERT OR UPDATE OF exam_id, exam_cycle_id ON public.exam_announcements
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_exam_announcement_cycle();

-- 2. Protect user_notifications from Student Payload Tampering on UPDATE
CREATE OR REPLACE FUNCTION public.fn_protect_user_notification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.user_id != OLD.user_id OR
       NEW.template_id IS DISTINCT FROM OLD.template_id OR
       NEW.category != OLD.category OR
       NEW.priority != OLD.priority OR
       NEW.title != OLD.title OR
       NEW.body != OLD.body OR
       NEW.action_url IS DISTINCT FROM OLD.action_url OR
       NEW.metadata_json != OLD.metadata_json OR
       NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
       NEW.created_at != OLD.created_at THEN
        RAISE EXCEPTION 'Tampering violation: Only is_read and read_at can be updated by student';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_notification_fields ON public.user_notifications;
CREATE TRIGGER trg_protect_user_notification_fields
    BEFORE UPDATE ON public.user_notifications
    FOR EACH ROW EXECUTE FUNCTION public.fn_protect_user_notification_fields();

-- 3. Hardened Atomic Notification Dispatcher with Advisory Locking & Safe Token Substitution
CREATE OR REPLACE FUNCTION public.fn_send_user_notification(
    p_user_id UUID,
    p_template_code TEXT DEFAULT NULL,
    p_title TEXT DEFAULT NULL,
    p_body TEXT DEFAULT NULL,
    p_action_url TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'SYSTEM',
    p_priority TEXT DEFAULT 'NORMAL',
    p_idempotency_key TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_variables JSONB DEFAULT '{}'::jsonb
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
    v_var_key TEXT;
    v_var_val TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid user_id');
    END IF;

    -- Concurrency hardening: Acquire advisory lock on user rate-limit bucket
    PERFORM pg_advisory_xact_lock(hashtext('user_notif_rate_limit:' || p_user_id::text));

    -- Check user notification preferences
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

    -- Atomic anti-spam check: Max 3 automated nudges per 24 hours
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

    -- Resolve template and safely interpolate tokens
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

            -- Safe data-only token interpolation
            IF p_variables IS NOT NULL AND jsonb_typeof(p_variables) = 'object' THEN
                FOR v_var_key, v_var_val IN SELECT * FROM jsonb_each_text(p_variables)
                LOOP
                    v_final_title := replace(v_final_title, '{{' || v_var_key || '}}', v_var_val);
                    v_final_body := replace(v_final_body, '{{' || v_var_key || '}}', v_var_val);
                    IF v_final_url IS NOT NULL THEN
                        v_final_url := replace(v_final_url, '{{' || v_var_key || '}}', v_var_val);
                    END IF;
                END LOOP;
            END IF;
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

    INSERT INTO public.user_notifications (
        user_id, template_id, category, priority, title,
        body, action_url, metadata_json, idempotency_key, created_at
    ) VALUES (
        p_user_id, v_template.id, v_final_cat, v_final_priority, v_final_title,
        v_final_body, v_final_url, p_metadata, p_idempotency_key, now()
    ) ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_notif_id;

    IF v_notif_id IS NULL AND p_idempotency_key IS NOT NULL THEN
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

-- 4. Secure Privileges: Revoke generic dispatch from authenticated students
REVOKE EXECUTE ON FUNCTION public.fn_send_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.fn_send_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
