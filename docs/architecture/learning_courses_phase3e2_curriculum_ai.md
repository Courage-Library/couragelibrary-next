# COURAGE LIBRARY — LEARNING / COURSES SYSTEM
# PHASE 3E.2: CURRICULUM-AWARE AI CONTEXT BUILDER & GOOGLE GEMINI PRODUCTION PROVIDER
**Document Type**: Authoritative Technical Architecture & Implementation Record  
**Operating Mode**: Implementation & Forensic Audit Complete  
**Status**: Authoritative Foundation (Phase 3E.2 Certified & Frozen)  

---

## 1. Executive Summary & Core Deliverables

Phase 3E.2 delivers the **Curriculum-Aware AI Context Builder** and the first **Production AI Provider (Google Gemini 1.5 Pro)** for Courage Library.

This system transforms canonical curriculum data from PostgreSQL into a tightly controlled, bounded, and deterministic generation context for large language models, targeting the strict `LessonDocumentSpec` format.

```
Academic Taxonomy (Subject → Topic → Subtopic)
        ↓
Learning Unit (learning_units)
        ↓
Exam Mapping & Required Depth (exam_unit_mappings / exam_topics)
        ↓
Topic Relationships (topic_relationships: PREREQUISITE, RELATED, etc.)
        ↓
Canonical Question Bank References (question_versions: questionVersionId)
        ↓
Approved Canonical Content References (document_versions: status='PUBLISHED')
        ↓
Admin Generation Directives (Sanitized & Bounded)
        ↓
Curriculum Context Builder (CurriculumContextBuilder → CurriculumAIContext)
        ↓
Prompt Engine (AIPromptBuilder: Delimited XML Data Boundary)
        ↓
Structured AI Provider (GeminiAIProvider / MockAIProvider via AIProvider Interface)
        ↓
Strict Structural Validation (ContentSpecValidator) & AST Threat Scan (MdxSecurityScanner)
        ↓
Candidate DRAFT Version (document_versions: review_status='AI_GENERATED', is_published=false)
        ↓
Human Admin Review (Phase 3D Content Studio) → Approval → Compilation → Publishing
```

---

## 2. Sacred Invariants & Non-Negotiable Boundaries

1. **AI is NEVER the curriculum authority**: AI never creates, modifies, or deletes subjects, topics, subtopics, or learning units.
2. **AI is NEVER the Question Bank authority**: AI cannot invent or insert questions into canonical Question Bank tables. It receives immutable `questionVersionId` references.
3. **AI is NEVER the asset storage authority**: Diagrams and images reference canonical `learning_assets`.
4. **AI NEVER publishes directly**: All AI-generated content is created with `review_status = 'AI_GENERATED'` and `is_published = false`. It requires explicit human admin review, approval, and controlled compilation.
5. **Anti-Contamination Rule**: AI-generated drafts are strictly excluded from authoritative curriculum context. Only human-approved, published versions may be used as references.

---

## 3. Curriculum Context Authority & Precedence

When assembling context for AI generation, data is pulled from authoritative sources in strict priority order:

1. **Canonical Academic Taxonomy** (`subjects`, `topics`, `subtopics`)
2. **Learning Unit Identity** (`learning_units`)
3. **Exam Syllabus Projections** (`exam_unit_mappings`, `exam_topics`, `exam_syllabi`)
4. **Required Depth** (`FOUNDATIONAL_ONLY`, `INTERMEDIATE_APPLICATION`, `ADVANCED_COMPETITIVE`)
5. **Topic Relationships** (`topic_relationships`)
6. **Canonical Question Bank** (`questions`, `question_versions`, `question_answers`)
7. **Approved Learning Content** (`document_versions` with `review_status = 'PUBLISHED'`)
8. **Admin Generation Directives** (Sanitized directives)

If information conflicts, the higher-precedence authority wins unconditionally.

---

## 4. Exam-Specific Projection & Required Depth

A single canonical `learning_unit` (e.g. "Algebraic Identities") maps to multiple competitive examinations with distinct requirements:
- **SSC CGL Tier 1 & 2**: `ADVANCED_COMPETITIVE` (Emphasizes quadratic shortcuts, high-speed factorizations, and tricky sign conditions).
- **UPSC CSAT**: `INTERMEDIATE_APPLICATION` (Emphasizes logical comprehension, problem translation, and conceptual bounds).
- **Banking (IBPS/SBI)**: `INTERMEDIATE_APPLICATION` (Emphasizes rapid calculation approximations and trap avoidance).

`CurriculumContextBuilder` preserves exam-specific projections without flattening them into generic strings.

---

## 5. Topic Relationship Resolution & Bounding

Relationships are resolved from `topic_relationships` with bounded depth:
- `PREREQUISITE`: Critical prior knowledge required before studying this unit.
- `RELATED`: Horizontally related topics in the same subject domain.
- `ADVANCED_APPLICATION`: Advanced downstream topics building upon this unit.
- `COREQUISITE`: Companion topics recommended to be studied concurrently.

**Bounding & Cycle Protection**:
- Traversal is bounded to depth = 1.
- Maximum 10 relationships returned.
- Inactive relationships are filtered out.

---

## 6. Question Bank Authority & Lineage

- Context builder retrieves up to 5 canonical question records linked to the topic.
- Provides `questionVersionId`, `questionId`, `questionTextSnippet` (max 150 chars), `difficultyTier`, and `pyqYear`.
- The prompt instructs the LLM: *"Use ONLY the exact questionVersionId values provided in the context; never invent synthetic question IDs."*

