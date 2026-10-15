# Permanent gates

Every code phase must pass these before it is committed. Phase-specific suites are added on top. Run them against a local production build (`npm run build` + `npx next start -p 3100`); never against production.

| Gate | Command | Notes |
|---|---|---|
| Typecheck | `npx tsc --noEmit -p .` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| Build | `npm run build` | |
| Generated types | `node scripts/test_types1.cjs` | T-01 `db:types:check` (online) … T-08; ratchet must not rise |
| Drift guard | `node scripts/test_types1_close.cjs` | Every failing live select is owned (quarantine / remaining batch / tracked Class B) |
| **No runtime DB (decision #38)** | `node scripts/test_no_runtime_db.cjs` | No `pg` / `postgres` / `pg-pool`, no `rejectUnauthorized` / `NODE_TLS_REJECT_UNAUTHORIZED`, connection-string env only in allow-listed parse-only files |
| Admin authorization | `node scripts/test_sec1b_admin_authz.cjs`, `test_sec1c_admin_pages.cjs`, `test_sec1d_redirects.cjs` | offline; add `--live` (local build) when auth or admin pages change |
| Staff-only RLS (SEC-HOTFIX-4) | `node scripts/test_sec_hotfix4_rls.cjs` | DB, rolled back: no FOR ALL policies; student = anon visibility; writes RLS-denied; staff paths intact |
| QA identities | `node scripts/test_qa_identity_guard.cjs` | Permanent QA identities can never be deleted |
| Signed-in smoke (local build) | `node scripts/smoke/signed-in-smoke.cjs <student-mistake\|student-pages\|admin-pages\|staff-content> http://localhost:3100` | The affected areas |
| Production (after push) | `node scripts/smoke/wait-for-deploy.cjs https://couragelibrary-next.vercel.app <sha>`, then an anonymous smoke | Signed-in production smokes are run by the owner |

**Rules:**
- **Never run scripts that disable TLS verification.** See the inventory in `docs/reports/hotfix/HOTFIX2_REPORT.md`.
- **Never create throwaway auth users.** Use only the permanent QA identities (`docs/testing/QA_IDENTITIES.md`), and run `cleanup-student.cjs` with `E2E_KEEP_USER=1`.
