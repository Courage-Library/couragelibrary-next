-- =====================================================================================================================
-- 121 LESSON-PROMPT-2 (owner review: the v1 lesson prompt is maths-shaped) — the template checker learns LESSON v2.
-- CONDITIONAL GO rules + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/121_rollback.sql. No BEGIN / COMMIT.
--   fn_prompt_template_problems — redefined (same signature, grants, IMMUTABLE INVOKER): LESSON also allows the v2 slots
--     CHILDREN / EXAM_LINES / EXAMPLE_FOR_SUBJECT_TYPE and the subject-type sections ({{#APTITUDE}}…) and requires
--     NODE_NAME + NODE_PATH + BLOCK_SPEC + one of (EXAM_COVERAGE | EXAM_LINES) + one of (EXAMPLE_JSON |
--     EXAMPLE_FOR_SUBJECT_TYPE) — so the retired v1 stays valid. = lib/prompts/template.ts.
--   canonical_taxonomy_nodes.subject_type — + REASONING (the owner's template has a REASONING section).
-- The v2 TEXT is not seeded here: it is saved as a DRAFT and activated through the audited RPCs
-- (scripts/content/lesson-prompt-2.cjs), exactly as an admin would in /admin/prompts.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF to_regprocedure('public.fn_prompt_template_problems(text, text)') IS NULL THEN RAISE EXCEPTION 'LP2_PREFLIGHT: 119 is not applied'; END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.fn_prompt_template_problems(p_type text, p_body text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

ALTER TABLE public.canonical_taxonomy_nodes DROP CONSTRAINT chk_canonical_subject_type;
ALTER TABLE public.canonical_taxonomy_nodes ADD CONSTRAINT chk_canonical_subject_type CHECK (
    subject_type IS NULL
    OR (node_type = 'SUBJECT'
        AND subject_type IN ('APTITUDE', 'REASONING', 'LANGUAGE', 'GK_GA', 'TECHNICAL', 'PEDAGOGY', 'STATE_SPECIFIC')));

DO $proof$
BEGIN
    IF cardinality(public.fn_prompt_template_problems('LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAM_LINES}} {{EXAMPLE_FOR_SUBJECT_TYPE}} {{#LANGUAGE}}x{{/LANGUAGE}}')) <> 0
       OR cardinality(public.fn_prompt_template_problems('LESSON', '{{NODE_NAME}} {{NODE_PATH}} {{BLOCK_SPEC}} {{EXAMPLE_JSON}}')) <> 1
       OR EXISTS (SELECT 1 FROM public.prompt_templates t WHERE cardinality(public.fn_prompt_template_problems(t.template_type, t.body)) <> 0) THEN
        RAISE EXCEPTION 'LP2_PROOF: the template checker does not behave (or a stored template no longer passes)';
    END IF;
END
$proof$;
