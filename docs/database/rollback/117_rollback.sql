-- Rollback for 20261027000117_ca3_lesson_blocks.sql. Run as ONE transaction by the operator.
-- Safe only while NO BLOCKS version exists (the 2 converted QA lessons included: then the legacy MDX v1 rows, whose
-- Storage files are kept and archived, become the current versions again — restore their pointers first, see below).
-- fn_syllabus_mapping_node_fields keeps 117's inlined roll-up on purpose (same behaviour as 116, and client inserts are
-- refused by RLS again); rolling it back would re-open the RLS P-2 regression.
BEGIN;

DO $chk$ BEGIN
  IF EXISTS (SELECT 1 FROM public.document_versions WHERE content_format = 'BLOCKS') THEN
    RAISE EXCEPTION 'ROLLBACK 117: BLOCKS versions exist; point their documents back at the legacy versions and remove the BLOCKS drafts first (published BLOCKS rows are immutable: keep 117 instead)';
  END IF;
END $chk$;

-- client read access back to table level (117 replaced it by column grants without blocks / lesson_meta)
DO $g$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_column_privilege(r, 'public.document_versions', 'id', 'SELECT') THEN
      EXECUTE format('GRANT SELECT ON TABLE public.document_versions TO %I', r);
    END IF;
  END LOOP;
END $g$;

DROP FUNCTION IF EXISTS public.fn_lesson_publish(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_lesson_save_draft(uuid, text, jsonb, jsonb, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_lesson_audit(uuid, text, text, uuid, jsonb);
DROP TRIGGER IF EXISTS trg_a_lesson_version_blocks_guard ON public.document_versions;
DROP FUNCTION IF EXISTS public.fn_lesson_version_blocks_guard();
DROP FUNCTION IF EXISTS public.fn_lesson_blocks_errors(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fn_lesson__oneof(jsonb, text, text, text[], boolean);
DROP FUNCTION IF EXISTS public.fn_lesson__keys(jsonb, text[], text);
DROP FUNCTION IF EXISTS public.fn_lesson__strlist(jsonb, text, text, integer, integer, integer, boolean, boolean);
DROP FUNCTION IF EXISTS public.fn_lesson__str(jsonb, text, text, integer, boolean, boolean);
DROP FUNCTION IF EXISTS public.fn_lesson__latex_problem(text);
DROP FUNCTION IF EXISTS public.fn_lesson__text_problem(text);

-- the published-version guard as before 117
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
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Cannot mutate published document version % (v%). Published content versions are strictly immutable. Create version % instead.',
        OLD.id, OLD.version_number, (OLD.version_number + 1);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP INDEX IF EXISTS public.uq_document_versions_one_current_per_language;
ALTER TABLE public.document_versions
  DROP CONSTRAINT IF EXISTS chk_document_version_current_published,
  DROP CONSTRAINT IF EXISTS chk_document_version_content,
  DROP COLUMN IF EXISTS is_current,
  DROP COLUMN IF EXISTS blocks_schema_version,
  DROP COLUMN IF EXISTS blocks_hash,
  DROP COLUMN IF EXISTS blocks,
  DROP COLUMN IF EXISTS lesson_meta,
  DROP COLUMN IF EXISTS language,
  DROP COLUMN IF EXISTS content_format;
ALTER TABLE public.document_versions
  ALTER COLUMN source_spec_storage_key SET NOT NULL,
  ALTER COLUMN source_spec_hash SET NOT NULL,
  ALTER COLUMN compiled_artifact_storage_key SET NOT NULL,
  ALTER COLUMN compiled_artifact_hash SET NOT NULL;

-- the lesson-images bucket is kept if it holds objects (never delete content in a rollback)
DELETE FROM storage.buckets b WHERE b.id = 'lesson-images' AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'lesson-images');

COMMIT;
