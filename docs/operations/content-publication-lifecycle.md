# Content Publication Lifecycle & Editorial Governance Runbook

## 1. Publication Lifecycle Overview

The Courage Library publication pipeline is an editorial and academic governance workflow designed to guarantee that every piece of information presented to candidates is officially grounded, rigorously verified, structurally sound, and securely compiled.

```
       [ 1. DRAFT ] (AI Prompt Generation & JSON Import or Manual Authoring)
            ↓
       [ 2. VALIDATION GATES ] (Automated 5-Gate Schema & Security Scanner)
            ↓
       [ 3. IN_REVIEW ] (Academic Reviewer Fact-Checking & Source Audit)
         ↙           ↘
[ REQUEST CHANGES ]  [ 4. APPROVED ] (Reviewer Sign-off)
         ↓                   ↓
  (Author Edits)      [ 5. COMPILED ] (AST Build & React Component Tree)
                             ↓
                      [ 6. PUBLISHED ] (Atomic Pointer Transition & Live Release)
                             ↓
                      [ 7. SUPERSEDED ] (Archived when next version publishes)
```

---

## 2. Detailed Lifecycle Stages

### Stage 1: Draft Creation (`DRAFT`)
- **Action**: An author or staff member creates a new document or forks a revision of an existing document in the Exam Knowledge Studio.
- **Methods**:
  - *Method A (AI-Assisted)*: Copy generated Master Prompt $\rightarrow$ Execute in Claude/ChatGPT $\rightarrow$ Paste research JSON into Import modal.
  - *Method B (Manual)*: Direct authoring in the markdown editor with live side-by-side preview.
- **State**: Visible only to staff; candidate portal remains untouched.

### Stage 2: Automated Validation Gates (`VALIDATING`)
- Before submission to review, the system runs the 5-Gate Validator:
  - **Gate 1**: Metadata Completeness (Title, summary, difficulty, reading time).
  - **Gate 2**: Markdown & Structural Integrity (Hierarchy, word counts, formatting).
  - **Gate 3**: Source Grounding ($\ge 2$ valid external citations).
  - **Gate 4**: Atomic Claims Grounding ($\ge 3$ atomic claims mapped to sources).
  - **Gate 5**: Security & Anti-Injection Scanner (XSS, script tags, dangerous schemes).

### Stage 3: Academic Review & Fact-Checking (`IN_REVIEW`)
- **Reviewer Responsibilities**:
  1. Open the **Diff Workbench** to inspect differences against the active published version.
  2. Click every official source link to verify it points to an authentic government/conducting authority publication.
  3. Cross-examine claims against official gazette text.
  4. Ensure tone is objective, professional, and free from promotional jargon.
- **Decisions**:
  - **Approve**: Move to Stage 4.
  - **Request Changes**: Enter structured feedback notes. The document reverts to `DRAFT` status and notifies the author.

### Stage 4: Review Sign-Off (`APPROVED`)
- Reviewer clicks **"Approve Version"**. The snapshot is locked against further edits.

### Stage 5: AST Compilation (`COMPILED`)
- The system compiles raw markdown into validated React AST JSON (`compiled_ast`), optimizing images, parsing math blocks (KaTeX), and preparing component tree caches.

### Stage 6: Atomic Publication (`PUBLISHED`)
- The reviewer or release lead clicks **"Publish Now"**.
- Database executes atomic transaction:
  - Current version status $\rightarrow$ `PUBLISHED`.
  - Prior published version $\rightarrow$ `SUPERSEDED`.
  - Parent document pointer (`current_version_id`) $\rightarrow$ new version ID.
- Content is instantly live in the candidate portal with zero cache lag.

### Stage 7: Supersession & Historical Record (`SUPERSEDED`)
- Superseded versions remain permanently accessible in the Version History workbench for staff audits, regulatory compliance, and candidate historical diffing.
