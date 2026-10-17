-- =============================================================================
-- COURAGE LIBRARY — QB-KEY-1 Stage 2 (1/2): question validity is a DB invariant (decision #52)
-- Migration: 20261017000087_qb_key1_question_validity_guard.sql
--
-- Functions + triggers only (no table / column / policy / data change).
-- Rule ("valid answer key"): exactly 4 options keyed A, B, C, D; exactly one question_answers row (PK); its
-- correct_option_key is one of that version's option keys. Mirror in TypeScript: lib/questions/answer-key.ts.
--
--   fn_qf_version_key_problem(version)      NULL when valid, else OPTION_COUNT / OPTION_KEYS / NO_ANSWER /
--                                           KEY_NOT_IN_OPTIONS / VERSION_NOT_FOUND            (owner only)
--   fn_qf_version_is_servable(version)      the shared predicate (key_problem IS NULL)         (owner only)
--   fn_qf_assert_version_publishable(v)     raises QF_KEY_INVALID: <reason>                     (owner only)
--   trg_qf_version_publishable              CONSTRAINT TRIGGER on question_versions, DEFERRABLE INITIALLY
--                                           DEFERRED, AFTER INSERT OR UPDATE OF lifecycle_status, is_current,
--                                           WHEN PUBLISHED or current → checked at COMMIT for every path
--                                           (fn_publish_question_version, imports, revisions, direct SQL with
--                                           app.qf_lifecycle_write). question_options / question_answers need
--                                           no trigger: rows of a non-DRAFT version are already frozen (QF-1).
--   Immediate errors: fn_publish_question_version and fn_transition_question_version (→ APPROVED) call the assert.
--   Serving only valid keys (shared predicate): mock assembly (mock_questions guard), practice
--   (fn_generate_custom_practice_session, 7 branches), drills (fn_generate_mistake_drill), battles
--   (fn_find_or_create_battle_room, both overloads).
-- Existing data: the trigger fires only on INSERT or a change of lifecycle_status / is_current, so it never
--   rewrites history; the one invalid published version (CA-4 fixture bc0b7703-22a0-4234-933e-9db0029e59b8) is retired by
--   migration 088 (questions.status = archived — not a version change, so not blocked).
-- CREATE OR REPLACE keeps every existing ACL; no new EXECUTE for PUBLIC / anon / authenticated (P-9 unchanged).
-- Rollback: docs/database/rollback/087_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------- precondition
DO $pre$
DECLARE
  v_bad uuid[];
BEGIN
  SELECT array_agg(v.id ORDER BY v.id) INTO v_bad
    FROM public.question_versions v
   WHERE (v.lifecycle_status = 'PUBLISHED' OR v.is_current)
     AND ( (SELECT count(*) FROM public.question_options o WHERE o.question_version_id = v.id) <> 4
        OR (SELECT count(DISTINCT o.option_key) FROM public.question_options o WHERE o.question_version_id = v.id AND o.option_key IN ('A','B','C','D')) <> 4
        OR NOT EXISTS (SELECT 1 FROM public.question_answers a JOIN public.question_options o
                         ON o.question_version_id = a.question_version_id AND o.option_key = a.correct_option_key
                        WHERE a.question_version_id = v.id));
  IF v_bad IS DISTINCT FROM ARRAY['bc0b7703-22a0-4234-933e-9db0029e59b8'::uuid] THEN
    RAISE EXCEPTION 'QB_KEY1_PRECHECK_FAILED: expected exactly the CA-4 fixture version bc0b7703-22a0-4234-933e-9db0029e59b8 to be invalid, found %', v_bad;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.question_versions WHERE id = 'bc0b7703-22a0-4234-933e-9db0029e59b8'
                   AND question_id = ANY (ARRAY['c6cbfdbf-def4-45a5-9ef6-4d0a24ab61cc', '234486ee-4485-49fe-8e7d-e2cab11b250b', '597c1c98-9a54-4662-95d1-430b18b8dc61', '1fdd3747-a113-4f63-8cef-49aa63ce1c32', 'd00219c2-13be-47c7-8584-bf00bc187fd4', '3735364e-5993-4378-9d89-3b3347fe3bfe', '78bd0707-d8eb-4ef7-8c80-ef707df6e1cd', '94b30583-2969-493a-80bd-85e179fe1ab4']::uuid[])) THEN
    RAISE EXCEPTION 'QB_KEY1_PRECHECK_FAILED: the invalid version is not one of the 8 CA-4 fixtures';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mock_questions mq WHERE mq.question_version_id = 'bc0b7703-22a0-4234-933e-9db0029e59b8') THEN
    RAISE EXCEPTION 'QB_KEY1_PRECHECK_FAILED: the invalid version is used by a mock';
  END IF;
