-- =====================================================================================================================
-- 128 HOME-1 exam categories (architect rulings 2026-11-01, Q3/Q4/Q5/Q8/Q9). Rollback: docs/database/rollback/128_rollback.sql.
-- No BEGIN / COMMIT (the runner owns the transaction).
--   exam_categories: slug / name / one-line description / order / active / INTERNAL (never public) / a built-in line
--     icon key + an optional uploaded icon (content-hash path GENERATED like conducting_orgs.logo_path, alt text required)
--   exams.category_id: FK, NOT NULL after the backfill; DEFAULT = the hidden "internal" category (fn_internal_category_id)
--     so writers that do not choose one (the importer, test fixtures) never land in a public category.
--     exams.category (text) stays, kept in step by the app, and is dropped one release later (Q9).
--   ONE slug namespace for /exams/<slug>: a category slug may not equal an exam slug and vice versa (triggers on both
--     tables) — Q3.
--   RLS: anon / authenticated read active, non-internal categories; writes only through the functions (service_role):
--     fn_category_save (create / update, order, active; refuses deactivating a category with active exams; refuses
--     internal-flag changes), fn_category_icon_set / fn_category_icon_remove (audited like fn_logo_set). INVOKER.
--   Seeds: ssc, police, defence, railway, banking (active) + internal (hidden). Backfill: the 4 SSC exams → ssc,
--     qa-syllabus-test → internal.
-- SECURITY DEFINER count unchanged.
-- =====================================================================================================================

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261031000127_exam_note_template.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'CATEGORIES_PREFLIGHT: 127 is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM public.exams WHERE slug IN ('ssc', 'police', 'defence', 'railway', 'banking', 'internal')) THEN
        RAISE EXCEPTION 'CATEGORIES_PREFLIGHT: an exam already uses a category slug';
    END IF;
END
$pre$;

CREATE TABLE public.exam_categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 40),
    name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
    short_desc      text CHECK (short_desc IS NULL OR char_length(short_desc) <= 140),
    display_order   integer NOT NULL DEFAULT 0,
    is_active       boolean NOT NULL DEFAULT true,
    is_internal     boolean NOT NULL DEFAULT false,
    icon_key        text NOT NULL DEFAULT 'default' CHECK (icon_key IN ('ssc', 'police', 'defence', 'railway', 'banking', 'internal', 'default')),
    icon_sha256     text CHECK (icon_sha256 IS NULL OR icon_sha256 ~ '^[0-9a-f]{64}$'),
    icon_alt        text CHECK (icon_alt IS NULL OR char_length(btrim(icon_alt)) BETWEEN 3 AND 160),
    icon_updated_at timestamptz,
    icon_path       text GENERATED ALWAYS AS (CASE WHEN icon_sha256 IS NULL THEN NULL ELSE 'categories/' || id::text || '/' || icon_sha256 || '.webp' END) STORED,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT exam_categories_icon_complete CHECK ((icon_sha256 IS NULL) = (icon_alt IS NULL))
);
COMMENT ON TABLE public.exam_categories IS 'HOME-1 (128): exam categories for /exams/<slug> and the home tiles. Internal categories are never public. Writes via fn_category_* (service_role, audited).';

ALTER TABLE public.exam_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.exam_categories TO anon, authenticated;
GRANT ALL ON TABLE public.exam_categories TO service_role;
CREATE POLICY "exam_categories: public read" ON public.exam_categories FOR SELECT TO anon, authenticated USING (is_active AND NOT is_internal);

INSERT INTO public.exam_categories (slug, name, short_desc, display_order, is_active, is_internal, icon_key) VALUES
    ('ssc', 'SSC', 'Staff Selection Commission exams: CGL, CHSL, MTS, GD and more.', 1, true, false, 'ssc'),
    ('police', 'Police', 'State police constable and sub-inspector exams.', 2, true, false, 'police'),
    ('defence', 'Defence', 'Defence recruitment exams.', 3, true, false, 'defence'),
    ('railway', 'Railway', 'Railway recruitment exams: NTPC, Group D, ALP and more.', 4, true, false, 'railway'),
    ('banking', 'Banking', 'Bank PO and clerk exams.', 5, true, false, 'banking'),
    ('internal', 'Internal', 'Internal test exams (never shown publicly).', 99, true, true, 'internal');

