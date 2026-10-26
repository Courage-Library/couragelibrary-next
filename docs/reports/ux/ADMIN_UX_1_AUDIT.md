# ADMIN-UX-1 — Admin panel audit + redesign proposal (PHASE A)

**Status:** PHASE A delivered for owner / architect review. **No code changed.** Only this report and the low-fi
wireframes in `docs/reports/ux/admin_ux_1/wireframes/` were written.

**Scope (owner):** UI/UX only.
- No change to authorization, data exposure, migrations or features.
- Laptop and desktop first (≥ 1280 px), still working at ≥ 768 px.

**Method:**
- The code was read route by route: all 41 `app/admin/**/page.tsx` files, the shell and every client component they render.
- The 5 daily tasks were traced click by click from the code, with file:line evidence.
- Wireframes are HTML rendered to PNG at 1440 and 1024 px.

**Screenshots of the current pages: NOT TAKEN YET.** See §8: blocked by memory, and needs e-mail masking because the repo is public.

---

## 1. Summary

The admin panel has grown page by page. Four problems drive the owner's pain points.

1. **Hard to find things.**
   - The sidebar has 3 groups of very small links (11 px), and the mock-test group is a click-only `<div>`.
   - **9 routes are missing from the sidebar:** support, pro-library, mfa, gamification, achievements, design-system, mock-tests-management, content/topics, live-tests/intelligence. Support tickets are reachable only by typing the URL.
   - The desktop sidebar is `md:overflow-hidden` (`admin-sidebar.tsx:162`). On screens under about 900 px tall, the bottom links (Premium, Adaptive, Live tests) cannot be reached.
   - The sidebar shows staff links to admin-only pages, which then 404: Users, Billing, Premium, Rewards, Question reports, Taxonomy.
   - There is no search anywhere.
2. **Old and inconsistent look.** Three visual systems coexist:
   - **New design-system primitives:** syllabus, content/topics, support, pro-library, mfa, design-system.
   - **Legacy** `components/ui/legacy/*`: about 20 managers.
   - **Raw Tailwind:** content studio, exam knowledge, current affairs, rewards, adaptive.
     - Literal colour classes run from 69 to about 900 per page (exam knowledge 832, adaptive about 894 + 433, current affairs about 800).
     - `/live-tests` uses shadcn tokens (`bg-card`, `bg-primary`) that do not exist in `globals.css`.
   - Status colours contradict each other:
     - IN_REVIEW is indigo, purple or amber depending on the page.
     - DRAFT is grey on one page and amber on another.
     - "Inactive" is shown as "DRAFT" on some pages and as a red chip on others.
     - LIVE is red, the same red as REJECTED.
     - APPROVED and PUBLISHED look identical in the Question Factory.
3. **Slow daily work.**
   - Publishing one question draft takes **11–13 clicks**: tab, row, 6 checklist boxes, approve, publish, close.
   - Publishing a current-affairs draft takes **6–7 clicks plus a redundant Compile step**. The publish route already compiles, but the UI forces Compile first.
   - "View questions" links from categories, patterns, sections and mocks land on an **unfiltered** list. The URL only pre-fills the *create* form (`admin-question-manager.tsx:62-64` vs `:104-106`).
   - Tabs and filters are not in the URL on most pages, so Back, reload and shared links lose your place.
   - There is no pagination on most lists (whole tables load to the client), and Users is capped at 50.
4. **No overview.** `/admin` shows 8 inventory counts: questions, mocks, patterns, content, descriptive, institutes, flags, orders.
   - None of these are "what needs me today".
   - None link to the Question Factory, Current Affairs, Question reports, Support or Users.
   - The "pending moderation" count counts **all** flags, not only PENDING (`admin.service.ts:281`).

**Accessibility (WCAG 2.2 AA) is broadly failing outside the new-system pages:**
- About 20 hand-rolled modals with no `role="dialog"`, Escape or focus trap.
- Close buttons with no label.
- Labels not associated with their fields: 0 of 12, 0 of 13 and 1 of 24 `htmlFor` on the big managers.
- Clickable `<div>`s and `<tr>`s.
- About 450 instances of 9–11 px text, and targets of about 22 px.
- `focus:outline-hidden` removes the focus ring.
- Nested `<main>` landmarks, so the skip link skips nothing.
- There are no `loading.tsx` or `error.tsx` files under `app/admin`. Several pages hide service errors with `.catch(() => [])`, so an outage looks like "no data".

