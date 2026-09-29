# AI Safety & Publication Boundary Specification
**Authoritative Security Perimeter, Threat Model & Untrusted Input Quarantine Architecture**

---

## 1. The Untrusted Input Boundary

External AI outputs are permanently classified as **Untrusted Candidate Input**. The platform enforces a zero-trust publication boundary:

```
                      EXTERNAL AI OUTPUT (UNTRUSTED)
                                    │
                                    ▼
                      [FIVE-GATE INGESTION VALIDATOR]
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
                                    (Reviewer verifies AST)
                                               │
                                               ▼
                                    [MDX COMPILATION GATE]
                                    (Static security scan)
                                               │
                                               ▼
                                    [ATOMIC PUBLICATION]
```

---

## 2. Threat Vector Mitigations

1. **Prompt Injection & Control Override**: Database context values and existing claims are HTML-escaped (`&lt;`, `&gt;`) before prompt assembly. The prompt establishes strict XML delimiters separating instructions from data.
2. **Cross-Site Scripting (XSS) via Markdown**: `MdxSecurityScanner` scans all markdown bodies, callout text, FAQs, and metadata strings, blocking `<script>`, `<iframe>`, `javascript:`, `onerror=`, `onload=`, and raw DOM event handlers.
3. **URL Scheme Injection**: Gate 4 strictly rejects non-HTTP/HTTPS protocols (e.g. `data:`, `file:`, `blob:`).
4. **Taxonomy Tampering**: Gate 5 validates that canonical subjects, topics, and post names reference registered database entities.
5. **Accidental Self-Publishing**: The importer service hardcodes `is_published = false` and `review_status = 'AI_GENERATED'` on all ingested drafts. There is no API route or parameter allowing external AI payloads to set `is_published = true`.
