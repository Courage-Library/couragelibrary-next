# Exam Onboarding Operational Runbook

## 1. Overview & Objectives

This runbook guides Platform Administrators and Academic Leads through the standardized, step-by-step process of onboarding a new competitive examination (e.g., UPSC CSE, RRB NTPC, IBPS PO, GATE, CAT) onto Courage Library.

### Key Invariant
**Exams & Onboarding is the Control Plane** (canonical registry, conducting authority, cycle, sections, tier configuration, and 14-dimension readiness evaluator). **Exam Knowledge is the Content Engine** (24 modules, research prompts, validation gates, AST compiler). Onboarding an exam creates the canonical control entity first, which then provisions the 24 empty knowledge document slots.

---

## 2. Step-by-Step Onboarding Workflow

```
[ Step 1: Register Conducting Authority ]
                   ↓
[ Step 2: Create Canonical Exam Record ]
                   ↓
[ Step 3: Configure Exam Cycle & Tiers ]
                   ↓
[ Step 4: Define Exam Sections & Syllabus Structure ]
                   ↓
[ Step 5: Provision 24 Exam Knowledge Document Slots ]
                   ↓
[ Step 6: Execute 14-Dimension Readiness Audit ]
                   ↓
[ Step 7: Launch Candidate Hub ]
```

---

## 3. Operational Execution Guide

### Step 1: Register Conducting Authority
1. Navigate to `/admin/authorities`.
2. Click **"New Authority"**.
3. Enter details:
   - **Name**: e.g., `Staff Selection Commission`
   - **Code**: e.g., `SSC`
   - **Official Website URL**: e.g., `https://ssc.gov.in`
   - **Jurisdiction**: e.g., `National / Central Government`
4. Click **Save Authority**.

### Step 2: Create Canonical Exam Record
1. Navigate to `/admin/exams/new`.
2. Enter Core Metadata:
   - **Exam Name**: e.g., `Combined Graduate Level Examination`
   - **Short Code / Acronym**: e.g., `SSC CGL`
   - **URL Slug**: e.g., `ssc-cgl` (Used for Candidate Hub `/exams/ssc-cgl`)
   - **Domain / Category**: e.g., `GOVERNMENT_RECRUITMENT`
   - **Conducting Authority**: Select from registered authorities.
3. Save the canonical record.

### Step 3: Configure Exam Cycle & Tiers
1. In the Exam Admin console, navigate to the **Cycles** tab.
2. Click **"Add Exam Cycle"**:
   - **Cycle Name / Year**: `2026`
   - **Notification Date**: e.g., `2026-06-11`
   - **Application Deadline**: e.g., `2026-07-10`
   - **Tier 1 Exam Window**: e.g., `September 2026`
   - **Tier 2 Exam Window**: e.g., `December 2026`
3. In the **Tiers** tab, configure the stages:
   - `Tier-1`: Computer Based Examination (Qualifying / Screening).
   - `Tier-2`: Computer Based Examination (Merit Determination).

### Step 4: Define Exam Sections
1. In the **Sections** tab, map out the exam's structural sections:
   - `Section 1`: General Intelligence & Reasoning
   - `Section 2`: General Awareness
   - `Section 3`: Quantitative Aptitude
   - `Section 4`: English Comprehension
2. Map each section to its target syllabus nodes in the canonical academic taxonomy (reusing existing subject taxonomy without duplicating content).

### Step 5: Provision Knowledge Document Slots
1. Navigate to **Exam Knowledge Studio** (`/staff/exam-knowledge`).
2. Select the newly created exam (`SSC CGL`).
3. Click **"Initialize 24 Knowledge Modules"**.
4. The system automatically provisions empty parent records in `exam_knowledge_documents` for each of the 24 standard module types (`EXAM_OVERVIEW`, `ELIGIBILITY`, `EXAM_PATTERN`, `SYLLABUS`, `SALARY`, etc.).

### Step 6: 14-Dimension Readiness Audit
1. Navigate to `/admin/exams/[slug]/readiness`.
2. Run the automated **14-Dimension Readiness Evaluator**:
   - Evaluates whether minimum modules (`EXAM_OVERVIEW`, `ELIGIBILITY`, `SYLLABUS`, `PATTERN`) are published.
   - Evaluates whether exam dates, tier configurations, and section maps are valid.
3. Review the generated Readiness Score ($0-100\%$).
4. The exam portal cannot be toggled to `PUBLIC` until the readiness score reaches at least $85\%$.

### Step 7: Launch Candidate Hub
1. Once readiness certification passes, click **"Publish Exam to Candidate Hub"**.
2. The exam is now live at `/exams/[slug]` with interactive overview, syllabus browser, module tabs, and mock test access.