---

## 7. Deterministic Context Hashing

Every built `CurriculumAIContext` generates a deterministic SHA-256 hash (`contextHash`) computed across:
- Normalized learning unit (id, slug, title)
- Canonical taxonomy path
- Exam projections & required depth
- Prerequisite topic IDs
- Canonical question version IDs
- Approved content version IDs
- Sanitized admin generation directives

This enables exact lineage tracing: *"What precise curriculum context generated this AI draft?"*

---

## 8. Prompt Architecture & Injection Defense

`AIPromptBuilder` constructs provider-independent prompts separating system rules from untrusted data:

```
<SYSTEM_INSTRUCTIONS>
  Strict authoring role, tone, and JSON output constraints.
</SYSTEM_INSTRUCTIONS>

<AUTHORITATIVE_ACADEMIC_CONTEXT>
  Delimited academic taxonomy, unit metadata, exam projections,
  prerequisites, and canonical questionVersionId references.
</AUTHORITATIVE_ACADEMIC_CONTEXT>

<DOCUMENT_TYPE_DIRECTIVES>
  Specific rules for CONCEPT_LESSON, WORKED_EXAMPLES,
  FORMULA_SHORTCUT_SHEET, COMMON_TRAPS_AND_MISTAKES, etc.
</DOCUMENT_TYPE_DIRECTIVES>

<ADMIN_GENERATION_DIRECTIVES>
  Sanitized admin focus keywords and custom instructions.
</ADMIN_GENERATION_DIRECTIVES>

<OUTPUT_SCHEMA_INSTRUCTION>
  Complete LessonDocumentSpec JSON schema.
</OUTPUT_SCHEMA_INSTRUCTION>
```

---

## 9. Google Gemini Production Provider Implementation

- **Service**: `services/ai/gemini-provider.service.ts` (`GeminiAIProvider`)
- **Model**: `gemini-1.5-pro` (configured in `AIModelConfigRegistry`)
- **Configuration**: Server-side `process.env.GEMINI_API_KEY`.
- **Safety**: `isConfigured()` returns `false` safely if key is absent. Key is never exposed to client bundles.
- **REST Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{modelId}:generateContent`
- **Output Parsing**: Parses JSON output, evaluates candidate finish reasons (`SAFETY`, `BLOCKLIST`), and runs `ContentSpecValidator.validate()`.

---

## 10. Error Taxonomy Mapping

| Gemini API Response / Scenario | Normalized AIErrorCode | Retryable |
| :--- | :--- | :--- |
| HTTP 400 (Bad Request) | `INVALID_REQUEST` | **No** |
| HTTP 401 / 403 (Invalid API Key) | `AUTHENTICATION_ERROR` | **No** |
| HTTP 429 (Rate Limit / Quota) | `RATE_LIMITED` | **Yes** |
| Request Timeout (AbortController) | `TIMEOUT` | **Yes** |
| HTTP 500 / 502 / 503 (Server Error) | `PROVIDER_UNAVAILABLE` | **Yes** |
| Non-JSON or Corrupted Output | `MALFORMED_OUTPUT` | **No** |
| Schema Mismatch with `LessonDocumentSpec` | `SCHEMA_VALIDATION_FAILED` | **No** |
| Safety / Policy Block | `CONTENT_POLICY_REFUSAL` | **No** |

---

## 11. Content Studio Integration

- **Server Action**: `generateLessonWithAIAction` in `app/admin/content/actions.ts` (gated by `AdminService.checkIsAdminOrStaff()`).
- **Modal Component**: `AIGenerationModal` in `components/admin/content-studio/ai-generation-modal.tsx`.
- **Editor Integration**: "Generate with AI" button in Content Studio workspace toolbar.

---

## 12. Implemented vs Designed vs Future Status Matrix

| Component | Status | Location |
| :--- | :--- | :--- |
| **Curriculum Context Types** | **IMPLEMENTED** | `types/ai-curriculum-context.ts` |
| **Curriculum Context Builder** | **IMPLEMENTED** | `services/ai/curriculum-context-builder.service.ts` |
| **AI Prompt Builder** | **IMPLEMENTED** | `services/ai/ai-prompt-builder.ts` |
| **Google Gemini Production Provider** | **IMPLEMENTED** | `services/ai/gemini-provider.service.ts` |
| **Deterministic Mock Provider** | **IMPLEMENTED** | `services/ai/mock-ai-provider.service.ts` |
| **AI Orchestrator Curriculum Integration** | **IMPLEMENTED** | `services/ai/ai-generation-orchestrator.service.ts` |
| **Studio Server Action** | **IMPLEMENTED** | `app/admin/content/actions.ts` |
| **Studio AI Generation Modal** | **IMPLEMENTED** | `components/admin/content-studio/ai-generation-modal.tsx` |
| **Automated Test Suite** | **IMPLEMENTED** | `scripts/test_phase3e2_curriculum_ai.cjs` (40/40 assertions) |
| **Multi-Provider Fallback Routing** | **DESIGNED** | Slated for Phase 3E.3 |
| **Bulk Lesson Batch Generation** | **FUTURE** | Post-Phase 3E |
| **AI Multi-Lingual Translation** | **FUTURE** | Post-Phase 3E |

---

## 13. Phase 3E.3 Boundary & Hard Stop

Phase 3E.2 is complete and certified. **Phase 3E.3 has NOT been started.** No multi-provider fallback routing, batch generation workers, or translation pipelines were created.
