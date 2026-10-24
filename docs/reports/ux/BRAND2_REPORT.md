# BRAND-2: Royal Blue + Amber, "modern glass", bilingual typography (decisions #71 / #72)

**CI tier:** T2 (UI only).

**Architecture:** the BRAND-1 architecture is kept: single token source, semantic roles, palette aliases, and the BRAND-1 gates. Only the values, the type and the glass layer change. The logo PNG files are untouched; the nav, footer, auth cards and emails use a text wordmark until BRAND-LOGO.

## 1. Token map: BRAND-1 → BRAND-2

| Role | BRAND-1 | BRAND-2 |
|---|---|---|
| brand / primary button / focus (`primary-600`) | #1e3a8a navy | **#2563eb** |
| links / text (`interactive`, `link`) | #1d4ed8 (primary-500) | **#1d4ed8 (primary-700)** |
| hero surface (`primary-900`, `hero-bg`) | — | **#0b1b4d** (+ `hero-bg-mid` #132e7a, `hero-bg-end` #1d4ed8) |
| accent fill / text on it | #f59e0b / #0f172a | #f59e0b / **#111827** (ink) |
| accent text | #b45309 | #b45309 |
| hero accent text | — | **#fcd34d** (on primary-900 / 800 only) |
| success | #047857 (emerald) | **#15803d** (green) |
| error | #be123c (rose) | **#b91c1c** (red) |
| ink / muted / border | #0f172a / #475569 / #e2e8f0 (slate) | **#111827 / #4b5563 / #e5e7eb** (gray) |
| bg / surface | #f8fafc / #fff | unchanged |
| warning / info | accent / primary families | unchanged |

**Categorical tokens:** `subject-blue` #2563eb, `subject-teal` #0d9488, `subject-violet` #7c3aed, `subject-amber` #d97706, `subject-rose` #e11d48, `subject-slate` #475569. They come from the `cat-teal`, `cat-violet`, `cat-rose` and `cat-slate` scales.

**Legacy palette names now map to the categorical scales** instead of collapsing into the primary:

| Legacy names | Scale |
|---|---|
| violet, purple, fuchsia | cat-violet |
| teal, cyan, green, lime | cat-teal |
| rose, pink | cat-rose |
| emerald | success |
| red | danger |
| slate, gray, zinc, neutral, stone | ink |
| blue, indigo, sky | primary |
| amber, yellow, orange | accent |

**Where they're used:** the subject / section swatches in `components/ui/domain/result-summary.tsx` and `topic-node.tsx` (`lib/ui/subject-colors.ts`).

**Ready for a dark theme later:** components reference only semantic names (canvas, surface, fg, brand, link, hero-*), so a dark theme redefines one layer. There is no dark mode now.

## 2. Fonts

All three fonts come from `next/font/google` in `app/layout.tsx`, self-hosted at build. `package.json` and `package-lock` are unchanged (gate C-06).

| Use | Font | Notes |
|---|---|---|
| Body / UI | Inter (variable, latin) | preloaded |
| Headings | Poppins 600/700 (latin + devanagari) | not preloaded |
| Hindi | Noto Sans Devanagari 400/600 | not preloaded; loads only when Devanagari text is present (unicode-range) |

**Type scale:** base 16px; body line-height 1.6; `:lang(hi)` 1.7. Headings use `--font-heading`.

**Font payload:** measured on the real build by `--probe` P-01 (≤ 160 KB). The figures are in the owner report.

## 3. Components and glass

**New components:**
- `components/ui/glass.tsx` (`GlassNav`, `GlassCard`, `GlassChip`);
- `components/ui/pill-button.tsx` (`PillLink` / `PillButton`: primary / accent / ghost-on-dark, `min-h-12`);
- `components/ui/gradient-hero.tsx` (CSS gradients only, no image);
- `components/brand/wordmark.tsx`;
- `components/ui/no-glass-zone.tsx`;
- `lib/ui/lite-mode.ts`.

