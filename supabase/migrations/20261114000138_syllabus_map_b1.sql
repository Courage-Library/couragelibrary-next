-- =====================================================================================================================
-- 138 SYLLABUS-MAP-1 B1 — shared master tree + per-exam map: the three schema additions of the approved design
-- (docs/syllabus/SYLLABUS_MAP_1_DESIGN.md §2.A; owner answers Q2 / Q3 / Q4 / Q5, 2026-11-12). No existing row changes.
--   1. taxonomy_node_outlines — ONE outline per master TOPIC / SUBTOPIC (owner Q2: a table, enforced limits): 1–30 lines,
--      each 1–200 characters, trimmed, one line, no duplicate line (case-insensitive). Written ONLY by
--      fn_taxonomy_outline_set (service_role after the admin guard, audited TAXONOMY_OUTLINE_SET / _CLEAR; the same
--      lines again = a no-op without an audit row). Not readable by any client (admin / server only).
--   2. exam_syllabus_nodes.choice_group (owner Q3: a column) — SECTION nodes only; members of one group are
--      alternatives (e.g. "English OR Hindi"); the group's pick lives in exam_syllabus_versions.metadata.choice_groups.
--      Nullable, no default value written: every existing node stays as it is.
--   3. exam_selection_stages (owner Q4: a table) — the structured "Selection process" (CBT / PET / PST / MEDICAL / DV …)
--      per exam and cycle, DRAFT → PUBLISHED → ARCHIVED. Candidates (anon / authenticated) read PUBLISHED rows only
--      (RLS); writes only through fn_selection_stages_save_draft / _publish / _discard_draft (service_role, audited).
-- No SECURITY DEFINER function (the count is unchanged): every writer is INVOKER, granted to service_role only, and is
-- called by the server after the canonical admin guard (owner Q5: admin only). search_path '' everywhere.
-- Rollback: docs/database/rollback/138_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
-- Apply ONLY per docs/database/MIGRATION_RUNBOOK.md with the owner present (owner rule 2026-11-12).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261103000137_lesson_coins_earn.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B1_138_PREFLIGHT: 137 is not applied';
    END IF;
    IF to_regclass('public.taxonomy_node_outlines') IS NOT NULL OR to_regclass('public.exam_selection_stages') IS NOT NULL THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B1_138_PREFLIGHT: a 138 table already exists';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.exam_syllabus_nodes'::regclass AND attname = 'choice_group' AND NOT attisdropped) THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B1_138_PREFLIGHT: exam_syllabus_nodes.choice_group already exists';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'canonical_taxonomy_nodes_id_node_type_key') THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B1_138_PREFLIGHT: UNIQUE (id, node_type) on canonical_taxonomy_nodes is missing (075)';
    END IF;
END
$pre$;

