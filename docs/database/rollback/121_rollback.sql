-- Rollback for 20261028000121_lesson_prompt_2.sql. Run as ONE transaction by the operator.
-- Safe only while no prompt template uses the v2 slots (retire / delete LESSON v2 first) and no subject is REASONING.
BEGIN;

DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes WHERE subject_type = 'REASONING') THEN
    RAISE EXCEPTION 'ROLLBACK 121: REASONING subjects exist; change their subject type first';
  END IF;
END $chk$;

CREATE OR REPLACE FUNCTION public.fn_prompt_template_problems(p_type text, p_body text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_allowed  text[];
    v_required text[];
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
            v_allowed := ARRAY['NODE_NAME', 'NODE_PATH', 'NODE_LEVEL', 'SUBJECT_NAME', 'SUBJECT_TYPE', 'EXAM_COVERAGE', 'CHILD_NODES', 'ALIASES',
                               'EXISTING_LESSONS', 'BLOCK_SPEC', 'EXAMPLE_JSON', 'MIN_EXAMPLES', 'MAX_EXAMPLES', 'MIN_QUICK_CHECKS'];
            v_required := ARRAY['NODE_NAME', 'NODE_PATH', 'EXAM_COVERAGE', 'BLOCK_SPEC', 'EXAMPLE_JSON'];
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
$fn$;

ALTER TABLE public.canonical_taxonomy_nodes DROP CONSTRAINT chk_canonical_subject_type;
ALTER TABLE public.canonical_taxonomy_nodes ADD CONSTRAINT chk_canonical_subject_type CHECK (
    subject_type IS NULL
    OR (node_type = 'SUBJECT'
        AND subject_type IN ('APTITUDE', 'LANGUAGE', 'GK_GA', 'TECHNICAL', 'PEDAGOGY', 'STATE_SPECIFIC')));

COMMIT;
