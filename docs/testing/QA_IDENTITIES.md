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
- **E2E student journeys** keep using the dedicated, cleaned-up journey student (`E2E_STUDENT_EMAIL`, see `scripts/e2e/`). That account writes no admin audit rows.
- **Exception:** the GAP2-2a reviewer `qa-content-reviewer-gap22a@example.test` is banned dev-DB residue (waiver W2). Do not use or delete it.