-- ------------------------------------------------------------------ 1. master outlines
-- the line rules, in ONE place (the CHECK and the writer use it; lib/syllabus/master-intake-contract.ts mirrors it)
CREATE FUNCTION public.fn_outline_lines_valid(p_items text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
    SELECT p_items IS NOT NULL
       AND cardinality(p_items) BETWEEN 1 AND 30
       AND NOT EXISTS (SELECT 1 FROM unnest(p_items) AS l(line)
                        WHERE l.line IS NULL OR l.line <> btrim(l.line) OR char_length(l.line) NOT BETWEEN 1 AND 200 OR l.line ~ '[\r\n\t]')
       AND (SELECT count(DISTINCT lower(l.line)) FROM unnest(p_items) AS l(line)) = cardinality(p_items)
$fn$;

CREATE TABLE public.taxonomy_node_outlines (
    node_id          uuid PRIMARY KEY,
    node_type        text NOT NULL CHECK (node_type IN ('TOPIC', 'SUBTOPIC')),
    items            text[] NOT NULL CHECK (public.fn_outline_lines_valid(items)),
    source           text NOT NULL CHECK (source IN ('MASTER_INTAKE', 'MIGRATED_FROM_EXAM', 'OWNER')),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by       uuid,
    updated_by_email text NOT NULL CHECK (char_length(btrim(updated_by_email)) BETWEEN 3 AND 320),
    CONSTRAINT taxonomy_node_outlines_node_fkey FOREIGN KEY (node_id, node_type)
        REFERENCES public.canonical_taxonomy_nodes (id, node_type) ON DELETE CASCADE
);
COMMENT ON TABLE public.taxonomy_node_outlines IS 'SYLLABUS-MAP-1 (138): the ONE lesson outline of a master TOPIC / SUBTOPIC (1–30 lines). Admin / server only; writes via fn_taxonomy_outline_set (service_role, audited).';

ALTER TABLE public.taxonomy_node_outlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taxonomy_node_outlines FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.taxonomy_node_outlines TO service_role;

CREATE FUNCTION public.fn_taxonomy_outline_set(p_node_id uuid, p_items text[], p_source text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_node public.canonical_taxonomy_nodes%ROWTYPE;
    v_old  public.taxonomy_node_outlines%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_OUTLINE: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_source IS NULL OR p_source NOT IN ('MASTER_INTAKE', 'MIGRATED_FROM_EXAM', 'OWNER') THEN
        RAISE EXCEPTION 'TAXONOMY_OUTLINE: unknown source %', p_source USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = p_node_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_OUTLINE: node not found' USING ERRCODE = 'P0002'; END IF;
    IF v_node.node_type NOT IN ('TOPIC', 'SUBTOPIC') THEN RAISE EXCEPTION 'TAXONOMY_OUTLINE: only a topic or a subtopic has an outline' USING ERRCODE = '22023'; END IF;
    IF NOT v_node.is_active OR v_node.is_internal THEN RAISE EXCEPTION 'TAXONOMY_OUTLINE: the node is inactive or internal' USING ERRCODE = '22023'; END IF;

    SELECT * INTO v_old FROM public.taxonomy_node_outlines WHERE node_id = p_node_id FOR UPDATE;

    -- NULL / empty = remove the outline
    IF p_items IS NULL OR cardinality(p_items) = 0 THEN
        IF v_old.node_id IS NULL THEN RETURN jsonb_build_object('node_id', p_node_id, 'changed', false, 'lines', 0); END IF;
        DELETE FROM public.taxonomy_node_outlines WHERE node_id = p_node_id;
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
        VALUES (p_actor_id, p_actor_email, 'TAXONOMY_OUTLINE_CLEAR', 'canonical_taxonomy_node', p_node_id,
                jsonb_build_object('items', to_jsonb(v_old.items), 'source', v_old.source), NULL);
        RETURN jsonb_build_object('node_id', p_node_id, 'changed', true, 'lines', 0);
    END IF;

    IF NOT public.fn_outline_lines_valid(p_items) THEN
        RAISE EXCEPTION 'TAXONOMY_OUTLINE: 1–30 lines, each 1–200 characters, trimmed, on one line, no duplicate line' USING ERRCODE = '22023';
    END IF;
    -- idempotent: the same lines again change nothing and write no audit row
    IF v_old.node_id IS NOT NULL AND v_old.items = p_items THEN
        RETURN jsonb_build_object('node_id', p_node_id, 'changed', false, 'lines', cardinality(p_items));
    END IF;

    INSERT INTO public.taxonomy_node_outlines (node_id, node_type, items, source, updated_at, updated_by, updated_by_email)
    VALUES (p_node_id, v_node.node_type, p_items, p_source, now(), p_actor_id, p_actor_email)
    ON CONFLICT (node_id) DO UPDATE SET items = EXCLUDED.items, source = EXCLUDED.source, updated_at = now(),
                                        updated_by = EXCLUDED.updated_by, updated_by_email = EXCLUDED.updated_by_email;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'TAXONOMY_OUTLINE_SET', 'canonical_taxonomy_node', p_node_id,
            CASE WHEN v_old.node_id IS NULL THEN NULL ELSE jsonb_build_object('items', to_jsonb(v_old.items), 'source', v_old.source) END,
            jsonb_build_object('items', to_jsonb(p_items), 'source', p_source));
    RETURN jsonb_build_object('node_id', p_node_id, 'changed', true, 'lines', cardinality(p_items));
END
$fn$;

-- ------------------------------------------------------------------ 2. alternative sections
ALTER TABLE public.exam_syllabus_nodes ADD COLUMN choice_group text;
ALTER TABLE public.exam_syllabus_nodes ADD CONSTRAINT chk_syllabus_node_choice_group CHECK (
    choice_group IS NULL
    OR (node_kind = 'SECTION' AND choice_group ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(choice_group) <= 40));
COMMENT ON COLUMN public.exam_syllabus_nodes.choice_group IS 'SYLLABUS-MAP-1 (138): SECTION alternatives (e.g. language = English OR Hindi); the pick is exam_syllabus_versions.metadata.choice_groups.<group>.pick.';

-- ------------------------------------------------------------------ 3. selection process
CREATE TABLE public.exam_selection_stages (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id          uuid NOT NULL REFERENCES public.exams (id) ON DELETE RESTRICT,
    exam_cycle_id    uuid REFERENCES public.exam_cycles (id) ON DELETE RESTRICT,
    status           text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    position         integer NOT NULL CHECK (position BETWEEN 1 AND 20),
    stage_kind       text NOT NULL CHECK (stage_kind IN ('CBT', 'WRITTEN', 'TYPING', 'SKILL', 'PET', 'PST', 'MEDICAL', 'DV', 'INTERVIEW', 'OTHER')),
    name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
    nature           text NOT NULL CHECK (nature IN ('QUALIFYING', 'MERIT')),
    paper_name       text CHECK (paper_name IS NULL OR char_length(btrim(paper_name)) BETWEEN 1 AND 200),
    details          jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8192),
    uncertain        boolean NOT NULL DEFAULT false,
    uncertain_reason text CHECK (uncertain_reason IS NULL OR char_length(uncertain_reason) BETWEEN 1 AND 500),
    source_url       text CHECK (source_url IS NULL OR (source_url ~ '^https://[^\s<>"]+$' AND char_length(source_url) <= 500)),
    as_of_date       date,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid,
    created_by_email text NOT NULL CHECK (char_length(btrim(created_by_email)) BETWEEN 3 AND 320),
    published_at     timestamptz,
    published_by     uuid,
    archived_at      timestamptz,
    CONSTRAINT chk_selection_stage_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT chk_selection_stage_archived CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL),
    -- only a written stage points at a paper of the exam's syllabus (by name: papers live in versioned syllabus nodes)
    CONSTRAINT chk_selection_stage_paper CHECK (paper_name IS NULL OR stage_kind IN ('CBT', 'WRITTEN'))
);
COMMENT ON TABLE public.exam_selection_stages IS 'SYLLABUS-MAP-1 (138): the structured selection process per exam / cycle (CBT, PET, PST, MEDICAL, DV …). Not syllabus. Candidates read PUBLISHED rows only; writes via fn_selection_stages_* (service_role, audited).';
CREATE UNIQUE INDEX uq_selection_stage_position
    ON public.exam_selection_stages (exam_id, COALESCE(exam_cycle_id, '00000000-0000-0000-0000-000000000000'::uuid), status, position)
    WHERE status IN ('DRAFT', 'PUBLISHED');
