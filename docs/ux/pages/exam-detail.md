# Exam detail (hub): `/exams/[examSlug]` and `/exams/[examSlug]/[moduleSlug]`

**Purpose.** The single home of an exam. It answers "what is this exam, when is it, what's the syllabus" (Exam Knowledge) and moves the visitor into preparation (course, mocks, test series). The page is generated for every active exam.

**User and job-to-be-done.** An aspirant researching or preparing for one exam. Their job: "Understand the exam quickly, then start preparing for it here."

## Today
The page works, and SSC CGL has 24 published modules. On mobile it renders as a **single list of 24 module cards about 7,000px long**, each with a "Read Guide" button. No mocks or course appear on the hub. The overview, important dates, syllabus and cut-offs carry equal visual weight with the FAQ and admit-card cards.

## Sections (hub)
1. Breadcrumb and an **exam header**:
   - name, conducting body, and a cycle chip ("2026 · Active")
   - key facts row: posts, vacancies, age, qualification, and exam mode as Stat tiles, taken from Exam Knowledge modules
   - "Last updated" date
2. **Primary actions:**
   - "Take a free mock" (first free published mock of the exam)
   - "Start the course" (`/exams/[slug]/course`; hidden until GAP2-4)
   - "Add to my exams" (signed-in; writes the profile)
3. **Important dates timeline:** notification, application window, exam window, from `exam_cycles`. Unknown dates render as "To be announced", not as empty fields.
4. **Exam pattern summary:** tiers and stages table and marking scheme, from the `EXAM_PATTERN` module and `exam_patterns`. Links to the full module.
5. **Syllabus snapshot:** subjects with topic counts and weightage chips (GAP2-4). Each subject links to the course subject page. Before GAP2-4, it links to the `SYLLABUS` module.
6. **Practice for this exam:**
   - 3 test cards (today's daily mock, full mock, a sectional)
   - "All mocks / test series" link (UX-5)
7. **Guides (Exam Knowledge modules), grouped into 4 categories** (replaces the 24-card list):

   | Group | Modules |
   |---|---|
   | About the exam | overview, posts, salary, career |
   | Eligibility | age limit, qualification, physical standards |
   | Process | application, admit card, selection process, result |
   | Strategy | preparation, preparation strategy, cut-off trends |

   Each group is a card listing its module links (title plus a one-line summary).
8. **Latest updates:** announcements and notifications, from `exam_announcements` (0 today; hidden when empty).
9. **FAQ:** from the `FAQ` module, rendered as an accordion with `FAQPage` JSON-LD.
10. **Related exams** (same category, generated).

## Sections (module page `/exams/[slug]/[moduleSlug]`)
- Breadcrumb ("Exams › SSC CGL › Eligibility").
- h1 and last-updated date, with a table of contents (sticky on desktop, collapsible on mobile).
- Body rendered from the published Exam Knowledge document, in reading width (720px).
- Previous/next module within its group (a legacy pattern worth keeping).
- Sidebar (desktop): exam quick facts and "Take a free mock".

**Components.** Breadcrumb, Stat tile, Badge, Timeline (a list variant of Progress steps), Table, Card, Test card, Course/topic node (snapshot), Accordion, Button.

## Data
| Content | Source |
|---|---|
| Hub, modules, cycles | `ExamKnowledgeCandidateService.getExamKnowledgeCandidateView` + `ExamModuleRegistry` (70 published EK documents across 4 exams; 24 for SSC CGL) |
| Mocks | `AssessmentService` (mock templates by `exam_id`) |
| Syllabus snapshot | GAP2-4 syllabus service over `exam_syllabus_versions` and `exam_syllabus_nodes`, mapped to canonical nodes. **Today there are 0 syllabus versions and 0 nodes.** |
| "Add to my exams" | `user_exam_goals` insert (UX-3 onboarding service) |

**States.**
- Unknown exam slug, or an inactive exam with no content: 404.
- An inactive exam with content shows a "Preparation opening soon" banner and hides the practice blocks.
- Dates missing: "To be announced".
- No syllabus yet: the snapshot shows a link to the SYLLABUS module.

**Access tier.** Public; "Add to my exams" is signed-in only.

**SEO.**
- Title: "{Exam} {Year}: Exam Pattern, Syllabus, Eligibility, Dates & Free Mock | Courage Library".
- JSON-LD:
  - `Course` (once the course exists)
  - `Event` for exam dates, only when the dates are confirmed
  - `FAQPage`, `BreadcrumbList`
- Module pages get "{Exam} {Module} {Year}".
- `/cycle/[currentYear]` has its canonical set to the hub.

**Analytics events.** `exam_hub_viewed`, `exam_module_viewed`, `exam_cta_mock_clicked`, `exam_cta_course_clicked`, `exam_added_to_profile`, `exam_module_group_opened`.

**Mobile behaviour.**
- Below the header, a sticky in-page tab bar: Overview · Dates · Pattern · Syllabus · Practice · Guides.
- Module groups collapse; the target page length is about 3 screens before the guides.
- Primary CTA in a sticky bottom bar.

**Dependencies.**
- The structure ships in UX-2.
- The syllabus snapshot and course CTA need GAP2-4.
- Dates need Content ops (cycle dates are null).
- Test-series link needs UX-5.
