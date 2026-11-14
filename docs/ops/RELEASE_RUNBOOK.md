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
4. Check that no CI dispatch is queued, because a push cancels a pending dispatch.

**Why:** the COURSE-UX-1 push CI (41625360184) failed `LIVE-LOCK-SWEEP`, an offline gate. The earlier local run had
skipped it because its name contains "LIVE".

## Ship

- `git checkout main && git merge --ff-only <branch> && git push origin main`. Then wait for the push run to be green.
- **When a live dispatch is needed (SPEED-RULES-1, owner rule 2026-11-14):**
  - The release touches the database or migrations, auth, payments, security or RLS → run **one** `workflow_dispatch`
    with `live: true` on `main`, after the push run. Retry it once only for a network drop.
  - A UI-, text- or CSS-only release → no dispatch. The offline list, a green push run and a green prod-smoke (part of
    the push run) are enough.
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

## After deploy

Check production **anonymously only**: never sign in to prod. The owner checks the signed-in and staff views.
