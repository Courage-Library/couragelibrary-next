-- =====================================================================================================================
-- 129 HOME-1 site media (owner decision 2, 2026-11-01): the "Home page photo" (the real Kanpur library; space only, no
-- identifiable faces). Rollback: docs/database/rollback/129_rollback.sql. No BEGIN / COMMIT (the runner owns the
-- transaction).
--   site_media: one row per slot (key 'home_photo' only for now) — content-hash path GENERATED from the sha256
--     (site/<key>/<sha>.webp; the 768 / 390 px copies sit next to it), alt text REQUIRED, the stored width / height
--     (the page reserves the box: no layout shift), who changed it
--   RLS: anon / authenticated read (a public page photo); writes only through fn_site_media_set / fn_site_media_remove
--     (INVOKER, EXECUTE service_role only, audited SITE_MEDIA_UPLOAD / _REPLACE / _REMOVE; they return the old path so
--     the server deletes the old files only after the row changed — the logo pattern)
-- SECURITY DEFINER count unchanged.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261101000128_exam_categories.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'SITE_MEDIA_PREFLIGHT: 128 is not applied';
    END IF;
END
$pre$;

CREATE TABLE public.site_media (
    key              text PRIMARY KEY CHECK (key IN ('home_photo')),
    sha256           text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    alt              text NOT NULL CHECK (char_length(btrim(alt)) BETWEEN 3 AND 200),
    width            integer NOT NULL CHECK (width BETWEEN 390 AND 4000),
    height           integer NOT NULL CHECK (height BETWEEN 100 AND 4000),
    path             text GENERATED ALWAYS AS ('site/' || key || '/' || sha256 || '.webp') STORED,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by_email text NOT NULL
);
COMMENT ON TABLE public.site_media IS 'HOME-1 (129): site-wide images (home page photo). Public read; writes via fn_site_media_set / _remove (service_role, audited).';

ALTER TABLE public.site_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_media FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_media TO anon, authenticated;
GRANT ALL ON TABLE public.site_media TO service_role;
CREATE POLICY "site_media: public read" ON public.site_media FOR SELECT TO anon, authenticated USING (true);

CREATE FUNCTION public.fn_site_media_set(p_key text, p_sha256 text, p_alt text, p_width integer, p_height integer, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.site_media%ROWTYPE;
    v_new public.site_media%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_MEDIA: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_old FROM public.site_media WHERE key = p_key FOR UPDATE;
    INSERT INTO public.site_media (key, sha256, alt, width, height, updated_at, updated_by_email)
    VALUES (p_key, p_sha256, btrim(p_alt), p_width, p_height, now(), p_actor_email)
    ON CONFLICT (key) DO UPDATE SET sha256 = EXCLUDED.sha256, alt = EXCLUDED.alt, width = EXCLUDED.width, height = EXCLUDED.height,
        updated_at = now(), updated_by_email = EXCLUDED.updated_by_email
    RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, CASE WHEN v_old.key IS NULL THEN 'SITE_MEDIA_UPLOAD' ELSE 'SITE_MEDIA_REPLACE' END, 'site_media', NULL,
            CASE WHEN v_old.key IS NULL THEN NULL ELSE jsonb_build_object('key', v_old.key, 'path', v_old.path) END,
            jsonb_build_object('key', v_new.key, 'path', v_new.path, 'alt', v_new.alt, 'width', v_new.width, 'height', v_new.height));
    RETURN jsonb_build_object('path', v_new.path, 'old_path', v_old.path);
END
$fn$;

CREATE FUNCTION public.fn_site_media_remove(p_key text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.site_media%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_MEDIA: an actor is required' USING ERRCODE = '22023'; END IF;
    DELETE FROM public.site_media WHERE key = p_key RETURNING * INTO v_old;
    IF v_old.key IS NULL THEN RETURN jsonb_build_object('old_path', NULL); END IF;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SITE_MEDIA_REMOVE', 'site_media', NULL, jsonb_build_object('key', v_old.key, 'path', v_old.path), NULL);
    RETURN jsonb_build_object('old_path', v_old.path);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_site_media_set(text, text, text, integer, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_site_media_remove(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_site_media_set(text, text, text, integer, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_site_media_remove(text, uuid, text) TO service_role;

DO $proof$
BEGIN
    IF EXISTS (SELECT 1 FROM public.site_media)
       OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('fn_site_media_set', 'fn_site_media_remove') AND prosecdef)
       OR has_function_privilege('authenticated', 'public.fn_site_media_set(text, text, text, integer, integer, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'SITE_MEDIA_PROOF: table / functions do not behave';
    END IF;
END
$proof$;
