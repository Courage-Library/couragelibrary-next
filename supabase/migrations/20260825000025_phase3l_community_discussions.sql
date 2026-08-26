-- ============================================================================
-- COURAGE LIBRARY — PHASE 3L: COMMUNITY DISCUSSIONS & DOUBT RESOLUTION ENGINE
-- Target Schema: couragelibrary-next
-- Target Schema Table Count: 81 -> 85
-- Legacy Safety: sgagswxzsxlgcspwiuoh 100% UNTOUCHED
-- ============================================================================

-- 1. DISCUSSION THREADS (Doubt & Thread Container)
CREATE TABLE IF NOT EXISTS public.discussion_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_type TEXT NOT NULL CHECK (context_type IN ('QUESTION', 'LESSON', 'ARTICLE', 'TOPIC')),
    question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.course_lessons(id) ON DELETE CASCADE,
    article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(trim(title)) >= 5 AND length(title) <= 250),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'LOCKED', 'ARCHIVED')),
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    accepted_answer_id UUID DEFAULT NULL,
    has_faculty_answer BOOLEAN NOT NULL DEFAULT false,
    message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    upvote_count INTEGER NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
    view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_exact_single_context CHECK (
        (CASE WHEN question_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN lesson_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN article_id IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN topic_id IS NOT NULL THEN 1 ELSE 0 END) = 1
    )
);

-- 2. DISCUSSION MESSAGES (Replies, Answers & Markdown Content)
CREATE TABLE IF NOT EXISTS public.discussion_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.discussion_threads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES public.discussion_messages(id) ON DELETE CASCADE,
    content_markdown TEXT NOT NULL CHECK (length(trim(content_markdown)) >= 2 AND length(content_markdown) <= 10000),
    is_faculty_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ DEFAULT NULL,
    upvote_count INTEGER NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add accepted_answer foreign key back to discussion_threads
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_thread_accepted_answer' AND table_name = 'discussion_threads'
    ) THEN
        ALTER TABLE public.discussion_threads
            ADD CONSTRAINT fk_thread_accepted_answer
            FOREIGN KEY (accepted_answer_id)
            REFERENCES public.discussion_messages(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. DISCUSSION VOTES (Atomic 1-vote-per-user-per-message)
CREATE TABLE IF NOT EXISTS public.discussion_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.discussion_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_message_vote UNIQUE (message_id, user_id)
);

