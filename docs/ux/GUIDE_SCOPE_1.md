# GUIDE-SCOPE-1 — one clear scope per exam guide (no merging)

2026-11-02 · owner ruling: **no merging** — all 24 module types and every guide stay separate (each exam's guides are
independent of other exams). The overlap is fixed by scope instead. Nothing archived, no redirects, **no DB change**.

## The 24 scopes (single source: `services/exam-knowledge/exam-module-registry.ts` → `covers` / `mustNotRepeat`)

| Guide | Covers | Must NOT repeat (link to the named guide instead) |
|---|---|---|
| Exam Overview & Conducting Authority | What the exam is, who conducts it, why it exists and its stages at a glance. | Dates, eligibility details, the pattern's numbers, pay and the post list — link to those guides instead. |
| Important Dates & Cycle Timeline | This cycle's official dates: notification, application window, admit card, exam and result dates. | How to apply (Application Process & Fee Structure), the age cut-off rules (Age Limits & Relaxation Rules), how results work (Result Declaration & Merit Ranking). |
| Eligibility Criteria (Age, Education & Category) | A one-page summary of who may apply: nationality, the age band and the minimum qualification in one line each, with links. | Post-wise age tables and relaxations (Age Limits & Relaxation Rules), degree details (Educational & Technical Qualifications), physical standards (Physical Standards & Medical Requirements). |
| Age Limits & Relaxation Rules | Post-wise minimum and maximum age, the date age is counted on, and category relaxations. | Qualifications (Educational & Technical Qualifications) and nationality (Eligibility Criteria). |
| Educational & Technical Qualifications | Required degrees and subjects per post, final-year applicant rules and technical prerequisites. | Age rules (Age Limits & Relaxation Rules). |
| Physical Standards & Medical Requirements | Physical measurements, endurance tests and medical standards for the posts that require them. | The order of the selection stages (Selection Process & Recruitment Stages). |
| Application Process & Fee Structure | How to apply step by step: registration, photo and signature specifications, fees, payment and the correction window. | The dates (Important Dates & Cycle Timeline) and who may apply (Eligibility Criteria). |
| Selection Process & Recruitment Stages | The selection stages in order and how the final merit is formed. | Questions and marks per section (Exam Pattern & Marking Scheme) and cut-off numbers (Cutoff Trends & Qualifying Benchmarks). |
| Exam Pattern & Marking Scheme | Each tier's sections: questions, marks, duration, negative marking and scribe time. | Topic lists (Detailed Syllabus & Topic Weightage) and the selection narrative (Selection Process & Recruitment Stages). |
| Detailed Syllabus & Topic Weightage | The topic-level syllabus per subject with weightage; it points to the exam's syllabus page for the full official list. | Marks and questions per section (Exam Pattern & Marking Scheme), the one-page syllabus shape (Syllabus Overview & Subject Breakdown), study methods (Preparation guides). |
| Syllabus Overview & Subject Breakdown | The shape of the syllabus on one page: subjects per tier and how they relate. | Topic lists and weightage (Detailed Syllabus & Topic Weightage). |
| Posts, Ministries & Cadre Profiles | The posts recruited, their departments or ministries and their cadre group. | Pay figures (Salary Structure, Pay Levels & In-Hand Pay), daily duties and promotions (Job Profiles & Career Progression), choosing preferences (Post Preference, Pay Levels & Career Perks). |
| Salary Structure, Pay Levels & In-Hand Pay | Pay level, basic pay, allowances, deductions and in-hand pay per post. | Which post to prefer (Post Preference, Pay Levels & Career Perks) and job duties (Job Profiles & Career Progression). |
| Post Preference, Pay Levels & Career Perks | How to order post preferences: desk or field, location and growth trade-offs. | The pay tables (Salary Structure, Pay Levels & In-Hand Pay) — refer to them — and the post catalogue (Posts, Ministries & Cadre Profiles). |
| Job Profiles & Career Progression | Day-to-day duties, the hierarchy, departmental exams and the promotion ladder. | Pay (Salary Structure, Pay Levels & In-Hand Pay) and the post catalogue (Posts, Ministries & Cadre Profiles). |
| Vacancy Breakdown & Reservation Matrix | This cycle's vacancy numbers by post and category. | Age relaxation rules (Age Limits & Relaxation Rules) and cut-offs (Cutoff guides). |
| Cutoff Trends & Qualifying Benchmarks | The latest cut-off marks by category and post and the qualifying thresholds. | Multi-year trend analysis (Historical Cutoff Trends & Analysis). |
| Historical Cutoff Trends & Analysis | How cut-offs moved over past cycles and what that means for a target score. | The latest cut-off table (Cutoff Trends & Qualifying Benchmarks). |
| Admit Card & Exam Day Protocol | Downloading the admit card and exam-day documents, rules and prohibited items. | The dates (Important Dates & Cycle Timeline). |
| Result Declaration & Merit Ranking | How results are declared: normalization, marks release and post allocation. | Cut-off tables (Cutoff guides). |
| Preparation Strategy & Study Protocol | The overall study plan: schedule, time split, mock routine and revision. | Subject-by-subject methods (Subject-Wise Preparation & Study Protocol) and topic lists (Detailed Syllabus & Topic Weightage). |
| Subject-Wise Preparation & Study Protocol | Subject-by-subject preparation methods and in-exam test strategy. | The overall timetable (Preparation Strategy & Study Protocol) and topic lists (Detailed Syllabus & Topic Weightage). |
| Frequently Asked Questions (Candidate Queries) | Short answers to common questions, each linking to the guide that covers it in full. | Full explanations that another guide already gives — answer briefly and link. |
| Official Notifications & Gazette Archives | The list of official notices, corrigenda and calendar updates, with links. | Summaries of their content that belong to another guide. |
## What follows the scopes

