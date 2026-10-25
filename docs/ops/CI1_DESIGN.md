# CI-1 Stage 1: permanent gates on GitHub Actions (design only)

Phase brief: architect, 2026-10-18. **Goal:** run the permanent gates on GitHub-hosted runners (a stable network) instead of the owner's Wi-Fi.

**Stage 2 (built):** `.github/workflows/ci-gates.yml`, manual dispatch only until the first green run. The Stage 1 draft stays in `docs/ops/drafts/` for history.

Why: during SECDEF-S2-1 alone, the live gates needed up to 3 attempts each on this machine, and QF-1 DB stayed network-unresolved (net-probe 90–95% success, TLS p95 up to 3.3 s, dropped pooler connections). On a GitHub-hosted runner the same gates run on a datacentre network.

## 1. Triggers and trust boundary

> **Current (CI-LEAN-1, decisions #73 / #74 / #75, 2026-10-25):** this section is the original Stage 1 design. The current workflow (`.github/workflows/ci-gates.yml`) is:
>
> | Trigger | Jobs |
> |---|---|
> | push to `main` (docs-only skipped) | offline + server-checks + prod-smoke |
> | nightly schedule (~02:30 IST, cron `0 21 * * *` UTC) | offline + server-checks + **live** |
> | `workflow_dispatch` | live / prod-smoke as chosen |
>
> - **Job time limits:** offline 15, server-checks 20, live 45, prod-smoke 20 minutes (CI-support C-15).
> - **Concurrency:** one run at a time; a newer run replaces an older pending one; an in-progress live job is never cancelled.
> - **Sign-in:** Supabase CAPTCHA is ON, so the live suite signs the QA identities in through `scripts/live/qa-session.cjs` (magic-link token minted server-side). It never uses a password (CI-support C-16; `docs/testing/LIVE_GATES.md`).
> - **Server-checks:** uses a fake Supabase host on the reserved `.invalid` TLD.
> - **Actions:** `actions/checkout` v7.0.1 and `actions/setup-node` v7.1.0 (Node 24 runtime), pinned by full commit SHA.


- **`push` to `main`** and **`workflow_dispatch`** (manual; an input lets the owner skip the live job).
- **No `pull_request` / `pull_request_target` trigger at all.** Code from forks or branches never runs with secrets, and only code already on `main` reaches the protected environment.
- `permissions: contents: read` at workflow level. No write token; `persist-credentials: false` on checkout.
- **Secrets live in GitHub Environments, not repository secrets:**
  - `ci-live`: the live job only. Deployment branches restricted to `main`; optional required reviewer (the owner).
  - `ci-public`: the prod-smoke job only, public values only.
- **Concurrency:** `group: couragelibrary-next-db`, `cancel-in-progress: false`. Runs queue and are never parallel or cancelled mid-suite.
  - Operational rule: the owner does not run local live gates while a CI run is active. The DB is shared and the suites assume they are alone on QA data.

## 2. Jobs

| Job | Needs | Secrets | What it runs | Est. time |
|---|---|---|---|---|
| **(a) offline** | — | **none** | `npm ci`, TLS-bypass guard, `tsc`, `lint`, then the offline suites: no_runtime_db, design ratchet, UX-1b shell, QF-1 offline, SEC-1B / 1C / 1D offline, K `--offline`, DRILL-1 `--offline`, SYL-IMPORT-1 `--offline`, readers `--offline`, editor, UX-2a `--offline`, TYPES-1 `--offline` (skips only the online T-01), anonymous-smoke `--self-test`; then a log scan | 6–10 min |
| **(b) live** | offline | `ci-live` | `npm ci`, mask derived values, write the CA to a 0600 temp file, TLS guard, `npm run build`, pre-flight (net-probe + own open DB sessions = 0), then **one** `with-server.cjs` run of the live gates in the **documented gate order** (below); `always()`: cleanup + fixture restore, orphan-session check, log scan, redacted log artifact (7 days) | 45–70 min |
| **(c) prod-smoke** | offline | `ci-public` | `wait-for-deploy` for this commit, then `anonymous-smoke.cjs` against production (anonymous GETs only); log scan | 3–10 min |

**Live job gate order.** DB suites first, then the student-data sequence from PERMANENT_GATES:
1. **DB suites:** #54 ratchet; RLS P-1…P-9; QF-1 DB; K suite; SECDEF-S2-1; TYPES-1 close (select audit); GAP2-4a; readers `--base`; SYL-IMPORT-1.
2. **Student-data sequence:** cleanup-student (`E2E_KEEP_USER=1`) → E2E journey → lineage → DRILL-1 → student-drill → cleanup-student → ensure-student-fixture → student-mistake smoke (fixture left in place).
3. **Remaining smokes and suites:** student-pages, admin-pages and staff-content smokes; UX-2a live; CA routes; SEC-1B / 1C / 1D `--live`; anonymous smoke (local).

Every gate keeps its own rules: ≤ 15 min per gate, bounded waits, a classified failure. On CI a failure is never "network": a red gate is investigated as real.

**Runner:** `ubuntu-24.04`. It ships Google Chrome, which the Playwright suites use via `channel: 'chrome'`. No `npx playwright install`, no new npm dependency (`npm ci` from the lockfile).

## 3. Secrets: exact list (names only)

The **owner** sets these in GitHub. They are never pasted in chat, never committed, and never echoed. GitHub masks secret values in logs automatically; derived values are masked explicitly (§6).

| Secret | Environment | Purpose | Least privilege |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ci-live, ci-public | API base for the app build, PostgREST probes, read model | public by design; still a secret so the project host is masked |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ci-live, ci-public | anon / publishable key (build, anon probes, read model) | public, RLS-bound |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ci-live, ci-public | the same anon key under the legacy name (still read by the anonymous smoke's SEC-HOTFIX probes and several suites) | public, RLS-bound |
| `SUPABASE_SERVICE_ROLE_KEY` | ci-live | E2E cleanup / journey / drill, SEC suites, editor | **powerful**: ci-live only, main only |
| `POSTGRES_URL_NON_POOLING` | ci-live | verified-TLS DB connection for the rolled-back DB suites | **owner role**: needed because the suites impersonate roles (`SET ROLE authenticated` + JWT claims) and run DDL in rolled-back transactions (QF-1, SYL-IMPORT-1 I9, SECDEF-S2-1 S-3). ci-live only, main only. The project-ref guard (`dbTarget`) refuses any other project |
| `PROD_CA_PEM` | ci-live | PEM contents of the CA used for verified TLS (written to `$RUNNER_TEMP/prod-ca.pem`, mode 0600, `PROD_CA_PATH` points at it) | not secret, but kept with the DB secrets |
| `QA_STUDENT_PASSWORD` | ci-live | permanent QA student sign-in (local build only) | QA identity, `.test` domain |
| `QA_STAFF_PASSWORD` | ci-live | permanent QA staff sign-in | QA identity |
| `QA_ADMIN_PASSWORD` | ci-live | permanent QA admin sign-in | QA identity |

**Deliberately not given to CI:**
- `SUPABASE_ACCESS_TOKEN`: account-wide, so the online type-drift check T-01 stays local.
- `GEMINI_API_KEY`, payment / ingestion / certificate keys, `CURRENT_AFFAIRS_INGESTION_KEY`, `INGESTION_SERVICE_SECRET`: no gate needs them.
- `ADMIN_EMAILS`: admin role comes from `app_metadata`; the email list is only a fallback.
- `DATABASE_URL` / `POSTGRES_URL` / `SUPABASE_DB_URL`: unused by the gates.

## 4. DB safety in CI

| Suite | Writes | Scope / guarantee |
|---|---|---|
| QF-1 DB, K, RLS, GAP2-4a, readers, SECDEF-S2-1 | inside transactions that are **always rolled back** | nothing persists; baselines asserted (QF-1 BASE-1, K-9) |
| SYL-IMPORT-1 | commits its own tagged DRAFT on the inactive QA exam, then deletes it | QA exam only; it removes a leftover tagged draft on start; CLEANUP asserts byte-identical non-QA rows |
| E2E journey, DRILL-1, student-drill, ensure-student-fixture | qa-student rows (attempts, answers, vault, drills) | QA identity only; cleanup-student with `E2E_KEEP_USER=1` before and after (the QA identity guard refuses deleting a permanent user) |
| smokes, SEC-1x, UX-2a, CA routes, ratchet, TYPES-1 close | read-only | — |

- **Concurrency 1:** the workflow concurrency group, plus the operational rule in §1.
- **Cleanup always:** the `if: always()` step runs cleanup-student (data only) and re-creates the smoke fixture, so the next run and the owner's local runs start from the documented state.
- **Orphan-session check, always:** `scripts/ci/db-sessions.cjs` (Stage 2, from the existing session check) fails the job if a session of the CI DB user is still open, and prints PIDs only. **It never terminates sessions in CI.** Termination of own orphans stays a recorded, manual owner / agent action.
- **Never in CI:**
  - migrations, `apply-migration.cjs`, backups, `db:types` writes;
  - production sign-in;
  - writes outside QA scope;
  - the CA-4 / 5 / 6 legacy suites (they disable TLS).

  Migrations stay manual on the owner machine: resilient backup → dry-run → apply via the ledger.
- **Verified TLS only:** the CA comes from the secret, `NODE_TLS_REJECT_UNAUTHORIZED` is asserted unset in both jobs, and `test_no_runtime_db` stays a gate.

## 5. Supply chain

- Actions are **pinned by commit SHA** (tag in a comment). Resolved with `git ls-remote`:
  - `actions/checkout` v4.2.2 = `11bd71901bbe5b1630ceea73d27597364c9af683`
  - `actions/setup-node` v4.4.0 = `49933ea5288caeca8642d1e84afbd3f7d6820020`
  - `actions/upload-artifact` v4.6.2 = `ea165f8d65b6e75b540449e92b4886f43607fa02`
- Only first-party `actions/*`; no third-party actions.
- `npm ci` from the committed lockfile; no new npm dependency.
- Node pinned to `20.19.4`, the version the gates run on locally.

## 6. Log hygiene (the "no secrets / hosts printed" rule, enforced)

1. GitHub masks every secret value automatically.
2. **`scripts/ci/mask-derived.cjs`** (Stage 2) emits `::add-mask::` for values *derived* from secrets: the project ref, the DB host, the DB user, the pooler hostname. It prints nothing else.
3. Every gate's output is `tee`d to `$RUNNER_TEMP/logs/`. **`scripts/ci/log-scan.cjs`** (Stage 2) fails the job if any log contains:
   - a secret value (compared in memory, never printed);
   - the project ref or derived host;
   - `*.supabase.co`;
   - an IPv4 / IPv6 address (other than `127.0.0.1` / `::1`);
   - a JWT (`eyJ…`) or `postgres://` URL;
   - an `Authorization:` header.

   It reports the file, the line number and the pattern class only.
4. Only scanned logs are uploaded (7-day retention).
5. **CI-FLAKE-1 (2026-10-25):** server-checks `SC-BUILD` intermittently fails with only `diag CRASH:TypeError`.
   - Seen on manual run #19, on 278dfa0 (its re-run was green) and on 6032cfb; e9602be, 2e033f7 and the Vercel builds all
     succeeded.
   - Change: `scripts/ci/run-quiet.cjs` now adds the FILE PATH of the error's first stack frame:
     `CRASH:<Class>[/<CODE>]@<frame>`. The path is repo-relative or starts at `node_modules/`; a path outside the repo
     becomes `external`. No line numbers, message text, env or values; the token stays under `SAFE_TOKEN` and the log scan.
   - A failing BRAND2-PROBE P-03 check also prints a reason sub-ID: `<id>-NAV`, `<id>-NOTVISIBLE` or `<id>-W<w>H<h>`.

**Stage 2 code changes needed** (small, test / script only):
- `scripts/db/_db-env.cjs` `readEnv()`: read `process.env` only when `CI=true` and `.env.local` is absent. Today it throws `ENV_MISSING`, and every suite that calls it would fail.
- `scripts/live/with-server.cjs`: start `next start -H 127.0.0.1`, so the server banner prints no runner IP (today it prints the LAN address, which the log scan would flag).
- New `scripts/ci/log-scan.cjs`, `scripts/ci/mask-derived.cjs`, `scripts/ci/db-sessions.cjs`.
- Verify that each "offline" suite runs without `.env.local`. Checked statically: none of the 14 calls `readEnv()` / `dbTarget()` at load time; their calls sit in functions, apparently on live paths. Stage 2 confirms this by running the offline job once with no `.env.local`.

## 7. Cost and time

- **Per push to main:** offline ~8 min + live ~45–70 min + prod-smoke ~5 min, about **60–85 runner-minutes**. Ubuntu minutes cost ×1.
- **Budget:**
  - Private repository on GitHub Free: 2,000 min/month ≈ 25–30 full runs.
  - GitHub Pro / Team: 3,000 min/month.
  - Public repository: free.
- **Ways to stay inside the budget:**
  - `workflow_dispatch` with `live: false` for docs-only pushes;
  - Stage 2 could add `paths-ignore: ['docs/**', '**/*.md']` on `push`.
- **Wall time** is dominated by the network-bound suites: SEC-1C live (~7–10 min locally), UX-2a live (~6 min), TYPES-1 close (~4 min), the E2E journey. These should be faster from a datacentre.

## 8. Stays local-only

| Item | Why |
|---|---|
| Migrations (`apply-migration.cjs`), resilient backups, rollbacks | owner machine, ledger, `E:\CourageLibrary-Backups`, human go |
| `npm run db:types` (write) and the online T-01 `db:types:check` | needs the account-wide `SUPABASE_ACCESS_TOKEN` |
| Signed-in production smokes | owner only, never an agent or CI |
| `scripts/diag/*` (net-probe in pre-flight only), `page-timing.cjs --owner` | diagnostics |
| CA-4 / 5 / 6 legacy suites | disable TLS; never run anywhere |

## 9. Owner instructions (CI-1 Stage 2: the workflow is committed and runs on manual dispatch only)

**Never paste a secret value in chat, an issue, a commit or a PR.** Values go only into the GitHub secret fields, copied from your local `.env.local` and CA file.

**(a) Create the two environments (branch rule `main` only, no required reviewer, per ruling):**
1. GitHub → the repository → **Settings** → left menu **Environments** → **New environment** → name `ci-live` → **Configure environment**.
2. Under **Deployment branches and tags**, choose **Selected branches and tags** → **Add deployment branch or tag rule** → type **Branch**, pattern `main` → **Add rule**.
3. Leave **Required reviewers** unticked (ruling §10.2).
4. Repeat steps 1–3 for an environment named `ci-public`.

**(b) Add the secrets, by name, in the right environment.** In **Settings → Environments →** (environment) → **Environment secrets** → **Add environment secret**, add one secret per row:

| Secret name | `ci-live` | `ci-public` | Value comes from |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✔ | ✔ | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✔ | ✔ | `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✔ | ✔ | `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✔ | — | `.env.local` |
| `POSTGRES_URL_NON_POOLING` | ✔ | — | `.env.local` |
| `PROD_CA_PEM` | ✔ | — | the **full text** of the CA file that `PROD_CA_PATH` in `.env.local` points to (from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`) |
| `QA_STUDENT_PASSWORD` | ✔ | — | `.env.local` |
| `QA_STAFF_PASSWORD` | ✔ | — | `.env.local` |
| `QA_ADMIN_PASSWORD` | ✔ | — | `.env.local` |

So `ci-live` gets 9 secrets and `ci-public` gets 3. Do **not** add `SUPABASE_ACCESS_TOKEN` or any other key, and do not use *Repository secrets* for these.

**(c) Actions permissions:**
1. **Settings → Actions → General → Workflow permissions** → choose **Read repository contents and packages permissions** → **Save**.
2. On the same page, leave **Allow GitHub Actions to create and approve pull requests** unticked.

**(d) Run the workflow manually:**
1. Repository → **Actions** tab → left list **ci-gates** → **Run workflow** (right) → Branch: `main`; keep **Run the live (DB) gates** and **Run the anonymous production smoke** ticked → **Run workflow**.
2. Do **not** run local live gates while it runs: one DB, one run at a time.
3. Expected duration: offline ~8 min; live ~60–90 min (it includes the #56 proof: student-mistake and admin-pages 3× each); prod-smoke ~5 min.
4. When it finishes, report in chat only **green / red per job**: offline, live, prod-smoke. If live is red, also give the **name of the first failed gate**, shown in the "Live gates" step summary.
5. The agent can diagnose from the redacted artifact **live-gate-logs** (run page → *Artifacts*). Download it only if asked; it has already passed the log scan.

**After a green manual run:** the agent's next commit enables `push` to `main` (with `paths-ignore: docs/**, **/*.md`) and closes PROD-TIMEOUT-1 with the CI evidence. **After a red run:** diagnose first; nothing is enabled.

## 10. Decisions for the architect (ruled 2026-10-18: §10.1 approved; §10.2 no required reviewer, branch rule main; §10.3 paths-ignore docs/** and **/*.md only; §10.4 red CI blocks the next phase, not deploys; §10.5 prove #56 on CI)

1. Approve the **Stage 2 code changes** in §6: the `readEnv` CI fallback, with-server binding to 127.0.0.1, and three small `scripts/ci/*` scripts.
2. **Required reviewer** on `ci-live`: yes (safer; every run needs a click) or no (fully automatic on `main`)?
3. **`paths-ignore`** for docs-only pushes (saves about 70 minutes per docs commit)?
4. Should a **red live job block anything**? Recommended: no deploy gating, since Vercel deploys independently; a failed CI run is a STOP for the next phase until it is explained.
5. **First CI proof:** the PROD-TIMEOUT-1 wait-strategy change to `signed-in-smoke.cjs` is held uncommitted, because admin-pages could not get 3 consecutive local passes on this network (session drops to `/auth/login` caused by middleware network errors). Proposal: Stage 2's first dispatch runs student-mistake and admin-pages 3× each on the runner; if green, the smoke change is committed as part of Stage 2.

CI-1 Stage 1 status: COMPLETE-AWAITING-DECISION
