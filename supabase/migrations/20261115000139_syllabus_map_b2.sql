-- =====================================================================================================================
-- 139 SYLLABUS-MAP-1 B2 — staging, review and import for MASTER_INTAKE v1 and EXAM_MAP v1
-- (design docs/syllabus/SYLLABUS_MAP_1_DESIGN.md §2.B–§2.D; owner answers Q1 / Q5 / Q6). A SIBLING session kind: the
-- v3 SYLLABUS_INTAKE tables and functions (116 / 119 / 124) are NOT touched and keep working.
--   syllabus_map_sessions / syllabus_map_items — one pasted file + the master-tree references it needs resolved.
--     Idempotent: the same file (contract + sha256 of its JSON) while one is under review returns THAT session (no new
--     rows); after it was imported the same file is refused.
--   fn_syllabus_map_create — stores what lib/syllabus/map-matcher.ts matched and RE-CHECKS every claim: a REF / EXACT /
--     ALIAS item must point at an active, non-internal TOPIC / SUBTOPIC (by path for a REF; by name for EXACT; by an alias
--     for ALIAS; inside the subject for a MASTER_INTAKE). Those are linked at once (exact → link). CLOSE / NEW / UNKNOWN_REF
--     items stay UNDECIDED: a fuzzy match NEVER links or creates by itself.
--   fn_syllabus_map_decide — LINK (to a node of the item's level), APPROVE_NEW (only a proposed node with a known parent:
--     creates the master node, audited TAXONOMY_NODE_CREATE — owner Q5: admin only), IGNORE.
--   fn_syllabus_map_set_outline_action — REPLACE / KEEP when a master node already has a DIFFERENT outline.
--   fn_syllabus_map_set_weightage — the exam's own weightage per map entry (EXAM_MAP, under review).
--   fn_syllabus_map_import — MASTER_INTAKE: outlines (fn_taxonomy_outline_set, 138), aliases, a missing Hindi name.
--     EXAM_MAP: ONE DRAFT exam_syllabus_versions row: PAPER → SECTION (choice_group) → one UNIT per master TOPIC (owner Q1)
--     mapped to its referenced subtopics (else the topic); the selection stages as a DRAFT set (138). Drafts are never
--     visible to candidates (published-only readers; RLS on the stages). Publishing stays the existing editor flow (125).
--   fn_syllabus_map_discard.
-- No SECURITY DEFINER (count unchanged): INVOKER, service_role only, called after the canonical admin guard; audited;
-- search_path '' everywhere. Rollback: docs/database/rollback/139_rollback.sql. No BEGIN / COMMIT (the runner owns it).
-- Apply ONLY per docs/database/MIGRATION_RUNBOOK.md with the owner present, after the LOCAL_PG_TEST cycle.
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261114000138_syllabus_map_b1.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B2_139_PREFLIGHT: 138 is not applied';
    END IF;
    IF to_regclass('public.syllabus_map_sessions') IS NOT NULL OR to_regclass('public.syllabus_map_items') IS NOT NULL THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B2_139_PREFLIGHT: a 139 table already exists';
    END IF;
    IF to_regprocedure('public.fn_taxonomy_outline_set(uuid, text[], text, uuid, text)') IS NULL
       OR to_regprocedure('public.fn_selection_stages_save_draft(uuid, uuid, jsonb, text, date, uuid, text)') IS NULL
       OR to_regprocedure('public.fn_syllabus__create_version(uuid, uuid, text, text, uuid, text, jsonb)') IS NULL
       OR to_regprocedure('public.fn_syllabus__insert_node(uuid, uuid, text, text, text, integer, text, text, integer, integer, boolean)') IS NULL
       OR to_regprocedure('public.fn_taxonomy_add_alias(uuid, text, text, text, uuid, text)') IS NULL
       OR to_regprocedure('public.fn_taxonomy_audit(uuid, text, text, uuid, jsonb, jsonb, text)') IS NULL THEN
        RAISE EXCEPTION 'SYLLABUS_MAP_B2_139_PREFLIGHT: a helper function is missing';
    END IF;
END
$pre$;

-- ------------------------------------------------------------------ staging
CREATE TABLE public.syllabus_map_sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract            text NOT NULL CHECK (contract IN ('MASTER_INTAKE', 'EXAM_MAP')),
    contract_version    integer NOT NULL CHECK (contract_version = 1),
    subject_node_id     uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    exam_id             uuid REFERENCES public.exams (id) ON DELETE RESTRICT,
    exam_cycle_id       uuid REFERENCES public.exam_cycles (id) ON DELETE RESTRICT,
    tier                text CHECK (tier IS NULL OR (tier ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(tier) <= 40)),
    payload             jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 262144),
    payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    status              text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW', 'IMPORTED', 'DISCARDED')),
    imported_version_id uuid REFERENCES public.exam_syllabus_versions (id) ON DELETE SET NULL,
    result              jsonb,
    created_by          uuid,
    created_by_email    text NOT NULL CHECK (char_length(btrim(created_by_email)) BETWEEN 3 AND 320),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_map_session_target CHECK (
        (contract = 'MASTER_INTAKE' AND subject_node_id IS NOT NULL AND exam_id IS NULL AND exam_cycle_id IS NULL AND tier IS NULL)
        OR (contract = 'EXAM_MAP' AND exam_id IS NOT NULL AND subject_node_id IS NULL))
);
COMMENT ON TABLE public.syllabus_map_sessions IS 'SYLLABUS-MAP-1 (139): one pasted MASTER_INTAKE / EXAM_MAP file under review. Admin / server only; writes via fn_syllabus_map_* (service_role, audited).';
-- the same file is ONE session while under review (idempotent paste; a parallel duplicate loses on this index)
CREATE UNIQUE INDEX uq_syllabus_map_session_file ON public.syllabus_map_sessions (contract, payload_sha256) WHERE status IN ('REVIEW', 'IMPORTED');

