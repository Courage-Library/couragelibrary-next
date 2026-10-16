# SSC CGL Tier 1 — syllabus draft notes (`ssc-cgl-tier1.v1.json`)

**Status: DRAFT for owner review. Not imported, not published.** The file `data/syllabus-drafts/ssc-cgl-tier1.v1.json` follows the import contract (`docs/syllabus/IMPORT_CONTRACT.md`, contract_version 1). It was drafted ONLY from two published Exam Knowledge documents. Nothing was added from memory (decision #15): a numeric value appears only where an EK document states it, otherwise it is `null`. **Tier 1 only** — no Tier 2 / Paper-II / Paper-III content.

## Sources

- **[S1]** EK `SYLLABUS` v1 — document `ssc-cgl-syllabus-2026` (id `4025d36e-7466-49f6-bb12-39c3ef306937`, version `167d78dd-94ef-4223-bdac-ea26cb7292fc`). PUBLISHED, author type EXTERNAL_IMPORT, `lastVerifiedDate` 2026-10-01. Sections used: section-2 … section-5 (topic tables, "Topic Boundaries"), section-1 (APPLICATION depth), section-7 ("indicative topic list").
- **[S2]** EK `EXAM_PATTERN` v1 — document `ssc-cgl-exam-pattern-2026` (id `e4147148-c556-481b-b6a9-4bf30b54edab`, version `fce96f86-c5bc-4421-a50a-4fa8e89c512b`). PUBLISHED, `lastVerifiedDate` 2026-10-01. Sections used: section-2 "Tier 1 Exam Pattern: Section-Wise Distribution" (table), section-1 / section-4 (Tier 1 negative marking), section-5 (PwBD time); structured claims `TIER1_QUESTIONS`, `TIER1_MARKS`, `TIER1_DURATION`, `TIER1_NEGATIVE_MARK`.
- Both EK documents cite the official notice: *Combined Graduate Level Examination, 2026 — Official Examination Notice*, Staff Selection Commission, published 2026-05-21, https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_cgl_2026.pdf (EK source status SOURCE_VERIFIED). The notice itself was **not** re-read for this draft.

## Confidence scale

- **HIGH** — a number or name stated in an EK structured claim / exam-pattern table that cites the official notice.
- **MEDIUM** — stated in an EK document, but editorial (Courage Library wording, a "High-Yield" label, depth) or not specific to Tier 1 (the EK syllabus covers Tier 1 and Tier 2 together and calls its topic list "indicative").
- **LOW** — a structural choice of this draft (a catch-all "General Topics" bucket named after the taxonomy), not an official syllabus heading.

## Field rules applied

| Field | Rule | Source |
|---|---|---|
| `expected_questions_min/max` | Paper 100 / 100, each section 25 / 25; **units null** (no EK per-topic count; the EK "Weightage Guidance" is qualitative only) | [S2] section-2 table |
| `weightage_tier` | `HIGH_YIELD` where the EK topic table says "High-Yield: Yes"; **null** where it says "Supporting" (no tier invented) | [S1] topic tables |
| `required_cognitive_depth` | `APPLICATION` for every unit ("All topics are tested at the APPLICATION depth") | [S1] section-1 … section-5 |
| `description` | unit: the EK "Topic Boundaries" line, verbatim, plain text; paper / section: the stated counts | [S1] / [S2] |
| topic mapping | one existing taxonomy TOPIC per unit, weight null; every EK topic row has an exact taxonomy topic of the same name | live taxonomy (`hierarchy_path`) |
| `is_mandatory` | default (true) — no EK statement | — |

## Per node

| Node | Code | Title | Values | Source | Confidence |
|---|---|---|---|---|---|
| PAPER | `tier-1` | Tier 1 (Computer Based Examination) | 100 questions; description: 200 marks, 60 min (80 PwBD with scribe), −0.50 per wrong answer | [S2] section-2 table + claims TIER1_QUESTIONS / TIER1_MARKS / TIER1_DURATION / TIER1_NEGATIVE_MARK | HIGH |
| SECTION | `tier1-gir` | Section I: General Intelligence and Reasoning | 25 questions, 50 marks; order as in the EK table | [S2] section-2 table | HIGH |
| SECTION | `tier1-ga` | Section II: General Awareness | 25 questions, 50 marks; order as in the EK table | [S2] section-2 table | HIGH |
| SECTION | `tier1-qa` | Section III: Quantitative Aptitude | 25 questions, 50 marks; order as in the EK table | [S2] section-2 table | HIGH |
| SECTION | `tier1-ec` | Section IV: English Comprehension | 25 questions, 50 marks; order as in the EK table | [S2] section-2 table | HIGH |
| UNIT (sec. I) | `gir-classification` | Classification | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.classification` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-analogy` | Analogy | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.analogy` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-coding-decoding` | Coding-Decoding | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.coding-decoding` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-blood-relations` | Blood Relations | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.blood-relations` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-direction-sense` | Direction Sense | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.direction-sense` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-number-series` | Number Series | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.number-series` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-syllogism` | Syllogism | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-intelligence-and-reasoning.syllogism` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. I) | `gir-general` | General Intelligence and Reasoning General Topics | tier null ("Supporting"); APPLICATION; questions null → `general-intelligence-and-reasoning.general-intelligence-and-reasoning-general` | [S1] section-3 "General Intelligence and Reasoning — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | LOW |
| UNIT (sec. II) | `ga-history` | History | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-awareness.history` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-polity` | Polity | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-awareness.polity` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-geography` | Geography | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-awareness.geography` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-science-technology` | Science & Technology | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-awareness.science-technology` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-economy` | Economy | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `general-awareness.economy` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-sports` | Sports | tier null ("Supporting"); APPLICATION; questions null → `general-awareness.sports` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. II) | `ga-general` | General Awareness General Topics | tier null ("Supporting"); APPLICATION; questions null → `general-awareness.general-awareness-general` | [S1] section-5 "General Awareness — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | LOW |
| UNIT (sec. III) | `qa-number-system` | Number System | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.number-system` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-percentage` | Percentage | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.percentage` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-ratio-proportion` | Ratio & Proportion | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.ratio-proportion` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-profit-loss` | Profit & Loss | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.profit-loss` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-average` | Average | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.average` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-time-work` | Time & Work | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.time-work` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-speed-distance-time` | Speed Distance Time | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.speed-distance-time` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-algebra` | Algebra | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.algebra` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-geometry` | Geometry | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.geometry` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-trigonometry` | Trigonometry | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `quantitative-aptitude.trigonometry` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. III) | `qa-general` | Quantitative Aptitude General Topics | tier null ("Supporting"); APPLICATION; questions null → `quantitative-aptitude.quantitative-aptitude-general` | [S1] section-2 "Quantitative Aptitude — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | LOW |
| UNIT (sec. IV) | `ec-synonyms` | Synonyms | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.synonyms` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-antonyms` | Antonyms | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.antonyms` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-spelling` | Spelling | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.spelling` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-fill-in-the-blanks` | Fill in the Blanks | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.fill-in-the-blanks` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-error-spotting` | Error Spotting | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.error-spotting` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-one-word-substitution` | One Word Substitution | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.one-word-substitution` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-idioms-phrases` | Idioms & Phrases | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.idioms-phrases` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-active-passive` | Active Passive | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.active-passive` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-sentence-rearrangement` | Sentence Rearrangement | tier HIGH_YIELD ("Yes"); APPLICATION; questions null → `english-comprehension.sentence-rearrangement` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | MEDIUM |
| UNIT (sec. IV) | `ec-general` | English Comprehension General Topics | tier null ("Supporting"); APPLICATION; questions null → `english-comprehension.english-comprehension-general` | [S1] section-4 "English Comprehension — Syllabus, Topics, and Weightage" (table + Topic Boundaries) | LOW |

