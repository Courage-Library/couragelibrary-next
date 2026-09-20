# COURAGE LIBRARY — LEARNING / COURSES SYSTEM
# PHASE 3E.1: AI GENERATION PIPELINE — ARCHITECTURE & PROVIDER CONTRACT SPECIFICATION
**Document Type**: Authoritative Technical Architecture & Provider Forensic Specification  
**Operating Mode**: Architecture Contract & Minimal Foundation  
**Status**: Authoritative Foundation (Phase 3E.1 Certified & Frozen)  

---

## 1. Executive Summary & Sacred Architectural Principle

Phase 3E.1 establishes the vendor-neutral, server-only architectural foundation, provider abstraction, strict request/response contracts, security boundaries, idempotency protocols, cost tracking models, error taxonomy, and testing harness for the **AI Generation Pipeline** of Courage Library.

### The Sacred Architectural Principle:
> **AI IS A CONTENT DRAFT GENERATOR.**  
> AI is **NOT**:
> - The curriculum authority
> - The Question Bank authority
> - The asset storage authority
> - The academic publication authority
> - The version lifecycle authority
> - The approval authority

```
Academic Taxonomy (Exam → Subject → Topic → Subtopic)
        ↓
Learning Units (learning_units)
        ↓
Learning Documents (learning_documents)
        ↓
Document Versions (document_versions)
        ↓
Question Bank / Learning Assets
        ↓
AI Generation Assistance (Structured JSON Draft Only)
        ↓
Content Spec Validation (ContentSpecValidator) & Security Scan (MdxSecurityScanner)
        ↓
DRAFT Document Version (review_status = 'AI_GENERATED', is_published = false)
        ↓
Human Admin Review (Phase 3D Admin Content Studio)
        ↓
Human Approval (review_status = 'APPROVED')
        ↓
Controlled Compilation (ControlledContentCompiler → review_status = 'COMPILED')
        ↓
Human Admin Publishing (review_status = 'PUBLISHED', is_published = true)
```

**AI MUST NEVER directly publish content.** Direct transitions to `PUBLISHED` from AI generation or unverified drafts are physically and programmatically prevented by PostgreSQL triggers and service layer invariants.

---

## 2. Existing AI Codebase Forensic Audit

A comprehensive codebase audit across all directories (`app/`, `services/`, `lib/`, `components/`, `types/`, `config/`, `.env*`, `package.json`, `supabase/migrations`) was performed.

| Existing Reference / Artifact | Location | Purpose | Used By | Disposition |
| :--- | :--- | :--- | :--- | :--- |
| `admin-bulk-import-studio.tsx` | `components/admin/` | Client-side string template formatter for copy-paste CSV prompts | Admin manual external LLM workflow | **Preserved** (No SDK/API conflict) |
| `reward-editor-modal.tsx` | `components/admin/rewards/` | Client-side image generation brief string formatter | Admin manual Midjourney/DALL-E prompt | **Preserved** (No SDK/API conflict) |
| `descriptive_prompts` Table | `services/admin.service.ts` | Candidate essay/letter writing test prompts for descriptive exams | Candidate examination UI | **Preserved** (Domain exam prompt, not LLM prompt) |
| `QuickCheck.prompt` Prop | `types/learning-compiler.ts` | MCQ question stem string in lesson specs | Learning component rendering | **Preserved** (Component contract) |
| `package.json` Dependencies | Root `package.json` | Core framework dependencies | System runtime | **Preserved** (0 AI SDKs installed; clean slate) |

**Audit Verdict**: Zero active AI provider SDKs, zero API key leakages, and zero conflicting AI frameworks exist. The codebase provides a clean, greenfield foundation that directly reuses the canonical Phase 3A-3D primitives.

---

## 3. Canonical AI Architecture & Orchestration Flow

```
ADMIN / SERVER REQUEST (AdminService.checkIsAdminOrStaff)
        ↓
AI GENERATION ORCHESTRATOR (AIGenerationOrchestrator)
        ↓
GENERATION CONTEXT BUILDER (Authoritative Context: Taxonomy, Unit, Syllabus, Exam Mappings)
        ↓
PROMPT / STRUCTURED OUTPUT CONTRACT (Schema: LessonDocumentSpec)
        ↓
AI PROVIDER ABSTRACTION (AIProvider Interface)
        ↓
PROVIDER IMPLEMENTATION (Mock / Google Gemini / OpenAI / Anthropic / OpenRouter)
        ↓
NORMALIZED AI RESPONSE (AINormalizedResponse<LessonDocumentSpec>)
        ↓
STRUCTURED VALIDATION (ContentSpecValidator) & SECURITY SCAN (MdxSecurityScanner)
        ↓
DRAFT DOCUMENT VERSION (document_versions: review_status='AI_GENERATED', is_published=false)
        ↓
HUMAN ADMIN REVIEW & EDIT (Phase 3D Content Studio)
        ↓
HUMAN APPROVAL (review_status='APPROVED')
        ↓
CONTROLLED COMPILATION (review_status='COMPILED')
        ↓
ATOMIC PUBLISHING (review_status='PUBLISHED')
```

