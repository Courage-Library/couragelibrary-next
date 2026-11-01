-- =====================================================================================================================
-- 130 HOME-1 design upgrade (owner, 2026-11-01): the "Home page photo" slot becomes a small LIBRARY GALLERY — up to 6
-- real photos of the Kanpur library, ordered, each with alt text and the basis on which people may appear
-- ("honest images" policy: real library photos; no recognisable person, or written consent obtained).
-- Rollback: docs/database/rollback/130_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
--   site_gallery: one row per photo — position 1..6 (unique, DEFERRABLE so a move can shift rows inside one statement
--     set), content-hash path GENERATED from the sha256 (site/gallery/<sha>.webp; the 768 / 390 px copies sit next to
--     it), alt text REQUIRED, people_basis REQUIRED, the stored width / height (the page reserves the box: no shift)
--   RLS: anon / authenticated read (public photos); writes only through fn_site_gallery_add / _update / _move / _remove
--     (INVOKER, EXECUTE service_role only, audited SITE_GALLERY_*; add / move / remove take a table lock so positions
--     stay 1..n without gaps; remove returns the old path so the server deletes the files only after the row is gone)
--   site_media (129) stays as it is (empty, no longer read by the app) — dropping it is a later clean-up.
-- SECURITY DEFINER count unchanged.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261101000129_site_media.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'SITE_GALLERY_PREFLIGHT: 129 is not applied';
    END IF;
END
$pre$;

CREATE TABLE public.site_gallery (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    position         smallint NOT NULL CHECK (position BETWEEN 1 AND 6),
    sha256           text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    alt              text NOT NULL CHECK (char_length(btrim(alt)) BETWEEN 3 AND 200),
    people_basis     text NOT NULL CHECK (people_basis IN ('NO_RECOGNISABLE_PERSON', 'WRITTEN_CONSENT')),
    width            integer NOT NULL CHECK (width BETWEEN 390 AND 4000),
    height           integer NOT NULL CHECK (height BETWEEN 100 AND 4000),
    path             text GENERATED ALWAYS AS ('site/gallery/' || sha256 || '.webp') STORED,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    updated_by_email text NOT NULL,
    CONSTRAINT site_gallery_position_key UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE
);
COMMENT ON TABLE public.site_gallery IS 'HOME-1 (130): the library gallery on the home page (≤ 6, ordered). Public read; writes via fn_site_gallery_* (service_role, audited).';

ALTER TABLE public.site_gallery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.site_gallery FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_gallery TO anon, authenticated;
GRANT ALL ON TABLE public.site_gallery TO service_role;
CREATE POLICY "site_gallery: public read" ON public.site_gallery FOR SELECT TO anon, authenticated USING (true);

CREATE FUNCTION public.fn_site_gallery_add(p_sha256 text, p_alt text, p_width integer, p_height integer, p_people_basis text, p_actor_id uuid, p_actor_email text)
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

CREATE FUNCTION public.fn_site_gallery_update(p_id uuid, p_alt text, p_people_basis text, p_actor_id uuid, p_actor_email text)
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

CREATE FUNCTION public.fn_site_gallery_move(p_id uuid, p_position integer, p_actor_id uuid, p_actor_email text)
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

CREATE FUNCTION public.fn_site_gallery_remove(p_id uuid, p_actor_id uuid, p_actor_email text)
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

REVOKE ALL ON FUNCTION public.fn_site_gallery_add(text, text, integer, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_site_gallery_update(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_site_gallery_move(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_site_gallery_remove(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_site_gallery_add(text, text, integer, integer, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_site_gallery_update(uuid, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_site_gallery_move(uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_site_gallery_remove(uuid, uuid, text) TO service_role;

DO $proof$
BEGIN
    IF EXISTS (SELECT 1 FROM public.site_gallery)
       OR EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'fn_site_gallery_%' AND prosecdef)
       OR (SELECT count(*) FROM pg_proc WHERE proname LIKE 'fn_site_gallery_%') <> 4
       OR has_function_privilege('authenticated', 'public.fn_site_gallery_add(text, text, integer, integer, text, uuid, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.fn_site_gallery_remove(uuid, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'SITE_GALLERY_PROOF: table / functions do not behave';
    END IF;
END
$proof$;