**The good reference:** `/admin/syllabus` and `/admin/syllabus/[id]` already show the target quality.
- New primitives and the Dialog component.
- A semantic table with a caption, and a full ARIA tree with arrow keys.
- 0 literal colours.
- Empty, error and live-message states.

The redesign generalises that.

---

## 2. Route inventory (41 pages)

**Guard key:**
- **S** = `requireAdminPage({ allowStaff: true })` (admin + staff).
- **A** = admin only.

Every guard stays exactly as it is.

| Route | Guard | Purpose / main task | Visual system | Main problems |
|---|---|---|---|---|
| `/admin` | S | Inventory KPIs | legacy | Not actionable; flag count wrong; crashes if the overview read throws |
| `/questions` | S | Write one MCQ; browse / edit / delete the bank | legacy, about 203 literal colours | All questions loaded to the client; URL filters ignored by the list; ad-hoc edit modal; 1 of 24 labels associated; pagination shows every page number |
| `/questions/factory` | S | AI pipeline: prompt → import → 5 gates → review → publish | legacy, about 130 | Tabs not in the URL; clickable `<tr>`; 6-box checklist; APPROVED = PUBLISHED colour; not linked from `/questions` |
| `/mock-tests` | S | Create / edit / publish mocks | legacy, about 116 | Publish = power icon + direction-less confirm; toggle result ignored; `<Link><Button>` nesting |
| `/mock-tests-management` | S | Hub diagram + counts | legacy, about 60 | Not in the sidebar; duplicates the dashboard; 6 heavy reads just for counts |
| `/categories` | S | CRUD exam categories | legacy, about 107 | Inactive shown as "DRAFT"; toggle result ignored |
| `/patterns` | S | Exam blueprints | legacy, about 148 | 5 identical outline buttons per card |
| `/sections` | S | Section rules per pattern | legacy, about 115 | Passes section *name*, which `/questions` ignores; teal pagination (blue elsewhere) |
| `/bulk-import` | S | Prompt → images → CSV → import | legacy, about 258 + gradient | 1,724-line component; `alert()`; 0 ARIA attributes |
| `/exams` | S | List / create exams | legacy, about 116 | Inactive = "draft"; no empty state; errors swallowed |
| `/exams/[id]` | S | Redirect → onboarding | — | — |
| `/exams/onboarding` | S | 6-step exam wizard | mixed | Future steps look disabled but are clickable; AI fallback dead-ends through `/exams/ai-onboarding` |
| `/exams/ai-onboarding` | S | Redirect → `/exams` | — | Dead route; a 1,119-line dead component has no importers |
| `/exam-knowledge` | S | Exam knowledge documents (author / review / publish) | raw, 832 + gradients | 3,165-line monolith; tab read from the URL but never written back; `alert()`; 0 ARIA attributes |
| `/syllabus` | S (publish = A) | Versions, draft, import, archive | **NEW** | Reference quality; shows publisher e-mail |
| `/syllabus/[id]` | S | Tree editor, validate, publish | **NEW** | Reference quality (ARIA tree) |
| `/taxonomy` | A | Canonical subject/topic tree | raw, about 69 | Edit panel sits at the top, far from the row; 24 px icon buttons with `title` only; staff see the link but get a 404 |
| `/content` | S | Structured lesson studio | raw, about 900 | Fixed 3/6/3 grid with no breakpoints (about 120 px columns at 1024); double scroll; `alert()`; errors swallowed |
| `/content/topics` | S | Link study units to topics | **NEW** | Orphan: no inbound link |
| `/current-affairs` | S | CA editorial workflow | raw + legacy Badge, about 800 | 7 modals + 1 drawer; Compile step forced in the UI; icon-only row actions; native `confirm()` |
| `/descriptive` | S | Create essay questions | legacy | **Renders "undefined-undefined words" / "undefined Marks"** (data shape hidden by `@ts-expect-error`) |
| `/institutes` | S | Register partner institutes | legacy | **Every row shows an empty green "verified" chip** (shape mismatch) |
| `/community` | S | Moderation flags | legacy | **Resolve / Dismiss always fail** (see §3); "Target type" blank; buttons are 10 px |
| `/question-reports` | A | Triage errata reports | legacy, about 124 | KPI "Resolved" count ≠ its filter; clickable divs; unlabeled filters; `alert()` |
| `/reports` | A | Redirect → question-reports | — | Duplicate URL |
| `/support` | S (flag `SUPPORT_TICKETS_ENABLED`) | Answer tickets | **NEW** | Not linked anywhere; no filter or search; 200 cap; flag off and migration 097 pending |
| `/users` | A | List auth users + profile sync | legacy, about 53 | **List likely empty or wrong** (§3); no detail view; client-side search only |
| `/pro-library` | A | Library Pro grants (F9-B) | **NEW** | Not in the sidebar; grants list shows only a truncated user id; duplicates the Premium "candidate access" tab |
| `/premium` | A | Premium governance (8 tabs) | legacy, about 228 | 1,382 lines; tabs without ARIA or URL; 0 `htmlFor`; 9 px text |
| `/billing` | A | Plans + orders | legacy, about 41 | "Active plans" counts all plans; FAILED / REFUNDED orders look amber like pending |
| `/rewards` | A | Coin store (4 tabs) | raw, about 265 | Coins are frozen (COINS-FREEZE); shows shipping PII in a modal; duplicates the gamification policy editor |
| `/gamification` | A | Coin policies + ledger | legacy, about 133 | Not in the sidebar; coins frozen |
| `/achievements` | S (flag LIVE_TESTS) | Read-only badge catalogue | raw, about 77 | Dormant; colour-only status dot |
| `/live-tests` (+ `/intelligence`, `/[id]/intelligence`, `/[id]/results`) | S / A (flag LIVE_TESTS) | Live events | undefined shadcn tokens / raw | Dormant; LIVE = red; `window.prompt` for disqualification reasons; sub-pages pass the wrong guard `path` (login return target only) |
| `/adaptive` | A (flag ADAPTIVE) | Adaptive testing governance (11 tabs) | raw, about 894 + 433 | Dormant; 2,885-line monolith; 13 parallel reads |
| `/schedules` | S | Daily mock programmes, exam cycles | legacy, about 513 | 2,060 lines; 5 modals; 8 stacked alerts; `alert()` validation |
| `/mfa` | S (+AAL1) | Authenticator enrol / verify | **NEW** | Not in the sidebar or header (reachable only by redirect) |
| `/design-system` | S | Component preview | **NEW** | Not in the sidebar; its Dialog / Tabs / EmptyState / Pagination / Toast are unused by admin pages |

