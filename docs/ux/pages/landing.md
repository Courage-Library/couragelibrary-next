# Landing: `/`

**Purpose.** Explain in one screen what Courage Library is (a government-exam preparation platform backed by a real library in Kanpur) and route visitors to their exam or a free mock. It replaces today's developer placeholder, which shows a "Phase 1B" badge and the Supabase connection-state card with the project name.

**User and job-to-be-done.** A first-time visitor from search, social, an ad or a library QR code. Their job: "Show me you cover my exam and let me try it free, now."

## Sections (top to bottom)
1. **Header** (public).
2. **Hero:**
   - h1 value proposition ("Prepare for government exams with real mocks, a clear syllabus path and revision that remembers your mistakes")
   - an exam picker: search or select an active exam, which goes to `/exams/[slug]`
   - primary CTA "Take a free mock"
   - secondary CTA "Explore exams"
   - trust line: "Free to start · Made in Kanpur · {N} questions, {M} mocks", with live counts
3. **Your exam:** cards for the active exams (generated; today only SSC CGL is active). Shows category chips and an "All exams" link.
4. **How it works:** 4 steps (Mock, Mistakes saved, Learn the topic, Practise). Each links into the matching system page, with a small product screenshot per step.
5. **Free mock teaser:** today's daily mock card (from `AssessmentService` dashboard data, anonymous mode) plus one sample question answerable without login. This pattern worked well on the legacy site (`mock/ssc-cgl.html`).
6. **Current affairs strip:** the latest 3 items. Hidden when there are 0 articles (0 today).
7. **Courage Library, Kanpur:** physical library photo, address, timings, link to `/about`. This trust anchor is unique to us.
8. **Pricing teaser:** "Free forever: mocks, mistakes, revision. Pro: opening soon" with a link to `/pricing`.
9. **FAQ** (5 to 7 items, accordion, `FAQPage` JSON-LD).
10. **Final CTA band**, then the footer.

**Components.** Header, Button, Select (exam picker), Exam card, Test card, Question renderer (practice mode, single question), Card, Accordion, Breadcrumb (none on home), Footer.

## Data
| Section | Source |
|---|---|
| Exam list | `ExamKnowledgeCandidateService.getExamsDirectory` (active exams only) |
| Counts | Published questions / mocks: a new cached `PublicStatsService` (read-only counts, revalidate 1h) |
| Daily mock | `AssessmentService.getStudentMockDashboardData` (anonymous) |
| Sample question | A published question flagged `is_sample`. **Needs a flag:** Content ops / GAP2-4. Until then, the first question of the free full mock, with no answer leakage beyond that one item. |
| Current affairs | `CurrentAffairsService.getHubData` |

**States.**
- If no active exams exist, the "Your exam" section hides and the hero shows only "Explore exams".
- When counts are low, hide the numbers below the thresholds (no "3 questions").
- Signed-in visitors get the hero CTA "Go to dashboard" and the sample question hidden.

**Access tier.** Public.

**SEO.**
- Title: "Courage Library: Government Exam Preparation with Free Mock Tests".
- Description: about 150 characters.
- JSON-LD: `EducationalOrganization` (Kanpur address, sameAs), `WebSite` + `SearchAction` (later), `FAQPage`.
- OG: 1200×630 generated image.

**Analytics events.** `landing_viewed`, `exam_picker_selected`, `cta_free_mock_clicked`, `sample_question_answered`, `faq_expanded`.

**Mobile behaviour.**
- The hero stacks with the exam picker full width and a sticky bottom CTA "Take a free mock" after the hero scrolls away.
- Exam cards scroll horizontally.
- LCP is the h1 text, with no hero image above the fold on mobile.

**Dependencies.**
- Brand assets: an SVG logo and an OG template (owner).
- Sample question flag (Content ops).
- About content (owner).

Otherwise it can be built now (UX-2).
