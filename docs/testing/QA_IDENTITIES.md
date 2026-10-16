# Permanent QA identities (couragelibrary-next)

Introduced in SEC-1B. These are the **only** auth users tests may sign in as. Never create throwaway auth users. A user that writes `admin_audit_logs` can never be deleted (the audit log is immutable and its `actor_id` FK is `ON DELETE SET NULL`); see the GAP2-2a W2 waiver.

| Identity | Email | Role (`app_metadata.role`) | Use |
|---|---|---|---|
| qa-admin | `qa-admin@courage-library.test` | `admin` | Admin smoke tests; every smoke write to `admin_audit_logs` is attributed to this identity |
| qa-staff | `qa-staff@courage-library.test` | `staff` | Staff-vs-admin authorization checks (e.g. candidate drill-down is admin-only) |
| qa-student | `qa-student@courage-library.test` | none | Negative authorization checks (authenticated, no role) |

**Rules:**
- **Roles** are set server-side with the service role (`app_metadata`). `user_metadata` never grants access.
- **Passwords** live only in `.env.local` (`QA_ADMIN_PASSWORD`, `QA_STAFF_PASSWORD`, `QA_STUDENT_PASSWORD`), which is git-ignored. They are never printed, logged or committed.
- **Create or repair** with `node scripts/qa/ensure-qa-identities.cjs`. It is idempotent: it creates missing identities, re-asserts roles, and stores generated passwords only when the keys are absent.
- **Never deleted (HOTFIX-1 guard).** Every e-mail written in backticks in this document is protected by `scripts/qa/qa-identity-guard.cjs`.
  - Scripts may delete an auth user only through `guardedDeleteUser`, which re-reads the e-mail by id and refuses a protected identity.
  - `scripts/e2e/cleanup-student.cjs` refuses a protected identity unless `E2E_KEEP_USER=1` (data-only cleanup).
  - Tested by `scripts/test_qa_identity_guard.cjs`.
- **E2E student journeys** keep using the dedicated, cleaned-up journey student (`E2E_STUDENT_EMAIL`, see `scripts/e2e/`). That account writes no admin audit rows.
- **Exception:** the GAP2-2a reviewer `qa-content-reviewer-gap22a@example.test` is banned dev-DB residue (waiver W2). Do not use or delete it.

## Permanent QA test exam (GAP2-4b, migration 081)

- **Exam:** `qa-syllabus-test`, "QA Syllabus Test (internal)". It is **inactive** and must never be activated.
- **Who uses it:** only the syllabus editor's live test (`scripts/test_gap2_4b_editor.cjs --live`). That test publishes and archives a TEST syllabus through the real UI. It must never do so on a real exam: published rows are student-visible, and published / archived versions are immutable.
- **What accumulates:** archived TEST versions stay on this exam as history. Drafts left by an aborted run are archived by the test's cleanup.
- **Never** run the live editor test with a missing or unresolved QA exam id: the version list falls back to the first active exam. The test asserts the id first.

