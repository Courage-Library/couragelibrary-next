-- =============================================================================
-- COURAGE LIBRARY — F0 ONBOARDING (decision #76)
-- Migration: 20261025000091_f0_onboarding.sql      (NOT APPLIED by the agent — owner applies after a backup)
--
-- Stores ONLY: language, target exams, exam date (nullable), attempt band, daily minutes, completed / skipped time.
-- Reuses the canonical tables:
--   language     → public.user_profiles.language_preference (CHECK widened: 'en' | 'hi' | 'hinglish')
--   target exams → public.user_exam_goals — NON-DESTRUCTIVE (F0-a): the selected exams are upserted / activated
--                  (priority = order chosen, the exam's latest existing cycle, daily_study_minutes from step 4); every
--                  other goal stays exactly as it is. Only goals the user explicitly UNTICKED in step 2 (they were shown
--                  pre-selected) are deactivated — p_remove_exam_ids, the caller's own active goals only — and the
--                  result lists them ('removed') for the finish screen. No exam_cycles row is created.
-- New (owner-scoped): public.user_onboarding — one row per user (exam date, attempt band, daily minutes,
--   completed_at / skipped_at). RLS: the user reads only their own row; admins read all; NO client write — every
--   write goes through fn_save_onboarding (decisions #39 / #42).
-- Functions:
--   fn_save_onboarding(p_action, p_language, p_exam_ids, p_exam_date, p_attempt, p_daily_minutes, p_remove_exam_ids)
--     SECURITY DEFINER, search_path '', caller = auth.uid() only (never an argument); validates every input and
--     answers {success, code[, field]} without raising; 'skip' only sets skipped_at; roles are never touched.
--     EXECUTE: authenticated only (revoked from PUBLIC, anon, service_role). SECDEF allow-list: class A.
--   fn_get_my_onboarding()  SECURITY INVOKER (RLS applies), STABLE, search_path '' — the caller's own state.
-- Rollback: docs/database/rollback/091_rollback.sql
-- =============================================================================

-- ------------------------------------------------------------------ 1. language preference: add 'hinglish'
DO $$
DECLARE
    c text;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'public.user_profiles'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) ILIKE '%language_preference%'
    LOOP
        EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', c);
    END LOOP;
END $$;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_language_preference_check CHECK (language_preference IN ('en', 'hi', 'hinglish'));

-- ------------------------------------------------------------------ 2. owner-scoped onboarding state
CREATE TABLE public.user_onboarding (
    user_id       uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    exam_date     date NULL,
    attempt_band  text NULL CHECK (attempt_band IN ('first', 'second', 'third_plus')),
    daily_minutes integer NULL CHECK (daily_minutes IN (15, 30, 60, 90)),
    completed_at  timestamptz NULL,
    skipped_at    timestamptz NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_onboarding TO authenticated;

CREATE POLICY "user_onboarding: own read" ON public.user_onboarding
    FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_onboarding: admin read" ON public.user_onboarding
    FOR SELECT TO authenticated USING (public.fn_jwt_is_admin());
-- no INSERT / UPDATE / DELETE policy: client writes are impossible; fn_save_onboarding is the only writer

-- ------------------------------------------------------------------ 3. write RPC
CREATE FUNCTION public.fn_save_onboarding(
    p_action        text,
    p_language      text    DEFAULT NULL,
    p_exam_ids      uuid[]  DEFAULT NULL,
    p_exam_date     date    DEFAULT NULL,
    p_attempt       text    DEFAULT NULL,
    p_daily_minutes integer DEFAULT NULL,
    p_remove_exam_ids uuid[] DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_today   date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    v_ids     uuid[];
    v_exam    uuid;
    v_cycle   uuid;
    v_rank    integer := 0;
    v_remove  uuid[] := '{}'::uuid[];
    v_removed uuid[] := '{}'::uuid[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED');
    END IF;
    IF p_action IS NULL OR p_action NOT IN ('complete', 'skip') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'action');
    END IF;

    IF p_action = 'skip' THEN
        INSERT INTO public.user_onboarding (user_id, skipped_at, updated_at)
        VALUES (v_user_id, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET skipped_at = now(), updated_at = now();
        RETURN jsonb_build_object('success', true, 'code', 'SKIPPED');
    END IF;

    -- ---- validation (every step may be skipped: NULL = no answer)
    IF p_language IS NOT NULL AND p_language NOT IN ('en', 'hi', 'hinglish') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'language');
    END IF;
    IF p_attempt IS NOT NULL AND p_attempt NOT IN ('first', 'second', 'third_plus') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'attempt');
    END IF;
    IF p_daily_minutes IS NOT NULL AND p_daily_minutes NOT IN (15, 30, 60, 90) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'daily_minutes');
    END IF;
    IF p_exam_date IS NOT NULL AND (p_exam_date < v_today OR p_exam_date > v_today + 1830) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'exam_date');
    END IF;

    IF p_exam_ids IS NOT NULL THEN
        -- distinct, first-seen order, NULLs dropped
        SELECT coalesce(array_agg(d.id ORDER BY d.first_ord), '{}'::uuid[]) INTO v_ids
        FROM (SELECT u.id, min(u.ord) AS first_ord
                FROM unnest(p_exam_ids) WITH ORDINALITY AS u(id, ord)
               WHERE u.id IS NOT NULL
               GROUP BY u.id) d;
        IF cardinality(v_ids) > 3 THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'exam_ids');
        END IF;
        -- every exam must be active AND have a cycle (no cycle is ever created here)
        IF EXISTS (
            SELECT 1 FROM unnest(v_ids) AS x(id)
             WHERE NOT EXISTS (SELECT 1 FROM public.exams e WHERE e.id = x.id AND e.is_active)
                OR NOT EXISTS (SELECT 1 FROM public.exam_cycles c WHERE c.exam_id = x.id)
        ) THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'exam_ids');
        END IF;
    END IF;

    -- explicit unticks only (F0-a): distinct, at most 10, never also selected
    IF p_remove_exam_ids IS NOT NULL THEN
        SELECT coalesce(array_agg(DISTINCT r.id), '{}'::uuid[]) INTO v_remove
          FROM unnest(p_remove_exam_ids) AS r(id) WHERE r.id IS NOT NULL;
        IF cardinality(v_remove) > 10 OR (v_ids IS NOT NULL AND v_remove && v_ids) THEN
            RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'field', 'remove_exam_ids');
        END IF;
    END IF;

    -- ---- writes (own rows only)
    IF p_language IS NOT NULL THEN
        UPDATE public.user_profiles SET language_preference = p_language, updated_at = now() WHERE id = v_user_id;
    END IF;

    -- NON-DESTRUCTIVE: only the caller's own ACTIVE goals the user explicitly unticked are deactivated; nothing else
    IF cardinality(v_remove) > 0 THEN
        WITH d AS (
            UPDATE public.user_exam_goals SET is_active = false, updated_at = now()
             WHERE user_id = v_user_id AND is_active AND exam_id = ANY (v_remove)
         RETURNING exam_id
        )
        SELECT coalesce(array_agg(DISTINCT d.exam_id), '{}'::uuid[]) INTO v_removed FROM d;
    END IF;

    -- selected exams: upsert / activate (idempotent: the same input gives the same rows)
    IF v_ids IS NOT NULL AND cardinality(v_ids) > 0 THEN
        FOREACH v_exam IN ARRAY v_ids LOOP
            v_rank := v_rank + 1;
            SELECT c.id INTO v_cycle FROM public.exam_cycles c
             WHERE c.exam_id = v_exam
             ORDER BY (c.status = 'active') DESC, c.cycle_year DESC, c.created_at DESC
             LIMIT 1;
            INSERT INTO public.user_exam_goals (user_id, exam_id, exam_cycle_id, priority_rank, daily_study_minutes, is_active)
            VALUES (v_user_id, v_exam, v_cycle, v_rank, coalesce(p_daily_minutes, 120), true)
            ON CONFLICT (user_id, exam_id, exam_cycle_id) DO UPDATE
               SET is_active = true, priority_rank = EXCLUDED.priority_rank,
                   daily_study_minutes = coalesce(p_daily_minutes, public.user_exam_goals.daily_study_minutes),
                   updated_at = now();
        END LOOP;
    END IF;

    INSERT INTO public.user_onboarding (user_id, exam_date, attempt_band, daily_minutes, completed_at, updated_at)
    VALUES (v_user_id, p_exam_date, p_attempt, p_daily_minutes, now(), now())
    ON CONFLICT (user_id) DO UPDATE
       SET exam_date = EXCLUDED.exam_date, attempt_band = EXCLUDED.attempt_band, daily_minutes = EXCLUDED.daily_minutes,
           completed_at = now(), updated_at = now();

    RETURN jsonb_build_object('success', true, 'code', 'SAVED', 'removed', to_jsonb(v_removed));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_save_onboarding(text, text, uuid[], date, text, integer, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_save_onboarding(text, text, uuid[], date, text, integer, uuid[]) TO authenticated;

-- ------------------------------------------------------------------ 4. read RPC (RLS applies: own rows only)
CREATE FUNCTION public.fn_get_my_onboarding()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
    SELECT jsonb_build_object(
        'completed_at', o.completed_at,
        'skipped_at', o.skipped_at,
        'exam_date', o.exam_date,
        'attempt_band', o.attempt_band,
        'daily_minutes', o.daily_minutes,
        'language', p.language_preference,
        'exam_ids', (SELECT coalesce(jsonb_agg(g.exam_id ORDER BY g.priority_rank), '[]'::jsonb)
                       FROM public.user_exam_goals g
                      WHERE g.user_id = auth.uid() AND g.is_active)
    )
    FROM (SELECT auth.uid() AS uid) u
    LEFT JOIN public.user_onboarding o ON o.user_id = u.uid
    LEFT JOIN public.user_profiles p ON p.id = u.uid
    WHERE u.uid IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.fn_get_my_onboarding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_my_onboarding() TO authenticated;
