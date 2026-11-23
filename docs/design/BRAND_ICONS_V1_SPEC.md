# BRAND-ICONS-1 — Brand Icon Set Spec v1 (owner-approved 23 Nov 2026)

Visual reference: `docs/design/brand-icons-v1-reference.html`. SVG masters: `public/brand/icons/` from `brand-icons-v1.zip` (27 files: each icon × idle / active / on-blue).

> **Superseded (owner, BRAND-ICONS-1, 23 Nov 2026):** the masters live in `docs/design/brand-icons-v1/` and are NOT
> served from `public/brand/icons/`. The icons are rendered inline by `components/icons/brand-icon.tsx` from the data
> module `lib/icons/brand-icon-data.ts`, generated from these masters by `scripts/gen-brand-icons.cjs` (a sync check
> fails if the two differ). On-blue uses `currentColor` (the masters' hardcoded `#fff` is superseded); onBlue beats
> active. Nav items follow `aria-current` (the student shell keeps it current after client-side navigation), so exactly
> the current item shows the active style.

## 0. Decision
- **Hybrid set.** 9 custom **brand icons** for the core loop; everything else stays **Lucide**, styled to match (same 24 grid, 1.75 stroke, round caps/joins).
- **Direction: Signature triangle.** Each brand icon contains the logo's rounded play triangle (traced from the logo: circular fillets, same proportions). Idle = slate outline; active = cl-blue-text outline + triangle filled with the logo gradient (#22E3F2 → #475BFF → #4B00E6).
- **Depth (violet offset layer) belongs to the logo only** — used in the logo and the Today's mock icon (cyan front #3FF0F7→#1FC9E8, violet #4B00E6 behind), nowhere else.

## 1. The 9 brand icons
| Name (component key) | Meaning | Signature placement |
|---|---|---|
| `home` | Home | door |
| `learn` | Learn | bookmark |
| `practice` | Practice | centre of target |
| `mocks` | Mocks | stopwatch face |
| `todays-mock` | Today's mock | the logo shape itself (with depth) |
| `current-affairs` | Current Affairs | headline marker |
| `results` | Results | arrow above bars |
| `mistake-vault` | Mistake Vault | vault dial |
| `memory-lock` | Memory Lock | keyhole |

## 2. Implementation
- One React component `<BrandIcon name size active onBlue />` built from the SVG masters (inline SVG, no icon font, no `<img>`), plus one `<Icon>` wrapper for Lucide utility icons with the same defaults. A single name map is the only place an icon is chosen.
- **Gradient ids must be unique per rendered instance** (`useId()`), otherwise multiple icons on one page break each other's fill.
- Colour: strokes use `currentColor` (slate idle, cl-blue-text active, white on blue); gradient stops are fixed brand values (logo colours are allowed here only).
- Sizes: 16 (inline), 20 (nav, buttons), 22 (phone bar), 24 (headings), 32+ (cards, empty states). At 16 px use the idle version without gradient; check each icon by eye at 16 and report any that need a simplified 16 px drawing (backlog, do not redraw).
- Decorative next to text → `aria-hidden="true"`; icon-only buttons keep `aria-label` + tooltip.

## 3. Where they replace current icons
- Student sidebar + phone bottom bar (NAV-1): Home, Practice, Mocks, Current Affairs, Results (when the route exists), Mistake Vault, Learn (when ready). Active state = `active` prop on the active item only.
- Phone centre button "Today's mock": `todays-mock` on-blue.
- Result page (RESULT-UX-1): "Learn: <topic>" button → `learn` on-blue; Mistake Vault icon button → `mistake-vault`; Memory Lock → `memory-lock`; Practice buttons → `practice`.
- Dashboard / landing feature cards that show these features → brand icon at 26–32 px, active style, in a cl-blue-tint tile.
- Utility icons (help, user, sign out, close, chevrons, report flag, search…) → Lucide via `<Icon>`.
- Exam screen icons are unchanged in this phase (except shared utility icons if they already come from the same map — report).

## 4. Rules
One meaning per icon everywhere · no emoji · no mixing icon sets for core features · logo colours only on active items and the Today's mock button · no new dependencies (Lucide already present).

## 5. Out of scope
New pages/routes, dark mode, animated icons, admin icons, redesign of the 16 px variants (backlog), app icon/favicon (already final in the logo suite).
