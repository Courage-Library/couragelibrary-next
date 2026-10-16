-- =============================================================================
-- COURAGE LIBRARY — DRILL-1: SERVER-AUTHORITATIVE MISTAKE DRILLS (generate / submit RPCs)
-- Migration: 20261016000085_drill1_server_authoritative_drills.sql
--
-- Finding DRILL-WRITES (SEC_HOTFIX7_REPORT §3.1): since 067 `authenticated` holds only SELECT on
-- user_mistake_drills, so the app's direct session-client writes always failed. Architect ruling: every student
-- drill write goes through SECURITY DEFINER RPCs that derive the user from auth.uid(); NO table write is granted
-- to authenticated / anon (decisions #39, #42). Functions + grants only — no table, column or policy change.
--
-- fn_generate_mistake_drill — SIGNATURE REPLACED (old: (uuid, text, integer), selection by last_mistake_at only)
--   new: (p_vault_ids uuid[], p_topic_id uuid, p_cognitive_type_id text). The app keeps its ranking (focus modes,
--   MPI / due state / fatigue, bookmarks — all read-only on the caller's own rows) and passes the ordered vault ids;
--   the RPC enforces: caller = auth.uid(); every vault id belongs to the caller (else FORBIDDEN, nothing written);
--   ≤ 20 questions; only published questions' current PUBLISHED version that HAS an answer (no ungradable item is
--   ever drilled); the stored + returned payload carries no correct key / explanation; empty → NOTHING_TO_DRILL
--   (no row). Pre-submit shape = services/mistakes/drill-payload.ts PublicDrillQuestion.
-- fn_submit_mistake_drill(uuid, jsonb) — body replaced (same signature):
--   caller must own the drill; IN_PROGRESS only (COMPLETED → the STORED result is returned, idempotent, no second
--   mutation; other states → NOT_OPEN); grading iterates the DRILL's questions (never the client list: extra or
--   duplicated answers are ignored), resolves the selected option against the COMPILED version's options, compares
--   with question_answers of that version; client correctness / score fields are ignored; unanswered = incorrect
--   (the UI contract: "Unanswered questions will be counted as incorrect and reset your streak"); vault effects as
--   the app defined them (correct: streak + 1, ≥ 2 → MASTERED else REVISITING; incorrect: streak 0, UNRESOLVED,
--   mistakes + 1, occurrence logged); every write is row-count checked (a no-op raises DRILL_WRITE_FAILED);
--   coins_awarded = 0 and NO reward function is called (reward wiring: Commerce, TYPES-1:B-DRILL-REWARD-ARGS);
--   explanations are returned (and stored with the completed drill) only after submission.
-- Both: SECURITY DEFINER, search_path '', fully qualified; EXECUTE authenticated only (revoked from PUBLIC, anon,
-- service_role). Rollback: docs/database/rollback/085_rollback.sql (order: 085 → 084 → 083 → …).
-- =============================================================================

CREATE TEMP TABLE drill1_counts ON COMMIT DROP AS
SELECT (SELECT count(*) FROM public.user_mistake_drills) AS drills,
       (SELECT count(*) FROM public.user_mistake_vault) AS vault,
       (SELECT count(*) FROM public.user_mistake_occurrences) AS occ;

DROP FUNCTION public.fn_generate_mistake_drill(uuid, text, integer);

CREATE FUNCTION public.fn_generate_mistake_drill(p_vault_ids uuid[], p_topic_id uuid DEFAULT NULL, p_cognitive_type_id text DEFAULT NULL)
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
         WHERE EXISTS (SELECT 1 FROM public.question_answers a WHERE a.question_version_id = qv.id)
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

