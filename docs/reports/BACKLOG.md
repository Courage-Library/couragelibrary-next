# Backlog (cross-phase follow-ups)

These are items that no open phase owns. Phase-owned items stay in their own reports. Examples:
- TEST-CA: the legacy Current Affairs suites
- LOOP-1: the `B-DSH-*` tags
- Commerce: the mistake-drill reward (`B-DRILL-REWARD-ARGS`)

| ID | Item | Source | Notes |
|---|---|---|---|
| TEST-EK | Fix the stale Exam Knowledge suite assertions: 3H.3 `I43`; 3H.4.1 `H03`, `H07`; 3H.4 `S04`, `S05`, `S09`, `S34`, `S42`, `S44` | `docs/reports/sec/SEC_HOTFIX4_REPORT.md` | These are static source assertions that predate the SEC-1B guard refactor, plus S09, which expects zero EK documents. The failure set is proven identical at `5ea60f4` and `9569ac2`. Re-point them at the current guards (`requireAdmin…`) and live data, without weakening them. |
| TEST-HARNESS-TXN | Harden the DB test harness against orphaned "idle in transaction" sessions: always `ROLLBACK` in `finally`; set a short `lock_timeout` (and `idle_in_transaction_session_timeout` where the pooler allows) inside test transactions | GAP2-4a report §6 (architect note 2, 2026-10-16) | A network drop left a test backend holding table locks, which caused later statement timeouts. Terminating a session is allowed ONLY for the suite's own orphan, after checking same DB user + own statement, and must be recorded. |
| EK-CLAIM-VERIFY | Record who verified an Exam Knowledge claim and when: `exam_claims` has no `verified_by_user_id` / `verified_at` (sources do) | `docs/reports/gap2/GAP2_4B_REPORT.md` §2.5 | GAP2-4b removed the two non-existent columns from `updateClaimVerification` (the update always failed). Add the columns by migration if the audit trail is wanted. |
| ~~TEST-LEGACY-SYLLABUS~~ | DONE in GAP2-4c: the 7 phase-3R suites were moved to `scripts/archive/legacy-syllabus/` (never run; excluded from gates) together with the workbench removal | `docs/reports/gap2/GAP2_4C_REPORT.md` §3 | — |
| SEC-1E | `/admin/syllabus` lists exams (including inactive ones) through the service-role client after `requireAdminPage` (staff RLS sees only active exams) | Architect note at GAP2-4b acceptance (2026-10-16) | Accepted for now. Replace it with a role-checked read (an RPC or a staff policy for inactive exams) in a SEC phase. |
| ~~SECDEF-RULING~~ | DONE in SEC-HOTFIX-7 (migration 083): all 14 functions were ruled and locked; the P-9 pending list is empty | `docs/reports/sec/SEC_HOTFIX7_REPORT.md` | — |
| OBS-FN-STATS | `track_functions = none`: no function call statistics exist for incident analysis (INC-3) | `docs/reports/sec/SEC_HOTFIX6_REPORT.md` §1.1 | Owner: Platform ops (architect, SEC-HOTFIX-6 acceptance). Set `track_functions = 'pl'` if Supabase allows it. |
| ~~DRILL-WRITES~~ | DONE in DRILL-1 (migration 085): drills are generated and submitted only through the server-authoritative RPCs `fn_generate_mistake_drill` / `fn_submit_mistake_drill` (auth.uid()); no student table write | `docs/reports/drill/DRILL1_REPORT.md` | — |
