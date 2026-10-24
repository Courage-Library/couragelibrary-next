# Courage Library Design System (UX-0 spec)

> One design system for every student page (#30). Clean, premium, light, trustworthy.
> - Light-first and mobile-first.
> - One primary colour plus a restrained accent.
> - Semantic colours only for success / error / right / wrong.
> - WCAG 2.2 AA throughout, and bilingual-ready (English + Hindi).
>
> Status: spec for review. It is implemented in UX-1 (tokens and primitives); no code changes in UX-0.

## 0. Where we start (evidence: discovery report, section 1b)

- **Tailwind v4, but no tokens.** There is no `@theme` block, and eight `:root` variables are never wired into Tailwind.
- **Colour sprawl:**
  - 16 hue families, 157 distinct shades and 705 distinct colour classes.
  - Six competing "primary" hues: blue, indigo, purple, violet, sky and cyan.
  - Two neutral palettes: slate and gray.
- **Type sprawl:**
  - 17 font sizes, including **1,479 uses below 12px** (7–11px). These are illegible for Devanagari.
  - Bold, extrabold or black weight dominates (2,758 uses).
- **Shape sprawl:** 8 radius sizes and 9 shadow sizes.
- **Accidental dark mode.** There are 417 `dark:` classes but no dark-mode strategy. A visitor with a dark OS sees partly-dark pages.
- **No font loading.** Text uses the system stack, and there is no Devanagari font.
- **Primitives bypassed.** There are 7 primitives, against 570 raw `<button>` and 298 raw `<input>` usages, and no Modal, Tabs, Select or Tooltip.
- **Brand.** The only brand asset is `public/images/logo.png` (245×229). It is also used as the favicon and the OG image. Its colours are logo cyan `#5CD8E6` (main shape) and logo violet `#5000F0` (offset shape).

## 1. Colour

> **Superseded by BRAND-1 (decision #70, 2026-10-24): Navy + Saffron.** The violet / cyan choice below is kept as history only. The logo artwork is unchanged.
>
> - **Tokens:** `app/globals.css` is the only source; `config/brand.ts` is a gated mirror.
> - **Primary:** navy `#1E3A8A` (`primary-600` / `brand`), used for headers, primary buttons and the focus ring.
> - **Interactive:** `#1D4ED8` (`primary-500` / `interactive` / `link`), used for links.
> - **Accent:** saffron `#F59E0B` (`accent-500`), fill only, with `#0F172A` text on it.
> - **Accent text:** `#B45309` (`accent-700` / `accent-text`).
> - **Success:** `#047857` (`success-700`).
> - **Error:** `#BE123C` (`danger-700`), errors only.
> - **Warning:** the accent family.
> - **Info:** the primary family.
> - **Text and surfaces:** text `#0F172A`, muted `#475569`, page `#F8FAFC`, surface `#FFFFFF`, border `#E2E8F0`.
>
> **Rules:**
> - 60% neutral, 30% primary, 10% accent;
> - at most one accent CTA per screen;
> - right / wrong is never shown by colour alone (icon + text);
> - in the exam engine, no red except errors, and the timer is neutral, turning to the accent only in the final minutes.
>
> **Legacy Tailwind palette classes** (`bg-blue-600`, `text-slate-500`, …) resolve to these brand scales, as aliases defined in the token file:
> - blue / indigo / violet / purple / sky / cyan → primary;
> - amber / yellow / orange → accent;
> - emerald / green / teal / lime → success;
> - red / rose / pink / fuchsia → danger;
> - slate / gray / zinc / neutral / stone → ink.
>
> **Gates:**
> - `scripts/test_brand1.cjs` (values, contrast, no colour literals, email templates, exam rules);
> - design ratchet R-5 / R-7 / R-8.

### 1.1 Primary colour (derived from the logo)

The logo has two colours, and only one of them can carry text:

| Logo colour | Contrast on white | Use |
|---|---|---|
| Violet `#5000F0` | 8.08:1 (AAA) | Can carry text, links and buttons. **It is the primary.** |
| Cyan `#5CD8E6` | 1.69:1 (fails) | Can never be text on white. **It becomes the accent:** highlight fills, progress tracks, illustration and the logo, always paired with dark ink text (ink-900 on cyan is 10.56:1). |

This gives exactly "one primary + restrained accent". It also ends today's blue/indigo/purple drift, because indigo-violet *is* the brand.

**Option B (fallback, if the owner rejects violet):** "Trust blue" `#1D4ED8` (6.70:1 on white), keeping today's blue habit. This option breaks with the logo, so it is not recommended (open question 1).

### 1.2 Scales

| Token | Primary (violet, brand = 600) | Accent (cyan, brand = 300) | Ink / neutral (cool slate) |
|---|---|---|---|
| 50 | `#F3EEFF` | `#EBFBFD` | `#F8FAFC` |
| 100 | `#E6DCFF` | `#CCF4F9` | `#F1F5F9` |
| 200 | `#CBB8FF` | `#9DE9F2` | `#E2E8F0` |
| 300 | `#A88AFF` | **`#5CD8E6`** | `#CBD5E1` |
| 400 | `#8454FB` | `#2CC3D6` | `#94A3B8` |
| 500 | `#6420F5` | `#12A6BA` | `#64748B` |
| 600 | **`#5000F0`** | `#0E8494` | `#475569` |
| 700 | `#4200C4` | `#106A77` | `#334155` |
| 800 | `#35009C` | `#135661` | `#1E293B` |
| 900 | `#29007A` | `#144852` | `#0F172A` |
| 950 | `#18004A` | — | `#020617` |

**Semantic colours:**

| Role | Usage | fg (text) | strong (icon / border) | bg (tint) |
|---|---|---|---|---|
| success | completion, positive delta, saved | `#047857` | `#059669` | `#ECFDF5` |
| error | validation, failure, destructive | `#B91C1C` | `#DC2626` | `#FEF2F2` |
| warning | expiring, at-risk streak, unsaved | `#B45309` | `#D97706` | `#FFFBEB` |
| info | neutral notices (not primary) | `#0369A1` | `#0284C7` | `#F0F9FF` |
| answer-right | correct option in solutions/review | `#065F46` | `#059669` (2px border + ✓ icon) | `#ECFDF5` |
| answer-wrong | the candidate's wrong pick | `#991B1B` | `#DC2626` (2px border + ✗ icon) | `#FEF2F2` |
| answer-selected (in test, no verdict) | current selection while testing | `#35009C` | `#5000F0` | `#F3EEFF` |

**Rules:**
- **Right/wrong never relies on colour alone.** Always pair it with an icon and a text label ("Your answer", "Correct answer"), for colour-blind users (WCAG 1.4.1).
- **No other hues in student UI.** Amber, emerald, rose and indigo are replaced by the semantic roles above. Charts use the primary scale, plus accent-600 for series 2 and ink-400 for comparison.
- **No gradients** except one brand gradient for marketing heroes (primary-600 → primary-800), and never behind text smaller than 24px.

### 1.3 Semantic aliases (what components use)

`--color-bg` (ink-50) · `--color-surface` (#FFFFFF) · `--color-surface-raised` (#FFFFFF + elevation) · `--color-surface-sunken` (ink-100) · `--color-text` (ink-900) · `--color-text-secondary` (ink-600) · `--color-text-muted` (ink-500) · `--color-text-disabled` (ink-400; not for essential text) · `--color-border` (ink-200, decorative dividers) · `--color-border-control` (ink-500, input / checkbox boundaries, ≥3:1) · `--color-link` (primary-600) · `--color-focus` (primary-500).

### 1.4 Contrast proof (computed with the WCAG relative-luminance formula)

| Pair | fg / bg | Ratio | Result |
|---|---|---|---|
| primary-600 text on white | `#5000F0` / `#FFFFFF` | 8.08 | AAA |
| white on primary-600 (button) | `#FFFFFF` / `#5000F0` | 8.08 | AAA |
| white on primary-700 (hover) | `#FFFFFF` / `#4200C4` | 10.35 | AAA |
| primary-700 on primary-50 (selected chip) | `#4200C4` / `#F3EEFF` | 9.11 | AAA |
| primary-800 on primary-100 | `#35009C` / `#E6DCFF` | 9.84 | AAA |
| primary-600 on bg (ink-50) | `#5000F0` / `#F8FAFC` | 7.72 | AAA |
| accent-300 (logo cyan) on white | `#5CD8E6` / `#FFFFFF` | 1.69 | **decorative only** |
| ink-900 on accent-300 | `#0F172A` / `#5CD8E6` | 10.56 | AAA |
| accent-900 on accent-100 | `#144852` / `#CCF4F9` | 8.60 | AAA |
| accent-700 on white | `#106A77` / `#FFFFFF` | 6.27 | AA |
| ink-900 on white (body) | `#0F172A` / `#FFFFFF` | 17.85 | AAA |
| ink-700 on white | `#334155` / `#FFFFFF` | 10.35 | AAA |
| ink-600 (secondary) on white | `#475569` / `#FFFFFF` | 7.58 | AAA |
| ink-500 (muted) on white | `#64748B` / `#FFFFFF` | 4.76 | AA |
| ink-500 (muted) on bg | `#64748B` / `#F8FAFC` | 4.55 | AA |
| ink-400 on white | `#94A3B8` / `#FFFFFF` | 2.56 | **not for text or control borders** |
| control border ink-500 on white | `#64748B` / `#FFFFFF` | 4.76 | ≥3:1 non-text ✔ |
| success-fg on white | `#047857` / `#FFFFFF` | 5.48 | AA |
| success on success-bg | `#065F46` / `#ECFDF5` | 7.29 | AAA |
| error-fg on white | `#B91C1C` / `#FFFFFF` | 6.47 | AA |
| error on error-bg | `#991B1B` / `#FEF2F2` | 7.60 | AAA |
| warning-fg on white | `#B45309` / `#FFFFFF` | 5.02 | AA |
| warning on warning-bg | `#92400E` / `#FFFBEB` | 6.84 | AA |
| info-fg on white | `#0369A1` / `#FFFFFF` | 5.93 | AA |
| info on info-bg | `#075985` / `#F0F9FF` | 7.09 | AAA |
| right border on white | `#059669` / `#FFFFFF` | 3.77 | ≥3:1 non-text ✔ |
| wrong border on white | `#DC2626` / `#FFFFFF` | 4.83 | ≥3:1 non-text ✔ |
| focus ring primary-500 on white | `#6420F5` / `#FFFFFF` | 6.85 | ≥3:1 ✔ |
| white on error-600 (danger button) | `#FFFFFF` / `#DC2626` | 4.83 | AA |
| white on success-700 | `#FFFFFF` / `#047857` | 5.48 | AA |
| (Option B) blue-700 on white | `#1D4ED8` / `#FFFFFF` | 6.70 | AA |
| (today) blue-600 on white | `#2563EB` / `#FFFFFF` | 5.17 | AA |

## 2. Typography

| Script | Family | Loading |
|---|---|---|
| Latin | **Inter** (variable, 400–700) | `next/font/google` (self-hosted at build; this is not an npm package), `display: swap`, subset `latin` |
| Devanagari | **Noto Sans Devanagari** (variable, 400–700) | `next/font/google`, subset `devanagari`, `display: swap`. Loaded only on pages with Hindi content or `lang="hi"` (keeps the English pages' CWV budget). |
| Numerals in tests / timers | Inter `font-variant-numeric: tabular-nums` | — |
| Code / formula fallback | system monospace | — |

**Why this pairing:** Inter and Noto Sans Devanagari have matching x-height and stroke contrast, so the pairing reads as one voice. Both are open-licensed (OFL) and widely cached. A single family for headings and body (weight carries the hierarchy) keeps it to two font files.

**Scale** (rem, base 16px; mobile → desktop where two values are given):

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| display | 36/44 → 48/56 | 700 | Landing hero only |
| h1 | 28/36 → 36/44 | 700 | Page title |
| h2 | 22/30 → 28/36 | 650 | Section |
| h3 | 18/26 → 20/28 | 600 | Card title |
| body-lg | 18/28 | 400 | Article body, question stem |
| body | 16/24 | 400 | Default |
| body-sm | 14/20 | 400 / 500 | Secondary text, table cells |
| caption | 12/16 | 500 | Meta labels, badges (**minimum size**; never 7–11px) |

**Rules:**
- **Minimum text is 12px** (caption) for Latin. **Devanagari has a minimum of 14px and line-height +4px** relative to the Latin token, because the matras need vertical room.
- Weights are 400, 500, 600 and 700 only (no 800 or 900). Uppercase "eyebrow" labels are allowed at caption size with +0.04em tracking, at most one per section.
- Line length is 60–75ch for reading surfaces (articles, explanations).

## 3. Spacing, size, radius, elevation, motion

- **Spacing** is a 4px base; use the Tailwind default scale only. Preferred steps are 4, 8, 12, 16, 24, 32, 48 and 64. Section rhythm is 48 on mobile and 64 on desktop. The page gutter is 16 on mobile, 24 on tablet and 32 on desktop. The content max-width is 1200px, or 720px for reading.
- **Touch targets:** at least 44×44 (WCAG 2.5.8 needs 24, so ours is stricter). Answer options in the console are at least 48px tall.
- **Radius:**

  | Token | Value | Use |
  |---|---|---|
  | `sm` | 6px | badges, checkboxes |
  | `md` | 8px | inputs, buttons |
  | `lg` | 12px | cards |
  | `xl` | 16px | sheets, modals, hero panels |
  | `full` | — | pills, avatars |

  These four plus `full` replace today's eight sizes.
- **Elevation:** four levels replace the nine shadow sizes. Elevation is never used to convey state alone.

  | Level | Shadow | Use |
  |---|---|---|
  | 0 | none, border only | default cards |
  | 1 | `0 1px 2px rgb(15 23 42 / .06)` | hover cards, sticky bars |
  | 2 | `0 4px 12px rgb(15 23 42 / .08)` | dropdowns, popovers |
  | 3 | `0 12px 32px rgb(15 23 42 / .12)` | modals, sheets |

- **Motion:**
  - Durations are 120ms (micro), 200ms (enter/exit) and 300ms (sheets), using `cubic-bezier(.2,0,0,1)`.
  - Only opacity and transform are animated.
  - `prefers-reduced-motion: reduce` disables all non-essential motion: no confetti, no count-up, and progress jumps directly.
  - The countdown timer never animates.
- **Breakpoints** (Tailwind defaults): `sm` 640, `md` 768, `lg` 1024 (where the app shell switches from bottom nav to sidebar), `xl` 1280, `2xl` 1536. Design 390 first, then 768, then 1440.
- **z-index:** content 0 · sticky 10 · header and bottom nav 30 · dropdown and popover 40 · overlay 50 · modal and sheet 60 · toast 70 · tooltip 80. The console's fullscreen layer is 90.
- **Focus ring:** `outline: 2px solid var(--color-focus); outline-offset: 2px` on `:focus-visible` for every interactive element. It is never removed, and it is visible on all surfaces (6.85:1 on white).

## 4. Implementation plan (Tailwind v4, CSS variables) for UX-1

1. **Add tokens to `app/globals.css`:**
   - Raw scales go in `@theme`: `--color-primary-50…950`, `--color-accent-*`, `--color-ink-*`, the semantic colours, `--font-sans`, `--font-devanagari`, `--radius-*`, `--shadow-1..3` and `--ease-standard`.
   - Semantic aliases go in `:root` and are mapped with `@theme inline` (`--color-surface: var(--surface)`), so a later dark theme only redefines `:root[data-theme=dark]` and components don't change.
2. **Neutralise the accidental dark mode now** with `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`. The 417 existing `dark:` classes then stop firing on `prefers-color-scheme`. No `data-theme=dark` is ever set, because dark mode is out of scope.
3. **Load fonts:** `next/font` for Inter and Noto Sans Devanagari, exposed as CSS variables on `<html>`. `<html lang>` becomes dynamic per content language, and segments in the other script use `lang="hi"`.
4. **Primitives:**
   - Rebuild `components/ui/*` on tokens: one Button with variants `primary | secondary | ghost | danger | link` (drop the `default`/`primary` duplication).
   - Add Modal/Sheet (native `<dialog>`), Tabs, Select, Tooltip and Toast.
   - Use `clsx` + `tailwind-merge` (already installed) for variants. No new package.
5. **Guardrail (a script, same pattern as the TYPES-1 ratchet):** new or migrated student pages may not use raw palette classes (`blue-*`, `indigo-*`, `slate-*`, …), arbitrary sizes (`text-[10px]`), raw `<button>`/`<input>`, or `dark:`. A ratchet counts the legacy usage and only lets it go down.
6. **Brand assets (owner input needed):**
   - an SVG logo (mark + wordmark)
   - favicon set (`app/icon.svg`, `app/apple-icon.png`)
   - a 1200×630 OG template (`app/opengraph-image.tsx` generated per exam)
   - a web manifest

   Today the 245×229 PNG serves all of these roles.

## 5. Component inventory

Every component meets the following requirements:
- token colours only
- the focus ring
- keyboard operation
- RTL-agnostic logical properties
- label text supplied by i18n keys (bilingual-ready)

The **States** column lists states beyond default, hover, focus-visible and disabled.

| Component | Variants | States | A11y |
|---|---|---|---|
| **Button** | primary (filled), secondary (outline, ink-500 border), ghost, danger, link; sizes sm 36, md 44, lg 52; icon-only (square, requires `aria-label`) | loading (spinner, keeps width, `aria-busy`), pressed | Native `<button>`; disabled uses the `disabled` attribute and, if focus is needed, `aria-disabled` |
| **Link** | inline (underline on hover, primary-600), standalone (with chevron), nav | visited (same colour), current (`aria-current="page"`) | Distinguishable without colour (underline in body text) |
| **Input / Textarea** | text, email, number, search; with prefix / suffix | error (error-fg message + `aria-invalid` + `aria-describedby`), success, read-only | Visible `<label>` always (no placeholder-as-label); 44px height; ink-500 border |
| **Select** | native select (mobile) / listbox (desktop, long lists with search) | open, error | Native first; a custom listbox follows the APG pattern |
| **Checkbox / Radio / Switch** | default, card-style (option tiles in onboarding) | checked, indeterminate, error | Hit area ≥44px; group uses `<fieldset>` + `<legend>` |
| **Card** | plain (border), interactive (whole card is a link, hover elevation 1), media | selected, loading (skeleton) | One link per interactive card (the title), stretched click target; no nested links |
| **Badge / Tag** | neutral, primary, success, warning, error, Pro (primary-50 bg + lock icon), Free; removable tag | — | Text ≥12px; not the only carrier of meaning |
| **Tabs** | underline (page), segmented (filters) | selected, overflow scroll on mobile | APG tabs (arrow keys, `aria-selected`); URL-synced when it changes content |
| **Accordion** | single / multi | expanded | `<button aria-expanded>` heading; used for FAQs (and `FAQPage` JSON-LD) |
| **Modal / Sheet** | centred modal (desktop), bottom sheet (mobile), full-screen (console confirmations) | open / closing | Native `<dialog>`, focus trap, Esc closes (except the submit-test confirmation), returns focus to its trigger, `aria-labelledby` |
| **Toast** | success, error, info | auto-dismiss 5s (pauses on hover/focus), persistent for errors | `role="status"` / `alert`; never the only feedback for critical actions |
| **Tooltip** | text only | — | Shows on hover and focus, dismissable with Esc (WCAG 1.4.13); no essential info only in tooltips |
| **Progress** | bar (linear), ring (topic mastery, course %), steps (onboarding) | indeterminate | `role="progressbar"` + `aria-valuenow`/`aria-valuetext` ("7 of 12 topics") |
| **Stat tile** | value + label + delta (up = success, down = error with arrow icon) + optional sparkline | loading, empty ("—") | Delta has text ("+6 vs last week"), not only colour/arrow |
| **Empty state** | first-use, no results, cleared, coming-soon | — | Illustration is decorative (`alt=""`); always one clear next action |
| **Skeleton** | text lines, card, list, chart | — | `aria-busy` on region; respects reduced motion (no shimmer) |
| **Pagination** | numbered (desktop), "Load more" (mobile lists) | current | `<nav aria-label="Pagination">`, `aria-current` |
| **Breadcrumb** | full (desktop), parent-only (mobile) | — | `<nav aria-label="Breadcrumb">` + `BreadcrumbList` JSON-LD |
| **Header (public)** | anonymous, signed-in | mega-menu open, mobile sheet open | Disclosure pattern for menus; skip-to-content link first |
| **Sidebar (app)** | expanded 240 / rail 72 | active item, exam switcher open | `<nav aria-label="App">`; active `aria-current` |
| **Bottom nav (app, mobile)** | 5 items, icon + label (labels always visible) | active, badge (due count) | 48px targets, safe-area padding, hidden in the console |
| **Exam card** | directory (logo/initials, name, conducting body, next date, counts: mocks/topics), compact (switcher) | active cycle badge, "Your exam" | Whole-card link; dates in Indian format |
| **Course / topic node** | subject (expandable, progress ring), topic (status: not started / in progress / mastered / Pro-locked), weightage tier chip | current, locked | Tree uses a nested list with headings (not an ARIA tree) for simplicity and SEO |
| **Test card** | mock (sectional / full-length / daily), series item (number, schedule date) | Free, Pro-locked, attempted (score), in-progress (resume), scheduled (date), expired | CTA label states the action ("Start", "Resume", "View result") |
| **Question renderer** | test (no verdict), review (right/wrong), practice (instant feedback); options text / image; math (KaTeX-ready), tables, images with alt; **bilingual toggle EN / हिन्दी per question** when both versions exist | selected, marked for review, answered + marked, not visited, correct / wrong / skipped (review) | Options are a radio group; option letters A–D are visible text; `lang` attribute per stem; images require alt from authoring |
| **Result summary** | score hero (score / max, percentile when available), accuracy ring, attempted / correct / wrong / skipped, time, section table, topic strengths / weaknesses | first attempt, retake (delta vs best), evaluation pending | Charts have a table alternative |
| **Pro lock panel** | inline (in content), card overlay (test card), sheet (on tap) | interest recorded ("We'll notify you") | Explains what is locked and why; focusable CTA; never hides content already paid for |
| **Pricing card** | Free, Pro (highlighted), Pro annual; feature list with ✓ | current plan, unavailable (payments off: "Opening soon") | Price with ₹, GST note; comparison table alternative on mobile |

## 6. Content style

**Voice.** Encouraging, clear, exam-focused. Second person ("you"), active verbs, short sentences.
- Say "You got 18 right. Revise 7 Percentage questions next." Not "Great job champion!!!" and not technical jargon.
- Never shame. Errors say what happened and what to do next.
- Avoid internal or system words in UI: no "canonical", "taxonomy", "Phase", "Supabase", "command center" (today's home page shows a "Supabase Connection State" card and the project name; remove it in UX-1).

**Bilingual rules:**
- English is the default UI language; Hindi UI comes later, using keyed strings only, with no hard-coded copy in components.
- Content language is per item (question versions have `language`; today all 113 are `en`). It is shown only when available. **Never machine-translate exam content.**
- Exam names keep their official form ("SSC CGL", "एसएससी सीजीएल" only if the Hindi UI is on). Hindi typography uses the Devanagari minimum sizes in §2.
- **Do not mix scripts in one sentence**, except proper nouns and abbreviations.

**Numbers and dates (Indian):**
- Numbers use the `en-IN` grouping: 1,00,000; ₹1,499; "1.2 lakh" / "3 crore" in marketing copy only.
- Dates: "15 Oct 2026" (short) and "Thursday, 15 October 2026" (long). The timezone is always Asia/Kolkata. Relative dates ("in 12 days") are used for countdowns.
- Time uses the 12-hour format, "9:30 am".
- Durations are written "60 min" and "1 h 30 min". Scores read "142.5 / 200"; percentages carry at most 1 decimal.
- `Intl.NumberFormat('en-IN')` / `Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' })` are the only formatters, wrapped in `lib/format`.

**Microcopy patterns:**

| Situation | Pattern |
|---|---|
| CTA | Verb + object: "Start mock", "Resume test", "Practise 10 questions" |
| Empty state | What it is, why it's empty, the next action: "No mistakes yet. Take a mock and the questions you miss land here for revision." |
| Locked | "Included in Pro. Detailed solutions for every question. Opening soon. Notify me" |
| Loading | Skeletons rather than spinners for pages; "Saving…" / "Saved" for answer autosave |

## 7. Performance budgets (Core Web Vitals, p75 mobile on 4G)

| Metric | Budget | Notes |
|---|---|---|
| LCP | ≤ 2.5s public, ≤ 3.0s app | The hero image or headline is SSR; no client-only render for content |
| INP | ≤ 200ms | Test console option tap < 100ms |
| CLS | ≤ 0.1 | Fonts use `size-adjust` fallbacks (next/font); skeletons match final size |
| JS per route (gzip) | ≤ 120 KB public, ≤ 180 KB app, console ≤ 200 KB | |
| Fonts | ≤ 2 files on English pages (Inter latin variable); Devanagari only where used | |
| Images | `next/image`, AVIF/WebP, explicit sizes; OG images generated | |
