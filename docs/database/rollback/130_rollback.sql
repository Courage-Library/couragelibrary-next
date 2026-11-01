-- 130 rollback (HOME-1 library gallery). Removes the gallery table and its functions. Uploaded photo FILES (storage,
-- org-logos/site/gallery/…) are not removed here: list them first and delete them with the service role if wanted.
-- Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).

DROP FUNCTION IF EXISTS public.fn_site_gallery_add(text, text, integer, integer, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_site_gallery_update(uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_site_gallery_move(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.fn_site_gallery_remove(uuid, uuid, text);
DROP TABLE IF EXISTS public.site_gallery;

DO $proof$
BEGIN
    IF to_regclass('public.site_gallery') IS NOT NULL OR EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'fn_site_gallery_%') THEN
        RAISE EXCEPTION '130_ROLLBACK: site_gallery is still present';
    END IF;
END
$proof$;
