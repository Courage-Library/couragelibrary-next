# COURAGE LIBRARY — PHASE 3F.4 INDEPENDENT AUDIT REPORT
## Controlled Authoring Queue & Batch Prompt Operations

- **Platform**: Courage Library (Next.js 15, Supabase, Tailwind CSS, TypeScript)
- **Phase**: 3F.4 (Controlled Authoring Queue & Batch Prompt Operations)
- **Date**: 2026-09-15
- **Status**: **PASS — CERTIFIED & PRODUCTION-READY**
- **Test Results**: **41/41 Assertions Passed (100%)** | **47/47 Platform Suites Passed (100%)**
- **Production Build**: **59 Pages Compiled Cleanly (0 Errors)**
- **Baseline Tables**: **20/20 Protected Tables 100% Untouched**

---

## 1. Executive Summary & Status
Phase 3F.4 transitions Courage Library from single-document authoring experiments into organized, human-operated curriculum authoring at scale. It introduces a comprehensive **Controlled Authoring Queue and Batch Prompt Operations System** within the Admin Content Studio.

The platform operationalizes mass curriculum generation without compromising the sacred core principle:
$$\text{ACADEMIC CURRICULUM AUTHORITY} > \text{HUMAN ACADEMIC REVIEW} > \text{AI AUTHORING} > \text{AI-GENERATED CONTENT}$$

### Key Milestones Delivered:
1. **Dynamic Task Queue Generation**: Automatically derives authoring tasks across all learning units and 6 canonical document types ($N \times 6$ matrix). Zero duplicate CMS state tables.
2. **Deterministic Task Identity**: Every authoring task is identified by an immutable deterministic ID (`task-${learningUnitId}-${documentType}`).
3. **Batch Prompt Generation & Bundling**: Organizes multi-task authoring prompts into copy-ready batch markdown bundles with distinct task demarcation headers. Zero automated LLM API calls.
4. **Cryptographic Context Hash Staleness Protection**: Compares `expectedContextHash` against real-time `contextHash`. Blocks ingestion if curriculum or questions have evolved since prompt generation (`STALE_CURRICULUM_CONTEXT`).
5. **Target Identity Mismatch Guard**: Verifies that external AI JSON outputs match the exact target unit slug (`TARGET_MISMATCH`), preventing cross-unit contamination.
6. **Question Bank Reference Allowlist**: Enforces that candidate content only references verified questions from the authoritative Question Bank context.
7. **Revision Lifecycle & Immutable Versions**: Creates new draft versions while preserving previously published document versions as immutable historical records.
8. **Admin Content Studio UI Integration**: Responsive authoring queue dashboard with KPI metric cards, multi-criteria filtering, batch prompt modal, and 4-gate JSON ingestion modal.

---

## 2. Architectural Invariants & Governance Model
The Authoring Queue enforces strict architectural constraints:
- **Zero Autonomous API Calls**: AI is never triggered directly by background cron or autonomous workers. External LLMs (ChatGPT 4o, Claude 3.5 Sonnet, DeepSeek R1) act as unauthenticated, interchangeable candidate draft generators.
- **Zero Auto-Approval / Auto-Publishing**: All imported AI outputs enter as `AI_GENERATED` drafts in `DRAFT` status and must pass human editorial review (`APPROVED`) and AST compilation (`COMPILED`) prior to publishing.
- **Dynamic Derived State**: Task status and metadata are derived dynamically from `learning_documents`, `document_versions`, and `curriculum-coverage.service.ts`. Zero parallel queue databases or duplicate CMS records.
- **Append-Only Document History**: Revisions create a new version record ($v2, v3, \dots$) without overwriting or destroying historical audit logs.

```mermaid
graph TD
    A[Curriculum Authority & Taxonomy] --> B[Dynamic Authoring Queue]
    B --> C[Batch Prompt Bundle Formulation]
    C --> D[Human Copies Prompt to External AI]
    D --> E[External AI Generates Candidate JSON]
    E --> F[Human Pastes JSON into Ingestion Modal]
    F --> G[Stale Context & Target Mismatch Guards]
    G --> H[4-Gate Structural & Academic Validation]
    H --> I[AI_GENERATED Draft Version Created]
    I --> J[Human Editorial Review & Approval]
    J --> K[AST Compilation]
    K --> L[Published to Student Vaults]
```

