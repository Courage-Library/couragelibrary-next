-- =====================================================================================================================
-- 131 HOME-1 brand settings (owner, 2026-11-01): admin › Settings › Brand — the header logo (horizontal), the square
-- mark (favicon / app icons: 32 / 180 / 192 / 512 px PNG) and an optional footer logo for the dark footer.
-- Reuses site_media (129), which the app no longer reads since the gallery (130) replaced the home photo.
-- Rollback: docs/database/rollback/131_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   site_media.key:   'home_photo' → 'brand_header_logo' | 'brand_square_mark' | 'brand_footer_logo'
--   size limits:      logos and icons are small (32..4000 px instead of the photo's 390 / 100 minimum)
--   path (GENERATED): site/<key>/<sha>.png for the square mark (icons must be PNG), .webp for the logos
-- The table must be empty (checked). fn_site_media_set / _remove (INVOKER, service_role only, audited SITE_MEDIA_*)
-- are unchanged and work per key. SECURITY DEFINER count unchanged.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261101000130_site_gallery.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'BRAND_ASSETS_PREFLIGHT: 130 is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM public.site_media) THEN
        RAISE EXCEPTION 'BRAND_ASSETS_PREFLIGHT: site_media is not empty';
    END IF;
END
$pre$;

ALTER TABLE public.site_media DROP CONSTRAINT site_media_key_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_key_check CHECK (key IN ('brand_header_logo', 'brand_square_mark', 'brand_footer_logo'));
ALTER TABLE public.site_media DROP CONSTRAINT site_media_width_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_width_check CHECK (width BETWEEN 32 AND 4000);
ALTER TABLE public.site_media DROP CONSTRAINT site_media_height_check;
ALTER TABLE public.site_media ADD CONSTRAINT site_media_height_check CHECK (height BETWEEN 32 AND 4000);
ALTER TABLE public.site_media DROP COLUMN path;
ALTER TABLE public.site_media ADD COLUMN path text GENERATED ALWAYS AS
    ('site/' || key || '/' || sha256 || CASE WHEN key = 'brand_square_mark' THEN '.png' ELSE '.webp' END) STORED;
COMMENT ON TABLE public.site_media IS 'HOME-1 (129 → 131): brand assets (header logo, square mark, footer logo). Public read; writes via fn_site_media_set / _remove (service_role, audited).';

DO $proof$
BEGIN
    IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'site_media_key_check' AND conrelid = 'public.site_media'::regclass) NOT LIKE '%brand_square_mark%'
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_media' AND column_name = 'path' AND is_generated = 'ALWAYS')
       OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('fn_site_media_set', 'fn_site_media_remove') AND prosecdef)
       OR has_function_privilege('authenticated', 'public.fn_site_media_set(text, text, text, integer, integer, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'BRAND_ASSETS_PROOF: site_media does not behave';
    END IF;
END
$proof$;
