# UX-1a: design system foundation and preview

> **Status:** delivered. **Waiting for owner review** before UX-1b starts.
>
> **Inputs:**
> - `docs/ux/DESIGN_SYSTEM.md`
> - `docs/ux/SITEMAP_IA.md`
> - `docs/reports/ux/UX0_DISCOVERY_REPORT.md` §7, owner decisions of 2026-10-15
>
> **Locked:**
> - clean, premium, light, trustworthy
> - primary violet `#5000F0`; accent cyan `#5CD8E6`, decorative only
> - **English only** (no i18n, no Devanagari)
> - light only
> - WCAG 2.2 AA
> - mobile first
>
> **Not included:**
> - no student page was restyled (UX-1b)
> - no new npm dependency
> - no headless UI library: every primitive is built on native elements (`<dialog>`, `<details>`, native radio / checkbox / select) plus small APG-pattern client components

## 1. Tokens (`app/globals.css`, Tailwind v4 `@theme static`)

`app/globals.css` is the only place raw colour values live. `static` emits every token as a CSS variable on `:root`, so the preview reads the live values and nothing is duplicated.

| Group | Tokens | Notes / utilities |
|---|---|---|
| Primary (violet, brand = 600) | `--color-primary-50…950` | `bg-primary-600`, `text-primary-700` |
| Accent (cyan, brand = 300) | `--color-accent-50…900` | Fills, illustration, `text-accent-900` on `accent-100`. Never text on white. |
| Ink (neutral) | `--color-ink-50…950` | `text-ink-700`, `border-ink-300` |
| Status | `--color-{success,warning,danger,info}-{50,200,600,700,800}` | 50 tint bg · 200 tint border · 600 icon / border · 700 text on white · 800 text on tint |
| Semantic aliases | `canvas`, `surface`, `surface-sunken`, `fg`, `fg-secondary`, `fg-muted`, `fg-disabled`, `fg-inverse`, `line`, `line-control`, `link`, `focus` | `bg-surface`, `text-fg-secondary`, `border-line-control` |
| Answer roles | `answer-{correct,wrong,selected}-{fg,border,bg}` | `bg-answer-correct-bg`, `border-answer-wrong-border` |
| Font | `--font-sans: var(--font-inter), system fallbacks` | Inter variable, Latin subset, `next/font/google`: **self-hosted at build, no runtime request to Google**, `display: swap` |
| Type scale | `caption` 12/16 · `body-sm` 14/20 · `body` 16/24 · `body-lg` 18/28 · `h3` 18→20 · `h2` 22→28 · `h1` 28→36 · `display` 36→48 | Fluid `clamp()`, no breakpoint jumps. **Minimum 12 px.** |
| Radius | `badge` 6 · `control` 8 · `card` 12 · `sheet` 16 | `rounded-card` |
| Elevation | `e1` · `e2` · `e3` | `shadow-e2` |
| Motion | `--ease-standard` = `cubic-bezier(.2,0,0,1)`; 120 / 200 / 300 ms | Animation only via `motion-safe:`; reduced motion stops pulse and spin (tested, A-13) |
| Focus | `@utility focus-ring`: 2 px `--color-focus` (primary-500) outline, 2 px offset, `:focus-visible` | Opt-in, so legacy pages keep their focus styles until they are migrated |
| Spacing, z-index, breakpoints | Tailwind defaults (4 px base); z: sticky 10 · header 30 · popover 40 · overlay 50 · modal 60 · toast 70 · tooltip 80 | — |

**Collision rule (enforced by ratchet R-6).** Legacy code already uses `bg-primary` (21×), `text-primary` (19×), `bg-card` (8×) and the default `rounded-sm…2xl` / `shadow-sm…2xl`. UX-1a therefore defines:
- **no** bare `--color-primary` or `--color-card`;
- **no** override of the default radii or shadows.

Legacy pages keep their exact look. The new utility names (`rounded-card`, `shadow-e1`, `text-body`, `focus-ring`, …) have 0 uses in legacy code.

