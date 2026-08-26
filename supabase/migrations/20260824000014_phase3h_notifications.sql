-- ============================================================================
-- COURAGE LIBRARY — PHASE 3H: MULTI-CHANNEL NOTIFICATIONS & EXAM ALERTS
-- Target Database: couragelibrary-next
-- ============================================================================

-- ============================================================================
-- 1. NOTIFICATION TEMPLATES CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_code TEXT NOT NULL CHECK (template_code ~* '^[A-Z0-9_]+$'),
    category TEXT NOT NULL CHECK (category IN ('EXAM_ALERT', 'ACADEMIC', 'GAMIFICATION', 'SYSTEM', 'CONTENT')),
    channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'PUSH', 'EMAIL', 'WHATSAPP')),
    title_template TEXT NOT NULL CHECK (length(title_template) <= 200),
    body_template TEXT NOT NULL CHECK (length(body_template) <= 1000),
    action_url_template TEXT CHECK (length(action_url_template) <= 500),
    icon_name TEXT DEFAULT 'bell',
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_template_code UNIQUE (template_code)
);

-- ============================================================================
-- 2. USER NOTIFICATIONS INBOX
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.notification_templates(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('EXAM_ALERT', 'ACADEMIC', 'GAMIFICATION', 'SYSTEM', 'CONTENT')),
    priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
    title TEXT NOT NULL CHECK (length(title) <= 250),
    body TEXT NOT NULL CHECK (length(body) <= 2000),
    action_url TEXT CHECK (length(action_url) <= 1000),
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notif_idempotency 
ON public.user_notifications(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- 3. EXAM ANNOUNCEMENTS (OFFICIAL NOTICES & FAN-OUT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.exam_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    exam_cycle_id UUID REFERENCES public.exam_cycles(id) ON DELETE CASCADE,
    announcement_type TEXT NOT NULL CHECK (announcement_type IN ('EXAM_DATE_CHANGED', 'APPLICATION_DEADLINE', 'ADMIT_CARD_RELEASED', 'ANSWER_KEY_RELEASED', 'RESULT_DECLARED', 'CUTOFF_PUBLISHED', 'GENERAL_NOTICE')),
    title TEXT NOT NULL CHECK (length(title) <= 250),
    summary TEXT NOT NULL CHECK (length(summary) <= 3000),
    official_source_url TEXT CHECK (length(official_source_url) <= 1000),
    published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_published BOOLEAN NOT NULL DEFAULT true,
    priority TEXT NOT NULL DEFAULT 'HIGH' CHECK (priority IN ('NORMAL', 'HIGH', 'URGENT')),
    created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. USER NOTIFICATION PREFERENCES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    exam_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    academic_reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    gamification_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    marketing_enabled BOOLEAN NOT NULL DEFAULT false,
    quiet_hours_start_time TIME NOT NULL DEFAULT '22:00:00',
    quiet_hours_end_time TIME NOT NULL DEFAULT '07:00:00',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_notif_prefs UNIQUE (user_id)
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_un_user_read ON public.user_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_un_user_created ON public.user_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_un_expires ON public.user_notifications(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ea_exam ON public.exam_announcements(exam_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ea_cycle ON public.exam_announcements(exam_cycle_id, published_at DESC) WHERE exam_cycle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ea_published ON public.exam_announcements(is_published, published_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- 1. Templates: Active readable by authenticated students; Staff/Service-Role manage
CREATE POLICY "Users can read active templates" ON public.notification_templates
    FOR SELECT USING (is_active = true);

-- 2. User Notifications: Students read own; mark read on own; no insert/delete
CREATE POLICY "Users can read own notifications" ON public.user_notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification read state" ON public.user_notifications
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. Exam Announcements: Students read published; Staff/Service-Role manage
CREATE POLICY "Users can read published announcements" ON public.exam_announcements
    FOR SELECT USING (is_published = true);

-- 4. Notification Preferences: Students CRUD own preferences
CREATE POLICY "Users can CRUD own notification preferences" ON public.user_notification_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grants
GRANT SELECT ON public.notification_templates TO authenticated;
GRANT SELECT, UPDATE (is_read, read_at) ON public.user_notifications TO authenticated;
GRANT SELECT ON public.exam_announcements TO authenticated;
GRANT ALL ON public.user_notification_preferences TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
