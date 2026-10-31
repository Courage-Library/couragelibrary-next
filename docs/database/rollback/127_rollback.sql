-- 127 rollback (EXAM-NOTE-PROMPT-1) — restores the PRE-127 definitions byte-exactly (pg_get_functiondef dumps taken
-- 2026-10-31 before the apply) and the template_type CHECK without EXAM_NOTE. EXAM_NOTE template rows are deleted first
-- (their PROMPT_TEMPLATE_* audit rows stay). Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).

DELETE FROM public.prompt_templates WHERE template_type = 'EXAM_NOTE';

ALTER TABLE public.prompt_templates DROP CONSTRAINT prompt_templates_template_type_check;
ALTER TABLE public.prompt_templates ADD CONSTRAINT prompt_templates_template_type_check
    CHECK (template_type = ANY (ARRAY['SYLLABUS'::text, 'LESSON'::text, 'QUESTION'::text, 'TRANSLATE_HI'::text]));

CREATE OR REPLACE FUNCTION public.fn_prompt_template_problems(p_type text, p_body text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_allowed  text[];
    v_required text[];
    v_any      text[] := '{}';  -- LESSON-PROMPT-2: groups "A|B" — at least one of each must appear
    v_p        text[] := '{}';
    v_slots    text[];
    v_open     text;
    m          record;
    s          text;
BEGIN
    IF p_body IS NULL OR btrim(p_body) = '' THEN RETURN ARRAY['The template is empty.']; END IF;
    CASE p_type
        WHEN 'SYLLABUS' THEN
            v_allowed := ARRAY['EXAM_NAME', 'EXAM_SLUG', 'CYCLE', 'TIER', 'TIER_JSON'];
            v_required := ARRAY['EXAM_NAME', 'EXAM_SLUG', 'CYCLE', 'TIER_JSON'];
        WHEN 'LESSON' THEN
            v_allowed := ARRAY['NODE_NAME', 'NODE_PATH', 'NODE_LEVEL', 'SUBJECT_NAME', 'SUBJECT_TYPE', 'EXAM_COVERAGE', 'CHILD_NODES', 'ALIASES', 'EXISTING_LESSONS',
                               'BLOCK_SPEC', 'EXAMPLE_JSON', 'MIN_EXAMPLES', 'MAX_EXAMPLES', 'MIN_QUICK_CHECKS', 'CHILDREN', 'EXAM_LINES', 'EXAMPLE_FOR_SUBJECT_TYPE',
                               'APTITUDE', 'REASONING', 'LANGUAGE', 'GK_GA', 'TECHNICAL', 'PEDAGOGY'];
            v_required := ARRAY['NODE_NAME', 'NODE_PATH', 'BLOCK_SPEC'];
            v_any := ARRAY['EXAM_COVERAGE|EXAM_LINES', 'EXAMPLE_JSON|EXAMPLE_FOR_SUBJECT_TYPE'];
        WHEN 'QUESTION' THEN
            v_allowed := ARRAY['TOPIC_NAME', 'TOPIC_PATH', 'EXAM_COVERAGE', 'QUESTION_SPEC', 'COUNT'];
            v_required := ARRAY['TOPIC_NAME', 'QUESTION_SPEC'];
        WHEN 'TRANSLATE_HI' THEN
            v_allowed := ARRAY['LESSON_TITLE', 'GLOSSARY', 'EN_JSON', 'BLOCK_RULES'];
            v_required := ARRAY['GLOSSARY', 'EN_JSON', 'BLOCK_RULES'];
        ELSE
            RETURN ARRAY['Unknown template type.'];
    END CASE;
    IF char_length(p_body) > 20000 THEN v_p := v_p || 'At most 20000 characters.'::text; END IF;
    IF p_body ~ ('[' || chr(1) || '-' || chr(8) || chr(11) || '-' || chr(31) || chr(127) || ']') THEN
        v_p := v_p || 'Control characters are not allowed.'::text;
    END IF;
    v_slots := ARRAY(SELECT DISTINCT x[2] FROM regexp_matches(p_body, '\{\{([#/]?)([A-Za-z_]+)\}\}', 'g') AS x);
    FOREACH s IN ARRAY v_slots LOOP
        IF NOT s = ANY (v_allowed) THEN v_p := v_p || format('Unknown placeholder {{%s}} for %s.', s, p_type); END IF;
    END LOOP;
    FOREACH s IN ARRAY v_required LOOP
        IF NOT s = ANY (v_slots) THEN v_p := v_p || format('Required placeholder {{%s}} is missing.', s); END IF;
    END LOOP;
    FOREACH s IN ARRAY v_any LOOP
        IF NOT (string_to_array(s, '|') && v_slots) THEN
            v_p := v_p || format('One of %s is required.', (SELECT string_agg('{{' || x || '}}', ' / ' ORDER BY o) FROM unnest(string_to_array(s, '|')) WITH ORDINALITY AS u(x, o)));
        END IF;
    END LOOP;
    FOR m IN SELECT x[1] AS kind, x[2] AS name FROM regexp_matches(p_body, '\{\{([#/]?)([A-Za-z_]+)\}\}', 'g') WITH ORDINALITY AS t(x, n) ORDER BY n LOOP
        IF m.kind = '#' THEN
            IF v_open IS NOT NULL THEN v_p := v_p || format('Section {{#%s}} is inside {{#%s}} (no nesting).', m.name, v_open); END IF;
            v_open := m.name;
        ELSIF m.kind = '/' THEN
            IF v_open IS DISTINCT FROM m.name THEN v_p := v_p || format('{{/%s}} closes nothing.', m.name); END IF;
            v_open := NULL;
        END IF;
    END LOOP;
    IF v_open IS NOT NULL THEN v_p := v_p || format('Section {{#%s}} is not closed.', v_open); END IF;
    RETURN v_p;
END
$function$;

CREATE OR REPLACE FUNCTION public.fn_prompt_template_save_draft(p_type text, p_body text, p_notes text, p_actor_id uuid, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_row public.prompt_templates%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_type NOT IN ('SYLLABUS', 'LESSON', 'QUESTION', 'TRANSLATE_HI') THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: unknown template type' USING ERRCODE = '22023'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('prompt_template:' || p_type, 0));
    UPDATE public.prompt_templates SET body = p_body, notes = NULLIF(btrim(coalesce(p_notes, '')), '')
     WHERE template_type = p_type AND status = 'DRAFT'
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
        INSERT INTO public.prompt_templates (template_type, version, body, status, notes, created_by, created_by_email)
        SELECT p_type, coalesce(max(version), 0) + 1, p_body, 'DRAFT', NULLIF(btrim(coalesce(p_notes, '')), ''), p_actor_id, p_actor_email
          FROM public.prompt_templates WHERE template_type = p_type
        RETURNING * INTO v_row;
    END IF;
    PERFORM public.fn_prompt_template_audit(p_actor_id, p_actor_email, 'PROMPT_TEMPLATE_DRAFT_SAVE', v_row.id,
        jsonb_build_object('template_type', p_type, 'version', v_row.version, 'body_sha256', v_row.body_sha256, 'chars', char_length(p_body)));
    RETURN jsonb_build_object('id', v_row.id, 'version', v_row.version, 'body_sha256', v_row.body_sha256);
END
$function$;

DO $proof$
BEGIN
    IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_prompt_template_problems(text, text)'::regprocedure)) <> 'f98a6470f96d5b5a3165a1bd22fe341c'
       OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.fn_prompt_template_save_draft(text, text, text, uuid, text)'::regprocedure)) <> 'ecf297abebcb8b546bbe1b491857c882' THEN
        RAISE EXCEPTION '127_ROLLBACK: the restored bodies are not the pre-127 ones';
    END IF;
END
$proof$;
