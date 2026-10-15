-- =============================================================================
-- COURAGE LIBRARY — GAP2-4a (1/3): canonical syllabus schema + integrity guards
-- Migration: 20261016000078_gap2_4a_syllabus_schema.sql
--
-- Implements the approved design (docs/reports/gap2/GAP2_4_STAGE1_DESIGN.md §2.1 + §10), DDL points 1–9:
--   versions : status DRAFT / PUBLISHED / ARCHIVED (RECONCILED dropped; 0 rows), version_number (unique per
--              exam), supersedes_version_id, source_kind, created_by, published_at / published_by, archived_at;
--              raw_payload_hash nullable; publish-audit CHECK; ≤ 1 PUBLISHED active version per exam + cycle.
--   nodes    : node_kind PAPER / SECTION / UNIT + description; expected-question range has no fabricated
--              default (NULL = unknown) and is range-checked; parent must belong to the same version; a node
--              cannot move to another version.
--   mappings : UNIQUE(syllabus_node_id) → UNIQUE(syllabus_node_id, canonical_node_id); TOPIC-only via the
--              GAP2-3 pattern (generated canonical_node_type = 'TOPIC' + composite FK → canonical_taxonomy_nodes
--              (id, node_type)); mapping_weight in (0, 1].
--   immutability: versions are created DRAFT only; PUBLISHED / ARCHIVED versions and their nodes / mappings
--              reject every INSERT / UPDATE / DELETE, for every role including the service role, except the single
--              transition PUBLISHED → ARCHIVED on the version row.
-- All three tables are empty on 2026-10-16. Writes go through the SECURITY DEFINER RPCs of migration 079; the
-- SEC-HOTFIX-4 role-checked policies and the SELECT-only grants are unchanged.
-- Rollback: docs/database/rollback/078_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------- versions
ALTER TABLE public.exam_syllabus_versions
  ALTER COLUMN raw_payload_hash DROP NOT NULL,
  ADD COLUMN version_number integer NOT NULL CHECK (version_number >= 1),
  ADD COLUMN supersedes_version_id uuid REFERENCES public.exam_syllabus_versions(id) ON DELETE RESTRICT,
  ADD COLUMN source_kind text NOT NULL DEFAULT 'MANUAL'
    CHECK (source_kind IN ('MANUAL', 'EXAM_KNOWLEDGE_DRAFT', 'LEGACY_MIGRATION', 'IMPORT')),
  ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN archived_at timestamptz;

ALTER TABLE public.exam_syllabus_versions DROP CONSTRAINT exam_syllabus_versions_status_check;
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT exam_syllabus_versions_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
-- published_by may become NULL later only through ON DELETE SET NULL of the auth user (history is kept)
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT chk_syllabus_published_has_audit
  CHECK (status = 'DRAFT' OR published_at IS NOT NULL OR status = 'ARCHIVED');
ALTER TABLE public.exam_syllabus_versions ADD CONSTRAINT chk_syllabus_archived_has_time
  CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL);