CREATE OR REPLACE FUNCTION public.fn_submit_mistake_drill(p_drill_id uuid, p_answers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_drill record;
    v_q jsonb;
    v_ans jsonb;
    v_version_id uuid;
    v_sel_opt uuid;
    v_sel_key text;
    v_correct text;
    v_expl text;
    v_is_correct boolean;
    v_ungradable boolean;
    v_vault record;
    v_prev integer;
    v_new integer;
    v_status text;
    v_rt integer;
    v_rows integer;
    v_correct_count integer := 0;
    v_mastered integer := 0;
    v_revisiting integer := 0;
    v_unresolved integer := 0;
    v_total integer;
    v_eval jsonb;
    v_evals jsonb := '[]'::jsonb;
    v_stored jsonb := '[]'::jsonb;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'AUTH_REQUIRED', 'error', 'Authentication required to submit a drill.');
    END IF;

    SELECT d.id, d.status, d.total_questions, d.topic_id, d.questions_data, d.correct_count, d.mistakes_resolved_count, d.coins_awarded
      INTO v_drill
      FROM public.user_mistake_drills d
     WHERE d.id = p_drill_id AND d.user_id = v_user_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'error', 'Drill session not found.');
    END IF;

    -- idempotent: a completed drill returns its stored result; nothing is written again
    IF v_drill.status = 'COMPLETED' THEN
        SELECT coalesce(jsonb_agg(x.e -> 'evaluation' ORDER BY x.o), '[]'::jsonb) INTO v_evals
          FROM jsonb_array_elements(v_drill.questions_data) WITH ORDINALITY AS x(e, o)
         WHERE x.e ? 'evaluation';
        v_total := v_drill.total_questions;
        RETURN jsonb_build_object(
            'success', true, 'idempotent', true, 'drill_id', v_drill.id,
            'summary', jsonb_build_object(
                'total_questions', v_total,
                'correct_count', v_drill.correct_count,
                'accuracy_pct', CASE WHEN v_total > 0 THEN round(v_drill.correct_count * 100.0 / v_total, 1) ELSE 0 END,
                'mastered_count', v_drill.mistakes_resolved_count,
                'revisiting_count', (SELECT count(*) FROM jsonb_array_elements(v_evals) e WHERE e ->> 'new_status' = 'REVISITING' AND (e ->> 'is_correct')::boolean),
                'unresolved_count', (SELECT count(*) FROM jsonb_array_elements(v_evals) e
                                      WHERE NOT coalesce((e ->> 'is_correct')::boolean, false) AND NOT coalesce((e ->> 'ungradable')::boolean, false)),
                'coins_awarded', v_drill.coins_awarded),
            'evaluations', v_evals);
    END IF;
    IF v_drill.status <> 'IN_PROGRESS' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_OPEN', 'error', 'This drill session is no longer open.');
    END IF;
    IF p_answers IS NOT NULL AND jsonb_typeof(p_answers) <> 'array' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_ANSWERS', 'error', 'Answers must be a list.');
    END IF;

    v_total := jsonb_array_length(v_drill.questions_data);

    -- grade the DRILL's questions (client-sent correctness / score are never read)
    FOR v_q IN SELECT x.e FROM jsonb_array_elements(v_drill.questions_data) WITH ORDINALITY AS x(e, o) ORDER BY x.o
    LOOP
        v_version_id := nullif(v_q ->> 'question_version_id', '')::uuid;
        v_sel_opt := NULL;
        v_sel_key := NULL;
        v_rt := NULL;

        SELECT y.a INTO v_ans
          FROM jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) WITH ORDINALITY AS y(a, i)
         WHERE jsonb_typeof(y.a) = 'object' AND y.a ->> 'question_id' = v_q ->> 'question_id'
         ORDER BY y.i LIMIT 1;

        IF v_ans IS NOT NULL THEN
            -- the selected option must be one of the compiled version's options (by id when sent, else by key)
            IF nullif(v_ans ->> 'selected_option_id', '') IS NOT NULL THEN
                SELECT o.id, o.option_key INTO v_sel_opt, v_sel_key
                  FROM public.question_options o
                 WHERE o.question_version_id = v_version_id AND o.id::text = v_ans ->> 'selected_option_id';
            ELSIF nullif(v_ans ->> 'selected_option_key', '') IS NOT NULL THEN
                SELECT o.id, o.option_key INTO v_sel_opt, v_sel_key
                  FROM public.question_options o
                 WHERE o.question_version_id = v_version_id AND o.option_key = v_ans ->> 'selected_option_key';
            END IF;
            IF jsonb_typeof(v_ans -> 'response_time_seconds') = 'number' THEN
                v_rt := greatest(0, round((v_ans ->> 'response_time_seconds')::numeric))::integer;
            END IF;
        END IF;

        v_correct := NULL;
        v_expl := NULL;
        SELECT a.correct_option_key, a.explanation_md INTO v_correct, v_expl
          FROM public.question_answers a WHERE a.question_version_id = v_version_id;
        v_ungradable := v_correct IS NULL;
        v_is_correct := NOT v_ungradable AND v_sel_key IS NOT NULL AND v_sel_key = v_correct;

        SELECT v.id, v.consecutive_correct_in_remediation, v.total_mistakes_count, v.lifecycle_status INTO v_vault
          FROM public.user_mistake_vault v
         WHERE v.id = nullif(v_q ->> 'vault_id', '')::uuid AND v.user_id = v_user_id
           FOR UPDATE;

        v_prev := coalesce(v_vault.consecutive_correct_in_remediation, 0);
        v_new := v_prev;
        v_status := coalesce(v_vault.lifecycle_status, 'UNRESOLVED');

        IF v_ungradable THEN
            NULL; -- no answer key for the compiled version: never graded, never mutates the vault
        ELSIF v_is_correct THEN
            v_correct_count := v_correct_count + 1;
            v_new := v_prev + 1;
            IF v_new >= 2 THEN
                v_status := 'MASTERED';
                v_mastered := v_mastered + 1;
            ELSE
                v_status := 'REVISITING';
                v_revisiting := v_revisiting + 1;
            END IF;
            IF v_vault.id IS NOT NULL THEN
                UPDATE public.user_mistake_vault
                   SET consecutive_correct_in_remediation = v_new,
                       lifecycle_status = v_status,
                       last_practiced_at = now(),
                       mastered_at = CASE WHEN v_status = 'MASTERED' THEN now() ELSE NULL END,
                       updated_at = now()
                 WHERE id = v_vault.id AND user_id = v_user_id;
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: vault update affected % rows', v_rows; END IF;
            END IF;
        ELSE
            v_unresolved := v_unresolved + 1;
            v_new := 0;
            v_status := 'UNRESOLVED';
            IF v_vault.id IS NOT NULL THEN
                UPDATE public.user_mistake_vault
                   SET consecutive_correct_in_remediation = 0,
                       lifecycle_status = 'UNRESOLVED',
                       total_mistakes_count = coalesce(v_vault.total_mistakes_count, 0) + 1,
                       last_mistake_at = now(),
                       last_practiced_at = now(),
                       updated_at = now()
                 WHERE id = v_vault.id AND user_id = v_user_id;
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: vault update affected % rows', v_rows; END IF;

                INSERT INTO public.user_mistake_occurrences (
                    vault_id, user_id, question_id, question_version_id, source_context, source_reference_id,
                    selected_option_id, response_time_seconds, occurred_at)
                VALUES (v_vault.id, v_user_id, (v_q ->> 'question_id')::uuid, v_version_id, 'MISTAKE_DRILL', p_drill_id,
                        v_sel_opt, v_rt, now());
            END IF;
        END IF;

        v_eval := jsonb_build_object(
            'question_id', v_q ->> 'question_id',
            'question_text', coalesce(v_q ->> 'question_text', ''),
            'options', coalesce(v_q -> 'options', '[]'::jsonb),
            'selected_option_key', v_sel_key,
            'correct_option_key', v_correct,
            'is_correct', v_is_correct,
            'ungradable', v_ungradable,
            'explanation', v_expl,
            'previous_consecutive', v_prev,
            'new_consecutive', v_new,
            'new_status', v_status);
        v_evals := v_evals || jsonb_build_array(v_eval);
        v_stored := v_stored || jsonb_build_array(v_q || jsonb_build_object('evaluation', v_eval));
    END LOOP;

    -- complete the drill (row-count checked; coins_awarded stays 0 — no reward function is called)
    UPDATE public.user_mistake_drills
       SET status = 'COMPLETED',
           correct_count = v_correct_count,
           mistakes_resolved_count = v_mastered,
           coins_awarded = 0,
           questions_data = v_stored,
           completed_at = now(),
           updated_at = now()
     WHERE id = p_drill_id AND user_id = v_user_id AND status = 'IN_PROGRESS';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN RAISE EXCEPTION 'DRILL_WRITE_FAILED: drill completion affected % rows', v_rows; END IF;

    -- learning activity (as the previous RPC did), only for topic-scoped drills
    IF v_drill.topic_id IS NOT NULL THEN
        INSERT INTO public.learning_activity_events (user_id, topic_id, resource_slug, event_type, time_spent_seconds, metadata, occurred_at)
        VALUES (v_user_id, v_drill.topic_id, 'mistake-drill-' || p_drill_id, 'TOPIC_LEARNING_ACTIVITY', NULL,
                jsonb_build_object('activity_type', 'MISTAKE_DRILL', 'drill_id', p_drill_id, 'score', v_correct_count), now());
    END IF;

    RETURN jsonb_build_object(
        'success', true, 'idempotent', false, 'drill_id', p_drill_id,
        'summary', jsonb_build_object(
            'total_questions', v_total,
            'correct_count', v_correct_count,
            'accuracy_pct', CASE WHEN v_total > 0 THEN round(v_correct_count * 100.0 / v_total, 1) ELSE 0 END,
            'mastered_count', v_mastered,
            'revisiting_count', v_revisiting,
            'unresolved_count', v_unresolved,
            'coins_awarded', 0),
        'evaluations', v_evals);
