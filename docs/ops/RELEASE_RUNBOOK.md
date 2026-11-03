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
4. Check that no CI dispatch is queued, because a push cancels a pending dispatch.

**Why:** the COURSE-UX-1 push CI (41625360184) failed `LIVE-LOCK-SWEEP`, an offline gate. The earlier local run had
skipped it because its name contains "LIVE".

## Ship

- `git checkout main && git merge --ff-only <branch> && git push origin main`. Then wait for the push run to be green.
- Run **one** `workflow_dispatch` with `live: true` on `main`, after the push run. Retry it once only for a network
  drop.
- **Time-cap flake (owner rule, 2026-11-03):** a gate that hits its time cap (exit 124) with **0 FAIL lines** counts as
  a flake, and gets one automatic retry without asking. A FAIL line, or a second timeout of the same gate, means stop and
  report.
  **Why:** UX2A-LIVE passed in dispatch 41637626173. On the same commit in dispatch 41646895811 it then ran past its
  240 s cap with 17 passed lines and 0 FAIL lines.
- A real failure means stop. Report it and do not patch main.

## After deploy

Check production **anonymously only**: never sign in to prod. The owner checks the signed-in and staff views.
