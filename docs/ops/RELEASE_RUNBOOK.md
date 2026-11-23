# Release runbook (every push to main)

The per-release checklists (`RELEASE_HOME_1.md`, …) add their own steps; these rules apply to every push.

## Before every push — OFFLINE-LOCAL-1 (owner process fix, 2026-11-03)

1. Stage every new file first (several gates scan tracked files only).
2. Run exactly the CI offline list, parsed from the workflow:

   ```bash
   node scripts/ci/run-offline-local.cjs
   ```

   It runs every gate of the "Offline gates" step of `.github/workflows/ci-gates.yml` (TSC and LINT included).
   It does not skip anything by name and keeps no hand-written list. A gate line it cannot parse fails the run.
   Push only on `OFFLINE-LOCAL: N/N passed`.
3. **Replaced functions (owner rule, 2026-11-03):** when a migration replaces or changes a database function, run
   locally, before pushing, every live gate that calls that function. They run with real roles and roll back. To find
   them, search for the function name:

   ```bash
   grep -l "fn_name" scripts/live/*.cjs scripts/*.cjs
   ```

   Run each gate it lists. If the migration is not applied yet, use `--pre`.
   **Why:** COURSE-UX-1 migration 136 replaced `fn_lesson_progress_save`. `CA5-COURSES-LIVE` still expected the old
   rule, and only the CI dispatch (41628887562) caught it.
   **Earlier migrations too (owner rule, 2026-11-14):** after applying migration N, also run every live DB gate that
   touches objects of EARLIER migrations that N references or depends on, not just N's own gate. A gate that rolls back
   its own migration is always included (`docs/database/MIGRATION_RUNBOOK.md` §4, EARLIER-GATES and ROLLBACK-CHAIN).
   **Why:** 139 added a CHECK on 138's `fn_outline_lines_valid`; SYLLABUS-MAP-B1-LIVE's rollback check then failed in
   CI dispatch 43579487271.
4. **Page smokes (owner rule, 2026-11-14):** whenever a page's UI text or structure changes, run the admin and student
   page smokes locally against a production build before pushing (`npm run build`, then
   `node scripts/live/with-server.cjs --port=3100 -- "node scripts/smoke/signed-in-smoke.cjs admin-pages http://localhost:3100" "node scripts/smoke/signed-in-smoke.cjs student-pages http://localhost:3100"`).
   **Why:** PAY-1 B1 renamed the `/admin/payments` heading; SMOKE-ADMIN-PAGES still expected the old one, and only CI
   dispatch 43621861577 caught it.
5. Check that no CI dispatch is queued, because a push cancels a pending dispatch.

**Why:** the COURSE-UX-1 push CI (41625360184) failed `LIVE-LOCK-SWEEP`, an offline gate. The earlier local run had
skipped it because its name contains "LIVE".

## Ship

- `git checkout main && git merge --ff-only <branch> && git push origin main`. Then wait for the push run to be green: Vercel promotes only then (DEPLOY-GATE-1, below).
- **When a live dispatch is needed (SPEED-RULES-1, owner rule 2026-11-14):**
  - The release touches the database or migrations, auth, payments, security or RLS → run **one** `workflow_dispatch`
    with `live: true` on `main`, after the push run. Retry it once only for a network drop.
  - A UI-, text- or CSS-only release → no dispatch. The offline list, a green push run (its deploy-smoke included) and
    a green post-promotion smoke are enough.
  - If in doubt (a change reaches a server action, an API route, a database read or a guard), treat it as touching
    the database or security and run the dispatch.
- **Flaky gates (SPEED-RULES-1, owner rule 2026-11-14):**
  - A **non-security** gate that fails intermittently, and passes locally or on a rerun, does **not** block the release.
    Record it in `docs/ops/BACKLOG.md` with the gate, the failing check and the run ids, and fix it in a separate phase.
  - **Security, data-integrity, payment and auth gates always block**, flaky or not.
  - **Why:** FLAGS-LIVE failed FL-2 in scheduled run 43538726425 and FL-1 in dispatch 43585885477, and passed every
    local run. The owner ruled that it does not block the B2 release (backlog FLAGS-LIVE-FLAKE-1).
- **Time-cap flake (owner rule, 2026-11-03):** a gate that hits its time cap (exit 124) with **0 FAIL lines** counts as
  a flake, and gets one automatic retry without asking. A FAIL line, or a second timeout of the same gate, means stop and
  report.
  **Why:** UX2A-LIVE passed in dispatch 41637626173. On the same commit in dispatch 41646895811 it then ran past its
  240 s cap with 17 passed lines and 0 FAIL lines.
