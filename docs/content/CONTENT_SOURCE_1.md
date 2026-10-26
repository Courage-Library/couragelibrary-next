# CONTENT-SOURCE-1: Inventory of local legacy exam-content sources

> **Read-only; nothing copied.** No database or network service was contacted. The legacy Supabase project was not touched. No `.env*` file or secret was opened. This file is the only thing written. Counts come from small read-only parsers (CSV/HTML/DOCX/PDF text, counts only) run from a scratch directory.

- **Date:** 2026-10-26
- **Scope searched:** `E:\` top-level folders, `E:\Courage Library` (`content/`, `data/`, `seed_data/`, `scratch/`, `public/`), and, by bounded filename search, `C:\Users\hp\{Documents, Downloads, OneDrive, PycharmProjects}`. **`D:\` was also searched,** because the legacy app and the main question banks turned out to live there and not on `E:`.
- **Target schema (reference only):** `questions` → `question_versions` (`language` ∈ `en|hi`, `options_type` ∈ `text|image`, `lifecycle_status`, `content_checksum`) → `question_options` / `question_answers` (server-only); `question_sources` (`source_type` ∈ `PYQ|Model_Paper|Official_Sample|Original`, year, shift, paper_code); `question_import_batches` + `question_version_authoring` (`origin`, `import_batch_id`); taxonomy `canonical_taxonomy_nodes`; QF-1 entry point `fn_import_question_drafts` (DRAFT only, five gates, checksum de-dup).
- **Baseline (from `docs/payments/F9_DESIGN.md` §6):** the live DB has SSC CGL only: 2 full mocks, 6 sectional, 103 published questions, 0 PYQ papers, 0 articles, 0 CA.

---

## 1. Summary table

"Q" = questions. "—" = not applicable. Counts are exact unless marked "≈" or "unknown".

| # | Source (short path) | Format | Q | Q with answer | Q with explanation | Mocks / sets | Articles | CA | Language | Coverage | Main flags | In new repo? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | `D:\Courage Library\csv\*.csv` (5 files) | CSV (legacy `questions` import shape) | **1,215** data rows (+68 embedded header rows) | 1,195 with valid key A–D (20 column-shifted) | 1,215 | — | — | — | 876 Devanagari stems / 339 Latin; `language` label unreliable | **SSC GD 2025 PYQ**: Reasoning 255, GA 240, QA 240, English 240, Hindi 240 | 20 exact dups (stem + options); 89 repeated stems; 20 shifted rows; 232 image URLs on **legacy** storage | No |
| S2 | `D:\Courage Library Blog\SSC CGL\` (legacy static site, git, 265 commits) | HTML pages + JS (data came from the legacy DB) | 1,461 inline practice Q (1,409 distinct) | 60 with an "Answer:" line | ≈ 0 (8 pages have "Explanation:") | 10 mock-engine pages (no embedded Q) | **870 pages** | 9 MTS "current-affairs" pages (static) | EN (14 pages contain Devanagari) | SSC CGL 233, SSC GD 113, SSC MTS 166, Army Agniveer GD 115, Delhi Police 231, Blog 11, Vocab 1 | 1,993 `<img>` refs, 572 missing locally; inline Q mostly unanswered | No |
| S3 | `D:\Courage Library\PYQ Questions\` | PDF (173 files, ≈ 440 MB) | unknown (not extracted) | unknown | unknown | 173 papers / compilations | — | — | EN + HI (one HI set is legacy-font, not Unicode) | SSC GD 2025 (84), Army Agniveer GD (46), Navy MR/SSR 2025 (20), UP Police 2024 (10), **SSC CGL 2018–2024 (13)** | third-party watermarks / publisher compilations; scanned pages need OCR | No |
| S4 | `D:\CL\SSC\` | DOCX (232 notes) | ≈ 693 numbered items (mostly not MCQs) | 35 "Answer" markers | 20 markers | — | **232 note docs** | — | EN (1 file has Devanagari) | English grammar 27, GA 155, Quant 50 (SSC) | no images; provenance unknown | No |
| S5 | `E:\Courage Library\scratch\` snapshots (git-ignored) | JSON | 10 (`pilot_selection.json`) + 5 sample rows | 10 / 5 | 10 / 5 | — | — | — | HI | UP Police 2024 (Hindi) | snapshot of the **legacy DB**; also holds user sample rows (personal data), so do not reuse | Local only, ignored |
| S6 | `E:\Courage Library\seed_data\` | JSON seed (tracked) | 1 | 1 | 1 | 1 mock (metadata only) | 1 article stub, 1 flashcard | — | EN | SSC CGL Reasoning (analogy) | demo seed; plan list is stale | **Yes** |
| S7 | `E:\Courage Library\data\syllabus-drafts\ssc-cgl-tier1.v1.json` | JSON (syllabus contract) | — | — | — | — | — | — | EN | SSC CGL Tier 1: 4 sections, 36 units, 36 topics | taxonomy target, not content | **Yes** (published 2026-10-17) |
| S8 | Downloads misc (`CCC_Questions.docx`, `Introduction_to_Computer_Hindi_MCQs.docx`, `21. Trains and Boats_*.docx` ×3, `22 Analytical Reasoning.ppt`, 3 CCC PDFs) | DOCX / PPT / PDF | ≈ 105 + 50 + 5 markers | 0 detected | 0 | — | — | — | EN / HI | CCC (computer course, not SSC), one Quant handout, one reasoning deck | unknown / third-party provenance; out of scope | No |
| S9 | `E:\CourageLibrary-Backups\` (247 MB) | `pg_dump` (73) + per-table NDJSON (4,323) + logs | — | — | — | — | — | — | — | backups of the **new dev DB** (pre-076 … pre-107) | **not a content source** (dump of our own DB; includes auth data) | — |

**Checked and found no exam content:** `E:\CNTS` (school-partnership marketing), `E:\CL Automation` and `D:\Courage Library\Automation` (social-post and "MockDaily" graphic generators with no embedded question arrays), `E:\CL-SSL` (a CA certificate only), `E:\Projects`, `E:\My Space - Learning` (startup lecture notes), `E:\Founder Usefull`, `E:\Courage Library\Claude outputs` (design previews), `E:\Courage Library\public\` (logo and email assets), `E:\Courage Library\content\*.ts` (UI copy), `D:\Courage Library\CL - DCC\*.xlsx` (posting and mock schedules, no Q), `OneDrive\Desktop\Courage Library Web` (old marketing site), and `PycharmProjects`. `E:\courage-national-talent-search-app` is a separate school talent-search product (one `SampleQuestions` marketing component), out of scope. The five Downloads "Reasoning … .zip" files and `courage-library-dashboard.zip` are **empty** (1 KB). `Downloads\exam_categories_rows.csv` / `exam_patterns_rows.csv` are 2–3-row legacy exports with no questions. `OneDrive\Documents\SSC.docx` (75 KB) could not be read (permission denied, probably OneDrive online-only), so its content is **unknown**.

---

## 2. Per-source detail

### S1. Legacy question CSVs: `D:\Courage Library\csv\` (the main local question bank)
- **Files:** `English.csv` 128 KB, `GA.csv` 193 KB, `Hindi.csv` 212 KB, `QA.csv` 159 KB, `Reasoning.csv` 256 KB. UTF-8, no mojibake detected.
- **Shape:** the legacy `questions` table columns `question_text, options (JSON {A,B,C,D}), options_type, correct_answer, difficulty, topic, explanation, category_id, pattern_section_id, question_image, pyq_year, pyq_source, is_active, language`. These are the batch files for the legacy admin's "AI prompt → CSV validator → import" tool (`admin/bulkImport.html` in S2).
- **Counts (header rows removed):**

| File | Rows | Valid key A–D | Explanation | Distinct stems | Exact dup (stem + options) | Devanagari stem | Images |
|---|---|---|---|---|---|---|---|
| English | 240 | 220 (20 rows column-shifted: `options_type` holds a letter) | 240 | 221 | 3 | 21 | 0 |
| GA | 240 | 240 | 240 | 240 | 0 | 200 | 0 |
| Hindi | 240 | 240 | 240 | 207 | 2 | 240 | 0 |
| QA | 240 | 240 | 240 | 240 | 0 | 200 | 0 |
| Reasoning | 255 | 255 | 255 | 218 | 15 | 215 | 46 image-option rows; 232 URLs on legacy storage |
| **Total** | **1,215** | **1,195** | **1,215** | 1,126 | **20** | 876 | 232 URLs |

- **Options:** every data row parses as JSON with exactly 4 non-empty options. 0 HTML. 5 rows contain LaTeX-like markup.
- **Topics:** Reasoning 17 (Coding-Decoding 51, Number Series 39, Analogy 31 …); QA 10 (Ratio & Proportion 40, Profit & Loss 36, Number System 34 …); GA 9 (Economy 44, *"Current Affairs" 38*, History 35, Polity 28 …); English 8 (Fill in the Blanks 75, Error Spotting 38 …); Hindi 11 (Hindi-language grammar topics, despite English-style topic names).
- **Difficulty:** all three levels are used (easy / medium / hard).
- **Provenance:** every data row is labelled `pyq_source = "SSC GD"`, `pyq_year = 2025`. That says these are SSC GD Constable 2025 PYQs, apparently transcribed from the S3 PDFs via an external AI. Paper date and shift are **not** recorded per row. Explanations are presumably AI-written and need review.
- **Language:** each file has 40 rows labelled `english`, and the rest are labelled `hindi`. In `English.csv`, 179 rows labelled `hindi` are Latin script. In `Hindi.csv`, 40 rows labelled `english` are Devanagari. **The language label cannot be trusted. Detect script instead.** Whether the 40 English rows are translations of Hindi rows is unknown.
- **Images:** the reasoning figures exist **only on the legacy project's storage**. No local copies were found.
- **Relation to the legacy DB:** the legacy DB held 4,050 questions (per `scratch/phase7f2_migration_baseline.json`), so these CSVs are a subset at most. The legacy DB also holds UP Police 2024 Hindi rows (S5) that are not in these CSVs. No local export of the full 4,050 exists.

### S2. Legacy app / site repo: `D:\Courage Library Blog\SSC CGL\` (this is the "legacy SSC CGL repo")
- **What it is:** a static HTML + Tailwind site with vanilla-JS engines (`js/examEngine.js`, `resultEngine.js`, `adminQuestions.js` …), the legacy admin (`admin/*.html`, including the CSV bulk import), coaching pages, Supabase edge functions (rewards/referrals), and git history (265 commits, last 2026-10-13). Questions and mocks were **served from the legacy DB** (`from('questions')`, `scheduled_exams`). The repo holds **no question-bank files**.
- **Articles (study notes):** 870 HTML pages. `ssc-cgl/` 233 (GA 156, Reasoning 28, Quant 25, English 24), `ssc-gd/` 113, `SSC MTS/` 166 (including 9 "current-affairs" and 8 computer pages), `defence/army-agniveer-gd/` 115, `delhi-police/` 231, `Blog/` 11, `Vocabulary Development/` 1. Rich HTML with 2,488 `<table>` elements. One page has math markup. 14 pages contain Devanagari.
- **Inline practice questions:** 1,461 "Q1." style items across 120 pages (1,409 distinct by normalized stem; 8 shared across exam folders; 44 repeats within folders). Only **60** have an "Answer:" line near them, almost all in `ssc-cgl/english-language`. Options are usually one inline "Options: (a) … (d)" line. **Not import-ready.** At most these could become drafts that need answers written.
- **Images:** 1,993 `<img>` refs, all relative. **572 point to files missing locally** (MTS 200, defence 206, Delhi Police 156, CGL 9, GD 1). `images/` holds 311 topic diagrams (304 png, 7 jpg).
- **Provenance:** looks self-authored (site content by the owner's team; authoring tools unknown). Diagrams have no recorded source. Licensing is **unknown**, so the owner must confirm.
- `supabase/.temp/` holds legacy project CLI metadata. It was not opened beyond the file listing.

### S3. PYQ paper PDFs: `D:\Courage Library\PYQ Questions\` (173 files)

| Folder | Files | Size | Text layer | Notes |
|---|---|---|---|---|
| SSC GD 2025 / English | 42 | 37 MB | yes | one per date/shift (4–25 Feb 2025); one sample shows a coaching-site watermark |
| SSC GD 2025 / Hindi | 42 | 37 MB | yes (Unicode Devanagari) | morning/afternoon/evening shifts; one hash-named duplicate-looking file |
| SSC CGL / English M | 6 | 3.7 MB | yes | "30 Yearwise SSC CGL Solved Paper" 2018, 2019, 2021–2024; **commercial publisher compilation** (publisher names in the text), with answers in the sample |
| SSC CGL / Hindi M | 7 | 5.3 MB | **legacy (non-Unicode) font**: 0 Devanagari code points | same series, 2018–2024; needs font conversion or OCR |
| Army Agniveer GD | 46 | 40 MB | sparse (≈ 4.8 K chars for 39 pages in the sample) | mostly scanned, so OCR is needed |
| Navy MR / SSR 2025 | 20 | 155 MB | yes | "Memory-Based Paper" with a **commercial test-prep watermark**; 7 are "(1)" duplicate copies |
| UP Police Constable 2024 | 10 | 161 MB | partial | file names say "Official Paper"; the text carries commercial test-prep and publisher watermarks |

- Question counts are **unknown**. Nothing was parsed beyond text-layer statistics. The official question *content* of SSC/UPP papers is public-exam material, but **these specific files are third-party reproductions** (watermarks, solutions, formatting), and memory-based papers are third-party reconstructions. See the licensing gate in §5.
- **SSC CGL relevance:** only the 13-file CGL compilation, for Tier 1 2018–2024. The live CGL exam has 0 PYQ papers (F9 §6).

### S4. Study notes: `D:\CL\SSC\` (232 DOCX)
- English Grammar 27 (`CL1.1.x` topics: synonyms … phrase replacement), General Awareness 155 (`CL1.x`: history, art and culture …), Quantitative Aptitude 50. ≈ 718 K characters, no embedded images, 1 file with Devanagari.
- Mostly prose notes. Numbered items (≈ 693) are mostly list points, not MCQs: only 61 option-style lines, 35 "Answer" markers, 20 "Explanation/Solution" markers.
- These are **article / learning-document** candidates, not a question bank. Provenance is unknown (the "CL" numbering suggests in-house).

### S5. Legacy-DB snapshots in `E:\Courage Library\scratch\` (git-ignored)
- `legacy_raw_inventory.json`: legacy table counts (questions 4,050; exam_categories 8; scheduled_exams 32; attempts 536; user_profiles 150 …), column lists, and 5 sample rows per table. **It contains personal data in the user samples. Do not use it as a source.**
- `pilot_selection.json`: 1 category, 1 scheduled exam, 10 questions (Hindi, UP Police 2024, all with key and explanation).
- `phase7f2_migration_baseline.json`: a dry-run plan from 2026-08-26 to migrate all 4,050 legacy questions, 8 categories → 14 subjects / 131 topics, and 32 mocks. There is **no evidence it was executed**: the new DB baseline then held 77 questions, and FOUNDER_BRIEF lists the 4,050 as "legacy unvalidated". The file contains the legacy project's URL. It is git-ignored, but it should never be committed.
- `backup_user_*.json`: one user's wallet/ledger/attempts backup. **Personal data, not content.**

### S6–S7. Already in the new repo
- `seed_data/`: 1 question (SSC CGL reasoning analogy, EN, key + explanation), 1 mock metadata row, 1 article stub, 1 flashcard, 3 taxonomy categories, 2 plan rows (stale against F9-B pricing). Its stem is in neither S1 nor S2.
- `data/syllabus-drafts/ssc-cgl-tier1.v1.json`: the SSC CGL Tier 1 syllabus (4 sections / 36 units / 36 topics). This is the taxonomy target for mapping.
- The 103 live published questions are **not present as local files**. Overlap with them cannot be computed offline (see §3).

---

## 3. Duplicates and overlap

- **Within S1:** 20 exact duplicates (normalized stem + options; NFC, lower-case, punctuation stripped). 89 stems repeat with different options, mostly generic stems such as "select the synonym". Use stem + options for de-dup, not the stem alone.
- **Across S1 files:** 0 shared stems.
- **S1 ↔ S2 inline Q:** 0 exact stem matches.
- **Within S2:** 44 repeated inline stems inside folders, and 8 shared across exam folders.
- **S3 ↔ S1:** not computed (the PDFs were not parsed). S1 is very likely a transcription of part of the S3 SSC GD 2025 papers, so expect heavy overlap once S3 is extracted.
- **Overlap with the new repo:** the seed question matches nothing. **Overlap with the 103 live questions is unknown**, because offline work cannot read the DB. The import dry-run must check it via `content_checksum` / `fn_question_stem_checksum` (QF-1 Gate 5).
- **Estimate:** ≈ 1,195 unique, key-complete MCQs available locally in structured form (S1). Everything else needs extraction (S3) or authoring of answers (S2).

## 4. Gaps

- **SSC CGL:** structured, key-complete local questions: **0**. S1 is SSC GD. S2 CGL inline Q: 287, mostly without answers. The CGL PYQ compilations (13 PDFs) are third-party, and one language set is legacy-font. **Missing:** Tier 2 (Maths, Reasoning, English, GA, Computer, Statistics) has no source at all; there are no CGL full mocks in local files; Tier 1 2025 papers are absent.
- **SSC CHSL:** no source at all.
- **SSC MTS:** 166 note pages and 240 unanswered inline Q. No question bank, no PYQ PDFs.
- **SSC GD:** S1 bank (1,215) + 84 PYQ PDFs + 113 note pages. Best covered, but the exam is inactive in the new app.
- **Current affairs:** no dated CA dataset. There are 38 GA rows topic-tagged "Current Affairs" (2025, now stale) and 9 static MTS pages. CA must come from the existing CA pipeline, not legacy files.
- **Computer awareness (CGL Tier 2 / MTS):** only notes (8 MTS + 66 Delhi Police pages).
- **Hindi CGL content:** only the legacy-font compilation.
- **Images for Reasoning (non-verbal):** exist only on legacy storage.

---

## 5. Proposed import path (mirrors QF-1 + CA ingestion: untrusted input → DRAFT → gates → human review → atomic publish)

1. **Offline normalizer (no DB, no network).** A script in `scripts/content/`, run on a copy the owner places under a git-ignored folder. It parses S1 CSVs (and later S3 extracts) into a **staged JSON** per batch. It drops the embedded header rows, flags the 20 column-shifted rows as `REJECT_SHIFTED` (it does not auto-repair them), detects language by script (Devanagari ratio), maps `difficulty` → `easy|medium|hard`, and converts options to `A–D` keys plus `correct_option_key`.
2. **Content hash.** Compute the same algorithm as `fn_question_stem_checksum` (NFKC, lower-case, punctuation rules, sha256) **plus** a stem + options hash. De-dup inside the batch first; record duplicates in the gate report, never silently.
3. **Taxonomy mapping table.** A reviewed CSV/JSON `legacy_topic → canonical_taxonomy_nodes.id` (slug/hierarchy_path) per exam, built against the published syllabus read model (S7 for CGL). Anything unmatched goes to an explicit **`UNMAPPED` bucket** that is reported and not imported. The importer never creates taxonomy (QF-1 rule).
4. **Provenance per item.** Write a `question_sources` row: `source_type` (`PYQ` only when exam / year / shift / paper are known from an official paper; otherwise `Model_Paper` or `Original`), year, shift, paper_code. S1 lacks shift/paper, so the provenance gate should either require them to be back-filled from S3 or downgrade the type. Record the derived-from file in `authoring_metadata`.
5. **Licensing gate (before any import).** Do not import text, solutions, or explanations copied from commercial compilations or watermarked memory-based papers (S3 publisher compilations, Navy, UPP, and possibly S1 explanations) without written rights. Official paper question text needs an owner/legal ruling. Every imported item must state its provenance class: official PYQ, self-authored, or AI-authored and reviewed. AI-written explanations are re-authored or reviewed.
6. **Import as DRAFT only.** Use a service-role script that calls `fn_import_question_drafts` (the existing QF-1 path: five gates, advisory-locked dup re-check, `question_import_batches`, `origin='CSV_IMPORT'`). It has a **`--dry-run`** default that writes nothing and prints the gate report, and requires an explicit `--commit` flag. The idempotency key is the content hash, so a re-run inserts 0. Batches go per exam × subject, within the factory size limits. Follow the DB-safety workflow: dev DB only, backup, runner, ledger. Prove the first run is non-writing.
7. **Human review queue before publish.** Use the existing QF-1 Review Queue (DRAFT → IN_REVIEW → APPROVED with the 6-item checklist → `fn_publish_question_version`). The reviewer verifies the key, the explanation, the language, and the taxonomy. Nothing becomes candidate-visible without sign-off, the same principle as CA's "no unreviewed external or AI content reaches students".
8. **Images handled separately.** Inventory the 232 legacy-storage figure URLs. The owner decides whether to retrieve them (legacy project access is out of scope here). Re-host them in the new bucket under a content-hash path, set `question_image_url` / `option_image_url`, and require alt text for each figure. Items with missing images stay DRAFT, or get `REJECT_MISSING_IMAGE`.
9. **Hindi / bilingual.** `question_versions.language` is `en|hi` and one row is one language. Import Hindi as `hi` versions. Pairing EN↔HI as the same question needs an owner decision: a separate `questions` row per language, or a translation link. No machine translation without review. The legacy-font CGL Hindi PDFs need Unicode conversion or OCR before any use.
10. **Articles / notes (S2, S4)** go through the learning-content factory, never the question path: HTML/DOCX → markdown, DRAFT, review, publish. Run the same licensing and image steps.
11. **Rollback by import batch id.** Every row carries `import_batch_id`. Rollback means rejecting or deleting DRAFT versions of that batch via a reviewed SQL/runner step, before publish only. Published items are corrected via errata/revisions, never deleted.

### Open decisions (architect / owner)
1. **Licensing:** may official SSC/UPP paper question text be used? Are third-party compilations and memory-based papers excluded outright? Who signs off?
2. **Exam priority:** S1 is SSC GD, and GD is inactive. Activate GD to use it, or hold it and author CGL content first?
3. **Should S2 inline questions (mostly answerless) be imported as drafts at all, or discarded?**
4. **Legacy images:** retrieve the 232 figures from legacy storage, or redraw them? Retrieval requires an owner-approved, separate step that touches the legacy project.
5. **Bilingual model:** separate questions per language, or a translation link, plus the display rule for `hinglish` users.
6. **Provenance for S1 rows without shift/paper:** back-fill from S3, or downgrade from `PYQ`?
7. **Full legacy DB (4,050):** is a one-time, owner-run, read-only export wanted? This inventory did not touch it.
8. **Notes / articles:** import S2/S4 as learning documents? Which exam first?
9. **OCR tooling** for Army GD and the legacy-font CGL Hindi, if those sources are approved.
10. **`OneDrive\Documents\SSC.docx`:** the owner should check what it is (unreadable here).

---

## 6. Not done (by rule)
- Nothing was copied, moved, modified or deleted outside this file. No git state was changed.
- No database or network connection was made. No `.env*` file, key or connection string was opened or printed. The legacy Supabase project and its storage were not touched.
- DB dumps in `E:\CourageLibrary-Backups` were listed only, not restored or parsed.
- No zip was extracted (all six relevant zips are empty). PDFs were read only for text-layer statistics, and no content was stored.
- No question text, personal data or secret is reproduced in this report.
