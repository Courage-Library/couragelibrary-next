# Unified Multi-Exam Onboarding System Architecture

## 1. Executive Summary & Purpose

Courage Library is an examination-agnostic platform supporting competitive examinations across central, state, banking, defence, and specialized public sectors.

The **Unified Multi-Exam Onboarding Studio** serves as the administrative **Control Plane** for defining, configuring, and publishing examinations. Rather than creating a separate monolithic content management system, the Onboarding Studio coordinates existing specialized engines (**Canonical Taxonomy**, **Exam Knowledge Studio**, **Post Profiles**, **Learning Taxonomy**, and **Mock Engine**) through a unified 6-step lifecycle governed by a server-authoritative **14-Dimension Readiness Evaluator**.

---

## 2. Core Architectural Philosophy

```
+-------------------------------------------------------------------------+
|                    UNIFIED EXAM ONBOARDING STUDIO                       |
|                             (CONTROL PLANE)                             |
+-------------------------------------------------------------------------+
       |              |              |              |              |
       v              v              v              v              v
+--------------+ +----------+ +-------------+ +------------+ +------------+
|  CANONICAL   | |   EXAM   | |    POST     | |  LEARNING  | |    MOCK    |
|   TAXONOMY   | |KNOWLEDGE | |  PROFILES   | |  TAXONOMY  | |   ENGINE   |
| (Global Subj)| |  STUDIO  | | (Cadre/Pay) | | (Mappable) | |(Templates) |
+--------------+ +----------+ +-------------+ +------------+ +------------+
```

### Architectural Guardrails:
1. **Control Plane, Not Content Duplicator**: The onboarding wizard establishes exam identity, links conducting authorities, defines recruitment cycles, projects canonical taxonomy, models posts/eligibility, monitors knowledge completeness, and gates publishing. It never duplicates question banks, syllabus definitions, or knowledge document authoring.
2. **Server-Authoritative Readiness Gate**: An examination cannot be published (`is_active = true`) if any **BLOCKING** readiness criteria fail. Client-side state is never trusted for publication decisions.
3. **Examination-Agnostic Post Modeling**: Posts, cadres, and pay structures are completely generic. Central 7th CPC levels, state grade pays, banking scale bands, and defence pay ranks are supported optionally via flexible metadata without hardcoded schema constraints.
4. **Dynamic Knowledge Matrix**: Knowledge modules are dynamically driven by `ExamModuleRegistry` (currently 24 canonical modules). The wizard renders and monitors all registered modules dynamically with deep links directly into the Exam Knowledge Studio.
5. **Exact Database Parity (Δ = 0)**: Onboarding operates entirely on existing relational tables (`exams`, `conducting_orgs`, `exam_cycles`, `exam_syllabi`, `exam_topics`, `post_profiles`, `exam_knowledge_documents`, `questions`, `mock_templates`) without schema modifications.

---

## 3. Structural Domain Model: Domain vs. Exam vs. Cycle

### 1. Government Domain (`exams.domain`)
- High-level categorization: `CENTRAL_GOVERNMENT`, `DEFENCE`, `BANKING`, `RAILWAYS`, `STATE_PSC`, `TEACHING`, etc.
- Groups examinations for discovery and candidate navigation.

### 2. Exam Identity (`exams`)
- The evergreen entity (e.g., *SSC CGL*, *IBPS PO*, *RRB NTPC*, *CDS*).
- Holds permanent metadata: `title`, `slug`, `domain`, `description`, `conducting_org_id`, `is_active`.
- Remains draft (`is_active = false`) during onboarding until passing the Readiness Gate.

### 3. Recruitment Cycle (`exam_cycles`)
- The temporal edition (e.g., *2026*, *2025*).
- Holds milestone dates: `notification_date`, `application_start_date`, `application_end_date`, `exam_window_start`, `exam_window_end`, and cycle `status` (`DRAFT`, `ANNOUNCED`, `APPLICATION_OPEN`, `EXAM_ONGOING`, `COMPLETED`, `ARCHIVED`).
- Bridges the exam to its specific syllabus version and knowledge base.

---

## 4. The 6-Step Guided Onboarding Workflow

The administrative onboarding wizard (`/admin/exams/onboarding`) guides staff through 6 linear steps with state persistence:

- **Step 1: Identity & Authority** — Exam title, domain, slug uniqueness, and conducting organization.
- **Step 2: Recruitment Cycles & Dates** — Cycle year, notification date, application dates, and exam window dates.
- **Step 3: Posts, Cadres & Eligibility** — Generic posts with optional pay levels, cadres, vacancies, and age rules.
- **Step 4: Canonical Syllabus Projection** — Subject and topic mappings from the global canonical taxonomy with weightage tiers.
- **Step 5: Dynamic Knowledge Matrix** — 24-module status matrix linked to Exam Knowledge Studio.
- **Step 6: Readiness & Publish Gate** — 14-dimension evaluation score, blocking check resolution, and atomic activation.

---

## 5. Server-Authoritative 14-Dimension Readiness Evaluator

The readiness engine (`services/exam-onboarding/exam-readiness.service.ts`) executes 14 dimension evaluations:
1. **IDENTITY** (Blocking)
2. **ORGANIZATION** (Blocking)
3. **CYCLE** (Blocking)
4. **DATES** (Blocking)
5. **POSTS** (Blocking)
6. **ELIGIBILITY** (Blocking)
7. **SYLLABUS** (Blocking)
8. **SOURCES** (Blocking)
9. **KNOWLEDGE** (Blocking)
10. **LEARNING** (Recommended)
11. **QUESTION_BANK** (Recommended)
12. **MOCKS** (Recommended)
13. **SEO** (Recommended)
14. **CANDIDATE_DELIVERY** (Blocking)

---

## 6. Security, Isolation & Production Invariants

- **RBAC Enforcement**: All server actions enforce `AdminService.checkIsAdminOrStaff()`.
- **Draft Isolation**: Unpublished exams remain invisible to candidate directories and views.
- **Cross-Exam Isolation**: Fixture or new exam data never leaks into live exams like SSC CGL.
- **Zero Schema Mutations**: Production tables preserved with zero delta (Δ = 0).
