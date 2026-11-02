-- =====================================================================================================================
-- 134 USERNAME-1 (owner ruling 2026-11-02: PUBLIC IDENTITY = USERNAME). Other people see only a username — never a real
-- name, e-mail or phone; staff / admin appear publicly as "Courage Library Team". Builds on 096 (F8 usernames).
--   1. format: 3–20 characters a–z 0–9 _ . ; starts with a letter; no "__" "..", "._", "_."; does not end with _ or .
--      unique case-insensitively (unique index on lower(username); values are stored lower-case anyway)
--   2. reserved terms added (ssc, rrb, ibps, upsc, police, aspirant …); a reserved term also matches with . / _ removed
--      or swapped ("courage.library"); phone-like (8+ digits) and e-mail-like values are refused
--   3. public.username_history (RLS on, no client grant): every username a user held, AUTO / USER, with released_at —
--      the 90-day hold (a released username stays blocked for OTHER users for 90 days) and the change audit
--   4. auto usernames: every profile gets "aspirant_" + 6 random digits at once (BEFORE INSERT trigger, collision- and
--      hold-safe; username_changed_at stays NULL so the first own choice is free); existing profiles are backfilled and
--      the auth users without a profile row get one
--   5. fn_set_username (same signature, still SECURITY DEFINER, search_path ''): the new rules + 30-day rule + 90-day
--      hold + history; fixed codes only
--   6. fn_public_identities(uuid[]) (owner condition): ≤ 100 ids per call; returns id + label + is_team only — the
--      username, or "Courage Library Team" for staff / admin (app_metadata.role) — never a real name or e-mail;
--      SECURITY DEFINER, search_path ''; EXECUTE for service_role ONLY (the server resolves labels; ids never reach a
--      browser)
-- SECURITY DEFINER count +2 (fn_public_identities B-service, the auto-username trigger B-trigger): scripts/secdef/allowlist.json.
-- Rollback: docs/database/rollback/134_rollback.sql. No BEGIN / COMMIT (the runner owns the transaction).
-- =====================================================================================================================
DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.schema_migration_ledger WHERE filename = '20261025000096_f8_profile_username.sql' AND status = 'APPLIED') THEN
        RAISE EXCEPTION 'USERNAME_1_PREFLIGHT: 096 is not applied';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username IS NOT NULL AND username <> lower(username)) THEN
        RAISE EXCEPTION 'USERNAME_1_PREFLIGHT: a stored username is not lower-case';
    END IF;
END
$pre$;

-- 1. format + case-insensitive uniqueness
ALTER TABLE public.user_profiles DROP CONSTRAINT chk_user_profiles_username_format;
ALTER TABLE public.user_profiles ADD CONSTRAINT chk_user_profiles_username_format CHECK (
    username IS NULL OR (username ~ '^[a-z][a-z0-9_.]{2,19}$' AND username !~ '[_.][_.]' AND username !~ '[_.]$'));
DROP INDEX public.uq_user_profiles_username;
CREATE UNIQUE INDEX uq_user_profiles_username_lower ON public.user_profiles (lower(username)) WHERE username IS NOT NULL;

-- 2. reserved terms (lib/profile/username.ts keeps the identical list; the gate compares)
INSERT INTO public.username_blocklist (term, kind) VALUES
    ('aspirant', 'RESERVED'),
    ('ibps', 'RESERVED'),
    ('police', 'RESERVED'),
    ('rrb', 'RESERVED'),
    ('ssc', 'RESERVED'),
    ('upsc', 'RESERVED')
ON CONFLICT (term) DO NOTHING;

-- 3. history (90-day hold + audit of every change)
CREATE TABLE public.username_history (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL,
    username text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('AUTO', 'USER')),
    set_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz
);
CREATE INDEX idx_username_history_name ON public.username_history (lower(username), released_at);
CREATE INDEX idx_username_history_user ON public.username_history (user_id) WHERE released_at IS NULL;
ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.username_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.username_history TO service_role;

-- 4. auto usernames: new profiles through the trigger; existing profiles through the backfill below (same rules)
CREATE OR REPLACE FUNCTION public.fn_user_profiles_auto_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_try int := 0;
    v_name text;
BEGIN
    IF NEW.username IS NOT NULL THEN
        RETURN NEW;
    END IF;
    LOOP
        v_try := v_try + 1;
        -- 6 digits (7 after 20 collisions): never phone-like (8+ digits)
        v_name := 'aspirant_' || lpad((floor(random() * CASE WHEN v_try > 20 THEN 10000000 ELSE 1000000 END))::int::text, CASE WHEN v_try > 20 THEN 7 ELSE 6 END, '0');
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE lower(p.username) = v_name)
              AND NOT EXISTS (SELECT 1 FROM public.username_history h WHERE lower(h.username) = v_name
                                 AND (h.released_at IS NULL OR h.released_at > pg_catalog.now() - interval '90 days'));
        IF v_try > 60 THEN
            RAISE EXCEPTION 'USERNAME: no free automatic username' USING ERRCODE = 'P0001';
        END IF;
    END LOOP;
    NEW.username := v_name;
    NEW.username_changed_at := NULL; -- an automatic name never counts against the 30-day rule
    INSERT INTO public.username_history (user_id, username, kind) VALUES (NEW.id, v_name, 'AUTO');
    RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.fn_user_profiles_auto_username() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_user_profiles_auto_username BEFORE INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_user_profiles_auto_username();

-- backfill: existing profiles (row by row, collision-safe) + a profile for every auth user that has none
DO $backfill$
DECLARE
    r record;
    v_try int;
    v_name text;
