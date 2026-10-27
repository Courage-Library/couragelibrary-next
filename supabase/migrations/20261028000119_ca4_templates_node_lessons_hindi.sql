-- =====================================================================================================================
-- 119 CA-4 PROMPT TEMPLATES + NODE LESSONS + THE HINDI FLOW (+ SYLLABUS-PROMPT-2: intake contract v3)
-- Architect GO (CA-4) as a CONDITIONAL GO: backup → dry-run (alone) → chunked rolled-back smoke AS THE REAL ROLES →
-- apply → live verify → counts + types diff 0 + link-set proof + MIGRATION-LIVE-SET. Rollback: docs/database/rollback/
-- 119_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
--
--   prompt_templates — SYLLABUS / LESSON / QUESTION / TRANSLATE_HI, versioned (DRAFT → ACTIVE → RETIRED), ONE ACTIVE per
--     type, a non-DRAFT body is frozen, the body is checked by the DB (fn_prompt_template_problems = lib/prompts/
--     template.ts). Seeds (ACTIVE v1): SYLLABUS = the owner-approved SYLLABUS-PROMPT-2 text, LESSON, TRANSLATE_HI
--     (byte-identical to the TS constants; the gates compare the hashes). QUESTION has no v1 yet (QF keeps its own).
--     Admin read (RLS); writes only through fn_prompt_template_save_draft / _activate (service_role, INVOKER, audited).
--   learning_documents — + node_id (TOPIC / SUBTOPIC / CONCEPT of the master tree), document_type NODE_LESSON, ONE node
--     lesson per node; a node lesson has no learning unit (learning_unit_id becomes NULLable; the owner CHECK keeps the
--     legacy six types unit-owned). fn_lesson_create_node_document (service_role, audited).
--   document_versions — + translated_from_version_id (hi only: the EN version it was translated from; frozen when
--     published). fn_lesson_parity_errors = lib/lessons/parity.ts (same blocks / formulas / answers / numbers).
--   fn_lesson_save_draft / fn_lesson_publish — redefined: a Hindi draft needs the current EN version and must pass
--     parity; Hindi publishes only against the CURRENT English master; publishing EN of a NODE_LESSON publishes the
--     document. Same signatures, same grants.
--   SYLLABUS-PROMPT-2 — syllabus_intake_sessions: contract 2 or 3, source_url / as_of optional (v3), based_on (v3
--     required); syllabus_intake_items: origin (OFFICIAL / PYQ_TREND / EXPANDED; v3 topics / subtopics / concepts:
--     required), avg_questions, paper duration_minutes / negative_marking. fn_syllabus_intake_create / _import
--     redefined (same signatures): v2 still accepted; origin + avg_questions + based_on land in the node / version
--     metadata. No new table.
-- =====================================================================================================================

-- ------------------------------------------------------------------ preflight
DO $pre$
BEGIN
    IF to_regclass('public.prompt_templates') IS NOT NULL THEN RAISE EXCEPTION 'CA4_PREFLIGHT: prompt_templates already exists'; END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'learning_documents' AND column_name = 'node_id') THEN
        RAISE EXCEPTION 'CA4_PREFLIGHT: learning_documents.node_id already exists';
    END IF;
    IF EXISTS (SELECT 1 FROM public.learning_documents WHERE learning_unit_id IS NULL) THEN
        RAISE EXCEPTION 'CA4_PREFLIGHT: a learning document without a unit';
    END IF;
    IF EXISTS (SELECT 1 FROM public.syllabus_intake_sessions WHERE contract_version <> 2) THEN
        RAISE EXCEPTION 'CA4_PREFLIGHT: an intake session that is not contract v2';
    END IF;
END
$pre$;

-- =====================================================================================================================
-- A. PROMPT TEMPLATES
-- =====================================================================================================================
-- The SQL twin of templateProblems (lib/prompts/template.ts): [] = savable.
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

CREATE TABLE public.prompt_templates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_type       text NOT NULL CHECK (template_type IN ('SYLLABUS', 'LESSON', 'QUESTION', 'TRANSLATE_HI')),
    version             integer NOT NULL CHECK (version >= 1),
    body                text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
    body_sha256         text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),  -- computed by fn_prompt_template_guard
    status              text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
    notes               text CHECK (notes IS NULL OR char_length(notes) <= 500),
    created_by          uuid,
    created_by_email    text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    activated_at        timestamptz,
    activated_by_email  text,
    CONSTRAINT uq_prompt_template_version UNIQUE (template_type, version)
);
CREATE UNIQUE INDEX uq_prompt_templates_one_active ON public.prompt_templates (template_type) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_prompt_templates_one_draft ON public.prompt_templates (template_type) WHERE status = 'DRAFT';
COMMENT ON TABLE public.prompt_templates IS 'CA-4: AI prompt templates (paste-in / paste-out), versioned; one ACTIVE per type; a non-DRAFT body is frozen; edits are audited (PROMPT_TEMPLATE_*).';

-- The body is checked (and hashed) on every write; a non-DRAFT row keeps its type / version / body; status moves DRAFT → ACTIVE →
-- RETIRED (a RETIRED version may be re-activated; a DRAFT may be retired = discarded).
CREATE OR REPLACE FUNCTION public.fn_prompt_template_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_p text[];
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status <> 'DRAFT' AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.template_type IS DISTINCT FROM OLD.template_type
                                                       OR NEW.version IS DISTINCT FROM OLD.version) THEN
        RAISE EXCEPTION 'PROMPT_TEMPLATE: version % of % is % and cannot change; save a new draft instead', OLD.version, OLD.template_type, OLD.status
            USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT ((OLD.status = 'DRAFT' AND NEW.status IN ('ACTIVE', 'RETIRED')) OR (OLD.status = 'ACTIVE' AND NEW.status = 'RETIRED')
                OR (OLD.status = 'RETIRED' AND NEW.status = 'ACTIVE')) THEN
        RAISE EXCEPTION 'PROMPT_TEMPLATE: a template cannot go from % to %', OLD.status, NEW.status USING ERRCODE = 'P0001';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.status = 'RETIRED' THEN
        RAISE EXCEPTION 'PROMPT_TEMPLATE: a new template is a DRAFT (or ACTIVE when seeded)' USING ERRCODE = 'P0001';
    END IF;
    v_p := public.fn_prompt_template_problems(NEW.template_type, NEW.body);
    IF cardinality(v_p) > 0 THEN
        RAISE EXCEPTION 'PROMPT_TEMPLATE: %', array_to_string(v_p, ' ') USING ERRCODE = '22023';
    END IF;
    NEW.body_sha256 := encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex');  -- always the DB's own hash
    NEW.updated_at := now();
    RETURN NEW;
END
$fn$;
CREATE TRIGGER trg_prompt_template_guard
    BEFORE INSERT OR UPDATE ON public.prompt_templates
    FOR EACH ROW EXECUTE FUNCTION public.fn_prompt_template_guard();

ALTER TABLE public.prompt_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.prompt_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.prompt_templates TO authenticated;
GRANT ALL ON TABLE public.prompt_templates TO service_role;
CREATE POLICY "prompt_templates: admin read" ON public.prompt_templates
    FOR SELECT TO authenticated USING (public.fn_jwt_is_admin());

CREATE OR REPLACE FUNCTION public.fn_prompt_template_audit(p_actor_id uuid, p_actor_email text, p_action text, p_target_id uuid, p_new jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: an actor is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, p_action, 'prompt_template', p_target_id::text, NULL, p_new, NULL);
END
$fn$;

