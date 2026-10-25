-- Rollback for 20261025000096_f8_profile_username.sql (F8 usernames + public profile).
-- Run as ONE transaction by the operator (this file is not a migration; it may carry BEGIN / COMMIT).
-- Before running: set PROFILES_ENABLED off. WARNING (data): drops every chosen username, the public-profile and leaderboard choices
-- and the 18+ confirmations, and the blocklist. Restores the pre-096 table-level INSERT / UPDATE grants for authenticated
-- exactly (note: that re-opens client writes to every column of the own row, e.g. is_active).
BEGIN;

DROP FUNCTION IF EXISTS public.fn_set_username(text);
DROP FUNCTION IF EXISTS public.fn_set_profile_visibility(boolean, boolean);
DROP FUNCTION IF EXISTS public.fn_set_leaderboard_opt_in(boolean);
DROP TABLE IF EXISTS public.username_blocklist;
DROP INDEX IF EXISTS public.uq_user_profiles_username;
ALTER TABLE public.user_profiles
    DROP CONSTRAINT IF EXISTS chk_user_profiles_username_format,
    DROP CONSTRAINT IF EXISTS chk_user_profiles_public_needs_adult_username,
    DROP CONSTRAINT IF EXISTS chk_user_profiles_leaderboard_needs_adult,
    DROP COLUMN IF EXISTS username,
    DROP COLUMN IF EXISTS username_changed_at,
    DROP COLUMN IF EXISTS profile_public,
    DROP COLUMN IF EXISTS adult_confirmed_at,
    DROP COLUMN IF EXISTS leaderboard_opt_in;

REVOKE INSERT, UPDATE ON public.user_profiles FROM authenticated;
GRANT INSERT, UPDATE ON public.user_profiles TO authenticated;

COMMIT;
