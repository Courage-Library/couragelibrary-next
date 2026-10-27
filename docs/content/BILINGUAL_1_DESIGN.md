# BILINGUAL-1 — one current published version per LANGUAGE per question (design only)

**Status: DESIGN — no migration, no code change.** Written 2026-10-27 at the architect's request.

The facts below come from a read-only survey of the migrations and the app. "087" etc. are migration numbers.

## 1. The problem

A question is `questions` → `question_versions` (one row per version, `language` ∈ en | hi) → `question_options` / `question_answers`, keyed by `question_version_id`.

Today:
- `uq_question_versions_one_current` (063) allows **one** current version per question.
- `fn_publish_question_version` (087) sets `is_current = false` on every other current version of the question (PUBLISHED → SUPERSEDED). It has **no language filter**.

So publishing a Hindi version of a question replaces its English version. Two live languages of one question are impossible. This conflicts with:
- **R9**: learning content in English / Hindi by the user's preference;
- **LANG-VERSIONS-1**: language versions, the same need for articles;
- the ruling that EN / HI are **language versions of ONE question**.

The app is partly ready already:
- practice (`lib/practice/server.ts` + `engine.ts chooseVersion`) already picks the preferred language among current versions, falling back to en, then any;
- guides already fall back from hi to en;
- the Focus review "Hindi / English version linked" auto check already looks for a sibling version of the same question.

## 2. Target model

- **One question = one item.** It holds the topic, difficulty, the meaning of the answer, analytics and the Mistake Vault entry (the vault is already keyed by `question_id`).
- **Language versions = versions of that question with a different `language`.** No separate pairing table: the pair *is* "the same `question_id`". A version's history is per language: EN v1 → EN v3, HI v2 → HI v4 (`version_number` stays unique per question).
- **Invariant 1:** at most one current PUBLISHED version **per (question, language)**. New unique index on `question_versions (question_id, language) WHERE is_current`. The check constraint `NOT is_current OR lifecycle_status = 'PUBLISHED'` stays.
- **Invariant 2 — answer parity.** All current versions of a question must agree on:
  - the correct option key;
  - 4 options with keys A–D, in the same order (order_index).

  This makes any language version score the same. It is enforced in the DB by a deferred constraint trigger on publish / `is_current`, next to `trg_qf_version_publishable` (087). The app re-checks it as a Focus review auto check.
- **Publish:** `fn_publish_question_version` supersedes only the current version **in the same language**. If an EN revision **changes the answer key**, publishing it alone would break parity. The HI version must then be revised too, and the two published together through a new atomic `fn_publish_question_versions(uuid[])` (all or nothing; same guards, same audit).
- **Creating a translation:** a new `fn_create_question_language_version(p_question_id, p_language, p_payload, p_actor)` creates a DRAFT version in the other language. It is service-role only (REVOKE from anon / authenticated, SECDEF ratchet). It runs the same five gates (G5 de-duplication is per language) and goes through the normal review (Focus review shows both languages). Content-import pairing (e.g. the 4 PAIR_CANDIDATE rows) uses this function only after a human confirms the pair, never automatically.

## 3. Which version a student sees

`user_profiles.language_preference` ∈ en | hi | hinglish (091; `fn_save_onboarding`). `contentLanguage()` maps hi → hi, everything else → en.

**Rule `serveVersion(question, preference)`:**
1. the current version in the preferred content language;
2. else the current **en** version;
3. else any current version (e.g. a Hindi-only SSC GD question for an English user), marked "Shown in Hindi — English version not available yet". Signed-out users get en.

The UI copy stays English-only (R9); only the content changes language.

**Mocks:**
- `mock_questions` stays pinned to one version per slot: the author's "primary" version, used for composition and the mock guard (087).
- At play time the player shows the student's language sibling of that slot (same question, current, servable). Like the real SSC CBT, the student may switch the language per question during the attempt.
- `attempt_answers.question_version_id` stores the version actually answered (already NOT NULL, version-keyed).
- Scoring (`fn_evaluate_live_test_event`, 047, joins `question_answers` by version) is unchanged and correct, because of the parity invariant.
- Review and results read the answered version.

## 4. Impact on code — readers that assume ONE current version

| Reader | Today | Change |
|---|---|---|
| `fn_generate_custom_practice_session` (087) | joins `is_current`, no DISTINCT → 2 rows per question | `DISTINCT ON (question_id)` with the preferred language first |
| `fn_generate_mistake_drill` (087:531) | one row per current version → duplicates | same `DISTINCT ON` + preference |
| `fn_get_active_battle_round` (029:143) | `is_current LIMIT 1` (arbitrary) | prefer the player's language, then en |
| `fn_record_mistake_occurrence` fallback (065) | `is_current … LIMIT 1` | prefer en (the caller should always pass the version) |
| `lib/practice/report.ts:38` | `.eq(is_current).maybeSingle()` → error with 2 rows | pass the reported version id (already known) |
| `lib/practice/server.ts servableByTopic` | `!inner` embed → duplicate question ids | de-duplicate by question |
| `services/assessment.service.ts:1506`, adaptive selection / remediation, admin-adaptive, CA daily quiz, context builder | `is_current` + first row | `serveVersion()` (one shared helper) |
| `services/mistake.service.ts` (1049 / 1091 / 1232 / 1769 / 1923) | embeds all versions and takes `[0]`: **an existing bug** (can show a superseded version) | the current version via `serveVersion()`; fix independently of BILINGUAL-1 |
| `premium-generator` | filters `language = 'en'` explicitly | keep; add the fallback |

