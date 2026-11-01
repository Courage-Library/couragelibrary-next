-- 132 rollback (SEC-SITE-MEDIA-1): puts updated_by_email back on site_media / site_gallery and restores the 129 / 130 /
-- 131 function bodies. Only for an emergency: it re-creates the column that would expose the uploader's e-mail through
-- the public read. Existing rows get the placeholder 'unknown-admin' (the real actor is in admin_audit_logs).
-- Run through scripts/db/apply-migration.cjs (no BEGIN / COMMIT here).

ALTER TABLE public.site_media ADD COLUMN updated_by_email text NOT NULL DEFAULT 'unknown-admin';
ALTER TABLE public.site_media ALTER COLUMN updated_by_email DROP DEFAULT;
ALTER TABLE public.site_gallery ADD COLUMN updated_by_email text NOT NULL DEFAULT 'unknown-admin';
ALTER TABLE public.site_gallery ALTER COLUMN updated_by_email DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.fn_site_media_set(p_key text, p_sha256 text, p_alt text, p_width integer, p_height integer, p_actor_id uuid, p_actor_email text)
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

CREATE OR REPLACE FUNCTION public.fn_site_media_remove(p_key text, p_actor_id uuid, p_actor_email text)
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

CREATE OR REPLACE FUNCTION public.fn_site_gallery_add(p_sha256 text, p_alt text, p_width integer, p_height integer, p_people_basis text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_n   integer;
    v_new public.site_gallery%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_GALLERY: an actor is required' USING ERRCODE = '22023'; END IF;
    LOCK TABLE public.site_gallery IN SHARE ROW EXCLUSIVE MODE;
    SELECT count(*) INTO v_n FROM public.site_gallery;
    IF v_n >= 6 THEN RAISE EXCEPTION 'SITE_GALLERY_FULL: the gallery already has 6 photos' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.site_gallery (position, sha256, alt, people_basis, width, height, updated_by_email)
    VALUES (v_n + 1, p_sha256, btrim(p_alt), p_people_basis, p_width, p_height, p_actor_email)
    RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SITE_GALLERY_ADD', 'site_gallery', v_new.id, NULL,
            jsonb_build_object('path', v_new.path, 'position', v_new.position, 'alt', v_new.alt, 'people_basis', v_new.people_basis));
    RETURN jsonb_build_object('id', v_new.id, 'path', v_new.path, 'position', v_new.position);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_site_gallery_update(p_id uuid, p_alt text, p_people_basis text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.site_gallery%ROWTYPE;
    v_new public.site_gallery%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_GALLERY: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_old FROM public.site_gallery WHERE id = p_id FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'SITE_GALLERY: photo not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.site_gallery SET alt = btrim(p_alt), people_basis = p_people_basis, updated_at = now(), updated_by_email = p_actor_email
    WHERE id = p_id RETURNING * INTO v_new;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SITE_GALLERY_UPDATE', 'site_gallery', p_id,
            jsonb_build_object('alt', v_old.alt, 'people_basis', v_old.people_basis), jsonb_build_object('alt', v_new.alt, 'people_basis', v_new.people_basis));
    RETURN jsonb_build_object('id', v_new.id, 'path', v_new.path);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_site_gallery_move(p_id uuid, p_position integer, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.site_gallery%ROWTYPE;
    v_n   integer;
    v_to  integer;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_GALLERY: an actor is required' USING ERRCODE = '22023'; END IF;
    LOCK TABLE public.site_gallery IN SHARE ROW EXCLUSIVE MODE;
    SELECT * INTO v_old FROM public.site_gallery WHERE id = p_id;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'SITE_GALLERY: photo not found' USING ERRCODE = 'P0002'; END IF;
    SELECT count(*) INTO v_n FROM public.site_gallery;
    v_to := least(greatest(p_position, 1), v_n);
    IF v_to = v_old.position THEN RETURN jsonb_build_object('id', p_id, 'position', v_to); END IF;
    SET CONSTRAINTS public.site_gallery_position_key DEFERRED;
    IF v_to < v_old.position THEN
        UPDATE public.site_gallery SET position = position + 1 WHERE position >= v_to AND position < v_old.position;
    ELSE
        UPDATE public.site_gallery SET position = position - 1 WHERE position > v_old.position AND position <= v_to;
    END IF;
    UPDATE public.site_gallery SET position = v_to, updated_at = now(), updated_by_email = p_actor_email WHERE id = p_id;
    SET CONSTRAINTS public.site_gallery_position_key IMMEDIATE;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SITE_GALLERY_MOVE', 'site_gallery', p_id, jsonb_build_object('position', v_old.position), jsonb_build_object('position', v_to));
    RETURN jsonb_build_object('id', p_id, 'position', v_to);
END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_site_gallery_remove(p_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.site_gallery%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'SITE_GALLERY: an actor is required' USING ERRCODE = '22023'; END IF;
    LOCK TABLE public.site_gallery IN SHARE ROW EXCLUSIVE MODE;
    DELETE FROM public.site_gallery WHERE id = p_id RETURNING * INTO v_old;
    IF v_old.id IS NULL THEN RETURN jsonb_build_object('old_path', NULL); END IF;
    SET CONSTRAINTS public.site_gallery_position_key DEFERRED;
    UPDATE public.site_gallery SET position = position - 1 WHERE position > v_old.position;
    SET CONSTRAINTS public.site_gallery_position_key IMMEDIATE;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'SITE_GALLERY_REMOVE', 'site_gallery', p_id, jsonb_build_object('path', v_old.path, 'position', v_old.position), NULL);
    RETURN jsonb_build_object('old_path', v_old.path);
END
$fn$;
