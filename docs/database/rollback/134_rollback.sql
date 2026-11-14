-- Rollback for 20261102000134_username_1.sql (USERNAME-1). Only on an owner / architect instruction.
-- Restores the 096 username rules and fn_set_username; removes the resolver, the auto-username trigger and the history.
-- The automatic usernames and the profile rows created for accounts without one are KEPT (they hold no personal data;
-- clearing them would erase names users may already have chosen). Usernames with a "." would violate the 096 format:
-- they are converted to "_" first.
-- ROLLBACK-CHAIN: run first: none
DROP FUNCTION IF EXISTS public.fn_public_identities(uuid[]);
DROP TRIGGER IF EXISTS trg_user_profiles_auto_username ON public.user_profiles;
DROP FUNCTION IF EXISTS public.fn_user_profiles_auto_username();
DROP TABLE IF EXISTS public.username_history;
DELETE FROM public.username_blocklist WHERE kind = 'RESERVED' AND term IN ('aspirant', 'ibps', 'police', 'rrb', 'ssc', 'upsc');
UPDATE public.user_profiles SET username = replace(username, '.', '_') WHERE username LIKE '%.%';
ALTER TABLE public.user_profiles DROP CONSTRAINT chk_user_profiles_username_format;
ALTER TABLE public.user_profiles ADD CONSTRAINT chk_user_profiles_username_format CHECK (
    username IS NULL OR (username ~ '^[a-z][a-z0-9_]{2,19}$' AND position('__' in username) = 0 AND right(username, 1) <> '_'));
DROP INDEX IF EXISTS public.uq_user_profiles_username_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_profiles_username ON public.user_profiles (username) WHERE username IS NOT NULL;
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