---

## 4. Provider Abstraction Contract

The provider layer is completely decoupled from business logic and database tables.

```typescript
export interface AIStructuredValidator<T> {
  (raw: unknown): {
    isValid: boolean;
    data?: T;
    errors: string[];
    warnings?: string[];
  };
}

export interface AIProvider {
  readonly providerId: AIProviderId;
  isConfigured(): boolean;
  generateStructured<T>(
    request: AIGenerationRequest,
    validator: AIStructuredValidator<T>
  ): Promise<AINormalizedResponse<T>>;
}
```

Supported Provider IDs:
- `MOCK` (Deterministic offline mock for testing/CI)
- `GOOGLE_GEMINI` (Primary multi-modal & structured JSON provider)
- `OPENAI` (Standard structured JSON completion provider)
- `ANTHROPIC` (Claude Sonnet structured generation provider)
- `OPENROUTER` (Multi-model routing gateway)

---

## 5. Centralized Model Configuration & Catalog

All AI models, purposes, token ceilings, temperature defaults, and pricing metadata are centralized in `AIModelConfigRegistry` in `services/ai/ai-model-registry.ts`. No raw model strings exist across UI or application services.

| Model ID | Provider | Default Purpose | Max Input | Max Output | Default Temp | Timeout | Input Cost/1k | Output Cost/1k |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `mock-deterministic-v1` | `MOCK` | `CONTENT_GENERATION` | 8,192 | 8,192 | 0.0 | 5s | $0.000000 | $0.000000 |
| `gemini-1.5-pro` | `GOOGLE_GEMINI` | `CONTENT_GENERATION` | 1,048,576 | 8,192 | 0.2 | 45s | $0.001250 | $0.005000 |
| `gemini-1.5-flash` | `GOOGLE_GEMINI` | `SUMMARIZATION` | 1,048,576 | 8,192 | 0.1 | 25s | $0.000075 | $0.000300 |
| `gpt-4o` | `OPENAI` | `CONTENT_GENERATION` | 128,000 | 4,096 | 0.2 | 45s | $0.005000 | $0.015000 |
| `claude-3-5-sonnet` | `ANTHROPIC` | `CONTENT_GENERATION` | 200,000 | 8,192 | 0.2 | 45s | $0.003000 | $0.015000 |

---

## 6. Structured Output Contract (`LessonDocumentSpec`)

AI output MUST be structured JSON adhering strictly to `LessonDocumentSpec` (`schemaVersion: '1.0.0'`). AI is **never** permitted to return raw, unparsed MDX as the primary output contract.

```
AI Model Output (JSON)
        ↓
Runtime Spec Validation (ContentSpecValidator.validate)
        ↓
AST Markdown Security Scan (MdxSecurityScanner.scan)
        ↓
LessonDocumentSpec Structure
        ↓
Controlled Content Compiler (ControlledContentCompiler.compile)
```

---

## 7. Generation Request Contract

The normalized generation request payload (`AIGenerationRequest`) encapsulates:
1. `requestId` (UUIDv4)
2. `idempotencyKey` (Admin client / session idempotency key)
3. `purpose` (`CONTENT_GENERATION` | `CONTENT_REVISION` | `CONTENT_VALIDATION` | `TRANSLATION` | `SUMMARIZATION`)
4. `learningUnitId` (Authoritative foreign key)
5. `documentType` (`CONCEPT_LESSON` | `WORKED_EXAMPLES` | `FORMULA_SHORTCUT_SHEET` | `COMMON_TRAPS_AND_MISTAKES` | `PYQ_DEEP_DIVE` | `TOPIC_SUMMARY_REVISION`)
6. `academicContext` (Exam IDs, Subject ID/Name, Topic ID/Name, Subtopic ID/Name, Unit Title, Unit Slug, Difficulty Tier, Language, Prerequisites)
7. `generationDirectives` (Focus keywords, formula requirements, worked example count, trap requirements, quick check count, custom instructions)
8. `authoritativeReferences` (Allowed question bank IDs, allowed asset IDs)
9. `requester` (Admin user ID, email, IP address)

---

## 8. Context Authority Precedence

When assembling prompt context for future AI generation, context MUST be pulled from authoritative canonical sources in this strict order of precedence:

