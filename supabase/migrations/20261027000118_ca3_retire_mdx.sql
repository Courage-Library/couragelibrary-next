-- =====================================================================================================================
-- 118 CA-3 RETIRE THE MDX LESSON PATH (architect: "keep the old storage files archived until the DB versions are
-- verified; then retire the MDX path"). Applied ONLY after scripts/content/ca3-convert-legacy-lessons.cjs --apply
-- verified every converted lesson. Rollback: docs/database/rollback/118_rollback.sql. No BEGIN / COMMIT (runner).
--
--   document_versions — no NEW LEGACY_MDX version (insert refused); an existing legacy version is frozen: it can only
--     be demoted (is_current → false), never edited, published again or made current again. Its Storage files stay
--     archived (bucket learning-artifacts untouched; local copies + manifest under BACKUP_DIR/ca3/legacy-lessons).
--   learning_documents — the published pointer can only move to a BLOCKS version.
-- =====================================================================================================================

DO $pre$
DECLARE
    v_n integer;
BEGIN
    SELECT count(*) INTO v_n FROM public.document_versions WHERE is_current AND content_format = 'LEGACY_MDX';
    IF v_n > 0 THEN RAISE EXCEPTION 'CA3_RETIRE_PREFLIGHT: % legacy versions are still current; convert them first', v_n; END IF;
    SELECT count(*) INTO v_n FROM public.learning_documents d JOIN public.document_versions v ON v.id = d.current_published_version_id
     WHERE v.content_format <> 'BLOCKS';
    IF v_n > 0 THEN RAISE EXCEPTION 'CA3_RETIRE_PREFLIGHT: % documents still point at a legacy version', v_n; END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.fn_guard_retired_mdx_versions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.content_format = 'LEGACY_MDX' THEN
            RAISE EXCEPTION 'MDX_PATH_RETIRED: new lesson versions are DB blocks (content_format BLOCKS)' USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;
    IF OLD.content_format = 'LEGACY_MDX' THEN
        IF NEW.content_format IS DISTINCT FROM OLD.content_format
           OR NEW.review_status IS DISTINCT FROM OLD.review_status
           OR NEW.is_published IS DISTINCT FROM OLD.is_published
           OR NEW.source_spec_storage_key IS DISTINCT FROM OLD.source_spec_storage_key
           OR NEW.source_spec_hash IS DISTINCT FROM OLD.source_spec_hash
           OR NEW.compiled_artifact_storage_key IS DISTINCT FROM OLD.compiled_artifact_storage_key
           OR NEW.compiled_artifact_hash IS DISTINCT FROM OLD.compiled_artifact_hash
           OR (NEW.is_current AND NOT OLD.is_current) THEN
            RAISE EXCEPTION 'MDX_PATH_RETIRED: legacy MDX version % is frozen (archived); only demotion is allowed', OLD.version_number USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_guard_retired_mdx_versions ON public.document_versions;
CREATE TRIGGER trg_guard_retired_mdx_versions
    BEFORE INSERT OR UPDATE ON public.document_versions
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_retired_mdx_versions();

CREATE OR REPLACE FUNCTION public.fn_guard_document_pointer_blocks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF NEW.current_published_version_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.document_versions WHERE id = NEW.current_published_version_id AND content_format = 'BLOCKS') THEN
        RAISE EXCEPTION 'MDX_PATH_RETIRED: a document''s published version must be a DB lesson (BLOCKS)' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_guard_document_pointer_blocks ON public.learning_documents;
CREATE TRIGGER trg_guard_document_pointer_blocks
    BEFORE INSERT OR UPDATE OF current_published_version_id ON public.learning_documents
    FOR EACH ROW EXECUTE FUNCTION public.fn_guard_document_pointer_blocks();

REVOKE ALL ON FUNCTION public.fn_guard_retired_mdx_versions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_guard_document_pointer_blocks() FROM PUBLIC, anon, authenticated;
