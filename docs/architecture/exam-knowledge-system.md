# Exam Knowledge System Architecture Specification
**Authoritative Architectural Blueprint for the Exam Knowledge Studio & Publication Pipeline**

---

## 1. Executive Summary & Purpose

The **Exam Knowledge System** is Courage Library's centralized, authoritative authoring, verification, compilation, versioning, and candidate delivery engine for all examination intelligence.

It equips administrators and academic reviewers with a structured, research-first AI authoring pipeline that transforms external AI from a superficial text generator into a disciplined research agent, protected by automated security gates, AST-based compilation, immutable snapshot versioning, structural semantic diffing, and candidate-parity rendering.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 EXAM KNOWLEDGE STUDIO SUBSYSTEM                                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                        │
│   1. CONTEXT BUILDER (Authoritative Context & SHA-256 Hashing)                                         │
│      Pulls Exam, Authority, Cycle, Posts, Patterns, Claims, Curriculum (Max 32K Chars)                │
│      ↓                                                                                                 │
│   2. PROMPT BUILDER (12-Pillar Research-First Master Prompt: CL-EXAM-AUTHOR-v1.0)                      │
│      Injects CONTEXT ≠ TRUTH, 4-Tier Sources, URL Rules, Anti-Placeholder, Self-Check (14 Pts)         │
│      ↓                                                                                                 │
│   3. EXTERNAL AI AUTHORING (Provider-Neutral: Claude, ChatGPT, Gemini, Perplexity)                     │
│      Researches primary gazettes/notices, resolves conflicts, generates JSON spec                      │
│      ↓                                                                                                 │
│   4. FIVE-GATE INGESTION VALIDATOR                                                                     │
│      Gate 1: Schema | Gate 2: Target | Gate 3: Security & Artifacts | Gate 4: Provenance | Gate 5: Domain│
│      ↓                                                                                                 │
│   5. REVIEW WORKBENCH & DIFF ENGINE                                                                    │
│      Human Academic Checklist, Request Changes loop, Semantic Diffing (Metadata, Sections, FAQs)       │
│      ↓                                                                                                 │
│   6. AST MDX COMPILER                                                                                  │
│      Compiles validated structured spec into clean, interactive MDX artifact with SHA-256 checksum     │
│      ↓                                                                                                 │
│   7. IMMUTABLE VERSION STORE & ATOMIC POINTER                                                          │
│      Stores version snapshot in exam_doc_versions; updates current_published_version_id atomically     │
│      ↓                                                                                                 │
│   8. CANDIDATE PARITY DELIVERY (ExamMdxArticleRenderer)                                                │
│      Delivers identical rendered artifact across Admin Preview and Public Candidate Hub               │
│                                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The 24 Canonical Knowledge Modules

All knowledge documents belong to one of 24 standardized canonical modules defined in `EXAM_MODULE_REGISTRY` (`services/exam-knowledge/exam-module-registry.ts`):