BEGIN
    FOR r IN SELECT id FROM public.user_profiles WHERE username IS NULL ORDER BY created_at, id LOOP
        v_try := 0;
        LOOP
            v_try := v_try + 1;
            v_name := 'aspirant_' || lpad((floor(random() * 1000000))::int::text, 6, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE lower(p.username) = v_name)
                  AND NOT EXISTS (SELECT 1 FROM public.username_history h WHERE lower(h.username) = v_name);
            IF v_try > 60 THEN RAISE EXCEPTION 'USERNAME_1_BACKFILL: no free name'; END IF;
        END LOOP;
        UPDATE public.user_profiles SET username = v_name, username_changed_at = NULL WHERE id = r.id;
        INSERT INTO public.username_history (user_id, username, kind) VALUES (r.id, v_name, 'AUTO');
    END LOOP;
END
$backfill$;
INSERT INTO public.user_profiles (id)
SELECT u.id FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- 5. setting a username
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
    v_plain  text;
    v_prof   record;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_SIGNED_IN');
    END IF;
    IF v_name !~ '^[a-z][a-z0-9_.]{2,19}$' OR v_name ~ '[_.][_.]' OR v_name ~ '[_.]$' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_FORMAT');
    END IF;
    v_folded := regexp_replace(translate(v_name, '013457@$', 'oieastas'), '[^a-z]', '', 'g');
    v_plain := regexp_replace(v_name, '[_.]', '', 'g');
    IF EXISTS (SELECT 1 FROM public.username_blocklist b
                WHERE (b.kind = 'RESERVED' AND (b.term = v_name OR b.term = replace(v_name, '.', '_') OR replace(b.term, '_', '') = v_plain))
                   OR (b.kind = 'PROFANITY' AND position(b.term in v_folded) > 0))
       OR length(regexp_replace(v_name, '[^0-9]', '', 'g')) >= 8                                         -- phone-like
       OR v_name ~ '(gmail|yahoo|outlook|hotmail|rediffmail|icloud|protonmail)'                          -- e-mail-like
       OR v_name ~ '[.](com|in|net|org|co|edu|gov|io)$' THEN
        RETURN jsonb_build_object('success', false, 'code', 'NOT_ALLOWED');
    END IF;

    SELECT p.username, p.username_changed_at INTO v_prof FROM public.user_profiles p WHERE p.id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'FAILED');
    END IF;
    IF v_prof.username = v_name THEN
        RETURN jsonb_build_object('success', true, 'code', 'UNCHANGED');
    END IF;
    IF v_prof.username_changed_at IS NOT NULL AND v_prof.username_changed_at > pg_catalog.now() - interval '30 days' THEN
        RETURN jsonb_build_object('success', false, 'code', 'TOO_SOON', 'next_change_at', v_prof.username_changed_at + interval '30 days');
    END IF;
    -- the 90-day hold: a name another user released less than 90 days ago is not available (same answer as taken)
    IF EXISTS (SELECT 1 FROM public.username_history h WHERE lower(h.username) = v_name AND h.user_id <> v_uid
                  AND (h.released_at IS NULL OR h.released_at > pg_catalog.now() - interval '90 days')) THEN
        RETURN jsonb_build_object('success', false, 'code', 'TAKEN');
    END IF;
    BEGIN
        UPDATE public.user_profiles SET username = v_name, username_changed_at = pg_catalog.now(), updated_at = pg_catalog.now() WHERE id = v_uid;
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'code', 'TAKEN');
    END;
    UPDATE public.username_history SET released_at = pg_catalog.now() WHERE user_id = v_uid AND released_at IS NULL;
    INSERT INTO public.username_history (user_id, username, kind) VALUES (v_uid, v_name, 'USER');
    RETURN jsonb_build_object('success', true, 'code', 'SET', 'username', v_name);
END
$$;
REVOKE ALL ON FUNCTION public.fn_set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_username(text) TO authenticated;

-- 6. the server-only public label resolver
CREATE OR REPLACE FUNCTION public.fn_public_identities(p_ids uuid[])
RETURNS TABLE (id uuid, label text, is_team boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
        RETURN;
    END IF;
    IF cardinality(p_ids) > 100 THEN
        RAISE EXCEPTION 'PUBLIC_IDENTITIES: at most 100 ids per call' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT p.id,
           CASE WHEN t.team THEN 'Courage Library Team' ELSE coalesce(p.username, 'Member') END,
           t.team
      FROM public.user_profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      CROSS JOIN LATERAL (SELECT coalesce(u.raw_app_meta_data ->> 'role', '') IN ('admin', 'staff') AS team) t
     WHERE p.id = ANY (p_ids);
END
$$;
REVOKE ALL ON FUNCTION public.fn_public_identities(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_public_identities(uuid[]) TO service_role;

-- proof
DO $proof$
BEGIN
    IF EXISTS (SELECT 1 FROM public.user_profiles WHERE username IS NULL) THEN
        RAISE EXCEPTION 'USERNAME_1_PROOF: a profile has no username';
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id)) THEN
        RAISE EXCEPTION 'USERNAME_1_PROOF: an account has no profile';
    END IF;
    IF has_function_privilege('anon', 'public.fn_public_identities(uuid[])', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.fn_public_identities(uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'USERNAME_1_PROOF: the label resolver is client-executable';
    END IF;
    IF has_table_privilege('authenticated', 'public.username_history', 'SELECT') OR has_table_privilege('anon', 'public.username_history', 'SELECT') THEN
        RAISE EXCEPTION 'USERNAME_1_PROOF: username history is client-readable';
    END IF;
END
$proof$;