**Shell** (`app/admin/layout.tsx`, `admin-sidebar.tsx`, `admin-top-header.tsx`):
- **Header title:** comes from a route-label map that misses the factory, exams, exam-knowledge, syllabus, taxonomy, content/topics and question-reports routes, which all show "Admin Studio".
- **Header bell:** does nothing and has no label.
- **Role label:** "Super Admin" is hard-coded, even for staff.
- **"PROD" badges:** hard-coded.
- **Admin e-mail:** printed in the sidebar.
- **Active state:** a prefix match lights two items on `/questions/factory` and the wrong item on `/mock-tests-management`.
- **Active colours:** blue, amber (Premium) or rose (Live) — inconsistent.
- **No `aria-current`.**
- **Mobile drawer:** has no focus trap or Escape.

---

## 3. Functional defects found during the audit (OUT of ADMIN-UX-1 scope — need their own tickets)

These are not UI problems and must not be fixed silently inside a UI phase. I list them so the redesign does not polish broken screens.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| D-1 | High | **Community moderation cannot work.** `resolveCommunityFlagAction` updates `community_moderation_flags`, a table that does not exist, with lower-case statuses that violate the real CHECK. Every Resolve / Dismiss fails. The real table is `discussion_moderation_flags`; the RPC `fn_moderate_flagged_content` exists. | `app/admin/actions.ts:1315-1331` (its own `@ts-expect-error TYPES-1:B-ADM-COMMUNITY` says so) |
| D-2 | High | **Users list is unreliable.** `getAdminUsers` calls `auth.admin.listUsers()` on the cookie (anon-key) client and ignores the error. The admin API needs the service role, so the list may be empty. Even with the right client it returns only page 1 (50 users). | `services/admin.service.ts:1257-1262` |
| D-3 | Medium | Descriptive / institutes / community render wrong fields (`undefined Marks`, empty "verified" chip, blank target type). The service shape differs from the UI, and `@ts-expect-error` hides it. | `app/admin/{descriptive,institutes,community}/page.tsx:15`; `admin.service.ts:1577,1599,1661` |
| D-4 | Medium | The dashboard "pending moderation" count has no status filter. | `admin.service.ts:281` |
| D-5 | Medium | The question-reports KPI "Resolved" counts RESOLVED + VERIFIED, but its filter shows RESOLVED only. | `admin-question-reports-manager.tsx:61,65` |
| D-6 | Low | Live-tests sub-pages pass `path: "/admin/live-tests"` to the guard. This affects only the post-login return URL, not authorization. | `live-tests/[id]/{intelligence,results}/page.tsx` |
| D-7 | Info | One admin can submit, approve **and** publish their own question draft. There is no four-eyes rule in `transition()` or the RPCs. This is a governance decision, not a UI change. | `admin-question-factory.service.ts:338-370` |

