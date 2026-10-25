/**
 * LEADERBOARD-GATE-1 (R12; pure, unit-tested in scripts/test_leaderboard_gate1.cjs).
 * - Ranks exist only when ≥ RANK_MIN_COHORT REAL students (test accounts excluded) have a scored first attempt of the
 *   mock; otherwise the page shows a plain "Not enough students yet" state — no ranks, no counts, no podium.
 * - Ranks are computed over the whole real cohort (each student's FIRST attempt, as on the result page), but a public
 *   row is listed ONLY for students who opted in. The viewer always sees their own rank (private), opted in or not.
 * Opt-in (architect ruling, 2026-10-25): ONLY user_profiles.leaderboard_opt_in, written ONLY by fn_set_leaderboard_opt_in
 * (migration 096; under-18 cannot opt in). auth user_metadata is user-writable and is never read for this (#60). Until
 * 096 is applied nobody is opted in: ranked boards list no rows, the viewer still sees their own rank.
 */
import { RANK_MIN_COHORT } from "./display-rules";

export type LeaderboardRow = { userId: string; score: number; accuracy: number; timeSeconds: number; createdAt: string; isTestAccount: boolean; optedIn: boolean };
export type LeaderboardEntry = { rank: number; userId: string; score: number; accuracy: number; timeSeconds: number };
export type LeaderboardView =
  | { state: "not_enough" }
  | { state: "ranked"; n: number; entries: LeaderboardEntry[]; viewer: (LeaderboardEntry & { optedIn: boolean }) | null };

export const LEADERBOARD_MAX_ROWS = 100;

export function leaderboardView(rows: LeaderboardRow[], viewerId: string | null): LeaderboardView {
  const first = new Map<string, LeaderboardRow>();
  for (const r of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (r.isTestAccount || !Number.isFinite(Number(r.score))) continue;
    if (!first.has(r.userId)) first.set(r.userId, r);
  }
  const cohort = [...first.values()];
  if (cohort.length < RANK_MIN_COHORT) return { state: "not_enough" };
  const ranked = cohort
    .map((r) => ({ r, rank: 1 + cohort.filter((o) => Number(o.score) > Number(r.score)).length }))
    .sort((a, b) => a.rank - b.rank || b.r.accuracy - a.r.accuracy || a.r.timeSeconds - b.r.timeSeconds || a.r.userId.localeCompare(b.r.userId));
  const entry = (x: (typeof ranked)[number]): LeaderboardEntry => ({ rank: x.rank, userId: x.r.userId, score: Number(x.r.score), accuracy: Number(x.r.accuracy), timeSeconds: Number(x.r.timeSeconds) });
  const me = viewerId ? ranked.find((x) => x.r.userId === viewerId) : undefined;
  return {
    state: "ranked",
    n: cohort.length,
    entries: ranked.filter((x) => x.r.optedIn).slice(0, LEADERBOARD_MAX_ROWS).map(entry),
    viewer: me ? { ...entry(me), optedIn: me.r.optedIn } : null,
  };
}