CREATE INDEX idx_selection_stages_cycle ON public.exam_selection_stages (exam_cycle_id);

ALTER TABLE public.exam_selection_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_selection_stages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.exam_selection_stages TO anon, authenticated;
GRANT ALL ON TABLE public.exam_selection_stages TO service_role;
-- candidates never see a draft or an archived stage
CREATE POLICY selection_stages_published_read ON public.exam_selection_stages FOR SELECT TO anon, authenticated USING (status = 'PUBLISHED');

-- the DRAFT set of one exam / cycle is replaced as a whole
CREATE FUNCTION public.fn_selection_stages_save_draft(
    p_exam_id uuid, p_exam_cycle_id uuid, p_stages jsonb, p_source_url text, p_as_of date, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_cycle_zero constant uuid := '00000000-0000-0000-0000-000000000000';
    v_count integer;
    v_bad   text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SELECTION_STAGES: an actor is required' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'SELECTION_STAGES: exam not found' USING ERRCODE = 'P0002'; END IF;
    IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
        RAISE EXCEPTION 'SELECTION_STAGES: the cycle does not belong to this exam' USING ERRCODE = '22023';
    END IF;
    IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION 'SELECTION_STAGES: 1–20 stages are required' USING ERRCODE = '22023';
    END IF;
    -- every stage is an object with known keys only (the TypeScript validator checks the values in detail first)
    SELECT string_agg(DISTINCT k, ', ') INTO v_bad
      FROM jsonb_array_elements(p_stages) AS s(v), LATERAL jsonb_object_keys(CASE WHEN jsonb_typeof(s.v) = 'object' THEN s.v ELSE '{"<not an object>":1}'::jsonb END) AS k
     WHERE k NOT IN ('stage', 'name', 'nature', 'paper', 'details', 'uncertain', 'uncertain_reason');
    IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'SELECTION_STAGES: unknown key(s): %', v_bad USING ERRCODE = '22023'; END IF;

    DELETE FROM public.exam_selection_stages
     WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status = 'DRAFT';
    INSERT INTO public.exam_selection_stages
        (exam_id, exam_cycle_id, status, position, stage_kind, name, nature, paper_name, details, uncertain, uncertain_reason,
         source_url, as_of_date, created_by, created_by_email)
    SELECT p_exam_id, p_exam_cycle_id, 'DRAFT', s.ord::integer, s.v ->> 'stage', btrim(s.v ->> 'name'), s.v ->> 'nature',
           NULLIF(btrim(COALESCE(s.v ->> 'paper', '')), ''), COALESCE(s.v -> 'details', '{}'::jsonb),
           COALESCE((s.v ->> 'uncertain')::boolean, false), NULLIF(btrim(COALESCE(s.v ->> 'uncertain_reason', '')), ''),
           p_source_url, p_as_of, p_actor_id, p_actor_email
      FROM jsonb_array_elements(p_stages) WITH ORDINALITY AS s(v, ord);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SELECTION_STAGES_SAVE_DRAFT', 'exam', p_exam_id, NULL,
            jsonb_build_object('exam_cycle_id', p_exam_cycle_id, 'stages', v_count,
                               'kinds', (SELECT jsonb_agg(s.v ->> 'stage' ORDER BY s.ord) FROM jsonb_array_elements(p_stages) WITH ORDINALITY AS s(v, ord))));
    RETURN jsonb_build_object('exam_id', p_exam_id, 'exam_cycle_id', p_exam_cycle_id, 'stages', v_count);