## 2. Contrast (WCAG 2.2, relative-luminance formula)

- **Source:** the register `components/ui/contrast-pairs.json`, computed from the tokens by `node scripts/test_design_ratchet.cjs --table`.
- **The preview shows the same table live** (`/admin/design-system#contrast`).
- **Thresholds:**
  - text ≥ 4.5;
  - large text ≥ 3;
  - non-text ≥ 3 (WCAG 1.4.11: UI boundaries, focus, icons).
- **AAA** exists only for text (7) and large text (4.5).
- **Lowest text pair:** 4.55:1 (muted ink-500 on the page background).

**Found and fixed during the build.** In review mode, the "correct" option letter had white text on success-600: **3.77:1, which fails for 14 px text**. It now uses success-700 (5.48:1).

| Use | fg / bg | Ratio | Requirement | Result |
|---|---|---|---|---|
| Body text | `ink-900` / `surface` | 17.85:1 | text ≥ 4.5 | AAA |
| Body text on page background | `ink-900` / `ink-50` | 17.06:1 | text ≥ 4.5 | AAA |
| Secondary text | `ink-600` / `surface` | 7.58:1 | text ≥ 4.5 | AAA |
| Secondary text on page background | `ink-600` / `ink-50` | 7.24:1 | text ≥ 4.5 | AAA |
| Secondary text on sunken surface (table header, segmented tabs) | `ink-600` / `ink-100` | 6.92:1 | text ≥ 4.5 | AA |
| Muted text, placeholder | `ink-500` / `surface` | 4.76:1 | text ≥ 4.5 | AA |
| Muted text on page background | `ink-500` / `ink-50` | 4.55:1 | text ≥ 4.5 | AA |
| Link, primary text | `primary-600` / `surface` | 8.08:1 | text ≥ 4.5 | AAA |
| Link on page background | `primary-600` / `ink-50` | 7.72:1 | text ≥ 4.5 | AAA |
| Ghost button, selected tab, hovered link | `primary-700` / `surface` | 10.35:1 | text ≥ 4.5 | AAA |
| Primary button | `white` / `primary-600` | 8.08:1 | text ≥ 4.5 | AAA |
| Primary button hover | `white` / `primary-700` | 10.35:1 | text ≥ 4.5 | AAA |
| Primary button pressed | `white` / `primary-800` | 12.87:1 | text ≥ 4.5 | AAA |
| Ghost button hover, current nav item, primary badge | `primary-700` / `primary-50` | 9.11:1 | text ≥ 4.5 | AAA |
| Pro badge, selected answer text, Pro panel body | `primary-800` / `primary-50` | 11.33:1 | text ≥ 4.5 | AAA |
| Pro panel title | `primary-900` / `primary-50` | 13.44:1 | text ≥ 4.5 | AAA |
| Avatar initials | `primary-800` / `primary-100` | 9.84:1 | text ≥ 4.5 | AAA |
| Body text on selected card / option tile | `ink-900` / `primary-50` | 15.71:1 | text ≥ 4.5 | AAA |
| Neutral badge | `ink-700` / `ink-100` | 9.45:1 | text ≥ 4.5 | AAA |
| Free badge | `accent-900` / `accent-100` | 8.60:1 | text ≥ 4.5 | AAA |
| Text on the logo cyan | `ink-900` / `accent-300` | 10.56:1 | text ≥ 4.5 | AAA |
| Accent text (dark cyan) on white | `accent-700` / `surface` | 6.27:1 | text ≥ 4.5 | AA |
| Success text, positive delta | `success-700` / `surface` | 5.48:1 | text ≥ 4.5 | AA |
| Success badge / alert, correct answer text | `success-800` / `success-50` | 7.29:1 | text ≥ 4.5 | AAA |
| Correct option letter | `white` / `success-700` | 5.48:1 | text ≥ 4.5 | AA |
| Warning text | `warning-700` / `surface` | 5.02:1 | text ≥ 4.5 | AA |
| Warning badge / alert | `warning-800` / `warning-50` | 6.84:1 | text ≥ 4.5 | AA |
| Error text, negative delta, field error | `danger-700` / `surface` | 6.47:1 | text ≥ 4.5 | AA |
| Error badge / alert, wrong answer text | `danger-800` / `danger-50` | 7.60:1 | text ≥ 4.5 | AAA |
| Danger button, wrong option letter | `white` / `danger-600` | 4.83:1 | text ≥ 4.5 | AA |
| Danger button hover | `white` / `danger-700` | 6.47:1 | text ≥ 4.5 | AA |
| Info text | `info-700` / `surface` | 5.93:1 | text ≥ 4.5 | AA |
| Info badge / alert | `info-800` / `info-50` | 7.09:1 | text ≥ 4.5 | AAA |
| Tooltip | `white` / `ink-900` | 17.85:1 | text ≥ 4.5 | AAA |
| Score display (36-48px) | `ink-900` / `surface` | 17.85:1 | large ≥ 3 | AAA |
| Control border (input, select, secondary button) | `ink-500` / `surface` | 4.76:1 | nontext ≥ 3 | Pass |
| Focus ring | `primary-500` / `surface` | 6.85:1 | nontext ≥ 3 | Pass |
| Focus ring on page background | `primary-500` / `ink-50` | 6.54:1 | nontext ≥ 3 | Pass |
| Switch track (off) | `ink-500` / `surface` | 4.76:1 | nontext ≥ 3 | Pass |
| Switch thumb on track (off) | `white` / `ink-500` | 4.76:1 | nontext ≥ 3 | Pass |
| Switch track (on), selected option border | `primary-600` / `surface` | 8.08:1 | nontext ≥ 3 | Pass |
| Progress fill on track | `primary-600` / `ink-200` | 6.55:1 | nontext ≥ 3 | Pass |
| Correct-answer border / icon | `success-600` / `surface` | 3.77:1 | nontext ≥ 3 | Pass |
| Wrong-answer border / icon | `danger-600` / `surface` | 4.83:1 | nontext ≥ 3 | Pass |
| Warning icon | `warning-700` / `warning-50` | 4.84:1 | nontext ≥ 3 | Pass |
| Not-started topic icon | `ink-500` / `surface` | 4.76:1 | nontext ≥ 3 | Pass |
| Logo cyan on white: decorative only, never text | `accent-300` / `surface` | 1.69:1 | decorative | decorative only |
| Disabled control label | `ink-600` / `ink-200` | 6.15:1 | disabled | exempt (disabled) |
| Disabled text (ink-400) | `ink-400` / `surface` | 2.56:1 | disabled | exempt (disabled) |