- A real failure means stop. Report it and do not patch main.
- **Parallel work (SPEED-RULES-1):** each chat works in its own `git worktree` folder
  (`git worktree add ../cl-<topic> -b <branch>`). Never two chats in one folder: a branch switch or an edit in one
  changes the other's files. Only one of them ships at a time; the other rebases onto the new main and re-runs the
  offline list before its own push.

## The production gate — DEPLOY-GATE-1 (owner, 2026-11-23)

Production changes only after CI is green for that exact commit. Vercel Deployment Checks hold the promotion.

1. **Push to main.** Vercel builds a production deployment for the commit. It is NOT on couragelibrary.in, www or
   couragelibrary-next.vercel.app yet. Vercel waits for the ONE required Deployment Check: the commit status
   **`deploy-smoke`**.
2. **CI on the push (`ci-gates`, every push, no paths filter):** `scope`, `offline`, `server-checks`. `scope` decides
   docs-only vs code (`scripts/ci/change-scope.cjs`, fails safe to code); on a docs-only push `offline` and
   `server-checks` skip their heavy steps and still report green within about a minute.
3. **Pre-promotion smoke (`.github/workflows/deploy-smoke.yml`).** Vercel starts it with repository_dispatch
   `vercel.deployment.ready` (after the build, before promotion — https://vercel.com/docs/deployment-checks). Vercel's
   status action (pinned) reports `deploy-smoke` = pending, then failure / success, as a commit status on the
   deployment's own commit (`client_payload.git.sha`), not on main's HEAD. DEPLOY-GATE-1b: the payload environment is
   checked FIRST — a non-production payload (a branch preview) is ignored: no `deploy-smoke` status at all, the job ends
   green, the log says "non-production payload ignored" (host only). For a production payload, in order, any failure → red:
   - the payload: environment production, sha 40-hex, URL https on `couragelibrary-next-*.vercel.app`
     (`scripts/ci/pre-promotion.cjs --validate`); a bad payload never gets the bypass header;
   - the sha is on main (ancestor-or-equal);
   - `scope`, `offline` and `server-checks` of exactly that sha all succeeded (waits ≤ 25 min; GitHub Actions check runs
     only; newest attempt wins);
   - the anonymous read-only smoke of the deployment URL through the protection bypass
     (`VERCEL_AUTOMATION_BYPASS_SECRET`, GitHub secret only; missing or blank → fail, never a fallback), including
     `/api/health` = that sha. The URL is logged as host only.
   **Why not a job in the push run:** with Deployment Checks on, Vercel does not publish the deployment to GitHub until
   the checks finish, so a push-run job cannot find its URL (deadlock seen on ab3fd08, run 45138608215).
4. **`deploy-smoke` green → Vercel promotes** the deployment to the production domains. Red (or never reported) → no
   promotion; production keeps serving the previous deployment. To re-check after fixing a flaky smoke: re-run the
   failed deploy-smoke (pre-promotion) workflow run in Actions — never Force Promote for that.
5. **Post-promotion smoke** (`.github/workflows/post-promotion-smoke.yml`, on Vercel's
   `vercel.deployment.promoted` event, or by hand with a sha): the anonymous smoke of https://couragelibrary.in for the
   promoted commit. It is **not** a required check (it runs after the promotion). Red → Instant Rollback (below), then
   report.

### Instant Rollback

Vercel dashboard → project → **Deployments** → the last good production deployment → **⋯** → **Instant Rollback** →
confirm. The domains point back within seconds; no rebuild. Then fix forward on a branch.

### After a rollback: re-enable automatic promotion

After an Instant Rollback, Vercel **turns off automatic assignment of production domains**: new pushes build but are
not promoted, even with green checks. To turn it back on, once a fixed commit is on main and its checks are green:
Deployments → that deployment → **⋯** → **Promote** → confirm. Promoting re-enables automatic assignment for the
pushes after it. Check: the next push's deployment is promoted after its checks are green.

### Force Promote = emergency only

The Deployment Checks page offers **Force Promote** (promote despite red or pending checks). Use it only in an emergency
the owner declares (e.g. production down and CI itself broken), name it in the release report with the reason, and run
the post-promotion smoke by hand right after (`workflow_dispatch` with the sha). Never to get a red release out.

## After deploy

Check production **anonymously only**: never sign in to prod. The owner checks the signed-in and staff views.
The post-promotion smoke must be green for the commit (Actions → post-promotion-smoke).
