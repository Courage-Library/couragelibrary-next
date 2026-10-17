# QB-KEY-1 Stage 1 — Published question without an answer key: forensics + design

Phase brief (architect, 2026-10-17): read-only forensics and a design proposal, then STOP. No migrations, no data changes, no code changes.

Every DB read was a `BEGIN READ ONLY` transaction on couragelibrary-next with verified TLS (`scripts/db/_db-env.cjs` / `dbTarget`). User data is reported as counts only. No server was started.

Baseline commit: `03a44b8`.

## 1. Forensics

### 1.1 The bad version(s)

**Question model:** single-correct only.
- `question_options.option_key ∈ {A,B,C,D}`, unique per version.
- `question_answers` has **one row per version** (PK `question_version_id`) with `correct_option_key ∈ {A,B,C,D}`, NOT NULL.
- There are no multi-correct or numeric types in the schema. `options_type` (`text` / `image`) is about rendering, not the answer type.

**Sweep** of every PUBLISHED / SUPERSEDED / current version (112) for: no answer, more than one answer, key not among the version's options, option count ≠ 4, empty option text.

| Check | Versions |
|---|---|
| Fully valid (4 options A–D with text, one key, key among the options) | **111** |
| **No answer row** | **1** |
| Option count ≠ 4 | 1 (the same version: **0 options**) |
| More than one answer | 0 (impossible: the PK) |
| Key not among the options | 0 |
| Empty option text | 0 |

**The one bad version:**

| Field | Value |
|---|---|
| Question id | `94b30583-2969-493a-80bd-85e179fe1ab4` |
| Version id | `bc0b7703-22a0-4234-933e-9db0029e59b8` (version 1, the only version) |
| Type | single-correct (`options_type = text`) — but **no options and no answer row** |
| Status | `question_versions.lifecycle_status = PUBLISHED`, `is_current = true`; `questions.status = published` |
| Topic | `quantitative-aptitude.algebra` |
| Stem | **"Test question text for SameWeek-Q1 (94b30583)"** — a test fixture, not a real question |
| Created / published | 2026-10-01 12:44:57 UTC (`created_at = published_at`: inserted already published) |
| Created / published by | no actor recorded. `question_version_authoring.origin = LEGACY_UNKNOWN`, no creator, no reviewer — written by the QF-1 backfill (2026-10-12) |
| In mocks / templates | **none** (`mock_questions` 0) |

**Wider finding — test fixtures in the live question bank:**
- **8 PUBLISHED, current questions are fixtures** of the legacy CA-4 forensic suite: stems "Test question text for …" and options "Option A text for …".
- They are `SameDay-Q1 … SameDay-Q7` (4 options each, fixture key **A**) and `SameWeek-Q1` (the keyless one). All were created on 2026-10-01 within seconds of each other.
- **None is used** anywhere: mocks 0, attempts 0, Mistake Vault 0, current-affairs mappings 0, exam mappings 0.
- A pattern sweep found no other test-like PUBLISHED stems (exactly these 8).

**Separate (benign) observation:** question `a03aede9…` is `archived` while its version stays PUBLISHED + current. That is the designed archive state: a published version is immutable, archiving acts on `questions.status`, and the publication guard allows restoring only such a question. It has a valid key and is in no mock.

### 1.2 Grading paths — how a keyless question is treated today

