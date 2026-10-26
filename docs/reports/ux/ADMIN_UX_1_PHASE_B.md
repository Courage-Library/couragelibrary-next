# ADMIN-UX-1 — Phase B report (shell · Ctrl/Cmd+K · Today)

**Status:** built, gated and locally captured. **STOP for owner / architect review.**

**Scope held:**
- UI only.
- No guard changed, no new data exposure, no migration, no new dependency.

## What changed

| Area | Change |
|---|---|
| Sidebar | Grouped: Today · Review · Content (6 parents with children) · People · Payments · System · Not live yet. Payments is hidden while `PAYMENTS_ENABLED` is off; Not live yet starts collapsed and is flag-aware. **Role-aware:** a link appears only when the role passes that page's existing `requireAdminPage`, and gate AB-01 checks all 37 links against their page files. **Responsive:** ≥ 1280 px full sidebar; 768–1279 px 64 px icon rail with a "Menu" that opens the full list; < 768 px a top bar opens a modal drawer. The sidebar scrolls on its own, so it is never clipped at any height. One `aria-current`; groups are real `<button aria-expanded>`. |
| Header | Location ("Review / Question drafts"), search, the **real** role (Admin / Staff), Student site link. Removed: admin e-mail, hard-coded "Super Admin", "PROD" / "Live Sync" badges, the dead bell. |
| Landmarks | One `<main>` (the root shell's); admin content is `#admin-content` with its own "Skip to admin content" link. |
| Search (Ctrl/Cmd+K) | `app/admin/search/actions.ts` behind the existing guard. **Groups:** questions (id or text) for staff and admin; users (email or username) for admins only, because their page is admin-only; tickets (ref or id) only while support tickets are on. **Safety:** LIKE wildcards are escaped; results carry ids and short labels only. **UI:** a Dialog with an ARIA combobox / listbox; ↑ / ↓ and Enter work. |
| Today (`/admin`) | **Cards:** each shows a real count and links to the already-filtered list:<br>• question drafts in review (+ approved waiting to publish)<br>• CA drafts in review<br>• open question reports with the oldest age (admin)<br>• open tickets and those older than 24 h, plus grievances (when support is on)<br>• pending community flags<br>• Library Pro ending within 7 days (admin)<br>**Recently changed** (admin): action, entity and time only, with no e-mails or values.<br>**Content at a glance.** A failed read shows "Not available". Write-failure and nightly cards are left out (Q5 → OPS-EVENTS-1). One amber primary = the busiest queue (R4). `loading.tsx` (PageLoading) + `error.tsx` (Retry, no internals). |
| Deep links | Initial UI state only, whitelisted values, read after the guard: Factory `?tab=review&status=…`, CA `?status=…`, question reports `?status=…`, support `?status=` / `?category=` plus `#ticket-<id>` anchors. |
| Status chips | One vocabulary (`lib/admin/status.ts` + `StatusChip`): Draft grey · In review amber · Approved blue · Published green · Rejected red · Archived muted. Used by search now and by every list in phase C. |

**Also done for Q2 (separate commits, already pushed, CI green):**
- **D-1:** community moderation now writes the canonical table (`24f6c7b`).
- **D-2:** the users directory is server-only, uses the service role, pages properly and searches by e-mail (`3bfa0ef`).
- **Docs:** the VERIFY-097 correction (`88bac10`).

## Screenshots (local only)

- **Location:** `E:\CourageLibrary-Backups\admin-ux1-captures\{before,after}\` — 39 routes × 1440 / 1024, as admin, plus staff views of Today and the Factory.
- **Not committed.** E-mails were blanked in the DOM before every shot (0 leaks), but names and student data can still be on screen. The capture tool now refuses to write inside the repository.
- **Before:** main at `3bfa0ef`, built in a temporary worktree (since removed).
- **After:** branch `admin-ux1-phase-b`.
- **Read-only browsing:** the only non-GET requests were 2 per run, both `getExamWorkspaceAction` on `/admin/exam-knowledge` mount (a server action, so it is a POST). It is verified read-only: no insert, update, upsert, delete or rpc.
- **Attempts:** the after-run needed 3 attempts for `/admin/content/topics`. Two of them hit `/auth/unavailable` or a 60 s timeout under memory pressure (about 1.4 GB free); net-probe was 100 %.

## Accessibility (axe, WCAG 2.0 / 2.1 / 2.2 A + AA, serious + critical, admin @ 1440)

| | Rules (route × rule) | Nodes |
|---|---|---|
| Before | 46 | 286 |
| After | 40 | 211 |

- **Removed by the shell:** the old shell caused 3 colour-contrast failures on **every** page; these are gone.
- **Now 0 serious / critical:** `/admin` (Today), the Factory, Support, Syllabus, Topic links, Library Pro, MFA, Design system, Community, Content and Current affairs.
- **Remaining:** every remaining violation sits inside legacy page content (e.g. `.text-slate-400`, `.text-[11px]`, unlabeled legacy selects / inputs on Patterns, Questions, Mock tests, Sections and Reports). None is in the new shell, header, search or Today. They are phase C work (template migration).
- **Incomplete "before" entries:** `/admin/patterns`, `/admin/adaptive`, `/admin/descriptive` and `/admin/exams/ai-onboarding` show "—" in the "before" run because the page loaded incompletely. The after-run node lists confirm their violations are legacy page content.

## Gates

- **Phase B gate:** `scripts/test_admin_ux1b.cjs` 9/9 (CI `ADMIN-UX1B`):
  - access = page guard for every link;
  - role / flag visibility;
  - one active link;
  - layout guard unchanged and first;
  - one `<main>`;
  - search guard and role rules;
  - Today admin-only cards with no e-mails;
  - whitelisted deep links;
  - chips;
  - a11y statics.
- **Security gates:**
  - SEC-1B 26/26: `adminSearchAction` is denied before any DB call for anon, student and the user_metadata-admin spoof;
  - SEC-1C 22/22: page inventory and guards unchanged.
- **Other gates:** UX1B-SHELL 7/7 (U-2b reads the nav config: 32 hrefs, all routed); UX2A L-15 (PageLoading).
- **Full offline list:** green except F2 T-09, the known local-only CRLF case that is green in CI.

## Deferred

- **Phase D (review-queue speed):**
  - Q3: one "I checked all 6" confirmation with the items visible, and machine-checkable items auto-ticked;
  - Q4: `require_second_reviewer` (default false) plus an audit row on self-approve + publish.
- **Phase C:**
  - every page onto the template with the chips;
  - D-3 / D-4 / D-5;
  - the Q6 audit-log page;
  - the remaining axe findings.
- **OPS-EVENTS-1 (backlog):** an ops events table the app can read, to feed the write-failure and nightly cards.