**Already correct:**
- version-scoped: `fn_check_practice_answer`, `fn_memory_lock_answer` (both already record the language), `fn_submit_mistake_drill`;
- `EXISTS` checks in RLS / servable / battle / guard functions;
- `fn_submit_battle_round_answer` (scores by option id);
- the mock player, results and review (version-pinned);
- candidate RLS (PUBLISHED / SUPERSEDED readable).

**Analytics** (difficulty, accuracy) aggregate per `question_id` across languages. The Mistake Vault stays per question, so a student who missed a question in Hindi sees the same vault item in English.

## 5. Migration plan (when approved)

All steps follow the runbook: backup → dry-run → apply → ledger; LIVE-LOCK-SAFETY; never BEGIN / COMMIT inside the file.

1. **Pre-checks (abort if any fails):**
   - no question has more than one current version (true today: 112 PUBLISHED, all en);
   - every current version has 4 options A–D and a key.
2. **Index:** create `uq_question_versions_one_current_per_language (question_id, language) WHERE is_current`, then drop `uq_question_versions_one_current`. One short lock on one table; the table is small.
3. **Parity:** `fn_qf_assert_language_parity(question_id)` + a deferred constraint trigger on `question_versions` (fires when status becomes PUBLISHED or `is_current` is set).
4. **Publish:**
   - redefine `fn_publish_question_version` to supersede only the same language. `v_previous` stays a single id (at most one row per language).
   - add `fn_publish_question_versions(uuid[], actor)` (atomic).
   - add `fn_create_question_language_version`.
   - grants: service_role only; REVOKE from public / anon / authenticated; update the SECDEF ratchet.
5. **SQL readers:** redefine the 4 functions in §4 with a `p_language` argument (default 'en'), keeping the old signatures as wrappers so no caller breaks.
6. **App:** in the same release, behind `BILINGUAL_SERVING` (default OFF): `serveVersion()` helper, the readers in §4, the player language switch, the Focus review parity check. With the flag off and no Hindi siblings, behaviour is identical to today.

**Rollback** (`docs/database/rollback/BILINGUAL_1_rollback.sql`):
- **Before any second-language version is published:** restore the saved function definitions (`pg_get_functiondef` captured at apply), recreate `uq_question_versions_one_current`, drop the new index, trigger and functions. This is lossless.
- **After:** the rollback first demotes, per question, every current non-primary-language version (keeping en) to SUPERSEDED, recording each id in a rollback log table, then does the same steps. Those versions stay readable; it is reversible by re-publishing.

## 6. Tests

- **Offline:**
  - `serveVersion()` table: hi pref / en pref / hinglish / signed out × {en only, hi only, both};
  - the parity checker (same key; different key; option count; option order);
  - static: every reader in §4 uses the helper or `DISTINCT ON`; the new functions are REVOKEd from anon / authenticated.
- **DB smokes (rolled back, real roles — REAL-ROLE VERIFY):**
  1. Publish HI does not supersede EN; both stay current.
  2. Publish EN v2 supersedes EN v1 only.
  3. A key mismatch fails at commit (parity trigger); the atomic two-version publish succeeds.
  4. As a student, a mock attempt answered in HI is scored with the HI key equal to the EN key; `attempt_answers` holds the HI version.
  5. Custom practice and mistake drill return each question once.
  6. Anon / student cannot execute the new functions (42501).
  7. Candidate RLS still shows only PUBLISHED / SUPERSEDED.
- **Live (flag on, local):** practice / mock / review in a Hindi profile shows Hindi with English fallback; axe stays clean.

## 7. Decisions for the architect / owner

1. **Hinglish:** treat as en (as today) or as "en with Hindi glossary"? Proposed: en.
2. **Fallback labelling** wording, and whether an English user should ever be served a Hindi-only question (proposed: yes, labelled, because SSC GD content is mostly Hindi).
3. **Key change:** an EN key fix always requires the paired HI revision and an atomic publish (proposed), or the HI version is automatically demoted until revised.
4. **Mocks:** a per-question language switch in the player (like SSC CBT; proposed), or the language fixed at the start of the attempt.
5. **Order:** BILINGUAL-1 before any Hindi pairing work (TAXONOMY-HINDI-1, the PAIR_CANDIDATE rows), and together with LANG-VERSIONS-1 for articles.