CREATE TABLE public.syllabus_map_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id       uuid NOT NULL REFERENCES public.syllabus_map_sessions (id) ON DELETE CASCADE,
    parent_item_id   uuid REFERENCES public.syllabus_map_items (id) ON DELETE CASCADE,
    item_key         text NOT NULL CHECK (item_key ~ '^[a-z0-9.]+$' AND char_length(item_key) <= 64),
    position         integer NOT NULL CHECK (position >= 0),
    -- REF: a master path · NAME: a name to find · NEW: a proposed node (a parent path or a proposed parent item)
    kind             text NOT NULL CHECK (kind IN ('REF', 'NAME', 'NEW')),
    level            text CHECK (level IS NULL OR level IN ('TOPIC', 'SUBTOPIC')),
    ref_path         text CHECK (ref_path IS NULL OR (ref_path ~ '^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*){1,3}$' AND char_length(ref_path) <= 500)),
    parent_node_id   uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    raw_name         text CHECK (raw_name IS NULL OR char_length(btrim(raw_name)) BETWEEN 1 AND 200),
    raw_name_hi      text CHECK (raw_name_hi IS NULL OR char_length(btrim(raw_name_hi)) BETWEEN 1 AND 200),
    aliases          text[] NOT NULL DEFAULT '{}' CHECK (cardinality(aliases) <= 10),
    outline          text[] CHECK (outline IS NULL OR public.fn_outline_lines_valid(outline)),
    section_key      text CHECK (section_key IS NULL OR section_key ~ '^p[0-9]+\.s[0-9]+$'),
    weightage_tier   text CHECK (weightage_tier IS NULL OR weightage_tier IN ('HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL')),
    avg_questions    numeric CHECK (avg_questions IS NULL OR (avg_questions >= 0 AND avg_questions <= 1000)),
    origin           text CHECK (origin IS NULL OR origin IN ('OFFICIAL', 'PYQ_TREND', 'EXPANDED')),
    match_status     text NOT NULL CHECK (match_status IN ('EXACT_REF', 'EXACT', 'ALIAS', 'CLOSE', 'NEW', 'UNKNOWN_REF')),
    matched_node_id  uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    candidates       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(candidates) = 'array' AND jsonb_array_length(candidates) <= 3),
    decision         text CHECK (decision IS NULL OR decision IN ('LINK', 'APPROVE_NEW', 'IGNORE')),
    decision_node_id uuid REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE RESTRICT,
    outline_conflict boolean NOT NULL DEFAULT false,
    outline_action   text CHECK (outline_action IS NULL OR outline_action IN ('REPLACE', 'KEEP')),
    decided_by       uuid,
    decided_by_email text,
    decided_at       timestamptz,
    CONSTRAINT uq_syllabus_map_item_key UNIQUE (session_id, item_key),
    CONSTRAINT chk_map_item_decision_node CHECK (
        decision IS NULL OR (decision = 'IGNORE' AND decision_node_id IS NULL) OR (decision IN ('LINK', 'APPROVE_NEW') AND decision_node_id IS NOT NULL)),
    CONSTRAINT chk_map_item_matched CHECK ((match_status IN ('EXACT_REF', 'EXACT', 'ALIAS')) = (matched_node_id IS NOT NULL)),
    -- only a proposed node has a parent (a path / name item names an existing node: it can never be created)
    CONSTRAINT chk_map_item_parent CHECK (kind = 'NEW' OR (parent_node_id IS NULL AND parent_item_id IS NULL)),
    CONSTRAINT chk_map_item_kind CHECK (
        (kind = 'REF' AND ref_path IS NOT NULL) OR (kind = 'NAME' AND raw_name IS NOT NULL) OR (kind = 'NEW' AND raw_name IS NOT NULL AND level IS NOT NULL))
);
COMMENT ON TABLE public.syllabus_map_items IS 'SYLLABUS-MAP-1 (139): a master-tree reference of a pasted file and its review decision. Fuzzy (CLOSE) items are never decided automatically.';
CREATE INDEX idx_syllabus_map_items_session ON public.syllabus_map_items (session_id);
CREATE INDEX idx_syllabus_map_items_parent ON public.syllabus_map_items (parent_item_id);

ALTER TABLE public.syllabus_map_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syllabus_map_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.syllabus_map_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.syllabus_map_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.syllabus_map_sessions TO service_role;
GRANT ALL ON TABLE public.syllabus_map_items TO service_role;

-- ------------------------------------------------------------------ helpers (internal; no client grant)
CREATE FUNCTION public.fn_syllabus_map__audit(p_actor_id uuid, p_actor_email text, p_action text, p_entity text, p_target_id uuid, p_new jsonb)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, p_action, p_entity, p_target_id::text, NULL, p_new);
END
$fn$;

-- does a MASTER node of this level exist, active, public, (inside the subject when one is given)?
CREATE FUNCTION public.fn_syllabus_map__node_ok(p_node_id uuid, p_level text, p_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM public.canonical_taxonomy_nodes n
         WHERE n.id = p_node_id AND n.is_active AND NOT n.is_internal
           AND n.node_type IN ('TOPIC', 'SUBTOPIC') AND (p_level IS NULL OR n.node_type = p_level)
           AND (p_subject_id IS NULL OR n.root_subject_id = p_subject_id
                OR n.hierarchy_path LIKE (SELECT s.hierarchy_path || '.%' FROM public.canonical_taxonomy_nodes s WHERE s.id = p_subject_id)))
$fn$;

