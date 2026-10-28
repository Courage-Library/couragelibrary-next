# Courage Studio phase 3, batch 2 report (mock-test setup)

**Pages:**
- Mock tests (`/admin/mock-tests`);
- the mock-test setup overview (`/admin/mock-tests-management`);
- Patterns, Sections, Categories, Schedules and Bulk import.

**Template:** the same as batch 1:
- the Studio header with ONE primary;
- list + drawer (`StudioDrawer`, a native modal dialog);
- stat strips that filter (aria-pressed);
- labelled controls (`StudioField`);
- v3 status chips;
- honest empty states.

**Proof (local, outside the repo):** `E:\CourageLibrary-Backups\phase3-batch2-20261028\`
- `before/` and `after/`: screen-sized captures at 1440×900 and 1280×800;
- `side-by-side/`: before vs after, one image per page and size.

**Axe (serious / critical, 1440):**

| Page | Before | After |
|---|---|---|
| Mock tests | 0 | **0** |
| Mock-test setup (overview) | color-contrast ×2 | **0** |
| Patterns | color-contrast ×3, label ×5, select-name ×2 | **0** |
| Sections | color-contrast ×1, label ×3, select-name ×3 | **0** |
| Categories | color-contrast ×2, select-name ×1 | **0** |
| Schedules | color-contrast ×1, select-name ×1 | **0** |
| Bulk import | color-contrast ×2, select-name ×1 | **0** (after a second pass: the default empty-state hint was slate-400 on white) |

**Gate:** `scripts/test_studio_phase3.cjs` (CI `STUDIO-P3`), extended with B2-01..B2-07. It is now 15/15.

Negative control: run against the pre-batch-2 files, all 7 batch-2 checks FAIL and batch 1's 8 still pass.

The admin-pages smoke expects the new headings ("Sections", "Mock test setup", "Bulk import") and passes locally.

## MATCHED / DIFFERENT vs the Studio style

| Page | Item | Result |
|---|---|---|
| All 7 | Header | **MATCHED.** Studio header: 28 px title, one line of description, quiet secondary actions; the legacy breadcrumbs and icon titles are gone (B2-01). |
| Mock tests, Patterns, Sections, Categories | Header primary | **MATCHED.** Exactly ONE primary: New mock test / New pattern / New section / New category. |
| Mock tests, Patterns, Sections, Categories | List + drawer | **MATCHED.** The permanently open create form (half the page) is now behind the primary in a drawer. Edit opens the same kind of drawer; the hand-rolled overlay modals are gone (B2-02). |
| Mock tests, Patterns, Sections, Categories | Stat strip | **MATCHED.** Real counts that filter (aria-pressed): status, publish state, or question-bank readiness (Sections: "Enough questions" / "Short of questions"). Each count uses the same predicate as its filter, the batch-1 D-5 rule (B2-05). |
| Mock tests, Patterns, Sections, Categories | Filters | **MATCHED.** Labelled search and selects (B2-03). Mock tests gains the Pattern filter, which existed in state but had no control. |
| Mock tests, Patterns, Sections, Categories | Rows | **MATCHED.** v3 chips. An inactive pattern or category now reads "Inactive" (it said "Draft"). Named icon actions (aria-label, not title). Related pages are quiet links. Labelled pagination (B2-04). |
| Mock tests, Categories | Toggles | **FIXED.** A failed publish / activate toggle used to be silent; it is now shown (B2-07). |
| Mock-test setup | Overview | **MATCHED.** One primary (Bulk import, as before), a stat strip of real counts, the content hierarchy as a plain ordered list, the seven modules as one list of links. **FIXED (R12):** the question count was a made-up 0 when its read failed; it is now "–" (B2-07). |
| Schedules | Header / tabs | **MATCHED.** Studio header. The 7-day program / recruitment cycles switch is now real tabs (tablist / tab / tabpanel, arrow keys, underline). The exam selector has a real label (B2-06). |
| Schedules | Tab contents | **DIFFERENT.** The 7-day program builder and the cycle forms keep their internals and four modals; only the shell changed. This is the same call batch 1 made for the factory tabs. A deeper restyle is a later batch. |
| Bulk import | Header / steps | **MATCHED.** Studio header. The three solid-blue step buttons (competing primaries) are now underline tabs with arrow keys. The two configuration selects are labelled. |
| Bulk import | Step contents | **DIFFERENT.** The prompt generator, image uploader and CSV validator keep their internals, including four browser `alert()` messages. A later batch. |
| All 4 list pages | Confirmations | **DIFFERENT.** Delete / activate / publish still use the browser `confirm()`, as the batch-1 question bank does. A shared in-page confirmation is a cross-batch change. |
