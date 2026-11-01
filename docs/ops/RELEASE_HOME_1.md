# Release checklist: feat/home-1 → main

Run this only when the owner says **"release"**. Until then everything stays local (LOCAL-FIRST rule).

## 0. What ships

`main` is at `84458a7` and is the merge-base, so this is a **fast-forward** (no merge commit).

| Commit | What |
| --- | --- |
| `a101de6` | HOME-1 Phase A: landing audit + categories proposal; LOCAL-FIRST rule in the runbook |
| `b713b27` | Phase B: exam categories (128), category pages, landing redesign, sized logo copies |
| `9f9921f` | Owner decisions: compact phone layout; Settings › Home page photo (129) |
| `15d7773` | BUILD-FONT-1 self-hosted fonts + owner UI review fixes |
| `a792f79` | UX-2a L-10 re-pointed to the category model |
| `0605afb` | Release checklist |
| `773fb3a` | Design upgrade: solid header, navy footer, connected loop with real screenshots, hero phone mockup, library gallery (130), background depth |
| `2cf7ff8` | Checklist update |
| `45bacca` | Expert UX pass + brand settings (131): official logo everywhere, Settings › Brand, honest H1, live cards + coming-soon line, live stats, explore bar, reveal on scroll, share images, one radius / shadow / icon scale |

## 1. Before pushing

- [ ] Working tree clean on `feat/home-1`; `git log --oneline main..feat/home-1` shows exactly the commits above.
- [ ] Migrations 128, 129, 130 and 131 are already applied. 131 (brand settings: `site_media` reshaped for brand assets) was applied on 2026-11-01 with backup `pre-131-…-resilient`, after a dry-run and a rolled-back pre-apply smoke; it was then live-verified with `SITE-MEDIA-LIVE` M-1/M-2/Z-1, and the types were regenerated.
- [ ] 130 (`site_gallery`) was applied on 2026-11-01 with backup `pre-130-…-resilient`, after a dry-run and a rolled-back pre-apply smoke; it was then live-verified with `SITE-GALLERY-LIVE` G-1..G-3 + Z-1, and the types were regenerated. Re-check that the ledger shows 128–131 as `APPLIED` and nothing pending (read-only query on `public.schema_migration_ledger`). **No new migration ships, so no backup step is needed.**
- [ ] `site_media` (129) is reused by 131 for the brand assets (no drop needed).
- [ ] Local: full offline list (81/81), `npx tsc --noEmit`, lint, `npm run build`. Note that `/` must be ≤ 110 kB.
- [ ] No queued CI dispatch (a push cancels a pending dispatch).

## 2. Ship and CI (one run)

- [ ] `git checkout main && git merge --ff-only feat/home-1 && git push origin main`
- [ ] The push run covers the offline list, server-checks (including UX2A-LIVE with the new L-10, BRAND-2 P-01/P-02, HOME-1) and prod smoke.
- [ ] Live gates touched by 128 / 129 / 130 / HOME-1 (EXAM-CATEGORIES-LIVE, SITE-MEDIA-LIVE, SITE-GALLERY-LIVE, EXAM-LOGO-1 live, SEC1B / SEC1C) need **one** `workflow_dispatch` with `live: true` on `main`. Dispatch it after the push run has finished; never push while it is queued.
- [ ] BRAND-2 probe P-04 / P-05 now test glass on `/auth/login` (the header is solid); check that they pass in server-checks.
- [ ] BRAND-2 P-03c / P-03d now target the current hero CTA (`/#categories`) and the "All exams" link. Before, they still pointed at the pre-Phase-B "Explore SSC CGL" link and were stale.
- [ ] UX-2a L-3 amendment (needs owner sign-off): `HomePage` may await only the cached, 800 ms-bounded live-category names (for the honest H1). The live check L-15b still proves the hero is in the first HTML flush.
- [ ] Classify any failure using the server log before retrying (at most 3 attempts).