-- the hidden category id (column default for exams.category_id)
CREATE FUNCTION public.fn_internal_category_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $fn$
    SELECT id FROM public.exam_categories WHERE slug = 'internal'
$fn$;
REVOKE ALL ON FUNCTION public.fn_internal_category_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_internal_category_id() TO service_role, authenticated, anon;

ALTER TABLE public.exams ADD COLUMN category_id uuid REFERENCES public.exam_categories(id) ON DELETE RESTRICT;
UPDATE public.exams SET category_id = (SELECT id FROM public.exam_categories WHERE slug = 'ssc') WHERE slug IN ('ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ssc-gd');
UPDATE public.exams SET category_id = public.fn_internal_category_id() WHERE category_id IS NULL;  -- qa-syllabus-test (+ anything unmapped)
ALTER TABLE public.exams ALTER COLUMN category_id SET DEFAULT public.fn_internal_category_id();
ALTER TABLE public.exams ALTER COLUMN category_id SET NOT NULL;
CREATE INDEX idx_exams_category_id ON public.exams (category_id);

-- ONE slug namespace for /exams/<slug> (Q3)
CREATE FUNCTION public.fn_exam_slug_namespace_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF TG_TABLE_NAME = 'exam_categories' THEN
        IF EXISTS (SELECT 1 FROM public.exams WHERE slug = NEW.slug) THEN
            RAISE EXCEPTION 'EXAM_CATEGORY: the address /exams/% is already used by an exam', NEW.slug USING ERRCODE = '23505';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM public.exam_categories WHERE slug = NEW.slug) THEN
            RAISE EXCEPTION 'EXAM: the address /exams/% is already used by an exam category', NEW.slug USING ERRCODE = '23505';
        END IF;
    END IF;
    RETURN NEW;
END
$fn$;
CREATE TRIGGER trg_exam_categories_slug_namespace BEFORE INSERT OR UPDATE OF slug ON public.exam_categories
    FOR EACH ROW EXECUTE FUNCTION public.fn_exam_slug_namespace_guard();
CREATE TRIGGER trg_exams_slug_namespace BEFORE INSERT OR UPDATE OF slug ON public.exams
    FOR EACH ROW EXECUTE FUNCTION public.fn_exam_slug_namespace_guard();
REVOKE ALL ON FUNCTION public.fn_exam_slug_namespace_guard() FROM PUBLIC, anon, authenticated;

