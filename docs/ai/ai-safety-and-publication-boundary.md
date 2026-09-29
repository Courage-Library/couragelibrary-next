# AI Safety & Publication Boundary Specification
**Authoritative Security Perimeter, Threat Model & Untrusted Input Quarantine Architecture**

---

## 1. The Untrusted Input Boundary

External AI outputs are permanently classified as **Untrusted Candidate Input**. The platform enforces a zero-trust publication boundary:

```
                      EXTERNAL AI OUTPUT (UNTRUSTED)
                                    │
                                    ▼
                      [SANITIZATION & NORMALIZATION]
                     (ai-citation-sanitizer: oaicite,
                      brackets, footnotes, code fences)
                                    │
                                    ▼
                      [FIVE-GATE INGESTION VALIDATOR]
                     (Gate 1: Schema | Gate 2: Target
                      Gate 3: Security & Citation Artifacts
                      Gate 4: Provenance | Gate 5: Domain)
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                     [FAIL]                 [PASS]
                 (Drop & Block)                │
                                               ▼
                                    [INGESTION AS DRAFT]
                              (is_published = false, AI_GENERATED)
                                               │
                                               ▼
                                    [HUMAN ACADEMIC REVIEW]
                                    (Reviewer verifies AST & Claims)
                                               │
                                               ▼
                                    [MDX COMPILATION GATE]
                                    (Sanitizer + Static security scan)
                                               │
                                               ▼
                                    [ATOMIC PUBLICATION]
                                    (Immutable version pointer swap)
                                               │
                                               ▼
                                    [CANDIDATE RENDERER GUARD]
                                    (Defense-in-depth runtime strip)
```

---

## 2. Threat Vector Mitigations

1. **Prompt Injection & Control Override**: Database context values and existing claims are HTML-escaped (`&lt;`, `&gt;`) before prompt assembly. The prompt establishes strict XML delimiters separating instructions from data.
2. **Cross-Site Scripting (XSS) via Markdown**: `MdxSecurityScanner` scans all markdown bodies, callout text, FAQs, and metadata strings, blocking `<script>`, `<iframe>`, `javascript:`, `onerror=`, `onload=`, and raw DOM event handlers.
3. **URL Scheme Injection**: Gate 4 strictly rejects non-HTTP/HTTPS protocols (e.g. `data:`, `file:`, `blob:`).
4. **Taxonomy Tampering**: Gate 5 validates that canonical subjects, topics, and post names reference registered database entities.
5. **Accidental Self-Publishing**: The importer service hardcodes `is_published = false` and `review_status = 'AI_GENERATED'` on all ingested drafts. There is no API route or parameter allowing external AI payloads to set `is_published = true`.
6. **External-AI Citation Artifact Leakage**: Proprietary provider citation markers (such as `:contentReference[oaicite:0]{index=0}`, `【4†source】`, `[cite:1]`) are intercepted and neutralized via automated multi-layer sanitization.

---

## 3. Five-Layer Defense-in-Depth Quarantine Architecture

To prevent provider citation artifacts from polluting the candidate experience, Courage Library deploys five redundant defensive layers:

| Layer | Component | Mechanism & Enforcement |
| :--- | :--- | :--- |
| **Layer 1: Ingestion Sanitization** | `ExamKnowledgeImporterService` | Traverses the entire imported JSON document tree using `sanitizeObjectCitationArtifacts()` and `sanitizeAiCitationArtifacts()`, stripping currently identified and supported provider syntax patterns before initial database persistence. |
| **Layer 2: Gate 3 Security Validation** | `ExamKnowledgeValidatorService` | Ingestion Gate 3 runs `detectAiCitationArtifacts()` on all markdown bodies, callouts, and FAQs. If raw artifacts bypass Layer 1, Gate 3 blocks ingestion with `SECURITY_VIOLATION: Unsanitized external AI citation artifacts detected`. |
| **Layer 3: Compilation Sanitization** | `AdminExamKnowledgeService.compileExamDocVersion` | Re-sanitizes the AST and raw markdown payload prior to compiling the final React MDX artifact, ensuring clean AST structures. |
| **Layer 4: Immutable Revision Publishing** | `AdminExamKnowledgeService.publishExamDocVersion` | Never mutates live rows directly. Revisions are created as new versions (`v(N+1)`), reviewed, compiled, and published via atomic pointer swap, preserving historical auditability. |
| **Layer 5: Candidate Parity Renderer Guard** | `ExamMdxArticleRenderer` | Final runtime defense-in-depth safeguard before markdown-to-AST tokenization (canonical content artifacts are already sanitized and verified prior to publication). |

---

## 4. Provenance Integrity vs Provider Presentation Syntax

Courage Library enforces a strict conceptual and architectural boundary:
- **Provider Presentation Syntax** (`:contentReference[oaicite:N]{index=N}`, `[oaicite:N]`, `【N†source】`, `[cite:N]`): Ephemeral presentation tokens emitted by proprietary LLM web-search interfaces. These are non-standard, unverified strings that must be stripped.
- **Canonical Provenance Model** (`exam_sources`, `officialSources`, issuing authorities, gazette publication dates, verified URLs): Real-world, legally accountable evidence cited in the structured document specification and rendered prominently in the candidate-facing `Official Sources & Evidence` panel.

