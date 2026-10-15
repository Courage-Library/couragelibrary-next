-- =============================================================================
-- COURAGE LIBRARY — SEC-HOTFIX-5: per-user leaderboard / battle stats are not public
-- Migration: 20261016000077_sec_hotfix5_per_user_stats_private.sql
--
-- Architect ruling (2026-10-16): leaderboard_weekly_snapshots and user_battle_stats hold per-user data
-- (user_id, rank, accuracy, study minutes, battle results) and are NOT public.
--   * Both had a PERMISSIVE "FOR SELECT TO public USING (true)" policy (found by the RLS suite P-6 scan).
--   * leaderboard_weekly_snapshots: anon AND authenticated held SELECT, so any visitor could read every row.
--   * user_battle_stats: no role holds SELECT today, so the policy was inert; it is replaced anyway.
-- This migration:
--   * replaces each blanket read policy with an own-rows-only read policy TO authenticated (user_id = auth.uid());
--   * revokes anon SELECT on leaderboard_weekly_snapshots.
-- Unchanged: authenticated SELECT grant on leaderboard_weekly_snapshots (own rows only now), the staff policy
-- p_ubs_manage_staff, RLS enablement, all writes (service role / SECURITY DEFINER battle functions).
-- Any future PUBLIC leaderboard must be a SECURITY DEFINER RPC returning only display name + rank
-- (no user_id, no study minutes).
-- Both tables have 0 rows on 2026-10-16.
-- Rollback: docs/database/rollback/077_rollback.sql
-- =============================================================================

-- leaderboard_weekly_snapshots
DROP POLICY IF EXISTS "Public read leaderboard snapshots" ON public.leaderboard_weekly_snapshots;
CREATE POLICY "leaderboard_weekly_snapshots: own rows read" ON public.leaderboard_weekly_snapshots
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE SELECT ON public.leaderboard_weekly_snapshots FROM anon;

-- user_battle_stats
DROP POLICY IF EXISTS "p_ubs_select_public" ON public.user_battle_stats;
CREATE POLICY "user_battle_stats: own rows read" ON public.user_battle_stats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
