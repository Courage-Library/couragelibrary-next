/**
 * RESULT-SEC-1 — which attempt a result page may show: ONLY the signed-in viewer's own.
 * Takes the SESSION client (RLS: own attempts / results only) and adds an explicit owner check on every lookup, so a
 * wrong id — another user's attempt, result or mock — resolves to nothing. Never called with a service-role client
 * (gated: scripts/test_result_sec1.cjs).
 * Lookup order (unchanged from before): attempt id → result id → mock id (the viewer's latest submitted attempt).
 */
export const OWN_ATTEMPT_COLS = "id, mock_test_id, user_id, started_at, submitted_at";

export type OwnAttempt = { id: string; mock_test_id: string; user_id: string; started_at: string | null; submitted_at: string | null };

type Row = Record<string, any> | null;
type Q = {
  select(cols: string): Q;
  eq(col: string, v: unknown): Q;
  in(col: string, v: unknown[]): Q;
  order(col: string, o: { ascending: boolean }): Q;
  limit(n: number): Q;
  maybeSingle(): PromiseLike<{ data: Row }>;
};
export type SessionLike = { from(table: string): any };

export async function resolveOwnAttempt(sb: SessionLike, idOrResultOrMock: string, viewerId: string): Promise<OwnAttempt | null> {
  if (!viewerId || !idOrResultOrMock) return null;
  const attempts = () => (sb.from("test_attempts") as Q).select(OWN_ATTEMPT_COLS);
  let { data } = await attempts().eq("id", idOrResultOrMock).eq("user_id", viewerId).maybeSingle();
  if (!data) {
    const { data: res } = await (sb.from("test_results") as Q).select("attempt_id").eq("id", idOrResultOrMock).eq("user_id", viewerId).maybeSingle();
    if (res?.attempt_id) ({ data } = await attempts().eq("id", res.attempt_id).eq("user_id", viewerId).maybeSingle());
  }
  if (!data) {
    ({ data } = await attempts()
      .eq("mock_test_id", idOrResultOrMock)
      .eq("user_id", viewerId)
      .in("status", ["submitted", "completed", "evaluated"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle());
  }
  // explicit second check: RLS already limits the rows; a row of another user is never returned
  if (!data || data.user_id !== viewerId) return null;
  return data as OwnAttempt;
}
