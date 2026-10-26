# STUDIO-P2-POLISH — Today v2 vs the approved concept

Concept: `docs/reports/ux/admin_ux_1/concept/studio-today.png`. Commit 3f98664.

**Proof (local, outside the repo):** `E:\CourageLibrary-Backups\studio-p2-polish-20261027-0101\` contains:
- the two `side-by-side` images, 1440×900 and 1280×800 (concept left, built right);
- the admin and staff screen-sized captures at both sizes;
- `full/` (full-page shots at 1440 and 390, admin + staff).

**Real data = empty queue.** The dev DB has 0 questions IN_REVIEW, so the "real data" captures *are* the empty-queue state. The filled state (ring progress, "Start focus session", time left, streak) needs real IN_REVIEW items, and CONTENT-IMPORT-1 is held (see its report). It will be captured right after the import.

**Checks:** axe 0 serious/critical (admin and staff, both sizes); no e-mail in the DOM; no write requests. Full offline list 57/57.

| # | Item | Result | Notes |
|---|---|---|---|
| 1 | Density | **MATCHED** | Page padding 30 px (xl), card padding 18 px, card label 11.5 px uppercase, tracking .08em, slate-500 (= ink-500, 4.9:1). Big number 33 px extrabold, sub-text 13 px, greeting 28 px, row gap 16 px. Sidebar items 13.5 px with 9 px vertical padding. The top section (mission + 4 cards) fits without scrolling at **1440×900** (the "Also" strip too) and at **1280×800**. **Different:** the sidebar keeps its icons, expandable groups, Design system and "Not live yet" entries (role-aware nav from phase B), so it is taller than the concept's. |
| 2 | Mission card | **MATCHED, with one deliberate difference** | The exact gradient `115deg #1D4ED8 0% → #3B82F6 45% → #5000F0 100%`, a cyan #5CD8E6 radial glow in the top-right corner and the faint triangle. No navy scrim. Height = 2 card rows; order: label → title → one line → ring + stats → button. **Different:** white small text over the concept gradient measures **3.68:1** at #3B82F6. To meet ≥ 4.5:1, the text sits in a ≤ 70 % column over a **blue-700** (not navy) tint at 50 %, which fades out at 84 %. Worst point 4.95:1, gated by SP-07. The left side therefore looks a little deeper blue than the concept. The glow stays in the corner, right of the text column. |
| 3 | Grid | **MATCHED** | Mission (2 rows) + Drafts / Reports / Current affairs / Tickets, each with a coloured status-dot line top-right (● in review · ● oldest N days / all clear · ● N drafts · ● all on time / N past 24 h). Community flags + Library Pro moved to a slim "Also" strip. Honest variants: tickets switched off → "Off · switched off"; staff do not see Reports (admin-only page), so they get 3 cards. |
| 4 | Content health | **MATCHED, rows differ** | Rows = **all active exams**. Only **SSC CGL** is active in the DB (SSC GD, CHSL, MTS and the QA test exam are inactive), so there is 1 row where the concept shows 3. Columns: Quant · Reasoning · English · GK / GA (full name as tooltip + sr-only). Cell colour scales with the count (blue-50 → blue-200; zero = neutral). "Where to build next →" opens the lowest-coverage exam. |
| 5 | Recent activity | **MATCHED, time label differs** | Identical consecutive actions are grouped ("Syllabus draft imported ×18"), each with an icon tile per type (import ↑ cyan, publish ● green, approve ✓ blue, reject/archive ✕ soft red), in human wording, max 5 rows. **Different:** the time shows in the concept's short style ("11:28" / "Yesterday" / "17 Oct"). The full timestamp is in the tooltip and "latest" is read to screen readers, instead of the visible "· latest 26 Oct 11:28", which wrapped at 1280. |
| 6 | Empty states | **MATCHED** | Queue = 0 → "Your review queue is empty" + the one primary "Import questions" (→ bulk import); the ring shows 0/20; the F shortcut is off. Streak 0 → "Start your streak today". No time estimate yet → the stat is hidden (no "–"). |
| 7 | Header | **MATCHED** | First name + initial avatar on the right (own profile; never the e-mail). Compact "Student site" link and role chip. The page title ("Today") stays at the left (phase B wayfinding). |

Gates updated in the design's terms (not loosened): AB-04 (guard destructures `userId`; header never shows an e-mail), AB-06 (exactly one primary is rendered: focus or import), SP-07 (the concept gradient, no navy scrim, text column ⊂ tint, glow outside the text column, worst point ≥ 4.5:1), SP-08 (badge + first name read after the guard), SP-02 (grouping unit test).