-- a MASTER item whose node already has a DIFFERENT outline needs REPLACE / KEEP
CREATE FUNCTION public.fn_syllabus_map__outline_conflict(p_node_id uuid, p_outline text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $fn$
    SELECT p_outline IS NOT NULL AND EXISTS (SELECT 1 FROM public.taxonomy_node_outlines o WHERE o.node_id = p_node_id AND o.items <> p_outline)
$fn$;

-- ------------------------------------------------------------------ create (idempotent; re-checks every claim)
CREATE FUNCTION public.fn_syllabus_map_create(
    p_contract text, p_subject_node_id uuid, p_exam_id uuid, p_exam_cycle_id uuid, p_tier text,
    p_payload jsonb, p_payload_sha256 text, p_items jsonb, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_existing public.syllabus_map_sessions%ROWTYPE;
    v_sid      uuid;
    v_subject  uuid := CASE WHEN p_contract = 'MASTER_INTAKE' THEN p_subject_node_id END;
    r          record;
    v_node     public.canonical_taxonomy_nodes%ROWTYPE;
    v_parent   uuid;
    v_count    integer := 0;
    v_linked   integer := 0;
    v_cand     jsonb;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_contract IS NULL OR p_contract NOT IN ('MASTER_INTAKE', 'EXAM_MAP') THEN RAISE EXCEPTION 'SYLLABUS_MAP: unknown contract %', p_contract USING ERRCODE = '22023'; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION 'SYLLABUS_MAP: 1–1000 items are required' USING ERRCODE = '22023';
    END IF;

    -- idempotent: the same file again
    SELECT * INTO v_existing FROM public.syllabus_map_sessions
     WHERE contract = p_contract AND payload_sha256 = p_payload_sha256 AND status IN ('REVIEW', 'IMPORTED') FOR UPDATE;
    IF FOUND THEN
        IF v_existing.status = 'IMPORTED' THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: this exact file was already imported (session %)', v_existing.id USING ERRCODE = 'P0001';
        END IF;
        RETURN jsonb_build_object('session_id', v_existing.id, 'created', false);
    END IF;

    IF p_contract = 'MASTER_INTAKE' THEN
        IF NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes WHERE id = p_subject_node_id AND node_type = 'SUBJECT' AND is_active) THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: the subject is not an active master subject' USING ERRCODE = '22023';
        END IF;
    ELSE
        IF NOT EXISTS (SELECT 1 FROM public.exams WHERE id = p_exam_id) THEN RAISE EXCEPTION 'SYLLABUS_MAP: exam not found' USING ERRCODE = 'P0002'; END IF;
        IF p_exam_cycle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.exam_cycles WHERE id = p_exam_cycle_id AND exam_id = p_exam_id) THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: the cycle does not belong to this exam' USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.syllabus_map_sessions (contract, contract_version, subject_node_id, exam_id, exam_cycle_id, tier, payload, payload_sha256, created_by, created_by_email)
    VALUES (p_contract, 1, v_subject, CASE WHEN p_contract = 'EXAM_MAP' THEN p_exam_id END, CASE WHEN p_contract = 'EXAM_MAP' THEN p_exam_cycle_id END,
            CASE WHEN p_contract = 'EXAM_MAP' THEN p_tier END, p_payload, p_payload_sha256, p_actor_id, p_actor_email)
    RETURNING id INTO v_sid;

    FOR r IN SELECT x.v, x.ord FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(v, ord) ORDER BY x.ord LOOP
        v_count := v_count + 1;
        IF jsonb_typeof(r.v) <> 'object' THEN RAISE EXCEPTION 'SYLLABUS_MAP: item % is not an object', r.ord USING ERRCODE = '22023'; END IF;
        -- the parent of a proposed node: a master node of the right type, or a proposed parent item of this file
        v_parent := NULLIF(r.v ->> 'parent_node_id', '')::uuid;
        IF r.v ->> 'kind' = 'NEW' AND v_parent IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM public.canonical_taxonomy_nodes p WHERE p.id = v_parent AND p.is_active AND NOT p.is_internal
                  AND p.node_type = CASE r.v ->> 'level' WHEN 'TOPIC' THEN 'SUBJECT' ELSE 'TOPIC' END
                  AND (v_subject IS NULL OR p.id = v_subject OR p.parent_id = v_subject)) THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: item % — the parent is not an active % %', r.v ->> 'key',
                CASE r.v ->> 'level' WHEN 'TOPIC' THEN 'subject' ELSE 'topic' END, CASE WHEN v_subject IS NULL THEN '' ELSE 'of this subject' END USING ERRCODE = '22023';
        END IF;
        -- an exact claim is re-checked here; anything that is not exact stays undecided
        IF r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN
            SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = (r.v ->> 'matched_node_id')::uuid;
            IF NOT FOUND OR NOT public.fn_syllabus_map__node_ok(v_node.id, NULLIF(r.v ->> 'level', ''), v_subject)
               OR (r.v ->> 'match_status' = 'EXACT_REF' AND v_node.hierarchy_path IS DISTINCT FROM r.v ->> 'ref_path')
               OR (r.v ->> 'match_status' = 'EXACT' AND public.fn_taxonomy_normalize(r.v ->> 'raw_name') NOT IN
                     (public.fn_taxonomy_normalize(v_node.name), coalesce(public.fn_taxonomy_normalize(v_node.name_hi), '')))
               OR (r.v ->> 'match_status' = 'ALIAS' AND NOT EXISTS (
                     SELECT 1 FROM public.taxonomy_node_aliases a
                      WHERE a.node_id = v_node.id AND a.normalized_alias IN (
                            SELECT public.fn_taxonomy_normalize(t) FROM jsonb_array_elements_text(coalesce(r.v -> 'aliases', '[]'::jsonb)) t
                            UNION SELECT public.fn_taxonomy_normalize(r.v ->> 'raw_name')))
                   AND public.fn_taxonomy_normalize(v_node.name) NOT IN (SELECT public.fn_taxonomy_normalize(t) FROM jsonb_array_elements_text(coalesce(r.v -> 'aliases', '[]'::jsonb)) t))
               OR (r.v ->> 'kind' = 'NEW' AND v_parent IS NOT NULL AND v_node.parent_id <> v_parent) THEN
                RAISE EXCEPTION 'SYLLABUS_MAP: item % — the % claim does not hold', r.v ->> 'key', r.v ->> 'match_status' USING ERRCODE = '22023';
            END IF;
        END IF;
        -- candidates of a CLOSE / NEW / UNKNOWN_REF item: active public nodes only
        SELECT coalesce(jsonb_agg(c.v), '[]'::jsonb) INTO v_cand
          FROM jsonb_array_elements(coalesce(r.v -> 'candidates', '[]'::jsonb)) c(v)
         WHERE public.fn_syllabus_map__node_ok((c.v ->> 'node_id')::uuid, NULL, v_subject);
        INSERT INTO public.syllabus_map_items (
            session_id, parent_item_id, item_key, position, kind, level, ref_path, parent_node_id, raw_name, raw_name_hi, aliases, outline,
            section_key, weightage_tier, avg_questions, origin, match_status, matched_node_id, candidates,
            decision, decision_node_id, outline_conflict, decided_by, decided_by_email, decided_at)
        SELECT v_sid,
               (SELECT pi.id FROM public.syllabus_map_items pi WHERE pi.session_id = v_sid AND pi.item_key = r.v ->> 'parent_key'),
               r.v ->> 'key', (r.ord - 1)::integer, r.v ->> 'kind',
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN v_node.node_type ELSE NULLIF(r.v ->> 'level', '') END,
               NULLIF(r.v ->> 'ref_path', ''), v_parent, NULLIF(btrim(coalesce(r.v ->> 'raw_name', '')), ''), NULLIF(btrim(coalesce(r.v ->> 'raw_name_hi', '')), ''),
               coalesce(ARRAY(SELECT jsonb_array_elements_text(r.v -> 'aliases')), '{}'),
               CASE WHEN jsonb_typeof(r.v -> 'outline') = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(r.v -> 'outline')) END,
               NULLIF(r.v ->> 'section_key', ''), NULLIF(r.v ->> 'weightage_tier', ''), NULLIF(r.v ->> 'avg_questions', '')::numeric, NULLIF(r.v ->> 'origin', ''),
               r.v ->> 'match_status',
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN v_node.id END,
               v_cand,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN 'LINK' END,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN v_node.id END,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') AND jsonb_typeof(r.v -> 'outline') = 'array'
                    THEN public.fn_syllabus_map__outline_conflict(v_node.id, ARRAY(SELECT jsonb_array_elements_text(r.v -> 'outline'))) ELSE false END,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN p_actor_id END,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN p_actor_email END,
               CASE WHEN r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN now() END;
        IF r.v ->> 'match_status' IN ('EXACT_REF', 'EXACT', 'ALIAS') THEN v_linked := v_linked + 1; END IF;
        v_node := NULL;
    END LOOP;

    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_CREATE', 'syllabus_map_session', v_sid,
        jsonb_build_object('contract', p_contract, 'items', v_count, 'linked', v_linked, 'payload_sha256', p_payload_sha256,
                           'exam_id', p_exam_id, 'subject_node_id', v_subject));
    RETURN jsonb_build_object('session_id', v_sid, 'created', true, 'items', v_count, 'linked', v_linked);
