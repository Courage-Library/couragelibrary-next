-- ============================================================================
-- COURAGE LIBRARY — PHASE 3M: FLASHCARDS, ACTIVE RECALL & VISUAL FORMULA DECKS
-- Target Schema: couragelibrary-next
-- Baseline: 85 Base Tables -> Expected: 89 Base Tables
-- ============================================================================

-- 1. TABLE: flashcard_decks
CREATE TABLE IF NOT EXISTS public.flashcard_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL,
    title_en TEXT NOT NULL,
    title_hi TEXT,
    description TEXT,
    exam_id UUID REFERENCES public.exams(id) ON DELETE SET NULL,
    subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_curated BOOLEAN NOT NULL DEFAULT false,
    access_tier TEXT NOT NULL DEFAULT 'FREE' CHECK (access_tier IN ('FREE', 'PRO')),
    card_count INTEGER NOT NULL DEFAULT 0 CHECK (card_count >= 0),
    is_published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_flashcard_deck_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_fdecks_exam ON public.flashcard_decks (exam_id) WHERE exam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fdecks_subject ON public.flashcard_decks (subject_id) WHERE subject_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fdecks_topic ON public.flashcard_decks (topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fdecks_author ON public.flashcard_decks (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fdecks_published ON public.flashcard_decks (is_published, is_curated, access_tier);


-- 2. TABLE: flashcards
CREATE TABLE IF NOT EXISTS public.flashcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    card_order INTEGER NOT NULL DEFAULT 1 CHECK (card_order >= 1),
    front_markdown_en TEXT NOT NULL,
    front_markdown_hi TEXT,
    back_markdown_en TEXT NOT NULL,
    back_markdown_hi TEXT,
    mnemonic_en TEXT,
    mnemonic_hi TEXT,
    latex_formulas TEXT[],
    hint TEXT,
    explanation TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_deck_card_order UNIQUE (deck_id, card_order)
);

CREATE INDEX IF NOT EXISTS idx_fcards_deck_order ON public.flashcards (deck_id, card_order);
CREATE INDEX IF NOT EXISTS idx_fcards_active ON public.flashcards (deck_id, is_active);


-- 3. TABLE: user_flashcard_reviews
CREATE TABLE IF NOT EXISTS public.user_flashcard_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    repetition_level INTEGER NOT NULL DEFAULT 0 CHECK (repetition_level >= 0),
    interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1 AND interval_days <= 365),
    ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30 AND ease_factor <= 3.50),
    last_rating INTEGER CHECK (last_rating BETWEEN 1 AND 4),
    last_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_review_due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    total_reviews INTEGER NOT NULL DEFAULT 0 CHECK (total_reviews >= 0),
    consecutive_correct INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_correct >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_card_review UNIQUE (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_uf_reviews_due ON public.user_flashcard_reviews (user_id, next_review_due_at);
CREATE INDEX IF NOT EXISTS idx_uf_reviews_deck ON public.user_flashcard_reviews (user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_uf_reviews_card ON public.user_flashcard_reviews (card_id);


-- 4. TABLE: user_deck_progress
CREATE TABLE IF NOT EXISTS public.user_deck_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    total_cards_mastered INTEGER NOT NULL DEFAULT 0 CHECK (total_cards_mastered >= 0),
    total_cards_learning INTEGER NOT NULL DEFAULT 0 CHECK (total_cards_learning >= 0),
    total_cards_new INTEGER NOT NULL DEFAULT 0 CHECK (total_cards_new >= 0),
    mastery_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (mastery_percentage >= 0.00 AND mastery_percentage <= 100.00),
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    last_reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_deck_progress UNIQUE (user_id, deck_id)
);

CREATE INDEX IF NOT EXISTS idx_uf_deck_progress_user ON public.user_deck_progress (user_id, deck_id);
CREATE INDEX IF NOT EXISTS idx_uf_deck_progress_fav ON public.user_deck_progress (user_id, is_favorite) WHERE is_favorite = true;


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- A. flashcard_decks RLS
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_fdecks_select ON public.flashcard_decks
    FOR SELECT TO public
    USING (
        is_published = true AND (
            is_curated = true OR
            author_id = auth.uid() OR
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        )
    );

CREATE POLICY p_fdecks_insert_student ON public.flashcard_decks
    FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid() AND
        is_curated = false
    );