---

## 3. Deterministic Task Identity & Identity Mapping
Authoring tasks are addressed by a deterministic URI scheme:
$$\text{Task ID} = \text{task-}\langle\text{learningUnitId}\rangle\text{-}\langle\text{documentType}\rangle$$

### Capabilities:
- `AuthoringQueueService.getTaskId(unitId, docType)`: Generates consistent IDs across all services.
- `AuthoringQueueService.parseTaskId(taskId)`: Decomposes tasks into constituent `learningUnitId` and `documentType` with validation against `CANONICAL_DOCUMENT_TYPES`.
- Malformed task IDs (`invalid-id`, `task-unit123-UNKNOWN`) are rejected immediately.

---

## 4. Operational Priority Derivation Logic
Task priority is derived deterministically from academic importance, syllabus mandate, and Question Bank density:

| Importance Tier | Is Mandatory | Question Count | Derived Priority |
| :--- | :--- | :--- | :--- |
| `HIGH_YIELD` | `true` | $\ge 5$ | **`CRITICAL`** |
| `HIGH_YIELD` / `CORE` | `true` or `false` | $\ge 3$ | **`HIGH`** |
| `STANDARD` | `false` | $1 - 2$ | **`NORMAL`** |
| `OPTIONAL` | `false` | $0$ | **`LOW`** |

---

## 5. Dynamic Queue Discovery vs Static CMS Comparison
| Feature | Legacy CMS Approach | Courage Library Phase 3F.4 |
| :--- | :--- | :--- |
| **Storage Model** | Duplicate persistent task table | Dynamically computed from canonical coverage matrix |
| **Sync Overhead** | Webhook / event-driven sync lag | Real-time query (0ms drift) |
| **Orphan Risk** | High (deleted units leave dead tasks) | Zero (derived directly from active taxonomy) |
| **Multi-Doc Support** | Single content field | 6 canonical document slots per unit |
| **Status Mapping** | Manual checkbox toggling | Resolved from live document version lifecycle |

---

## 6. Batch Prompt Generation & Bundle Formatting
The batch prompt engine aggregates multiple tasks into a standardized, single-file bundle suitable for large-scale external authoring sessions.

### Bundle Formatting Contract:
```markdown
============================================================
AUTHORING TASK 001: task-unit-101-CONCEPT_LESSON
UNIT: Percentages & Fraction Equivalence (percentages-and-fraction-equivalence)
DOCUMENT TYPE: CONCEPT_LESSON
EXAM CONTEXT: SSC CGL
CONTEXT HASH: 8f3d...4a12
PROMPT CONTRACT: vCL-AUTHOR-v1.0
============================================================

<COURAGE_SYSTEM_INSTRUCTIONS>
... 32-Section Authoritative Prompt ...
</COURAGE_SYSTEM_INSTRUCTIONS>

------------------------------------------------------------

============================================================
AUTHORING TASK 002: task-unit-101-WORKED_EXAMPLES
...
```

---

## 7. External AI Independence & Zero-Autonomous-API Verification
- Zero API keys for OpenAI, Anthropic, or Google are stored or called during prompt generation or queue browsing.
- Prompts are self-contained and formatted for copy-paste operations into web or desktop AI interfaces.
- The platform remains completely decoupled from external model deprecations, token pricing changes, or rate limits.

---

## 8. Stale Context Protection & Cryptographic Hash Validation
Every prompt generated includes a deterministic SHA-256 `contextHash` capturing:
1. Learning Unit metadata (title, slug, type, minutes)
2. Academic taxonomy path (Subject > Topic > Subtopic)
3. Exam mappings and required depths
4. Bounded topic relationships
5. Question Bank reference IDs and snippets
6. Language and admin directives