END
$fn$;

-- ------------------------------------------------------------------ decide (LINK / APPROVE_NEW / IGNORE)
CREATE FUNCTION public.fn_syllabus_map_decide(p_item_id uuid, p_decision text, p_node_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_item    public.syllabus_map_items%ROWTYPE;
    v_s       public.syllabus_map_sessions%ROWTYPE;
    v_parent  uuid;
    v_node    public.canonical_taxonomy_nodes%ROWTYPE;
    v_result  uuid;
    v_slug    text;
    v_alias   text;
    v_ignored integer := 0;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_item FROM public.syllabus_map_items WHERE id = p_item_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_MAP: item not found' USING ERRCODE = 'P0002'; END IF;
    SELECT * INTO v_s FROM public.syllabus_map_sessions WHERE id = v_item.session_id FOR UPDATE;
    IF v_s.status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_MAP: the file is % and can no longer change', v_s.status USING ERRCODE = 'P0001'; END IF;
    IF p_decision IS NULL OR p_decision NOT IN ('LINK', 'APPROVE_NEW', 'IGNORE') THEN RAISE EXCEPTION 'SYLLABUS_MAP: unknown decision %', p_decision USING ERRCODE = '22023'; END IF;
    IF v_item.decision = 'APPROVE_NEW' THEN
        RAISE EXCEPTION 'SYLLABUS_MAP: "%" already created a master node; it cannot be re-decided', coalesce(v_item.raw_name, v_item.ref_path) USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.syllabus_map_items c WHERE c.parent_item_id = p_item_id AND c.decision = 'APPROVE_NEW') THEN
        RAISE EXCEPTION 'SYLLABUS_MAP: a proposed node below "%" was already created; it cannot be re-decided', v_item.raw_name USING ERRCODE = 'P0001';
    END IF;

    IF p_decision = 'IGNORE' THEN
        -- the item and the proposed nodes below it
        WITH RECURSIVE sub AS (
            SELECT id FROM public.syllabus_map_items WHERE id = p_item_id
            UNION ALL SELECT c.id FROM public.syllabus_map_items c JOIN sub ON c.parent_item_id = sub.id)
        UPDATE public.syllabus_map_items i SET decision = 'IGNORE', decision_node_id = NULL, outline_conflict = false, outline_action = NULL,
               decided_by = p_actor_id, decided_by_email = p_actor_email, decided_at = now()
          FROM sub WHERE i.id = sub.id;
        GET DIAGNOSTICS v_ignored = ROW_COUNT;
        v_result := NULL;
    ELSIF p_decision = 'LINK' THEN
        IF NOT public.fn_syllabus_map__node_ok(p_node_id, v_item.level, v_s.subject_node_id) THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: link "%" to an active, public % %', coalesce(v_item.raw_name, v_item.ref_path),
                lower(coalesce(v_item.level, 'topic or subtopic')), CASE WHEN v_s.subject_node_id IS NULL THEN '' ELSE 'of this subject' END USING ERRCODE = '22023';
        END IF;
        SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = p_node_id;
        v_result := v_node.id;
        UPDATE public.syllabus_map_items SET level = v_node.node_type, outline_conflict = public.fn_syllabus_map__outline_conflict(v_node.id, outline),
               outline_action = NULL WHERE id = p_item_id;
    ELSE -- APPROVE_NEW (owner Q5: the server allows it to admins only)
        IF v_item.kind <> 'NEW' THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: only a proposed node can be created ("%" names an existing one: link it or ignore it)', coalesce(v_item.raw_name, v_item.ref_path) USING ERRCODE = '22023';
        END IF;
        v_parent := v_item.parent_node_id;
        IF v_parent IS NULL AND v_item.parent_item_id IS NOT NULL THEN
            SELECT decision_node_id INTO v_parent FROM public.syllabus_map_items WHERE id = v_item.parent_item_id AND decision IN ('LINK', 'APPROVE_NEW');
            IF v_parent IS NULL THEN RAISE EXCEPTION 'SYLLABUS_MAP: decide the proposed parent of "%" first', v_item.raw_name USING ERRCODE = 'P0001'; END IF;
        END IF;
        IF v_parent IS NULL THEN RAISE EXCEPTION 'SYLLABUS_MAP: "%" has no parent to create it under', v_item.raw_name USING ERRCODE = '22023'; END IF;
        v_slug := public.fn_syllabus__slugify(v_item.raw_name);
        IF v_slug IS NULL THEN RAISE EXCEPTION 'SYLLABUS_MAP: "%" gives no usable slug; rename it first', v_item.raw_name USING ERRCODE = '22023'; END IF;
        INSERT INTO public.canonical_taxonomy_nodes (parent_id, node_type, name, name_hi, slug, display_order, is_active, metadata)
        VALUES (v_parent, v_item.level, btrim(v_item.raw_name), v_item.raw_name_hi, v_slug,
                coalesce((SELECT max(display_order) + 1 FROM public.canonical_taxonomy_nodes WHERE parent_id = v_parent), 0),
                true, jsonb_build_object('source', 'SYLLABUS_MAP', 'syllabus_map_item_id', v_item.id))
        RETURNING id INTO v_result;
        PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_CREATE', v_result, NULL,
            jsonb_build_object('name', v_item.raw_name, 'name_hi', v_item.raw_name_hi, 'node_type', v_item.level, 'parent_id', v_parent,
                               'slug', v_slug, 'syllabus_map_item_id', v_item.id), 'syllabus map: approved as new');
        FOREACH v_alias IN ARRAY v_item.aliases LOOP
            CONTINUE WHEN public.fn_taxonomy_normalize(v_alias) = public.fn_taxonomy_normalize(v_item.raw_name);
            PERFORM public.fn_taxonomy_add_alias(v_result, v_alias, 'en', 'INTAKE', p_actor_id, p_actor_email);
        END LOOP;
        UPDATE public.syllabus_map_items SET outline_conflict = false, outline_action = NULL WHERE id = p_item_id;
    END IF;

    IF p_decision <> 'IGNORE' THEN
        UPDATE public.syllabus_map_items SET decision = p_decision, decision_node_id = v_result, decided_by = p_actor_id,
               decided_by_email = p_actor_email, decided_at = now() WHERE id = p_item_id;
    END IF;
    UPDATE public.syllabus_map_sessions SET updated_at = now() WHERE id = v_s.id;
    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_DECISION', 'syllabus_map_item', p_item_id,
        jsonb_build_object('session_id', v_s.id, 'decision', p_decision, 'node_id', v_result, 'previous', v_item.decision, 'ignored', v_ignored));
    RETURN jsonb_build_object('item_id', p_item_id, 'decision', p_decision, 'node_id', v_result, 'ignored', v_ignored);