END;
$function$;

-- EXECUTE: authenticated only
REVOKE ALL ON FUNCTION public.fn_generate_mistake_drill(uuid[], uuid, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.fn_submit_mistake_drill(uuid, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_generate_mistake_drill(uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_submit_mistake_drill(uuid, jsonb) TO authenticated;

-- Proof ----------------------------------------------------------------------------------------------
DO $$
DECLARE
    c record;
    f regprocedure;
    r record;
    v_bad text := '';
BEGIN
    SELECT * INTO c FROM pg_temp.drill1_counts;
    IF (SELECT count(*) FROM public.user_mistake_drills) <> c.drills OR (SELECT count(*) FROM public.user_mistake_vault) <> c.vault
       OR (SELECT count(*) FROM public.user_mistake_occurrences) <> c.occ THEN
        RAISE EXCEPTION 'DRILL1_PROOF: data changed';
    END IF;
    IF to_regprocedure('public.fn_generate_mistake_drill(uuid,text,integer)') IS NOT NULL THEN
        RAISE EXCEPTION 'DRILL1_PROOF: the old generate signature still exists';
    END IF;
    FOREACH f IN ARRAY ARRAY['public.fn_generate_mistake_drill(uuid[],uuid,text)'::regprocedure, 'public.fn_submit_mistake_drill(uuid,jsonb)'::regprocedure]
    LOOP
        IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = f) THEN v_bad := v_bad || f::text || ':not-definer '; END IF;
        IF NOT (SELECT coalesce(proconfig, '{}') @> ARRAY['search_path=""'] FROM pg_proc WHERE oid = f) THEN v_bad := v_bad || f::text || ':search_path '; END IF;
        IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('service_role', f, 'EXECUTE')
           OR NOT has_function_privilege('authenticated', f, 'EXECUTE')
           OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid = f AND a.grantee = 0) THEN
            v_bad := v_bad || f::text || ':acl ';
        END IF;
        IF (SELECT prosrc FROM pg_proc WHERE oid = f) ~* 'fn_award_gamification_reward' THEN v_bad := v_bad || f::text || ':reward-call '; END IF;
    END LOOP;
    -- no table write for students (decision #39 / #42)
    FOR r IN SELECT t, x FROM unnest(ARRAY['user_mistake_drills','user_mistake_vault','user_mistake_occurrences']) t,
                         unnest(ARRAY['anon','authenticated']) x
    LOOP
        IF has_table_privilege(r.x, ('public.' || r.t)::regclass, 'INSERT') OR has_table_privilege(r.x, ('public.' || r.t)::regclass, 'UPDATE')
           OR has_table_privilege(r.x, ('public.' || r.t)::regclass, 'DELETE') THEN
            v_bad := v_bad || r.t || ':' || r.x || '-write ';
        END IF;
    END LOOP;
    -- P-9 invariants
    FOR r IN SELECT p.oid::regprocedure::text sig, p.proname, pg_get_function_result(p.oid) ret,
                    has_function_privilege('anon', p.oid, 'EXECUTE') anon_x,
                    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') public_x,
                    EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) cf WHERE cf LIKE 'search_path=%') sp
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    LOOP
        IF r.ret <> 'trigger' AND (r.anon_x OR r.public_x) AND r.proname <> 'fn_exam_syllabus_read_model' THEN v_bad := v_bad || r.sig || ':exposed '; END IF;
        IF NOT r.sp THEN v_bad := v_bad || r.sig || ':no-search_path '; END IF;
    END LOOP;
    IF v_bad <> '' THEN RAISE EXCEPTION 'DRILL1_PROOF: %', v_bad; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
