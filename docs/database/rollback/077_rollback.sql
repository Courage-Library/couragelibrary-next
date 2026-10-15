-- =============================================================================
-- COURAGE LIBRARY — ROLLBACK of 077 (sec_hotfix5_per_user_stats_private)
-- NOT a migration. Apply only with owner approval in ONE transaction, then mark the 077 ledger row
-- ROLLED_BACK. Restores the original blanket read policies and the anon grant (re-opens the exposure).
-- =============================================================================
BEGIN;
DROP POLICY IF EXISTS "leaderboard_weekly_snapshots: own rows read" ON public.leaderboard_weekly_snapshots;
CREATE POLICY "Public read leaderboard snapshots" ON public.leaderboard_weekly_snapshots FOR SELECT TO public USING (true);
GRANT SELECT ON public.leaderboard_weekly_snapshots TO anon;

DROP POLICY IF EXISTS "user_battle_stats: own rows read" ON public.user_battle_stats;
CREATE POLICY "p_ubs_select_public" ON public.user_battle_stats FOR SELECT TO public USING (true);
COMMIT;
