-- 128 rollback (HOME-1 exam categories). Removes the categories model; exams keep their text column `category`
-- (never touched by 128 except the app keeping it in step). Uploaded icon FILES (storage, org-logos/categories/…) are
-- not removed here: list them first and delete them with the service role if wanted.
-- Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).
-- ROLLBACK-CHAIN: run first: none

DROP TRIGGER IF EXISTS trg_exams_slug_namespace ON public.exams;
DROP TRIGGER IF EXISTS trg_exam_categories_slug_namespace ON public.exam_categories;
DROP FUNCTION IF EXISTS public.fn_exam_slug_namespace_guard();
DROP FUNCTION IF EXISTS public.fn_category_save(uuid, text, text, text, integer, boolean, uuid, text);
DROP FUNCTION IF EXISTS public.fn_category_icon_set(uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_category_icon_remove(uuid, uuid, text);
DROP INDEX IF EXISTS public.idx_exams_category_id;
ALTER TABLE public.exams DROP COLUMN IF EXISTS category_id;
DROP FUNCTION IF EXISTS public.fn_internal_category_id();
DROP TABLE IF EXISTS public.exam_categories;

DO $proof$
BEGIN
    IF to_regclass('public.exam_categories') IS NOT NULL
       OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'exams' AND column_name = 'category_id') THEN
        RAISE EXCEPTION '128_ROLLBACK: the categories model is still present';
    END IF;
END
$proof$;
