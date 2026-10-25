-- =====================================================================================================================
-- 095 F5 Memory Lock (decision #77) — spaced review on the CANONICAL item store public.user_mistake_vault
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/095_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- Inspection (2026-10-25): user_mistake_vault is the one per user × question item (UNIQUE (user_id, question_id),
-- 87 rows / 4 users) but holds NO schedule; spaced_repetition_schedules (SM-2, 0 rows, no app reader / writer) is a
-- dormant parallel store. So the vault is EXTENDED (ml_* columns) — no new item store, no second schedule; the dormant
-- table is NOT used (its retirement is proposed separately, not done here).
--
-- 1. Vault gains the Memory Lock schedule: ml_source (mistake / manual), ml_state (new / learning / review / locked),
--    ml_due_at (IST midnight of the due day), ml_interval_days (0..30), ml_consecutive_correct_days, ml_lapses,
--    ml_last_result, ml_last_reviewed_at, ml_last_advance_on (IST day of the last advance: one step per calendar day).
--    Existing rows (all from mistakes) → learning, interval 1, due the IST day after their last mistake.
--    total_mistakes_count may be 0 only for a manual item.
-- 2. fn_ml_vault_schedule (trigger, NOT security definer): the ONE place a wrong answer moves the schedule, whatever
--    wrote it — a new vault row (mistake: learning, due tomorrow; manual: new, due today), a later mistake
--    (total_mistakes_count rises: mock, practice, Memory Lock, Daily 10Q — all through fn_record_mistake_occurrence) or a
--    wrong drill answer (last_practiced_at moves with consecutive_correct_in_remediation = 0): interval 1, lapses + 1.
-- 3. fn_memory_lock_answer (SECURITY DEFINER, search_path '', authenticated only) — ONE atomic call: checks the answer
--    (same key safety as fn_check_practice_answer: published, current, servable version; key + explanation returned
--    only AFTER the answer is recorded), records it in practice_answers (mode MEMORY_LOCK; idempotent per session ×
--    version → a retried call never advances twice), and in the same transaction applies the correct step (ladder
--    1 → 3 → 7 → 14 → 30, one step per IST day, exam-date cap, locked rule) or records the mistake through the
--    canonical writer (the trigger applies the wrong step). auth.uid() only; shares the practice rate limit
--    (30 / minute, 1500 / day).
-- 4. fn_memory_lock_add (SECURITY DEFINER, search_path '', authenticated only) — "Add to Memory Lock": a manual item for a
--    published, servable question; idempotent; 100 manual adds per rolling day.
-- 5. user_mistake_occurrences.source_context += MEMORY_LOCK; practice_answers.mode += MEMORY_LOCK.
-- Errors are fixed codes only.
-- =====================================================================================================================

-- ------------------------------------------------------------------ 1. schedule columns on the canonical vault
ALTER TABLE public.user_mistake_vault
    ADD COLUMN IF NOT EXISTS ml_source text NOT NULL DEFAULT 'mistake',
    ADD COLUMN IF NOT EXISTS ml_state text NOT NULL DEFAULT 'learning',
    ADD COLUMN IF NOT EXISTS ml_due_at timestamptz,
    ADD COLUMN IF NOT EXISTS ml_interval_days integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS ml_consecutive_correct_days integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ml_lapses integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS ml_last_result text,
    ADD COLUMN IF NOT EXISTS ml_last_reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS ml_last_advance_on date;

UPDATE public.user_mistake_vault
   SET ml_due_at = ((((last_mistake_at AT TIME ZONE 'Asia/Kolkata')::date + 1)::timestamp) AT TIME ZONE 'Asia/Kolkata'),
       ml_last_result = 'wrong',
       ml_last_reviewed_at = last_mistake_at
 WHERE ml_due_at IS NULL;
ALTER TABLE public.user_mistake_vault ALTER COLUMN ml_due_at SET NOT NULL;
ALTER TABLE public.user_mistake_vault ALTER COLUMN ml_due_at SET DEFAULT now();

ALTER TABLE public.user_mistake_vault
    ADD CONSTRAINT chk_umv_ml_source CHECK (ml_source IN ('mistake', 'manual')),
    ADD CONSTRAINT chk_umv_ml_state CHECK (ml_state IN ('new', 'learning', 'review', 'locked')),
    ADD CONSTRAINT chk_umv_ml_interval CHECK (ml_interval_days BETWEEN 0 AND 30),
    ADD CONSTRAINT chk_umv_ml_counts CHECK (ml_consecutive_correct_days >= 0 AND ml_lapses >= 0),
    ADD CONSTRAINT chk_umv_ml_last_result CHECK (ml_last_result IS NULL OR ml_last_result IN ('correct', 'wrong'));
ALTER TABLE public.user_mistake_vault DROP CONSTRAINT IF EXISTS user_mistake_vault_total_mistakes_count_check;
ALTER TABLE public.user_mistake_vault ADD CONSTRAINT user_mistake_vault_total_mistakes_count_check
    CHECK (total_mistakes_count >= 1 OR (ml_source = 'manual' AND total_mistakes_count >= 0));
CREATE INDEX IF NOT EXISTS idx_umv_ml_due ON public.user_mistake_vault (user_id, ml_due_at);

-- provenance + answer log for Memory Lock reviews (existing canonical stores)
ALTER TABLE public.user_mistake_occurrences DROP CONSTRAINT IF EXISTS user_mistake_occurrences_source_context_check;
ALTER TABLE public.user_mistake_occurrences ADD CONSTRAINT user_mistake_occurrences_source_context_check CHECK (source_context = ANY (ARRAY[
    'MOCK_TEST', 'CUSTOM_PRACTICE', 'QUIZ_BATTLE', 'FLASHCARD_REVIEW', 'MISTAKE_DRILL', 'DIAGNOSTIC_ASSESSMENT', 'MEMORY_LOCK']));
ALTER TABLE public.practice_answers DROP CONSTRAINT IF EXISTS practice_answers_mode_check;
ALTER TABLE public.practice_answers ADD CONSTRAINT practice_answers_mode_check CHECK (mode IN ('TOPIC', 'DIAGNOSTIC', 'MEMORY_LOCK'));

-- ------------------------------------------------------------------ pure helpers (IST days, ladder)
CREATE OR REPLACE FUNCTION public.fn_ml_ist_today() RETURNS date
LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT (pg_catalog.now() AT TIME ZONE 'Asia/Kolkata')::date $$;

CREATE OR REPLACE FUNCTION public.fn_ml_day_start(p_day date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$ SELECT (p_day::timestamp AT TIME ZONE 'Asia/Kolkata') $$;

CREATE OR REPLACE FUNCTION public.fn_ml_next_step(p_interval integer) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE WHEN p_interval < 1 THEN 1 WHEN p_interval < 3 THEN 3 WHEN p_interval < 7 THEN 7 WHEN p_interval < 14 THEN 14 ELSE 30 END
$$;
REVOKE ALL ON FUNCTION public.fn_ml_ist_today() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ml_day_start(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ml_next_step(integer) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ 2. the wrong-answer / add trigger
CREATE OR REPLACE FUNCTION public.fn_ml_vault_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_today date := public.fn_ml_ist_today();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.ml_source = 'manual' THEN
            NEW.ml_state := 'new'; NEW.ml_interval_days := 0; NEW.ml_due_at := public.fn_ml_day_start(v_today);
            NEW.ml_last_result := NULL; NEW.ml_last_reviewed_at := NULL;
        ELSE
            NEW.ml_state := 'learning'; NEW.ml_interval_days := 1; NEW.ml_due_at := public.fn_ml_day_start(v_today + 1);
            NEW.ml_last_result := 'wrong'; NEW.ml_last_reviewed_at := pg_catalog.now();
        END IF;
        NEW.ml_consecutive_correct_days := 0; NEW.ml_lapses := 0; NEW.ml_last_advance_on := NULL;
        RETURN NEW;
    END IF;
    -- a new mistake: the canonical writer always increments total_mistakes_count (the timestamp alone can stay equal
    -- within one transaction); or a wrong drill answer
    IF NEW.total_mistakes_count > OLD.total_mistakes_count
       OR NEW.last_mistake_at > OLD.last_mistake_at
       OR (NEW.last_practiced_at IS DISTINCT FROM OLD.last_practiced_at AND NEW.consecutive_correct_in_remediation = 0 AND NEW.lifecycle_status <> 'MASTERED') THEN
        NEW.ml_state := 'learning'; NEW.ml_interval_days := 1; NEW.ml_consecutive_correct_days := 0;
        NEW.ml_lapses := OLD.ml_lapses + 1; NEW.ml_last_result := 'wrong'; NEW.ml_last_reviewed_at := pg_catalog.now();
        NEW.ml_due_at := public.fn_ml_day_start(v_today + 1);
    END IF;
    RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.fn_ml_vault_schedule() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_umv_ml_schedule ON public.user_mistake_vault;
CREATE TRIGGER trg_umv_ml_schedule BEFORE INSERT OR UPDATE ON public.user_mistake_vault
    FOR EACH ROW EXECUTE FUNCTION public.fn_ml_vault_schedule();

-- ------------------------------------------------------------------ 3. answer a Memory Lock item (atomic)
CREATE OR REPLACE FUNCTION public.fn_memory_lock_answer(p_question_version_id uuid, p_selected_option_key text, p_time_taken_ms integer, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_today    date := public.fn_ml_ist_today();
    v_qid      uuid;
    v_lang     text;
    v_item     record;
    v_prev     record;
    v_key      text;
    v_expl     text;
    v_correct  boolean;
    v_answer   uuid;
    v_exam     date;
    v_interval integer;
    v_days     integer;
    v_cap      integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_version_id IS NULL OR p_session_id IS NULL
       OR (p_selected_option_key IS NOT NULL AND p_selected_option_key NOT IN ('A', 'B', 'C', 'D'))
       OR (p_time_taken_ms IS NOT NULL AND (p_time_taken_ms < 0 OR p_time_taken_ms > 3600000)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;

    SELECT v.question_id, v.language INTO v_qid, v_lang
      FROM public.question_versions v
      JOIN public.questions q ON q.id = v.question_id
     WHERE v.id = p_question_version_id AND v.lifecycle_status = 'PUBLISHED' AND v.is_current AND q.status = 'published';
    IF v_qid IS NULL OR NOT public.fn_qf_version_is_servable(p_question_version_id) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- serialise this user's answers (shared with topic practice: one rate limit, exact idempotency)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('practice_answers:' || v_uid::text, 0));

    SELECT * INTO v_item FROM public.user_mistake_vault WHERE user_id = v_uid AND question_id = v_qid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_IN_MEMORY_LOCK');
    END IF;

    SELECT a.correct_option_key, a.explanation_md INTO v_key, v_expl FROM public.question_answers a WHERE a.question_version_id = p_question_version_id;
    IF v_key IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;

    -- idempotent per (session, version): a retried call returns the stored result and the CURRENT schedule, no 2nd step
    SELECT * INTO v_prev FROM public.practice_answers WHERE user_id = v_uid AND set_id = p_session_id AND question_version_id = p_question_version_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'idempotent', true, 'is_correct', v_prev.is_correct,
            'correct_option_key', v_key, 'explanation_md', v_expl,
            'due_on', (v_item.ml_due_at AT TIME ZONE 'Asia/Kolkata')::date, 'interval_days', v_item.ml_interval_days, 'state', v_item.ml_state);
    END IF;
    IF (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > pg_catalog.now() - interval '1 minute') >= 30
       OR (SELECT count(*) FROM public.practice_answers WHERE user_id = v_uid AND answered_at > pg_catalog.now() - interval '1 day') >= 1500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;

    v_correct := p_selected_option_key IS NOT NULL AND p_selected_option_key = v_key;
    INSERT INTO public.practice_answers (user_id, question_id, question_version_id, selected_option_key, is_correct, time_taken_ms, set_id, mode, language)
    VALUES (v_uid, v_qid, p_question_version_id, p_selected_option_key, v_correct, p_time_taken_ms, p_session_id, 'MEMORY_LOCK',
            CASE WHEN v_lang IN ('en', 'hi') THEN v_lang ELSE 'en' END)
    RETURNING id INTO v_answer;

    IF v_correct THEN
        IF v_item.ml_last_advance_on IS DISTINCT FROM v_today THEN            -- one step per IST calendar day
            v_interval := public.fn_ml_next_step(v_item.ml_interval_days);
            SELECT o.exam_date INTO v_exam FROM public.user_onboarding o WHERE o.user_id = v_uid;
            IF v_exam IS NOT NULL AND v_exam >= v_today THEN
                v_cap := GREATEST(1, (v_exam - v_today) / 2);
                v_interval := LEAST(v_interval, v_cap);
            END IF;
            v_days := v_item.ml_consecutive_correct_days + 1;
            UPDATE public.user_mistake_vault
               SET ml_interval_days = v_interval,
                   ml_consecutive_correct_days = v_days,
                   ml_state = CASE WHEN v_days >= 2 AND v_interval >= 7 THEN 'locked' WHEN v_days >= 1 THEN 'review' ELSE 'learning' END,
                   ml_last_result = 'correct', ml_last_reviewed_at = pg_catalog.now(), ml_last_advance_on = v_today,
                   ml_due_at = public.fn_ml_day_start(v_today + v_interval), updated_at = pg_catalog.now()
             WHERE id = v_item.id;
        ELSE
            UPDATE public.user_mistake_vault SET ml_last_result = 'correct', ml_last_reviewed_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE id = v_item.id;
        END IF;
    ELSE
        -- the canonical mistake writer; the vault trigger applies the wrong step (interval 1, lapses + 1)
        PERFORM public.fn_record_mistake_occurrence(v_uid, v_qid, 'MEMORY_LOCK', v_answer, NULL,
            CASE WHEN p_time_taken_ms IS NULL THEN NULL ELSE p_time_taken_ms / 1000 END, 'UNCLASSIFIED', 50, p_question_version_id, NULL);
    END IF;

    SELECT * INTO v_item FROM public.user_mistake_vault WHERE id = v_item.id;
    RETURN jsonb_build_object('success', true, 'code', 'CHECKED', 'idempotent', false, 'is_correct', v_correct,
        'correct_option_key', v_key, 'explanation_md', v_expl,
        'due_on', (v_item.ml_due_at AT TIME ZONE 'Asia/Kolkata')::date, 'interval_days', v_item.ml_interval_days, 'state', v_item.ml_state);
END
$$;
REVOKE ALL ON FUNCTION public.fn_memory_lock_answer(uuid, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_memory_lock_answer(uuid, text, integer, uuid) TO authenticated;

-- ------------------------------------------------------------------ 4. "Add to Memory Lock"
CREATE OR REPLACE FUNCTION public.fn_memory_lock_add(p_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_topic uuid;
    v_ok    boolean;
    v_rows  integer;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_question_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT q.canonical_topic_id,
           EXISTS (SELECT 1 FROM public.question_versions v WHERE v.question_id = q.id AND v.is_current AND v.lifecycle_status = 'PUBLISHED' AND public.fn_qf_version_is_servable(v.id))
      INTO v_topic, v_ok
      FROM public.questions q WHERE q.id = p_question_id AND q.status = 'published';
    IF v_ok IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND');
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('memory_lock_add:' || v_uid::text, 0));
    IF EXISTS (SELECT 1 FROM public.user_mistake_vault WHERE user_id = v_uid AND question_id = p_question_id) THEN
        RETURN jsonb_build_object('success', true, 'code', 'ALREADY_ADDED');
    END IF;
    IF (SELECT count(*) FROM public.user_mistake_vault WHERE user_id = v_uid AND ml_source = 'manual' AND created_at > pg_catalog.now() - interval '1 day') >= 100 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED');
    END IF;
    INSERT INTO public.user_mistake_vault (user_id, question_id, topic_id, total_mistakes_count, ml_source)
    VALUES (v_uid, p_question_id, v_topic, 0, 'manual')
    ON CONFLICT (user_id, question_id) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'code', CASE WHEN v_rows = 1 THEN 'ADDED' ELSE 'ALREADY_ADDED' END);
END
$$;
REVOKE ALL ON FUNCTION public.fn_memory_lock_add(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_memory_lock_add(uuid) TO authenticated;
