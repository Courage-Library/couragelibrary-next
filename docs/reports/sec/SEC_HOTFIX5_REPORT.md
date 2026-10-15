# SEC-HOTFIX-5: per-user leaderboard and battle stats are not public

> **Architect ruling (2026-10-16):** `leaderboard_weekly_snapshots` and `user_battle_stats` hold per-user data and are **not public**.
> - Any future public leaderboard must be a `SECURITY DEFINER` RPC that returns only display name + rank (no `user_id`, no study minutes).
>
> **Migration:** `supabase/migrations/20261016000077_sec_hotfix5_per_user_stats_private.sql`
> **Rollback:** `docs/database/rollback/077_rollback.sql`
> **Test:** `scripts/test_sec_hotfix4_rls.cjs` P-6 + P-7 (permanent gate)

## Found by

The permanent blanket-policy scan (RLS suite P-6, added for ruling 3 of SEC-HOTFIX-4) reported both tables as PENDING RULING.

| Table | Before 077 | Exposure | Rows |
|---|---|---|---|
| `leaderboard_weekly_snapshots` | `"Public read leaderboard snapshots"` FOR SELECT TO public USING (true); **anon and authenticated held SELECT** | Any visitor, signed in or not, could read every row: `user_id`, rank, accuracy, study minutes, tasks | 0 |
| `user_battle_stats` | `"p_ubs_select_public"` FOR SELECT TO public USING (true) | Inert: no role holds SELECT | 0 |

**No data was exposed** (both tables were empty), so this is not an incident.

## Change

On each table:
- the blanket read policy is dropped;
- a **`"<table>: own rows read"` FOR SELECT TO authenticated USING (`user_id = auth.uid()`)** policy replaces it.

`REVOKE SELECT ON leaderboard_weekly_snapshots FROM anon`.

**Unchanged:**
- `authenticated` SELECT on the leaderboard (now own rows only);
- the staff policy `p_ubs_manage_staff`;
- RLS enablement;
- writes (service role and the `SECURITY DEFINER` battle functions).

**App impact: none.** The only runtime reader is `services/battle.service.ts`, and it reads the user's own row (`.eq("user_id", user.id)`).

> **Observation, not changed:** `authenticated` still has no SELECT grant on `user_battle_stats`, so that own-row read is denied by grants (as before 077). Granting SELECT is a battles-feature decision.

## Migration discipline

| Step | Result |
|---|---|
| Baseline snapshot | `sec_h5_pre` |
| Backup | `pre-077-sec-hotfix5-2026-10-15T20-48-08` (E:\CourageLibrary-Backups; 133 public tables + auth data) |
| Dry-run | OK (rolled back) |
| Apply | OK; ledger row written, sha256 `88229ca6c58c…` |
| `db:types:check` | OK (types unchanged; policies and grants only) |
| Snapshot diff (pre → post) | Only the ledger row for 077 |

## Tests

| Check | Before 077 | After 077 |
|---|---|---|
| P-6: no blanket policy outside the public allow-list (242 policies) | FAIL (both tables) | PASS; **PENDING_RULING is now empty** |
| **P-7 (new):** static checks: no blanket read, an own-rows read policy, anon holds no leaderboard SELECT | FAIL | PASS |
| **P-7 (new):** behaviour, inside a rolled-back transaction: 1 row each for 2 real users; temporary SELECT grant on `user_battle_stats` so the policy is what's tested | — | anon denied (42501); a student sees exactly their own row in both tables; a user with no rows sees 0 |
| RLS suite total | 5/7 | **7/7** |

**Other gates:**

| Gate | Result |
|---|---|
| test_types1 | 8/8 |
| test_types1_close | 3/3 |
| test_no_runtime_db | 4/4 |
| SEC-1B / 1C / 1D | 26/26 · 22/22 · 14/14 |
| QA identity guard | 8/8 |
| HOTFIX-2 | 5/5 |
| QF-1 DB | 15/15 |
| Signed-in smokes `student-pages` and `admin-pages` (local production build) | all passed |
