-- ============================================================================
-- COURAGE LIBRARY — PHASE 3D: IMMUTABILITY & DELETION GUARDS
-- Migration 56: 20260915000056_phase3d_immutability_and_deletion_guards.sql
-- ============================================================================
-- PURPOSE:
-- 1. Hardens public.document_versions against deletion if review_status = 'PUBLISHED' or is_published = true.
-- 2. Hardens public.learning_documents against deletion if published versions exist.
-- 3. Hardens public.document_versions against column mutations once published (NULL-safe IS DISTINCT FROM).
-- 4. Enforces pointer consistency: current_published_version_id must point to a published version of the same document.
-- 5. Guarantees 100% historical reproducibility for all published educational content.
-- ============================================================================

-- 1. Function: Prevent deletion of published document versions
CREATE OR REPLACE FUNCTION public.fn_prevent_published_version_deletion()
RETURNS TRIGGER AS 
BEGIN
  IF OLD.review_status = 'PUBLISHED' OR OLD.is_published = TRUE THEN
    RAISE EXCEPTION 'Cannot delete published document version % (v%). Published versions are permanently immutable and historically preserved.',
      OLD.id, OLD.version_number;
  END IF;
  RETURN OLD;
END;
 LANGUAGE plpgsql;

-- 2. Trigger on document_versions BEFORE DELETE
DROP TRIGGER IF EXISTS trg_prevent_published_version_deletion ON public.document_versions;
CREATE TRIGGER trg_prevent_published_version_deletion
  BEFORE DELETE ON public.document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_published_version_deletion();

-- 3. Function: Prevent deletion of learning_documents if published history exists
CREATE OR REPLACE FUNCTION public.fn_prevent_published_document_deletion()
RETURNS TRIGGER AS 
BEGIN
  IF OLD.current_published_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete learning document % with active published version %.',
      OLD.id, OLD.current_published_version_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.document_versions
    WHERE document_id = OLD.id
      AND (is_published = TRUE OR review_status = 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'Cannot delete learning document % because published version history exists.',
      OLD.id;
  END IF;

  RETURN OLD;
END;
 LANGUAGE plpgsql;

-- 4. Trigger on learning_documents BEFORE DELETE
DROP TRIGGER IF EXISTS trg_prevent_published_document_deletion ON public.learning_documents;
CREATE TRIGGER trg_prevent_published_document_deletion
  BEFORE DELETE ON public.learning_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_published_document_deletion();

-- 5. Function: Prevent mutation of published document version records (NULL-Safe IS DISTINCT FROM)
CREATE OR REPLACE FUNCTION public.fn_prevent_published_version_mutation()
RETURNS TRIGGER AS 
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
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Cannot mutate published document version % (v%). Published content versions are strictly immutable. Create version % instead.',
        OLD.id, OLD.version_number, (OLD.version_number + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
 LANGUAGE plpgsql;

-- 6. Trigger on document_versions BEFORE UPDATE
DROP TRIGGER IF EXISTS trg_prevent_published_version_mutation ON public.document_versions;
CREATE TRIGGER trg_prevent_published_version_mutation
  BEFORE UPDATE ON public.document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_published_version_mutation();

-- 7. Function: Enforce pointer consistency for current_published_version_id
CREATE OR REPLACE FUNCTION public.fn_enforce_document_published_pointer_consistency()
RETURNS TRIGGER AS 
BEGIN
  IF NEW.current_published_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.document_versions
      WHERE id = NEW.current_published_version_id
        AND document_id = NEW.id
        AND (is_published = TRUE OR review_status = 'PUBLISHED')
    ) THEN
      RAISE EXCEPTION 'Invalid published version pointer: version % does not belong to document % or is not published.',
        NEW.current_published_version_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
 LANGUAGE plpgsql;

-- 8. Trigger on learning_documents BEFORE INSERT OR UPDATE OF current_published_version_id
DROP TRIGGER IF EXISTS trg_enforce_document_published_pointer_consistency ON public.learning_documents;
CREATE TRIGGER trg_enforce_document_published_pointer_consistency
  BEFORE INSERT OR UPDATE OF current_published_version_id ON public.learning_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enforce_document_published_pointer_consistency();