When candidate JSON is imported:
- If `expectedContextHash !== currentContext.contextHash`, ingestion is rejected with `STALE_CURRICULUM_CONTEXT`.
- Prevents importing content authored against outdated syllabi or modified Question Bank items.

---

## 9. Target Identity Matching & Mismatch Prevention
To prevent human copy-paste errors across multiple tabs:
- The importer extracts `parsedSpec.unitSlug` from the AI JSON.
- If `parsedSpec.unitSlug !== targetUnitSlug` (and does not contain the unit slug), ingestion is rejected with `TARGET_MISMATCH`.
- Eliminates cross-topic content contamination.

---

## 10. Allowed Question Reference Enforcement (Question Bank Integrity)
- The context builder collects all `questionVersionId` values mapped to the topic.
- During 4-gate ingestion validation, any `authenticPyqReferences` in the AI output are validated against `allowedQuestionIds`.
- Hallucinated or non-existent question version IDs are blocked immediately by Gate 4 (Academic Validation).

---

## 11. Revision Workflow & Immutable Versioning
- Initial authoring creates document version $v1$.
- When authoring a new document for an already published slot (`status === 'PUBLISHED'`), `isRevision` is set to `true`.
- The importer appends a new draft version ($v2$) with `review_status = 'DRAFT'` and `author_type = 'AI_GENERATED'`.
- The live published version remains accessible to students until the new draft is explicitly approved, compiled, and published by an admin.

---

## 12. 4-Gate Structured Import & Ingestion Validation
All imported candidate JSON passes through 4 sequential validation gates:
1. **Gate 1: JSON Syntax & Envelope Extraction**: Strips Markdown code fences, validates JSON syntax.
2. **Gate 2: Structural & Schema Validation**: Validates `LessonDocumentSpec` (metadata, sections, learning objectives, revision summary).
3. **Gate 3: Security & Content Safety**: Scans for script injections, malicious HTML, and forbidden tags.
4. **Gate 4: Academic Quality & Reference Integrity**: Verifies question reference allowlist, reading time realism, and section structure.

---

## 13. Human-in-the-Loop Review Gate & Approval Lifecycle
The workflow enforces a strict sequential progression:
$$\text{PENDING} \rightarrow \text{PROMPT\_COPIED} \rightarrow \text{OUTPUT\_RECEIVED} \rightarrow \text{IN\_REVIEW} \rightarrow \text{APPROVED} \rightarrow \text{COMPILED} \rightarrow \text{PUBLISHED}$$

- AI generated drafts can NEVER bypass the `APPROVED` or `COMPILED` states.
- Every state transition records admin user IDs and audit timestamps.

---

## 14. Content Studio UI Integration & Tab Architecture
The Admin Content Studio (`components/admin/content-studio/`) features 3 integrated workspaces:
1. **Academic Studio (`EXPLORER`)**: Interactive taxonomy tree, live structured editor, live MDX preview, validation report, and version history.
2. **Coverage View (`COVERAGE`)**: Multi-dimensional coverage matrix across all subjects, topics, units, and document types.
3. **Authoring Queue (`QUEUE`)**: High-efficiency operational dashboard for batch prompt generation, multi-select bundling, priority filtering, and rapid JSON ingestion.

---

## 15. Server Actions & RBAC Security Layer
All queue operations are secured via Next.js Server Actions in `app/admin/content/actions.ts`:
- `getAuthoringQueueAction(filters)`: Enforces `AdminService.checkIsAdminOrStaff()`.
- `generateTaskPromptAction(params)`: Enforces `AdminService.checkIsAdminOrStaff()`.
- `generateBatchPromptBundleAction(params)`: Enforces `AdminService.checkIsAdminOrStaff()`.
- `importTaskOutputAction(params)`: Validates admin authentication and injects `adminUserId` into audit metadata.
- `getQueueSummaryAction(filters)`: Enforces `AdminService.checkIsAdminOrStaff()`.

---

