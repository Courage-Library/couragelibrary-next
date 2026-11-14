-- 131 rollback (HOME-1 brand settings): site_media back to the 129 shape (key 'home_photo', photo sizes, .webp path).
-- Brand rows must be removed first (the 129 key check cannot hold them): delete them through Settings › Brand (which
-- also deletes the files), or list the storage files under org-logos/site/brand_* and delete them with the service role.
-- Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).
-- ROLLBACK-CHAIN: run first: none

DO $pre$
BEGIN
    IF EXISTS (SELECT 1 FROM public.site_media) THEN RAISE EXCEPTION '131_ROLLBACK: remove the brand assets first'; END IF;
END
$pre$;

ALTER TABLE public.site_media DROP CONSTRAINT site_media_key_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_key_check CHECK (key IN ('home_photo'));
ALTER TABLE public.site_media DROP CONSTRAINT site_media_width_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_width_check CHECK (width BETWEEN 390 AND 4000);
ALTER TABLE public.site_media DROP CONSTRAINT site_media_height_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_height_check CHECK (height BETWEEN 100 AND 4000);
ALTER TABLE public.site_media DROP COLUMN path;
ALTER TABLE public.site_media ADD COLUMN path text GENERATED ALWAYS AS ('site/' || key || '/' || sha256 || '.webp') STORED;
COMMENT ON TABLE public.site_media IS 'HOME-1 (129): site-wide images (home page photo). Public read; writes via fn_site_media_set / _remove (service_role, audited).';