| # | Module Key | Display Name | Specificity | Sources Req. | Core Mission & Research Focus |
|---|---|---|---|---|---|
| **1** | `EXAM_OVERVIEW` | Exam Overview & Conducting Authority | Timeless | No | Statutory mandate, historical scope, participating cadres, entry points |
| **2** | `IMPORTANT_DATES` | Important Dates & Cycle Timeline | Cycle | **Yes** | Notification, application window, correction dates, exam schedules |
| **3** | `ELIGIBILITY` | Eligibility Criteria (Age, Education & Category) | Timeless | **Yes** | Nationality, degree standards, cutoff reference dates, relaxations |
| **4** | `AGE_LIMIT` | Age Limits & Relaxation Rules | Timeless | **Yes** | Post-wise age brackets, cutoff reference date, reserved formulas |
| **5** | `QUALIFICATION` | Educational & Technical Qualifications | Timeless | **Yes** | Required degrees, appearing candidate eligibility, professional licensing |
| **6** | `PHYSICAL_STANDARDS`| Physical Standards & Medical Requirements | Timeless | **Yes** | Uniformed cadres, height/chest/PET benchmarks, medical visual acuity |
| **7** | `APPLICATION_PROCESS`| Application Process & Fee Structure | Timeless | **Yes** | One-Time Registration (OTR), photo/signature specs, fee schedule |
| **8** | `SELECTION_PROCESS`| Selection Process & Recruitment Stages | Timeless | **Yes** | Sequential progression, qualifying vs merit stages, tie-breaking |
| **9** | `EXAM_PATTERN` | Exam Pattern & Marking Scheme | Timeless | **Yes** | CBT/OMR modes, question counts, marks, negative marking penalty |
| **10**| `SYLLABUS` | Detailed Syllabus & Topic Weightage | Timeless | No | Canonical subject/topic mapping, core concepts, computational split |
| **11**| `SYLLABUS_OVERVIEW`| Syllabus Overview & Subject Breakdown | Timeless | No | Executive curriculum synthesis, tier-wise weightage, core competencies |
| **12**| `POSTS` | Posts, Ministries & Cadre Profiles | Timeless | **Yes** | Participating ministries, Group A/B/C classifications, Gazetted status |
| **13**| `SALARY` | Salary Structure, Pay Levels & In-Hand Pay | Timeless | **Yes** | Governing pay framework, basic pay scale/level, allowances, net in-hand |
| **14**| `POST_PREFERENCE_SALARY`| Post Preference, Pay Levels & Perks | Timeless | **Yes** | Post trade-offs, desk vs field roles, home state posting probability |
| **15**| `CAREER` | Job Profiles & Career Progression | Timeless | No | Promotion ladders, departmental exams, gazetted ranks, deputations |
| **16**| `VACANCIES` | Vacancy Breakdown & Reservation Matrix | Cycle | **Yes** | Official vacancy notice, post/department counts, vertical/horizontal quotas |
| **17**| `CUTOFF` | Cutoff Trends & Qualifying Benchmarks | Timeless | **Yes** | Historical cutoffs, normalized vs raw scores, sectional thresholds |
| **18**| `CUTOFF_TRENDS` | Historical Cutoff Trends & Analysis | Timeless | **Yes** | Multi-year longitudinal trends, vacancy/applicant density correlations |
| **19**| `ADMIT_CARD` | Admit Card & Exam Day Protocol | Cycle | **Yes** | Release timeline, regional download portals, mandatory ID proofs |
| **20**| `RESULT` | Result Declaration & Merit Ranking | Cycle | **Yes** | Merit list PDFs, normalization formula, scorecard release, DV schedules |
| **21**| `PREPARATION` | Preparation Strategy & Study Protocol | Timeless | No | Foundation -> Practice -> Mock -> Revision phases, mistake analysis |
| **22**| `PREPARATION_STRATEGY`| Subject-Wise Preparation Protocol | Timeless | No | Subject-wise pedagogical masterplans, standard reference literature |
| **23**| `FAQ` | Frequently Asked Questions | Timeless | No | Real candidate doubts, policy-backed answers, certificate validity |
| **24**| `NOTIFICATIONS` | Official Notifications & Gazette Archives| Timeless | **Yes** | Chronological gazette repository, verified URLs, change summaries |

---

## 3. The 5-Gate Ingestion Validation Pipeline

Imported JSON payloads (`ExamKnowledgeDocumentSpec v1.0.0`) are treated as **untrusted candidate input** and must pass all 5 gates before ingestion:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FIVE-GATE INGESTION VALIDATOR (GATE 1 TO 5)                     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GATE 1: SCHEMA & STRUCTURE                                                             │
│ - Strict schema version "1.0.0" and required metadata fields                           │
│ - Canonical section types ONLY ("SUMMARY", "DETAILED_GUIDE", "IMPORTANT_INSTRUCTIONS",│
│   "FAQS"). Custom section types are rejected. Payload size ceiling <= 64 KB.           │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GATE 2: TARGET & STALE CONTEXT                                                         │
│ - Validates examSlug, cycleYear, moduleKey match expected targets                      │
│ - Stale Context Check: Expected contextHash vs server-computed contextHash             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GATE 3: SECURITY & CITATION ARTIFACT SANITIZATION                                      │
│ - Static AST analysis via MdxSecurityScanner (blocking script tags, javascript: URLs, │
│   raw HTML event handlers, iframe injections)                                          │
│ - External AI Citation Artifact Detection via detectAiCitationArtifacts() (blocking    │
│   oaicite, footnote references, and provider bracket tags from entering drafts)        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GATE 4: SOURCE & CLAIM PROVENANCE                                                      │
│ - Valid absolute HTTP/HTTPS URLs required for all sources/claims                       │
│ - Blocks placeholder strings (e.g. "SOURCE_REQUIRED", "TO_BE_ANNOUNCED" in URL fields) │
│ - Flags differences with verified database claims as CONFLICT_REQUIRES_REVIEW          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ GATE 5: DOMAIN & ACADEMIC INTEGRITY                                                    │
│ - Validates Question Bank IDs against allowlists                                       │
│ - Validates canonical subject titles for syllabus modules                              │
│ - Validates post names against registered exam_posts                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Immutable Revision Lifecycle & Review Loop