---

## 4. The 5 daily tasks — measured today and target

Counting rules:
- A native `<select>` is 2 clicks (open + pick).
- Focusing a text field is 1 click; typing is listed but not counted.
- Every task starts on `/admin`, signed in.

| Task | Today: clicks · page loads · modals | Main friction | Target (after B–D) | How |
|---|---|---|---|---|
| **T1** Review + publish a question draft | **11** (from IN_REVIEW) / **12** (from DRAFT) + close · 1 · 1 drawer | Factory opens on "Generate"; Review tab not in the URL; 6 separate checklist boxes; Approve and Publish separate; no "next item" | **≤ 3** · 1 · 0 | Today card "Open queue" (1) → checklist confirmed with one action (1, *owner decision Q-3*) → **Approve & publish, next opens** (1). Without the checklist change: **8** (6 boxes stay; keys 1–6 toggle them) |
| **T2** Review + publish a CA draft | **6** (from IN_REVIEW) / **7** (from DRAFT) · 1 · 1 modal; +2 if a status filter hides the row after each step | Workbench modal; separate Compile click although Publish compiles; row disappears from the filtered list | **≤ 3** · 1 · 0 | Today card (1) → review drawer with "Select all checks" (1) → **Approve & publish** (1; the publish route already compiles) |
| **T3** Handle a question report | **5–7** · 1 (+1 to fix the question) · 0 | Select-based status; note in a separate field; fixing the question = navigate away | **3** · 1 · 0 | Today card opens the report in a drawer (1) → resolution as a segmented control: Fixed / Not an error / Duplicate (1) → **Save & next** (1). "Edit question" opens a second drawer, with no navigation |
| **T4** Answer a ticket | **Impossible in the UI today** (unlinked; flag off; migration 097 not applied). When enabled: 4 clicks, 1 typed-URL load, scroll through up to 200 tickets | No link, filter or search | **3** · 1 · 0 | Sidebar / Today "Tickets" (1) → open ticket in a drawer (1) → type the reply → **Send & resolve** (1). Default filter: Open, oldest first; "past 24 h" chip |
| **T5** Find a user by e-mail | **2** · 1 · 0, **but likely returns nothing** (D-2); only the first 50 users; no detail | Client-side filter over a broken list; no detail view | **1** (Ctrl/Cmd+K, type, Enter) · 0 · 0 | Global search → user result opens the user drawer (read-only summary: profile, entitlements, tickets). Needs D-2 fixed first |

---

## 5. Proposal

### 5.1 Information architecture (sidebar mapped to the real routes)