END
$fn$;

-- DRAFT → PUBLISHED; the previously PUBLISHED set of that exam / cycle → ARCHIVED (kept as history)
CREATE FUNCTION public.fn_selection_stages_publish(p_exam_id uuid, p_exam_cycle_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_cycle_zero constant uuid := '00000000-0000-0000-0000-000000000000';
    v_drafts   integer;
    v_archived integer;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SELECTION_STAGES: an actor is required' USING ERRCODE = '22023'; END IF;
    PERFORM 1 FROM public.exam_selection_stages
      WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status IN ('DRAFT', 'PUBLISHED')
      FOR UPDATE;
    SELECT count(*) INTO v_drafts FROM public.exam_selection_stages
     WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status = 'DRAFT';
    IF v_drafts = 0 THEN RAISE EXCEPTION 'SELECTION_STAGES: no draft to publish' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.exam_selection_stages SET status = 'ARCHIVED', archived_at = now()
     WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status = 'PUBLISHED';
    GET DIAGNOSTICS v_archived = ROW_COUNT;
    UPDATE public.exam_selection_stages SET status = 'PUBLISHED', published_at = now(), published_by = p_actor_id
     WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status = 'DRAFT';
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SELECTION_STAGES_PUBLISH', 'exam', p_exam_id,
            jsonb_build_object('archived', v_archived), jsonb_build_object('exam_cycle_id', p_exam_cycle_id, 'published', v_drafts));
    RETURN jsonb_build_object('published', v_drafts, 'archived', v_archived);
END
$fn$;

CREATE FUNCTION public.fn_selection_stages_discard_draft(p_exam_id uuid, p_exam_cycle_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_cycle_zero constant uuid := '00000000-0000-0000-0000-000000000000';
    v_count integer;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SELECTION_STAGES: an actor is required' USING ERRCODE = '22023'; END IF;
    DELETE FROM public.exam_selection_stages
     WHERE exam_id = p_exam_id AND COALESCE(exam_cycle_id, v_cycle_zero) = COALESCE(p_exam_cycle_id, v_cycle_zero) AND status = 'DRAFT';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
        VALUES (p_actor_id, p_actor_email, 'SELECTION_STAGES_DISCARD_DRAFT', 'exam', p_exam_id, jsonb_build_object('exam_cycle_id', p_exam_cycle_id, 'stages', v_count), NULL);
    END IF;
    RETURN jsonb_build_object('discarded', v_count);
END
$fn$;

-- ------------------------------------------------------------------ grants: server only (service_role after the admin guard)
REVOKE ALL ON FUNCTION public.fn_outline_lines_valid(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_outline_set(uuid, text[], text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_selection_stages_save_draft(uuid, uuid, jsonb, text, date, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_selection_stages_publish(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_selection_stages_discard_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_outline_lines_valid(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_outline_set(uuid, text[], text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_selection_stages_save_draft(uuid, uuid, jsonb, text, date, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_selection_stages_publish(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_selection_stages_discard_draft(uuid, uuid, uuid, text) TO service_role;