END
$fn$;

CREATE FUNCTION public.fn_syllabus_map_set_outline_action(p_item_id uuid, p_action text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_item public.syllabus_map_items%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_action IS NULL OR p_action NOT IN ('REPLACE', 'KEEP') THEN RAISE EXCEPTION 'SYLLABUS_MAP: the outline action is REPLACE or KEEP' USING ERRCODE = '22023'; END IF;
    SELECT i.* INTO v_item FROM public.syllabus_map_items i JOIN public.syllabus_map_sessions s ON s.id = i.session_id
     WHERE i.id = p_item_id AND s.status = 'REVIEW' FOR UPDATE OF i;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_MAP: item not found or the file is no longer under review' USING ERRCODE = 'P0002'; END IF;
    IF NOT v_item.outline_conflict THEN RAISE EXCEPTION 'SYLLABUS_MAP: this item has no outline conflict' USING ERRCODE = '22023'; END IF;
    UPDATE public.syllabus_map_items SET outline_action = p_action WHERE id = p_item_id;
    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_OUTLINE_ACTION', 'syllabus_map_item', p_item_id,
        jsonb_build_object('session_id', v_item.session_id, 'action', p_action, 'node_id', v_item.decision_node_id));
    RETURN jsonb_build_object('item_id', p_item_id, 'outline_action', p_action);