| Group | Items → routes | Notes |
|---|---|---|
| **Today** | Today → `/admin` (rebuilt) | Default landing |
| **Review** | Question drafts → `/questions/factory?tab=review` · Question reports → `/question-reports` · Current affairs review → `/current-affairs?status=IN_REVIEW` · Community flags → `/community` | Queues with live counts. Counts render only for queues the role can open |
| **Content** | Questions → `/questions` (+ Factory, Bulk import as page tabs) · Mock tests → `/mock-tests` (+ Patterns, Sections, Categories, Schedules as page tabs) · Learning → `/content` (+ Topic links `/content/topics`, Descriptive) · Current affairs → `/current-affairs` · Syllabus & taxonomy → `/syllabus` (+ `/taxonomy` admin-only) · Exams → `/exams` (+ Exam knowledge) · Media → *no route exists* (assets live in the content studio pickers; omit until a page exists) | 6 entries instead of 15 |
| **People** | Users → `/users` · Tickets → `/support` (+ grievances = tickets with category GRIEVANCE, as a filter) · Library Pro → `/pro-library` · Institutes → `/institutes` | **Grievances have no table or page.** They arrive as `support_tickets.category = 'GRIEVANCE'` |
| **Payments** | Billing → `/billing` · Premium → `/premium` | **Hidden while `PAYMENTS_ENABLED` is off** (the routes and guards stay) |
| **System** | Security (MFA) → `/mfa` · Audit log → *no standalone page* (today inside the Premium audit tab; proposal: read-only `/admin/audit` in phase C, same guard as today's tab = admin only) · Health → *no page* (`/api/health` exists; proposal: a read-only status card on Today) · Design system → `/design-system` · Settings → *no page* (`app_settings` is service-role only; out of scope) | |
| **Not live yet** (collapsed) | Live tests, Adaptive, Achievements, Rewards / Gamification (coins frozen) | Shown only when their flags are on; one folded entry, no dead links |

**Retired from navigation** (still reachable by URL, guards unchanged):
- `/mock-tests-management`: its counts move to Today.
- `/reports`: redirects to `/question-reports`.

**Sidebar rules:**
- Role-aware visibility: a link is shown only if the role passes that page's existing guard. This is UI-only; the guards still enforce.
- `aria-current="page"` with exact or longest-prefix match.
- Real `<button aria-expanded>` for groups.
- Scrolls on its own (no clipping).
- At ≥ 1280 px it is 232 px wide.
- At 768–1279 px it is a 64 px icon rail with tooltips.
- No admin e-mail printed (name + role only).

### 5.2 Today dashboard (read-only, existing guards)

Each card shows a count and one link to the already-filtered list. Amber top edge only when something is waiting or late. A zero shows as "0", never hidden (R12).

| Card | Source (exists today) | Deep link needs |
|---|---|---|
| Question drafts awaiting review (IN_REVIEW) + awaiting publish (APPROVED) | `question_versions.lifecycle_status`; reader `listReviewQueue` (`admin-question-factory.service.ts:202`) — add a count-only query | Factory tab + filter in the URL (phase C) |
| CA drafts awaiting review | `AdminCurrentAffairsService.getDashboardStats` (`admin-current-affairs.service.ts:67`) already returns per-status counts + "needs changes" | CA status filter in the URL |
| Open question reports + oldest age | `question_errata_reports` OPEN / UNDER_REVIEW; indexed (`idx_qer_staff_queue`) | Status filter in the URL |
| Open tickets + past 24 h | `support_tickets` status OPEN and `created_at < now() − 24h`. There is no `acknowledged_at` column, so "past 24 h without a staff reply" = OPEN + old (first-reply time could come from the `SUPPORT_TICKET_UPDATE` audit rows) | Shown only when `SUPPORT_TICKETS_ENABLED` is on and 097 is applied |
| Grievances open | `support_tickets` with category GRIEVANCE | same |
| Community flags pending | `discussion_moderation_flags` status PENDING (indexed) | Card links to `/community`, which cannot act until D-1 is fixed |
| Library Pro ending in 7 days | `user_entitlements` source LIBRARY | — |
| **Write failures (24 h)** | **Not available.** SILENT-FAIL only writes console log lines; nothing persists them | Needs a persisted source (a table = a migration, out of scope). **Card omitted until then** (R12: no invented values) |
| **Last nightly status** | **Not available in the app.** CI writes no artifacts and nothing calls GitHub | Needs either a GitHub API read with a new read-only token or the workflow writing a status row (migration). **Decision Q-5; card omitted until then** |
| Recently changed | `admin_audit_logs` (last 10, actor + action + time) | Admin only, matching today's audit tab access |

### 5.3 Global search (Ctrl/Cmd+K)

- **Placement:** a dialog with a combobox, results grouped by Questions / Users / Tickets, fully keyboard-operable. Each result shows an id and a short label only.
- **Execution:** results come from a server action behind `guardAdminAction` with the **same role rules as the target pages**. Staff never get user results, because Users is admin-only.
- **Questions:**
  - by id: exact match;
  - by text: `question_versions.question_text ilike` with limit 20. The existing pattern is `searchQuestionBank` (`admin-content-studio.service.ts:878`).
  - There is no trigram index, which is fine at today's size (113 questions). An index is a migration and is deferred.
- **Users:**
  - by exact e-mail: service-role paged `listUsers` (pattern `assessment.service.ts:2752`);
  - by username: `user_profiles.username ilike` (unique index exists).
  - This **depends on D-2's fix** for correctness.
- **Tickets:** by `ref` (unique) or id, exact match.
- **Not used:** `fn_universal_search` exists but indexes published learning content only, and no app code calls it.

### 5.4 One page template

From top to bottom:
1. **Header:** title + count + **one** primary action (amber, R4); secondary actions are quiet.
2. **Filter bar:** every filter is in the URL (shareable; Back works; Today deep-links).
3. **Bulk bar:** only when rows are selected; destructive actions confirm with the exact count.
4. **Table:**
   - sticky header, sortable columns;
   - rows are real buttons or links (keyboard ↑ / ↓, Enter);
   - row actions in a labelled menu.
5. **Pagination:** server-side; capped page list.
6. **Detail / edit in a right-hand DRAWER**, built on the existing Dialog primitive:
   - list and filters stay;
   - Esc closes and focus returns to the row;
   - "Open full page" for deep links.
7. **States:**
   - skeleton rows (`loading.tsx` per route);
   - empty state with "Clear filters";
   - inline error Alert with Retry;
   - no `.catch(() => [])` that hides outages (display only; the service code is unchanged unless a phase is approved for it).

**Built from existing primitives:** `components/ui/` Button, Badge, Dialog, Tabs, Field, Input, Select, Pagination, EmptyState, Alert, Toast and Container. **No new dependency** (no table library). A small `AdminTable` and an `AdminDrawer` composed from these are the only new components.

### 5.5 Review-queue speed (phase D)

- **Next item:** after Approve or Reject, the next item opens automatically; the list stays visible on the left.
- **Shortcuts:**
  - J next (skip), K previous, A approve, R reject, E edit, ? help;
  - none fire while typing;
  - all are also buttons, and all are listed on `?`.
- **Reject:** always needs a reason, chosen in one click from common reasons plus an optional note. This uses the existing "request changes / reject needs notes" server rule.
- **"Approve all simple":** only items whose automatic checks are all green. A confirm dialog lists the ids. Each one still goes through the existing server transition (no new server rule).
- **Server rules unchanged:** checklist, gates, publish RPC. D-7 (four-eyes) and Q-3 (one-action checklist) are owner decisions.

### 5.6 Visual system and status chips

- **Tokens:** the student site's (`app/globals.css`), nothing new:
  - primary Royal Blue `#2563EB` / hover `#1D4ED8`;
  - navy `#0B1B4D` sidebar;
  - amber only for the one primary action (R4);
  - Inter;
  - 8 px grid.
- **Admin density:**
  - 14 px body, 13 px table cells (never below 12 px);
  - row height 40 px;
  - controls 36 px with a 44–48 px hit area on touch.
- **One chip component, the same everywhere** (text + colour, never colour alone):

| Chip | Colour | Maps today's statuses |
|---|---|---|
| Draft | grey | question DRAFT, CA DRAFT, exam/category "inactive-but-unpublished", syllabus DRAFT |
| In review | amber | IN_REVIEW, CHANGES_REQUESTED (label "Changes requested"), report OPEN / UNDER_REVIEW, ticket OPEN |
| Approved | blue | APPROVED, CA COMPILED (label "Ready to publish"), report VERIFIED, ticket IN_PROGRESS |
| Published | green | PUBLISHED, ACTIVE, report RESOLVED, ticket RESOLVED |
| Rejected | red | REJECTED, FAILED, VALIDATION_FAILED |
| Archived | muted outline | ARCHIVED, SUPERSEDED, inactive, ticket CLOSED, REFUNDED (label kept) |

"Live" (live tests) becomes blue with a dot, not red.

### 5.7 Accessibility bar (every migrated page)

- WCAG 2.2 AA:
  - visible focus ring (the `focus-ring` token) on everything;
  - all actions keyboard-operable;
  - labels tied to fields; no placeholder-only inputs;
  - `role="dialog"` with focus trap, Esc and return focus;
  - targets ≥ 24 px (2.5.8) and ≥ 44 px for primary actions;
  - one `<main>`; labelled `<nav>`;
  - `aria-current`;
  - live regions for save results;
  - no `alert()`, `confirm()` or `prompt()`.
- Checked per phase with axe (serious / critical = 0) and a keyboard-only walk-through of the 5 tasks.

---

## 6. Wireframes (low fidelity)

These are HTML sources plus PNGs at 1440 and 1024 px in `docs/reports/ux/admin_ux_1/wireframes/`. Numbered markers refer to the legend under each page.

| File | Shows |
|---|---|
| `wf-1-shell-today.html` / `@1440.png` / `@1024.png` | Sidebar IA, header with Ctrl+K, Today cards (amber = waiting), audit + content panels |
| `wf-2-list-drawer.html` / `.png` | Standard list template: header + one primary, URL filters, bulk bar, sortable sticky table, drawer detail, states |
| `wf-3-review-queue.html` / `.png` | Question review queue: list + detail, automatic checks up front, reject reasons, Approve & next, shortcuts |

At 1024 px the sidebar becomes a 64 px icon rail, Today shows 2 cards per row, and the drawer takes 60 % of the width. The data in the wireframes is illustrative; its numbers are not live counts.

---

## 7. Phases after the go (each one: before/after screenshots, axe, all admin + security gates, the full offline list before push)

| Phase | Content | Gates that must stay green |
|---|---|---|
| **B** | New shell (sidebar IA, role-aware links, rail, single `<main>`), Ctrl+K search, Today dashboard, `loading.tsx` / `error.tsx` for `/admin` | SEC-1B, SEC-1C (page inventory and guards unchanged), SEC-1D, UX1B-SHELL, DESIGN-RATCHET, NO-PERSONAL-DATA, TYPES1 |
| **C** | Every page onto the template + chips + URL filters, starting with the 5 task pages (factory review, CA, question reports, support, users), then content, then the rest. Dormant pages last | same + per-page axe |
| **D** | Review-queue speed (next item, shortcuts, bulk approve) on question drafts, CA and question reports | same + keyboard test of T1–T3 |

**Guardrails for every phase:**
- No `requireAdminPage` / `guardAdminAction` call is changed, moved after a data read, or removed.
- No new query returns a column that the target page does not already show to the same role.
- Search results obey the target page's role.
- No migrations.

---

## 8. Screenshots of the current pages — BLOCKED (two reasons)

1. **Memory.** Signed-in admin pages need a running app. The approved method is a local `next start` through `scripts/live/with-server.cjs` (decision #69: needs ≥ 2 GB free). This machine had **848 MB free** during the audit.
2. **Public repo.** Admin pages print e-mail addresses: the sidebar, Users, Premium candidate, the syllabus publisher and the live-test drill-down. Screenshots must not be committed unmasked. CI artifacts would also be public, so CI is not an option.

**Ready-to-run plan** (needs about 2 GB free; close the browser / other apps):
- Build, then `with-server.cjs` runs a read-only capture script as the QA admin:
  - 41 routes × 1440 and 1024;
  - every non-GET request is recorded and must be 0;
  - e-mail addresses are replaced in the DOM with `•••@•••` before each screenshot.
- Output: `docs/reports/ux/admin_ux_1/before/`. The NO-PERSONAL-DATA gate runs on the result before any commit.

---

## 9. Decisions needed (owner / architect)

| # | Question | My recommendation |
|---|---|---|
| Q-1 | Approve the IA (§5.1), including hiding Payments while off and folding dormant features into "Not live yet"? | Yes |
| Q-2 | Fix D-1 (community moderation) and D-2 (users list) as separate small bug-fix tickets **before** phase C migrates those pages? | Yes. Both are server-side; neither changes authorization |
| Q-3 | T1 checklist: keep 6 separate ticks (target 8 clicks) or one "I checked all 6" confirmation (target 3)? The server still receives all 6 items | One confirmation with the 6 items listed beside it |
| Q-4 | Four-eyes rule for publishing questions (D-7)? | Owner policy. If yes, it is a server rule in a separate phase |
| Q-5 | Today: write failures + nightly status need a persisted source (migration or GitHub token). Omit the cards for now? | Omit now; propose OPS-STATUS-1 later |
| Q-6 | Audit log page (read-only, admin only) in phase C? | Yes, reuse the Premium audit query |
| Q-7 | Screenshots: free memory for a local capture now, or take "before" screenshots at the start of phase B? | Start of phase B, masked |

**STOP: phase A complete.** Waiting for review. Phases B–D start only after the go.