## 3. Components (`components/ui/`)

**Conventions:**
- **Server components** unless marked *client*.
- **Classes:** all components use `cn()` from `components/ui/cn.ts`. Its tailwind-merge config knows the token names, so `text-body` (a size) and `text-fg` (a colour) don't cancel each other.
- **Legacy primitives:**
  - The pre-UX-1 primitives (button, badge, card, input, alert, skeleton, container) **moved unchanged to `components/ui/legacy/`**.
  - 368 imports in 150 files were rewritten mechanically, so legacy pages look exactly as before.
  - UX-1b migrates them, and the ratchet counts the `legacyImport`s.

| Component | File | Variants / states | Accessibility |
|---|---|---|---|
| Button, ButtonLink | `button.tsx` | primary · secondary · ghost · danger; sm 36 / md 44 / lg 52; icon-only; leading / trailing icon; disabled; **loading** (spinner, keeps width, `aria-busy`, label stays in the a11y tree) | Native `<button>`; icon-only requires `aria-label` |
| TextLink | `link.tsx` | inline (underlined) · standalone (chevron) · nav (`aria-current="page"`) · external | External adds "(opens in a new tab)" for screen readers and `rel="noopener noreferrer"` |
| Field, FieldGroup | `field.tsx` | label · help · error · required | `<label for>`; the control gets `id`, `aria-describedby` (help + error) and `aria-invalid`; groups use `<fieldset>` + `<legend>` |
| Input, Textarea | `input.tsx` | prefix / suffix · valid · error · read-only · disabled | 44 px; ink-500 border (4.76:1) |
| Select | `select.tsx` | placeholder · options · error · disabled | Native `<select>` |
| Checkbox *(client)* | `checkbox.tsx` | default · checked · **indeterminate** · disabled · tile | The whole row is the label (≥44 px) |
| Radio | `radio.tsx` | default · checked · disabled · **tile** (option card) | Native radios; arrow keys move within the group |
| Switch | `switch.tsx` | off · on · disabled | Native checkbox with `role="switch"`; the ring is on the track |
| Card (+ Header, Title, Description, Body, Footer, CardLink) | `card.tsx` | plain · interactive (one stretched link, hover e1, ring on the card) · selected · loading | No nested links |
| Badge | `badge.tsx` | neutral · primary · success · warning · danger · info · **Pro** (lock) · **Free** | ≥12 px; the meaning is in the text |
| Tag *(client)* | `tag.tsx` | removable | Remove button named "Remove ‹label›" |
| Tabs *(client)* | `tabs.tsx` | underline · segmented; disabled tab; controlled (ready for URL sync) | APG: arrows / Home / End, roving tabindex, labelled panels |
| Accordion *(client)* | `accordion.tsx` | single · multiple; default open | heading › `button[aria-expanded]` › labelled region |
| Dialog *(client)* | `dialog.tsx` | modal · **sheet** (bottom on phones) · fullscreen; **non-dismissible** (submit confirmation) | Native `showModal()` (inert background, focus trap), Esc, backdrop click, focus returns to the trigger, `aria-labelledby` / `aria-describedby` |
| Toast *(client)* | `toast.tsx` | success · info (auto 5 s, paused on hover / focus) · error (persistent) | Two live regions created up front: `role="status"` (polite) and `role="alert"` (assertive) |
| Tooltip *(client)* | `tooltip.tsx` | top · bottom | On hover **and** focus; hoverable; Esc dismisses (WCAG 1.4.13); `aria-describedby` |
| ProgressBar, ProgressRing, ProgressSteps | `progress.tsx` | value · indeterminate · success tone; ring; steps (done / current / upcoming) | `role="progressbar"` + `aria-valuetext` ("7 of 12 topics"); steps use `aria-current="step"` |
| StatTile | `stat-tile.tsx` | value · delta up / down / flat (`invert` for "lower is better") · empty "—" · loading | The delta always has text |
| EmptyState | `empty-state.tsx` | first use · no results · coming soon | Decorative icon; one action |
| Skeleton | `skeleton.tsx` | text lines · block · circle | `aria-hidden`; pulses only with `motion-safe` |
| Pagination | `pagination.tsx` | numbered with gaps (desktop) · "Page X of Y" (mobile) | `nav[aria-label=Pagination]`, `aria-current` |
| Breadcrumb | `breadcrumb.tsx` | full (desktop) · parent back link (mobile) · optional BreadcrumbList JSON-LD | `nav[aria-label=Breadcrumb]` |
| Alert / notice | `alert.tsx` | info · success · warning · danger; title; action; `live` | Hidden tone label; `role="alert"` / `"status"` only when live |
| Avatar | `avatar.tsx` | image · initials; sm / md / lg; decorative | Initials use `role="img"` with a name |
| Divider | `divider.tsx` | horizontal · labelled ("or") · vertical | `role="separator"` |
| Container, Section, Stack | `layout.tsx` | default 1200 · reading 720 · full; section rhythm 48 / 64; stack gap scale | — |
| Spinner | `spinner.tsx` | — | Decorative |