1. **Academic Taxonomy** (`subjects`, `topics`, `subtopics`)
2. **Learning Unit** (`learning_units`)
3. **Exam Syllabus Projections** (`exam_unit_mappings`, `exam_topics`)
4. **Prerequisites & Topic Relationships** (`topic_relationships`)
5. **Canonical Question Bank** (`questions`, `question_versions`, `question_answers`)
6. **Canonical Asset Catalog** (`learning_assets`)
7. **Explicit Admin Generation Directives**

> [!CRITICAL]
> Unapproved or raw AI outputs from previous generations **MUST NEVER** become authoritative curriculum context. Recursive AI contamination is strictly prohibited.

---

## 9. Question Bank Authority Preservation

- AI **must never** become the canonical owner or creator of questions in the Question Bank.
- If a lesson requires worked examples or PYQ practice references, AI receives references to existing canonical `question_versions`.
- AI outputs embed validated `questionVersionId` references into `LessonDocumentSpec.authenticPyqReferences`.
- AI-generated practice questions in `quickChecks` are self-contained micro-checks within the lesson artifact and are NOT inserted into the canonical Question Bank table.

---

## 10. Asset Storage Authority Preservation

- AI **must never** write arbitrary binary files or images directly to storage.
- Diagrams and media must reference approved assets registered in `learning_assets` and stored in Supabase Storage (`learning-assets` bucket).
- In future phases, visual generation briefs will create reviewable drafts in the asset catalog, subject to human approval before binding.

---

## 11. Security Boundary & Zero Secret Exposure

1. **Server-Only API Keys**: AI provider API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) must exist exclusively in server-side environment variables and are NEVER exposed via `NEXT_PUBLIC_` variables.
2. **Zero Client Leakage**: Client components (`"use client"`) only communicate via authenticated Server Actions or REST endpoints.
3. **AST Threat Detection**: All Markdown generated by AI is scanned through `MdxSecurityScanner` to reject `<script>`, `<iframe>`, `javascript:`, and executable event handlers before saving as DRAFT.

---

## 12. Admin Authorization Gate

All AI generation requests are privileged administrative operations.
- **Enforcement Gate**: `AdminService.checkIsAdminOrStaff()`
- Any request from an unauthenticated user or non-staff candidate is immediately rejected with HTTP 401/403.
- No public or candidate-facing AI proxy endpoints exist.

---

## 13. Idempotency & Safe Retry Architecture

To prevent duplicate version creation from double-clicks, network retries, or browser refreshes:
1. `computeIdempotencyHash(request)` generates a deterministic SHA-256 hash over:
   - `learningUnitId`
   - `documentType`
   - `academicContext`
   - `generationDirectives`
   - `targetModel`
2. If a request with the same hash is already in progress or has produced an existing draft, the orchestrator returns the existing draft rather than creating a competing duplicate.

---

## 14. Auditability & Telemetry

Every AI generation event records an immutable `AIAuditLogEntry`:
- `generationRequestId`
- `requesterAdminId`
- `timestamp`
- `providerId` & `modelId`
- `purpose`
- `learningUnitId` & `documentId`
- `requestHash`
- `responseStatus` (`SUCCESS` | `VALIDATION_FAILED` | `PROVIDER_ERROR`)
- `tokenUsage` (promptTokens, completionTokens, totalTokens, estimatedCostUsd)
- `latencyMs`
- `retryCount`
- `disposition` (`SAVED_AS_DRAFT` | `DISCARDED_INVALID` | `FAILED`)

---

## 15. Cost & Token Usage Architecture

Token usage is normalized across all providers and converted into USD cost estimates via `AIModelConfigRegistry.estimateCostUsd()`:
$$	ext{Cost} = \left(rac{	ext{promptTokens}}{1000} 	imes 	ext{InputRate}ight) + \left(rac{	ext{completionTokens}}{1000} 	imes 	ext{OutputRate}ight)$$

Safeguards enforced:
- Maximum output token hard limit (8,192 tokens)
- Request timeout hard limit (45s)
- Max retry limit (3 attempts)
- Concurrency gating per admin session

---

## 16. Normalized Error Taxonomy & Retry Policy

### Error Codes:
- `INVALID_REQUEST`: Malformed request parameters (Non-retryable)
- `AUTHENTICATION_ERROR`: Invalid or expired API credentials (Non-retryable)
- `RATE_LIMITED`: Provider HTTP 429 / Quota exhausted (Retryable with exponential backoff)
- `TIMEOUT`: Request exceeded timeout limit (Retryable)
- `PROVIDER_UNAVAILABLE`: Provider HTTP 500/502/503 (Retryable)
- `MALFORMED_OUTPUT`: Model returned invalid JSON (Non-retryable)
- `SCHEMA_VALIDATION_FAILED`: Output violated `LessonDocumentSpec` (Non-retryable)
- `CONTENT_POLICY_REFUSAL`: Content triggered safety or security scanner (Non-retryable)
- `PERMANENT_PROVIDER_ERROR`: Fatal provider-side rejection (Non-retryable)
- `UNKNOWN_ERROR`: Unclassified system error (Non-retryable)

