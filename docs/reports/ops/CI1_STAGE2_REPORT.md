# CI-1 Stage 2: CI built, dispatch-only, awaiting the owner's first manual run

Phase brief: architect ruling "CI-1 Stage 2 (build) + PROD-TIMEOUT-1 path", 2026-10-18.

**Recorded:**
- **Decision #56:** the smoke wait strategy, including the static cap of 10. Approved, to be proven on CI.
- **Backlog AUTH-RESILIENCE:** the middleware treats a transient session-check error as signed-out. Keep it fail-closed, but retry once, or distinguish "error" from "no session".
- **Backlog PERF-ADMIN-EXAMS:** `/admin/exams` loads in 4.5–15 s.

**§10 rulings applied:**
1. Code changes approved.
2. No required reviewer; branch rule `main` on both environments.
3. `paths-ignore` docs only.
4. A red CI run blocks the next phase, not deploys.
5. Prove #56 on CI (student-mistake and admin-pages 3× each).

## 1. Code changes (approved list)

| Change | File | Proof |
|---|---|---|
| Env-helper CI fallback: when `CI=true` **and** `.env.local` is absent, `readEnv()` returns `process.env[k]`. Never writes a file. Any other case is unchanged (throws `ENV_MISSING` without the file; the file wins over nothing; `process.env` still wins over the file) | `scripts/db/_db-env.cjs` | C-1 / C-2 / C-3 run in a throw-away project root with fake values: env read, nothing written; `CI` unset → throws; `CI=1` (not `true`) → throws; file plus env precedence unchanged |
| QF-1 DB suite reads its config through the same helper (it read `.env.local` directly, which would crash on CI) | `scripts/test_qf1_db.cjs` | local QF-1 DB run after the change: **15/15** |
| Server bound to 127.0.0.1 (`next start -H 127.0.0.1`); the banner shows `127.0.0.1` only | `scripts/live/with-server.cjs` | local with-server run: health 200 via `localhost`; banner `Local / Network: http://127.0.0.1:3100`; C-6 static check |
| **Log scan.** FAIL on the classes below; reports file:line plus class, never the text; scanning nothing is a FAIL | `scripts/ci/log-scan.cjs` | self-test: 9 planted fakes caught, clean log (loopback, versions, clock times) passes, empty directory FAILs. Run on today's real local logs it flagged exactly the 2 old `Network: http://<LAN IP>` banners the binding change removes, with no false positives |
| **Masking.** One `::add-mask::` per value derived from secrets (project ref, API host, DB host / user / password, pooler user's ref); outside GitHub Actions it prints a count only | `scripts/ci/mask-derived.cjs` | self-test 8/8 |
| **Orphan-session check.** The current DB user's non-idle sessions: PID, state, age, locks, first keyword only; `--fail-on-own-open` fails on any older than 30 s; never terminates | `scripts/ci/db-sessions.cjs` | local run: 0 open sessions, exit 0 |
| Tests for all of the above | `scripts/ci/test_ci_scripts.cjs` | **6/6** |

The log scan fails on:
- any secret value, or a value derived from one;
- `*.supabase.co` / `*.supabase.com` hosts;
- IPv4 / IPv6 addresses other than loopback;
- JWTs;
- credentialed `postgres://` URLs;
- `Authorization: Bearer` headers;
- `sb_secret_` / `sb_publishable_` keys.

**PROD-TIMEOUT-1 smoke rewrite (#56):** `scripts/smoke/signed-in-smoke.cjs` is committed now, as the ruling asks, because the live job must run it. PROD-TIMEOUT-1 becomes closable **only after CI proves it** (§4).

## 2. Workflow: `.github/workflows/ci-gates.yml`

- **Trigger:** `workflow_dispatch` **only**, with inputs `live` and `prod_smoke`. The `push` block to `main` with `paths-ignore: docs/**, **/*.md` is commented out with a TODO citing this ruling. There is no `pull_request` trigger.
- **Permissions and checkout:** `permissions: contents: read`; `persist-credentials: false`.
- **Concurrency:** `couragelibrary-next-db`, `cancel-in-progress: false`.
- **Actions pinned by SHA:**
  - checkout v4.2.2 `11bd71901bbe5b1630ceea73d27597364c9af683`
  - setup-node v4.4.0 `49933ea5288caeca8642d1e84afbd3f7d6820020`
  - upload-artifact v4.6.2 `ea165f8d65b6e75b540449e92b4886f43607fa02`

  The YAML was parsed locally: 1 trigger, 3 jobs, all 7 `uses:` pinned.
- **offline** (no secrets): TLS guard, tsc, lint, 16 offline suites (incl. `test_ci_scripts`, TYPES-1 `--offline`, anonymous-smoke `--self-test`), log scan.
- **live** (environment `ci-live`), in order:
  1. mask derived values;
  2. CA written to a 0600 runner-temp file, then `PROD_CA_PATH`;
  3. TLS guard;
  4. build;
  5. pre-flight (net-probe; `db-sessions --fail-on-own-open`);
  6. **one `with-server.cjs` run in the documented gate order**, with **student-mistake ×3 and admin-pages ×3** (#56 proof) plus student-pages, staff-content and admin-home ×1.

  `if: always()` steps: cleanup-student (data only) plus fixture restore, the orphan-session check, the log scan, and an upload of the scanned logs (7 days).
- **prod-smoke** (environment `ci-public`, public values only): wait-for-deploy for the run's commit, then the anonymous production smoke, then the log scan.
- **Never in the workflow:** migrations, backups, `db:types` writes, production sign-in, the TLS-bypassing legacy suites, `SUPABASE_ACCESS_TOKEN`.

## 3. Local gates for this commit (no local live runs required by the ruling)

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| **Offline job simulated exactly** (`CI=true`, `.env.local` temporarily moved aside, restored byte-identical afterwards): the 16 offline suites | **16/16 green** (CI support 6/6, no_runtime_db 5/5, design ratchet 8/8, UX-1b 7/7, QF-1 offline 73/73, SEC-1B 26/26, SEC-1C 22/22, SEC-1D 14/14, K 5/5, DRILL-1 2/2, SYL-IMPORT-1 32/32, readers 3/3, editor 5/5, UX-2a 10/10, TYPES-1 9/9, ref-scan self-test 4/4) |
| CI script self-tests | log-scan 11/11, mask 8/8, `test_ci_scripts` 6/6 |
| Sanity: QF-1 DB with the helper change; with-server binding | 15/15; health 200, banner 127.0.0.1 |

## 4. What happens next

1. **Owner:** follows `docs/ops/CI1_DESIGN.md` §9:
   - create `ci-live` / `ci-public` with the branch rule `main`;
   - add the 9 / 3 secrets by name;
   - set Actions to read-only;
   - **Run workflow** on `main`;
   - report green / red per job (no values).
2. **Green:**
   - the next commit uncomments `push` (with the `paths-ignore`);
   - PROD-TIMEOUT-1 is **CLOSED** with the CI evidence (#56: 3 consecutive passes of each smoke on the runner);
   - the owner still re-runs the two production smokes.
3. **Red:** diagnose from the redacted artifact `live-gate-logs`. Nothing is enabled.

**Files in this commit:**
- `.github/workflows/ci-gates.yml`
- `scripts/ci/{log-scan,mask-derived,db-sessions,test_ci_scripts}.cjs`
- `scripts/db/_db-env.cjs`, `scripts/live/with-server.cjs`, `scripts/test_qf1_db.cjs`
- `scripts/smoke/signed-in-smoke.cjs` (#56)
- `docs/ops/CI1_DESIGN.md` (§9 owner click-path, §10 rulings)
- `docs/testing/PERMANENT_GATES.md` (#56, CI rows)
- this report

PROD-TIMEOUT-1 status: OPEN (closable after CI proof)

CI-1 Stage 2 status: AWAITING-OWNER-RUN