CREATE UNIQUE INDEX uq_exam_syllabus_version_number ON public.exam_syllabus_versions (exam_id, version_number);
CREATE UNIQUE INDEX uq_exam_syllabus_one_published
  ON public.exam_syllabus_versions (exam_id, COALESCE(exam_cycle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'PUBLISHED' AND is_active;
CREATE INDEX idx_syllabus_versions_supersedes ON public.exam_syllabus_versions (supersedes_version_id);
CREATE INDEX idx_syllabus_versions_created_by ON public.exam_syllabus_versions (created_by);
CREATE INDEX idx_syllabus_versions_published_by ON public.exam_syllabus_versions (published_by);

-- ---------------------------------------------------------------- nodes
ALTER TABLE public.exam_syllabus_nodes
  ADD COLUMN node_kind text NOT NULL DEFAULT 'UNIT' CHECK (node_kind IN ('PAPER', 'SECTION', 'UNIT')),
  ADD COLUMN description text,
  ALTER COLUMN expected_questions_min DROP DEFAULT,
  ALTER COLUMN expected_questions_max DROP DEFAULT;
ALTER TABLE public.exam_syllabus_nodes ADD CONSTRAINT chk_syllabus_node_expected_range CHECK (
  (expected_questions_min IS NULL OR expected_questions_min >= 0)
  AND (expected_questions_max IS NULL OR expected_questions_max >= 0)
  AND (expected_questions_min IS NULL OR expected_questions_max IS NULL OR expected_questions_min <= expected_questions_max));

CREATE OR REPLACE FUNCTION public.fn_guard_exam_syllabus_node_same_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_parent_version uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.syllabus_version_id IS DISTINCT FROM OLD.syllabus_version_id THEN
    RAISE EXCEPTION 'SYLLABUS_NODE_VERSION_LOCKED: a syllabus node cannot move to another version' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.parent_node_id IS NOT NULL THEN
    SELECT n.syllabus_version_id INTO v_parent_version FROM public.exam_syllabus_nodes n WHERE n.id = NEW.parent_node_id;
    IF v_parent_version IS DISTINCT FROM NEW.syllabus_version_id THEN
      RAISE EXCEPTION 'SYLLABUS_PARENT_OTHER_VERSION: parent node % belongs to another syllabus version', NEW.parent_node_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_exam_syllabus_node_same_version
  BEFORE INSERT OR UPDATE OF parent_node_id, syllabus_version_id ON public.exam_syllabus_nodes
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_exam_syllabus_node_same_version();

-- ---------------------------------------------------------------- mappings
ALTER TABLE public.exam_syllabus_canonical_mappings DROP CONSTRAINT uq_exam_syllabus_canonical_mapping_node;
ALTER TABLE public.exam_syllabus_canonical_mappings
  ADD COLUMN canonical_node_type text GENERATED ALWAYS AS ('TOPIC') STORED,
  ADD COLUMN mapping_weight numeric(5,4) CHECK (mapping_weight IS NULL OR (mapping_weight > 0 AND mapping_weight <= 1));
ALTER TABLE public.exam_syllabus_canonical_mappings
  ADD CONSTRAINT exam_syllabus_canonical_mappings_topic_fkey
  FOREIGN KEY (canonical_node_id, canonical_node_type) REFERENCES public.canonical_taxonomy_nodes (id, node_type)
  ON DELETE RESTRICT;
ALTER TABLE public.exam_syllabus_canonical_mappings DROP CONSTRAINT exam_syllabus_canonical_mappings_canonical_node_id_fkey;
CREATE UNIQUE INDEX uq_syllabus_node_topic ON public.exam_syllabus_canonical_mappings (syllabus_node_id, canonical_node_id)
  WHERE canonical_node_id IS NOT NULL;
CREATE INDEX idx_syllabus_mappings_node ON public.exam_syllabus_canonical_mappings (syllabus_node_id);

-- ---------------------------------------------------------------- immutability
CREATE OR REPLACE FUNCTION public.fn_guard_exam_syllabus_version_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'SYLLABUS_INSERT_NOT_DRAFT: syllabus versions are created as DRAFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'SYLLABUS_IMMUTABLE: % syllabus version % cannot be deleted', OLD.status, OLD.id USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'SYLLABUS_IMMUTABLE: ARCHIVED syllabus version % cannot change', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    -- the only allowed change: PUBLISHED → ARCHIVED (status, is_active, archived_at, updated_at)
    IF NEW.status <> 'ARCHIVED'
       OR NEW.exam_id IS DISTINCT FROM OLD.exam_id OR NEW.exam_cycle_id IS DISTINCT FROM OLD.exam_cycle_id
       OR NEW.version_tag IS DISTINCT FROM OLD.version_tag OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id OR NEW.raw_payload_hash IS DISTINCT FROM OLD.raw_payload_hash
       OR NEW.metadata IS DISTINCT FROM OLD.metadata OR NEW.supersedes_version_id IS DISTINCT FROM OLD.supersedes_version_id
       OR NEW.source_kind IS DISTINCT FROM OLD.source_kind OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'SYLLABUS_IMMUTABLE: PUBLISHED syllabus version % can only be archived', OLD.id USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  -- OLD.status = 'DRAFT'
  IF NEW.status NOT IN ('DRAFT', 'PUBLISHED', 'ARCHIVED') THEN
    RETURN NEW; -- the CHECK constraint reports it
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_exam_syllabus_version_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_syllabus_versions
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_exam_syllabus_version_lifecycle();

-- nodes and mappings may change only while their version is DRAFT
CREATE OR REPLACE FUNCTION public.fn_guard_exam_syllabus_content_draft_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_version uuid;
  v_status text;
BEGIN
  IF TG_TABLE_NAME = 'exam_syllabus_nodes' THEN
    v_version := CASE WHEN TG_OP = 'DELETE' THEN OLD.syllabus_version_id ELSE NEW.syllabus_version_id END;
  ELSE
    SELECT n.syllabus_version_id INTO v_version FROM public.exam_syllabus_nodes n
     WHERE n.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.syllabus_node_id ELSE NEW.syllabus_node_id END;
    IF TG_OP = 'UPDATE' AND NEW.syllabus_node_id IS DISTINCT FROM OLD.syllabus_node_id THEN
      RAISE EXCEPTION 'SYLLABUS_MAPPING_NODE_LOCKED: a mapping cannot move to another node' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT v.status INTO v_status FROM public.exam_syllabus_versions v WHERE v.id = v_version;
  -- a cascade from deleting the (DRAFT) version itself finds no version row any more
  IF v_status IS NOT NULL AND v_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'SYLLABUS_IMMUTABLE: % syllabus version % is read-only (%)', v_status, v_version, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER trg_guard_exam_syllabus_nodes_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_syllabus_nodes
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_exam_syllabus_content_draft_only();
CREATE TRIGGER trg_guard_exam_syllabus_mappings_draft_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.exam_syllabus_canonical_mappings
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_exam_syllabus_content_draft_only();

-- the existing node trigger functions gain a fixed search_path (bodies unchanged; they qualify public.*)
ALTER FUNCTION public.fn_derive_exam_syllabus_node_depth() SET search_path = '';
ALTER FUNCTION public.fn_guard_exam_syllabus_node_cycles() SET search_path = '';
ALTER FUNCTION public.fn_cascade_exam_syllabus_node_descendants() SET search_path = '';

REVOKE ALL ON FUNCTION public.fn_guard_exam_syllabus_node_same_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_exam_syllabus_version_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_exam_syllabus_content_draft_only() FROM PUBLIC, anon, authenticated;
