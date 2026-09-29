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