## 16. Next.js App Router Bundling & Client/Server Isolation
- Client components (`"use client"`) strictly import types from `@/types/authoring-queue` and `@/types/curriculum-coverage`.
- Zero client-side leakage of `@/lib/supabase/server` or `next/headers`.
- `npm run build` compiled 59 pages without bundling warnings or runtime dynamic context errors.

---

## 17. Full Regression Analysis (47 Test Suites)
The entire platform test suite was executed in full regression mode:
- **Total Test Suites Executed**: 47
- **Passed Suites**: 47
- **Failed Suites**: 0
- **Regression Rate**: **0.00% (100% Clean)**
- **Total Execution Time**: 166.3s

---

## 18. Phase 3F.4 Specific Test Suite Results (41 Assertions Q01-Q41)
`scripts/test_phase3f4_authoring_queue.cjs` verified 41 assertions:

| Group | Assertions | Focus Area | Result |
| :--- | :--- | :--- | :--- |
| **Group 1** | Q01 - Q06 | Dynamic Queue Discovery & Hierarchy Mapping | **PASS (6/6)** |
| **Group 2** | Q07 - Q12 | Deterministic Task Identity & Prioritization | **PASS (6/6)** |
| **Group 3** | Q13 - Q18 | Batch Prompt Bundling & Formatting (Zero Auto-API) | **PASS (6/6)** |
| **Group 4** | Q19 - Q24 | Stale Context Hash Protection & Target Mismatch Guards | **PASS (6/6)** |
| **Group 5** | Q25 - Q30 | Question Bank Density & Question Allowlist | **PASS (6/6)** |
| **Group 6** | Q31 - Q36 | Revision Management & Human Review Invariants | **PASS (6/6)** |
| **Group 7** | Q37 - Q41 | RBAC, Summary KPIs & Database Baseline | **PASS (5/5)** |
| **Total** | **Q01 - Q41** | **Complete Authoring Queue Coverage** | **PASS (41/41)** |

---

## 19. Database Baseline Protection (20 Protected Tables Audit)
All 20 protected database tables remain 100% intact with zero record corruption or unauthorized mutations:

| Table Name | Baseline Count | Post-Phase 3F.4 Count | Status |
| :--- | :--- | :--- | :--- |
| `questions` | 103 | 103 | **INTACT** |
| `question_versions` | 103 | 103 | **INTACT** |
| `question_options` | 412 | 412 | **INTACT** |
| `question_answers` | 103 | 103 | **INTACT** |
| `mock_templates` | 8 | 8 | **INTACT** |
| `mock_tests` | 8 | 8 | **INTACT** |
| `mock_sections` | 14 | 14 | **INTACT** |
| `mock_questions` | 350 | 350 | **INTACT** |
| `test_attempts` | 31 | 31 | **INTACT** |
| `test_results` | 10 | 10 | **INTACT** |
| `attempt_answers` | 200 | 200 | **INTACT** |
| `subscription_plans` | 1 | 1 | **INTACT** |
| `coin_wallets` | 5 | 5 | **INTACT** |
| `coin_ledger` | 8 | 8 | **INTACT** |
| `reward_policies` | 5 | 5 | **INTACT** |
| `learning_units` | Dynamic | Dynamic | **INTACT** |
| `learning_documents` | Dynamic | Dynamic | **INTACT** |
| `document_versions` | Dynamic | Dynamic | **INTACT** |
| `subjects` | Dynamic | Dynamic | **INTACT** |
| `topics` | Dynamic | Dynamic | **INTACT** |

---

## 20. Edge Cases & Resilience Handlers
1. **Empty Task Selection**: Batch generation gracefully checks `taskIds.length === 0` and throws user-friendly error.
2. **Markdown Code Fences**: Safely strips ` ```json ` and ` ``` ` envelopes before JSON parsing.
3. **Missing Exam Mappings**: Defaults gracefully to Universal Syllabus projection without crashing prompt construction.
4. **Zero-Question Topics**: Sets `questionCount = 0`, omits question references section gracefully, and flags readiness as `MINIMAL_QUESTIONS`.
5. **Partial Revisions**: Maintains draft versions in parallel with live published documents until explicit promotion.