CREATE POLICY p_fdecks_update_student ON public.flashcard_decks
    FOR UPDATE TO authenticated
    USING (
        author_id = auth.uid() AND
        is_curated = false
    )
    WITH CHECK (
        author_id = auth.uid() AND
        is_curated = false
    );

CREATE POLICY p_fdecks_delete_student ON public.flashcard_decks
    FOR DELETE TO authenticated
    USING (
        author_id = auth.uid() AND
        is_curated = false
    );

CREATE POLICY p_fdecks_manage_staff ON public.flashcard_decks
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- B. flashcards RLS
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_fcards_select ON public.flashcards
    FOR SELECT TO public
    USING (
        is_active = true AND
        EXISTS (
            SELECT 1 FROM public.flashcard_decks fd
            WHERE fd.id = flashcards.deck_id
              AND fd.is_published = true
              AND (
                  fd.author_id = auth.uid() OR
                  (fd.is_curated = true AND (
                      fd.access_tier = 'FREE' OR
                      flashcards.card_order <= 3 OR
                      (auth.uid() IS NOT NULL AND EXISTS (
                          SELECT 1 FROM public.user_entitlements ue
                          WHERE ue.user_id = auth.uid()
                            AND ue.is_active = true
                            AND (ue.expires_at IS NULL OR ue.expires_at > now())
                      )) OR
                      auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
                      (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
                  ))
              )
        )
    );

CREATE POLICY p_fcards_insert_author ON public.flashcards
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.flashcard_decks fd
            WHERE fd.id = flashcards.deck_id
              AND fd.author_id = auth.uid()
              AND fd.is_curated = false
        )
    );

CREATE POLICY p_fcards_update_author ON public.flashcards
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.flashcard_decks fd
            WHERE fd.id = flashcards.deck_id
              AND fd.author_id = auth.uid()
              AND fd.is_curated = false
        )
    );

CREATE POLICY p_fcards_delete_author ON public.flashcards
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.flashcard_decks fd
            WHERE fd.id = flashcards.deck_id
              AND fd.author_id = auth.uid()
              AND fd.is_curated = false
        )
    );

CREATE POLICY p_fcards_manage_staff ON public.flashcards
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- C. user_flashcard_reviews RLS
ALTER TABLE public.user_flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_uf_reviews_select_own ON public.user_flashcard_reviews
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_uf_reviews_manage_staff ON public.user_flashcard_reviews
    FOR ALL TO authenticated
    USING (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    )
    WITH CHECK (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    );


-- D. user_deck_progress RLS
ALTER TABLE public.user_deck_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_uf_progress_select_own ON public.user_deck_progress
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY p_uf_progress_manage_staff ON public.user_deck_progress
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
-- RUNTIME RPCS (SECURITY DEFINER)
-- ============================================================================

