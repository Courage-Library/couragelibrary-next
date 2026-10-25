-- =====================================================================================================================
-- 096 F8 (#80) — usernames + opt-in public profile on the canonical public.user_profiles
-- NOT APPLIED until the architect's "go". Rollback: docs/database/rollback/096_rollback.sql
-- No BEGIN / COMMIT here: scripts/db/apply-migration.cjs runs the file and its ledger row in ONE transaction.
--
-- 1. user_profiles gains: username (3–20, lowercase letters / digits / single underscores, starts with a letter;
--    unique), username_changed_at, profile_public (default false), adult_confirmed_at (self-declared 18+; NO date of
--    birth is stored — data minimisation). A public profile REQUIRES a username and the 18+ confirmation (CHECK), so a
--    minor never has a public profile.
-- 2. public.username_blocklist (RESERVED exact / PROFANITY substring after folding look-alike characters), seeded from
--    lib/profile/username.ts (the gate keeps both identical); RLS on, no client grants (admin edits via service role).
-- 3. Client writes are narrowed to column grants: INSERT (id, full_name, phone, avatar_url, language_preference) and
--    UPDATE (full_name, phone, avatar_url, language_preference, updated_at). Today authenticated holds table-level
--    INSERT / UPDATE, so a client could set ANY column of its own row (is_active, created_at — and, after this
--    migration, username / profile_public); the new columns are writable ONLY through the RPCs below.
-- 4. fn_set_username (SECURITY DEFINER, search_path '', authenticated only): auth.uid(); format + blocklist; first choice
--    free, then once every 30 days; unique (TAKEN). fn_set_profile_visibility: public only with a username and the
--    18+ confirmation (given now or earlier); private always allowed; the 18+ confirmation may also be recorded while
--    staying private (p_public false, p_confirm_adult true). Fixed codes only.
-- 5. Leaderboard opt-in (architect ruling (a), 2026-10-25 — replaces the user-writable auth user_metadata flag, #60):
--    user_profiles.leaderboard_opt_in (default false), written ONLY by fn_set_leaderboard_opt_in(boolean) with
--    auth.uid(); NO client UPDATE grant; CHECK: opting in requires the 18+ confirmation (#80: under-18 is forced false,
--    the RPC rejects it). The leaderboard reads this column only.
-- Public profile pages read through the server (service role, flag-gated) and show only username + month joined.
-- =====================================================================================================================

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS username text,
    ADD COLUMN IF NOT EXISTS username_changed_at timestamptz,
    ADD COLUMN IF NOT EXISTS profile_public boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS adult_confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_profiles
    ADD CONSTRAINT chk_user_profiles_username_format CHECK (
        username IS NULL OR (username ~ '^[a-z][a-z0-9_]{2,19}$' AND position('__' in username) = 0 AND right(username, 1) <> '_')),
    ADD CONSTRAINT chk_user_profiles_public_needs_adult_username CHECK (
        NOT profile_public OR (username IS NOT NULL AND adult_confirmed_at IS NOT NULL)),
    ADD CONSTRAINT chk_user_profiles_leaderboard_needs_adult CHECK (NOT leaderboard_opt_in OR adult_confirmed_at IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_username ON public.user_profiles (username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.username_blocklist (
    term text PRIMARY KEY CHECK (term ~ '^[a-z_]{1,40}$'),
    kind text NOT NULL CHECK (kind IN ('RESERVED', 'PROFANITY'))
);
ALTER TABLE public.username_blocklist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.username_blocklist FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.username_blocklist TO service_role;
INSERT INTO public.username_blocklist (term, kind) VALUES
    ('about', 'RESERVED'),
    ('account', 'RESERVED'),
    ('accounts', 'RESERVED'),
    ('admin', 'RESERVED'),
    ('administrator', 'RESERVED'),
    ('anonymous', 'RESERVED'),
    ('api', 'RESERVED'),
    ('articles', 'RESERVED'),
    ('auth', 'RESERVED'),
    ('billing', 'RESERVED'),
    ('ceo', 'RESERVED'),
    ('contact', 'RESERVED'),
    ('courage', 'RESERVED'),
    ('couragelibrary', 'RESERVED'),
    ('courage_library', 'RESERVED'),
    ('dashboard', 'RESERVED'),
    ('email', 'RESERVED'),
    ('exam', 'RESERVED'),
    ('exams', 'RESERVED'),
    ('founder', 'RESERVED'),
    ('grievance', 'RESERVED'),
    ('guest', 'RESERVED'),
    ('help', 'RESERVED'),
    ('helpdesk', 'RESERVED'),
    ('learn', 'RESERVED'),
    ('legal', 'RESERVED'),
    ('library', 'RESERVED'),
    ('login', 'RESERVED'),
    ('logout', 'RESERVED'),
    ('mail', 'RESERVED'),
    ('me', 'RESERVED'),
    ('mock', 'RESERVED'),
    ('mocks', 'RESERVED'),
    ('mod', 'RESERVED'),
    ('moderator', 'RESERVED'),
    ('null', 'RESERVED'),
    ('official', 'RESERVED'),
    ('owner', 'RESERVED'),
    ('payments', 'RESERVED'),
    ('practice', 'RESERVED'),
    ('privacy', 'RESERVED'),
    ('profile', 'RESERVED'),
    ('profiles', 'RESERVED'),
    ('register', 'RESERVED'),
    ('root', 'RESERVED'),
    ('security', 'RESERVED'),
    ('settings', 'RESERVED'),
    ('signin', 'RESERVED'),
    ('signup', 'RESERVED'),
    ('staff', 'RESERVED'),
    ('support', 'RESERVED'),
    ('system', 'RESERVED'),
    ('team', 'RESERVED'),
    ('terms', 'RESERVED'),
    ('test', 'RESERVED'),
    ('tests', 'RESERVED'),
    ('undefined', 'RESERVED'),
    ('user', 'RESERVED'),
    ('users', 'RESERVED'),
    ('www', 'RESERVED'),
    ('you', 'RESERVED'),
    ('asshole', 'PROFANITY'),
    ('bastard', 'PROFANITY'),
    ('behenchod', 'PROFANITY'),
    ('bhosdi', 'PROFANITY'),
    ('bitch', 'PROFANITY'),
    ('chutiya', 'PROFANITY'),
    ('cunt', 'PROFANITY'),
    ('dick', 'PROFANITY'),
    ('fuck', 'PROFANITY'),
    ('gandu', 'PROFANITY'),
    ('harami', 'PROFANITY'),
    ('lund', 'PROFANITY'),
    ('madarchod', 'PROFANITY'),
    ('porn', 'PROFANITY'),
    ('pussy', 'PROFANITY'),
    ('randi', 'PROFANITY'),
    ('shit', 'PROFANITY'),
    ('slut', 'PROFANITY'),
    ('whore', 'PROFANITY')
ON CONFLICT (term) DO NOTHING;

-- client writes: column grants only (the RPCs own username / profile_public / adult_confirmed_at)
REVOKE INSERT, UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT INSERT (id, full_name, phone, avatar_url, language_preference) ON public.user_profiles TO authenticated;
GRANT UPDATE (full_name, phone, avatar_url, language_preference, updated_at) ON public.user_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_set_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_name   text := lower(btrim(coalesce(p_username, '')));
    v_folded text;
    v_prof   record;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF v_name !~ '^[a-z][a-z0-9_]{2,19}$' OR position('__' in v_name) > 0 OR right(v_name, 1) = '_' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_FORMAT');
    END IF;
    v_folded := regexp_replace(translate(v_name, '013457@$', 'oieastas'), '[^a-z]', '', 'g');
    IF EXISTS (SELECT 1 FROM public.username_blocklist b WHERE (b.kind = 'RESERVED' AND b.term = v_name)
                                                           OR (b.kind = 'PROFANITY' AND position(b.term in v_folded) > 0)) THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ALLOWED');
    END IF;

    SELECT p.username, p.username_changed_at INTO v_prof FROM public.user_profiles p WHERE p.id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'FAILED');
    END IF;
    IF v_prof.username = v_name THEN
        RETURN jsonb_build_object('success', true, 'code', 'UNCHANGED');
    END IF;
    IF v_prof.username IS NOT NULL AND v_prof.username_changed_at IS NOT NULL
       AND v_prof.username_changed_at > pg_catalog.now() - interval '30 days' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_SOON', 'next_change_at', v_prof.username_changed_at + interval '30 days');
    END IF;
    BEGIN
        UPDATE public.user_profiles SET username = v_name, username_changed_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE id = v_uid;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'code', 'TAKEN');
    END;
    RETURN jsonb_build_object('success', true, 'code', 'SET', 'username', v_name);
END
$$;
REVOKE ALL ON FUNCTION public.fn_set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_set_profile_visibility(p_public boolean, p_confirm_adult boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid  uuid := auth.uid();
    v_prof record;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_public IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT p.username, p.adult_confirmed_at INTO v_prof FROM public.user_profiles p WHERE p.id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'FAILED');
    END IF;
    IF NOT p_public THEN
        UPDATE public.user_profiles
           SET profile_public = false,
               adult_confirmed_at = CASE WHEN p_confirm_adult IS TRUE THEN coalesce(adult_confirmed_at, pg_catalog.now()) ELSE adult_confirmed_at END,
               updated_at = pg_catalog.now()
         WHERE id = v_uid;
        RETURN jsonb_build_object('success', true, 'code', 'PRIVATE');
    END IF;
    IF v_prof.username IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NEED_USERNAME');
    END IF;
    IF v_prof.adult_confirmed_at IS NULL AND p_confirm_adult IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'code', 'NEED_ADULT_CONFIRMATION');
    END IF;
    UPDATE public.user_profiles
       SET profile_public = true, adult_confirmed_at = coalesce(adult_confirmed_at, pg_catalog.now()), updated_at = pg_catalog.now()
     WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'code', 'PUBLIC');
END
$$;
REVOKE ALL ON FUNCTION public.fn_set_profile_visibility(boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_profile_visibility(boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_set_leaderboard_opt_in(p_opt_in boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_adult timestamptz;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF p_opt_in IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT');
    END IF;
    SELECT p.adult_confirmed_at INTO v_adult FROM public.user_profiles p WHERE p.id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'FAILED');
    END IF;
    IF p_opt_in AND v_adult IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NEED_ADULT_CONFIRMATION'); -- #80: under-18 cannot opt in
    END IF;
    UPDATE public.user_profiles SET leaderboard_opt_in = p_opt_in, updated_at = pg_catalog.now() WHERE id = v_uid;
    RETURN jsonb_build_object('success', true, 'code', CASE WHEN p_opt_in THEN 'OPTED_IN' ELSE 'OPTED_OUT' END);
END
$$;
REVOKE ALL ON FUNCTION public.fn_set_leaderboard_opt_in(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_leaderboard_opt_in(boolean) TO authenticated;