| Path | Code | Keyless behaviour |
|---|---|---|
| **Mock submit / result compile** | `services/assessment.service.ts` `submitAttempt` (~l. 1981 query, l. 2028–2075 loop; service-role reads of `question_answers`) | `correctOptionKey = undefined`, so **any selected option is graded INCORRECT, the negative mark is applied** and the answer is **pushed to the Mistake Vault**. Unanswered = not attempted. The question's marks **still count in max score** (it can never be earned). |
| Mock result review | `assessment.service.ts` l. 2334 | **`correct_option_key || "A"` shows "A" as the correct answer**: a fabricated key (decision #15) |
| Live-test results | `services/live-test-result.service.ts` l. 505 | same **`|| "A"`** fallback |
| Admin question views / errata | `services/admin.service.ts` l. 1460, l. 1728 | same **`|| "A"`** fallback |
| Mistake Vault views | `services/mistake.service.ts` l. 1218, l. 1267 | same **`|| "A"`** fallback (`isCorrect` computed against "A") |
| Mistake drills | `fn_generate_mistake_drill` / `fn_submit_mistake_drill` (085) | **excluded**: only versions with an answer key are drilled (DRILL-1) |
| Premium / dynamic mock generator | `services/premium-generator.service.ts` l. 706 | **skips** versions without a key |
| Adaptive engine | `services/adaptive/adaptive-session.service.ts` l. 731, `adaptive-state.service.ts` l. 239 | key `null`, so every answer is graded incorrect (flagged off: ADAPTIVE) |
| Practice sessions | `fn_generate_custom_practice_session` | filters question `published` + version PUBLISHED / current, but **does not require an answer**: a keyless (here: optionless) question can be served |
| Battles | `fn_find_or_create_battle_room` / `fn_submit_battle_round_answer` | filter question status; grading reads the key (flagged off: BATTLES) |
| CA daily quiz | `services/current-affairs-daily-quiz.service.ts` | eligibility requires current-affairs mappings (none for these fixtures) |

There is **no crash path**. Behaviour is either "graded wrong + negative mark + vault row" or a **fabricated "A" shown as the answer**.

### 1.3 Impact

| Item | Count |
|---|---|
| `mock_questions` referencing the bad version | **0** |
| `attempt_answers` on the bad version | **0** (QA and non-QA alike) |
| `attempt_answers` on **any** keyless version, all time | **0** |
| `mock_questions` referencing **any** keyless version, all time | **0** |
| `test_results` affected | **0** (no attempt contained it) |
| `user_mistake_vault` / `user_mistake_occurrences` rows from it | **0 / 0** |
| Bookmarks, errata, discussions, spaced repetition, battle answers, CA / exam mappings, JSONB / uuid[] references | all **0** |

**No score has ever been affected.** The exposure is latent: practice could serve the optionless fixture, and the 7 complete fixtures could appear in practice as real questions.

### 1.4 Publish paths — who can make a version PUBLISHED / current, and what they validate

| Path | Validates the key today? |
|---|---|
| **`fn_publish_question_version(p_version_id, p_actor)`** (063; SECURITY DEFINER; EXECUTE `service_role` only; called by `services/question-factory/admin-question-factory.service.ts` l. 510) — the only app path to PUBLISHED | **No.** It checks only `lifecycle_status = 'APPROVED'`. It never looks at options or answers. |
| `fn_transition_question_version` → APPROVED | **No** DB check of options / key; it requires the human reviewer checklist only |
| `fn_import_question_drafts` (CSV / AI / manual drafts) | Partially: the answer row is always written (`correct_option_key` NOT NULL + CHECK A–D). **The DB does not check that the key is among the options or that there are 4 options.** The app's TS validator (`services/question-factory/question-validation.service.ts` l. 411–443: exactly 4 options, keys A–D unique, non-empty text, key among the option keys) does. |
| `fn_update_question_draft` / `fn_create_question_revision` | Same: the answer row is written; key membership / option count are not checked in the DB |
| **Direct SQL** with the transaction flag `app.qf_lifecycle_write = 'on'` (any role that can run raw SQL: migrations, seeds, scripts using a DB connection) | **No.** `fn_qf_enforce_question_version_integrity` lets non-DRAFT inserts and lifecycle changes through when the flag is on. |
| **Migration 063 backfill** (QF-1, 2026-10-12) | **No.** It set `lifecycle_status = PUBLISHED` for every legacy version with `published_at` set or a published parent, ran before the triggers existed, and gave each an authoring row `LEGACY_UNKNOWN`. |
| **Legacy direct inserts before QF-1** (no triggers then) | **No** |

**How this one got through:**
1. On 2026-10-01 the legacy **`scripts/test_ca4_forensic_suite.cjs`** inserted test questions straight into the live tables: `questions.status = 'published'`, then a version with `is_current = true, published_at = NOW()`, then 4 options, then the answer `A`. This suite also connects with **TLS verification disabled**.
2. For `SameWeek-Q1` the run stopped after the version insert and before the options / answer inserts (no wrapping transaction), and the suite's cleanup did not remove its own rows. The 7 `SameDay` fixtures from the same run are complete but were also never cleaned up.
3. On 2026-10-12 the QF-1 backfill (063) promoted all 8 to `PUBLISHED`, with no key validation.

### 1.5 Existing constraints / triggers

| Table | Constraints | Triggers |
|---|---|---|
| `questions` | `status ∈ {draft, review, published, archived}`; topic / subtopic FKs to taxonomy nodes | `trg_qf_question_publication_guard` (BEFORE INSERT / UPDATE OF status): `published` only via `fn_publish_question_version` (flag), or restore from archived when the current version is PUBLISHED |
| `question_versions` | `lifecycle_status` 7 values; `chk_question_versions_current_is_published` (`NOT is_current OR PUBLISHED`, **NOT VALID**); unique `(question_id, version_number)`; **one current per question** (partial unique index); difficulty / language / options_type checks | `trg_qf_question_version_integrity` (BEFORE INSERT / UPDATE / DELETE): new versions DRAFT (unless flag); lifecycle changes only with the flag; content frozen outside DRAFT / CHANGES_REQUESTED; PUBLISHED / SUPERSEDED frozen (only PUBLISHED → SUPERSEDED, `is_current` only with the flag); no delete of IN_REVIEW / APPROVED / PUBLISHED / SUPERSEDED |
| `question_options` | key A–D; unique `(version, key)`; FK RESTRICT | `trg_qf_question_options_integrity`: rows editable only while the version is DRAFT / CHANGES_REQUESTED; no delete once IN_REVIEW+ |
| `question_answers` | PK `question_version_id` (one key); key A–D; FK RESTRICT | `trg_qf_question_answers_integrity`: same freeze as options |
| `mock_questions` (consumer) | FK to the version | `fn_qf_guard_mock_question_version`: a new mock row must reference a PUBLISHED current version (**no key check**) |

**Consequence:** a PUBLISHED version's options and answers are **frozen**. The bad version cannot be repaired in place; a correction must be a new version.

## 2. Design (proposal — not built)

### A. Publish guard — migration `087` (QB-KEY-1)

**Rule ("publishable key")** for a version to be (or become) PUBLISHED or current:
- exactly **4** options, keys **A, B, C, D**, each with non-empty text or an image;
- exactly **one** `question_answers` row (already guaranteed by the PK);
- `correct_option_key` is **one of that version's option keys**.

This is the same rule as the app's TS validator. **111 / 112 existing published versions already satisfy it; the only one that does not is the `SameWeek-Q1` fixture.**

**Smallest DB enforcement that covers every path:**
1. `public.fn_qf_assert_version_publishable(p_version_id uuid)`: owner-only, `SET search_path = ''`. It raises `QF_KEY_INVALID: <reason>` with reason `NO_OPTIONS` / `OPTION_COUNT` / `OPTION_EMPTY` / `NO_ANSWER` / `KEY_NOT_IN_OPTIONS`.
2. **Deferred constraint trigger** on `question_versions`:
   - `CREATE CONSTRAINT TRIGGER trg_qf_version_publishable AFTER INSERT OR UPDATE OF lifecycle_status, is_current ON public.question_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW.lifecycle_status = 'PUBLISHED' OR NEW.is_current) EXECUTE FUNCTION fn_qf_version_publishable_trg()`.
   - It calls the assert at **commit time**. That makes it bypass-proof for the `app.qf_lifecycle_write` path, direct SQL, seeds and future backfills.
   - Being deferred, a single transaction that inserts version → options → answer (the legitimate import / seed order) passes. A transaction that leaves a published version without a valid key fails at COMMIT and rolls back entirely.
3. `fn_publish_question_version`: call the assert **before** its updates, for an immediate, clear error in the admin UI. The trigger remains the authority.
4. `fn_transition_question_version` (`p_to = 'APPROVED'`): the same assert, so a reviewer cannot approve a keyless version (early feedback).
5. **Not covered by triggers:** removing options / answers of a PUBLISHED version. That is already impossible (QF-1 child freeze), so no trigger is needed.

**Existing data:**
- The trigger fires only on INSERT or on changes to `lifecycle_status` / `is_current`. Existing rows are not re-validated, so nothing breaks.
- Superseding an old version (`is_current → false`, `PUBLISHED → SUPERSEDED`) does not match the `WHEN` and is not blocked. `SameWeek-Q1` can therefore still be superseded or archived.
- The migration's precondition counts current violations and **expects exactly 1** (the fixture, by id). Any other count → abort.

**Grants:** no new EXECUTE for PUBLIC / anon / authenticated (P-9 unchanged).

**Rollback** `docs/database/rollback/087_rollback.sql`: drop the constraint trigger and the two new functions, and restore `fn_publish_question_version` and `fn_transition_question_version` byte-exactly from their pre-087 definitions (LF; dry-run exact-restore check as in 084 / 085).

**Tests** (`scripts/test_qb_key1.cjs`). DB tests run in rolled-back transactions as simulated admin, plus static checks.

| ID | Test |
|---|---|
| K-1 positive | an APPROVED version with 4 options + key → `fn_publish_question_version` succeeds; the previous current becomes SUPERSEDED |
| K-2 no answer | a DRAFT whose answer row was deleted (allowed while DRAFT) → approve refused `QF_KEY_INVALID: NO_ANSWER`; forcing APPROVED via the flag and publishing → refused |
| K-3 key not in options | a DRAFT with options A–C only + key D → refused `KEY_NOT_IN_OPTIONS` (and `OPTION_COUNT`) |
| K-4 option count / empty text | 3 options, or an option with empty text and no image → refused |
| K-5 every publish path | (a) `fn_publish_question_version`; (b) direct SQL `INSERT … lifecycle_status = 'PUBLISHED'` with `app.qf_lifecycle_write = 'on'` and no answer → fails at COMMIT (checked with `SET CONSTRAINTS ALL IMMEDIATE` in a savepoint); (c) direct UPDATE `is_current = true` with the flag on a keyless version → fails; (d) a valid insert-then-children sequence in one transaction → passes (deferred) |
| K-6 existing data unaffected | all 111 valid published versions untouched; publishing a new revision of an existing valid question supersedes it fine; archiving / superseding `SameWeek-Q1` is not blocked |
| K-7 static | the rollback restores pre-087 bodies exactly; P-9 green; no new grants |

Regression: QF-1 DB / offline suites, DRILL-1, the GAP2-3 FK suite, the RLS P-1 … P-9 suite, TYPES-1.

### B. The existing bad version(s)

Immutability rules: a published version is frozen, so corrections are new versions; deletion of PUBLISHED versions is blocked.

| Option | What | Trade-off |
|---|---|---|
| **B1** owner supplies the correct key → new corrected version (`fn_create_question_revision` → review → `fn_publish_question_version`; mocks re-point per the existing rules) | Normal correction path | **Not applicable here.** The stem is a test fixture with **no options**, so there is no question to key. Inventing options and a key would fabricate content (decision #15). |
| **B2** retire: archive the question (`questions.status = 'archived'`) through the existing admin action `toggleQuestionStatusAction` (`app/admin/actions.ts`; admin / staff; reversible; **writes no audit row** today) | Removes it from practice, drills and battles (they all filter `questions.status = 'published'`); not in any mock | The version itself stays PUBLISHED + current (immutable). Mocks must not pick it — today they do not, and the 087 guard plus the mock guard (Stage 2) add belt-and-braces. |
| B3 delete | — | **Blocked by design** (QF-1: PUBLISHED versions cannot be deleted; FK RESTRICT). Not proposed. |
| B4 supersede with a "withdrawn" placeholder version | — | Would create content just to hide content. Not proposed. |

**Recommendation: B2 for all 8 CA-4 fixtures** (`SameWeek-Q1` and `SameDay-Q1 … Q7`): they are test debris, not real questions.
- How: archive each through the existing admin flow (one action per question; note it writes no audit row) or the same `UPDATE questions SET status = 'archived'` in a migration-free, reviewed data step run as admin. **Owner decides who runs it.**
- Nothing references them, so there is no re-pointing, no recompute and no student impact.
- **Also:** quarantine the legacy `scripts/test_ca4_forensic_suite.cjs` (it disables TLS verification and writes fixtures into live tables). Move it to `scripts/archive/`, like the GAP2-4c legacy suites, so it can never run again. This sits under backlog TEST-CA.

### C. Results already affected

**None.** There are 0 attempt answers, 0 results and 0 vault / occurrence rows on any keyless version, ever. **No recompute is needed.**

For the future, Stage 2 should replace the fabricated `|| "A"` fallbacks (§1.2) with an honest "answer key unavailable" display. Grading should **exclude** a keyless question from both score and max score rather than mark it wrong; the 087 guard should make that case unreachable for new content. Existing rule for corrections (`question_errata_reports` / `fn_revoke_mistakes_by_errata`): a corrected version is published as a new version, and errata revocation handles vault rows. Not triggered here (0 rows).

## 3. Owner decision needed

**The keyless question, shown in full:**

> **Stem:** "Test question text for SameWeek-Q1 (94b30583)"
> **Options:** *(none — the version has no options)*
> **Answer key:** *(none)*
> Topic: Quantitative Aptitude → Algebra · difficulty medium · language en

This is a CA-4 test fixture; **there is no correct key to supply.** The 7 sibling fixtures (`SameDay-Q1 … Q7`, stems "Test question text for SameDay-Qn (…)", options "Option A/B/C/D text for SameDay-Qn", fixture key "A") are equally not real questions.

Decisions requested:

1. **Approve B2:** archive all 8 CA-4 fixture questions (ids in §1.1 / the Stage 2 data step) — or name a different handling.
2. **Who runs the archive:**
   - (a) the owner / an admin in the existing admin UI (8 clicks; this action writes **no** audit row); or
   - (b) a reviewed Stage 2 data step that writes one `admin_audit_logs` row per question and rolls back on any mismatch (recommended, for the audit trail).
3. **Approve migration 087** (the publish guard, §2.A) and the grading / display hardening (no "A" fallback; keyless = excluded from score) for Stage 2.
4. **Approve quarantining** `scripts/test_ca4_forensic_suite.cjs`.

## 4. Stage 2 plan (after the decisions)

1. **Data:** archive the 8 fixtures per decision 2 (counts before / after; only these 8 ids change; no other table touched).
2. **Migration 087:** `fn_qf_assert_version_publishable`, the deferred constraint trigger, the asserts in `fn_publish_question_version` and `fn_transition_question_version` (APPROVED), the precondition (exactly the known violator), rollback 087.
   - Workflow: backup → dry-run (087 + rollback exact-restore, LF) → apply via the ledger → db:types.
3. **Readers:**
   - remove the `|| "A"` fallbacks (assessment, live-test, admin, mistake services): show "Answer key unavailable", never a fabricated key;
   - grading: a keyless question is excluded from score and max score, with no vault row;
   - optional: `fn_generate_custom_practice_session` requires an answer row. That is a function change and could ride with 087.
4. **Tests:** `scripts/test_qb_key1.cjs` K-1 … K-7, plus a static check for no `correct_option_key || "A"`. Add it to PERMANENT_GATES. Live parts run through `scripts/live/with-server.cjs` where a server is needed (the DB tests need none).
5. **Quarantine** `scripts/test_ca4_forensic_suite.cjs` → `scripts/archive/` (excluded from gates).
6. **Regression:** QF-1, DRILL-1, the RLS suite (P-9), TYPES-1, GAP2-3, SEC-1B/1C/1D, signed-in smokes (local, via the runner), the anonymous production smoke after deploy.

QB-KEY-1 Stage 1 status: COMPLETE-AWAITING-DECISION
