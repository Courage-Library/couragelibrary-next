# UX-1b: app shell and design-system application

> **Status:** delivered. **Waiting for owner review** of the live site and the screenshots.
>
> **Scope (architect, 2026-10-16):**
> - a public shell and a signed-in student shell;
> - internal / dev labels removed from student UI;
> - brand theme colour;
> - `dark:` classes removed;
> - the shell on tokens.
>
> **Not in scope:** page content (landing, exams, …) is not redesigned; that is UX-2+.
>
> **Also delivered in this commit:** ruling 2, English only in the admin Bulk Import Studio (decision #35).
> - SEC-HOTFIX-5 (ruling 1) was committed separately (`e269b95`); see `docs/reports/sec/SEC_HOTFIX5_REPORT.md`.

## 1. Shell (`components/shell/`)

| File | Role |
|---|---|
| `app-shell.tsx` (server) | Wraps every route: **skip link** → header → **`<main id="main-content" tabIndex=-1>`** (at least one viewport tall, so the footer never jumps while content streams in) → footer → student bottom nav. It reads the session once with `auth.getUser()` and makes **no database queries**. The old header made 2 admin-client queries per page (coins, streak). |
| `header-bar.tsx` (client) | **Signed out:** logo · Exams · Mock tests · Learn ▾ · Current affairs · Pricing · **Log in / Sign up**. **Signed in (desktop):** logo · Dashboard · Tests · Mistakes · Learn ▾ · Exams · Current affairs · **Account ▾**. Below `lg`, a menu button opens a **native-dialog sheet** (focus trap, Esc, focus returns). Hidden on `/admin`. |
| `nav-menu.tsx` (client) | Disclosure menus (Learn, Account): a button with `aria-expanded`, ordinary links; Esc closes and returns focus; outside click or navigation closes |
| `account-links.tsx` (client) | Name / email, Notifications, Wallet, Rewards store, Billing, Plans and pricing, **Admin studio** (staff / admin only, from the JWT role; the page authorizes itself), **Sign out** (existing `logoutAction`) |
| `bottom-nav.tsx` (client) | Signed-in only, below `lg`: **Dashboard · Tests · Mistakes · Learn · Account**. Icon + always-visible label, `aria-current="page"`, ≥56 px targets. Safe-area padding (`viewport-fit=cover`). A server-rendered spacer of the same height means nothing shifts. **Account** opens a sheet. Hidden on `/admin` and in the test console (`/mock-tests/*/take`, `/live-tests/*/take`). |
| `site-footer.tsx` (client) | Brand + tagline; Prepare / Read / Community link groups; copyright. Hidden on `/admin`. |
| `nav-config.ts` | The single source of every shell link. Flagged items (Courses, Battles) appear only when the server-evaluated flag is on (`visibleItems`). |
| `components/brand/logo.tsx` | Migrated to tokens (ink wordmark instead of the blue gradient). With `href` it is one link named by the site name. |

**Admin keeps its own layout.** On `/admin` the shell renders only `<main>`, as before.

### Links: only routes that work today

The routes were checked on a local production build, anonymous and as qa-student. `scripts/test_ux1b_shell.cjs` U-2 now fails on any shell `href` without an `app/` route.

**Linked:** `/`, `/exams`, `/mock-tests`, `/practice`, `/articles`, `/flashcards`, `/descriptive`, `/current-affairs`, `/pricing`, `/community`, `/institutes`, `/auth/login`, `/auth/signup`. Signed in, also `/dashboard`, `/mistakes`, `/notifications`, `/wallet`, `/store`, `/billing`, and `/admin` for staff.

**Omitted (UX-2 builds them).** None of these routes exists today:

| Item | Status | Where it would go |
|---|---|---|
| About | 404 | footer |
| CNTS | no route found under any name | footer |
| Contact | 404 | footer |
| Privacy | 404 | footer (legal) |
| Terms | 404 | footer (legal) |
| Profile / Settings | 404 | bottom-nav "Account" (today it opens the account sheet instead) |

**Flag-gated, off today (not-found):** Courses and Battles appear automatically when their flags are on. `/performance`, `/achievements`, `/certificates` and `/live-tests` are not linked.

## 2. Dev labels removed (student UI)

**39 copy fixes in 28 files.** For example:
- "Phase 3J SRS" badge removed;
- "Phase 3C learning telemetry" → "What you studied recently";
- "Phase 3I Authoritative Monetization" → "Plans and pricing";
- "Mock Tests Command Center" → "Mock tests";
- "Server-authoritative internal reward currency…" → "Coins you earn by studying and taking tests.";
- "Deterministic Engine" badge removed;
- "SM-2 SRS" → "Spaced revision";
- "canonical Question Bank question" → "practice question";
- "Content UUID Reference" → "Content ID".

**Permanent static test** (`test_ux1b_shell.cjs` U-1): comments are stripped first, and student-facing `app/` + `components/` (admin and api excluded) may not contain any of:
- `Phase N`
- `Pilot`
- `Command Center`
- `authoritative`
- `deterministic`
- `telemetry`
- `SRS`
- `SM-2`
- `UUID`
- `canonical Question Bank / curriculum`
- `taxonomies`
- `debug`
- visible `Supabase`

## 3. Theme colour, manifest

- **theme-color:** `viewport.themeColor` is violet `#5000f0` (was blue `#2563eb`), from `config/brand.ts`.
- **Web manifest:** the new `app/manifest.ts` serves `/manifest.webmanifest` (theme violet, background ink-50, logo icon).
- **`config/brand.ts`** is the only colour literal outside the token file. Ratchet **R-7** fails if it drifts from `--color-primary-600` / `--color-ink-50`.
- **Favicon:** still `public/images/logo.png`, which is already the brand mark. An SVG favicon set needs owner brand assets (UX-0 §4.6).

## 4. Ratchet (decision #40)

| Metric | UX-1a baseline | UX-1b | Change |
|---|---|---|---|
| `darkClass` | 382 | **0** | 380 classes stripped in 24 files (inert since UX-1a; class strings only); the 2 comment mentions in `globals.css` reworded |
| `paletteClass` | 5,964 | **5,232** | −732 (old header / nav / footer deleted, logo migrated, `dark:` pairs) |
| `smallText` | 489 | **467** | −22 |
| `legacyImport` | 241 | **236** | −5 |
| `rawColor` | 2 | **1** | layout `themeColor` moved to `config/brand.ts`; one `rgba()` shadow remains in the mock player |

**New zero-scope (R-2):** `components/shell/**` and `components/brand/**` must score 0 on every metric (45 files with the design system). The baseline is re-recorded in `docs/reports/ux/UX1_DESIGN_RATCHET.json`.

## 5. Tests and gates

Run on a local production build (`next start -p 3100`).

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| Design ratchet | 7/7 (R-7 new) |
| UX-1b shell (static) | 6/6 |
| **UX-1b shell a11y** | **75/75** |
| UX-1a a11y (design-system page) | 25/25 |
| test_types1 / test_types1_close / B6 | 8/8 · 3/3 · 5/5 |
| test_no_runtime_db | 4/4 |
| RLS suite (SEC-HOTFIX-4 + 5) | 7/7 |
| SEC-1A | 20/20 |
| SEC-1B / 1C / 1D offline | 26/26 · 22/22 · 14/14 |
| SEC-1B / 1C / 1D **live** (local build) | 32/32 · 29/29 · 19/19 |
| DRIFT-1c / GAP2-2b (updated) | 46/46 · 18/18 |
| QA identity guard / HOTFIX-1 / HOTFIX-2 | 8/8 · 4/4 · 5/5 |
| Signed-in smokes `student-pages`, `admin-pages`, `staff-content` | all passed |
| **E2E student journey** (qa-student) | **13/13** |
| Mistake lineage (DB) / signed-in smoke `student-mistake` | 6/6 · all passed (run on fresh journey data) |
| Cleanup | `E2E_KEEP_USER=1`, data only; identity kept |

**Notes on ordering:**
- **`student-mistake` smoke.** It depends on qa-student having a submitted attempt. In the first batch it ran *before* the journey and failed on empty data (0 mistakes, no result link). Run after the journey, it passes.
- **Lineage assertions.** The first batch reported 5/6 right after the journey; the batch printed only the summary line, so the failing assertion is not known. The re-run on fresh journey data gave **6/6**. The data was cleaned between runs, so the first result could not be inspected.
- **Sign-in timeouts.** A repeat journey timed out at sign-in (auth rate limiting after many sign-ins in a row). The retry after a pause passed 13/13.

**New suites:**

| Suite | Checks |
|---|---|
| `scripts/test_ux1b_shell.cjs` (offline) | U-1 dev labels; U-2 no dead links; U-3 skip link / one `main` / landmarks / dialog menus / bottom nav hides in admin and the console with an in-flow spacer; U-4 old layout gone; U-5 no DB in the shell; U-6 English-only import |
| `scripts/test_ux1b_shell_a11y.cjs` (Playwright, qa-student, localhost only) | Public `/`, `/exams` and student `/dashboard`, `/mistakes` at 390 / 768 / 1440, see below |

The a11y suite checks, for each page and width:
- **S-1 landmarks:** one banner, one `main#main-content`, one contentinfo, and uniquely named navs.
- **S-2 skip link:** it is the first Tab stop and moves focus to `<main>`.
- **S-3 shell controls:** all named, text ≥12 px, contrast passes.
- **S-4 fit:** header, footer and bottom nav fit the viewport.
- **S-5 bottom nav:** students only, below 1440 px; 5 items, ≥44 px targets, `aria-current`; it never covers the footer.
- **S-6 layout shift:** CLS ≤ 0.1.

Interaction checks:
- **S-7 (1440 px):** the Learn and Account menus work by keyboard.
- **S-8 (390 px):** the mobile menu traps focus, closes with Esc and returns focus.
- **S-9 (390 px):** the account sheet from the bottom nav works.

**Found and fixed by the a11y suite during the build:**
- **Footer overlap.** The bottom nav covered the last 1 px of the footer (the 1 px border wasn't in the spacer); the spacer is now 65 px plus the safe area.
- **Layout shift.** CLS reached 0.22 on pages whose content streams in after the shell: the footer jumped. `<main>` now has `min-h-dvh`.

**Tests updated for the deleted `components/layout/*`** (same invariants, new files):
- DRIFT-1c NAV battles gate
- GAP2-2b S-03 courses gate
- TYPES-1 B6 file list

## 6. Before / after screenshots (`docs/ux/ux1/shell/`)

`before-*` comes from the UX-1a build (`59edf3f`); `after-*` from this build. Both are full-page JPEGs at 390 and 1440 px.

| Page | Visitor | Files |
|---|---|---|
| Home | anonymous | `{before,after}-home-{390,1440}.jpg` |
| `/exams` | anonymous | `{before,after}-exams-{390,1440}.jpg` |
| `/mock-tests` | anonymous | `{before,after}-mock-tests-{390,1440}.jpg` |
| `/auth/login` | anonymous | `{before,after}-login-{390,1440}.jpg` |
| `/articles` | anonymous | `{before,after}-articles-{390,1440}.jpg` |
| `/mistakes` | qa-student | `{before,after}-mistakes-{390,1440}.jpg` |
| `/dashboard` | qa-student | `{before,after}-dashboard-{390,1440}.jpg` |

**Note:** in full-page captures a `position: fixed` element (the student bottom nav) is drawn where the viewport was, so it can appear mid-image. On a real phone it sits at the bottom of the screen.

## 7. Visible changes

1. **Header.**
   - New nav, as in §1.
   - "Sign In / Get Started" becomes "Log in / Sign up".
   - The coins and streak chips are removed from the header. The values remain on the dashboard and the wallet.
   - The old dropdowns are replaced: Exams, Practice, Learn, Community and Store become the flat nav plus one Learn menu.
   - The logo wordmark is ink, not the blue gradient.
2. **Mobile.**
   - A menu sheet replaces the old overlay.
   - Signed-in students get the **bottom nav**.
3. **Footer.** Link groups plus copyright; the old one-line footer is gone.
4. **Dev labels.** Replaced by plain wording (§2).
5. **Body.** The background and text colour are now tokens (`canvas` / `fg`, the same values as before); text selection is tinted violet.
6. **Browser chrome.** The mobile theme colour is violet.
7. **Dark-OS visitors.** No change since UX-1a (already light); the inert classes are now deleted.

**Not changed:** page content and layout, colours inside pages (UX-2+), and admin.

## 8. Follow-ups

- **Hindi elsewhere in admin (decision #35).** The question manager (language select and filter), the schedules manager ("Hindi Medium") and the importers still accept or label Hindi. The Bulk Import Studio preview still shows a pasted CSV's `language` value. The ruling covered only the studio option; recommend an admin English-only cleanup.
- **The shell container is `max-w-7xl` (1280 px)** to line up with today's page containers. The token is 1200 px; both move together when UX-2 migrates the page containers.
- **Missing routes for UX-2:** About, Contact, Privacy, Terms, Profile / Settings (§1).
- **`user_battle_stats`:** no SELECT grant for `authenticated` (SEC-HOTFIX-5 observation); this is a battles-feature decision.