**New radii:** `panel` 20 and `hero` 24 (12 card, 16 sheet; full = `rounded-full`).

**New shadows:** `soft`, `glass`.

**Glass locations (gate C-04):**
- the public header, as a floating pill (the signed-in header stays solid);
- the home hero: chips plus one card (3 groups including the nav);
- the auth cards on login, sign-up, sign-up-closed and forgot-password, over a light blue → amber gradient;
- the dashboard header chips.

**Forbidden zones (gate C-03):**
- **Exam engine:** the mock take player, live-test take player and mistake drill.
- **Question review:** mock result.
- **Admin:** the whole admin layout.

Their roots are `[data-no-glass]` zones: one CSS rule turns every backdrop blur off inside them, including legacy blur classes, without touching those components. There are no glass classes or components in 187 zone files.

**Lite mode:**
- **Solid by default.** Blur appears only when all three hold: `@supports (backdrop-filter)`, not `prefers-reduced-transparency: reduce`, and `html` is not `.lite`.
- **The lite script** is inline in `<head>`, 216 characters long. It sets `.lite` when `deviceMemory <= 4`, `hardwareConcurrency <= 4` or Save-Data is on.
- **On lite devices,** large shadows also drop to `e1`.
- **Gates:** C-05 (static plus unit) and probe P-04 / P-05 (real browser).

## 4. Contrast

### Worst-case glass and hero pairs

The background colours are alpha-composited from the `color-mix` percentages in `globals.css` (`node scripts/test_brand2.cjs --table`):

| Use | fg / composited bg | Ratio | Needs |
|---|---|---|---|
| Hero headline / lead (white) on the text column | #ffffff / #1d4bb8 | 7.62:1 | ≥ 4.5 |
| Hero lead (hero-fg-muted) on the text column | #dbeafe / #1d4bb8 | 6.25:1 | ≥ 4.5 |
| Hero eyebrow (hero-accent-text) on the text column | #fcd34d / #1d4bb8 | 5.28:1 | ≥ 4.5 |
| Hero headline line 2 (hero-accent-text, large) on the text column | #fcd34d / #1d4bb8 | 5.28:1 | ≥ 3 |
| Hero glass card text (white) — worst case | #ffffff / #324485 | 9.10:1 | ≥ 4.5 |
| Hero glass card secondary text (hero-fg-muted) — worst case | #dbeafe / #324485 | 7.46:1 | ≥ 4.5 |
| Hero glass chip text (white) — worst case | #ffffff / #16388d | 10.59:1 | ≥ 4.5 |
| Hero chip check icon (hero-accent-text, UI) — worst case | #fcd34d / #16388d | 7.34:1 | ≥ 3 |
| Accent pill: ink on amber | #111827 / #f59e0b | 8.26:1 | ≥ 4.5 |
| Ghost-on-dark pill text (white) on the text column | #ffffff / #1d4bb8 | 7.62:1 | ≥ 4.5 |
| Nav glass: ink text over the darkest hero point | #111827 / #d3d6df | 12.21:1 | ≥ 4.5 |
| Nav glass: link / Sign in (primary-700) over the darkest hero point | #1d4ed8 / #d3d6df | 4.61:1 | ≥ 4.5 |
| Nav glass: secondary text over the darkest hero point | #4b5563 / #d3d6df | 5.20:1 | ≥ 4.5 |
| Nav glass: link over the canvas | #1d4ed8 / #fefefe | 6.65:1 | ≥ 4.5 |
| Nav glass: white on the brand pill (Get started) | #ffffff / #2563eb | 5.17:1 | ≥ 4.5 |
| Auth glass card: ink text — worst case | #111827 / #f9f9f7 | 16.81:1 | ≥ 4.5 |
| Auth glass card: muted text — worst case | #4b5563 / #f9f9f7 | 7.16:1 | ≥ 4.5 |
| Auth glass card: link — worst case | #1d4ed8 / #f9f9f7 | 6.35:1 | ≥ 4.5 |
| Focus ring on the dark hero (UI) | #fcd34d / #0b1b4d | 11.39:1 | ≥ 3 |
| Focus ring on the hero text column (UI) | #fcd34d / #1d4bb8 | 5.28:1 | ≥ 3 |
| Lite / no-blur fallback: white on glass-dark solid | #ffffff / #132e7a | 12.36:1 | ≥ 4.5 |