END
$fn$;

CREATE FUNCTION public.fn_syllabus_map_set_weightage(p_item_id uuid, p_tier text, p_avg_questions numeric, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_item public.syllabus_map_items%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT i.* INTO v_item FROM public.syllabus_map_items i JOIN public.syllabus_map_sessions s ON s.id = i.session_id
     WHERE i.id = p_item_id AND s.status = 'REVIEW' AND s.contract = 'EXAM_MAP' FOR UPDATE OF i;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_MAP: an exam-map item under review is required' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.syllabus_map_items SET weightage_tier = p_tier, avg_questions = p_avg_questions WHERE id = p_item_id;
    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_WEIGHTAGE', 'syllabus_map_item', p_item_id,
        jsonb_build_object('session_id', v_item.session_id, 'from', jsonb_build_object('tier', v_item.weightage_tier, 'avg_questions', v_item.avg_questions),
                           'to', jsonb_build_object('tier', p_tier, 'avg_questions', p_avg_questions)));
    RETURN jsonb_build_object('item_id', p_item_id, 'weightage_tier', p_tier, 'avg_questions', p_avg_questions);
END
$fn$;

-- ------------------------------------------------------------------ import
CREATE FUNCTION public.fn_syllabus_map_import(p_session_id uuid, p_version_tag text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    s           public.syllabus_map_sessions%ROWTYPE;
    v_open      integer;
    v_tag       text := NULLIF(btrim(coalesce(p_version_tag, '')), '');
    it          record;
    v_alias     text;
    v_res       jsonb;
    v_set       integer := 0;
    v_same      integer := 0;
    v_kept      integer := 0;
    v_aliases   integer := 0;
    v_hi        integer := 0;
    v_ver       public.exam_syllabus_versions;
    pp          record;
    ss          record;
    tp          record;
    v_pid       uuid;
    v_sid       uuid;
    v_uid       uuid;
    v_targets   uuid[];
    v_papers    integer := 0;
    v_sections  integer := 0;
    v_units     integer := 0;
    v_maps      integer := 0;
    v_stages    integer := 0;
    v_groups    jsonb := '{}'::jsonb;
    v_rank      constant text[] := ARRAY['HIGH_YIELD', 'CORE', 'MODERATE', 'LOW', 'OPTIONAL'];
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO s FROM public.syllabus_map_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_MAP: file not found' USING ERRCODE = 'P0002'; END IF;
    IF s.status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_MAP: the file is %', s.status USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_open FROM public.syllabus_map_items WHERE session_id = p_session_id AND decision IS NULL;
    IF v_open > 0 THEN RAISE EXCEPTION 'SYLLABUS_MAP: % item(s) are not decided yet', v_open USING ERRCODE = 'P0001'; END IF;
    SELECT count(*) INTO v_open FROM public.syllabus_map_items WHERE session_id = p_session_id AND outline_conflict AND outline_action IS NULL AND decision <> 'IGNORE';
    IF v_open > 0 THEN RAISE EXCEPTION 'SYLLABUS_MAP: % outline conflict(s) need REPLACE or KEEP', v_open USING ERRCODE = 'P0001'; END IF;

    IF s.contract = 'MASTER_INTAKE' THEN
        FOR it IN SELECT i.*, n.name AS node_name, n.name_hi AS node_name_hi FROM public.syllabus_map_items i
                    JOIN public.canonical_taxonomy_nodes n ON n.id = i.decision_node_id
                   WHERE i.session_id = p_session_id AND i.decision IN ('LINK', 'APPROVE_NEW') ORDER BY i.position LOOP
            IF it.outline IS NOT NULL THEN
                IF it.outline_conflict AND it.outline_action = 'KEEP' THEN
                    v_kept := v_kept + 1;
                ELSE
                    v_res := public.fn_taxonomy_outline_set(it.decision_node_id, it.outline, 'MASTER_INTAKE', p_actor_id, p_actor_email);
                    IF (v_res ->> 'changed')::boolean THEN v_set := v_set + 1; ELSE v_same := v_same + 1; END IF;
                END IF;
            END IF;
            FOREACH v_alias IN ARRAY it.aliases LOOP
                CONTINUE WHEN public.fn_taxonomy_normalize(v_alias) = public.fn_taxonomy_normalize(it.node_name);
                CONTINUE WHEN EXISTS (SELECT 1 FROM public.taxonomy_node_aliases a WHERE a.node_id = it.decision_node_id AND a.normalized_alias = public.fn_taxonomy_normalize(v_alias));
                PERFORM public.fn_taxonomy_add_alias(it.decision_node_id, v_alias, 'en', 'INTAKE', p_actor_id, p_actor_email);
                v_aliases := v_aliases + 1;
            END LOOP;
            -- a Hindi name only where the node has none (a different existing one is never overwritten)
            IF it.raw_name_hi IS NOT NULL AND it.node_name_hi IS NULL AND it.kind <> 'NEW' THEN
                UPDATE public.canonical_taxonomy_nodes SET name_hi = it.raw_name_hi WHERE id = it.decision_node_id;
                PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_UPDATE', it.decision_node_id,
                    jsonb_build_object('name_hi', NULL), jsonb_build_object('name_hi', it.raw_name_hi), 'syllabus map: master intake');
                v_hi := v_hi + 1;
            END IF;
        END LOOP;
        v_res := jsonb_build_object('outlines_set', v_set, 'outlines_unchanged', v_same, 'outlines_kept', v_kept, 'aliases_added', v_aliases, 'hindi_names_added', v_hi);
    ELSE
        IF v_tag IS NOT NULL AND (v_tag !~ '^[a-z0-9]+([-.][a-z0-9]+)*$' OR char_length(v_tag) > 80) THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: the version tag must be lower-case letters, digits, "-" or "."' USING ERRCODE = '22023';
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('exam_syllabus:' || s.exam_id::text, 0));
        IF EXISTS (SELECT 1 FROM public.exam_syllabus_versions WHERE exam_id = s.exam_id AND exam_cycle_id IS NOT DISTINCT FROM s.exam_cycle_id
                     AND tier IS NOT DISTINCT FROM s.tier AND status = 'DRAFT') THEN
            RAISE EXCEPTION 'SYLLABUS_MAP: a DRAFT is already open for this exam / cycle / tier; publish or delete it first' USING ERRCODE = 'P0001';
        END IF;
        -- choice groups by id (owner Q3); also kept on each PAPER node
        SELECT coalesce(jsonb_object_agg(g.v ->> 'id', jsonb_build_object('label', g.v ->> 'label', 'pick', (g.v ->> 'pick')::integer)), '{}'::jsonb)
          INTO v_groups
          FROM jsonb_array_elements(s.payload -> 'papers') p(v), jsonb_array_elements(coalesce(p.v -> 'choice_groups', '[]'::jsonb)) g(v);
        v_ver := public.fn_syllabus__create_version(s.exam_id, s.exam_cycle_id, v_tag, 'IMPORT', NULL, s.payload_sha256,
            jsonb_build_object('syllabus_map', jsonb_strip_nulls(jsonb_build_object('session_id', s.id, 'contract', 'EXAM_MAP', 'contract_version', 1,
                                  'based_on', s.payload ->> 'based_on', 'source_url', s.payload ->> 'source_url', 'as_of', s.payload ->> 'as_of',
                                  'payload_sha256', s.payload_sha256)),
                               'choice_groups', v_groups));
        UPDATE public.exam_syllabus_versions SET tier = s.tier, created_by = p_actor_id WHERE id = v_ver.id;

        FOR pp IN SELECT p.v, (p.ord - 1)::integer AS pi FROM jsonb_array_elements(s.payload -> 'papers') WITH ORDINALITY p(v, ord) ORDER BY p.ord LOOP
            v_pid := public.fn_syllabus__insert_node(v_ver.id, NULL, 'PAPER', pp.v ->> 'name', NULL, pp.pi + 1, NULL, NULL,
                                                     (pp.v ->> 'questions')::integer, (pp.v ->> 'questions')::integer, true);
            -- time and negative marking live in the node metadata, as the v3 import keeps them
            UPDATE public.exam_syllabus_nodes
               SET metadata = jsonb_strip_nulls(jsonb_build_object('marks', (pp.v ->> 'marks')::numeric, 'name_hi', pp.v ->> 'name_hi',
                                  'duration_minutes', (pp.v ->> 'duration_minutes')::integer, 'negative_marking', pp.v -> 'negative_marking',
                                  'choice_groups', pp.v -> 'choice_groups', 'syllabus_map_session_id', s.id))
             WHERE id = v_pid;
            v_papers := v_papers + 1;
            FOR ss IN SELECT x.v, (x.ord - 1)::integer AS si FROM jsonb_array_elements(pp.v -> 'sections') WITH ORDINALITY x(v, ord) ORDER BY x.ord LOOP
                v_sid := public.fn_syllabus__insert_node(v_ver.id, v_pid, 'SECTION', ss.v ->> 'name', NULL, ss.si + 1, NULL, NULL,
                                                         (ss.v ->> 'questions')::integer, (ss.v ->> 'questions')::integer, true);
                UPDATE public.exam_syllabus_nodes SET choice_group = NULLIF(ss.v ->> 'choice_group', ''),
                       metadata = jsonb_strip_nulls(jsonb_build_object('marks', (ss.v ->> 'marks')::numeric, 'name_hi', ss.v ->> 'name_hi',
                                      'duration_minutes', (ss.v ->> 'duration_minutes')::integer))
                 WHERE id = v_sid;
                v_sections := v_sections + 1;
                -- one UNIT per master TOPIC (owner Q1), in the order the topics first appear in the section
                FOR tp IN
                    WITH e AS (
                        SELECT i.*, n.node_type, n.name, CASE WHEN n.node_type = 'TOPIC' THEN n.id ELSE n.parent_id END AS topic_id
                          FROM public.syllabus_map_items i JOIN public.canonical_taxonomy_nodes n ON n.id = i.decision_node_id
                         WHERE i.session_id = p_session_id AND i.section_key = format('p%s.s%s', pp.pi, ss.si) AND i.decision IN ('LINK', 'APPROVE_NEW'))
                    SELECT e.topic_id, t.name AS topic_name, min(e.position) AS first_pos,
                           array_agg(e.decision_node_id ORDER BY e.position) FILTER (WHERE e.node_type = 'SUBTOPIC') AS subs,
                           (array_agg(e.weightage_tier ORDER BY array_position(v_rank, e.weightage_tier)) FILTER (WHERE e.node_type = 'TOPIC' AND e.weightage_tier IS NOT NULL))[1] AS topic_tier,
                           (array_agg(e.weightage_tier ORDER BY array_position(v_rank, e.weightage_tier)) FILTER (WHERE e.weightage_tier IS NOT NULL))[1] AS best_tier,
                           max(e.avg_questions) FILTER (WHERE e.node_type = 'TOPIC') AS topic_avg,
                           CASE WHEN bool_and(e.avg_questions IS NOT NULL) FILTER (WHERE e.node_type = 'SUBTOPIC') THEN sum(e.avg_questions) FILTER (WHERE e.node_type = 'SUBTOPIC') END AS subs_avg,
                           (array_agg(e.origin ORDER BY e.position) FILTER (WHERE e.origin IS NOT NULL))[1] AS origin,
                           bool_or(e.match_status = 'ALIAS') AS by_alias,
                           bool_and(e.match_status IN ('EXACT_REF', 'EXACT')) AS all_exact,
                           jsonb_agg(jsonb_strip_nulls(jsonb_build_object('node_id', e.decision_node_id, 'item_key', e.item_key, 'weightage_tier', e.weightage_tier,
                                                                         'avg_questions', e.avg_questions, 'origin', e.origin)) ORDER BY e.position) AS entries
                      FROM e JOIN public.canonical_taxonomy_nodes t ON t.id = e.topic_id
                     GROUP BY e.topic_id, t.name ORDER BY min(e.position)
                LOOP
                    v_uid := public.fn_syllabus__insert_node(v_ver.id, v_sid, 'UNIT', tp.topic_name, NULL, NULL, NULL, coalesce(tp.topic_tier, tp.best_tier), NULL, NULL, true);
                    UPDATE public.exam_syllabus_nodes
                       SET metadata = jsonb_strip_nulls(jsonb_build_object('avg_questions', coalesce(tp.topic_avg, tp.subs_avg), 'origin', tp.origin,
                                         'entries', tp.entries, 'syllabus_map_session_id', s.id))
                     WHERE id = v_uid;
                    -- the deepest referenced level: the subtopics named for this topic, else the topic itself
                    v_targets := CASE WHEN tp.subs IS NULL OR cardinality(tp.subs) > 20 THEN ARRAY[tp.topic_id] ELSE tp.subs END;
                    INSERT INTO public.exam_syllabus_canonical_mappings
                        (syllabus_node_id, canonical_node_id, match_status, match_confidence, match_method, reviewed_by, reviewed_at)
                    SELECT v_uid, t, CASE WHEN tp.by_alias THEN 'ALIAS_MATCH' WHEN tp.all_exact THEN 'EXACT_MATCH' ELSE 'MANUALLY_MAPPED' END,
                           1.00, 'SYLLABUS_MAP', p_actor_id, now()
                      FROM unnest(v_targets) t;
                    v_maps := v_maps + cardinality(v_targets);
                    v_units := v_units + 1;
                END LOOP;
                IF NOT EXISTS (SELECT 1 FROM public.exam_syllabus_nodes WHERE parent_node_id = v_sid) THEN
                    RAISE EXCEPTION 'SYLLABUS_MAP: the section "%" has no mapped master topic left (all ignored); the pattern would not add up', ss.v ->> 'name' USING ERRCODE = 'P0001';
                END IF;
            END LOOP;
        END LOOP;
        -- the selection process as a DRAFT set (138; candidates see it only once published)
        IF jsonb_typeof(s.payload -> 'selection_process') = 'array' AND jsonb_array_length(s.payload -> 'selection_process') > 0 THEN
            v_res := public.fn_selection_stages_save_draft(s.exam_id, s.exam_cycle_id, s.payload -> 'selection_process',
                                                           s.payload ->> 'source_url', NULLIF(s.payload ->> 'as_of', '')::date, p_actor_id, p_actor_email);
            v_stages := (v_res ->> 'stages')::integer;
        END IF;
        v_res := jsonb_build_object('version_id', v_ver.id, 'version_number', v_ver.version_number, 'papers', v_papers, 'sections', v_sections,
                                    'units', v_units, 'mappings', v_maps, 'selection_stages', v_stages);
    END IF;

    UPDATE public.syllabus_map_sessions SET status = 'IMPORTED', imported_version_id = (v_res ->> 'version_id')::uuid, result = v_res, updated_at = now()
     WHERE id = p_session_id;
    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_IMPORT', 'syllabus_map_session', p_session_id,
        v_res || jsonb_build_object('contract', s.contract, 'payload_sha256', s.payload_sha256));
    RETURN v_res;
