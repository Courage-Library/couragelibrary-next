# Revision, Corrigenda & Version History Runbook

## 1. Overview & Operational Scenarios

Competitive examination notifications frequently issue corrigenda, date extensions, vacancy revisions, or pattern clarifications.

This runbook specifies how Academic Staff and Reviewers handle revisions, publish updates, manage corrigenda notices, inspect diffs, and preserve historical audit trails without breaking existing candidate sessions.

---

## 2. Common Revision Scenarios

| Scenario | Severity / Scope | Recommended Procedure |
| :--- | :--- | :--- |
| **Typo or Grammatical Fix** | Minor | Fork current version $\rightarrow$ apply edit $\rightarrow$ fast-track review $\rightarrow$ publish v(N+1). |
| **Corrigendum / Date Extension** | Major / Critical | Fork $\rightarrow$ add Corrigendum callout and citation $\rightarrow$ update claims $\rightarrow$ Diff inspection $\rightarrow$ publish v(N+1). |
| **Vacancy / Salary Revision** | Major | Update tabular data $\rightarrow$ update claims and sources $\rightarrow$ Diff inspection $\rightarrow$ publish v(N+1). |
| **Major Syllabus / Pattern Overhaul** | Structural | Complete re-research via AI Master Prompt $\rightarrow$ full 5-gate validation $\rightarrow$ comprehensive review $\rightarrow$ publish v(N+1). |

---

## 3. Step-by-Step Revision Workflow

```
[ Step 1: Open Target Published Document in Studio ]
                         ↓
[ Step 2: Click "Fork New Draft Revision" ]
                         ↓
[ Step 3: Apply Modifications / Corrigendum Citations ]
                         ↓
[ Step 4: Open Diff Workbench & Inspect Changes ]
                         ↓
[ Step 5: Submit for Academic Review ]
                         ↓
[ Step 6: Reviewer Approval & Atomic Pointer Switch ]
```

---

## 4. Operational Procedures

### Step 1: Forking a New Version
1. In `/staff/exam-knowledge`, select the Exam and Module.
2. Locate the active `PUBLISHED` version (e.g., `v1`).
3. Click the **"Fork New Revision"** button.
4. The system creates a new draft version `v2` in `DRAFT` status with a complete copy of `v1`'s markdown, claims, and sources.

### Step 2: Editing & Corrigendum Addition
1. Open the Markdown Editor for `v2`.
2. If this revision is caused by an official corrigendum:
   - Add a top-level `<Callout type="warning">` detailing the Corrigendum number and date.
   - Update affected dates, eligibility clauses, or vacancy counts.
   - In the **Sources** tab, add the new Corrigendum PDF link and publication date.
   - In the **Claims** tab, update the affected claims and link them to the new corrigendum source.

### Step 3: Diff Workbench Inspection
1. Switch to the **Diff Workbench** tab.
2. Select **Base Version** (`v1`) and **Comparison Version** (`v2`).
3. Inspect the side-by-side and unified diff outputs:
   - **Word Diff**: Review red deletions and green additions.
   - **Claim Diff**: Confirm no ungrounded claims were accidentally introduced.
   - **Source Diff**: Confirm new sources are properly cited.
4. Enter a concise **Revision Summary** (e.g., `"Updated application deadline to July 24 following SSC Corrigendum No. 1/2026."`).

### Step 4: Academic Review & Feedback Handling
1. Click **"Submit for Review"** (`v2` transitions to `IN_REVIEW`).
2. An Academic Reviewer opens the review portal:
   - **If changes requested**: Reviewer types feedback in the Review Notes panel and clicks **"Request Changes"**. `v2` returns to `DRAFT` status. Author addresses feedback and resubmits.
   - **If approved**: Reviewer clicks **"Approve & Compile"**.

### Step 5: Publication & Parity Confirmation
1. Click **"Publish v2"**.
2. The system executes the atomic pointer swap:
   - `v2` becomes `PUBLISHED`.
   - `v1` transitions to `SUPERSEDED`.
   - `exam_knowledge_documents.current_version_id` points to `v2`.
3. Open Candidate Portal at `/exams/[slug]/[module]` to verify candidate view renders the updated content with zero formatting issues.