**Domain components (`components/ui/domain/`):**

| Component | Data | States shown in the preview |
|---|---|---|
| ExamCard | props: name, body, initials, next date, counts, cycle | directory · your exam · compact. Unknown dates are omitted, never guessed. |
| TestCard | props | available (Start) · in progress (Resume) · attempted (score, View result) · scheduled (opening date) · Pro-locked (Unlock with Pro) · closed. The CTA always names the action. |
| SubjectNode / TopicNode / WeightageChip | props | not started · in progress · mastered · Pro-locked · current; weightage chip; native `<details>`; nested list (no ARIA tree) |
| QuestionRenderer | **existing** `OptionItem` / `reviewQuestions` shape | test (native radio group, selected, marked for review) · review correct · review wrong · skipped. Right / wrong uses icon **and** text ("Your answer", "Correct answer"). |
| ResultSummary | **existing** `TestResultSummary` (`result`, `test`, `sections`) | score hero, accuracy ring, attempt tiles, section table (the text alternative), retake delta. Percentile and rank appear only when the service provides them. |
| ProLockPanel | props | inline · card · interest recorded. The correct answer is never paywalled. |
| PricingCard | props | Free (current plan) · Pro (recommended, opening soon) · Pro annual; ₹ in en-IN format; GST note |

**Supporting code:** `lib/format/index.ts` (en-IN numbers, ₹, dates in Asia/Kolkata, durations, scores, percentages).

