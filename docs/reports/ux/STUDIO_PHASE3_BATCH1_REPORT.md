# Courage Studio phase 3 — batch 1 report (daily use)

**Pages:** Question bank, Question drafts / factory, Question reports, Current affairs admin.

**Template:** the Studio list + drawer, v3 chips, the same compact density as Today, honest empty states. Shared primitives: `components/admin/studio/studio-page.tsx` (header, stat strip, panel, empty state, labelled field) and `studio-drawer.tsx` (native modal dialog).

**Proof (local, outside the repo):** `E:\CourageLibrary-Backups\phase3-batch1-20261027-1714\`
- `before/` and `after/`: screen-sized captures at 1440×900 and 1280×800;
- `side-by-side/`: before vs after for each page and size.

**Axe (serious / critical):**

| Page | Before | After |
|---|---|---|
| Question bank | button-name ×2, color-contrast ×6, select-name ×12 | **0** |
| Question reports | color-contrast ×13, select-name ×3 | **0** |
| Factory | 0 | **0** |
| Current affairs | 0 | **0** |

**Gate:** `scripts/test_studio_phase3.cjs` (CI `STUDIO-P3`) 8/8; its first run read files only and found one real defect (a clickable headline `<div>` in the CA table, now a button). The full offline list is 59/59.

## MATCHED / DIFFERENT vs the Studio style

| Page | Item | Result |
|---|---|---|
| All 4 | Header | **MATCHED.** 28 px title, one line of description, exactly ONE primary action, quiet secondary actions (P3-01). |
| All 4 | Density / tokens | **MATCHED.** 16 px gaps, 18 px panels, 11.5 px uppercase labels, v3 tokens. |
| Question bank | List + drawer | **MATCHED.** The permanently open add form (half the page) is now behind **Add question** in a drawer; Edit opens the same kind of drawer (the old modal is gone). The list is full width. |
| Question bank | Filters | **MATCHED.** Six labelled filters (Exam, Pattern, Section, Difficulty, Type, Language) and a named search. |
| Question bank | Chips | **MATCHED.** "Inactive" uses the archived chip. **DIFFERENT:** the difficulty / exam / PYQ tags keep their own colours (they are tags, not statuses). |
| Question bank | Bulk import | **MATCHED.** The side card became a quiet header action. |
| Question drafts | Header / tabs | **MATCHED.** "Start focus review" is the primary. The tabs are underline-style with tablist / tab / tabpanel + arrow keys; no second solid-blue element. |
| Question drafts | Tab contents | **DIFFERENT.** Generate / Import / Review queue / Coverage keep their QF-1 internals (already labelled, axe-clean); only the shell changed. Review queue is already list + drawer. A deeper restyle is a later batch. |
| Question reports | Stats → filters | **MATCHED.** The five large KPI cards are now a compact strip of real buttons (aria-pressed). |
| Question reports | D-5 | **FIXED.** Each count uses the same predicate as its filter; Verified and Resolved are counted separately (P3-02). |
| Question reports | List + drawer | **MATCHED.** Rows are buttons. The inspector (question, options + key, explanation, the student's message, status + note) opens in a drawer. "Open question" and the no-default-key rendering are unchanged (gates Q7 / QB-KEY-1). |
| Question reports | Errors | **MATCHED.** Save errors show inline (role="alert") instead of a browser `alert()`. |
| Current affairs | Header | **MATCHED.** One primary (**New current affair**); Refresh, Daily 10Q quiz, Prompt generator and Import from AI are quiet actions (they were 4 coloured buttons). |
| Current affairs | Stat strip | **MATCHED.** 8 counts on one row at 1440 and 1280 (auto-fit). They show "–" while unknown, never a made-up 0. |
| Current affairs | List | **MATCHED.** v3 status chips; importance as token chips; the headline is a button; honest empty state. **DIFFERENT:** the table keeps its existing columns and per-row actions (the editor / review drawers already existed). |
| — | D-3 / D-4 | Not in batch 1: D-3 (descriptive / institutes / community) is batch 3; D-4 was the old dashboard, which Today replaced. |

## BILINGUAL-1 — the five decisions, with my recommendation

Source: `docs/content/BILINGUAL_1_DESIGN.md` §7. No migration was written.

1. **Hinglish preference** → **serve English** (as today: `contentLanguage('hinglish') = 'en'`). There is no Hinglish content; a glossary layer can come later without a schema change.
2. **Fallback labelling** → **yes, serve the other language when the preferred one does not exist, with a plain label**: "Shown in Hindi — English version not available yet". Most SSC GD content is Hindi-only; hiding it from English users would empty those exams.
3. **Answer-key change on one language** → **require the paired revision and publish both atomically** (`fn_publish_question_versions`). Auto-demoting the other language silently removes content from students; an atomic pair keeps parity explicit.
4. **Mock language** → **per-question switch in the player (like the real SSC CBT)**, saving the version actually answered. Parity makes scoring identical either way, and the switch is what students practise for.
5. **Order** → **BILINGUAL-1 first, then pairing work**: TAXONOMY-HINDI-1, the 4 PAIR_CANDIDATE drafts, and LANG-VERSIONS-1 for articles, in that order. Without BILINGUAL-1 a second published language supersedes the first.