-- Saves THE draft of a type (updates the open DRAFT or creates the next version). The guard checks the body.
CREATE OR REPLACE FUNCTION public.fn_prompt_template_save_draft(
    p_type text, p_body text, p_notes text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
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
$fn$;

-- Activates a DRAFT (or re-activates a RETIRED version); the previous ACTIVE version of the type is retired.
CREATE OR REPLACE FUNCTION public.fn_prompt_template_activate(p_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v      public.prompt_templates%ROWTYPE;
    v_prev uuid;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM public.prompt_templates WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: template % does not exist', p_id USING ERRCODE = 'P0002'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('prompt_template:' || v.template_type, 0));
    SELECT * INTO v FROM public.prompt_templates WHERE id = p_id FOR UPDATE;
    IF v.status = 'ACTIVE' THEN RAISE EXCEPTION 'PROMPT_TEMPLATE: version % is already active', v.version USING ERRCODE = 'P0001'; END IF;
    UPDATE public.prompt_templates SET status = 'RETIRED' WHERE template_type = v.template_type AND status = 'ACTIVE' RETURNING id INTO v_prev;
    UPDATE public.prompt_templates SET status = 'ACTIVE', activated_at = now(), activated_by_email = p_actor_email WHERE id = p_id;
    PERFORM public.fn_prompt_template_audit(p_actor_id, p_actor_email, 'PROMPT_TEMPLATE_ACTIVATE', p_id,
        jsonb_build_object('template_type', v.template_type, 'version', v.version, 'body_sha256', v.body_sha256, 'previous_active_id', v_prev));
    RETURN jsonb_build_object('id', p_id, 'version', v.version, 'previous_active_id', v_prev);
END
$fn$;

-- seeds: ACTIVE v1 (generated from the TS constants by scripts/content/ca4-template-seeds.cjs; the gates compare hashes)
-- @@SEEDS-BEGIN@@
INSERT INTO public.prompt_templates (template_type, version, body, status, notes, created_by_email, activated_at, activated_by_email)
VALUES ('SYLLABUS', 1, $tpl$You are an expert on Indian government competitive exams and a senior syllabus designer for a coaching platform.

TASK: Build the COMPLETE, CURRENT syllabus of "{{EXAM_NAME}}"{{#TIER}} — {{TIER}}{{/TIER}} for the {{CYCLE}} cycle, as a
4-level teaching tree that a student can study from start to finish and cover 100% of what is asked in this exam.

HOW TO BUILD IT
1. Start from the LATEST official syllabus and exam pattern you know (if you can browse, check the latest official
   notification first). Say which notification/year it is based on in "based_on".
2. Cover EVERY stage/tier/paper of the exam{{#TIER}} — only {{TIER}}{{/TIER}}. For each: sections/subjects, number of questions,
   marks, time, negative marking (as currently applicable).
3. For EVERY subject list ALL topics — the officially named ones AND every topic actually asked in the last 5–10 years of
   previous papers, even if the official text doesn't name it.
4. Break EVERY topic into subtopics, and every subtopic into concepts, deep enough to teach and to classify any question
   asked in this exam. Example: Percentage → Successive percentage change → Net change of two changes.
   Go deeper than the official syllabus — that is the point. Anything deeper than a concept goes in "headings".
5. Mark the origin of EVERY topic, subtopic and concept:
   "OFFICIAL" = named in the official syllabus · "PYQ_TREND" = not named officially but regularly asked in previous papers ·
   "EXPANDED" = a teaching breakdown needed for complete understanding.
6. Weightage per topic from recent papers: "weightage_tier" = HIGH_YIELD (asked almost every paper, many questions) · CORE ·
   MODERATE · LOW · OPTIONAL (rare). Add "avg_questions" when you can estimate it.
7. Names: use the standard names used in Indian exam preparation (e.g. "Time and Work", "Profit and Loss",
   "Simple Interest"). Singular, consistent, Title Case, no numbering. Put other common names in "aliases"
   (e.g. "BODMAS" for Simplification). Add "name_hi" with the standard Hindi name used in Hindi-medium preparation.
8. Accuracy: never invent exam-pattern numbers. If you are not sure of any fact (pattern, a topic's inclusion, weightage),
   set "uncertain": true with a short "uncertain_reason". Better flagged than wrong.
9. Plain text only in values (no HTML, Markdown, links, emojis).

SELF-CHECK BEFORE ANSWERING (silently): no duplicate topics/subtopics within a subject; every topic has subtopics unless it is
truly atomic; nothing from a different exam; the pattern numbers add up; all origins and weightage tiers set.

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences. Exactly this shape (contract SYLLABUS_INTAKE v3):
{
  "contract_version": 3,
  "exam": "{{EXAM_SLUG}}",
  "cycle_year": {{CYCLE}},
  "tier": {{TIER_JSON}},
  "based_on": "e.g. SSC CGL 2025 official notification + PYQs 2016–2025",
  "papers": [
    {
      "name": "Tier 1",
      "questions": 100, "marks": 200, "duration_minutes": 60, "negative_marking": "0.50 per wrong answer",
      "subjects": [
        {
          "name": "Quantitative Aptitude", "name_hi": "मात्रात्मक योग्यता", "aliases": ["Numerical Aptitude"],
          "questions": 25,
          "topics": [
            {
              "name": "Percentage", "name_hi": "प्रतिशत", "origin": "OFFICIAL",
              "weightage_tier": "HIGH_YIELD", "avg_questions": 2,
              "subtopics": [
                {
                  "name": "Successive Percentage Change", "origin": "PYQ_TREND",
                  "concepts": [ { "name": "Net Change of Two Changes", "origin": "EXPANDED", "headings": [] } ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}$tpl$, 'ACTIVE', 'SYLLABUS-PROMPT-2: the owner-approved syllabus prompt (verbatim).', 'migration-119', now(), 'migration-119');
INSERT INTO public.prompt_templates (template_type, version, body, status, notes, created_by_email, activated_at, activated_by_email)
VALUES ('LESSON', 1, $tpl$You are a senior teacher for Indian government competitive exams writing ONE complete lesson for a coaching platform.

LESSON: "{{NODE_NAME}}" ({{NODE_LEVEL}})
Place in the syllabus tree: {{NODE_PATH}}
Subject: {{SUBJECT_NAME}} (type {{SUBJECT_TYPE}})
Other names: {{ALIASES}}
Parts below this node (cover them inside this lesson):
{{CHILD_NODES}}
Lessons that already exist (do not repeat them; link the idea in one line if needed):
{{EXISTING_LESSONS}}

EXAMS THAT ASK THIS (cover every one of them, at each exam's depth and weightage):
{{EXAM_COVERAGE}}

WRITE THE LESSON IN THIS ORDER
1. The concept from the basics: what it is, why it works, in simple exam English. Assume the student starts from zero.
2. Every formula and rule, each as a formula block with its plain reading; a table where it helps comparison.
3. ALL the question types these exams ask on this node, each named with a level-3 heading and explained.
4. {{MIN_EXAMPLES}} to {{MAX_EXAMPLES}} solved examples, ordered from EASY to HARD, each with clear numbered steps, the answer, and a
   shortcut where one exists. Cover every question type above at least once.
5. Shortcuts and speed methods (TIP callouts).
6. Common traps: at least two trap blocks (what students do wrong and why it fails).
7. At least {{MIN_QUICK_CHECKS}} quick checks in the style of previous year questions, each with the correct option marked and a
   one-line feedback.
8. One practice link block (mode PRACTICE) near the end.
9. A one-page revision summary (key bullets, the formulas, speed rules).
10. Memory Lock points: 3 to 10 short facts the student must never forget.

RULES
- Original writing only: never copy text, examples or questions from books, coaching material or publishers.
- Accuracy first: if you are not sure of a fact, figure or exam detail, add it to "uncertain_facts" (plain text, one per
  fact). Better flagged than wrong. Never invent exam statistics.
- English only in this lesson. Numbers as digits (12, 3.5).
- Plain text values; the only formatting is described below.

BLOCKS (the exact JSON the platform accepts):
{{BLOCK_SPEC}}

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences. "contract" exactly "LESSON_BLOCKS v2". Example of the
shape (much shorter than the real lesson):
{{EXAMPLE_JSON}}$tpl$, 'ACTIVE', 'CA-4: node lesson prompt v1.', 'migration-119', now(), 'migration-119');
INSERT INTO public.prompt_templates (template_type, version, body, status, notes, created_by_email, activated_at, activated_by_email)
VALUES ('TRANSLATE_HI', 1, $tpl$You are an expert Hindi-medium teacher for Indian government competitive exams. Translate the lesson
"{{LESSON_TITLE}}" below from English into natural, simple exam Hindi — the Hindi a Hindi-medium student reads in good
preparation material. Not word for word, not Sanskritised: clear and natural.

GLOSSARY (use these standard exam terms; keep an English term in brackets after the Hindi the first time when students also
know it in English):
{{GLOSSARY}}

STRUCTURE RULES (the platform checks every one; a mismatch is refused):
{{BLOCK_RULES}}

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences — with the SAME shape: "contract" exactly
"LESSON_BLOCKS v2 hi", then "meta" and "blocks".

THE ENGLISH LESSON:
{{EN_JSON}}$tpl$, 'ACTIVE', 'CA-4: English to Hindi translation prompt v1.', 'migration-119', now(), 'migration-119');
DO $seedproof$
BEGIN
    IF (SELECT body_sha256 FROM public.prompt_templates WHERE template_type = 'SYLLABUS' AND version = 1) IS DISTINCT FROM '5f6271743af25292a2d38d4685b7284fab33f0899920b7605f1a04a6c6174aeb' THEN RAISE EXCEPTION 'CA4_PROOF: SYLLABUS v1 seed hash'; END IF;
    IF (SELECT body_sha256 FROM public.prompt_templates WHERE template_type = 'LESSON' AND version = 1) IS DISTINCT FROM 'b488f8933573296b215b56f5940bb23888200af75b1a2688eb4a3d0d6da3074e' THEN RAISE EXCEPTION 'CA4_PROOF: LESSON v1 seed hash'; END IF;
    IF (SELECT body_sha256 FROM public.prompt_templates WHERE template_type = 'TRANSLATE_HI' AND version = 1) IS DISTINCT FROM '023256a08902f68dd88a562976f4034e92df9bbe49319409ea0505935e1829ce' THEN RAISE EXCEPTION 'CA4_PROOF: TRANSLATE_HI v1 seed hash'; END IF;
END
$seedproof$;
-- @@SEEDS-END@@

-- =====================================================================================================================
-- B. NODE LESSONS
-- =====================================================================================================================
ALTER TABLE public.learning_documents
    ADD COLUMN node_id uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT;
ALTER TABLE public.learning_documents ALTER COLUMN learning_unit_id DROP NOT NULL;
DO $doctype$
DECLARE
    c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.learning_documents'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%document_type%' LOOP
        EXECUTE format('ALTER TABLE public.learning_documents DROP CONSTRAINT %I', c);
    END LOOP;
END
$doctype$;
ALTER TABLE public.learning_documents ADD CONSTRAINT chk_learning_documents_document_type CHECK (document_type IN (
    'CONCEPT_LESSON', 'WORKED_EXAMPLES', 'FORMULA_SHORTCUT_SHEET', 'COMMON_TRAPS_AND_MISTAKES', 'PYQ_DEEP_DIVE', 'TOPIC_SUMMARY_REVISION', 'NODE_LESSON'));
ALTER TABLE public.learning_documents ADD CONSTRAINT chk_learning_documents_owner CHECK (
    (document_type = 'NODE_LESSON' AND node_id IS NOT NULL AND learning_unit_id IS NULL)
    OR (document_type <> 'NODE_LESSON' AND node_id IS NULL AND learning_unit_id IS NOT NULL));
CREATE UNIQUE INDEX uq_learning_documents_node_lesson ON public.learning_documents (node_id) WHERE document_type = 'NODE_LESSON';
COMMENT ON COLUMN public.learning_documents.node_id IS 'CA-4: the master-tree node (TOPIC / SUBTOPIC / CONCEPT) of a NODE_LESSON; one lesson per node.';

-- A node lesson belongs to an active TOPIC / SUBTOPIC / CONCEPT (plain reads under the caller's rights; no function call).
CREATE OR REPLACE FUNCTION public.fn_learning_document_node_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_type   text;
    v_active boolean;
BEGIN
    IF NEW.node_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.node_id IS NOT DISTINCT FROM OLD.node_id) THEN RETURN NEW; END IF;
    SELECT node_type, is_active INTO v_type, v_active FROM public.canonical_taxonomy_nodes WHERE id = NEW.node_id;
    IF v_type IS NULL OR v_type NOT IN ('TOPIC', 'SUBTOPIC', 'CONCEPT') OR NOT v_active THEN
        RAISE EXCEPTION 'LESSON: a node lesson belongs to an active TOPIC, SUBTOPIC or CONCEPT (got %)', coalesce(v_type, 'nothing') USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$fn$;
CREATE TRIGGER trg_learning_document_node_guard
    BEFORE INSERT OR UPDATE OF node_id ON public.learning_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_learning_document_node_guard();

-- Creates (or returns) THE lesson document of a node. The slug is "lesson-<node slug>" (+ a short id on a clash).
CREATE OR REPLACE FUNCTION public.fn_lesson_create_node_document(p_node_id uuid, p_access_level text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_id   uuid;
    v_slug text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_access_level NOT IN ('FREE', 'PRO') THEN RAISE EXCEPTION 'LESSON: access level must be FREE or PRO' USING ERRCODE = '22023'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('node_lesson:' || p_node_id::text, 0));
    SELECT id INTO v_id FROM public.learning_documents WHERE node_id = p_node_id AND document_type = 'NODE_LESSON';
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('document_id', v_id, 'created', false); END IF;
    SELECT left('lesson-' || slug, 140) INTO v_slug FROM public.canonical_taxonomy_nodes WHERE id = p_node_id;
    IF v_slug IS NULL THEN RAISE EXCEPTION 'LESSON: node % does not exist', p_node_id USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM public.learning_documents WHERE canonical_slug = v_slug) THEN
        v_slug := v_slug || '-' || left(replace(p_node_id::text, '-', ''), 8);
    END IF;
    INSERT INTO public.learning_documents (learning_unit_id, node_id, canonical_slug, document_type, status, access_level)
    VALUES (NULL, p_node_id, v_slug, 'NODE_LESSON', 'DRAFT', p_access_level)
    RETURNING id INTO v_id;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, 'LESSON_NODE_DOCUMENT_CREATE', 'learning_document', v_id::text, NULL,
            jsonb_build_object('node_id', p_node_id, 'canonical_slug', v_slug, 'access_level', p_access_level), NULL);
    RETURN jsonb_build_object('document_id', v_id, 'created', true);
END
$fn$;

-- =====================================================================================================================
-- C. TRANSLATIONS: provenance + structure parity
-- =====================================================================================================================
ALTER TABLE public.document_versions
    ADD COLUMN translated_from_version_id uuid REFERENCES public.document_versions (id);
ALTER TABLE public.document_versions ADD CONSTRAINT chk_document_version_translated_from
    CHECK (translated_from_version_id IS NULL OR language = 'hi');
CREATE INDEX idx_document_versions_translated_from ON public.document_versions (translated_from_version_id) WHERE translated_from_version_id IS NOT NULL;
COMMENT ON COLUMN public.document_versions.translated_from_version_id IS 'CA-4: a Hindi version''s English source version (parity-checked); frozen once published.';


-- published versions stay frozen: the 117 guard + translated_from_version_id (is_current may move on supersede)
CREATE OR REPLACE FUNCTION public.fn_prevent_published_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If previously published, strictly disallow any modification to content, hashes, versioning, metadata, or flags
  IF OLD.review_status = 'PUBLISHED' OR OLD.is_published = TRUE THEN
    IF NEW.review_status IS DISTINCT FROM OLD.review_status OR
       NEW.source_spec_storage_key IS DISTINCT FROM OLD.source_spec_storage_key OR
       NEW.source_spec_hash IS DISTINCT FROM OLD.source_spec_hash OR
       NEW.compiled_artifact_storage_key IS DISTINCT FROM OLD.compiled_artifact_storage_key OR
       NEW.compiled_artifact_hash IS DISTINCT FROM OLD.compiled_artifact_hash OR
       NEW.compiler_version IS DISTINCT FROM OLD.compiler_version OR
       NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
       NEW.component_contract_version IS DISTINCT FROM OLD.component_contract_version OR
       NEW.version_number IS DISTINCT FROM OLD.version_number OR
       NEW.is_published IS DISTINCT FROM OLD.is_published OR
       NEW.document_id IS DISTINCT FROM OLD.document_id OR
       NEW.created_at IS DISTINCT FROM OLD.created_at OR
       -- CA-3
       NEW.content_format IS DISTINCT FROM OLD.content_format OR
       NEW.language IS DISTINCT FROM OLD.language OR
       NEW.lesson_meta IS DISTINCT FROM OLD.lesson_meta OR
       NEW.blocks IS DISTINCT FROM OLD.blocks OR
       NEW.blocks_hash IS DISTINCT FROM OLD.blocks_hash OR
       NEW.blocks_schema_version IS DISTINCT FROM OLD.blocks_schema_version OR
       -- CA-4
       NEW.translated_from_version_id IS DISTINCT FROM OLD.translated_from_version_id THEN
      RAISE EXCEPTION 'Cannot mutate published document version % (v%). Published content versions are strictly immutable. Create version % instead.',
        OLD.id, OLD.version_number, (OLD.version_number + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- The sorted ASCII numbers in every string value of a block (lib/lessons/parity.ts blockNumbers).
CREATE OR REPLACE FUNCTION public.fn_lesson__numbers(p_block jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT coalesce(array_agg(m.x[1] ORDER BY m.x[1] COLLATE "C"), '{}')
      FROM jsonb_path_query(p_block, 'strict $.**') AS j(v)
      CROSS JOIN LATERAL regexp_matches(CASE WHEN jsonb_typeof(j.v) = 'string' THEN j.v #>> '{}' ELSE '' END, '[0-9]+(?:\.[0-9]+)?', 'g') AS m(x)
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson__len(p jsonb)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT CASE WHEN jsonb_typeof(p) = 'array' THEN jsonb_array_length(p) ELSE -1 END
$fn$;

-- quick-check answers as "id:correct,…" in order (lib/lessons/parity.ts)
CREATE OR REPLACE FUNCTION public.fn_lesson__answer_key(p_block jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT coalesce(string_agg(coalesce(o.v ->> 'id', 'undefined') || ':' || (coalesce(o.v -> 'correct', 'null') = 'true'::jsonb)::text, ',' ORDER BY o.n), '')
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_block -> 'options') = 'array' THEN p_block -> 'options' ELSE '[]' END) WITH ORDINALITY AS o(v, n)
$fn$;

-- STRUCTURE PARITY of a Hindi translation against its English blocks (= parityErrors in lib/lessons/parity.ts).
CREATE OR REPLACE FUNCTION public.fn_lesson_parity_errors(p_en jsonb, p_hi jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_errs jsonb := '[]'::jsonb;
    e      jsonb;
    h      jsonb;
    i      integer;
    t      text;
    n      integer;
    k      text;
BEGIN
    IF jsonb_typeof(p_en) IS DISTINCT FROM 'array' OR jsonb_typeof(p_hi) IS DISTINCT FROM 'array' THEN
        RETURN jsonb_build_array(jsonb_build_object('index', -1, 'id', '', 'code', 'BLOCK_COUNT', 'message', 'Both lessons must be block lists.'));
    END IF;
    n := jsonb_array_length(p_en);
    IF jsonb_array_length(p_hi) <> n THEN
        RETURN jsonb_build_array(jsonb_build_object('index', -1, 'id', '', 'code', 'BLOCK_COUNT',
            'message', format('The translation has %s blocks; the English lesson has %s.', jsonb_array_length(p_hi), n)));
    END IF;
    FOR i IN 0 .. n - 1 LOOP
        e := p_en -> i;
        h := p_hi -> i;
        t := e ->> 'type';
        IF (h -> 'id') IS DISTINCT FROM (e -> 'id') OR (h -> 'type') IS DISTINCT FROM (e -> 'type') THEN
            v_errs := v_errs || jsonb_build_object('index', i, 'id', e ->> 'id', 'code', 'BLOCK_MISMATCH',
                'message', format('Block %s must be "%s" (%s); found "%s" (%s).', i + 1, e ->> 'id', t, h ->> 'id', h ->> 'type'));
            CONTINUE;
        END IF;
        k := NULL;
        IF t = 'heading' AND coalesce(e -> 'level', 'null') <> coalesce(h -> 'level', 'null') THEN k := 'HEADING_LEVEL';
        ELSIF t = 'list' AND (coalesce(e -> 'ordered', 'null') <> coalesce(h -> 'ordered', 'null')
                              OR public.fn_lesson__len(e -> 'items') <> public.fn_lesson__len(h -> 'items')) THEN k := 'LIST_SHAPE';
        ELSIF t = 'formula' AND coalesce(e -> 'latex', 'null') <> coalesce(h -> 'latex', 'null') THEN k := 'FORMULA';
        ELSIF t = 'solved_example' THEN
            IF coalesce(e -> 'difficulty', 'null') <> coalesce(h -> 'difficulty', 'null')
               OR public.fn_lesson__len(e -> 'steps') <> public.fn_lesson__len(h -> 'steps') THEN k := 'EXAMPLE_SHAPE';
            ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'steps') = 'array' THEN e -> 'steps' ELSE '[]' END) WITH ORDINALITY AS s(v, o)
                           WHERE coalesce(s.v -> 'math', 'null') <> coalesce(h -> 'steps' -> (s.o::int - 1) -> 'math', 'null')) THEN k := 'STEP_MATH';
            END IF;
        ELSIF t = 'callout' AND coalesce(e -> 'variant', 'null') <> coalesce(h -> 'variant', 'null') THEN k := 'CALLOUT_VARIANT';
        ELSIF t = 'trap' AND coalesce(e -> 'kind', 'null') <> coalesce(h -> 'kind', 'null') THEN k := 'TRAP_KIND';
        ELSIF t = 'table' AND (public.fn_lesson__len(e -> 'headers') <> public.fn_lesson__len(h -> 'headers')
                               OR public.fn_lesson__len(e -> 'rows') <> public.fn_lesson__len(h -> 'rows')
                               OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(e -> 'rows') = 'array' THEN e -> 'rows' ELSE '[]' END) WITH ORDINALITY AS r(v, o)
                                           WHERE public.fn_lesson__len(r.v) <> public.fn_lesson__len(h -> 'rows' -> (r.o::int - 1)))) THEN k := 'TABLE_SHAPE';
        ELSIF t = 'image' AND coalesce(e -> 'asset_id', 'null') <> coalesce(h -> 'asset_id', 'null') THEN k := 'IMAGE';
        ELSIF t = 'practice_link' AND (coalesce(e -> 'node_id', 'null') <> coalesce(h -> 'node_id', 'null')
                                       OR coalesce(e -> 'mode', 'null') <> coalesce(h -> 'mode', 'null')) THEN k := 'PRACTICE_LINK';
        ELSIF t = 'quick_check' AND public.fn_lesson__answer_key(e) IS DISTINCT FROM public.fn_lesson__answer_key(h) THEN k := 'ANSWERS';
        ELSIF t = 'revision_summary' AND (public.fn_lesson__len(e -> 'bullets') <> public.fn_lesson__len(h -> 'bullets')
                                          OR coalesce(e -> 'formulas', 'null') <> coalesce(h -> 'formulas', 'null')
                                          OR public.fn_lesson__len(e -> 'speed_rules') <> public.fn_lesson__len(h -> 'speed_rules')) THEN k := 'SUMMARY_SHAPE';
        ELSIF t = 'memory_lock_points' AND public.fn_lesson__len(e -> 'points') <> public.fn_lesson__len(h -> 'points') THEN k := 'MEMORY_LOCK_COUNT';
        END IF;
        IF k IS NOT NULL THEN
            v_errs := v_errs || jsonb_build_object('index', i, 'id', e ->> 'id', 'code', k, 'message', CASE k
                WHEN 'HEADING_LEVEL' THEN 'Heading level changed.'
                WHEN 'LIST_SHAPE' THEN 'List type or item count changed.'
                WHEN 'FORMULA' THEN 'The formula changed (formulas are never translated).'
                WHEN 'EXAMPLE_SHAPE' THEN 'Difficulty or number of steps changed.'
                WHEN 'STEP_MATH' THEN 'Step math changed.'
                WHEN 'CALLOUT_VARIANT' THEN 'Callout type changed.'
                WHEN 'TRAP_KIND' THEN 'Trap kind changed.'
                WHEN 'TABLE_SHAPE' THEN 'Table shape changed.'
                WHEN 'IMAGE' THEN 'Image changed.'
                WHEN 'PRACTICE_LINK' THEN 'Practice link changed.'
                WHEN 'ANSWERS' THEN 'Quick-check options or correct answers changed.'
                WHEN 'SUMMARY_SHAPE' THEN 'Summary bullets, formulas or speed rules changed.'
                ELSE 'Number of Memory Lock points changed.' END);
        END IF;
        IF public.fn_lesson__numbers(e) IS DISTINCT FROM public.fn_lesson__numbers(h) THEN
            v_errs := v_errs || jsonb_build_object('index', i, 'id', e ->> 'id', 'code', 'NUMBERS',
                'message', 'The numbers in this block changed (keep every number as in English).');
        END IF;
    END LOOP;
    RETURN v_errs;
END
$fn$;

-- =====================================================================================================================
-- D. LESSON RPCs (redefined: same signatures)
-- =====================================================================================================================
CREATE OR REPLACE FUNCTION public.fn_lesson_save_draft(
    p_document_id uuid, p_language text, p_meta jsonb, p_blocks jsonb, p_author_type text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_draft  uuid;
    v_number integer;
    v_row    public.document_versions%ROWTYPE;
    v_en_id  uuid;
    v_en     jsonb;
    v_errs   jsonb;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_language NOT IN ('en', 'hi') THEN RAISE EXCEPTION 'LESSON: language must be en or hi' USING ERRCODE = '22023'; END IF;
    IF p_author_type NOT IN ('HUMAN', 'AI_ASSISTED', 'LEGACY_CONVERSION') THEN RAISE EXCEPTION 'LESSON: unknown author type' USING ERRCODE = '22023'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = p_document_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: document % does not exist', p_document_id USING ERRCODE = 'P0002'; END IF;
    -- CA-4: a translation starts from the CURRENT published English lesson and keeps its structure
    IF p_language = 'hi' THEN
        SELECT id, blocks INTO v_en_id, v_en FROM public.document_versions
         WHERE document_id = p_document_id AND language = 'en' AND is_current AND content_format = 'BLOCKS';
        IF v_en_id IS NULL THEN
            RAISE EXCEPTION 'LESSON: publish the English lesson first (a translation starts from the published English lesson)' USING ERRCODE = 'P0001';
        END IF;
        v_errs := public.fn_lesson_parity_errors(v_en, p_blocks);
        IF jsonb_array_length(v_errs) > 0 THEN
            RAISE EXCEPTION 'LESSON_PARITY: % difference(s) from the English lesson; first: block %: %', jsonb_array_length(v_errs),
                (v_errs -> 0 ->> 'index')::int + 1, v_errs -> 0 ->> 'message' USING ERRCODE = '22023';
        END IF;
    END IF;
    SELECT id INTO v_draft FROM public.document_versions
     WHERE document_id = p_document_id AND language = p_language AND content_format = 'BLOCKS'
       AND NOT is_published AND review_status = 'DRAFT'
     ORDER BY version_number DESC LIMIT 1;
    IF v_draft IS NOT NULL THEN
        UPDATE public.document_versions SET lesson_meta = p_meta, blocks = p_blocks, author_type = p_author_type,
               translated_from_version_id = v_en_id, updated_at = now()
         WHERE id = v_draft RETURNING * INTO v_row;
    ELSE
        SELECT coalesce(max(version_number), 0) + 1 INTO v_number FROM public.document_versions WHERE document_id = p_document_id;
        INSERT INTO public.document_versions
            (document_id, version_number, schema_version, compiler_version, component_contract_version, author_type, review_status,
             is_published, content_format, language, lesson_meta, blocks, blocks_hash, blocks_schema_version, translated_from_version_id)
        VALUES (p_document_id, v_number, '2.0.0', 'blocks-2', 'blocks-2', p_author_type, 'DRAFT', false, 'BLOCKS', p_language,
                p_meta, p_blocks, repeat('0', 64), '2.0.0', v_en_id)
        RETURNING * INTO v_row;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_DRAFT_SAVE', v_row.id,
        jsonb_build_object('document_id', p_document_id, 'language', p_language, 'version_number', v_row.version_number,
                           'blocks', jsonb_array_length(p_blocks), 'blocks_hash', v_row.blocks_hash, 'author_type', p_author_type,
                           'translated_from_version_id', v_en_id));
    RETURN jsonb_build_object('version_id', v_row.id, 'version_number', v_row.version_number, 'blocks_hash', v_row.blocks_hash);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_lesson_publish(p_version_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v      public.document_versions%ROWTYPE;
    v_prev uuid;
    v_en   public.document_versions%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'LESSON: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v FROM public.document_versions WHERE id = p_version_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LESSON: version % does not exist', p_version_id USING ERRCODE = 'P0002'; END IF;
    IF v.content_format <> 'BLOCKS' THEN RAISE EXCEPTION 'LESSON: only BLOCKS versions are published here (the MDX path is retired)' USING ERRCODE = 'P0001'; END IF;
    IF v.is_published OR v.review_status = 'PUBLISHED' THEN RAISE EXCEPTION 'LESSON: version % is already published', v.version_number USING ERRCODE = 'P0001'; END IF;
    PERFORM 1 FROM public.learning_documents WHERE id = v.document_id FOR UPDATE;
    IF v.language = 'hi' THEN
        SELECT * INTO v_en FROM public.document_versions WHERE document_id = v.document_id AND language = 'en' AND is_current;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'LESSON: publish the English version first (Hindi follows the English master)' USING ERRCODE = 'P0001';
        END IF;
        IF v.translated_from_version_id IS DISTINCT FROM v_en.id THEN
            RAISE EXCEPTION 'LESSON: the English lesson changed after this translation was saved; save the translation again against the current English'
                USING ERRCODE = 'P0001';
        END IF;
        IF jsonb_array_length(public.fn_lesson_parity_errors(v_en.blocks, v.blocks)) > 0 THEN
            RAISE EXCEPTION 'LESSON_PARITY: the translation no longer matches the English structure' USING ERRCODE = '22023';
        END IF;
    END IF;
    -- re-validate at publish (the rules may have tightened since the draft was saved)
    IF jsonb_array_length(public.fn_lesson_blocks_errors(v.lesson_meta, v.blocks)) > 0 THEN
        RAISE EXCEPTION 'LESSON_BLOCKS_INVALID: fix the draft before publishing' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_prev FROM public.document_versions WHERE document_id = v.document_id AND language = v.language AND is_current;
    IF v_prev IS NOT NULL THEN
        UPDATE public.document_versions SET is_current = false WHERE id = v_prev;
    END IF;
    UPDATE public.document_versions
       SET review_status = 'PUBLISHED', is_published = true, published_at = now(), approved_by_user_id = p_actor_id, is_current = true, updated_at = now()
     WHERE id = p_version_id;
    IF v.language = 'en' THEN
        -- CA-4: publishing the English master of a node lesson publishes the document
        UPDATE public.learning_documents
           SET current_published_version_id = p_version_id,
               status = CASE WHEN document_type = 'NODE_LESSON' THEN 'PUBLISHED' ELSE status END,
               updated_at = now()
         WHERE id = v.document_id;
    END IF;
    PERFORM public.fn_lesson_audit(p_actor_id, p_actor_email, 'LESSON_PUBLISH', p_version_id,
        jsonb_build_object('document_id', v.document_id, 'language', v.language, 'version_number', v.version_number,
                           'previous_current_version_id', v_prev, 'blocks_hash', v.blocks_hash,
                           'translated_from_version_id', v.translated_from_version_id));
    RETURN jsonb_build_object('version_id', p_version_id, 'version_number', v.version_number, 'language', v.language,
                              'previous_current_version_id', v_prev);
END
$fn$;

-- =====================================================================================================================
-- E. SYLLABUS-PROMPT-2: intake contract v3
-- =====================================================================================================================
DO $intakecheck$
DECLARE
    c text;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.syllabus_intake_sessions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%contract_version%' LOOP
        EXECUTE format('ALTER TABLE public.syllabus_intake_sessions DROP CONSTRAINT %I', c);
    END LOOP;
END
$intakecheck$;
ALTER TABLE public.syllabus_intake_sessions
    ALTER COLUMN source_url DROP NOT NULL,
    ALTER COLUMN as_of_date DROP NOT NULL,
    ADD COLUMN based_on text CHECK (based_on IS NULL OR char_length(btrim(based_on)) BETWEEN 1 AND 500);
ALTER TABLE public.syllabus_intake_sessions ADD CONSTRAINT chk_intake_session_contract CHECK (
    (contract_version = 2 AND source_url IS NOT NULL AND as_of_date IS NOT NULL)
    OR (contract_version = 3 AND based_on IS NOT NULL));
ALTER TABLE public.syllabus_intake_items
    ADD COLUMN origin text CHECK (origin IS NULL OR origin IN ('OFFICIAL', 'PYQ_TREND', 'EXPANDED')),
    ADD COLUMN avg_questions numeric CHECK (avg_questions IS NULL OR (avg_questions >= 0 AND avg_questions <= 1000)),
    ADD COLUMN duration_minutes integer CHECK (duration_minutes IS NULL OR (duration_minutes >= 0 AND duration_minutes <= 1440)),
    ADD COLUMN negative_marking text CHECK (negative_marking IS NULL OR char_length(btrim(negative_marking)) BETWEEN 1 AND 200);
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT chk_intake_item_origin_level
    CHECK (origin IS NULL OR level IN ('TOPIC', 'SUBTOPIC', 'CONCEPT'));
ALTER TABLE public.syllabus_intake_items ADD CONSTRAINT chk_intake_item_paper_fields
    CHECK ((duration_minutes IS NULL AND negative_marking IS NULL) OR level = 'PAPER');
COMMENT ON TABLE public.syllabus_intake_sessions IS 'CA-2 / SYLLABUS-PROMPT-2: one pasted AI syllabus (contract SYLLABUS_INTAKE v3, or v2 for older pastes) under review; nothing touches the master tree or a syllabus version until every item is decided.';

-- Stores a validated + matched intake (contract v3, or v2 for an older paste). Same rules as 116, plus v3: based_on
-- required (plain text), every topic / subtopic / concept carries an origin, paper duration / negative marking.
CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_create(
    p_exam_id uuid, p_exam_cycle_id uuid, p_tier text, p_source_url text, p_as_of date, p_payload jsonb, p_items jsonb,
    p_actor_id uuid, p_actor_email text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_id      uuid;
    v_item    record;
    v_parent  public.syllabus_intake_items%ROWTYPE;
    v_keys    jsonb := '{}'::jsonb;
    v_new_id  uuid;
    v_node    public.canonical_taxonomy_nodes%ROWTYPE;
    v_text    text;
    v_version integer;
    v_based   text;
    v_source  text := NULLIF(btrim(coalesce(p_source_url, '')), '');
    c_child   constant jsonb := '{"PAPER":"SUBJECT","SUBJECT":"TOPIC","TOPIC":"SUBTOPIC","SUBTOPIC":"CONCEPT"}'::jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: exam % does not exist', p_exam_id USING ERRCODE = 'P0002';
    END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the cycle does not belong to the exam' USING ERRCODE = '22023';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR NOT coalesce((p_payload -> 'contract_version') IN ('2'::jsonb, '3'::jsonb), false) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the payload must be a SYLLABUS_INTAKE v3 (or v2) object' USING ERRCODE = '22023';
    END IF;
    v_version := (p_payload ->> 'contract_version')::integer;
    IF v_version = 2 AND (v_source IS NULL OR p_as_of IS NULL) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: a v2 intake needs the official link and date' USING ERRCODE = '22023';
    END IF;
    IF v_version = 3 THEN
        v_based := NULLIF(btrim(coalesce(p_payload ->> 'based_on', '')), '');
        IF v_based IS NULL OR char_length(v_based) > 500 OR NOT public.fn_syllabus__import_is_plain(v_based) THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: "based_on" is required plain text (at most 500 characters)' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 1000 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: 1 to 1000 items are required' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.syllabus_intake_sessions (exam_id, exam_cycle_id, tier, source_url, as_of_date, contract_version, based_on, payload, payload_sha256,
                                                 created_by, created_by_email)
    VALUES (p_exam_id, p_exam_cycle_id, NULLIF(btrim(coalesce(p_tier, '')), ''), v_source, p_as_of, v_version, v_based, p_payload,
            encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex'), p_actor_id, p_actor_email)
    RETURNING id INTO v_id;

    -- items arrive parents first (the TS builder emits a pre-order walk)
    FOR v_item IN SELECT e.value AS v FROM jsonb_array_elements(p_items) e LOOP
        FOREACH v_text IN ARRAY ARRAY[v_item.v ->> 'name', v_item.v ->> 'name_hi', v_item.v ->> 'uncertain_reason', v_item.v ->> 'negative_marking']
                              || coalesce(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_item.v -> 'aliases') = 'array' THEN v_item.v -> 'aliases' ELSE '[]'::jsonb END)), '{}')
                              || coalesce(ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_item.v -> 'extra_headings') = 'array' THEN v_item.v -> 'extra_headings' ELSE '[]'::jsonb END)), '{}') LOOP
            IF v_text IS NOT NULL AND NOT public.fn_syllabus__import_is_plain(v_text) THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: item % contains markup or control characters', v_item.v ->> 'key' USING ERRCODE = '22023';
            END IF;
        END LOOP;
        -- v3: every topic / subtopic / concept carries its origin; v2 items carry none
        IF v_version = 3 AND v_item.v ->> 'level' IN ('TOPIC', 'SUBTOPIC', 'CONCEPT') AND coalesce(v_item.v ->> 'origin', '') NOT IN ('OFFICIAL', 'PYQ_TREND', 'EXPANDED') THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: item % has no origin (OFFICIAL, PYQ_TREND or EXPANDED)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        IF v_version = 2 AND (v_item.v ->> 'origin') IS NOT NULL THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: a v2 item carries no origin (%)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        v_parent := NULL;
        IF v_item.v ->> 'parent_key' IS NOT NULL THEN
            IF NOT v_keys ? (v_item.v ->> 'parent_key') THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: item % comes before its parent %', v_item.v ->> 'key', v_item.v ->> 'parent_key' USING ERRCODE = '22023';
            END IF;
            SELECT * INTO v_parent FROM public.syllabus_intake_items WHERE id = (v_keys ->> (v_item.v ->> 'parent_key'))::uuid;
            IF c_child ->> v_parent.level IS DISTINCT FROM v_item.v ->> 'level' THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: a % cannot sit under a %', v_item.v ->> 'level', v_parent.level USING ERRCODE = '22023';
            END IF;
        ELSIF v_item.v ->> 'level' <> 'PAPER' THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only a PAPER is a root item (%)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        -- an EXACT / ALIAS claim is re-checked: a node of the item's level under the parent's matched node (or a root subject)
        IF v_item.v ->> 'match_status' IN ('EXACT', 'ALIAS') THEN
            SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = (v_item.v ->> 'matched_node_id')::uuid;
            IF NOT FOUND OR v_node.node_type <> v_item.v ->> 'level' OR NOT v_node.is_active
               OR (v_item.v ->> 'level' = 'SUBJECT' AND v_node.parent_id IS NOT NULL)
               OR (v_item.v ->> 'level' <> 'SUBJECT' AND v_node.parent_id IS DISTINCT FROM v_parent.matched_node_id) THEN
                RAISE EXCEPTION 'SYLLABUS_INTAKE: the match of item % is not an active % under its matched parent', v_item.v ->> 'key', v_item.v ->> 'level'
                    USING ERRCODE = '22023';
            END IF;
        ELSIF (v_item.v ->> 'matched_node_id') IS NOT NULL THEN
            RAISE EXCEPTION 'SYLLABUS_INTAKE: only EXACT / ALIAS items carry a matched node (%)', v_item.v ->> 'key' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.syllabus_intake_items
            (session_id, parent_item_id, item_key, level, position, raw_name, raw_name_hi, aliases, marks, questions, weightage_tier,
             uncertain, uncertain_reason, extra_headings, match_status, matched_node_id, candidates,
             origin, avg_questions, duration_minutes, negative_marking)
        VALUES (v_id, v_parent.id, v_item.v ->> 'key', v_item.v ->> 'level', coalesce((v_item.v ->> 'position')::integer, 0),
                btrim(v_item.v ->> 'name'), NULLIF(btrim(coalesce(v_item.v ->> 'name_hi', '')), ''),
                coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item.v -> 'aliases', '[]'::jsonb))), '{}'),
                (v_item.v ->> 'marks')::numeric, (v_item.v ->> 'questions')::integer, v_item.v ->> 'weightage_tier',
                coalesce((v_item.v ->> 'uncertain')::boolean, false), v_item.v ->> 'uncertain_reason',
                coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(v_item.v -> 'extra_headings', '[]'::jsonb))), '{}'),
                v_item.v ->> 'match_status', (v_item.v ->> 'matched_node_id')::uuid, coalesce(v_item.v -> 'candidates', '[]'::jsonb),
                v_item.v ->> 'origin', (v_item.v ->> 'avg_questions')::numeric, (v_item.v ->> 'duration_minutes')::integer,
                NULLIF(btrim(coalesce(v_item.v ->> 'negative_marking', '')), ''))
        RETURNING id INTO v_new_id;
        v_keys := v_keys || jsonb_build_object(v_item.v ->> 'key', v_new_id);
    END LOOP;

    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_CREATE', 'syllabus_intake_session', v_id,
        jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'tier', p_tier, 'contract_version', v_version,
                           'based_on', v_based, 'source_url', v_source, 'as_of', p_as_of, 'items', jsonb_array_length(p_items),
                           'payload_sha256', encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex')));
    RETURN v_id;
END
$fn$;

-- One DRAFT syllabus version from a fully decided intake (116 + SYLLABUS-PROMPT-2: based_on / contract version in the
-- version metadata; paper duration + negative marking; a topic's origin, avg_questions and the origins below it).
CREATE OR REPLACE FUNCTION public.fn_syllabus_intake_import(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    s        public.syllabus_intake_sessions%ROWTYPE;
    v_ver    public.exam_syllabus_versions;
    v_open   integer;
    rp       record;
    rs       record;
    rt       record;
    v_pid    uuid;
    v_sid    uuid;
    v_uid    uuid;
    v_targets uuid[];
    v_papers integer := 0;
    v_sections integer := 0;
    v_units  integer := 0;
    v_maps   integer := 0;
    v_tag    text := NULLIF(btrim(coalesce(p_version_tag, '')), '');
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO s FROM public.syllabus_intake_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: intake % does not exist', p_session_id USING ERRCODE = 'P0002'; END IF;
    IF s.status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_INTAKE: the intake is %', s.status USING ERRCODE = 'P0001'; END IF;
    IF v_tag IS NOT NULL AND (v_tag !~ '^[a-z0-9]+([-.][a-z0-9]+)*$' OR char_length(v_tag) > 80) THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: the version tag must be lower-case letters, digits, "-" or "."' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_open FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level <> 'PAPER' AND decision IS NULL;
    IF v_open > 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: % items are not decided yet', v_open USING ERRCODE = 'P0001';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || s.exam_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = s.exam_id AND exam_cycle_id IS NOT DISTINCT FROM s.exam_cycle_id
                 AND tier IS NOT DISTINCT FROM s.tier AND status = 'DRAFT') THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: a DRAFT is already open for this exam / cycle / tier; publish or delete it first' USING ERRCODE = 'P0001';
    END IF;

    v_ver := public.fn_syllabus__create_version(s.exam_id, s.exam_cycle_id, v_tag, 'IMPORT', NULL, s.payload_sha256,
        jsonb_build_object('intake', jsonb_strip_nulls(jsonb_build_object('session_id', s.id, 'contract_version', s.contract_version,
                                                        'based_on', s.based_on, 'source_url', s.source_url,
                                                        'as_of', s.as_of_date, 'payload_sha256', s.payload_sha256))));
    UPDATE public.exam_syllabus_versions SET tier = s.tier, created_by = p_actor_id WHERE id = v_ver.id;

    FOR rp IN SELECT * FROM public.syllabus_intake_items WHERE session_id = p_session_id AND level = 'PAPER' ORDER BY position, item_key LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE');
        v_pid := public.fn_syllabus__insert_node(v_ver.id, NULL, 'PAPER', rp.raw_name, NULL, rp.position + 1, NULL, NULL, rp.questions, rp.questions, true);
        UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', rp.marks, 'uncertain', CASE WHEN rp.uncertain THEN true END,
                                                                                               'uncertain_reason', rp.uncertain_reason, 'intake_item_id', rp.id,
                                                                                               'duration_minutes', rp.duration_minutes,
                                                                                               'negative_marking', rp.negative_marking))
         WHERE id = v_pid;
        v_papers := v_papers + 1;
        FOR rs IN SELECT * FROM public.syllabus_intake_items WHERE parent_item_id = rp.id AND decision <> 'IGNORE' ORDER BY position, item_key LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items WHERE parent_item_id = rs.id AND decision <> 'IGNORE');
            v_sid := public.fn_syllabus__insert_node(v_ver.id, v_pid, 'SECTION', rs.raw_name, NULL, rs.position + 1, NULL, rs.weightage_tier,
                                                     rs.questions, rs.questions, true);
            UPDATE public.exam_syllabus_nodes SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', rs.marks, 'uncertain', CASE WHEN rs.uncertain THEN true END,
                                                                                                   'uncertain_reason', rs.uncertain_reason, 'subject_id', rs.decision_node_id,
                                                                                                   'intake_item_id', rs.id))
             WHERE id = v_sid;
            v_sections := v_sections + 1;
            FOR rt IN SELECT * FROM public.syllabus_intake_items WHERE parent_item_id = rs.id AND decision <> 'IGNORE' ORDER BY position, item_key LOOP
                v_uid := public.fn_syllabus__insert_node(v_ver.id, v_sid, 'UNIT', rt.raw_name, NULL, rt.position + 1, NULL, rt.weightage_tier,
                                                         rt.questions, rt.questions, true);
                -- the deepest decided level below the topic, else the topic itself
                WITH RECURSIVE below AS (
                    SELECT i.id, i.decision_node_id, i.level FROM public.syllabus_intake_items i WHERE i.parent_item_id = rt.id AND i.decision <> 'IGNORE'
                    UNION ALL
                    SELECT c.id, c.decision_node_id, c.level FROM public.syllabus_intake_items c JOIN below b ON c.parent_item_id = b.id WHERE c.decision <> 'IGNORE')
                SELECT array_agg(DISTINCT b.decision_node_id) INTO v_targets FROM below b
                 WHERE NOT EXISTS (SELECT 1 FROM public.syllabus_intake_items c WHERE c.parent_item_id = b.id AND c.decision <> 'IGNORE');
                IF v_targets IS NULL OR cardinality(v_targets) > 20 THEN
                    v_targets := ARRAY[rt.decision_node_id];
                END IF;
                INSERT INTO public.exam_syllabus_canonical_mappings
                    (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, reviewed_by, reviewed_at)
                SELECT v_uid, t, CASE WHEN rt.decision = 'ALIAS' THEN 'ALIAS_MATCH' ELSE 'MANUALLY_MAPPED' END, 1.00, 'SYLLABUS_INTAKE', p_actor_id, now()
                  FROM unnest(v_targets) t;
                v_maps := v_maps + cardinality(v_targets);
                -- the topic and every non-ignored item below it: uncertain flags + headings deeper than L4 (in order),
                -- SYLLABUS-PROMPT-2: the topic's origin + avg_questions and the origin counts of the items below it
                UPDATE public.exam_syllabus_nodes
                   SET metadata = (
                       WITH RECURSIVE sub AS (
                           SELECT i.id, i.item_key, i.uncertain, i.extra_headings, i.origin, 0 AS depth FROM public.syllabus_intake_items i WHERE i.id = rt.id
                           UNION ALL
                           SELECT c.id, c.item_key, c.uncertain, c.extra_headings, c.origin, sub.depth + 1 FROM public.syllabus_intake_items c JOIN sub ON c.parent_item_id = sub.id
                            WHERE c.decision <> 'IGNORE')
                       SELECT jsonb_strip_nulls(jsonb_build_object(
                           'marks', rt.marks, 'uncertain', CASE WHEN bool_or(sub.uncertain) THEN true END,
                           'uncertain_reason', rt.uncertain_reason, 'intake_item_id', rt.id,
                           'origin', rt.origin, 'avg_questions', rt.avg_questions,
                           'origins_below', CASE WHEN count(sub.origin) FILTER (WHERE sub.depth > 0) > 0 THEN jsonb_build_object(
                               'OFFICIAL', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'OFFICIAL'),
                               'PYQ_TREND', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'PYQ_TREND'),
                               'EXPANDED', count(*) FILTER (WHERE sub.depth > 0 AND sub.origin = 'EXPANDED')) END,
                           'headings', (SELECT jsonb_agg(h.x ORDER BY h.k, h.o) FROM (
                               SELECT s2.item_key k, e.x, e.o FROM sub s2, unnest(s2.extra_headings) WITH ORDINALITY e(x, o)) h)))
                         FROM sub)
                 WHERE id = v_uid;
                v_units := v_units + 1;
            END LOOP;
        END LOOP;
    END LOOP;
    IF v_units = 0 THEN
        RAISE EXCEPTION 'SYLLABUS_INTAKE: every topic is ignored; nothing to import' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.syllabus_intake_sessions SET status = 'IMPORTED', imported_version_id = v_ver.id, updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_intake_audit(p_actor_id, p_actor_email, 'SYLLABUS_INTAKE_IMPORT', 'exam_syllabus_version', v_ver.id,
        jsonb_build_object('session_id', p_session_id, 'exam_id', s.exam_id, 'exam_cycle_id', s.exam_cycle_id, 'tier', s.tier,
                           'version_number', v_ver.version_number, 'papers', v_papers, 'sections', v_sections, 'units', v_units,
                           'mappings', v_maps, 'contract_version', s.contract_version, 'based_on', s.based_on,
                           'source_url', s.source_url, 'payload_sha256', s.payload_sha256));
    RETURN jsonb_build_object('version_id', v_ver.id, 'version_number', v_ver.version_number, 'papers', v_papers,
                              'sections', v_sections, 'units', v_units, 'mappings', v_maps);
