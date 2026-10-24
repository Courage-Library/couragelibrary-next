# BRAND-1: Navy + Saffron colour system (decision #70)

**Phase:** BRAND-1, CI tier T2 (UI only).

**Supersedes:** the colour part of decision #55 (UX-0 violet / cyan). The logo artwork (`public/images/logo.png`) is unchanged.

**Out of scope, untouched:** layout, spacing, typography, components, copy, auth logic, DB, and Supabase / Vercel settings. The two exceptions are the exam timer and answer review; their rules are in section 4.

## 1. How it is applied

`app/globals.css` stays the **single colour source**:
- **Brand scales:** primary, accent, ink, success and danger carry the approved values.
- **Role aliases:** warning = the accent family, info = the primary family.
- **Semantic roles:** `brand`, `interactive`, `link`, `focus`, `on-accent`, `accent-text` and `fg-muted` point at those scales.
- **Legacy Tailwind palette names:** 22 names × 11 shades = 242 names are redefined as `var(--color-<brand scale>-N)`. So the 12,660 legacy palette classes (4,667 outside admin) take the brand colours **without editing any class name**, and layout is untouched.

`config/brand.ts` is a gated mirror for the theme-color meta tag, the manifest and the admin AI image brief.

## 2. Token map: old → new

| Token / role | Old (UX-1a) | New (BRAND-1) |
|---|---|---|
| primary-600 (brand: headers, primary buttons) | #5000f0 violet | **#1e3a8a navy** |
| primary-500 | #6420f5 | **#1d4ed8 interactive blue** (`interactive`, `link`) |
| primary-50 … 400 | violet tints | #eff6ff #dbeafe #bfdbfe #93c5fd #60a5fa |
| primary-700 … 950 | #4200c4 … #18004a | #1a3275 #172a63 #13234f #0c1633 |
| link | primary-600 (violet) | interactive #1d4ed8 |
| focus ring | primary-500 (violet) | primary-600 #1e3a8a |
| accent scale | logo cyan (300 = #5cd8e6) | **saffron** (500 = #f59e0b fill, ink-900 #0f172a text on it; 700 = #b45309 accent text) |
| warning-* | own amber scale | alias of the accent family (same values) |
| danger-* (error) | red, 700 = #b91c1c | **rose**, 700 = #be123c (errors only) |
| success-* | emerald 50/200/600/700/800 | emerald full scale (700 = #047857 unchanged) |
| info-* | sky | alias of the primary family |
| fg-muted | ink-500 #64748b | ink-600 #475569 |
| ink-* (text #0f172a, bg #f8fafc, surface #fff, border #e2e8f0) | slate | unchanged |
| legacy `:root` vars (`--primary` #2563eb etc.) | raw hex | token references (`--primary` → navy) |

**Legacy palette names → brand scales:**

| Legacy names | Brand scale |
|---|---|
| blue, indigo, violet, purple, sky, cyan | primary |
| amber, yellow, orange | accent |
| emerald, green, teal, lime | success |
| red, rose, pink, fuchsia | danger |
| slate, gray, zinc, neutral, stone | ink |

## 3. Hard-coded colours: before → after

| Scope | Before | After |
|---|---|---|
| Hex / rgb / hsl / oklch literals outside the token file (app, components, lib, config, services, types, middleware; admin included) | **15**: `app/admin/layout.tsx` 1, `components/admin/admin-sidebar.tsx` 1, `components/admin/design-system/demos.tsx` 1, `lib/admin/ai-image-brief.ts` 9, `app/mock-tests/[id]/take/player-client.tsx` 1 (rgba), `config/brand.ts` 2 | **0**, apart from `config/brand.ts` (9 values, the gated mirror) |
| Design ratchet `rawColor` (app + components, admin excluded) | 1 | 0 |
| Design ratchet `paletteClass` | 4,785 (baseline) | 4,667 (unchanged by this phase; now token-backed via R-8) |
| Tailwind palette classes, whole app incl. admin | 12,660 | 12,660, all resolving to brand tokens |

## 4. Rules enforced

- **60 / 30 / 10.** There are **0 accent-filled CTAs** in the app; the only accent fill is a decorative dot on the landing page. B-07 allows at most one per screen.
- **Right / wrong is never colour-only.** An audit of 9 answer UIs found that the option rows of `components/assessment/question-review-card.tsx` marked correct / wrong by colour alone. They now carry a check / cross icon plus screen-reader text ("Correct answer", "Your answer, incorrect"), and the verdict pill has a screen-reader "Correct:" / "Incorrect:". No visible copy changed.
- **Exam engine.** `components/assessment/assessment-timer.tsx` used red in the final minute. It is now:
  - neutral (canvas / line / fg);
  - from 5 minutes: accent-50 tint;
  - from 1 minute: accent-100 with an accent-700 border, pulse kept.

  The warning icon carries the state too, and no red is used.

## 5. Contrast (WCAG 2.2 AA, computed from the tokens by `scripts/test_brand1.cjs --table`)

| Use | fg / bg | Ratio | Needs | Result |
|---|---|---|---|---|
| Body text on surface | `fg` #0f172a / `surface` #ffffff | 17.85:1 | text ≥ 4.5 | pass |
| Body text on page bg | `fg` #0f172a / `canvas` #f8fafc | 17.06:1 | text ≥ 4.5 | pass |
| Muted text on surface | `fg-muted` #475569 / `surface` #ffffff | 7.58:1 | text ≥ 4.5 | pass |
| Muted text on page bg | `fg-muted` #475569 / `canvas` #f8fafc | 7.24:1 | text ≥ 4.5 | pass |
| Heading / brand text on surface | `brand` #1e3a8a / `surface` #ffffff | 10.36:1 | text ≥ 4.5 | pass |
| White on navy (header bar, primary button) | `white` #ffffff / `brand` #1e3a8a | 10.36:1 | text ≥ 4.5 | pass |
| Link on surface | `link` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Link on page bg | `link` #1d4ed8 / `canvas` #f8fafc | 6.41:1 | text ≥ 4.5 | pass |
| Text on accent fill | `on-accent` #0f172a / `accent-500` #f59e0b | 8.31:1 | text ≥ 4.5 | pass |
| Accent text on surface | `accent-text` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Accent text on page bg | `accent-text` #b45309 / `canvas` #f8fafc | 4.80:1 | text ≥ 4.5 | pass |
| Success text on surface | `success-700` #047857 / `surface` #ffffff | 5.48:1 | text ≥ 4.5 | pass |
| Error text on surface | `danger-700` #be123c / `surface` #ffffff | 6.29:1 | text ≥ 4.5 | pass |
| Error text on page bg | `danger-700` #be123c / `canvas` #f8fafc | 6.01:1 | text ≥ 4.5 | pass |
| Focus ring on surface | `focus` #1e3a8a / `surface` #ffffff | 10.36:1 | nontext ≥ 3 | pass |
| Focus ring on page bg | `focus` #1e3a8a / `canvas` #f8fafc | 9.90:1 | nontext ≥ 3 | pass |
| Primary button boundary on page bg | `brand` #1e3a8a / `canvas` #f8fafc | 9.90:1 | nontext ≥ 3 | pass |
| Body text | `ink-900` #0f172a / `surface` #ffffff | 17.85:1 | text ≥ 4.5 | pass |
| Body text on page background | `ink-900` #0f172a / `ink-50` #f8fafc | 17.06:1 | text ≥ 4.5 | pass |
| Secondary text | `ink-600` #475569 / `surface` #ffffff | 7.58:1 | text ≥ 4.5 | pass |
| Secondary text on page background | `ink-600` #475569 / `ink-50` #f8fafc | 7.24:1 | text ≥ 4.5 | pass |
| Secondary text on sunken surface (table header, segmented tabs) | `ink-600` #475569 / `ink-100` #f1f5f9 | 6.92:1 | text ≥ 4.5 | pass |
| Muted text, placeholder | `ink-500` #64748b / `surface` #ffffff | 4.76:1 | text ≥ 4.5 | pass |
| Muted text on page background | `ink-500` #64748b / `ink-50` #f8fafc | 4.55:1 | text ≥ 4.5 | pass |
| Link (interactive blue) | `interactive` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Link on page background | `interactive` #1d4ed8 / `canvas` #f8fafc | 6.41:1 | text ≥ 4.5 | pass |
| Ghost button, selected tab, hovered link | `primary-700` #1a3275 / `surface` #ffffff | 11.95:1 | text ≥ 4.5 | pass |
| Primary button | `white` #ffffff / `primary-600` #1e3a8a | 10.36:1 | text ≥ 4.5 | pass |
| Primary button hover | `white` #ffffff / `primary-700` #1a3275 | 11.95:1 | text ≥ 4.5 | pass |
| Primary button pressed | `white` #ffffff / `primary-800` #172a63 | 13.57:1 | text ≥ 4.5 | pass |
| Ghost button hover, current nav item, primary badge | `primary-700` #1a3275 / `primary-50` #eff6ff | 10.98:1 | text ≥ 4.5 | pass |
| Pro badge, selected answer text, Pro panel body | `primary-800` #172a63 / `primary-50` #eff6ff | 12.47:1 | text ≥ 4.5 | pass |
| Pro panel title | `primary-900` #13234f / `primary-50` #eff6ff | 13.97:1 | text ≥ 4.5 | pass |
| Avatar initials | `primary-800` #172a63 / `primary-100` #dbeafe | 11.12:1 | text ≥ 4.5 | pass |
| Body text on selected card / option tile | `ink-900` #0f172a / `primary-50` #eff6ff | 16.40:1 | text ≥ 4.5 | pass |
| Neutral badge | `ink-700` #334155 / `ink-100` #f1f5f9 | 9.45:1 | text ≥ 4.5 | pass |
| Free badge | `accent-900` #78350f / `accent-100` #fef3c7 | 8.15:1 | text ≥ 4.5 | pass |
| Text on the accent (saffron) fill | `on-accent` #0f172a / `accent-500` #f59e0b | 8.31:1 | text ≥ 4.5 | pass |
| Accent text (dark saffron) on white | `accent-text` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Success text, positive delta | `success-700` #047857 / `surface` #ffffff | 5.48:1 | text ≥ 4.5 | pass |
| Success badge / alert, correct answer text | `success-800` #065f46 / `success-50` #ecfdf5 | 7.29:1 | text ≥ 4.5 | pass |
| Correct option letter | `white` #ffffff / `success-700` #047857 | 5.48:1 | text ≥ 4.5 | pass |
| Warning text | `warning-700` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Warning badge / alert | `warning-800` #92400e / `warning-50` #fffbeb | 6.84:1 | text ≥ 4.5 | pass |
| Error text, negative delta, field error | `danger-700` #be123c / `surface` #ffffff | 6.29:1 | text ≥ 4.5 | pass |
| Error badge / alert, wrong answer text | `danger-800` #9f1239 / `danger-50` #fff1f2 | 7.30:1 | text ≥ 4.5 | pass |
| Danger button, wrong option letter | `white` #ffffff / `danger-600` #e11d48 | 4.70:1 | text ≥ 4.5 | pass |
| Danger button hover | `white` #ffffff / `danger-700` #be123c | 6.29:1 | text ≥ 4.5 | pass |
| Info text | `info-700` #1a3275 / `surface` #ffffff | 11.95:1 | text ≥ 4.5 | pass |
| Info badge / alert | `info-800` #172a63 / `info-50` #eff6ff | 12.47:1 | text ≥ 4.5 | pass |
| Tooltip | `white` #ffffff / `ink-900` #0f172a | 17.85:1 | text ≥ 4.5 | pass |
| Primary text / heading in brand navy | `brand` #1e3a8a / `surface` #ffffff | 10.36:1 | text ≥ 4.5 | pass |
| Brand navy on page background | `brand` #1e3a8a / `canvas` #f8fafc | 9.90:1 | text ≥ 4.5 | pass |
| White text on the navy header bar / primary button | `fg-inverse` #ffffff / `brand` #1e3a8a | 10.36:1 | text ≥ 4.5 | pass |
| Accent text on page background | `accent-text` #b45309 / `canvas` #f8fafc | 4.80:1 | text ≥ 4.5 | pass |
| Accent text on accent tint (timer, warning) | `accent-text` #b45309 / `accent-50` #fffbeb | 4.84:1 | text ≥ 4.5 | pass |
| Body text on the accent tint (timer final minutes) | `fg` #0f172a / `accent-100` #fef3c7 | 16.03:1 | text ≥ 4.5 | pass |
| Error text (#BE123C) on page background | `danger-700` #be123c / `canvas` #f8fafc | 6.01:1 | text ≥ 4.5 | pass |
| Success text (#047857) on page background | `success-700` #047857 / `canvas` #f8fafc | 5.24:1 | text ≥ 4.5 | pass |
| Muted text (#475569) on page background | `fg-muted` #475569 / `canvas` #f8fafc | 7.24:1 | text ≥ 4.5 | pass |
| Link on a primary tint (current nav, selected card) | `interactive` #1d4ed8 / `primary-50` #eff6ff | 6.16:1 | text ≥ 4.5 | pass |
| Score display (36-48px) | `ink-900` #0f172a / `surface` #ffffff | 17.85:1 | large ≥ 3 | pass |
| Control border (input, select, secondary button) | `ink-500` #64748b / `surface` #ffffff | 4.76:1 | nontext ≥ 3 | pass |
| Focus ring | `focus` #1e3a8a / `surface` #ffffff | 10.36:1 | nontext ≥ 3 | pass |
| Focus ring on page background | `focus` #1e3a8a / `canvas` #f8fafc | 9.90:1 | nontext ≥ 3 | pass |
| Switch track (off) | `ink-500` #64748b / `surface` #ffffff | 4.76:1 | nontext ≥ 3 | pass |
| Switch thumb on track (off) | `white` #ffffff / `ink-500` #64748b | 4.76:1 | nontext ≥ 3 | pass |
| Switch track (on), selected option border | `primary-600` #1e3a8a / `surface` #ffffff | 10.36:1 | nontext ≥ 3 | pass |
| Progress fill on track | `primary-600` #1e3a8a / `ink-200` #e2e8f0 | 8.40:1 | nontext ≥ 3 | pass |
| Correct-answer border / icon | `success-600` #059669 / `surface` #ffffff | 3.77:1 | nontext ≥ 3 | pass |
| Wrong-answer border / icon | `danger-600` #e11d48 / `surface` #ffffff | 4.70:1 | nontext ≥ 3 | pass |
| Warning icon | `warning-700` #b45309 / `warning-50` #fffbeb | 4.84:1 | nontext ≥ 3 | pass |
| Not-started topic icon | `ink-500` #64748b / `surface` #ffffff | 4.76:1 | nontext ≥ 3 | pass |
| Timer border, final minute (accent) on accent tint | `accent-700` #b45309 / `accent-100` #fef3c7 | 4.51:1 | nontext ≥ 3 | pass |
| Navy primary button boundary on page background | `brand` #1e3a8a / `canvas` #f8fafc | 9.90:1 | nontext ≥ 3 | pass |
| Accent fill on white: decorative only (dots, highlights), never text or the only signal | `accent-500` #f59e0b / `surface` #ffffff | 2.15:1 | decorative | n/a |
| Disabled control label | `ink-600` #475569 / `ink-200` #e2e8f0 | 6.15:1 | disabled | n/a |
| Disabled text (ink-400) | `ink-400` #94a3b8 / `surface` #ffffff | 2.56:1 | disabled | n/a |

## 6. Email templates

The five templates in `docs/auth/email-templates/*.html` were rebuilt:
- 600px max width and a system font stack;
- a navy header bar with the text logo, and a white card on #f8fafc;
- one navy button with white text, 44px tall (measured in Chrome), with the plain-text link under it;
- a hidden preheader and a "You received this because…" footer;
- `color-scheme: light`;
- no images and no tracking.

The `/auth/confirm` token_hash links and types are byte-identical to the 2b-2 versions; each `href` was diffed against the previous commit. The 2b-2 T-12 checks still pass. Every colour used is a token value, and every text pair is ≥ 4.5:1. No meaning depends on colour: the action is the button's text label plus the text link.

## 7. Gates

| Gate | Result |
|---|---|
| `scripts/test_brand1.cjs` (new) | B-01…B-07 7/7 |
| Design ratchet (amended) | R-0…R-8 9/9; baseline re-recorded downwards (rawColor 0) |
| `test_no_local_only_tracked` | Now also accepts local-only directories (trailing `/`); self-test 3/3 |
| All CI offline gates | Pass |

**Amendment (R-7 / R-8):** the invariant is now a **single token source**:
- R-7 checks that `config/brand.ts` (including `BRAND_PALETTE`) mirrors the tokens.
- R-8 checks that every legacy palette name aliases a brand scale through `var()`.

This is strengthened by the contrast gates (R-5, B-02).

## 8. Visual review

**Screenshots are LOCAL-ONLY:** `docs/reports/ux/brand1-local/`, listed in `docs/ops/LOCAL_ONLY_PATHS.txt` and git-ignored.

**Email templates:** `docs/reports/ux/brand1-local/email/<template>-{light,dark}.png`, 10 files.

**App pages:** at 360 and 1440, against the production deployment of this commit (local `next start` is not possible under the 2 GB floor, decision #69); paths and axe counts are in the owner report.