## 3. After deploy (production, anonymous only; never sign in to prod)

- [ ] The production HTML for `/` has `<link rel="preload" ... as="font">` for exactly one file: the Poppins 700 Latin `…-s.p.woff2`. A local Windows build cannot show this because of the Next manifest path bug, so a Linux build must be checked.
- [ ] `/` first-load JS ≤ 110 kB (CI front-end budget); fonts on `/` ≤ 160 KB, with no Devanagari file.
- [ ] Prod anonymous smoke: `/` → 200, one h1, the category tiles (SSC = link with "1 exam", the others "Coming soon").
- [ ] `/exams` and `/exams/ssc` → 200; SSC CGL is listed as a link; the other category pages show "Coming soon" with no broken links.
- [ ] Header shows the CL monogram and menu at 390 and 1280; footer accordions on phones; legal links read "Privacy" and "Terms" (pages still show the draft notice).
- [ ] FAQ opens and closes (chevron turns, expanded state toggles); "Free during early access." appears under the final CTA.
- [ ] The production HTML of `/`, `/exams` and `/exams/ssc` contains **no storage host**. Logos, icons and library photos come only from same-origin `/media/logos/…`; product screenshots come only from `/marketing/…`.
- [ ] Design upgrade:
  - one solid white sticky header (shadow appears only after scrolling, with no jump);
  - deep-navy footer with a cyan top line, and the accordions still open on phones;
  - How it works: on desktop the 5 steps are joined by arrows with a line back to Learn; on phones it is a timeline;
  - the hero phone screen sits on the right on desktop and under the button on phones.
- [ ] LCP on `/`: the H1 is still the LCP element (CI front-end budget P-06), and the `/marketing/*.webp` files return 200 with `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`.
- [ ] Expert UX pass:
  - the header / menu / footer show the official logo (white plate on navy);
  - `/favicon.ico`, `/brand/icon/32|180|192|512` redirect to PNGs, and the manifest lists 192 + 512;
  - `og:image` on `/` is `/opengraph-image` and on `/exams/ssc` is `/exams/ssc/opengraph-image` (1200 × 630 PNG), with `twitter:card` = `summary_large_image`. Run a share preview (WhatsApp / X card validator) once.
  - On phones the "Explore exams" bar appears only after the hero and hides at the final CTA.
  - Every section is visible after scrolling (reveal on scroll never leaves one hidden).

## 4. Reminders for the owner

- **Create new exams only after this release.** The exam form now needs a category (selector). Before release, the production admin puts a new exam in the hidden **Internal** category.
- Upload 5–8 real library photos in **Settings › Library photos** after release (at most 6 are shown, in order). Each photo needs alt text and a choice: no recognisable person, or written consent obtained. No stock photos and no AI images. Without photos the section stays text-only.
  - With photos, phones get a swipeable row (about 230 px more). The page then measures about 4,470 px at 390 and about 4,820 px at 360, above the 4,600 px guideline on the narrowest phones.
- The product screenshots are re-captured with `scripts/content/capture-marketing.cjs` (see `public/marketing/README.md`). The `--mock` mode writes: it starts and then submits one qa-student attempt, so take a backup first.
- Category icons can be uploaded in **Exams › Categories**. Until then the built-in line icons are used.
- **Brand:** the official logo (`public/images/logo.png`) is used by default. Upload a higher-resolution square mark (at least 512 × 512) in **Settings › Brand**: the current 512 px app icon is upscaled from the 245 px logo. A horizontal logo and a light footer logo are optional.
- The Hindi chip is data-driven (HOME-1 H-20). It shows only when published content has a Hindi version, worded for exactly what exists, and the FAQ answer follows the same data. On 2026-11-02: 0 Hindi questions (403 in review, 21 draft), 0 Hindi lessons, current affairs have no Hindi version, so the chip is hidden and the FAQ says "Not yet".
