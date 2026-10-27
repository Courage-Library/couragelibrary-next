-- =====================================================================================================================
-- 115 CA-1 MASTER TREE FOUNDATION (CONTENT-ARCH-1 §A / M1)
-- Architect GO (CA-1) as a CONDITIONAL GO: backup → dry-run (alone) → chunked rolled-back smoke AS THE REAL ROLES →
-- apply → live verify → counts + types diff 0 + taxonomy link snapshot (counts AND hashes) unchanged.
-- Rollback: docs/database/rollback/115_rollback.sql. No BEGIN / COMMIT: the runner owns the transaction.
--
--   canonical_taxonomy_nodes — + name_hi, subject_type (SUBJECT only), state_code (STATE_SPECIFIC subjects only);
--     trg_guard_master_tree: 4 levels max (SUBJECT > TOPIC > SUBTOPIC > CONCEPT); new / moved TOPIC only under a
--     SUBJECT, CONCEPT only under a SUBTOPIC; no new DOMAIN / METHOD nodes (existing rows: 0); a node's name may not
--     equal (normalized) an active sibling's name, Hindi name or alias.
--   fn_taxonomy_normalize — the ONE shared normalization (mirrored by lib/taxonomy/normalize.ts): NFKC, lower case,
--     & → and, punctuation folded to spaces, whitespace collapsed.
--   taxonomy_node_aliases — EN / HI aliases; an alias may not equal a sibling's name or alias (trigger, scope lock).
--   fn_taxonomy_add_alias / fn_taxonomy_remove_alias / fn_taxonomy_move_node / fn_taxonomy_merge_nodes — audited
--     (admin_audit_logs, same transaction), SECURITY INVOKER, EXECUTE service_role only. Merge is fail-closed.
--   uq_canonical_hierarchy_path — the public path is unique.
--   Projection slug rule per parent: topics UNIQUE (subject_id, slug), subtopics UNIQUE (topic_id, slug), replacing
--     the global topics_slug_key / subtopics_slug_key (global ⇒ per parent, so no row can violate the new rule; no
--     FK or other object depends on the old constraints — asserted below).
-- No existing row's link changes: only new columns (NULL), new objects and a narrower uniqueness rule.
-- =====================================================================================================================

-- ------------------------------------------------------------------ preflight (raise = nothing applied)
DO $pre$
DECLARE
    v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM (
        SELECT hierarchy_path FROM public.canonical_taxonomy_nodes GROUP BY 1 HAVING count(*) > 1) d;
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % duplicate hierarchy_path values', v_n; END IF;

    SELECT count(*) INTO v_n FROM public.canonical_taxonomy_nodes WHERE node_depth > 4;
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % nodes deeper than 4 levels', v_n; END IF;

    SELECT count(*) INTO v_n FROM public.canonical_taxonomy_nodes WHERE node_type IN ('DOMAIN', 'METHOD', 'CONCEPT');
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % DOMAIN / METHOD / CONCEPT nodes exist (expected 0)', v_n; END IF;

    SELECT count(*) INTO v_n FROM pg_depend d JOIN pg_class i ON i.oid = d.refobjid
     WHERE i.relnamespace = 'public'::regnamespace AND i.relname IN ('topics_slug_key', 'subtopics_slug_key')
       AND d.deptype NOT IN ('a', 'i');
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % objects depend on topics_slug_key / subtopics_slug_key', v_n; END IF;

    SELECT count(*) INTO v_n FROM pg_constraint
     WHERE contype = 'f' AND conindid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace
                                          AND relname IN ('topics_slug_key', 'subtopics_slug_key'));
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % foreign keys use topics_slug_key / subtopics_slug_key', v_n; END IF;
END
$pre$;