END
$fn$;

-- =====================================================================================================================
-- F. GRANTS (every new function: service_role only; the redefined ones keep theirs)
-- =====================================================================================================================
REVOKE ALL ON FUNCTION public.fn_prompt_template_problems(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_prompt_template_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_prompt_template_audit(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_prompt_template_save_draft(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_prompt_template_activate(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_learning_document_node_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_create_node_document(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__numbers(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__len(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson__answer_key(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_parity_errors(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_lesson_publish(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_prompt_template_problems(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_prompt_template_audit(uuid, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_prompt_template_save_draft(text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_prompt_template_activate(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_create_node_document(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__numbers(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__len(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson__answer_key(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_parity_errors(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_lesson_publish(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_create(uuid, uuid, text, text, date, jsonb, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_intake_import(uuid, text, uuid, text) TO service_role;

-- =====================================================================================================================
-- G. PROOF
-- =====================================================================================================================
DO $proof$
DECLARE
    v_en jsonb := '[{"id":"h","type":"heading","level":2,"text":"Speed 10"},{"id":"f","type":"formula","latex":"a+b","reading":"a plus b"},
                    {"id":"q","type":"quick_check","prompt":"p","options":[{"id":"a","text":"x","correct":false},{"id":"b","text":"y","correct":true}]}]';
BEGIN
    IF (SELECT count(*) FROM public.prompt_templates WHERE status = 'ACTIVE') <> 3
       OR EXISTS (SELECT 1 FROM public.prompt_templates WHERE template_type = 'QUESTION') THEN
        RAISE EXCEPTION 'CA4_PROOF: expected exactly the SYLLABUS, LESSON and TRANSLATE_HI v1 seeds';
    END IF;
    IF cardinality(public.fn_prompt_template_problems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}}')) <> 0
       OR cardinality(public.fn_prompt_template_problems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}}')) = 0
       OR cardinality(public.fn_prompt_template_problems('SYLLABUS', '{{EXAM_NAME}} {{EXAM_SLUG}} {{CYCLE}} {{TIER_JSON}} {{#TIER}}x')) = 0 THEN
        RAISE EXCEPTION 'CA4_PROOF: the template checker does not behave';
    END IF;
    IF jsonb_array_length(public.fn_lesson_parity_errors(v_en, v_en)) <> 0
       OR jsonb_array_length(public.fn_lesson_parity_errors(v_en, jsonb_set(v_en, '{1,latex}', '"a-b"'))) <> 1
       OR jsonb_array_length(public.fn_lesson_parity_errors(v_en, jsonb_set(v_en, '{2,options,0,correct}', 'true'))) <> 1
       OR jsonb_array_length(public.fn_lesson_parity_errors(v_en, jsonb_set(v_en, '{0,text}', '"Speed 12"'))) <> 1 THEN
        RAISE EXCEPTION 'CA4_PROOF: the parity check does not behave';
    END IF;
    IF has_table_privilege('anon', 'public.prompt_templates', 'SELECT')
       OR has_table_privilege('authenticated', 'public.prompt_templates', 'INSERT')
       OR has_column_privilege('authenticated', 'public.document_versions', 'blocks', 'SELECT') THEN
        RAISE EXCEPTION 'CA4_PROOF: a client role can write templates or read lesson bodies';
    END IF;
    IF EXISTS (SELECT 1 FROM public.learning_documents WHERE (document_type = 'NODE_LESSON') <> (node_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'CA4_PROOF: node lesson ownership';
    END IF;
END
$proof$;
