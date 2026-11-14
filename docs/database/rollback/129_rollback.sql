-- 129 rollback (HOME-1 site media). Removes the slot table and its functions. Uploaded photo FILES (storage,
-- org-logos/site/…) are not removed here: list them first and delete them with the service role if wanted.
-- Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).
-- ROLLBACK-CHAIN: run first: none

DROP FUNCTION IF EXISTS public.fn_site_media_set(text, text, text, integer, integer, uuid, text);
DROP FUNCTION IF EXISTS public.fn_site_media_remove(text, uuid, text);
DROP TABLE IF EXISTS public.site_media;

DO $proof$
BEGIN
    IF to_regclass('public.site_media') IS NOT NULL THEN RAISE EXCEPTION '129_ROLLBACK: site_media is still present'; END IF;
END
$proof$;
