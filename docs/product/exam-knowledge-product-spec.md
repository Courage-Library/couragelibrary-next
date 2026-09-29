# Exam Knowledge Product Specification
**Detailed Product Specification for Exam Knowledge Authoring, Verification, Versioning & Delivery**

---

## 1. Product Goals & Core Requirements

1. **Eliminate Information Ambiguity**: Provide prospective candidates with 100% official-source-verified intelligence for 24 distinct examination dimensions.
2. **Research-First Authoring Pipeline**: Empower administrators to generate comprehensive LLM prompts enforcing the `RESEARCH → VERIFY → RESOLVE → AUTHOR → STRUCTURE → SELF-CHECK` workflow with zero paid API lock-in.
3. **Automated Safety & Quality Control**: Quarantine external AI output as `AI_GENERATED` drafts until passing 5 automated validation gates and human academic review.
4. **Permanent Historical Truth & Reproducibility**: Store every version as an immutable snapshot. Track superseded versions, review feedback, and cryptographic checksums without database mutations.
5. **Seamless Candidate Experience**: Present verified content via a responsive, distraction-free reader with callouts, tables, FAQs, and source citations.

---

## 2. Core Functional Workflows

### 2.1 Prompt Generation Workflow (`/admin/exams/knowledge`)
- Admin selects Exam, Cycle (or Timeless), and Module.
- System validates applicability via `ExamModuleRegistry.evaluateApplicability()`.
- System aggregates database facts, curriculum bounds, existing sources, and claims into `AuthoritativeExamContext` bounded to $\le 32,000$ characters.
- System computes deterministic SHA-256 `contextHash`.
- System renders copyable prompt adhering to `CL-EXAM-AUTHOR-v1.0` contract version.

### 2.2 Ingestion & 5-Gate Validation Workflow
- Admin pastes external AI JSON output into the Import Modal.
- System strips markdown code fences and UTF-8 BOM.
- System computes `source_spec_hash` for deduplication.
- System executes 5 validation gates:
  - **Gate 1**: Schema syntax, mandatory fields, canonical section types (`SUMMARY`, `DETAILED_GUIDE`, `IMPORTANT_INSTRUCTIONS`, `FAQS`).
  - **Gate 2**: Target matching and stale context hash verification.
  - **Gate 3**: Static AST security scanning via `MdxSecurityScanner`.
  - **Gate 4**: Provenance URL validation and claim conflict detection.
  - **Gate 5**: Domain allowlist validation (Question Bank IDs, Subject names, Post names).
- If validation succeeds, system inserts `AI_GENERATED` version (`is_published = false`).

### 2.3 Review & Revision Lifecycle Workflow
- Staff inspects document in Review Workbench sub-tabs:
  - **Document Content**: Edit draft payload, add/remove sections, edit callouts, FAQs, sources.
  - **5-Gate Validation**: Real-time validation status badges.
  - **Candidate Preview**: Live rendering via `ExamMdxArticleRenderer`.
  - **Academic Checklist**: Human verification checkboxes (Accuracy, Completeness, Sources).
  - **Version History**: Timeline of version snapshots with `[Inspect]`, `[Compare]`, `[Edit Draft]`.
  - **Diff Workbench**: Structural semantic diffing between Base (A) and Target (B).
- **Actions**:
  - `Save Draft`: Updates payload in-place for `DRAFT` versions.
  - `Submit for Review`: Transitions `DRAFT \rightarrow IN_REVIEW`.
  - `Request Changes`: Transitions `IN_REVIEW \rightarrow DRAFT` on the **same version**, storing reviewer feedback.
  - `Approve`: Transitions `IN_REVIEW \rightarrow APPROVED`.
  - `Compile`: Generates compiled MDX artifact with SHA-256 hash.
  - `Publish`: Atomically updates `exam_knowledge_documents.current_published_version_id`.
