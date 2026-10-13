-- =============================================================================
-- COURAGE LIBRARY — GAP2-2a: L2 LEARNING RE-POINT
-- Migration: 20261012000072_l2_learning_repoint.sql
--
-- learning_documents becomes the single learning-content store for every reader.
-- Nothing from the old stack (learning_resources, learning_resource_topics, articles,
-- article_versions) is dropped here — that is GAP2-2b.
--
-- 1. learning_documents.access_level TEXT NOT NULL DEFAULT 'FREE' CHECK IN ('FREE','PRO').
-- 2. current_affairs_learning_mappings: learning_resource_id → learning_document_id
--    (NOT NULL, FK learning_documents ON DELETE RESTRICT, UNIQUE (article_id,
--    learning_document_id)). Aborts unless the table is empty. Existing RLS policy
--    (parent CA article PUBLISHED) is unchanged.
-- 3. course_lessons.learning_document_id UUID NULL → learning_documents ON DELETE RESTRICT
--    (learning_resource_id untouched).
-- 4. DROP FUNCTION fn_resolve_learn_more (uncalled; replaced by LearningResolverService).
-- 5. Private storage bucket 'learning-artifacts' for document specs and compiled bodies
--    (the Content Studio publish path writes there; it did not exist). No storage
--    policies: only the service role (server-side) can read or write it, so PRO bodies
--    are never reachable from the browser.
-- Grants are otherwise unchanged.
-- =============================================================================

-- 1. Access level --------------------------------------------------------------
ALTER TABLE public.learning_documents
    ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'FREE';

ALTER TABLE public.learning_documents
    DROP CONSTRAINT IF EXISTS chk_learning_documents_access_level;
ALTER TABLE public.learning_documents
    ADD CONSTRAINT chk_learning_documents_access_level CHECK (access_level IN ('FREE', 'PRO'));

-- 2. Current-affairs learning mappings → learning_documents -------------------------
DO $$
BEGIN
    IF (SELECT count(*) FROM public.current_affairs_learning_mappings) <> 0 THEN
        RAISE EXCEPTION 'L2_CA_MAPPINGS_NOT_EMPTY: current_affairs_learning_mappings has rows; re-point needs a data migration';
    END IF;
END $$;

ALTER TABLE public.current_affairs_learning_mappings
    DROP CONSTRAINT IF EXISTS uq_ca_learning_mapping,
    DROP CONSTRAINT IF EXISTS current_affairs_learning_mappings_learning_resource_id_fkey;
ALTER TABLE public.current_affairs_learning_mappings
    DROP COLUMN learning_resource_id;
ALTER TABLE public.current_affairs_learning_mappings
    ADD COLUMN learning_document_id UUID NOT NULL
        CONSTRAINT current_affairs_learning_mappings_learning_document_id_fkey
        REFERENCES public.learning_documents(id) ON DELETE RESTRICT;
ALTER TABLE public.current_affairs_learning_mappings
    ADD CONSTRAINT uq_ca_learning_mapping UNIQUE (article_id, learning_document_id);
CREATE INDEX IF NOT EXISTS idx_ca_learning_mappings_document
    ON public.current_affairs_learning_mappings (learning_document_id);

-- 3. Course lessons → learning_documents ---------------------------------------------
ALTER TABLE public.course_lessons
    ADD COLUMN IF NOT EXISTS learning_document_id UUID NULL
        CONSTRAINT course_lessons_learning_document_id_fkey
        REFERENCES public.learning_documents(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_course_lessons_learning_document
    ON public.course_lessons (learning_document_id);

-- 4. Retire fn_resolve_learn_more ----------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_resolve_learn_more(uuid, uuid);

-- 5. Private bucket for learning artifacts ---------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('learning-artifacts', 'learning-artifacts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Proof -----------------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regprocedure('public.fn_resolve_learn_more(uuid,uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'L2_PROOF: fn_resolve_learn_more still exists';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'learning-artifacts' AND public = false) THEN
        RAISE EXCEPTION 'L2_PROOF: private learning-artifacts bucket missing';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
               AND table_name = 'current_affairs_learning_mappings' AND column_name = 'learning_resource_id') THEN
        RAISE EXCEPTION 'L2_PROOF: learning_resource_id still present on current_affairs_learning_mappings';
    END IF;
END $$;

-- End of 072.