## 4. Dark mode disabled at the source

- **The variant is inert.** `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`, and nothing ever sets `data-theme`.
- **The 382 `dark:` classes in student scope** (419 including admin) **stay in place but can no longer fire**. They are removed in UX-1b, under the ratchet.
- **`color-scheme: light`** on `:root` keeps form controls and scrollbars light.
- **Enforced by ratchet R-3:** no `prefers-color-scheme`, no `data-theme` setter, no dark-class toggles.

## 5. Preview: `/admin/design-system`

- **Guard:**
  - `requireAdminPage({ allowStaff: true })` is the first awaited call;
  - `force-dynamic`;
  - `robots: noindex, nofollow` (`/admin/` is also disallowed in robots.txt);
  - sample data only, no data fetching.
- **Contents:**
  - every token: scales with live values, aliases, the contrast table, type, radius, elevation, spacing, motion, focus;
  - every component state in §3, including the domain components.
- **Inventory changes:**
  - SEC-1C's page inventory goes 34 → 35;
  - the page joins the `admin-pages` signed-in smoke.

## 6. Design ratchet (decision #40): `scripts/test_design_ratchet.cjs`

- **Baseline:** `docs/reports/ux/UX1_DESIGN_RATCHET.json`.
- **Scope:** `app/` + `components/`, **excluding** `app/admin` and `components/admin`.
- **Rule:** counts may only fall. `--write` refuses to record a rise.

| Metric | Baseline |
|---|---|
| `rawColor`: hex / rgb() / hsl() / oklch() literals outside the token file | **2** (`app/layout.tsx` themeColor `#2563eb`; one `rgba()` arbitrary shadow in the mock player) |
| `paletteClass`: Tailwind palette colour classes not mapped to tokens | **5,964** |
| `darkClass`: `dark:` classes (inert) | **382** |
| `smallText`: text below 12 px (`text-[10px]`, `fontSize: 11`, …) | **489** (1,475 including admin) |
| `legacyImport`: imports of `components/ui/legacy/*` | **241** |

Largest areas by palette classes:

| Area | Palette classes | `dark:` classes |
|---|---|---|
| `components/assessment` | 829 | |
| `components/mistakes` | 703 | |
| `components/live-test` | 354 | |
| `components/premium` | 347 | |
| `components/layout` | 343 | |
| `components/current-affairs` | 329 | 141 |
| `components/learning` | 269 | 133 |

**Other checks in the same suite:**

| Check | What it enforces |
|---|---|
| R-2 | The design system itself (36 files in `components/ui/**` excluding legacy, plus `lib/format`) **scores 0 on every metric** |
| R-3 | Dark mode is inert (§4) |
| R-4 | Exactly one `next/font` family, with no external font URL and no Devanagari font |
| R-5 | Every contrast pair passes |
| R-6 | Token names don't collide with legacy class names, and the `cn()` registry is complete |

