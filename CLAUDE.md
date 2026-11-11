# Courage Library — standing rules for every session

Next.js 15 + Supabase. These rules come from the owner and apply in every session, whatever the task asks. The details
live in the runbooks: `docs/ops/RELEASE_RUNBOOK.md` (push, CI, deploy) and `docs/database/MIGRATION_RUNBOOK.md`
(backup, migrations, live sessions, SAFE-NET). Open work is in `docs/ops/BACKLOG.md`.

## Git, CI and release

- **LOCAL-FIRST.** Work on a local branch and commit locally. No push, no CI dispatch and no production change until the
  owner says the word **"release"**. Approval for one release does not carry over to the next.
- **Before any push:** stage every new file, then run exactly the CI offline list:
  `node scripts/ci/run-offline-local.cjs`. Push only on `OFFLINE-LOCAL: N/N passed`.
- **Changed database function → its live gates run locally first.** Find them with
  `grep -l "fn_name" scripts/live/*.cjs scripts/*.cjs` and run each one (`--pre` if the migration is not applied yet).
- **Never push while a CI dispatch is queued:** a push cancels the pending dispatch.
- **Time-cap flake:** a gate that hits its time cap (exit 124) with **0 FAIL lines** gets one automatic retry. A FAIL
  line, or a second timeout of the same gate, means stop and report.
- **During a CI live run, leave the database alone:** no smoke, dry-run, backup or apply until the run has finished.
- **GIT-SAFETY:** never `git stash`, `git reset --hard`, `git checkout -- <path>` or `git clean` on a dirty tree. Commit
  work in progress to a local branch instead.

## Database

- **Before any DB write:**
  1. Take a backup: `node scripts/db/backup.cjs pre-<change> --resilient` (the owner is on a mobile hotspot, so always
     use the resilient mode). It must verify 100%.
  2. Run **one** TLS check against GitHub, Vercel and Supabase. It must show the public roots (no
     `SELF_SIGNED_CERT_IN_CHAIN`). If interception appears, stop before the write and report.
- Migrations follow backup → dry-run → apply via `scripts/db/apply-migration.cjs` → verify → ledger. Never edit an
  applied migration.
- **DEPLOY-BEFORE-ACTIVATE:** never activate a template version, feature flag or config value before production runs the
  code that reads it (code on main → production deploy verified → then activate).
- **Never connect to the legacy Supabase project** (`couragelibrary`). The tools target only the project in
  `NEXT_PUBLIC_SUPABASE_URL`.

## Secrets, output and personal data

- **Never print secrets:** no keys, tokens, passwords, connection strings, hosts or project refs.
- **Mask all script output (SAFE-NET):** every script that connects requires `scripts/db/safe-net.cjs` first; ad-hoc
  scripts do the same or pipe their output through `mask()`.
- **No production sign-in.** Check production anonymously only; the owner checks the signed-in and staff views.
- **Screenshots or files that contain personal data never go into the repo.**
