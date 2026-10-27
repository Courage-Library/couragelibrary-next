# CONTENT-IMPORT-1 — SSC GD 2025 PYQ CSVs → canonical bank

## COMMIT (2026-10-27, after ruling B)

**Gate 4 ruling B** (`QuestionTaxonomyResolver.resolveExamSlug`): past-paper provenance accepts any EXISTING exam, active or not, the same as `fn_import_question_drafts`. A target exam (mapping / visibility) still needs an ACTIVE exam (`getActiveExamById`, unchanged).
- QF-1 offline G4 tests: an inactive existing exam resolves, an unknown slug does not, there is no `is_active` filter for provenance, and the target-exam rule is unchanged. QF-1 is 79/79.
- SSC GD stays inactive for students.

**Safety steps:**
- backup `pre-content-import-1-2026-10-27T04-35-28` (public + auth data) verified;
- 0 open own DB sessions before and after;
- writes only through the existing RPCs (`fn_import_question_drafts`, `fn_transition_question_version`), in 43 batches of ≤ 25;
- the tool's own count queries ran READ ONLY under LIVE-LOCK-SAFETY (lock 3 s, statement 60 s, idle 30 s).

| | Predicted (what-if dry-run) | Committed |
|---|---|---|
| Imported (new questions + versions, DRAFT) | 689 | **682** |
| → IN_REVIEW (Focus review queue) | 635 | **629** |
| → stay DRAFT, flagged (reason in `authoring_metadata.importInfo`) | 54 | **53** (near-duplicate 44 · NEEDS_FIGURE 6 · possible EN/HI pair 4 — kept as SEPARATE drafts, not paired) |
| Rejected at commit by gate 5 | — | **7** — duplicates the dry-run could not see: its chunks were checked against a bank that did not yet hold the earlier chunks. 5 exact, 2 near-duplicates of rows written earlier in the same run. Correctly not imported. |
| Published | 0 | **0** (published count unchanged at 112) |

**DB counts, before → after:**

| Count | Before | After |
|---|---|---|
| question_versions | 113 | 795 |
| questions | 113 | 795 |
| question_import_batches | 2 | 45 |
| admin_audit_logs | 244 | 916 (= 629 IN_REVIEW transitions + 43 `QF_IMPORT_DRAFTS` batch rows) |
| question_sources | 0 | 682 (PYQ: SSC GD Constable, 2025, date / shift not recorded) |
| IN_REVIEW | 0 | 629 |
| DRAFT | 1 | 54 |
| PUBLISHED | 112 | 112 |

**REAL-ROLE VERIFY:**

| Data | service role | anon | qa-student |
|---|---|---|---|
| IN_REVIEW / DRAFT versions | sees all | 0 | 0 |
| Draft / review questions | sees all | 0 | 0 |
| `question_answers` | readable | refused | refused |
| `question_version_authoring` | readable | refused | refused |
| `question_sources` of unpublished questions | readable | 0 | 0 |
| Options | readable | published only (444) | published only (444) |
| PUBLISHED versions | 112 | 112 | 112 |

The student cannot update versions or call `fn_transition_question_version`, and anon cannot call `fn_import_question_drafts` (all 42501).

**Idempotency:** see the re-run line at the end of this report.

**Content health after the import:** published per subject is unchanged; the IN_REVIEW counts are new.
- Rows are every exam with ≥ 1 question in any state.
- SSC GD Constable is marked "not live".
- The GD past-paper questions also count under SSC CGL, because their canonical topics are in the CGL syllabus (membership rule: mapping OR past-paper source OR syllabus topic). **Ruling needed:** keep, or count past-paper questions only under their source exam.

| Exam | Quant | Reasoning | English | GK / GA |
|---|---|---|---|---|
| SSC CGL | 27 (+179 in review) | 25 (+127) | 26 (+149) | 25 (+174) |
| SSC GD Constable (not live) | 0 (+179) | 0 (+127) | 0 (+149) | 0 (+174) |

---

## Dry-run (before the ruling)

**Status then: COMMIT HELD for one ruling (gate 4, below).** Nothing was written: the question_versions, questions,
import batches, audit and question_sources row counts were identical before and after both runs (113 / 113 / 2 / 243 / 0).