-- 4. DISCUSSION MODERATION FLAGS (Spam & Toxicity Queue)
CREATE TABLE IF NOT EXISTS public.discussion_moderation_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('THREAD', 'MESSAGE')),
    target_id UUID NOT NULL,
    reported_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('SPAM', 'TOXICITY', 'INAPPROPRIATE', 'MISINFORMATION', 'DUPLICATE', 'OTHER')),
    details TEXT CHECK (length(details) <= 1000),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED_REMOVED', 'RESOLVED_DISMISSED')),
    resolution_action TEXT CHECK (resolution_action IN ('DISMISSED', 'CONTENT_REMOVED', 'USER_WARNED', 'USER_MUTED')),
    moderated_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    moderation_note TEXT,
    moderated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_target_flag UNIQUE (target_type, target_id, reported_by_user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_threads_question ON public.discussion_threads(question_id, created_at DESC) WHERE question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_lesson ON public.discussion_threads(lesson_id, created_at DESC) WHERE lesson_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_article ON public.discussion_threads(article_id, created_at DESC) WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_topic ON public.discussion_threads(topic_id, last_activity_at DESC) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_status_activity ON public.discussion_threads(status, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_author ON public.discussion_threads(author_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_thread ON public.discussion_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_author ON public.discussion_messages(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.discussion_messages(parent_message_id) WHERE parent_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_votes_message ON public.discussion_votes(message_id);
CREATE INDEX IF NOT EXISTS idx_votes_user ON public.discussion_votes(user_id);

CREATE INDEX IF NOT EXISTS idx_mod_flags_pending ON public.discussion_moderation_flags(status, created_at ASC) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_mod_flags_target ON public.discussion_moderation_flags(target_type, target_id);

-- ============================================================================
-- TWO-TIER HIERARCHY VALIDATION TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_validate_message_hierarchy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_thread_id UUID;
    v_parent_parent_id UUID;
BEGIN
    IF NEW.parent_message_id IS NOT NULL THEN
        IF NEW.parent_message_id = NEW.id THEN
            RAISE EXCEPTION 'A message cannot be its own parent';
        END IF;

        SELECT thread_id, parent_message_id 
        INTO v_parent_thread_id, v_parent_parent_id
        FROM public.discussion_messages
        WHERE id = NEW.parent_message_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent message % does not exist', NEW.parent_message_id;
        END IF;

        IF v_parent_thread_id != NEW.thread_id THEN
            RAISE EXCEPTION 'Parent message belongs to a different thread';
        END IF;

        IF v_parent_parent_id IS NOT NULL THEN
            RAISE EXCEPTION 'Strict 2-tier reply limit: reply-to-reply is not allowed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_message_hierarchy ON public.discussion_messages;
CREATE TRIGGER trg_validate_message_hierarchy
    BEFORE INSERT OR UPDATE OF parent_message_id, thread_id ON public.discussion_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_fn_validate_message_hierarchy();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.discussion_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discussion_moderation_flags ENABLE ROW LEVEL SECURITY;

-- 1. discussion_threads RLS
DROP POLICY IF EXISTS p_threads_read_public ON public.discussion_threads;
DROP POLICY IF EXISTS p_threads_insert_auth ON public.discussion_threads;
DROP POLICY IF EXISTS p_threads_update_own ON public.discussion_threads;
DROP POLICY IF EXISTS p_threads_staff_all ON public.discussion_threads;

CREATE POLICY p_threads_read_public ON public.discussion_threads
    FOR SELECT TO public
    USING (status != 'ARCHIVED');

CREATE POLICY p_threads_insert_auth ON public.discussion_threads
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY p_threads_update_own ON public.discussion_threads
    FOR UPDATE TO authenticated
    USING (
        author_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        author_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

CREATE POLICY p_threads_staff_all ON public.discussion_threads
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- 2. discussion_messages RLS
DROP POLICY IF EXISTS p_messages_read_public ON public.discussion_messages;
DROP POLICY IF EXISTS p_messages_insert_auth ON public.discussion_messages;
DROP POLICY IF EXISTS p_messages_update_own ON public.discussion_messages;
DROP POLICY IF EXISTS p_messages_staff_all ON public.discussion_messages;

CREATE POLICY p_messages_read_public ON public.discussion_messages
    FOR SELECT TO public
    USING (is_deleted = false);

CREATE POLICY p_messages_insert_auth ON public.discussion_messages
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

CREATE POLICY p_messages_update_own ON public.discussion_messages
    FOR UPDATE TO authenticated
    USING (
        author_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        author_id = auth.uid() OR
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

CREATE POLICY p_messages_staff_all ON public.discussion_messages
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- 3. discussion_votes RLS
DROP POLICY IF EXISTS p_votes_select_own ON public.discussion_votes;
DROP POLICY IF EXISTS p_votes_insert_own ON public.discussion_votes;
DROP POLICY IF EXISTS p_votes_delete_own ON public.discussion_votes;
DROP POLICY IF EXISTS p_votes_staff_all ON public.discussion_votes;

CREATE POLICY p_votes_select_own ON public.discussion_votes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_votes_insert_own ON public.discussion_votes
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY p_votes_delete_own ON public.discussion_votes
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_votes_staff_all ON public.discussion_votes
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- 4. discussion_moderation_flags RLS
DROP POLICY IF EXISTS p_mod_flags_select_own ON public.discussion_moderation_flags;
DROP POLICY IF EXISTS p_mod_flags_insert_own ON public.discussion_moderation_flags;
DROP POLICY IF EXISTS p_mod_flags_staff_all ON public.discussion_moderation_flags;

CREATE POLICY p_mod_flags_select_own ON public.discussion_moderation_flags
    FOR SELECT TO authenticated
    USING (reported_by_user_id = auth.uid());

CREATE POLICY p_mod_flags_insert_own ON public.discussion_moderation_flags
    FOR INSERT TO authenticated
    WITH CHECK (reported_by_user_id = auth.uid());

CREATE POLICY p_mod_flags_staff_all ON public.discussion_moderation_flags
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

-- ============================================================================
-- RUNTIME RPCs (SECURITY DEFINER)
-- ============================================================================

-- RPC 1: Create Thread + Initial Message
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

    IF p_context_type = 'QUESTION' THEN v_q_id := p_context_id;
    ELSIF p_context_type = 'LESSON' THEN v_lesson_id := p_context_id;
    ELSIF p_context_type = 'ARTICLE' THEN v_article_id := p_context_id;
    ELSIF p_context_type = 'TOPIC' THEN v_topic_id := p_context_id;
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

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', v_thread_id,
        'root_message_id', v_message_id
    );
END;
$$;


-- RPC 2: Post Message / Reply
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
    v_message_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_content_markdown IS NULL OR length(trim(p_content_markdown)) < 2 OR length(p_content_markdown) > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message content must be between 2 and 10000 characters');
    END IF;

    SELECT status INTO v_thread_status
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

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_message_id,
        'thread_id', p_thread_id
    );
END;
$$;


-- RPC 3: Atomic Vote Toggle
CREATE OR REPLACE FUNCTION public.fn_vote_discussion_message(
    p_message_id UUID,
    p_vote_action TEXT -- 'ADD' or 'REMOVE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_count INTEGER;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
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

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'upvote_count', v_new_count
    );
END;
$$;


-- RPC 4: Mark Accepted Answer (Single Source in discussion_threads)
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
    v_msg_thread_id UUID;
    v_is_staff BOOLEAN;
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

    SELECT thread_id INTO v_msg_thread_id
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

    RETURN jsonb_build_object(
        'success', true,
        'thread_id', p_thread_id,
        'accepted_answer_id', p_message_id,
        'status', 'RESOLVED'
    );
END;
$$;


-- RPC 5: Authoritative Faculty Verification
CREATE OR REPLACE FUNCTION public.fn_verify_faculty_answer(
    p_message_id UUID,
    p_is_verified BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_thread_id UUID;
    v_is_staff BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff', 'faculty')
    );

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff/Faculty authorization required');
    END IF;

    SELECT thread_id INTO v_thread_id
    FROM public.discussion_messages
    WHERE id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Message not found');
    END IF;

    IF p_is_verified THEN
        UPDATE public.discussion_messages
        SET is_faculty_verified = true,
            verified_by_user_id = v_user_id,
            verified_at = now(),
            updated_at = now()
        WHERE id = p_message_id;

        UPDATE public.discussion_threads
        SET has_faculty_answer = true,
            updated_at = now()
        WHERE id = v_thread_id;
    ELSE
        UPDATE public.discussion_messages
        SET is_faculty_verified = false,
            verified_by_user_id = NULL,
            verified_at = NULL,
            updated_at = now()
        WHERE id = p_message_id;

        -- Check if any other message in thread is faculty verified
        UPDATE public.discussion_threads
        SET has_faculty_answer = EXISTS (
            SELECT 1 FROM public.discussion_messages
            WHERE thread_id = v_thread_id AND is_faculty_verified = true
        ),
        updated_at = now()
        WHERE id = v_thread_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'is_faculty_verified', p_is_verified
    );
END;
$$;


-- RPC 6: Flag Content
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


-- RPC 7: Staff Moderate Content
CREATE OR REPLACE FUNCTION public.fn_moderate_flagged_content(
    p_flag_id UUID,
    p_resolution_action TEXT,
    p_moderator_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_staff BOOLEAN;
    v_target_type TEXT;
    v_target_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    v_is_staff := (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );

    IF NOT v_is_staff THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff authorization required');
    END IF;

    IF p_resolution_action NOT IN ('DISMISSED', 'CONTENT_REMOVED', 'USER_WARNED', 'USER_MUTED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid resolution action');
    END IF;

    SELECT target_type, target_id INTO v_target_type, v_target_id
    FROM public.discussion_moderation_flags
    WHERE id = p_flag_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Moderation flag record not found');
    END IF;

    UPDATE public.discussion_moderation_flags
    SET status = CASE WHEN p_resolution_action = 'DISMISSED' THEN 'RESOLVED_DISMISSED' ELSE 'RESOLVED_REMOVED' END,
        resolution_action = p_resolution_action,
        moderated_by_user_id = v_user_id,
        moderation_note = trim(p_moderator_note),
        moderated_at = now()
    WHERE id = p_flag_id;

    -- If content removed, apply soft delete / lock
    IF p_resolution_action = 'CONTENT_REMOVED' THEN
        IF v_target_type = 'MESSAGE' THEN
            UPDATE public.discussion_messages
            SET is_deleted = true,
                deleted_at = now()
            WHERE id = v_target_id;
        ELSIF v_target_type = 'THREAD' THEN
            UPDATE public.discussion_threads
            SET status = 'LOCKED',
                updated_at = now()
            WHERE id = v_target_id;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'flag_id', p_flag_id,
        'resolution_action', p_resolution_action
    );
END;
$$;


-- ============================================================================
-- GRANTS & PERMISSIONS
-- ============================================================================
REVOKE ALL ON public.discussion_threads FROM anon, public;
GRANT SELECT ON public.discussion_threads TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON public.discussion_threads TO authenticated, service_role;
GRANT ALL ON public.discussion_threads TO service_role;

REVOKE ALL ON public.discussion_messages FROM anon, public;
GRANT SELECT ON public.discussion_messages TO anon, authenticated, service_role;
GRANT INSERT, UPDATE ON public.discussion_messages TO authenticated, service_role;
GRANT ALL ON public.discussion_messages TO service_role;

REVOKE ALL ON public.discussion_votes FROM anon, public;
GRANT SELECT, INSERT, DELETE ON public.discussion_votes TO authenticated, service_role;
GRANT ALL ON public.discussion_votes TO service_role;

REVOKE ALL ON public.discussion_moderation_flags FROM anon, public;
GRANT SELECT, INSERT ON public.discussion_moderation_flags TO authenticated, service_role;
GRANT ALL ON public.discussion_moderation_flags TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_create_discussion_thread(TEXT, UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_create_discussion_thread(TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_post_discussion_message(UUID, TEXT, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_post_discussion_message(UUID, TEXT, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_vote_discussion_message(UUID, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_vote_discussion_message(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_mark_accepted_answer(UUID, UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_mark_accepted_answer(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_verify_faculty_answer(UUID, BOOLEAN) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_verify_faculty_answer(UUID, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_flag_discussion_content(TEXT, UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_flag_discussion_content(TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_moderate_flagged_content(UUID, TEXT, TEXT) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_moderate_flagged_content(UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
