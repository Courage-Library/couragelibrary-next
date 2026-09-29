# Exam Knowledge Authoring & AI Ingestion Runbook

## 1. Overview & Preparation

This runbook instructs Content Authors, Subject Matter Experts (SMEs), and Academic Staff on how to author and publish authoritative knowledge modules using the **Research-First External AI Workflow** and the **Exam Knowledge Studio**.

### Prerequisites
- Access to Staff Workbench (`/staff/exam-knowledge`).
- Active account on an advanced external AI provider (ChatGPT Plus/Pro, Claude 3.5 Sonnet/Opus, Google Gemini Advanced/1.5 Pro, or Perplexity Pro).
- Official recruitment notification or gazette PDF from the conducting authority (e.g., `SSC_CGL_2026_Notice.pdf`).

---

## 2. Standard 6-Step Authoring Workflow

```
[ Step 1: Select Exam & Target Module ]
                   ↓
[ Step 2: Generate & Copy Master Prompt ]
                   ↓
[ Step 3: Run Research in External AI ]
                   ↓
[ Step 4: Import JSON & Run 5-Gate Validation ]
                   ↓
[ Step 5: Academic Fact-Checking & Review ]
                   ↓
[ Step 6: AST Compilation & Publication ]
```

---

## 3. Detailed Step-by-Step Instructions

### Step 1: Select Exam & Target Module
1. Navigate to `/staff/exam-knowledge`.
2. Choose your target exam from the dropdown (e.g., `SSC CGL 2026`).
3. Select the target module from the 24 available types (e.g., `POST_PREFERENCE` or `SALARY`).
4. Click **"New Version"** or select existing `DRAFT`.

### Step 2: Generate & Copy Master Prompt
1. In the Studio workbench, click the **"AI Prompt Generator"** tab.
2. The system dynamically builds the Master Prompt incorporating:
   - Canonical exam identity and cycle metadata.
   - 12 Research & Verification Pillars.
   - Module-specific depth directives.
   - Relational Claim-to-Source schema format (`CL-EXAM-AUTHOR-v1.0`).
   - 14-Point Pre-Output Self-Check rules.
3. Click the **"Copy Prompt"** button.

### Step 3: Execute Research in External AI
1. Open your chosen external AI tool (e.g., Claude 3.5 Sonnet / ChatGPT-4o).
2. Paste the prompt.
3. If you have the official PDF notification, upload it directly alongside the prompt.
4. Prompt the AI: `"Execute thorough research following the 12 pillars and output only the valid CL-EXAM-AUTHOR-v1.0 JSON."`
5. Verify the AI performed:
   - Official source cross-referencing.
   - Disputed point resolutions.
   - Atomic claims structuring with quotation citations.
6. Copy the entire raw JSON code block from the AI's response.

### Step 4: Import JSON & Run 5-Gate Validation
1. Return to Courage Knowledge Studio.
2. Click **"Import AI Output (JSON)"**.
3. Paste the JSON into the modal and click **"Validate & Populate"**.
4. The system automatically runs the 5-Gate Validator:
   - *Gate 1*: Metadata completeness.
   - *Gate 2*: Markdown syntax & heading hierarchy.
   - *Gate 3*: Source citations valid and reachable ($\ge 2$).
   - *Gate 4*: Claims mapped to citations ($\ge 3$).
   - *Gate 5*: Security scanner (XSS / dangerous attributes check).
5. If errors occur, the UI displays clear diagnostic badges. Correct the JSON or markdown and re-run.

### Step 5: Academic Fact-Checking & Review
1. Review the generated Markdown in the side-by-side live preview.
2. Ensure factual accuracy:
   - Check dates, age limits, pay scale figures, and qualification criteria.
   - Inspect the **Sources & Citations** table.
   - Click each citation link to confirm validity.
3. Click **"Submit for Review"** (`status` transitions to `IN_REVIEW`).

### Step 6: Reviewer Sign-Off & Publication
1. An Academic Reviewer opens the document in `/staff/exam-knowledge/review`.
2. Inspects diffs, verifies claims, and clicks **"Approve Version"**.
3. System triggers AST compilation into `compiled_ast`.
4. Click **"Publish Version"**.
5. The snapshot is atomically published and live on the Candidate Hub!