### Registered and brand token pairs

`node scripts/test_brand1.cjs --table`:

| Use | fg / bg | Ratio | Needs | Result |
|---|---|---|---|---|
| Body text on surface | `fg` #111827 / `surface` #ffffff | 17.74:1 | text ≥ 4.5 | pass |
| Body text on page bg | `fg` #111827 / `canvas` #f8fafc | 16.96:1 | text ≥ 4.5 | pass |
| Muted text on surface | `fg-muted` #4b5563 / `surface` #ffffff | 7.56:1 | text ≥ 4.5 | pass |
| Muted text on page bg | `fg-muted` #4b5563 / `canvas` #f8fafc | 7.22:1 | text ≥ 4.5 | pass |
| Heading / brand text on surface | `brand` #2563eb / `surface` #ffffff | 5.17:1 | text ≥ 4.5 | pass |
| White on navy (header bar, primary button) | `white` #ffffff / `brand` #2563eb | 5.17:1 | text ≥ 4.5 | pass |
| Link on surface | `link` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Link on page bg | `link` #1d4ed8 / `canvas` #f8fafc | 6.41:1 | text ≥ 4.5 | pass |
| Text on accent fill | `on-accent` #111827 / `accent-500` #f59e0b | 8.26:1 | text ≥ 4.5 | pass |
| Accent text on surface | `accent-text` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Accent text on page bg | `accent-text` #b45309 / `canvas` #f8fafc | 4.80:1 | text ≥ 4.5 | pass |
| Success text on surface | `success-700` #15803d / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Error text on surface | `danger-700` #b91c1c / `surface` #ffffff | 6.47:1 | text ≥ 4.5 | pass |
| Error text on page bg | `danger-700` #b91c1c / `canvas` #f8fafc | 6.18:1 | text ≥ 4.5 | pass |
| Focus ring on surface | `focus` #2563eb / `surface` #ffffff | 5.17:1 | nontext ≥ 3 | pass |
| Focus ring on page bg | `focus` #2563eb / `canvas` #f8fafc | 4.94:1 | nontext ≥ 3 | pass |
| Primary button boundary on page bg | `brand` #2563eb / `canvas` #f8fafc | 4.94:1 | nontext ≥ 3 | pass |
| Body text | `ink-900` #111827 / `surface` #ffffff | 17.74:1 | text ≥ 4.5 | pass |
| Body text on page background | `ink-900` #111827 / `ink-50` #f8fafc | 16.96:1 | text ≥ 4.5 | pass |
| Secondary text | `ink-600` #4b5563 / `surface` #ffffff | 7.56:1 | text ≥ 4.5 | pass |
| Secondary text on page background | `ink-600` #4b5563 / `ink-50` #f8fafc | 7.22:1 | text ≥ 4.5 | pass |
| Secondary text on sunken surface (table header, segmented tabs) | `ink-600` #4b5563 / `ink-100` #f3f4f6 | 6.87:1 | text ≥ 4.5 | pass |
| Muted text, placeholder | `ink-500` #6b7280 / `surface` #ffffff | 4.83:1 | text ≥ 4.5 | pass |
| Muted text on page background | `ink-500` #6b7280 / `ink-50` #f8fafc | 4.62:1 | text ≥ 4.5 | pass |
| Link (interactive blue) | `interactive` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Link on page background | `interactive` #1d4ed8 / `canvas` #f8fafc | 6.41:1 | text ≥ 4.5 | pass |
| Ghost button, selected tab, hovered link | `primary-700` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Primary button | `white` #ffffff / `primary-600` #2563eb | 5.17:1 | text ≥ 4.5 | pass |
| Primary button hover | `white` #ffffff / `primary-700` #1d4ed8 | 6.70:1 | text ≥ 4.5 | pass |
| Primary button pressed | `white` #ffffff / `primary-800` #132e7a | 12.36:1 | text ≥ 4.5 | pass |
| Ghost button hover, current nav item, primary badge | `primary-700` #1d4ed8 / `primary-50` #eff6ff | 6.16:1 | text ≥ 4.5 | pass |
| Pro badge, selected answer text, Pro panel body | `primary-800` #132e7a / `primary-50` #eff6ff | 11.35:1 | text ≥ 4.5 | pass |
| Pro panel title | `primary-900` #0b1b4d / `primary-50` #eff6ff | 15.10:1 | text ≥ 4.5 | pass |
| Avatar initials | `primary-800` #132e7a / `primary-100` #dbeafe | 10.13:1 | text ≥ 4.5 | pass |
| Body text on selected card / option tile | `ink-900` #111827 / `primary-50` #eff6ff | 16.30:1 | text ≥ 4.5 | pass |
| Neutral badge | `ink-700` #374151 / `ink-100` #f3f4f6 | 9.37:1 | text ≥ 4.5 | pass |
| Free badge | `accent-900` #78350f / `accent-100` #fef3c7 | 8.15:1 | text ≥ 4.5 | pass |
| Text on the accent (saffron) fill | `on-accent` #111827 / `accent-500` #f59e0b | 8.26:1 | text ≥ 4.5 | pass |
| Accent text (dark saffron) on white | `accent-text` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Success text, positive delta | `success-700` #15803d / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Success badge / alert, correct answer text | `success-800` #166534 / `success-50` #f0fdf4 | 6.81:1 | text ≥ 4.5 | pass |
| Correct option letter | `white` #ffffff / `success-700` #15803d | 5.02:1 | text ≥ 4.5 | pass |
| Warning text | `warning-700` #b45309 / `surface` #ffffff | 5.02:1 | text ≥ 4.5 | pass |
| Warning badge / alert | `warning-800` #92400e / `warning-50` #fffbeb | 6.84:1 | text ≥ 4.5 | pass |
| Error text, negative delta, field error | `danger-700` #b91c1c / `surface` #ffffff | 6.47:1 | text ≥ 4.5 | pass |
| Error badge / alert, wrong answer text | `danger-800` #991b1b / `danger-50` #fef2f2 | 7.60:1 | text ≥ 4.5 | pass |
| Danger button, wrong option letter | `white` #ffffff / `danger-600` #dc2626 | 4.83:1 | text ≥ 4.5 | pass |
| Danger button hover | `white` #ffffff / `danger-700` #b91c1c | 6.47:1 | text ≥ 4.5 | pass |
| Info text | `info-700` #1d4ed8 / `surface` #ffffff | 6.70:1 | text ≥ 4.5 | pass |
| Info badge / alert | `info-800` #132e7a / `info-50` #eff6ff | 11.35:1 | text ≥ 4.5 | pass |
| Tooltip | `white` #ffffff / `ink-900` #111827 | 17.74:1 | text ≥ 4.5 | pass |
| Primary text / heading in brand navy | `brand` #2563eb / `surface` #ffffff | 5.17:1 | text ≥ 4.5 | pass |
| Brand navy on page background | `brand` #2563eb / `canvas` #f8fafc | 4.94:1 | text ≥ 4.5 | pass |
| White text on the navy header bar / primary button | `fg-inverse` #ffffff / `brand` #2563eb | 5.17:1 | text ≥ 4.5 | pass |
| Accent text on page background | `accent-text` #b45309 / `canvas` #f8fafc | 4.80:1 | text ≥ 4.5 | pass |
| Accent text on accent tint (timer, warning) | `accent-text` #b45309 / `accent-50` #fffbeb | 4.84:1 | text ≥ 4.5 | pass |
| Body text on the accent tint (timer final minutes) | `fg` #111827 / `accent-100` #fef3c7 | 15.93:1 | text ≥ 4.5 | pass |
| Error text (#BE123C) on page background | `danger-700` #b91c1c / `canvas` #f8fafc | 6.18:1 | text ≥ 4.5 | pass |
| Success text (#047857) on page background | `success-700` #15803d / `canvas` #f8fafc | 4.79:1 | text ≥ 4.5 | pass |
| Muted text (#475569) on page background | `fg-muted` #4b5563 / `canvas` #f8fafc | 7.22:1 | text ≥ 4.5 | pass |
| Link on a primary tint (current nav, selected card) | `interactive` #1d4ed8 / `primary-50` #eff6ff | 6.16:1 | text ≥ 4.5 | pass |
| Hero text on the darkest hero stop | `hero-fg` #ffffff / `hero-bg` #0b1b4d | 16.43:1 | text ≥ 4.5 | pass |
| Hero text on the lightest hero stop | `hero-fg` #ffffff / `hero-bg-end` #1d4ed8 | 6.70:1 | text ≥ 4.5 | pass |
| Hero lead text on the lightest hero stop | `hero-fg-muted` #dbeafe / `hero-bg-end` #1d4ed8 | 5.49:1 | text ≥ 4.5 | pass |
| Hero accent text (eyebrow, 2nd headline line) on the hero | `hero-accent-text` #fcd34d / `hero-bg` #0b1b4d | 11.39:1 | text ≥ 4.5 | pass |
| Hero accent text on the mid hero stop | `hero-accent-text` #fcd34d / `hero-bg-mid` #132e7a | 8.57:1 | text ≥ 4.5 | pass |
| Hero text on the solid (lite / no-blur) glass-dark fallback | `hero-fg` #ffffff / `hero-bg-mid` #132e7a | 12.36:1 | text ≥ 4.5 | pass |
| Ink text on the amber accent pill | `on-accent` #111827 / `accent-500` #f59e0b | 8.26:1 | text ≥ 4.5 | pass |
| White text on the brand pill / primary button | `fg-inverse` #ffffff / `brand` #2563eb | 5.17:1 | text ≥ 4.5 | pass |
| White text on the brand hover | `fg-inverse` #ffffff / `brand-hover` #1d4ed8 | 6.70:1 | text ≥ 4.5 | pass |
| Score display (36-48px) | `ink-900` #111827 / `surface` #ffffff | 17.74:1 | large ≥ 3 | pass |
| Control border (input, select, secondary button) | `ink-500` #6b7280 / `surface` #ffffff | 4.83:1 | nontext ≥ 3 | pass |
| Focus ring | `focus` #2563eb / `surface` #ffffff | 5.17:1 | nontext ≥ 3 | pass |
| Focus ring on page background | `focus` #2563eb / `canvas` #f8fafc | 4.94:1 | nontext ≥ 3 | pass |
| Switch track (off) | `ink-500` #6b7280 / `surface` #ffffff | 4.83:1 | nontext ≥ 3 | pass |
| Switch thumb on track (off) | `white` #ffffff / `ink-500` #6b7280 | 4.83:1 | nontext ≥ 3 | pass |
| Switch track (on), selected option border | `primary-600` #2563eb / `surface` #ffffff | 5.17:1 | nontext ≥ 3 | pass |
| Progress fill on track | `primary-600` #2563eb / `ink-200` #e5e7eb | 4.17:1 | nontext ≥ 3 | pass |
| Correct-answer border / icon | `success-600` #16a34a / `surface` #ffffff | 3.30:1 | nontext ≥ 3 | pass |
| Wrong-answer border / icon | `danger-600` #dc2626 / `surface` #ffffff | 4.83:1 | nontext ≥ 3 | pass |
| Warning icon | `warning-700` #b45309 / `warning-50` #fffbeb | 4.84:1 | nontext ≥ 3 | pass |
| Not-started topic icon | `ink-500` #6b7280 / `surface` #ffffff | 4.83:1 | nontext ≥ 3 | pass |
| Timer border, final minute (accent) on accent tint | `accent-700` #b45309 / `accent-100` #fef3c7 | 4.51:1 | nontext ≥ 3 | pass |
| Navy primary button boundary on page background | `brand` #2563eb / `canvas` #f8fafc | 4.94:1 | nontext ≥ 3 | pass |
| Focus ring on the dark hero | `hero-focus` #fcd34d / `hero-bg` #0b1b4d | 11.39:1 | nontext ≥ 3 | pass |
| Focus ring on the lightest hero stop | `hero-focus` #fcd34d / `hero-bg-end` #1d4ed8 | 4.65:1 | nontext ≥ 3 | pass |
| Ghost-on-dark pill border on the hero | `hero-fg-muted` #dbeafe / `hero-bg` #0b1b4d | 13.47:1 | nontext ≥ 3 | pass |
| Subject swatch blue on white | `subject-blue` #2563eb / `surface` #ffffff | 5.17:1 | nontext ≥ 3 | pass |
| Subject swatch teal on white | `subject-teal` #0d9488 / `surface` #ffffff | 3.74:1 | nontext ≥ 3 | pass |
| Subject swatch violet on white | `subject-violet` #7c3aed / `surface` #ffffff | 5.70:1 | nontext ≥ 3 | pass |
| Subject swatch amber on white | `subject-amber` #d97706 / `surface` #ffffff | 3.19:1 | nontext ≥ 3 | pass |
| Subject swatch rose on white | `subject-rose` #e11d48 / `surface` #ffffff | 4.70:1 | nontext ≥ 3 | pass |
| Subject swatch slate on white | `subject-slate` #475569 / `surface` #ffffff | 7.58:1 | nontext ≥ 3 | pass |
| Accent fill on white: decorative only (dots, highlights), never text or the only signal | `accent-500` #f59e0b / `surface` #ffffff | 2.15:1 | decorative | n/a |
| Disabled control label | `ink-600` #4b5563 / `ink-200` #e5e7eb | 6.10:1 | disabled | n/a |
| Disabled text (ink-400) | `ink-400` #9ca3af / `surface` #ffffff | 2.54:1 | disabled | n/a |

## 5. Copy

There are no copy changes. The hero splits the existing brand line over two lines. The chips reuse existing feature titles, the glass card reuses existing loop steps, and the wordmark is the site name. Gate C-10 checks for banned claim phrases (CCPA 2024) and finds 0 hits.

## 6. Performance

**Budget, per architect option 3:** front-end only, measured in CI on the local production build by `--probe` P-06 (Moto-G-class, 4× CPU, Fast 4G, cold): LCP ≤ 2.5 s, CLS ≤ 0.1, transfer ≤ 500 KB.

**Production baseline (0dd5c0e, measured from India):** LCP 6.94 s, CLS 0.000, 233 KB transferred, fonts 48 KB. It is dominated by server time: the home page is rendered on every request, and the server runs in US East (`iad1`) while the edge is in Mumbai (`bom1`).

**Follow-ups (not in this phase):**
- region: owner action;
- static / cached home: PERF-1.

## 7. Gates

| Gate | Result |
|---|---|
| `scripts/test_brand2.cjs` | C-01…C-11, 11/11 |
| `scripts/test_brand1.cjs` | 7/7, values updated to #71 |
| Design ratchet | 9/9 (amendments below) |
| UX-2a | 10/10 |
| All CI offline gates | Pass |

**Ratchet amendments:**
- **R-4:** the font set is exactly Inter + Poppins + Noto Sans Devanagari, via one `next/font` import, with only Inter preloaded.
- **R-8:** includes the categorical scales.

**UX-2a header assertions:** relaxed from `size="sm"` to "any props", because the header actions are now 48 px pills.

**Local-only:**
- `Claude outputs/` (owner design references) is listed in `docs/ops/LOCAL_ONLY_PATHS.txt` and git-ignored.
- Screenshots are in `docs/reports/ux/brand2-local/`, also local-only.
