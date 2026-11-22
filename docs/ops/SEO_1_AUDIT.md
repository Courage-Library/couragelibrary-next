# SEO-1 — technical SEO audit + fixes (couragelibrary.in, 2026-11-22)

Audit: anonymous, read-only crawl of `https://couragelibrary.in` (production 6405bb8): robots.txt, the sitemap (74 URLs),
every sitemap page plus 64 non-sitemap routes (private, thin, 404, legacy, icons), 154 internal links, lab CWV (phone
390 × 844 at 4× CPU slowdown, desktop 1280 × 900). Fixes: one code-only release (no DB / RLS change), gate
`scripts/test_seo1.cjs`.

## Audit table

| # | Route(s) | Issue | Severity | Fix |
|---|---|---|---|---|
| 1 | `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/update-password`, `/dashboard`, `/billing`, `/notifications`, `/wallet`, `/performance`, `/mistakes`, `/achievements`, `/certificates`, `/store`, `/faculty/evaluations`, `/mock-tests/<id>` + `/take` `/result` `/leaderboard` (18) | 200, **indexable**, and `<link rel="canonical">` = the **home page** (inherited from the root layout's default); 9 share the default title + a 202-char description | **High** | `X-Robots-Tag: noindex` on every private / thin route (`lib/seo/private-routes.ts` → next.config); the root layout no longer emits a canonical (only pages that name their URL do) |
| 2 | robots.txt | `Disallow: /dashboard/` does not match `/dashboard`; Disallow would also hide a noindex | Low | unchanged (CA6-SEO-22); the noindex header now covers it |
| 3 | `/exams/ssc` (live category hub) | indexable, self-canonical, **not in the sitemap** | Medium | sitemap lists category hubs with ≥ 1 active exam (`lib/seo/category-sitemap.ts`; same rule as the page's noindex) |
| 4 | `/category/<slug>` | 200 duplicate of `/exams/<slug>` (canonical to it) | Medium | one 308 → `/exams/<slug>` (the internal rewrite target keeps working) |
| 5 | `/favicon.ico`, `/apple-touch-icon.png`, manifest icons | favicon = 307 to an old PNG; apple-touch-icon **404**; manifest icons via 307; no maskable; not the final logo suite | Medium | static files from `public/brand/courage-library-logo-suite` (`lib/seo/brand-icons.ts`): ico + svg + png icons, apple-touch 180, manifest any + maskable 192 / 512; `/favicon.ico` + `/apple-touch-icon.png` served 200 |
| 6 | lesson pages (`/learn/…`, 17) | BreadcrumbList middle crumb (subject) without `item` → invalid for Google | Medium | unlinked middle crumbs left out of the JSON-LD, positions renumbered (visible trail unchanged) |
| 7 | `/`, `/hi` | Organization logo = old `/images/logo.png`; no WebSite JSON-LD | Medium | logo → suite `mark-512.png` (square); WebSite JSON-LD (name, url, inLanguage; no SearchAction — there is no search page) |
| 8 | `/`, `/hi` | FAQPage JSON-LD vs visible FAQ | OK | already one source (`t.faq.items`); now gated (EN + HI, two fact sets) |
| 9 | exam module + exam-topic pages (36) | titles 66–96 chars (cut in results) | Low | the brand suffix is kept only while the title fits 60 |
| 10 | `/exams/ssc-cgl` | description 39 chars (just the exam's full name) | Low | stored descriptions under 70 chars use the generated one |
| 11 | lessons, exam modules, `/current-affairs`, `/practice` (13) | descriptions 162–283 chars | Low | `seoDescription()` clamps to 160 at a word ("…") |
| 12 | all non-landing pages | no `og:locale` | Low | `en_IN` by default (the landing keeps en_IN / hi_IN) |
| 13 | `/hi` | `<html lang="en">` | Low–Med | backlog **SEO-HTML-LANG-1** (needs a root-layout split) |
| 14 | `/mock-tests/<id>` | public but default metadata (thin, duplicate) | Low | noindex now; backlog **SEO-MOCK-PAGES-1** |
| 15 | CA date / month pages with nothing published; coming-soon exams and categories | already noindex | OK | — |
| 16 | sitemap | 74 URLs, all on the apex, all 200, self-canonical, none noindex / redirected; lastmod real; hreflang en / hi on `/` + `/hi`; no `/hi/learn` (no Hindi lesson published) | OK | gate: no static URL is private, redirected or a legacy source |
| 17 | internal links | 154 checked: 0 broken; none to vercel.app or `.html`; legacy URLs one 308 | OK | — |
| 18 | social previews | OG + Twitter on every page, absolute apex URLs, 1200 × 630 images (`/opengraph-image`, per-exam cards) | OK | — |
| 19 | CWV (lab) | `/` LCP 1.0–1.4 s, `/hi` 1.4 s, `/exams` 0.9 s, lesson 1.6 s; CLS 0 everywhere; `/exams/ssc-cgl` phone TBT 363–486 ms | Med (one page) | backlog **PERF-EXAM-HUB-TBT-1** |
| 20 | IndexNow | not present | Info | backlog **SEO-INDEXNOW-1** (needs a publish hook; Bing imports from Search Console) |
| 21 | analytics | **none** in the code (no GA / GTM / Vercel Analytics / pixels) | Info | none added (DPDP consent first) |
| 22 | site default description | 202 chars (owner text #47, pinned by UX2A L-16) | Low | clamped in the meta tag; backlog **SEO-DESC-47** (owner choice) |

## Owner follow-ups (Search Console / Bing)

- Submit `https://couragelibrary.in/sitemap.xml`; request indexing for `/`, `/hi`, `/exams`, `/exams/ssc`, `/exams/ssc-cgl`.
- URL Inspection on `/auth/login` after the deploy: "Excluded by 'noindex' tag" is the expected result.
- Rich Results Test on `/` (FAQ, Organization) and one lesson (Breadcrumb).
- Bing: import from Search Console.
- Theme colour: the manifest / `theme-color` use the site palette's primary `#1D4ED8` (BRAND-1 / design ratchet); the logo
  suite's mark is violet `#4B00E6` with a cyan gradient. Say if the browser chrome should follow the logo instead.