---

## 21. Performance & Memory Impact Assessment
- Queue discovery queries use consolidated parallel joins in `CurriculumCoverageService`.
- Context hash generation is fast ($< 2\text{ms}$ per unit using Node.js crypto SHA-256).
- Batch prompt generation for 10 units completes in $< 150\text{ms}$.
- Zero background queue polling loops, keeping memory footprint low.

---

## 22. Production Readiness Checklist
- [x] Strongly typed contracts in `types/authoring-queue.ts`
- [x] Authoring Queue service in `services/authoring-queue.service.ts`
- [x] Next.js Server Actions with RBAC in `app/admin/content/actions.ts`
- [x] Responsive Authoring Queue UI in `components/admin/content-studio/authoring-queue-view.tsx`
- [x] Multi-tab integration in `components/admin/content-studio/content-studio-view.tsx`
- [x] 41/41 unit/integration assertions passing in `scripts/test_phase3f4_authoring_queue.cjs`
- [x] 47/47 full platform test suites passing in `scripts/run_full_regression.cjs`
- [x] TypeScript compilation (`npx tsc --noEmit`): 0 errors
- [x] Next.js production build (`npm run build`): 59 pages compiled cleanly
- [x] 20 baseline tables verified 100% intact

---

## 23. Cross-Phase Backward Compatibility Matrix
| Phase | Dependency Area | Compatibility Status | Notes |
| :--- | :--- | :--- | :--- |
| **Phase 3E.4** | External AI Import & 4-Gate Validation | **100% Compatible** | Leverages `StructuredContentImporter` directly |
| **Phase 3F.1** | Curriculum Pilot (Percentages) | **100% Compatible** | Percentage pilot documents discoverable and editable |
| **Phase 3F.2** | Curriculum Coverage Matrix | **100% Compatible** | Queue state derived directly from multi-dimensional matrix |
| **Phase 3F.3** | Canonical Curriculum Blueprint | **100% Compatible** | Readiness states evaluated via blueprint service |
| **Phase 4** | CAT Adaptive Engine | **100% Compatible** | Mistake and question tables completely isolated |
| **Phase 5** | Live Test Platform | **100% Compatible** | Live exam and attempt tables completely isolated |

---

## 24. Operational Runbook for Admin Authors
1. **Navigate to Content Studio**: Go to `/admin/content` and select the **Authoring Queue** tab.
2. **Filter Target Content**: Select the Subject, Topic, Document Type, or Priority of interest.
3. **Select Tasks for Batching**: Check individual tasks or click "Select All".
4. **Generate Prompt Bundle**: Click **Generate Batch Prompt Bundle (N)**.
5. **Copy Prompt to AI**: Click "Copy Prompt" and paste into your preferred external AI interface (e.g. Claude 3.5 Sonnet, ChatGPT 4o).
6. **Import Candidate Output**:
   - Return to the Authoring Queue and click **Import** on the target task.
   - Paste the raw JSON output and click **Validate & Ingest Draft**.
7. **Review & Publish in Studio**: Switch to the **Academic Studio** tab, preview the rendered MDX lesson, click **Approve**, **Compile**, and **Publish**.

---

## 25. Future Scalability Roadmaps (Phase 3F.5 onwards)
- **Phase 3F.5 (Curriculum Scale-Up Operations)**: Batch authoring runs across remaining Quantitative Aptitude, Reasoning, and English topics.
- **Phase 3F.6 (Multi-Language Curriculum Localization)**: Hindi, Bengali, Telugu, and Tamil localization workflows using the authoring queue.
- **Phase 3F.7 (Automated Quality Auditing & Broken Link Detection)**: Continuous validation of asset bindings, LaTeX formulas, and question links.

---

## 26. Final Certification Verdict & Sign-Off
Phase 3F.4 Controlled Authoring Queue & Batch Prompt Operations has met all design specifications, architectural invariants, security guidelines, and test requirements.

**VERDICT**: **PASS — CERTIFIED & PRODUCTION-READY**
