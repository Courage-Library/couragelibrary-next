-- =============================================================================
-- COURAGE LIBRARY — GAP2-1b: T3 IDENTITY-UNIFIED TAXONOMY SPINE, STEP 1 (RE-KEY)
-- Migration: 20261012000069_t3_identity_rekey_canonical_nodes.sql
--
-- canonical_taxonomy_nodes is THE taxonomy. Every SUBJECT / TOPIC / SUBTOPIC node
-- carries the same UUID as its subjects / topics / subtopics row, so every value in
-- every existing topic FK column is already a valid node id.
--
-- 1. Window guard: aborts unless nothing references node ids yet (aliases, syllabus
--    mappings, current-affairs taxonomy mappings all empty) and every node has the
--    expected 1:1 legacy link.
-- 2. Re-key: one UPDATE maps id, parent_id and root_subject_id. The three node
--    triggers (derive / cycle guard / descendant cascade) are disabled for that one
--    statement only, because they would look up parents by not-yet-updated ids.
--    Self-FKs are ON UPDATE NO ACTION (checked at end of statement), and old and new
--    ids are disjoint, so no transient PK/FK collision is possible.
-- 3. Proof: names, slugs, types, parent relationships, depth, paths and every other
--    column are identical; derived fields re-computed from the tree match.
-- 4. Identity constraints: CHECK per node type + 1:1 assertion legacy row ↔ node.
-- No other table's data changes.
-- =============================================================================

-- 1. Window guard -------------------------------------------------------------
DO $$
DECLARE
    v_bad INTEGER;
BEGIN
    IF (SELECT count(*) FROM public.taxonomy_aliases) <> 0
       OR (SELECT count(*) FROM public.exam_syllabus_canonical_mappings) <> 0
       OR (SELECT count(*) FROM public.current_affairs_taxonomy_mappings) <> 0 THEN
        RAISE EXCEPTION 'T3_REKEY_WINDOW_CLOSED: node ids are already referenced';
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.canonical_taxonomy_nodes
    WHERE NOT (
        (node_type = 'SUBJECT'  AND legacy_subject_id  IS NOT NULL AND legacy_topic_id IS NULL AND legacy_subtopic_id IS NULL) OR
        (node_type = 'TOPIC'    AND legacy_topic_id    IS NOT NULL AND legacy_subject_id IS NULL AND legacy_subtopic_id IS NULL) OR
        (node_type = 'SUBTOPIC' AND legacy_subtopic_id IS NOT NULL AND legacy_subject_id IS NULL AND legacy_topic_id IS NULL) OR
        (node_type IN ('DOMAIN', 'CONCEPT', 'METHOD') AND legacy_subject_id IS NULL AND legacy_topic_id IS NULL AND legacy_subtopic_id IS NULL)
    );
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'T3_REKEY_PRECONDITION: % node(s) without the expected legacy link', v_bad;
    END IF;

    IF EXISTS (SELECT 1 FROM public.subjects s WHERE (SELECT count(*) FROM public.canonical_taxonomy_nodes n WHERE n.legacy_subject_id = s.id) <> 1)
       OR EXISTS (SELECT 1 FROM public.topics t WHERE (SELECT count(*) FROM public.canonical_taxonomy_nodes n WHERE n.legacy_topic_id = t.id) <> 1)
       OR EXISTS (SELECT 1 FROM public.subtopics st WHERE (SELECT count(*) FROM public.canonical_taxonomy_nodes n WHERE n.legacy_subtopic_id = st.id) <> 1) THEN
        RAISE EXCEPTION 'T3_REKEY_PRECONDITION: a subjects/topics/subtopics row does not have exactly one node';
    END IF;
END $$;

-- 2. Snapshot + id map ----------------------------------------------------------
CREATE TEMP TABLE _t3_before ON COMMIT DROP AS
SELECT
    n.*,
    CASE n.node_type
        WHEN 'SUBJECT'  THEN n.legacy_subject_id
        WHEN 'TOPIC'    THEN n.legacy_topic_id
        WHEN 'SUBTOPIC' THEN n.legacy_subtopic_id
        ELSE n.id
    END AS new_id
FROM public.canonical_taxonomy_nodes n;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM _t3_before b
        WHERE b.new_id <> b.id AND b.new_id IN (SELECT id FROM _t3_before)
    ) THEN
        RAISE EXCEPTION 'T3_REKEY_PRECONDITION: new ids overlap existing node ids';
    END IF;
END $$;

-- 3. Re-key (single statement) --------------------------------------------------
ALTER TABLE public.canonical_taxonomy_nodes DISABLE TRIGGER trg_derive_canonical_taxonomy_fields;
ALTER TABLE public.canonical_taxonomy_nodes DISABLE TRIGGER trg_guard_canonical_taxonomy_cycles;
ALTER TABLE public.canonical_taxonomy_nodes DISABLE TRIGGER trg_cascade_canonical_descendants;

UPDATE public.canonical_taxonomy_nodes n
SET id = m.new_id,
    parent_id = mp.new_id,
    root_subject_id = mr.new_id
