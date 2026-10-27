-- Rollback for 20261027000118_ca3_retire_mdx.sql. Run as ONE transaction by the operator.
-- Removes only the retirement guards; no row changes. (The legacy Storage files were never touched.)
BEGIN;
DROP TRIGGER IF EXISTS trg_guard_document_pointer_blocks ON public.learning_documents;
DROP FUNCTION IF EXISTS public.fn_guard_document_pointer_blocks();
DROP TRIGGER IF EXISTS trg_guard_retired_mdx_versions ON public.document_versions;
DROP FUNCTION IF EXISTS public.fn_guard_retired_mdx_versions();
COMMIT;
