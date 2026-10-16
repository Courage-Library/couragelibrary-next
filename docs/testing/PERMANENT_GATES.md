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
| Staff-only RLS (SEC-HOTFIX-4) | `node scripts/test_sec_hotfix4_rls.cjs` | DB, rolled back: no FOR ALL policies; student = anon visibility; writes RLS-denied; staff paths intact; **P-6 permanent rule:** no blanket `USING/WITH CHECK (true)` policy for authenticated/PUBLIC outside the public allow-list (whole schema); **P-9 permanent rule (SEC-HOTFIX-6):** no SECURITY DEFINER function in public is EXECUTE-able by anon / PUBLIC or lacks a pinned `search_path`, except the reviewed allow-list (one-line justification each); the pending-ruling list must be **empty** (SEC-HOTFIX-7); the service-role-only set (082 + 083) and the authenticated-only set (083) are asserted with anon / student behaviour probes |
| Design ratchet (decision #40) | `node scripts/test_design_ratchet.cjs` | offline: palette / raw colour / `dark:` / <12px / legacy-primitive counts may only fall; design system scores 0; dark mode inert; one self-hosted font; contrast register passes |
| Design-system a11y (UX) | `node scripts/test_ux1a_a11y.cjs http://localhost:3100` | local build only (qa-admin); run when `components/ui` or tokens change |
| App shell (UX-1b) | `node scripts/test_ux1b_shell.cjs`; `node scripts/test_ux1b_shell_a11y.cjs http://localhost:3100` | static: no dev labels in student UI, no dead shell links, landmarks, no DB in shell, English-only import; a11y (local build, qa-student): landmarks, skip link, contrast, bottom nav, menus, CLS |
| Canonical syllabus (GAP2-4a) | `node scripts/test_gap2_4a_syllabus.cjs` | DB, rolled back: role matrix on every syllabus RPC, audit, same-version parent / cycles, TOPIC-only + weights, validation issues, atomic publish (≤1 PUBLISHED per exam + cycle), immutability, read model counts, seeded drafts idempotent |
| Syllabus editor (GAP2-4b) | `node scripts/test_gap2_4b_editor.cjs` (+ `--live http://localhost:3100`) | offline: guard-first actions, RPC-only, error mapping, role matrix, admin English-only; live (local build, QA identities, **QA test exam only**): staff draft → validate, admin publish → archive |
| Syllabus readers (GAP2-4b) | `node scripts/test_gap2_4b_readers.cjs` (+ `--base=http://localhost:3100`) | static: no runtime reader of `exam_syllabi` / `exam_topics` / `exam_unit_mappings` / `exam_topic_mappings`; the exam hub renders only the read model; DB (rolled back, QA test exam): NO_SYLLABUS → "Syllabus coming soon", AVAILABLE tree with tiers / known ranges / live counts, coverage UNAVAILABLE vs derived |
| QA identities | `node scripts/test_qa_identity_guard.cjs` | Permanent QA identities can never be deleted |
| Signed-in smoke (local build) | `node scripts/smoke/signed-in-smoke.cjs <student-mistake\|student-pages\|admin-pages\|staff-content> http://localhost:3100` | The affected areas |
| Production (after push) | `node scripts/smoke/wait-for-deploy.cjs https://couragelibrary-next.vercel.app <sha>`, then an anonymous smoke | Signed-in production smokes are run by the owner |

**Rules:**
- **Never run scripts that disable TLS verification.** See the inventory in `docs/reports/hotfix/HOTFIX2_REPORT.md`.
- **Never create throwaway auth users.** Use only the permanent QA identities (`docs/testing/QA_IDENTITIES.md`), and run `cleanup-student.cjs` with `E2E_KEEP_USER=1`.