- **Tool:** `scripts/content/content-import-1.cjs` (dry-run by default). It reads `D:\Courage Library\csv` (CONTENT-SOURCE-1 S1) read-only.
- **Import path:** the EXISTING `QuestionCsvImporterService` → five quality gates → `fn_import_question_drafts`.
- **Per-row reports** (with question text) are outside the repo, in `E:\CourageLibrary-Backups\content-import-1\`.
- **Topic mapping:** `scripts/content/content-import-1.topic-map.json`, exact names only (unmapped = skipped, never guessed).

## Result

1,283 CSV lines = 1,215 data rows + 68 embedded header rows.

| | Now (gate 4 as is) | What-if (gate 4 accepts the inactive SSC GD exam) |
|---|---|---|
| Would import | **0** | **689** |
| → IN_REVIEW (enter Focus review) | 0 | **635** |
| → stay DRAFT, flagged | 0 | **54** (near-duplicate 45 · NEEDS_FIGURE 6 · EN↔HI pair candidate 4 — some rows carry 2 flags) |
| Rejected by gate 4 (PYQ exam not resolved) | **689** | 0 |

**Skipped in both runs, by reason:**

| Reason | Rows |
|---|---|
| UNMAPPED_SUBJECT: `Hindi.csv` (the Hindi-language paper; the taxonomy has no Hindi subject) | 240 |
| UNMAPPED_TOPIC (no exact canonical topic): Comprehension, Awards & Honours, Current Affairs, Books & Authors, Simplification, Seating Arrangement, Mirror Image, Venn Diagram, Paper Folding, Missing Number, Figure / Alpha / Alphabet Series, Mathematical Operations, Dice | 158 |
| NEEDS_FIGURE_OPTIONS (image options; images never fetched) | 46 |
| DUPLICATE_IN_IMPORT_BATCH (exact or near-duplicate stem within the import) | 32 |
| SHIFTED_OR_INVALID_KEY (column-shifted rows; not auto-repaired) | 20 |
| EXPLANATION_MISSING_OR_SHORT (< 40 chars; the import function requires ≥ 40) | 15 |
| DUP_IN_SOURCE (exact stem + options repeated in the CSVs) | 11 |
| OPTION_TEXT_DUPLICATE (two identical options) | 3 |
| THIRD_PARTY_MARKER (publisher / site text) | 1 |

**Duplicates of the existing bank (the 113 CGL questions): 0.**

**What-if import by subject:**

| Subject | IN_REVIEW | Imported, by language |
|---|---|---|
| English Comprehension | 154 | 173 en + 6 hi |
| General Awareness | 174 | 28 en + 147 hi |
| Quantitative Aptitude | 179 | 36 en + 159 hi |
| General Intelligence and Reasoning | 128 | 26 en + 114 hi |

## Rules applied

- **Official questions only:** every row is marked SSC GD 2025 PYQ. The date and shift are not in the source and are recorded as "not recorded". The 1 row with a publisher / site marker was skipped.
- **Explanations:** the legacy Courage Library ones, marked "to verify in review" in `authoring_metadata.importInfo`. Rows without a usable one were skipped (see the HOLD below).
- **De-duplication:** exact stem + options inside the source; the bank checksum and near-duplicates via gate 5. A re-run imports 0 rows, because gate 5 finds every row already in the bank.
- **EN / HI:** language comes from the script (the CSV label is wrong for 194 + 40 rows). The CSVs contain **no** real translation pairs. 4 numeric-fingerprint coincidences are flagged PAIR_CANDIDATE, never paired automatically.
- **NEEDS_FIGURE:** image URLs are dropped and never fetched. Text-only rows that mention a figure stay DRAFT, flagged.
- **Flags and reasons:** stored per item in `authoring_metadata.importInfo` (a server-side importer option, not part of the item contract; no gate changed).
- **Nothing is published.** The commit only moves clean items DRAFT → IN_REVIEW, through `fn_transition_question_version`, with an audit row.

## Needs a ruling

1. **Gate 4 vs the inactive SSC GD exam (blocks the whole import).**
   - The provenance gate resolves a PYQ's exam only if it is **active** (`resolveExamSlug`). SSC GD Constable is inactive.
   - The SQL import function itself accepts any existing exam for provenance (and the import maps no exam).
   - **Options:**
     - **A** — the owner activates SSC GD;
     - **B (recommended)** — amend gate 4 to accept an *existing* exam for PYQ provenance whether or not it is active, matching the SQL function. Exam visibility rules stay unchanged.
   - Not changed without a ruling.
2. **The 60 legacy practice questions (S2) with answers: HELD.**
   - They have no explanations, and the existing import function rejects an explanation under 40 characters, so "empty + flagged" is not possible through it.
   - Options: **(a)** we write the explanations (then they go through the normal path); **(b)** a migration allows an empty explanation for DRAFT only (publish would still require one). They also need an HTML parser.
3. **Bilingual model (for later).**
   - Publishing a version supersedes **every** other current version of the question, whatever its language. Two live languages of one question are therefore impossible today.
   - Not needed for this batch (no pairs). Any EN + HI pairing needs a migration first (proposed **BILINGUAL-1**: one current version per question *and language*).
4. **The 240 Hindi-paper rows:** a "Hindi" subject would have to be created in the taxonomy first (owner / syllabus decision).

**Content health after the import:** unchanged at this point (nothing was written). Only published questions count, and the import publishes nothing.

## Idempotency re-run (after the commit)

A fresh dry-run over the same CSVs: **0 rows would import**. All 689 previously importable rows are now duplicates of the bank (gate 5). The DB counts before and after were identical: 795 versions · 795 questions · 45 batches · 916 audit rows · 682 sources · 629 IN_REVIEW · 54 DRAFT · 112 PUBLISHED.

Those "before" counts equal the post-commit counts, which also shows that the local Focus / Today captures taken in between wrote nothing. During capture, the only non-GET requests were the read-only `qfGetFocusItemAction` loads.