END
$pre$;

-- ---------------------------------------------------------------- the rule
CREATE FUNCTION public.fn_qf_version_key_problem(p_version_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.question_versions v WHERE v.id = p_version_id) THEN 'VERSION_NOT_FOUND'
    WHEN (SELECT count(*) FROM public.question_options o WHERE o.question_version_id = p_version_id) <> 4 THEN 'OPTION_COUNT'
    WHEN (SELECT count(DISTINCT o.option_key) FROM public.question_options o
           WHERE o.question_version_id = p_version_id AND o.option_key IN ('A', 'B', 'C', 'D')) <> 4 THEN 'OPTION_KEYS'
    WHEN NOT EXISTS (SELECT 1 FROM public.question_answers a WHERE a.question_version_id = p_version_id) THEN 'NO_ANSWER'
    WHEN NOT EXISTS (SELECT 1 FROM public.question_answers a
                       JOIN public.question_options o ON o.question_version_id = a.question_version_id AND o.option_key = a.correct_option_key
                      WHERE a.question_version_id = p_version_id) THEN 'KEY_NOT_IN_OPTIONS'
    ELSE NULL
  END;
$$;

CREATE FUNCTION public.fn_qf_version_is_servable(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT public.fn_qf_version_key_problem(p_version_id) IS NULL;
$$;

CREATE FUNCTION public.fn_qf_assert_version_publishable(p_version_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  v_problem text := public.fn_qf_version_key_problem(p_version_id);
BEGIN
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION 'QF_KEY_INVALID: % (version %)', v_problem, p_version_id USING ERRCODE = '23514';
  END IF;
END;
$$;

-- commit-time check; re-reads the row so a version superseded later in the same transaction is not blocked
CREATE FUNCTION public.fn_qf_version_publishable_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_status text;
  v_current boolean;
BEGIN
  SELECT lifecycle_status, is_current INTO v_status, v_current FROM public.question_versions WHERE id = NEW.id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_status = 'PUBLISHED' OR v_current THEN
    PERFORM public.fn_qf_assert_version_publishable(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_qf_version_publishable
  AFTER INSERT OR UPDATE OF lifecycle_status, is_current ON public.question_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.lifecycle_status = 'PUBLISHED' OR NEW.is_current)
  EXECUTE FUNCTION public.fn_qf_version_publishable_trg();

REVOKE ALL ON FUNCTION public.fn_qf_version_key_problem(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_version_is_servable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_assert_version_publishable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_qf_version_publishable_trg() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- immediate errors + serving (CREATE OR REPLACE keeps ACLs)
CREATE OR REPLACE FUNCTION public.fn_publish_question_version(p_version_id uuid, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_version RECORD;
    v_previous UUID;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT * INTO v_version FROM public.question_versions WHERE id = p_version_id FOR UPDATE;
    IF v_version IS NULL THEN
        RAISE EXCEPTION 'QF_VERSION_NOT_FOUND';
    END IF;
    IF v_version.lifecycle_status <> 'APPROVED' THEN
        RAISE EXCEPTION 'QF_ILLEGAL_TRANSITION: only APPROVED versions can be published (current: %)', v_version.lifecycle_status;
    END IF;
    -- QB-KEY-1 (087): immediate, clear error; the deferred constraint trigger trg_qf_version_publishable is the authority.
    PERFORM public.fn_qf_assert_version_publishable(p_version_id);

    -- Lock the question and all its versions (deterministic order).
    PERFORM 1 FROM public.questions WHERE id = v_version.question_id FOR UPDATE;
    PERFORM 1 FROM public.question_versions WHERE question_id = v_version.question_id ORDER BY id FOR UPDATE;

    PERFORM set_config('app.qf_lifecycle_write', 'on', true);

    UPDATE public.question_versions
    SET is_current = false,
        lifecycle_status = CASE WHEN lifecycle_status = 'PUBLISHED' THEN 'SUPERSEDED' ELSE lifecycle_status END
    WHERE question_id = v_version.question_id
      AND id <> p_version_id
      AND is_current = true
    RETURNING id INTO v_previous;

    UPDATE public.question_versions
    SET lifecycle_status = 'PUBLISHED',
        published_at = now(),
        is_current = true
    WHERE id = p_version_id;

    UPDATE public.questions
    SET status = 'published',
        updated_at = now()
    WHERE id = v_version.question_id;

    PERFORM set_config('app.qf_lifecycle_write', 'off', true);

    RETURN jsonb_build_object(
        'success', true,
        'version_id', p_version_id,
        'question_id', v_version.question_id,
        'superseded_version_id', v_previous
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_transition_question_version(p_version_id uuid, p_to text, p_actor uuid, p_notes text DEFAULT NULL::text, p_checklist jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_version RECORD;
    v_question_status TEXT;
    v_required TEXT[] := ARRAY['correct_key_verified','explanation_correct','no_ambiguity','topic_correct','difficulty_sensible','provenance_verified'];
    v_key TEXT;
BEGIN
    IF p_actor IS NULL THEN
        RAISE EXCEPTION 'QF_ACTOR_REQUIRED: an authenticated admin actor is required';
    END IF;

    SELECT * INTO v_version FROM public.question_versions WHERE id = p_version_id FOR UPDATE;
    IF v_version IS NULL THEN
        RAISE EXCEPTION 'QF_VERSION_NOT_FOUND';
    END IF;

    IF NOT (
        (v_version.lifecycle_status = 'DRAFT' AND p_to = 'IN_REVIEW')
        OR (v_version.lifecycle_status = 'IN_REVIEW' AND p_to IN ('CHANGES_REQUESTED', 'APPROVED', 'REJECTED'))
        OR (v_version.lifecycle_status = 'CHANGES_REQUESTED' AND p_to = 'DRAFT')
    ) THEN
        RAISE EXCEPTION 'QF_ILLEGAL_TRANSITION: % -> % is not allowed', v_version.lifecycle_status, COALESCE(p_to, 'null');
    END IF;

    IF p_to = 'APPROVED' THEN
        IF p_checklist IS NULL OR jsonb_typeof(p_checklist) <> 'object' OR p_checklist = '{}'::jsonb THEN
            RAISE EXCEPTION 'QF_CHECKLIST_REQUIRED: approval requires the reviewer checklist';
        END IF;
        FOREACH v_key IN ARRAY v_required LOOP
            IF COALESCE((p_checklist->>v_key)::boolean, false) IS NOT TRUE THEN
                RAISE EXCEPTION 'QF_CHECKLIST_REQUIRED: checklist item "%" must be confirmed', v_key;
            END IF;
        END LOOP;
        -- QB-KEY-1 (087): a version without a valid answer key cannot be approved (early feedback).
        PERFORM public.fn_qf_assert_version_publishable(p_version_id);
    END IF;

    IF p_to IN ('CHANGES_REQUESTED', 'REJECTED') AND COALESCE(btrim(p_notes), '') = '' THEN
        RAISE EXCEPTION 'QF_NOTES_REQUIRED: % requires reviewer notes', p_to;
    END IF;

    PERFORM set_config('app.qf_lifecycle_write', 'on', true);

    UPDATE public.question_versions
    SET lifecycle_status = p_to,
        is_current = false
    WHERE id = p_version_id;

    -- Review record (internal; never candidate-readable).
    INSERT INTO public.question_version_authoring (version_id, origin)
    VALUES (p_version_id, 'LEGACY_UNKNOWN')
    ON CONFLICT (version_id) DO NOTHING;

    UPDATE public.question_version_authoring
    SET reviewed_by = CASE WHEN p_to IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN p_actor ELSE reviewed_by END,
        reviewed_at = CASE WHEN p_to IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN now() ELSE reviewed_at END,
        review_notes = CASE WHEN p_notes IS NOT NULL THEN p_notes ELSE review_notes END,
        authoring_metadata = CASE
            WHEN p_to = 'APPROVED' THEN authoring_metadata || jsonb_build_object('review_checklist', p_checklist)
            ELSE authoring_metadata
        END,
        updated_at = now()
    WHERE version_id = p_version_id;

    -- Question-level flag mirrors review state only while the question is not yet published.
    SELECT status INTO v_question_status FROM public.questions WHERE id = v_version.question_id FOR UPDATE;
    IF v_question_status IS DISTINCT FROM 'published' THEN
        UPDATE public.questions
        SET status = CASE WHEN p_to IN ('IN_REVIEW', 'APPROVED') THEN 'review' ELSE 'draft' END,
            updated_at = now()
        WHERE id = v_version.question_id;
    END IF;

    PERFORM set_config('app.qf_lifecycle_write', 'off', true);

    RETURN jsonb_build_object(
        'success', true,
        'version_id', p_version_id,
        'from', v_version.lifecycle_status,
        'to', p_to
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_qf_guard_mock_question_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.question_versions
        WHERE id = NEW.question_version_id
          AND lifecycle_status = 'PUBLISHED'
          AND is_current = true
    ) THEN
        RAISE EXCEPTION 'QF_UNPUBLISHED_VERSION_IN_TEST: question version % is not the current PUBLISHED version', NEW.question_version_id;
    END IF;
    -- QB-KEY-1 (087): mock assembly (generator, admin builder, dynamic mocks, daily quiz) serves only valid-key versions.
    IF NOT public.fn_qf_version_is_servable(NEW.question_version_id) THEN
        RAISE EXCEPTION 'QF_INVALID_KEY_IN_TEST: question version % has no valid answer key', NEW.question_version_id;
    END IF;
    -- QB-KEY-1 (087): a retired (archived) question is never added to a new mock either (decision #53).
    IF NOT EXISTS (SELECT 1 FROM public.question_versions v JOIN public.questions q ON q.id = v.question_id WHERE v.id = NEW.question_version_id AND q.status = 'published') THEN
        RAISE EXCEPTION 'QF_ARCHIVED_QUESTION_IN_TEST: the question of version % is not published', NEW.question_version_id;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_custom_practice_session(p_title text, p_session_mode text, p_topic_ids uuid[] DEFAULT NULL::uuid[], p_question_count integer DEFAULT 20, p_manual_question_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID;
    v_count INTEGER;
    v_version_ids UUID[];
    v_session_id UUID;
    v_weak_topic_ids UUID[];
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: User not authenticated');
    END IF;

    v_count := LEAST(GREATEST(p_question_count, 5), 100);

    IF p_session_mode = 'MANUAL_SELECTION' THEN
        IF p_manual_question_ids IS NULL OR array_length(p_manual_question_ids, 1) = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'No question IDs provided for manual selection');
        END IF;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE q.id = ANY(p_manual_question_ids)
              AND qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'BOOKMARKED' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.user_question_bookmarks uqb
            JOIN public.questions q ON q.id = uqb.question_id
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE uqb.user_id = v_user_id
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY uqb.created_at DESC
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'WRONG_QUESTIONS' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.attempt_answers aa
            JOIN public.test_attempts ta ON ta.id = aa.attempt_id
            JOIN public.mock_questions mq ON mq.id = aa.mock_question_id
            JOIN public.question_versions hv ON hv.id = mq.question_version_id
            JOIN public.questions q ON q.id = hv.question_id
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE ta.user_id = v_user_id
              AND aa.is_correct = false
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            GROUP BY qv.id
            ORDER BY COUNT(aa.id) DESC
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'WEAK_TOPICS' THEN
        SELECT ARRAY_AGG(canonical_topic_id) INTO v_weak_topic_ids
        FROM (
            SELECT canonical_topic_id
            FROM public.user_topic_mastery
            WHERE user_id = v_user_id
              AND (p_topic_ids IS NULL OR canonical_topic_id = ANY(p_topic_ids))
            ORDER BY mastery_score ASC, confidence_level ASC
            LIMIT 5
        ) wt;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (v_weak_topic_ids IS NOT NULL AND q.canonical_topic_id = ANY(v_weak_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'FORGOTTEN_TOPICS' THEN
        SELECT ARRAY_AGG(canonical_topic_id) INTO v_weak_topic_ids
        FROM (
            SELECT canonical_topic_id
            FROM public.user_topic_mastery
            WHERE user_id = v_user_id
              AND (p_topic_ids IS NULL OR canonical_topic_id = ANY(p_topic_ids))
            ORDER BY last_evaluated_at ASC
            LIMIT 5
        ) ft;

        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (v_weak_topic_ids IS NOT NULL AND q.canonical_topic_id = ANY(v_weak_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;

    ELSIF p_session_mode = 'PYQ' THEN
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT DISTINCT qv.id
            FROM public.question_sources qs
            JOIN public.questions q ON q.id = qs.question_id
            JOIN public.question_versions qv
              ON qv.question_id = q.id AND qv.is_current = true AND qv.lifecycle_status = 'PUBLISHED'
            WHERE qs.source_type = 'PYQ'
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY qv.id
            LIMIT v_count
        ) qv;

    ELSE
        SELECT ARRAY_AGG(qv.id) INTO v_version_ids
        FROM (
            SELECT qv.id
            FROM public.question_versions qv
            JOIN public.questions q ON q.id = qv.question_id
            WHERE qv.is_current = true
              AND qv.lifecycle_status = 'PUBLISHED'
              AND q.status = 'published' AND public.fn_qf_version_is_servable(qv.id)
              AND (p_topic_ids IS NULL OR q.canonical_topic_id = ANY(p_topic_ids))
            ORDER BY random()
            LIMIT v_count
        ) qv;
    END IF;

    IF v_version_ids IS NULL OR array_length(v_version_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No qualifying questions found for selected criteria');
    END IF;

    INSERT INTO public.custom_practice_sessions (
        user_id, title, session_mode, target_topic_ids_json,
        total_questions, question_version_ids_json, status, created_at
    ) VALUES (
        v_user_id, COALESCE(p_title, 'Custom Practice - ' || p_session_mode),
        p_session_mode, to_jsonb(p_topic_ids),
        array_length(v_version_ids, 1), to_jsonb(v_version_ids),
        'READY', now()
    ) RETURNING id INTO v_session_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session_id,
        'question_count', array_length(v_version_ids, 1),
        'question_version_ids', v_version_ids
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_mistake_drill(p_vault_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_cognitive_type_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_ids uuid[];
    v_questions jsonb;
    v_total integer;
    v_drill_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'error', 'Authentication required to generate a drill.');
    END IF;

    -- distinct ids, first-seen order, at most 20
    SELECT array_agg(d.id ORDER BY d.first_ord) INTO v_ids
    FROM (SELECT u.id, min(u.ord) AS first_ord
            FROM unnest(coalesce(p_vault_ids, '{}'::uuid[])) WITH ORDINALITY AS u(id, ord)
           WHERE u.id IS NOT NULL
           GROUP BY u.id) d;
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOTHING_TO_DRILL', 'error', 'No eligible mistakes to drill.');
    END IF;
    IF cardinality(v_ids) > 20 THEN
        v_ids := v_ids[1:20];
    END IF;

    -- ownership: every requested vault row must belong to the caller
    IF EXISTS (SELECT 1 FROM unnest(v_ids) AS i(id)
                WHERE NOT EXISTS (SELECT 1 FROM public.user_mistake_vault v WHERE v.id = i.id AND v.user_id = v_user_id)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'error', 'A requested mistake does not belong to you.');
    END IF;

    -- pre-submit projection: no correct key, no explanation (PublicDrillQuestion shape)
    SELECT jsonb_agg(s.item ORDER BY s.ord) INTO v_questions
    FROM (
        SELECT u.ord,
               jsonb_build_object(
                   'vault_id', v.id,
                   'question_id', v.question_id,
                   'question_version_id', qv.id,
                   'question_text', coalesce(qv.question_text, ''),
                   'primary_cognitive_type_id', v.primary_cognitive_type_id,
                   'consecutive_correct', v.consecutive_correct_in_remediation,
                   'options', coalesce((
                       SELECT jsonb_agg(jsonb_build_object(
                                  'id', o.id, 'option_key', o.option_key, 'content_text', o.option_text,
                                  'option_text', o.option_text, 'option_order', coalesce(o.order_index, 0))
                              ORDER BY o.order_index NULLS LAST, o.option_key)
                         FROM public.question_options o WHERE o.question_version_id = qv.id), '[]'::jsonb),
                   'context', jsonb_build_object(
                       'cognitive_type_name', coalesce(ct.name, v.primary_cognitive_type_id),
                       'total_mistakes_count', v.total_mistakes_count,
                       'consecutive_correct', v.consecutive_correct_in_remediation,
                       'last_mistake_at', v.last_mistake_at,
                       'user_custom_notes', v.user_custom_notes)
               ) AS item
          FROM unnest(v_ids) WITH ORDINALITY AS u(id, ord)
          JOIN public.user_mistake_vault v ON v.id = u.id AND v.user_id = v_user_id
          JOIN public.questions q ON q.id = v.question_id AND q.status = 'published'
          JOIN public.question_versions qv ON qv.question_id = q.id AND qv.is_current AND qv.lifecycle_status = 'PUBLISHED'
          LEFT JOIN public.mistake_cognitive_types ct ON ct.id = v.primary_cognitive_type_id
         WHERE public.fn_qf_version_is_servable(qv.id) -- QB-KEY-1 (087): shared valid-key predicate
    ) s;

    v_total := coalesce(jsonb_array_length(v_questions), 0);
    IF v_total < 1 THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOTHING_TO_DRILL', 'error', 'None of the selected mistakes has a gradable published question.');
    END IF;

    INSERT INTO public.user_mistake_drills (user_id, topic_id, cognitive_type_id, total_questions, questions_data, status)
    VALUES (v_user_id, p_topic_id, p_cognitive_type_id, v_total, v_questions, 'IN_PROGRESS')
    RETURNING id INTO v_drill_id;

    RETURN jsonb_build_object('success', true, 'drill_id', v_drill_id, 'total_questions', v_total, 'questions', v_questions);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_find_or_create_battle_room(p_topic_id uuid DEFAULT NULL::uuid, p_is_private boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_room_code TEXT;
    v_q_ids UUID[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Ensure initial user_battle_stats exists
    INSERT INTO public.user_battle_stats (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- If public matchmaking, attempt to find an open waiting room
    IF NOT p_is_private THEN
        SELECT id, room_code INTO v_room_id, v_room_code
        FROM public.quiz_battle_rooms
        WHERE status = 'WAITING'
          AND is_private = false
          AND (p_topic_id IS NULL OR topic_id = p_topic_id)
          AND created_by_user_id != v_user_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF FOUND THEN
            -- Join this room
            INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
            VALUES (v_room_id, v_user_id, true)
            ON CONFLICT (room_id, user_id) DO NOTHING;

            -- Transition room to READY and start countdown
            UPDATE public.quiz_battle_rooms
            SET status = 'COUNTDOWN',
                current_round = 1,
                round_started_at = now() + INTERVAL '5 seconds',
                round_ends_at = now() + INTERVAL '5 seconds' + (time_per_question_seconds * INTERVAL '1 second'),
                updated_at = now()
            WHERE id = v_room_id;

            RETURN jsonb_build_object(
                'success', true,
                'room_id', v_room_id,
                'room_code', v_room_code,
                'action', 'JOINED',
                'status', 'COUNTDOWN',
                'countdown_seconds', 5
            );
        END IF;
    END IF;

    -- Select 5 random active questions from Phase 3A
    SELECT array_agg(id) INTO v_q_ids
    FROM (
        SELECT id FROM public.questions
        WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
          AND (p_topic_id IS NULL OR canonical_topic_id = p_topic_id)
        ORDER BY random()
        LIMIT 5
    ) q_sample;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        -- Fallback to any published questions if specific topic has < 5
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
            ORDER BY random()
            LIMIT 5
        ) q_fallback;
    END IF;

    IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient questions available for battle');
    END IF;

    -- Generate cryptographically safe 6-char room code
    v_room_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    INSERT INTO public.quiz_battle_rooms (
        room_code, battle_type, topic_id, created_by_user_id,
        is_private, max_participants, total_rounds, time_per_question_seconds,
        question_ids, status
    ) VALUES (
        v_room_code, '1v1', p_topic_id, v_user_id,
        p_is_private, 2, array_length(v_q_ids, 1), 15,
        v_q_ids, 'WAITING'
    ) RETURNING id INTO v_room_id;

    INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
    VALUES (v_room_id, v_user_id, true);

    RETURN jsonb_build_object(
        'success', true,
        'room_id', v_room_id,
        'room_code', v_room_code,
        'action', 'CREATED',
        'status', 'WAITING'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_find_or_create_battle_room(p_topic_id uuid DEFAULT NULL::uuid, p_is_private boolean DEFAULT false, p_access_tier text DEFAULT 'FREE'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_id UUID;
    v_room_code TEXT;
    v_q_ids UUID[];
    v_is_pro BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
    END IF;

    -- Entitlement verification for PRO battles (Phase 3I)
    IF p_access_tier = 'PRO' THEN
        SELECT (status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > now())) INTO v_is_pro
        FROM public.user_entitlements
        WHERE user_id = v_user_id
        ORDER BY created_at DESC
        LIMIT 1;

        IF NOT COALESCE(v_is_pro, false) THEN
            RETURN jsonb_build_object('success', false, 'error', 'PRO entitlement required for this battle arena');
        END IF;
    END IF;

    -- Ensure initial user_battle_stats exists
    INSERT INTO public.user_battle_stats (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- If public matchmaking, attempt to find an open waiting room
    IF NOT p_is_private THEN
        SELECT id, room_code INTO v_room_id, v_room_code
        FROM public.quiz_battle_rooms
        WHERE status = 'WAITING'
          AND is_private = false
          AND access_tier = p_access_tier
          AND (p_topic_id IS NULL AND topic_id IS NULL OR topic_id = p_topic_id)
          AND created_by_user_id != v_user_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF FOUND THEN
            -- Join this room
            INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
            VALUES (v_room_id, v_user_id, true)
            ON CONFLICT (room_id, user_id) DO NOTHING;

            -- Transition room to READY and start countdown
            UPDATE public.quiz_battle_rooms
            SET status = 'COUNTDOWN',
                current_round = 1,
                round_started_at = now() + INTERVAL '5 seconds',
                round_ends_at = now() + INTERVAL '5 seconds' + (time_per_question_seconds * INTERVAL '1 second'),
                updated_at = now()
            WHERE id = v_room_id;

            RETURN jsonb_build_object(
                'success', true,
                'room_id', v_room_id,
                'room_code', v_room_code,
                'action', 'JOINED',
                'status', 'COUNTDOWN',
                'countdown_seconds', 5
            );
        END IF;
    END IF;

    -- Strict question pool selection: If topic requested, must have >= 3 questions in topic
    IF p_topic_id IS NOT NULL THEN
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
              AND canonical_topic_id = p_topic_id
            ORDER BY random()
            LIMIT 5
        ) q_sample;

        IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 3 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient active questions available for requested topic');
        END IF;
    ELSE
        -- Global / random battle pool
        SELECT array_agg(id) INTO v_q_ids
        FROM (
            SELECT id FROM public.questions
            WHERE status = 'published'
          AND EXISTS (SELECT 1 FROM public.question_versions sv WHERE sv.question_id = questions.id AND sv.is_current AND public.fn_qf_version_is_servable(sv.id))
            ORDER BY random()
            LIMIT 5
        ) q_global;

        IF v_q_ids IS NULL OR array_length(v_q_ids, 1) < 3 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient active questions available in global pool');
        END IF;
    END IF;

    -- Generate cryptographically safe 6-char room code
    v_room_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

    INSERT INTO public.quiz_battle_rooms (
        room_code, battle_type, topic_id, created_by_user_id,
        is_private, access_tier, max_participants, total_rounds, time_per_question_seconds,
        question_ids, status
    ) VALUES (
        v_room_code, '1v1', p_topic_id, v_user_id,
        p_is_private, p_access_tier, 2, array_length(v_q_ids, 1), 15,
        v_q_ids, 'WAITING'
    ) RETURNING id INTO v_room_id;

    INSERT INTO public.quiz_battle_participants (room_id, user_id, is_ready)
    VALUES (v_room_id, v_user_id, true);

    RETURN jsonb_build_object(
        'success', true,
        'room_id', v_room_id,
        'room_code', v_room_code,
        'action', 'CREATED',
        'status', 'WAITING'
    );
END;
$function$;
