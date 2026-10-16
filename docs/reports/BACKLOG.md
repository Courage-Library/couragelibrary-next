# Backlog (cross-phase follow-ups)

These are items that no open phase owns. Phase-owned items stay in their own reports. Examples:
- TEST-CA: the legacy Current Affairs suites
- LOOP-1: the `B-DSH-*` tags
- GAP2-4c: retire the phase-3R reconciliation workbench and move the legacy syllabus tables to `retired`

| ID | Item | Source | Notes |
|---|---|---|---|
| TEST-EK | Fix the stale Exam Knowledge suite assertions: 3H.3 `I43`; 3H.4.1 `H03`, `H07`; 3H.4 `S04`, `S05`, `S09`, `S34`, `S42`, `S44` | `docs/reports/sec/SEC_HOTFIX4_REPORT.md` | These are static source assertions that predate the SEC-1B guard refactor, plus S09, which expects zero EK documents. The failure set is proven identical at `5ea60f4` and `9569ac2`. Re-point them at the current guards (`requireAdmin…`) and live data, without weakening them. |
| TEST-HARNESS-TXN | Harden the DB test harness against orphaned "idle in transaction" sessions: always `ROLLBACK` in `finally`; set a short `lock_timeout` (and `idle_in_transaction_session_timeout` where the pooler allows) inside test transactions | GAP2-4a report §6 (architect note 2, 2026-10-16) | A network drop left a test backend holding table locks, which caused later statement timeouts. Terminating a session is allowed ONLY for the suite's own orphan, after checking same DB user + own statement, and must be recorded. |
| EK-CLAIM-VERIFY | Record who verified an Exam Knowledge claim and when: `exam_claims` has no `verified_by_user_id` / `verified_at` (sources do) | `docs/reports/gap2/GAP2_4B_REPORT.md` §2.5 | GAP2-4b removed the two non-existent columns from `updateClaimVerification` (the update always failed). Add the columns by migration if the audit trail is wanted. |
| TEST-LEGACY-SYLLABUS | `scripts/test_dynamic_syllabus_reconciliation.cjs` / `test_dynamic_syllabus_resolution.cjs` exercise the phase-3R importer and workbench, which are fail-closed (GAP2-4a / 4b) | `docs/reports/gap2/GAP2_4B_REPORT.md` §2.5 | Not permanent gates. Delete them with the workbench in GAP2-4c. `test_phase3a_academic_taxonomy.cjs` Track 4 was retired with `exam-syllabus.service.ts`. |
