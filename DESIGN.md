# DESIGN.md: pointer to the canonical design system

> **This file is a pointer, not a design system.**
>
> The canonical sources are:
> 1. **[docs/ux/DESIGN_SYSTEM.md](docs/ux/DESIGN_SYSTEM.md)**: the rules and component specs.
> 2. **[app/globals.css](app/globals.css)**: the tokens, under `@theme static`.
> 3. **[components/ui/](components/ui)**: the primitives, plus `contrast-pairs.json`.
>
> Enforcement: `scripts/test_design_ratchet.cjs` (decision #40; counts may only fall).
>
> If this file disagrees with those sources, they win. This file must not define tokens, and it does not duplicate component specs.
>
> Written in UX-T0 (2026-10-19). It also tells design skills (Impeccable, Emil Kowalski's motion skills) how to apply their advice here. See the Skill Calibration Table below. Product context is in [PRODUCT.md](PRODUCT.md).

## Token summary (read-only digest of `app/globals.css`)

**Colour**
- `primary-50…950`: violet; brand `primary-600` #5000F0, the only primary.
- `accent-50…900`: cyan, **decorative only, never text on white**; icons use `accent-700`.
- `ink-50…950`: neutrals.
- Status colours: `success`, `warning`, `danger`, `info` at 50/200/600/700/800.

**Semantic aliases.** Use these first:
- surfaces: `canvas`, `surface`, `surface-sunken`;
- text: `fg`, `fg-secondary`, `fg-muted`, `fg-disabled`, `fg-inverse`;
- lines and links: `line`, `line-control`, `link`, `focus`;
- answers: `answer-{correct,wrong,selected}-{fg,border,bg}`.

**Type.** Inter via `next/font`. Minimum **12px**; weights 400–700.

| Token | Size |
|---|---|
| `caption` | 12px |
| `body-sm` | 14px |
| `body` | 16px |
| `body-lg` | 18px |
| `h3` | fluid `clamp()`, 18→20px |
| `h2` | fluid `clamp()`, 22→28px |
| `h1` | fluid `clamp()`, 28→36px |
| `display` | fluid `clamp()`, 36→48px |

**Shape and elevation**
- Radii: `rounded-badge` 6, `rounded-control` 8, `rounded-card` 12, `rounded-sheet` 16.
- Shadows: `shadow-e1…e3`.
- Focus: the `focus-ring` utility.

**Motion**
- One easing token: `--ease-standard` = `cubic-bezier(0.2,0,0,1)`.
- Durations per DESIGN_SYSTEM.md: 120 micro / 200 enter-exit / 300 sheets.
- Only opacity and transform; `motion-safe:` / `motion-reduce:` guards.
- The timer never animates.
- There are **no duration tokens yet**. Proposed additions are in `docs/reports/ux/UXT0_DESIGN_AUDIT_REPORT.md` §6; they are not adopted.

**Theme.** Light only. The `dark:` variant is inert (`[data-theme=dark]` is never set; ratchet R-3).

**Layout.** Content width 1200px (#46); mobile-first; touch targets ≥44px; console options ≥48px.

**Banned in new or changed code** (ratchet):
- raw colours;
- Tailwind palette classes (`bg-blue-600`, `text-slate-500`…);
- `dark:`;
- text below 12px;
- new imports of `components/ui/legacy/*`.

## Surface → mode map

The mode follows Impeccable's vocabulary. It is chosen per surface, not per product.

| Mode | Routes |
|---|---|
| **Operate** | `/dashboard`, `/mock-tests`, `/mock-tests/[id]` (pre-test), `/mock-tests/[id]/result`, `/mock-tests/[id]/leaderboard`, `/performance`, `/mistakes/*`, `/practice`, `/flashcards/*`, `/achievements`, `/notifications`, `/admin/*` |
| **Operate: console (frozen)** | `/mock-tests/[id]/take`, `/live-tests/[slug]/take`. Server-authoritative and distraction-free: no decorative or new motion; no change to timer, autosave, palette or submit behaviour |
| **Read** | `/current-affairs` (hub, `[slug]`, `date/*`, `month/*`), `/articles/*`, `/exams`, `/exams/[slug]/*`, `/courses/*` content |
| **Persuade** | `/` (landing), `/pricing`, `/premium`, `/auth/login`, `/auth/signup`, future `/cnts`, `/partners/*` |

## Skill Calibration Table

Impeccable (v4.6.0) and Emil Kowalski's skills are **advisory**. The canonical system wins every conflict.
- **Resolution:** *adopt* (follow the skill), *adapt* (follow it within our rule), or *reject* (our rule replaces it).
- **"DS"** means docs/ux/DESIGN_SYSTEM.md.

| # | Skill rule | Courage Library rule | Resolution | Reasoning |
|---|---|---|---|---|
| C-1 | Impeccable craft-floor: **eyebrow/kicker labels are an absolute ban** | DS L142 allows one uppercase eyebrow at caption size (+0.04em), at most one per section. UX-2a's hero has a sentence-case **eyebrow pill with a cyan dot** (`components/landing/landing-sections.tsx:43-46`) | **adapt** | At most one per section, and only when it carries real information (category, exam, status), never as decoration above every heading. The landing pill stays: UX-2a is closed pending owner review and is out of scope. Skills must not flag it for removal |
| C-2 | Impeccable: **hero-metric / big-number stat-tile template** is a reflex to avoid | DS L224 **Stat tile** spec; `components/ui/stat-tile.tsx`; DS L236 Result summary (score hero) | **adapt** | On Operate surfaces the number *is* the content (score, accuracy, due mistakes), so stat tiles are allowed there. On Persuade surfaces vanity metrics are banned anyway (#47, no inflated claims). Every tile carries a text label and a text delta |
| C-3 | Impeccable: **sparklines / progress rings as content stand-ins** | DS L223 Progress ring (topic mastery, course %); DS L224 optional sparkline | **adapt** | A ring or sparkline must sit next to its number and text (`aria-valuetext`). Never use one as the only carrier, and every chart has a table alternative (analytics spec) |
| C-4 | Impeccable: **light or dark is chosen by use scene**, not by category | Locked **light-only** (UX-1a, #31). Dark is inert, enforced by ratchet R-3 | **reject** | Our use-scene analysis supports light: daylight, libraries, low-end screens. The decision is locked; skills must not propose a dark theme |
| C-5 | Impeccable: font sourcing (pick or self-host a distinctive face; avoid reflex defaults) | Inter via `next/font` (self-hosted) is locked. DS L121 pairs Noto Sans Devanagari for Hindi | **reject** | The pairing was chosen for Devanagari x-height and stroke parity, OFL licensing, the ≤2 font files budget (DS L277) and the low-end Android audience |
| C-6 | Impeccable operate.md: **fixed rem type scale, not fluid**, in app UI | `caption`, `body-sm`, `body` and `body-lg` are fixed rem; `h3`, `h2`, `h1` and `display` are `clamp()` | **adapt** | Body sizes are already fixed. The fluid heading ranges are narrow (h3 18→20) and are locked tokens. No new type tokens; if UX-2b needs fixed headings in dense Operate tables, it uses `text-body-lg` / `text-h3` |
| C-7 | Emil: custom curves `--ease-out` (0.23,1,0.32,1), `--ease-in-out` (0.77,0,0.175,1), `--ease-drawer` (0.32,0.72,0,1) | Only `--ease-standard` exists; no duration tokens | **adapt** | Until a phase adds them as `@theme` tokens (proposal in the UX-T0 report §6), use `ease-standard` with DS durations. Never write an inline `cubic-bezier()` in components (it is also a rawColor-style literal smell) |
| C-8 | Emil: UI motion under 300ms; never `ease-in` on UI; no `transition: all` | DS 120/200/300ms, opacity and transform only | **adopt** | Fully compatible. `transition-all` is legacy debt (172 uses outside admin) |
| C-9 | Emil: `scale(0.97)` on `:active` for pressable elements | DS motion rules; the console has **no new motion** | **adapt** | Allowed on non-console buttons as `motion-safe:active:scale-[0.97]` with `duration-120`. **Never in the console** or on high-frequency keyboard actions |
| C-10 | Emil: never `scale(0)`; enter from `scale(0.95)` plus opacity | DS: opacity and transform only | **adopt** | Compatible |
| C-11 | Emil: gate hover effects with `(hover:hover) and (pointer:fine)` | Mobile-first; touch targets ≥44px | **adopt** | Tailwind v4's `hover:` already compiles behind `@media (hover:hover)`. Hover must never carry meaning (no hover-only reveal of actions) |
| C-12 | Emil: reduced motion means **gentler, not zero** | DS L172: `prefers-reduced-motion` disables all non-essential motion | **adapt** | Non-essential motion goes to zero (DS wins). Essential state feedback may keep an opacity cross-fade of 120ms or less |
| C-13 | Impeccable operate: **skeletons, not spinners**; every state designed | DS has Skeleton and Spinner; segment `loading.tsx` uses `page-loading.tsx` (#48) | **adopt** | Spinner only inside a pending button or for indeterminate background work under 1s. Page and region loading uses Skeleton |
| C-14 | Impeccable craft-floor: **no section numbers** as decoration | UX-2a landing uses violet step numbers for the 7-step learning loop | **adapt** | Numbers are allowed when they encode a real sequence (loop steps, test sections, question numbers); never as ornament |
| C-15 | Impeccable craft-floor: no gradient text, no emoji icons, no side borders over 1px | DS: tokens only, lucide icons | **adopt** | Compatible. Existing emoji medals (`components/live-test/live-test-result-client.tsx:365`) are UX-2b debt |
| C-16 | Impeccable Persuade: bold, distinct, real imagery, full commitment | DS L3 "clean, premium, light, trustworthy"; landing LCP is the h1, with no hero image above the fold on mobile; CWV budgets | **adapt** | Ambition shows as precision, honest data and typography, not imagery weight. Performance budgets win on low-end Android |
| C-17 | Impeccable: custom scrollbars / theming browser surfaces | Operate: "don't reinvent affordances" | **reject** | Native scrollbars and controls; `color-scheme: light` |
| C-18 | Impeccable hooks (`/impeccable hooks on`) and auto-edit | UX-T0 brief: hooks forbidden | **reject** (for now) | Skills advise; they do not edit product code automatically. A later phase may revisit |
| C-19 | Impeccable `audit` "Implementation Integrity" uses the bundled detector engine | Launcher engine verification failed closed in UX-T0 | **n/a** | Manual review plus the design ratchet stand in. No workaround |
| C-20 | Emil: animate list entries and stagger reveals | Console: no decorative motion. CWV: INP ≤200ms, low-end CPUs | **adapt** | No entry or stagger animation on Operate data lists, and none at all in the console. Allowed sparingly on Persuade surfaces behind `motion-safe:` |

**Locked decisions that every skill must respect:** #19, #20 (auth/redirect hygiene); #26–#29 (pages are views over systems; course = syllabus path; one test engine; onboarding writes the profile); #30, #31 (one design system; light, violet primary, decorative cyan); #35; #40 (ratchet); #44 (no new dependency); #46 (1200px); #47 (no inflated claims in metadata); #48 (no root `loading.tsx`); #49 (honest sitemap). See the UX-T0 report §1 for the full list.
