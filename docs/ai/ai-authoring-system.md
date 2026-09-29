# AI Authoring System Specification
**End-to-End AI Authoring System, Contract Versions & Copy-Paste Workflow Architecture**

---

## 1. System Philosophy & Contract Versions

Courage Library enforces formal prompt contracts to guarantee deterministic generation, prompt injection isolation, and cross-model portability:

| Contract Version | Subsystem / Domain | Target Output Spec | Status & Purpose |
| :--- | :--- | :--- | :--- |
| **`CL-EXAM-AUTHOR-v1.0`** | Exam Knowledge Engine (24 Modules) | `ExamKnowledgeDocumentSpec v1.0.0` | **Active & Authoritative**: 24-module detailed information authoring, official citations, atomic claims. |
| **`CL-EXAM-ONBOARDING-v1.0`** | Exam Onboarding Control Plane | `ExamOnboardingImportSpec v1.0.0` | **Active & Authoritative**: Control-plane registration (authority, exam identity, cycle milestones, stages, syllabus section mapping). Zero duplicate CMS. |
| **`CL-CURRICULUM-AUTHOR-v1.0`** | Canonical Curriculum & Content Studio | `LearningDocumentSpec v1.0.0` | **Active & Authoritative**: Canonical learning lessons, theory units, worked examples, formula sheets. |

---

## 2. The Context Builder Architecture

The Context Builder (`services/exam-knowledge/exam-knowledge-context-builder.service.ts`) aggregates database state into a deterministic, bounded structure:
- **Maximum Context Characters**: 32,000 characters (preventing token overflow).
- **Deterministic Key Sorting**: Objects and arrays are sorted recursively before hashing.
- **SHA-256 Context Hash (`contextHash`)**: Computed over target parameters, curriculum topics, verified sources, and claims.
- **Injection Sanitization**: HTML/XML control delimiters (`<`, `>`) are escaped into `&lt;`, `&gt;`.

---

## 3. Trust Model & Canonical Authoring Pipeline

External AI models (ChatGPT, Claude, Gemini, Perplexity) act strictly as **research and authoring assistants**; their outputs are treated as **untrusted candidate input** and never possess automatic publication authority.

```
External AI (Research & JSON Authoring)
    ↓
1. JSON Import & Code-Fence Extraction (`ExamKnowledgeImporterService`)
    ↓
2. Citation Artifact Normalization (`ai-citation-sanitizer.ts`)
   - Normalizes provider footnote syntax from all structured string fields
    ↓
3. Schema & Structural Verification (Gate 1 & Gate 2)
    ↓
4. Gate 3 Security & Sanitization Enforcement (Gate 3)
   - Fails if any unresolved external AI citation tokens remain
    ↓
5. Source & Provenance Verification (Gate 4 & Gate 5)
    ↓
6. Human Academic Review & Fact-Checking (Review Workbench)
    ↓
7. AST MDX Compilation (`AdminExamKnowledgeService.compileExamDocVersion`)
    ↓
8. Compilation Safety Check (Verifies zero artifacts in compiled MDX)
    ↓
9. Atomic Pointer Publication (Immutable Snapshot Release)
    ↓
10. Candidate Delivery (`ExamKnowledgeCandidateService` & `ExamMdxArticleRenderer`)
```

---

## 4. External-AI Citation Artifact Normalization

External AI engines with web-browsing capabilities frequently emit provider-internal footnote directives in their markdown prose. Courage Library normalizes these artifacts during ingestion while preserving all verified source records in `officialSources` and `exam_sources`.

### Supported Artifact Families:
- **OpenAI / ChatGPT Directives**: `:contentReference[oaicite:N]{index=N}`, `[oaicite:N]{index=N}`, `[oaicite:N]`, `:contentReference[...]`
- **Search Footnote Tokens**: `【N†source】`, `【N:M†source】`, `【N†...】`
- **Assistant / Raw Citation Markers**: `[cite: N]`, `[citation: N]`, `:citationReference[...]`, `:sourceReference[...]`

> [!NOTE]
> **Operational Rule on Provider Syntax**: The system currently normalizes and rejects identified external-AI/provider-specific citation artifact patterns. New provider-specific syntax should be added to `services/ai/ai-citation-sanitizer.ts` and the regression suite (`scripts/test_phase3k16_citation_sanitization.cjs`) whenever encountered.