Every knowledge document progresses through a rigorous state machine governed by `AdminExamKnowledgeService`:

```
                 [DRAFT v1] (External AI Import / Manual)
                     │
                     ▼
                 [IN_REVIEW v1] (Submitted for Academic Review)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
 [REQUEST CHANGES]           [APPROVED v1]
         │                       │
         ▼                       ▼
    [DRAFT v1]              [COMPILED v1] (MDX Artifact Generated)
   (Same version               │
    persisted)                 ▼
                        [PUBLISHED v1] ◄── candidate read model serves v1
                               │
               ┌───────────────┴───────────────┐
               │ (Create Revision Draft v2)    │
               ▼                               ▼
          [DRAFT v2]                   [PUBLISHED v1] (Remains Live)
               │
               ▼
         [IN_REVIEW v2]
               │
         [APPROVED v2]
               │
         [COMPILED v2]
               │
               ▼
         [PUBLISHED v2] ◄── Pointer atomically transitions to v2
               │            v1 presentationStatus becomes SUPERSEDED
```

### Critical Lifecycle Invariants:
1. **Request Changes Invariant**: Returning a document for corrections (`REQUEST CHANGES`) transitions status `IN_REVIEW \rightarrow \text{DRAFT}` on the **exact same version number** (`v2 \rightarrow v2`). It does NOT spawn a new version number.
2. **Review Feedback Persistence**: Reviewer feedback notes are stored on the version record and displayed to the author in the Draft Editor.
3. **Candidate Isolation**: Candidates receive strictly `current_published_version_id`. While `v2` is in `DRAFT`, `IN_REVIEW`, `APPROVED`, or `COMPILED`, candidates continue receiving published `v1`.
4. **Compiled Artifact Safety**: If a compiled/approved version returns to `DRAFT`, its compiled MDX artifact is automatically purged (`compiled_mdx = null`), preventing stale artifact publication.
5. **Presentation-Derived `SUPERSEDED` State**: `SUPERSEDED` is never stored in the database status enum. It is computed dynamically in memory whenever `v.is_published = true` and `v.id !== document.current_published_version_id`.

---

## 5. Structural Semantic Diff Engine

The Diff Engine (`services/exam-knowledge/exam-knowledge-diff.service.ts`) provides pure in-memory structural comparison between any two version snapshots (`Base A` vs `Target B`):

- **Whitespace & CRLF Normalization**: Normalizes line endings (`\r\n \rightarrow \n`), trims whitespace, and sorts object keys before diff calculation, guaranteeing zero noise from formatting changes.
- **Self-Diff Invariance**: Diffing identical versions or cosmetically reordered payloads produces `totalChanges: 0` and `hasChanges: false`.
- **Multi-Domain Granularity**: Separates changes into distinct categories:
  - **Metadata Differences**: Title, description, verified date, keywords.
  - **Content Section Diffs**: Added, removed, modified, or reordered sections with side-by-side markdown comparison.
  - **FAQ Differences**: Added, removed, or revised question/answer pairs.
  - **Official Source Diffs**: Added, removed, or updated citations and URLs.
  - **Table Diffs**: Structural table header, row count, and cell modifications.

---

## 6. Candidate-Parity Rendering Engine

The platform eliminates visual discrepancies between editorial preview and candidate delivery:

- **Single Canonical Renderer**: Both the admin Review Workbench preview and the public candidate view (`/exams/[slug]/[moduleSlug]`) invoke `ExamMdxArticleRenderer` (`components/exams/exam-mdx-article-renderer.tsx`).
- **AST Parsing**: Safe markdown-to-AST parsing renders:
  - Responsive Typography (H2/H3 headers, styled paragraphs, bolding, blockquotes)
  - Color-coded Callout Banners (`INFO` blue, `WARNING` amber, `CRITICAL` rose)
  - GFM Tables with horizontal scroll containers and mobile padding
  - Interactive Accordion FAQ cards with expand/collapse states
  - Verified Official Source Cards with external link security (`rel="noopener noreferrer"`)
- **Theme & Mobile Parity**: Verified across light/dark themes and all 8 standard viewports (320px, 360px, 375px, 390px, 414px, 768px, 1024px, 1280px).
- **Runtime Citation Sanitization**: Built-in defense-in-depth normalization intercepts and strips any lingering provider citation artifacts prior to AST conversion.