-- writes (INVOKER; EXECUTE service_role only; audited)
CREATE FUNCTION public.fn_category_save(
    p_id uuid, p_slug text, p_name text, p_short_desc text, p_display_order integer, p_is_active boolean,
    p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.exam_categories%ROWTYPE;
    v_row public.exam_categories%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'EXAM_CATEGORY: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_id IS NULL THEN
        INSERT INTO public.exam_categories (slug, name, short_desc, display_order, is_active)
        VALUES (lower(btrim(p_slug)), btrim(p_name), NULLIF(btrim(coalesce(p_short_desc, '')), ''), coalesce(p_display_order, 0), coalesce(p_is_active, true))
        RETURNING * INTO v_row;
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
        VALUES (p_actor_id, p_actor_email, 'EXAM_CATEGORY_CREATE', 'exam_category', v_row.id, NULL, jsonb_build_object('slug', v_row.slug, 'name', v_row.name));
    ELSE
        SELECT * INTO v_old FROM public.exam_categories WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_CATEGORY: category not found' USING ERRCODE = 'P0002'; END IF;
        IF v_old.is_internal THEN RAISE EXCEPTION 'EXAM_CATEGORY: the internal category cannot be edited' USING ERRCODE = '42501'; END IF;
        IF v_old.is_active AND NOT coalesce(p_is_active, true)
           AND EXISTS (SELECT 1 FROM public.exams WHERE category_id = p_id AND is_active) THEN
            RAISE EXCEPTION 'EXAM_CATEGORY: this category still has active exams; move or deactivate them first' USING ERRCODE = 'P0001';
        END IF;
        UPDATE public.exam_categories SET slug = lower(btrim(p_slug)), name = btrim(p_name), short_desc = NULLIF(btrim(coalesce(p_short_desc, '')), ''),
               display_order = coalesce(p_display_order, v_old.display_order), is_active = coalesce(p_is_active, v_old.is_active), updated_at = now()
         WHERE id = p_id RETURNING * INTO v_row;
        UPDATE public.exams SET category = v_row.name WHERE category_id = p_id AND category IS DISTINCT FROM v_row.name;  -- keep the text column in step (Q9)
        INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
        VALUES (p_actor_id, p_actor_email, 'EXAM_CATEGORY_UPDATE', 'exam_category', p_id,
                jsonb_build_object('slug', v_old.slug, 'name', v_old.name, 'display_order', v_old.display_order, 'is_active', v_old.is_active),
                jsonb_build_object('slug', v_row.slug, 'name', v_row.name, 'display_order', v_row.display_order, 'is_active', v_row.is_active));
    END IF;
    RETURN jsonb_build_object('id', v_row.id, 'slug', v_row.slug);
END
$fn$;

CREATE FUNCTION public.fn_category_icon_set(p_id uuid, p_sha256 text, p_alt text, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.exam_categories%ROWTYPE;
    v_new_path text;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'EXAM_CATEGORY: an actor is required' USING ERRCODE = '22023'; END IF;
    IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'EXAM_CATEGORY: bad icon hash' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_old FROM public.exam_categories WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_CATEGORY: category not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE public.exam_categories SET icon_sha256 = p_sha256, icon_alt = btrim(p_alt), icon_updated_at = now(), updated_at = now()
     WHERE id = p_id RETURNING icon_path INTO v_new_path;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, CASE WHEN v_old.icon_sha256 IS NULL THEN 'EXAM_CATEGORY_ICON_UPLOAD' ELSE 'EXAM_CATEGORY_ICON_REPLACE' END, 'exam_category', p_id,
            CASE WHEN v_old.icon_sha256 IS NULL THEN NULL ELSE jsonb_build_object('path', v_old.icon_path) END, jsonb_build_object('path', v_new_path, 'alt', btrim(p_alt)));
    RETURN jsonb_build_object('path', v_new_path, 'old_path', v_old.icon_path);
END
$fn$;

CREATE FUNCTION public.fn_category_icon_remove(p_id uuid, p_actor_id uuid, p_actor_email text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_old public.exam_categories%ROWTYPE;
BEGIN
    IF p_actor_email IS NULL OR btrim(p_actor_email) = '' THEN RAISE EXCEPTION 'EXAM_CATEGORY: an actor is required' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_old FROM public.exam_categories WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'EXAM_CATEGORY: category not found' USING ERRCODE = 'P0002'; END IF;
    IF v_old.icon_sha256 IS NULL THEN RETURN jsonb_build_object('old_path', NULL); END IF;
    UPDATE public.exam_categories SET icon_sha256 = NULL, icon_alt = NULL, icon_updated_at = now(), updated_at = now() WHERE id = p_id;
    INSERT INTO public.admin_audit_logs (actor_id, actor_email, action_type, target_entity, target_id, old_value, new_value)
    VALUES (p_actor_id, p_actor_email, 'EXAM_CATEGORY_ICON_REMOVE', 'exam_category', p_id, jsonb_build_object('path', v_old.icon_path), NULL);
    RETURN jsonb_build_object('old_path', v_old.icon_path);
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_category_save(uuid, text, text, text, integer, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_category_icon_set(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_category_icon_remove(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_category_save(uuid, text, text, text, integer, boolean, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_category_icon_set(uuid, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_category_icon_remove(uuid, uuid, text) TO service_role;

DO $proof$
BEGIN
    IF (SELECT count(*) FROM public.exam_categories) <> 6
       OR EXISTS (SELECT 1 FROM public.exams WHERE category_id IS NULL)
       OR (SELECT count(*) FROM public.exams e JOIN public.exam_categories c ON c.id = e.category_id WHERE c.slug = 'ssc') <> (SELECT count(*) FROM public.exams WHERE slug IN ('ssc-cgl', 'ssc-chsl', 'ssc-mts', 'ssc-gd'))
       OR (SELECT c.slug FROM public.exams e JOIN public.exam_categories c ON c.id = e.category_id WHERE e.slug = 'qa-syllabus-test') IS DISTINCT FROM 'internal'
       OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('fn_category_save', 'fn_category_icon_set', 'fn_category_icon_remove', 'fn_exam_slug_namespace_guard', 'fn_internal_category_id') AND prosecdef) THEN
        RAISE EXCEPTION 'CATEGORIES_PROOF: seed / backfill / functions do not behave';
    END IF;
END
$proof$;