## 7. Tests and gates

Run on a local production build (`next start -p 3100`).

**New UX-1a a11y smoke:** `scripts/test_ux1a_a11y.cjs` (Playwright, signed in as qa-admin, localhost only). **25/25.**
- At 390 / 768 / 1440 px:
  - the page renders with no page or console errors;
  - all 140 interactive elements have an accessible name;
  - no text is below 12 px;
  - every visible text meets contrast (computed in the page);
  - one h1, no skipped heading levels, no duplicate ids;
  - no horizontal overflow.
- Interaction checks:
  - **Keyboard:** 92 tab stops, every one with a visible ≥2 px ring.
  - **Tabs:** arrows / Home / End work, and the disabled tab is skipped.
  - **Dialog:** focus moves in and stays in, Esc closes, and focus returns. The non-dismissible dialog ignores Esc.
  - **Tooltip:** shows on focus, Esc hides it.
  - **Toasts:** announced through the live regions.
  - **Accordion** and **reduced motion** behave as specified.

| Gate | Result |
|---|---|
| tsc / lint / build | 0 / 0 / OK |
| design ratchet | 6/6 |
| test_types1 / test_types1_close | 8/8 · 3/3 |
| test_no_runtime_db | 4/4 |
| SEC-1B / 1C / 1D offline | 26/26 · 22/22 (inventory 35) · 14/14 |
| SEC-HOTFIX-4 RLS (incl. P-6) | 6/6 |
| QA identity guard / HOTFIX-2 | 8/8 · 5/5 |
| Signed-in smoke `admin-pages` (incl. `/admin/design-system`), `staff-content`, `student-pages` | all passed |

The a11y suite caught two defects during the build, both fixed:
- **Duplicate ids.** Two question renderers for the same question number shared their ids; `useId` now generates them.
- **Contrast.** The white-on-success-600 option letter (§2).

## 8. Screenshots (`docs/ux/ux1/preview/`)

| File | What |
|---|---|
| `design-system-390.png` | Full preview at 390 px (phone) |
| `design-system-1440.png` | Full preview at 1440 px (desktop) |
| `section-buttons-390.png`, `section-forms-390.png`, `section-domain-390.png` | Key sections on a phone |
| `section-{colour,contrast,type,buttons,forms,cards,feedback,domain}-1440.png` | Each section at desktop width |

## 9. Visible side effects on existing pages

These are the only changes students can see.

1. **Font.** Body text changes from the system stack to **Inter**. It is self-hosted (Latin), with `display: swap` and a size-adjusted fallback, so there is no layout shift. Glyph shapes differ slightly; sizes, colours and layout are unchanged.
2. **Dark-OS visitors.** Visitors whose OS is in dark mode no longer get accidental, partly-dark pages; every page is light, as designed. Light-mode visitors see no change from this.

**Nothing else changes:**
- Legacy primitives moved byte-for-byte.
- No token overrides a class legacy code uses (R-6).
- Root `<body>` classes and the legacy `:root` variables are unchanged.

**Deliberately left for UX-1b:** `themeColor` `#2563eb` (the blue browser-chrome tint on mobile) becomes violet when the app shell is restyled.

## 10. Findings for the owner / architect

- **English-only conflict in admin.** The admin Bulk Import Studio (`components/admin/admin-bulk-import-studio.tsx`) still offers a **Hindi (Devanagari) AI-generation option** for questions. It is not a font and not student UI, but it conflicts with the English-only decision. Recommendation: remove the option in UX-1b or a small admin cleanup.
- **Admin is outside the ratchet**, by instruction. The admin area has its own ~986 small-text and 37 `dark:` uses; a later admin pass can extend the scope.

## 11. Owner review requested (stop point)

Please review either of these:
- the screenshots in `docs/ux/ux1/preview/`;
- **`/admin/design-system`** on production, signed in as admin (staff can view too).

**UX-1b** (migrating student pages onto the components, removing `dark:`, lowering the ratchet) starts only after your approval.