### Retry Policy:
- Max Attempts: 3
- Initial Backoff: 1,000ms
- Backoff Multiplier: 2.0x
- Max Backoff: 8,000ms
- Retryable Codes: `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`

---

## 17. Multi-Provider Fallback Architecture (Designed)

If the primary provider (`GOOGLE_GEMINI`) encounters a persistent `PROVIDER_UNAVAILABLE` or `RATE_LIMITED` failure:
1. The orchestrator can switch to a configured secondary fallback provider (`OPENAI` or `ANTHROPIC`).
2. **Audit Requirement**: The fallback event, original provider, and fallback provider MUST be explicitly recorded in `AIAuditLogEntry`.
3. No silent provider switching without audit telemetry.

---

## 18. Strict AI → Draft-Only Invariant

```
AI Output → document_versions (review_status = 'AI_GENERATED', is_published = false)
```
- Direct modification of `is_published = true` or `review_status = 'PUBLISHED'` is blocked by:
  1. `AIGenerationOrchestrator` service contract.
  2. `AdminContentStudioService.publishVersion()` lifecycle check (requires `review_status === 'COMPILED'`).
  3. PostgreSQL triggers `fn_prevent_published_version_mutation` and `fn_prevent_published_version_deletion` (Migration 56).

---

## 19. Database Impact Audit

**0 New Database Migrations in Phase 3E.1.**  
The existing database schema in Migration 55 and Migration 56 already provides complete support for AI generation workflows:
- `document_versions.author_type`: Includes `'AI_ASSISTED'`.
- `document_versions.review_status`: Includes `'AI_GENERATED'`.
- `document_versions.source_spec_storage_key` & `compiled_artifact_storage_key`: Stores artifacts in Supabase Storage.
- `audit_logs`: Stores structured administrative telemetry.

No speculative database tables or columns were created.

---

## 20. Dependency Policy

**0 New NPM Dependencies in Phase 3E.1.**  
No bloated third-party AI frameworks (e.g., LangChain, LangGraph) were added. The provider abstraction is implemented in clean native TypeScript, ensuring zero bundle bloat and complete operational control.

---

## 21. Status Matrix: Implemented vs Designed vs Future

| Component / Subsystem | Status | Details |
| :--- | :--- | :--- |
| **Provider Neutral Abstraction (`AIProvider`)** | **IMPLEMENTED** | `services/ai/ai-provider.interface.ts` |
| **Centralized Model Registry (`AIModelConfigRegistry`)** | **IMPLEMENTED** | `services/ai/ai-model-registry.ts` |
| **Deterministic Mock Provider (`MockAIProvider`)** | **IMPLEMENTED** | `services/ai/mock-ai-provider.service.ts` |
| **AI Orchestration Service (`AIGenerationOrchestrator`)** | **IMPLEMENTED** | `services/ai/ai-generation-orchestrator.service.ts` |
| **Idempotency & Request Hashing** | **IMPLEMENTED** | SHA-256 request parameter digest |
| **Error Taxonomy & Retry Classification** | **IMPLEMENTED** | `classifyAIError` with retryable code sets |
| **LessonDocumentSpec Validation Pipeline** | **IMPLEMENTED** | Integrated with `ContentSpecValidator` |
| **AST Security Scanner Integration** | **IMPLEMENTED** | Integrated with `MdxSecurityScanner` |
| **Automated Test Suite (Tracks A–O)** | **IMPLEMENTED** | `scripts/test_phase3e1_ai_architecture.cjs` (40/40 assertions) |
| **Gemini Live Provider Implementation** | **DESIGNED** | Slated for Phase 3E.2 |
| **Studio AI Generation UI (Modal / Sidebar)** | **DESIGNED** | Slated for Phase 3E.2 |
| **Multi-Provider Fallback Switching** | **DESIGNED** | Slated for Phase 3E.3 |
| **Bulk Lesson Batch Generation** | **FUTURE** | Post-Phase 3E |
| **AI-Assisted Multi-Lingual Translation** | **FUTURE** | Post-Phase 3E |

---

## 22. Phase 3E.2 Strict Boundary & Hard Stop

Phase 3E.1 is complete and sealed. **Phase 3E.2 (Live Provider Implementation & Content Studio AI Generation UI) has NOT been started.** Execution will halt until explicit user authorization is provided.
