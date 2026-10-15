# UX-0 page specs

Every spec uses the same template:

1. purpose
2. user and job-to-be-done
3. sections (top to bottom)
4. components
5. data
6. states
7. access tier
8. SEO
9. analytics events
10. mobile behaviour
11. dependencies

The design tokens and components live in [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md); URLs and navigation in [SITEMAP_IA.md](../SITEMAP_IA.md).

**Analytics event names** are proposals only. ACT-1 owns the contract (properties, identity, consent). All names use `snake_case` with an `object_action` shape.

| # | Spec | URL | Build phase |
|---|---|---|---|
| 1 | [Landing](landing.md) | `/` | UX-2 |
| 2 | [Exams directory](exams-directory.md) | `/exams` | UX-2 |
| 3 | [Exam detail (hub)](exam-detail.md) | `/exams/[examSlug]` (+ modules) | UX-2 |
| 4 | [Courses catalogue](courses-catalogue.md) | `/courses` | UX-4 |
| 5 | [Course path and player](course-path-player.md) | `/exams/[examSlug]/course/…` | UX-4 |
| 6 | [Test series catalogue](test-series-catalogue.md) | `/test-series`, `/exams/[examSlug]/test-series` | UX-5 |
| 7 | [Test series detail](test-series-detail.md) | `/exams/[examSlug]/test-series/[seriesSlug]` | UX-5 |
| 8 | [Test flow: instructions → console → result → solutions](test-flow.md) | `/mock-tests/…` | UX-3 (polish) |
| 9 | [Onboarding](onboarding.md) | `/onboarding/*` | UX-3 |
| 10 | [Dashboard](dashboard.md) | `/dashboard` | UX-3 / UX-6 |
| 11 | [My exam home](my-exam-home.md) | `/my/[examSlug]` | UX-6 |
| 12 | [Practice](practice.md) | `/practice` | UX-6 |
| 13 | [Mistake vault](mistake-vault.md) | `/mistakes` | UX-3 (polish) |
| 14 | [Analytics](analytics.md) | `/analytics` | UX-7 |
| 15 | [Pricing](pricing.md) | `/pricing` | UX-7 (touchpoints UX-2) |
| 16 | [Profile and settings](profile-settings.md) | `/settings/*` | UX-3 |

**Global states** apply to every page and are not repeated per spec:
- Loading is a skeleton matching the layout, inside the `loading.tsx` of the route segment.
- Errors use a route `error.tsx` with the message "Something went wrong on our side. Try again", plus Retry and Home. Raw DB text is never shown (SEC-1B).
- Not-found and denied use the 404 card (ruling A for denied signed-in users).
- Offline shows a banner. The console has its own offline queue.