- **Authoring prompt** (`ExamKnowledgePromptBuilder`, contract **CL-EXAM-AUTHOR-v1.1**): a `<MODULE_SCOPE>` block —
  this guide's covers + must-not-repeat, and one line per sibling guide with what it owns; the author adds one sentence
  naming the other guide instead of repeating it. The prompt is built in code, so the new version is live when the code
  is deployed (no DB template to activate; deploy-before-activate holds trivially). The admin studio shows / sends the
  shared constant (no literal left).
- **Validator, Gate 5**: a section heading that uses a topic another guide owns (its scope keywords) gives a **warning**
  naming the owning guide — never a block, so nothing existing is rejected. The overview, FAQ and notice guides are
  exempt (they summarise and link by design).
- **Gate** `scripts/test_guide_scope1.cjs` (offline list; `--self-test` 5 negative controls).

## SSC CGL guides whose text overlaps another guide (for the owner to edit — nothing changed)

Read-only analysis of the 24 published English guides (rolled-back read-only transaction).

**A. Section headings about a topic another guide owns** (the new Gate 5 warnings):

| Guide | Section | Belongs to |
|---|---|---|
| Eligibility Criteria (Age, Education & Category) | "Age Limits (as on 01-08-2026)" | Age Limits & Relaxation Rules |
| Eligibility Criteria (Age, Education & Category) | "Age Relaxation by Category" | Age Limits & Relaxation Rules |
| Eligibility Criteria (Age, Education & Category) | "Educational Qualification" | Educational & Technical Qualifications |
| Syllabus Overview & Subject Breakdown | "Subject-Wise Curriculum Summary" | Subject-Wise Preparation & Study Protocol (keyword "subject-wise"; may be a false positive — the heading is about syllabus, not preparation) |
| Preparation Strategy & Study Protocol | "Subject-Wise Time Allocation — Full-Time Aspirants" | Subject-Wise Preparation & Study Protocol |
| Preparation Strategy & Study Protocol | "Subject-Wise Time Allocation — Working Professionals" | Subject-Wise Preparation & Study Protocol |
| Cutoff Trends & Qualifying Benchmarks | "SSC CGL 2026 Cutoff Trends & Qualifying Benchmarks: Overview" | Historical Cutoff Trends & Analysis (the guide's own title contains "trends") |
| Cutoff Trends & Qualifying Benchmarks | "Normalization and Its Impact on Cutoff Interpretation" | Result Declaration & Merit Ranking |
| Vacancy Breakdown & Reservation Matrix | "How to Track Vacancy Updates and Corrigenda" | Official Notifications & Gazette Archives |
| Post Preference, Pay Levels & Career Perks | "Perks, Allowances, and Post-Specific Benefits" | Salary Structure, Pay Levels & In-Hand Pay |

**B. Repeated text between guides** (shared 8-word passages; % of the smaller guide). About 34 shared passages appear
between almost every pair — a boilerplate block repeated in every guide (most likely the shared disclaimer), not
overlap. Pairs clearly above that:

| Share | Passages | Guides |
|---|---|---|
| 10 % | 136 | Age Limits & Relaxation Rules ↔ FAQ |
| 8 % | 165 | Selection Process & Recruitment Stages ↔ Exam Pattern & Marking Scheme |
| 8 % | 134 | Educational & Technical Qualifications ↔ FAQ |
| 6 % | 149 | Historical Cutoff Trends & Analysis ↔ Cutoff Trends & Qualifying Benchmarks |
| 6 % | 138 | Selection Process & Recruitment Stages ↔ FAQ |
| 5 % | 124 | Salary Structure, Pay Levels & In-Hand Pay ↔ Post Preference, Pay Levels & Career Perks |
| 5 % | 119 | Detailed Syllabus & Topic Weightage ↔ Syllabus Overview & Subject Breakdown |
| 5 % | 112 | Application Process & Fee Structure ↔ FAQ |
| 5 % | 111 | Selection Process & Recruitment Stages ↔ Result Declaration & Merit Ranking |
| 4 % | 96 | Exam Pattern & Marking Scheme ↔ FAQ |
| 3 % | 76 | Posts, Ministries & Cadre Profiles ↔ Post Preference, Pay Levels & Career Perks |
| 3 % | 74 | Detailed Syllabus & Topic Weightage ↔ Preparation Strategy & Study Protocol |
| 3 % | 71 | Job Profiles & Career Progression ↔ Post Preference, Pay Levels & Career Perks |
| 3 % | 71 | FAQ ↔ Result Declaration & Merit Ranking |
| 2 % | 70 | Subject-Wise Preparation & Study Protocol ↔ Preparation Strategy & Study Protocol |

The FAQ repeats most: under its scope its answers should be short and link to the full guide.
