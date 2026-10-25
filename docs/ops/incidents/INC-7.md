# INC-7: orphaned idle-in-transaction session holding ACCESS EXCLUSIVE locks (2026-10-25)

- **Severity:** production availability. Reads and writes on 27 tables were blocked. No data was changed and nothing was committed.
- **Status:** resolved. The owner terminated the backend. A re-check found no locks on the 27 tables, no waiting queries and no open transactions of ours.

## What happened

| Time (UTC, approx.) | Event |
|---|---|
| ~18:32 | **Window 1 starts.** The first MFA-DB-2 (102) smoke starts. It runs the whole check in ONE transaction and applies 102 inside it: `ALTER POLICY` on 27 tables and `CREATE OR REPLACE` on 13 functions. From that point it holds **ACCESS EXCLUSIVE** locks on the 27 tables for the rest of its run. |
| 18:43:41 | **Window 1 ends.** That smoke finishes and rolls back, which releases the locks. |
| ~18:45–18:46 | **Window 2 starts.** The smoke is re-run with the same single-transaction design, and its migration step takes the same locks again. |
| ~18:46 | A 102 runner dry-run started in parallel deadlocks against the smoke (`40P01`, rolled back). |
| ~18:50 | The architect sets LIVE-LOCK-SAFETY. Claude sees that the running smoke breaks it. |
| 18:52 | Claude stops the smoke's shell. The client process ends, but the pooled server backend (Supavisor, transaction mode) stays **"idle in transaction (aborted)"** with 27 ACCESS EXCLUSIVE locks. The server has `idle_in_transaction_session_timeout = 0`, so it never ends by itself. |
| ~18:53 | Claude's read-only check finds the orphan: transaction age 420 s, 27 ACCESS EXCLUSIVE locks. Even a `pg_policies` read hits the new 3 s lock timeout. Claude's terminate attempt is blocked by the auto-mode classifier, so Claude asks the owner. |
| ~18:53–19:01 | **Window 2 ends.** The owner runs `pg_terminate_backend(2144357)`. |
| 19:01 | Read-only re-check: 0 locks on the 27 tables, 0 queries waiting on locks, 0 open transactions of ours, and pid 2144357 is gone. |

## Impact

While a window was open, any statement on these tables waited for the lock until the caller's own timeout. That covers app pages and API routes: Memory Lock / mistake vault, community, flashcards, batches, search logs, battles and descriptive evaluation.

**Tables:** batch_curriculum_assignments, batch_memberships, descriptive_questions, discussion_messages, discussion_moderation_flags, discussion_threads, discussion_votes, evaluation_rubrics, flashcard_decks, flashcards, institute_batches, institutes, mistake_cognitive_types, popular_search_terms, quiz_battle_participants, quiz_battle_rooms, quiz_battle_round_answers, search_indexes, search_query_logs, submission_evaluations, user_battle_stats, user_deck_progress, user_descriptive_submissions, user_flashcard_reviews, user_mistake_drills, user_mistake_occurrences, user_mistake_vault.

The most-used ones for students are `user_mistake_vault` / `user_mistake_occurrences` (Memory Lock and mistakes).

**Duration:** about 10 min in window 1 plus about 8–15 min in window 2.

**Not measured:** how many real requests were affected. No request logs were read; the server has no query log we can access.

## Cause

1. **The smoke design broke lock hygiene.** It applied a DDL migration inside one long transaction (~500 rolled-back checks over a high-latency link), so ACCESS EXCLUSIVE locks on 27 production tables were held for minutes.
2. **Stopping a client does not end its server transaction behind a transaction pooler.** With `idle_in_transaction_session_timeout = 0`, the aborted transaction kept its locks indefinitely.
3. **A second live session (the dry-run) was started against the same objects at the same time**, which caused the deadlock.

## Fix and prevention: LIVE-LOCK-SAFETY (permanent; `docs/database/MIGRATION_RUNBOOK.md`)

**Timeouts in every live script session.** `scripts/db/live-safety.cjs` `applyLiveSafety()` sets these with SET LOCAL right after BEGIN:
- `lock_timeout = '3s'`
- `statement_timeout = '60s'`
- `idle_in_transaction_session_timeout = '30s'`, so an orphaned transaction ends itself and frees its locks within 30 s.

The migration runner applies them and its self-test checks it.

**Script structure.** Every script wraps its work in `try/finally`, which runs ROLLBACK and then `client.end()`. On SIGINT / SIGTERM it runs ROLLBACK first; `withLiveTransaction()` and `installStopHandler()` in `live-safety.cjs` do this.

**Smoke design.** Smokes that take DDL locks run as many small rolled-back transactions, one object group each. No lock is held for more than a few seconds.

**One session at a time.** Never run two live sessions on the same objects at once; no dry-run during a smoke.

**Session checks.** Before starting any live DB work, and after stopping any, run `node scripts/ci/db-sessions.cjs` (read-only) and report your own leftover sessions.

**Never terminate sessions yourself.** Report the pid to the owner.

**Lock timeouts.** On a lock timeout, retry once, then STOP and report. Never raise a timeout.