END
$fn$;

CREATE FUNCTION public.fn_syllabus_map_discard(p_session_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
    v_status text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SYLLABUS_MAP: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT status INTO v_status FROM public.syllabus_map_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SYLLABUS_MAP: file not found' USING ERRCODE = 'P0002'; END IF;
    IF v_status <> 'REVIEW' THEN RAISE EXCEPTION 'SYLLABUS_MAP: the file is % and cannot be discarded', v_status USING ERRCODE = 'P0001'; END IF;
    UPDATE public.syllabus_map_sessions SET status = 'DISCARDED', updated_at = now() WHERE id = p_session_id;
    PERFORM public.fn_syllabus_map__audit(p_actor_id, p_actor_email, 'SYLLABUS_MAP_DISCARD', 'syllabus_map_session', p_session_id, NULL);
    RETURN jsonb_build_object('session_id', p_session_id, 'status', 'DISCARDED');
END
$fn$;

-- ------------------------------------------------------------------ grants: server only (service_role after the admin guard)
REVOKE ALL ON FUNCTION public.fn_syllabus_map__audit(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map__node_ok(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map__outline_conflict(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_create(text, uuid, uuid, uuid, text, jsonb, text, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_decide(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_set_outline_action(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_set_weightage(uuid, text, numeric, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_import(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_syllabus_map_discard(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map__audit(uuid, text, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map__node_ok(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map__outline_conflict(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_create(text, uuid, uuid, uuid, text, jsonb, text, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_decide(uuid, text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_set_outline_action(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_set_weightage(uuid, text, numeric, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_import(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_syllabus_map_discard(uuid, uuid, text) TO service_role;