-- 1. fn_submit_flashcard_review (SM-2 Active Recall Engine)
CREATE OR REPLACE FUNCTION public.fn_submit_flashcard_review(
    p_card_id UUID,
    p_rating INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_deck_id UUID;
    v_topic_id UUID;
    v_access_tier TEXT;
    v_card_order INTEGER;
    v_is_curated BOOLEAN;
    v_author_id UUID;
    v_has_pro BOOLEAN := false;
    
    v_prev_rep INTEGER := 0;
    v_prev_interval INTEGER := 1;
    v_prev_ef NUMERIC(4,2) := 2.50;
    v_prev_correct INTEGER := 0;
    v_prev_total INTEGER := 0;
    
    v_new_rep INTEGER;
    v_new_interval INTEGER;
    v_new_ef NUMERIC(4,2);
    v_new_correct INTEGER;
    v_next_due TIMESTAMPTZ;
    
    v_total_cards INTEGER;
    v_mastered_cards INTEGER;
    v_learning_cards INTEGER;
    v_new_cards INTEGER;
    v_mastery_pct NUMERIC(5,2);
    v_gamification_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_rating NOT BETWEEN 1 AND 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Rating must be an integer between 1 and 4 (1=AGAIN, 2=HARD, 3=GOOD, 4=EASY)');
    END IF;

    -- Validate card and parent deck
    SELECT fc.deck_id, fc.card_order, fd.topic_id, fd.access_tier, fd.is_curated, fd.author_id
    INTO v_deck_id, v_card_order, v_topic_id, v_access_tier, v_is_curated, v_author_id
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    WHERE fc.id = p_card_id AND fc.is_active = true AND fd.is_published = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Flashcard not found or inactive');
    END IF;

    -- Private deck check
    IF NOT v_is_curated AND v_author_id != v_user_id AND NOT (
        auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
        (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access denied to private deck');
    END IF;

    -- Entitlement verification for PRO curated decks
    IF v_is_curated AND v_access_tier = 'PRO' AND v_card_order > 3 THEN
        SELECT EXISTS (
            SELECT 1 FROM public.user_entitlements ue
            WHERE ue.user_id = v_user_id
              AND ue.is_active = true
              AND (ue.expires_at IS NULL OR ue.expires_at > now())
        ) INTO v_has_pro;

        IF NOT v_has_pro AND NOT (
            auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
            (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO subscription required to review full deck');
        END IF;
    END IF;

    -- Fetch current card review state if exists
    SELECT repetition_level, interval_days, ease_factor, consecutive_correct, total_reviews
    INTO v_prev_rep, v_prev_interval, v_prev_ef, v_prev_correct, v_prev_total
    FROM public.user_flashcard_reviews
    WHERE user_id = v_user_id AND card_id = p_card_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_prev_rep := 0;
        v_prev_interval := 1;
        v_prev_ef := 2.50;
        v_prev_correct := 0;
        v_prev_total := 0;
    END IF;

    -- SM-2 Mathematical Interval Scaling
    IF p_rating = 1 THEN -- AGAIN (Fail / Reset)
        v_new_rep := 0;
        v_new_interval := 1;
        v_new_correct := 0;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.20);
    ELSIF p_rating = 2 THEN -- HARD (Struggled)
        v_new_rep := v_prev_rep + 1;
        v_new_interval := GREATEST(1, floor(v_prev_interval * 1.20)::integer);
        v_new_correct := v_prev_correct + 1;
        v_new_ef := GREATEST(1.30, v_prev_ef - 0.15);
    ELSIF p_rating = 3 THEN -- GOOD (Standard Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 1;
        ELSIF v_prev_rep = 1 THEN
            v_new_interval := 6;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := v_prev_ef;
    ELSE -- EASY (Effortless Recall)
        v_new_rep := v_prev_rep + 1;
        IF v_prev_rep = 0 THEN
            v_new_interval := 4;
        ELSE
            v_new_interval := floor(v_prev_interval * v_prev_ef * 1.30)::integer;
        END IF;
        v_new_correct := v_prev_correct + 1;
        v_new_ef := LEAST(3.50, v_prev_ef + 0.15);
    END IF;

    -- Bound interval between 1 and 365 days
    v_new_interval := LEAST(365, GREATEST(1, v_new_interval));
    v_next_due := now() + (v_new_interval * INTERVAL '1 day');

    -- Upsert card review state
    INSERT INTO public.user_flashcard_reviews (
        user_id, card_id, deck_id, repetition_level, interval_days,
        ease_factor, last_rating, last_reviewed_at, next_review_due_at,
        total_reviews, consecutive_correct, updated_at
    ) VALUES (
        v_user_id, p_card_id, v_deck_id, v_new_rep, v_new_interval,
        v_new_ef, p_rating, now(), v_next_due,
        v_prev_total + 1, v_new_correct, now()
    )
    ON CONFLICT (user_id, card_id) DO UPDATE
        SET repetition_level = EXCLUDED.repetition_level,
            interval_days = EXCLUDED.interval_days,
            ease_factor = EXCLUDED.ease_factor,
            last_rating = EXCLUDED.last_rating,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            next_review_due_at = EXCLUDED.next_review_due_at,
            total_reviews = EXCLUDED.total_reviews,
            consecutive_correct = EXCLUDED.consecutive_correct,
            updated_at = now();

    -- Recalculate deck progress projection
    SELECT count(*) INTO v_total_cards
    FROM public.flashcards WHERE deck_id = v_deck_id AND is_active = true;

    SELECT 
        COUNT(CASE WHEN ufr.repetition_level >= 3 THEN 1 END),
        COUNT(CASE WHEN ufr.repetition_level BETWEEN 1 AND 2 THEN 1 END)
    INTO v_mastered_cards, v_learning_cards
    FROM public.user_flashcard_reviews ufr
    WHERE ufr.user_id = v_user_id AND ufr.deck_id = v_deck_id;

    v_new_cards := GREATEST(0, v_total_cards - (v_mastered_cards + v_learning_cards));
    IF v_total_cards > 0 THEN
        v_mastery_pct := ROUND(((v_mastered_cards::numeric / v_total_cards::numeric) * 100.0), 2);
    ELSE
        v_mastery_pct := 0.00;
    END IF;

    INSERT INTO public.user_deck_progress (
        user_id, deck_id, total_cards_mastered, total_cards_learning,
        total_cards_new, mastery_percentage, last_reviewed_at, updated_at
    ) VALUES (
        v_user_id, v_deck_id, v_mastered_cards, v_learning_cards,
        v_new_cards, v_mastery_pct, now(), now()
    )
    ON CONFLICT (user_id, deck_id) DO UPDATE
        SET total_cards_mastered = EXCLUDED.total_cards_mastered,
            total_cards_learning = EXCLUDED.total_cards_learning,
            total_cards_new = EXCLUDED.total_cards_new,
            mastery_percentage = EXCLUDED.mastery_percentage,
            last_reviewed_at = EXCLUDED.last_reviewed_at,
            updated_at = now();

    -- Phase 3C Learning Activity Event
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'FLASHCARD_CARD_REVIEWED',
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating, 'interval_days', v_new_interval),
        now()
    );

    -- Phase 3D Gamification Reward (1 coin per card per day)
    v_gamification_key := 'fdeck_card_' || p_card_id || '_' || v_user_id || '_' || to_char(now(), 'YYYY-MM-DD');
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_user_id, 'FLASHCARD_CARD_REVIEWED', 'FLASHCARD', p_card_id, v_gamification_key,
        'VERIFIED', 'REWARDED', 1, 1,
        jsonb_build_object('deck_id', v_deck_id, 'card_id', p_card_id, 'rating', p_rating),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'card_id', p_card_id,
        'deck_id', v_deck_id,
        'rating', p_rating,
        'repetition_level', v_new_rep,
        'interval_days', v_new_interval,
        'ease_factor', v_new_ef,
        'next_review_due_at', v_next_due,
        'mastery_percentage', v_mastery_pct
    );
END;
$$;


-- 2. fn_complete_deck_review_session
CREATE OR REPLACE FUNCTION public.fn_complete_deck_review_session(
    p_deck_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_topic_id UUID;
    v_reviewed_today INTEGER;
    v_gamification_key TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    SELECT topic_id INTO v_topic_id
    FROM public.flashcard_decks
    WHERE id = p_deck_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deck not found');
    END IF;

    SELECT count(*) INTO v_reviewed_today
    FROM public.user_flashcard_reviews
    WHERE user_id = v_user_id AND deck_id = p_deck_id AND last_reviewed_at >= CURRENT_DATE;

    IF v_reviewed_today = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No cards reviewed today in this deck');
    END IF;

    -- Phase 3C Activity Logging
    INSERT INTO public.learning_activity_events (
        user_id, topic_id, event_type, metadata, occurred_at
    ) VALUES (
        v_user_id, v_topic_id, 'FLASHCARD_DECK_COMPLETED',
        jsonb_build_object('deck_id', p_deck_id, 'cards_reviewed', v_reviewed_today),
        now()
    );

    -- Phase 3D Bonus Gamification Event (10 coins bonus per deck per day)
    v_gamification_key := 'fdeck_deck_' || p_deck_id || '_' || v_user_id || '_' || to_char(now(), 'YYYY-MM-DD');
    INSERT INTO public.gamification_events (
        user_id, event_type, source_type, source_id, idempotency_key,
        verification_status, reward_status, calculated_coins, actual_coins_awarded,
        metadata, occurred_at
    ) VALUES (
        v_user_id, 'FLASHCARD_DECK_COMPLETED', 'FLASHCARD_DECK', p_deck_id, v_gamification_key,
        'VERIFIED', 'REWARDED', 10, 10,
        jsonb_build_object('deck_id', p_deck_id, 'cards_reviewed', v_reviewed_today),
        now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'deck_id', p_deck_id,
        'cards_reviewed_today', v_reviewed_today,
        'completed_at', now()
    );
END;
$$;


-- 3. fn_get_due_flashcards
CREATE OR REPLACE FUNCTION public.fn_get_due_flashcards(
    p_deck_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    card_id UUID,
    deck_id UUID,
    card_order INTEGER,
    front_markdown_en TEXT,
    front_markdown_hi TEXT,
    back_markdown_en TEXT,
    back_markdown_hi TEXT,
    mnemonic_en TEXT,
    mnemonic_hi TEXT,
    latex_formulas TEXT[],
    hint TEXT,
    explanation TEXT,
    repetition_level INTEGER,
    interval_days INTEGER,
    ease_factor NUMERIC(4,2),
    next_review_due_at TIMESTAMPTZ,
    is_new BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_has_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.user_entitlements ue
        WHERE ue.user_id = v_user_id
          AND ue.is_active = true
          AND (ue.expires_at IS NULL OR ue.expires_at > now())
    ) INTO v_has_pro;

    RETURN QUERY
    SELECT 
        fc.id AS card_id,
        fc.deck_id,
        fc.card_order,
        fc.front_markdown_en,
        fc.front_markdown_hi,
        fc.back_markdown_en,
        fc.back_markdown_hi,
        fc.mnemonic_en,
        fc.mnemonic_hi,
        fc.latex_formulas,
        fc.hint,
        fc.explanation,
        COALESCE(ufr.repetition_level, 0) AS repetition_level,
        COALESCE(ufr.interval_days, 1) AS interval_days,
        COALESCE(ufr.ease_factor, 2.50) AS ease_factor,
        ufr.next_review_due_at,
        (ufr.id IS NULL) AS is_new
    FROM public.flashcards fc
    JOIN public.flashcard_decks fd ON fd.id = fc.deck_id
    LEFT JOIN public.user_flashcard_reviews ufr ON ufr.card_id = fc.id AND ufr.user_id = v_user_id
    WHERE fc.is_active = true
      AND fd.is_published = true
      AND (p_deck_id IS NULL OR fc.deck_id = p_deck_id)
      AND (
          fd.author_id = v_user_id OR
          (fd.is_curated = true AND (
              fd.access_tier = 'FREE' OR
              fc.card_order <= 3 OR
              v_has_pro OR
              auth.jwt()->>'role' IN ('admin', 'staff', 'service_role') OR
              (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'staff')
          ))
      )
      AND (ufr.next_review_due_at IS NULL OR ufr.next_review_due_at <= now())
    ORDER BY 
        CASE WHEN ufr.next_review_due_at IS NOT NULL THEN 0 ELSE 1 END,
        ufr.next_review_due_at ASC,
        fc.card_order ASC
    LIMIT p_limit;
END;
$$;


-- 4. fn_create_custom_flashcard_deck
CREATE OR REPLACE FUNCTION public.fn_create_custom_flashcard_deck(
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_topic_id UUID DEFAULT NULL,
    p_cards JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_slug TEXT;
    v_deck_id UUID;
    v_card_count INTEGER := 0;
    v_card JSONB;
    v_order INTEGER := 1;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    IF p_title IS NULL OR length(trim(p_title)) < 3 OR length(p_title) > 200 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Deck title must be between 3 and 200 characters');
    END IF;

    v_slug := 'deck-' || lower(regexp_replace(trim(p_title), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring(gen_random_uuid()::text from 1 for 8);

    INSERT INTO public.flashcard_decks (
        slug, title_en, description, topic_id, author_id,
        is_curated, access_tier, is_published, card_count
    ) VALUES (
        v_slug, trim(p_title), trim(p_description), p_topic_id, v_user_id,
        false, 'FREE', true, 0
    ) RETURNING id INTO v_deck_id;

    IF jsonb_typeof(p_cards) = 'array' THEN
        FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
        LOOP
            IF v_card->>'front' IS NOT NULL AND length(trim(v_card->>'front')) > 0 AND
               v_card->>'back' IS NOT NULL AND length(trim(v_card->>'back')) > 0 THEN
                
                INSERT INTO public.flashcards (
                    deck_id, card_order, front_markdown_en, back_markdown_en,
                    hint, explanation
                ) VALUES (
                    v_deck_id, v_order, trim(v_card->>'front'), trim(v_card->>'back'),
                    trim(v_card->>'hint'), trim(v_card->>'explanation')
                );
                
                v_order := v_order + 1;
                v_card_count := v_card_count + 1;
            END IF;
        END LOOP;
        
        UPDATE public.flashcard_decks
        SET card_count = v_card_count
        WHERE id = v_deck_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'deck_id', v_deck_id,
        'slug', v_slug,
        'card_count', v_card_count
    );
END;
$$;


-- ============================================================================
-- PERMISSIONS & NOTIFY
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_submit_flashcard_review(UUID, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_submit_flashcard_review(UUID, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_complete_deck_review_session(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_complete_deck_review_session(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_get_due_flashcards(UUID, INTEGER) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_get_due_flashcards(UUID, INTEGER) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(TEXT, TEXT, UUID, JSONB) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.fn_create_custom_flashcard_deck(TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
