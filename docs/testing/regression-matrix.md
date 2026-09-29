# Courage Library — Regression Assertion Matrix & Test Catalog

## 1. Test Suite Catalog & Assertion Metrics

As of the current production baseline, Courage Library maintains comprehensive runtime test suites written in CommonJS (`.cjs`) that verify every tier of the platform deterministically:

```
+-----------------------------------------------------------------------------------+
| Test Suite / Script Name                              | Domain Covered            |
+-----------------------------------------------------------------------------------+
| scripts/test_phase3h1_exam_knowledge_schema.cjs       | 5 Validation Gates & DB   |
| scripts/test_phase3h2_exam_prompt_generator.cjs       | AI Prompt Contracts & AST |
| scripts/test_phase3h3_exam_knowledge_importer.cjs     | External AI Ingestion     |
| scripts/test_phase3h4_exam_knowledge_studio.cjs       | Studio & Review Workflow  |
| scripts/test_phase3h5_3_candidate_hub_certification.cjs| Candidate Hub Parity      |
| scripts/test_phase3k16_citation_sanitization.cjs      | AI Citation Sanitization  |
| scripts/test_phase3j_exam_onboarding.cjs              | Exam Onboarding Engine    |
| scripts/test_phase3k_ai_onboarding.cjs                | AI Onboarding Flow        |
| scripts/verify_phase3j1_production_boundaries.cjs     | Database Baseline Safety  |
| scripts/test_phase4_mistake_intelligence.cjs          | Mistake Intelligence      |
| scripts/test_phase6_task5_final_completion.cjs        | Longitudinal Mastery      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Test Suite Deep-Dive Specifications

### 2.1 Exam Knowledge Schema & Validator (`test_phase3h1_exam_knowledge_schema.cjs`)
- **Key Checks**:
  - Validates all 24 `ExamModuleType` definitions.
  - Enforces Gate 1: Metadata presence (title, reading time, difficulty, summary).
  - Enforces Gate 2: Structural markdown AST validation (heading hierarchy, min word counts).
  - Enforces Gate 3: Minimum source citations ($\ge 2$ valid external HTTP/HTTPS citations).
  - Enforces Gate 4: Minimum atomic claims ($\ge 3$ atomic claims mapped to citations).
  - Enforces Gate 5: Security scanner (rejection of `<script>`, javascript URI, dangerous attributes).

### 2.2 AI Prompt Generator Forensic Contract (`test_phase3h2_exam_prompt_generator.cjs`)
- **Key Checks**:
  - Verifies presence of all 12 Research Pillars in generated output.
  - Validates 16-section structure format.
  - Enforces non-negotiable generic salary directives (no hard-coded 7th CPC / regional pay scales).
  - Verifies 14-point pre-output self-check injection.
  - Confirms JSON contract version identifier `CL-EXAM-AUTHOR-v1.0`.

### 2.3 Production Boundary & Baseline Safety (`verify_phase3j1_production_boundaries.cjs`)
- **Key Checks**:
  - Validates that canonical subject, topic, subtopic, learning unit, question bank, and mock attempt baselines are $100\%$ untouched.
  - Verifies multi-source claim support and relational junction tables.
  - Confirms candidate portal zero-drift read model.

### 2.4 External AI Citation Sanitization & Security (`test_phase3k16_citation_sanitization.cjs`)
- **Key Checks**:
  - 16 runtime assertions covering multi-provider regex normalizers (`oaicite`, `【N†source】`, `[cite:N]`, `[source:N]`).
  - Object tree recursive sanitization (headers, bodies, tables, FAQs, sources).
  - Gate 3 security blocking of un-sanitized raw citation tokens.
  - AST MDX compiler defense-in-depth sanitization.
  - Candidate renderer runtime sanitization.
  - Immutable revision publishing and zero database migration safety.

---

## 3. How to Run the Test Suites

Execute all test harnesses locally using Node:

```powershell
# Run Exam Knowledge schema, prompt generator, and citation sanitization verification
node scripts/test_phase3h1_exam_knowledge_schema.cjs
node scripts/test_phase3h2_exam_prompt_generator.cjs
node scripts/test_phase3k16_citation_sanitization.cjs
node scripts/verify_phase3j1_production_boundaries.cjs
node scripts/test_phase3h4_exam_knowledge_studio.cjs
node scripts/test_phase3h5_3_candidate_hub_certification.cjs

# Run Next.js production build verification
npm run build
```

Expected output for all suites:
```text
All assertions passed successfully! (Exit Code 0)
```