## Summary

- Nodes: 1 paper + 4 sections + 36 units = 41; mappings: 36 (one topic per unit, no weights).
- Confidence: HIGH 5 (paper + sections) · MEDIUM 32 · LOW 4 (the four "General Topics" units).
- High-yield units: 31; "Supporting" units (tier null): 5.

## Missing topics

**None.** All 36 topic paths in the file resolve to existing, active taxonomy TOPIC nodes (checked against the live taxonomy by `scripts/test_syl_import1.cjs` I12 and by the import preview). The taxonomy (4 subjects, 36 topics) carries exactly the EK topic names, so every EK topic row has an exact match and no topic needs to be created before the import. If the owner adds units for official syllabus items that the EK tables do not list (see the checklist), those units need new topics first — suggested parents are the four existing subjects (`quantitative-aptitude`, `general-intelligence-and-reasoning`, `english-comprehension`, `general-awareness`).

## OWNER MUST VERIFY against the official SSC CGL 2026 notification

Tick each item against the notice (Scheme of Examination and its syllabus annex) before publishing. Make corrections in the DRAFT editor in /admin/syllabus after the import.

- [ ] Tier 1 is one paper of 100 questions / 200 marks, 60 minutes (80 minutes for PwBD candidates eligible for a scribe).
- [ ] Negative marking in Tier 1 is 0.50 marks per wrong answer (kept in the paper description only; there is no numeric field for it).
- [ ] Section order and names: I General Intelligence and Reasoning, II General Awareness, III Quantitative Aptitude, IV English Comprehension — use the exact official wording.
- [ ] Each section has 25 questions and 50 marks.
- [ ] The official Tier 1 syllabus text of each section against the units: the EK topic list is "indicative" and covers Tier 1 and Tier 2 together. Remove units that do not belong to Tier 1 and add official Tier 1 items that are missing (new units may need new taxonomy topics first).
- [ ] Items that this draft keeps only inside a "General Topics" unit (for example data interpretation and statistics in Quantitative Aptitude, non-verbal reasoning in Reasoning, reading comprehension and cloze test in English, current affairs in General Awareness): decide whether they deserve their own units.
- [ ] The four "General Topics" units (LOW confidence) are catch-all buckets named after the Courage Library taxonomy: keep, rename or replace them.
- [ ] HIGH_YIELD tiers and APPLICATION depth are EK editorial labels, not official: keep or clear them.
- [ ] Unit-level question counts are intentionally empty (no official per-topic numbers): do not fill them from memory.
- [ ] Cycle: the file targets the 2026 cycle of ssc-cgl. The existing DRAFT "pattern-skeleton-2026" (version 1, same cycle) must be archived or deleted first, otherwise the import is refused (DRAFT_EXISTS).