-- ------------------------------------------------------------------ normalization (shared with lib/taxonomy/normalize.ts)
CREATE OR REPLACE FUNCTION public.fn_taxonomy_normalize(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT btrim(regexp_replace(
        translate(
            replace(lower(normalize(coalesce(p_text, ''), NFKC)), '&', ' and '),
            '!"#$%''()*+,-./:;<=>?@[\]^_`{|}~‘’“”–—…।॥',
            repeat(' ', 40)),
        '\s+', ' ', 'g'));
$fn$;

-- ------------------------------------------------------------------ new columns
ALTER TABLE public.canonical_taxonomy_nodes
    ADD COLUMN IF NOT EXISTS name_hi text,
    ADD COLUMN IF NOT EXISTS subject_type text,
    ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.canonical_taxonomy_nodes
    ADD CONSTRAINT chk_canonical_name_hi CHECK (name_hi IS NULL OR char_length(btrim(name_hi)) BETWEEN 1 AND 160),
    ADD CONSTRAINT chk_canonical_subject_type CHECK (
        subject_type IS NULL
        OR (node_type = 'SUBJECT'
            AND subject_type IN ('APTITUDE', 'LANGUAGE', 'GK_GA', 'TECHNICAL', 'PEDAGOGY', 'STATE_SPECIFIC'))),
    ADD CONSTRAINT chk_canonical_state_code CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$');

COMMENT ON COLUMN public.canonical_taxonomy_nodes.name_hi IS 'CA-1: Hindi display name (optional).';
COMMENT ON COLUMN public.canonical_taxonomy_nodes.subject_type IS 'CA-1: SUBJECT only — APTITUDE, LANGUAGE, GK_GA, TECHNICAL, PEDAGOGY, STATE_SPECIFIC.';
COMMENT ON COLUMN public.canonical_taxonomy_nodes.state_code IS 'CA-1: two-letter state code; only inside a STATE_SPECIFIC subject.';

-- ------------------------------------------------------------------ aliases
CREATE TABLE IF NOT EXISTS public.taxonomy_node_aliases (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           uuid NOT NULL REFERENCES public.canonical_taxonomy_nodes (id) ON DELETE CASCADE,
    alias             text NOT NULL CHECK (char_length(btrim(alias)) BETWEEN 1 AND 160),
    normalized_alias  text NOT NULL CHECK (char_length(normalized_alias) >= 1),
    language          text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'hi')),
    source            text NOT NULL DEFAULT 'OWNER' CHECK (source IN ('OWNER', 'INTAKE', 'IMPORT')),
    created_by        uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_taxonomy_node_alias UNIQUE (node_id, normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_node_aliases_normalized ON public.taxonomy_node_aliases (normalized_alias);

COMMENT ON TABLE public.taxonomy_node_aliases IS
    'CA-1: alternative names of a master node (EN / HI). Unique within the parent scope: an alias never equals an active sibling''s name or alias (trigger). Writes via fn_taxonomy_add_alias / fn_taxonomy_remove_alias / merge.';

ALTER TABLE public.taxonomy_node_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.taxonomy_node_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.taxonomy_node_aliases TO authenticated;
GRANT ALL ON TABLE public.taxonomy_node_aliases TO service_role;
CREATE POLICY "taxonomy_node_aliases: admin/staff read" ON public.taxonomy_node_aliases
    FOR SELECT TO authenticated USING (public.fn_jwt_is_admin_or_staff());

-- ------------------------------------------------------------------ scope helpers
-- The serialisation key of one parent scope (root = all subjects).
CREATE OR REPLACE FUNCTION public.fn_taxonomy_lock_scope(p_parent_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, pg_temp
AS $fn$
    SELECT pg_advisory_xact_lock(hashtextextended('taxonomy-scope:' || coalesce(p_parent_id::text, 'root'), 0));
$fn$;

-- The first active sibling (≠ p_exclude_node) whose name, Hindi name or alias normalizes to p_normalized; NULL = free.
CREATE OR REPLACE FUNCTION public.fn_taxonomy_scope_conflict(p_parent_id uuid, p_normalized text, p_exclude_node uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT coalesce(
        (SELECT format('the name of %s "%s"', lower(n.node_type), n.name)
           FROM public.canonical_taxonomy_nodes n
          WHERE n.parent_id IS NOT DISTINCT FROM p_parent_id AND n.is_active AND n.id IS DISTINCT FROM p_exclude_node
            AND (public.fn_taxonomy_normalize(n.name) = p_normalized
                 OR (n.name_hi IS NOT NULL AND public.fn_taxonomy_normalize(n.name_hi) = p_normalized))
          ORDER BY n.id LIMIT 1),
        (SELECT format('an alias of %s "%s"', lower(n.node_type), n.name)
           FROM public.taxonomy_node_aliases a JOIN public.canonical_taxonomy_nodes n ON n.id = a.node_id
          WHERE n.parent_id IS NOT DISTINCT FROM p_parent_id AND n.is_active AND n.id IS DISTINCT FROM p_exclude_node
            AND a.normalized_alias = p_normalized
          ORDER BY a.id LIMIT 1));
$fn$;

-- ------------------------------------------------------------------ master tree guard (fires after derive / enforce / cycles)
CREATE OR REPLACE FUNCTION public.fn_guard_master_tree()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_parent_type   text;
    v_root_type     text;
    v_conflict      text;
    v_value         text;
    v_alias         record;
    v_parent_change boolean := TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id;
    v_name_check    boolean;
BEGIN
    IF NEW.node_depth > 4 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: the master tree has at most 4 levels (subject > topic > subtopic > concept)';
    END IF;

    IF v_parent_change THEN
        IF NEW.node_type IN ('DOMAIN', 'METHOD') THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: % nodes are not used in the master tree', NEW.node_type;
        END IF;
        IF NEW.parent_id IS NOT NULL THEN
            SELECT node_type INTO v_parent_type FROM public.canonical_taxonomy_nodes WHERE id = NEW.parent_id;
            IF (NEW.node_type = 'TOPIC' AND v_parent_type <> 'SUBJECT')
               OR (NEW.node_type = 'CONCEPT' AND v_parent_type <> 'SUBTOPIC') THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: a % node cannot be placed under a % node', NEW.node_type, v_parent_type;
            END IF;
        END IF;
    END IF;

    -- state_code lives only inside a STATE_SPECIFIC subject
    IF NEW.state_code IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.state_code IS DISTINCT FROM OLD.state_code
                                      OR NEW.root_subject_id IS DISTINCT FROM OLD.root_subject_id
                                      OR NEW.subject_type IS DISTINCT FROM OLD.subject_type) THEN
        IF NEW.node_type = 'SUBJECT' THEN
            v_root_type := NEW.subject_type;
        ELSE
            SELECT subject_type INTO v_root_type FROM public.canonical_taxonomy_nodes WHERE id = NEW.root_subject_id;
        END IF;
        IF v_root_type IS DISTINCT FROM 'STATE_SPECIFIC' THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: a state code is allowed only inside a STATE_SPECIFIC subject';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.node_type = 'SUBJECT' AND OLD.subject_type = 'STATE_SPECIFIC'
       AND NEW.subject_type IS DISTINCT FROM 'STATE_SPECIFIC'
       AND EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes
                    WHERE root_subject_id = NEW.id AND id <> NEW.id AND state_code IS NOT NULL) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: nodes of this subject carry state codes; clear them before changing the subject type';
    END IF;

    -- names / aliases unique (normalized) among active siblings
    v_name_check := NEW.is_active AND (v_parent_change
                    OR NEW.name IS DISTINCT FROM OLD.name OR NEW.name_hi IS DISTINCT FROM OLD.name_hi
                    OR (NEW.is_active AND NOT OLD.is_active));
    IF v_name_check THEN
        PERFORM public.fn_taxonomy_lock_scope(NEW.parent_id);
        FOREACH v_value IN ARRAY ARRAY[NEW.name, NEW.name_hi] LOOP
            CONTINUE WHEN v_value IS NULL;
            v_conflict := public.fn_taxonomy_scope_conflict(NEW.parent_id, public.fn_taxonomy_normalize(v_value), NEW.id);
            IF v_conflict IS NOT NULL THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: "%" equals %', v_value, v_conflict;
            END IF;
        END LOOP;
        IF TG_OP = 'UPDATE' AND (v_parent_change OR NOT OLD.is_active) THEN
            FOR v_alias IN SELECT alias, normalized_alias FROM public.taxonomy_node_aliases WHERE node_id = NEW.id LOOP
                v_conflict := public.fn_taxonomy_scope_conflict(NEW.parent_id, v_alias.normalized_alias, NEW.id);
                IF v_conflict IS NOT NULL THEN
                    RAISE EXCEPTION 'TAXONOMY_RULE: alias "%" equals %', v_alias.alias, v_conflict;
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_master_tree ON public.canonical_taxonomy_nodes;
CREATE TRIGGER trg_guard_master_tree
    BEFORE INSERT OR UPDATE ON public.canonical_taxonomy_nodes
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_master_tree();

-- ------------------------------------------------------------------ alias guard
CREATE OR REPLACE FUNCTION public.fn_guard_taxonomy_node_alias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_node     public.canonical_taxonomy_nodes%ROWTYPE;
    v_conflict text;
BEGIN
    NEW.alias := btrim(NEW.alias);
    NEW.normalized_alias := public.fn_taxonomy_normalize(NEW.alias);
    IF NEW.normalized_alias = '' THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: an alias needs letters or digits';
    END IF;
    SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = NEW.node_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: node % does not exist', NEW.node_id;
    END IF;
    IF public.fn_taxonomy_normalize(v_node.name) = NEW.normalized_alias
       OR (v_node.name_hi IS NOT NULL AND public.fn_taxonomy_normalize(v_node.name_hi) = NEW.normalized_alias) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: alias "%" equals the node''s own name', NEW.alias;
    END IF;
    PERFORM public.fn_taxonomy_lock_scope(v_node.parent_id);
    v_conflict := public.fn_taxonomy_scope_conflict(v_node.parent_id, NEW.normalized_alias, v_node.id);
    IF v_conflict IS NOT NULL THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: alias "%" equals %', NEW.alias, v_conflict;
    END IF;
    RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_guard_taxonomy_node_alias ON public.taxonomy_node_aliases;
CREATE TRIGGER trg_guard_taxonomy_node_alias
    BEFORE INSERT OR UPDATE ON public.taxonomy_node_aliases
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_taxonomy_node_alias();

-- existing data must already satisfy the new name rule (asserted after the helpers exist)
DO $pretwo$
DECLARE
    v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM (
        SELECT parent_id, public.fn_taxonomy_normalize(name) FROM public.canonical_taxonomy_nodes
         WHERE is_active GROUP BY 1, 2 HAVING count(*) > 1) d;
    IF v_n > 0 THEN RAISE EXCEPTION 'CA1_PREFLIGHT: % active sibling groups share a normalized name', v_n; END IF;
END
$pretwo$;

-- ------------------------------------------------------------------ audited RPCs (service_role only)
CREATE OR REPLACE FUNCTION public.fn_taxonomy_audit(
    p_actor_id uuid, p_actor_email text, p_action text, p_target_id uuid, p_old jsonb, p_new jsonb, p_reason text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required';
    END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value, reason)
    VALUES (p_actor_id, p_actor_email, p_action, 'canonical_taxonomy_node', p_target_id::text, p_old, p_new, p_reason);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_taxonomy_add_alias(
    p_node_id uuid, p_alias text, p_language text, p_source text, p_actor_id uuid, p_actor_email text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_id uuid;
    v_row public.taxonomy_node_aliases%ROWTYPE;
BEGIN
    PERFORM 1 FROM public.canonical_taxonomy_nodes WHERE id = p_node_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: node % does not exist', p_node_id; END IF;
    BEGIN
        INSERT INTO public.taxonomy_node_aliases (node_id, alias, normalized_alias, language, source, created_by)
        VALUES (p_node_id, p_alias, '-', coalesce(p_language, 'en'), coalesce(p_source, 'OWNER'), p_actor_id)
        RETURNING * INTO v_row;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: this node already has the alias "%"', p_alias;
    END;
    v_id := v_row.id;
    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_ALIAS_ADD', p_node_id, NULL,
        jsonb_build_object('alias_id', v_id, 'alias', v_row.alias, 'normalized', v_row.normalized_alias,
                           'language', v_row.language, 'source', v_row.source), NULL);
    RETURN v_id;
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_taxonomy_remove_alias(p_alias_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_row public.taxonomy_node_aliases%ROWTYPE;
BEGIN
    DELETE FROM public.taxonomy_node_aliases WHERE id = p_alias_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: alias % does not exist', p_alias_id; END IF;
    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_ALIAS_REMOVE', v_row.node_id,
        jsonb_build_object('alias_id', v_row.id, 'alias', v_row.alias, 'language', v_row.language, 'source', v_row.source),
        NULL, NULL);
END
$fn$;

-- Subtree ids (the node itself + every descendant).
CREATE OR REPLACE FUNCTION public.fn_taxonomy_subtree_ids(p_node_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
    WITH RECURSIVE t AS (
        SELECT id FROM public.canonical_taxonomy_nodes WHERE id = p_node_id
        UNION ALL
        SELECT c.id FROM public.canonical_taxonomy_nodes c JOIN t ON c.parent_id = t.id)
    SELECT coalesce(array_agg(id), '{}') FROM t;
$fn$;

-- Same-level move: a TOPIC to another SUBJECT, a SUBTOPIC to another TOPIC, a CONCEPT to another SUBTOPIC.
-- Fail-closed across subjects while any row stores the old subject next to a subtree node (denormalised subject_id).
CREATE OR REPLACE FUNCTION public.fn_taxonomy_move_node(
    p_node_id uuid, p_new_parent_id uuid, p_actor_id uuid, p_actor_email text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_node    public.canonical_taxonomy_nodes%ROWTYPE;
    v_old     public.canonical_taxonomy_nodes%ROWTYPE;
    v_new     public.canonical_taxonomy_nodes%ROWTYPE;
    v_subtree uuid[];
    v_ref     record;
    v_n       bigint;
    v_order   integer;
    v_path    text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required'; END IF;
    SELECT * INTO v_node FROM public.canonical_taxonomy_nodes WHERE id = p_node_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: node % does not exist', p_node_id; END IF;
    IF v_node.parent_id IS NULL THEN RAISE EXCEPTION 'TAXONOMY_RULE: a subject cannot be moved'; END IF;
    IF p_new_parent_id IS NULL OR p_new_parent_id = v_node.parent_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: choose a different parent';
    END IF;
    SELECT * INTO v_old FROM public.canonical_taxonomy_nodes WHERE id = v_node.parent_id;
    SELECT * INTO v_new FROM public.canonical_taxonomy_nodes WHERE id = p_new_parent_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: parent % does not exist', p_new_parent_id; END IF;
    IF v_new.node_type <> v_old.node_type THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: a node moves only to a parent at the same level (% → %)', v_old.node_type, v_new.node_type;
    END IF;
    IF NOT v_new.is_active THEN RAISE EXCEPTION 'TAXONOMY_RULE: the new parent is inactive'; END IF;
    v_subtree := public.fn_taxonomy_subtree_ids(p_node_id);
    IF p_new_parent_id = ANY (v_subtree) THEN RAISE EXCEPTION 'TAXONOMY_RULE: a node cannot move under itself'; END IF;
    IF EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes WHERE parent_id = p_new_parent_id AND slug = v_node.slug) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: the new parent already has a child with the slug "%"', v_node.slug;
    END IF;

    IF v_new.root_subject_id IS DISTINCT FROM v_node.root_subject_id THEN
        FOR v_ref IN
            SELECT c1.conrelid::regclass AS tbl, a1.attname AS col
              FROM pg_constraint c1
              JOIN pg_attribute a1 ON a1.attrelid = c1.conrelid AND a1.attnum = c1.conkey[1]
             WHERE c1.contype = 'f' AND c1.confrelid = 'public.canonical_taxonomy_nodes'::regclass
               AND c1.conrelid <> 'public.canonical_taxonomy_nodes'::regclass
               AND EXISTS (SELECT 1 FROM pg_class k WHERE k.oid = c1.conrelid AND k.relnamespace = 'public'::regnamespace)
               AND a1.attname <> 'subject_id'
               AND EXISTS (SELECT 1 FROM pg_constraint c2
                             JOIN pg_attribute a2 ON a2.attrelid = c2.conrelid AND a2.attnum = c2.conkey[1]
                            WHERE c2.contype = 'f' AND c2.confrelid = c1.confrelid AND c2.conrelid = c1.conrelid
                              AND a2.attname = 'subject_id')
             ORDER BY 1, 2
        LOOP
            EXECUTE format('SELECT count(*) FROM %s WHERE %I = ANY ($1)', v_ref.tbl, v_ref.col) INTO v_n USING v_subtree;
            IF v_n > 0 THEN
                RAISE EXCEPTION 'TAXONOMY_RULE: moving to another subject is blocked: % rows of %.% also store the old subject', v_n, v_ref.tbl, v_ref.col;
            END IF;
        END LOOP;
    END IF;

    SELECT coalesce(max(display_order) + 1, 0) INTO v_order FROM public.canonical_taxonomy_nodes WHERE parent_id = p_new_parent_id;
    UPDATE public.canonical_taxonomy_nodes SET parent_id = p_new_parent_id, display_order = v_order WHERE id = p_node_id
    RETURNING hierarchy_path INTO v_path;

    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_MOVE', p_node_id,
        jsonb_build_object('parent_id', v_node.parent_id, 'path', v_node.hierarchy_path, 'display_order', v_node.display_order),
        jsonb_build_object('parent_id', p_new_parent_id, 'path', v_path, 'display_order', v_order,
                           'subtree_size', cardinality(v_subtree)),
        p_reason);
    RETURN jsonb_build_object('node_id', p_node_id, 'from_parent_id', v_node.parent_id, 'to_parent_id', p_new_parent_id,
                              'path', v_path, 'subtree_size', cardinality(v_subtree));
END
$fn$;

-- Owner-only merge (source → target, same type, same subject unless both are subjects). Fail-closed: any conflict
-- (child slug / name, alias scope, a unique key holding rows for both nodes, an immutable published syllabus mapping)
-- raises and nothing changes.
CREATE OR REPLACE FUNCTION public.fn_taxonomy_merge_nodes(
    p_source_id uuid, p_target_id uuid, p_actor_id uuid, p_actor_email text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_src      public.canonical_taxonomy_nodes%ROWTYPE;
    v_tgt      public.canonical_taxonomy_nodes%ROWTYPE;
    v_ref      record;
    v_n        bigint;
    v_counts   jsonb := '{}'::jsonb;
    v_children integer;
    v_moved_aliases integer;
    v_dropped_aliases integer;
    v_added    jsonb := '[]'::jsonb;
    v_value    text;
    v_lang     text;
    v_target_names text[];
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'TAXONOMY_RULE: an actor is required'; END IF;
    IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: a merge needs a reason (at least 5 characters)';
    END IF;
    IF p_source_id IS NULL OR p_target_id IS NULL OR p_source_id = p_target_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: choose two different nodes';
    END IF;
    -- lock both in a stable order
    PERFORM 1 FROM public.canonical_taxonomy_nodes WHERE id IN (p_source_id, p_target_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_src FROM public.canonical_taxonomy_nodes WHERE id = p_source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: source node % does not exist', p_source_id; END IF;
    SELECT * INTO v_tgt FROM public.canonical_taxonomy_nodes WHERE id = p_target_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_RULE: target node % does not exist', p_target_id; END IF;
    IF v_src.node_type <> v_tgt.node_type THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: only nodes of the same level can merge (% → %)', v_src.node_type, v_tgt.node_type;
    END IF;
    IF NOT v_src.is_active OR NOT v_tgt.is_active THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: both nodes must be active';
    END IF;
    IF v_src.node_type <> 'SUBJECT' AND v_src.root_subject_id IS DISTINCT FROM v_tgt.root_subject_id THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: merge within one subject only (move the node first)';
    END IF;
    IF p_target_id = ANY (public.fn_taxonomy_subtree_ids(p_source_id)) THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: the target lies inside the source';
    END IF;
    SELECT string_agg(c.slug, ', ' ORDER BY c.slug) INTO v_value
      FROM public.canonical_taxonomy_nodes c
     WHERE c.parent_id = p_source_id
       AND EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes t WHERE t.parent_id = p_target_id AND t.slug = c.slug);
    IF v_value IS NOT NULL THEN
        RAISE EXCEPTION 'TAXONOMY_RULE: both nodes have children with the slug(s) %; merge those children first', v_value;
    END IF;

    -- 1. retire the source (frees its name in the scope)
    UPDATE public.canonical_taxonomy_nodes
       SET is_active = false,
           metadata = coalesce(metadata, '{}'::jsonb)
                      || jsonb_build_object('merged_into', p_target_id, 'merged_at', now())
     WHERE id = p_source_id;

    -- 2. children move under the target (each row re-checked by the tree triggers)
    UPDATE public.canonical_taxonomy_nodes SET parent_id = p_target_id WHERE parent_id = p_source_id;
    GET DIAGNOSTICS v_children = ROW_COUNT;

    -- 3. aliases: drop the ones the target already has (or that equal its names), move the rest
    v_target_names := ARRAY[public.fn_taxonomy_normalize(v_tgt.name), public.fn_taxonomy_normalize(v_tgt.name_hi)];
    DELETE FROM public.taxonomy_node_aliases a
     WHERE a.node_id = p_source_id
       AND (a.normalized_alias = ANY (v_target_names)
            OR EXISTS (SELECT 1 FROM public.taxonomy_node_aliases b
                        WHERE b.node_id = p_target_id AND b.normalized_alias = a.normalized_alias));
    GET DIAGNOSTICS v_dropped_aliases = ROW_COUNT;
    UPDATE public.taxonomy_node_aliases SET node_id = p_target_id WHERE node_id = p_source_id;
    GET DIAGNOSTICS v_moved_aliases = ROW_COUNT;

    -- 4. the source names become aliases of the target
    FOREACH v_lang IN ARRAY ARRAY['en', 'hi'] LOOP
        v_value := CASE v_lang WHEN 'en' THEN v_src.name ELSE v_src.name_hi END;
        CONTINUE WHEN v_value IS NULL;
        CONTINUE WHEN public.fn_taxonomy_normalize(v_value) = ANY (v_target_names);
        CONTINUE WHEN EXISTS (SELECT 1 FROM public.taxonomy_node_aliases
                               WHERE node_id = p_target_id AND normalized_alias = public.fn_taxonomy_normalize(v_value));
        INSERT INTO public.taxonomy_node_aliases (node_id, alias, normalized_alias, language, source, created_by)
        VALUES (p_target_id, v_value, '-', v_lang, 'OWNER', p_actor_id);
        v_added := v_added || jsonb_build_array(jsonb_build_object('alias', v_value, 'language', v_lang));
    END LOOP;

    -- 5. every other app reference (catalogue-driven; the tree's own columns, the projection and aliases are handled
    --    above). The frozen archive (schema retired, no service_role access) keeps pointing at the source, which is
    --    deactivated and never deleted, so its foreign keys stay valid.
    FOR v_ref IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confrelid = 'public.canonical_taxonomy_nodes'::regclass
           AND cl.relnamespace = 'public'::regnamespace
           AND c.conrelid NOT IN ('public.canonical_taxonomy_nodes'::regclass, 'public.topics'::regclass,
                                  'public.subtopics'::regclass, 'public.taxonomy_node_aliases'::regclass)
         ORDER BY 1, 2
    LOOP
        BEGIN
            EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', v_ref.tbl, v_ref.col, v_ref.col) USING p_target_id, p_source_id;
            GET DIAGNOSTICS v_n = ROW_COUNT;
        EXCEPTION WHEN unique_violation THEN
            RAISE EXCEPTION 'TAXONOMY_RULE: merge blocked: %.% holds rows for both nodes (unique key)', v_ref.tbl, v_ref.col;
        END;
        IF v_n > 0 THEN
            v_counts := v_counts || jsonb_build_object(v_ref.tbl::text || '.' || v_ref.col, v_n);
        END IF;
    END LOOP;

    PERFORM public.fn_taxonomy_audit(p_actor_id, p_actor_email, 'TAXONOMY_NODE_MERGE', p_source_id,
        jsonb_build_object('source_id', p_source_id, 'name', v_src.name, 'name_hi', v_src.name_hi,
                           'parent_id', v_src.parent_id, 'path', v_src.hierarchy_path, 'node_type', v_src.node_type),
        jsonb_build_object('target_id', p_target_id, 'target_path', v_tgt.hierarchy_path, 'children_moved', v_children,
                           'aliases_moved', v_moved_aliases, 'aliases_dropped', v_dropped_aliases,
                           'aliases_added', v_added, 'repointed', v_counts),
        p_reason);
    RETURN jsonb_build_object('source_id', p_source_id, 'target_id', p_target_id, 'children_moved', v_children,
                              'aliases_moved', v_moved_aliases, 'aliases_added', v_added, 'repointed', v_counts);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_taxonomy_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_lock_scope(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_scope_conflict(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_master_tree() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_taxonomy_node_alias() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_audit(uuid, text, text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_add_alias(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_remove_alias(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_subtree_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_move_node(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_taxonomy_merge_nodes(uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_normalize(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_lock_scope(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_scope_conflict(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_audit(uuid, text, text, uuid, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_add_alias(uuid, text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_remove_alias(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_subtree_ids(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_move_node(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_taxonomy_merge_nodes(uuid, uuid, uuid, text, text) TO service_role;

-- ------------------------------------------------------------------ unique public path
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_hierarchy_path ON public.canonical_taxonomy_nodes (hierarchy_path);

-- ------------------------------------------------------------------ projection slug rule: unique per parent
ALTER TABLE public.topics DROP CONSTRAINT topics_slug_key;
ALTER TABLE public.topics ADD CONSTRAINT uq_topics_subject_slug UNIQUE (subject_id, slug);
ALTER TABLE public.subtopics DROP CONSTRAINT subtopics_slug_key;
ALTER TABLE public.subtopics ADD CONSTRAINT uq_subtopics_topic_slug UNIQUE (topic_id, slug);