FROM _t3_before m
LEFT JOIN _t3_before mp ON mp.id = m.parent_id
LEFT JOIN _t3_before mr ON mr.id = m.root_subject_id
WHERE n.id = m.id;

ALTER TABLE public.canonical_taxonomy_nodes ENABLE TRIGGER trg_derive_canonical_taxonomy_fields;
ALTER TABLE public.canonical_taxonomy_nodes ENABLE TRIGGER trg_guard_canonical_taxonomy_cycles;
ALTER TABLE public.canonical_taxonomy_nodes ENABLE TRIGGER trg_cascade_canonical_descendants;

-- 4. Proof: tree identical ------------------------------------------------------
DO $$
DECLARE
    v_bad INTEGER;
BEGIN
    IF (SELECT count(*) FROM public.canonical_taxonomy_nodes) <> (SELECT count(*) FROM _t3_before) THEN
        RAISE EXCEPTION 'T3_REKEY_PROOF: node count changed';
    END IF;

    -- every node row equals its snapshot, with ids translated through the map
    SELECT count(*) INTO v_bad
    FROM _t3_before b
    LEFT JOIN _t3_before bp ON bp.id = b.parent_id
    LEFT JOIN _t3_before br ON br.id = b.root_subject_id
    LEFT JOIN public.canonical_taxonomy_nodes n ON n.id = b.new_id
    WHERE n.id IS NULL
       OR n.parent_id IS DISTINCT FROM bp.new_id
       OR n.root_subject_id IS DISTINCT FROM br.new_id
       OR n.name <> b.name OR n.slug <> b.slug OR n.node_type <> b.node_type
       OR n.node_depth <> b.node_depth OR n.hierarchy_path <> b.hierarchy_path
       OR n.display_order <> b.display_order OR n.is_active <> b.is_active
       OR n.metadata <> b.metadata
       OR n.legacy_subject_id IS DISTINCT FROM b.legacy_subject_id
       OR n.legacy_topic_id IS DISTINCT FROM b.legacy_topic_id
       OR n.legacy_subtopic_id IS DISTINCT FROM b.legacy_subtopic_id
       OR n.created_at <> b.created_at OR n.updated_at <> b.updated_at;
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'T3_REKEY_PROOF: % node(s) differ from the snapshot', v_bad;
    END IF;

    -- derived fields re-computed from the re-keyed tree match what is stored
    WITH RECURSIVE t AS (
        SELECT id, 1 AS depth, id AS root, slug::text AS path
        FROM public.canonical_taxonomy_nodes WHERE parent_id IS NULL
        UNION ALL
        SELECT c.id, t.depth + 1, t.root, t.path || '.' || c.slug
        FROM public.canonical_taxonomy_nodes c JOIN t ON c.parent_id = t.id
    )
    SELECT count(*) INTO v_bad
    FROM public.canonical_taxonomy_nodes n
    LEFT JOIN t ON t.id = n.id
    WHERE t.id IS NULL OR n.node_depth <> t.depth OR n.root_subject_id <> t.root OR n.hierarchy_path <> t.path;
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'T3_REKEY_PROOF: % node(s) with inconsistent derived fields', v_bad;
    END IF;
END $$;

-- 5. Identity constraints ---------------------------------------------------------
-- One node per legacy row (already present since 058; kept idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_subject ON public.canonical_taxonomy_nodes (legacy_subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_topic ON public.canonical_taxonomy_nodes (legacy_topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_legacy_subtopic ON public.canonical_taxonomy_nodes (legacy_subtopic_id);

ALTER TABLE public.canonical_taxonomy_nodes
    ADD CONSTRAINT chk_canonical_legacy_identity CHECK (
        (node_type = 'SUBJECT'  AND id = legacy_subject_id  AND legacy_topic_id IS NULL AND legacy_subtopic_id IS NULL) OR
        (node_type = 'TOPIC'    AND id = legacy_topic_id    AND legacy_subject_id IS NULL AND legacy_subtopic_id IS NULL) OR
        (node_type = 'SUBTOPIC' AND id = legacy_subtopic_id AND legacy_subject_id IS NULL AND legacy_topic_id IS NULL) OR
        (node_type IN ('DOMAIN', 'CONCEPT', 'METHOD') AND legacy_subject_id IS NULL AND legacy_topic_id IS NULL AND legacy_subtopic_id IS NULL)
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.subjects s WHERE NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes n WHERE n.id = s.id AND n.node_type = 'SUBJECT'))
       OR EXISTS (SELECT 1 FROM public.topics t WHERE NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes n WHERE n.id = t.id AND n.node_type = 'TOPIC'))
       OR EXISTS (SELECT 1 FROM public.subtopics st WHERE NOT EXISTS (SELECT 1 FROM public.canonical_taxonomy_nodes n WHERE n.id = st.id AND n.node_type = 'SUBTOPIC')) THEN
        RAISE EXCEPTION 'T3_IDENTITY: a legacy row has no node with the same id';
    END IF;
END $$;

-- End of 069.
