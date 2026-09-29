# External AI Workflow & Execution Guide
**Human-in-the-Loop Operational Guide for Authoring with ChatGPT, Claude, Gemini & Perplexity**

---

## 1. Trust Model & Execution Workflow

Courage Library operates on a **Zero-Trust External AI Architecture**. External models (ChatGPT, Claude, Gemini, Perplexity) act as research assistants and draft authors, but possess zero publication authority.

```
[ADMIN: EXAM KNOWLEDGE STUDIO]
1. Select Target Exam + Cycle + Module
2. Click "Generate Authoritative Prompt"
3. Click "Copy Prompt" (Copies complete 16-section master prompt with SHA-256 hash)
   ↓
[EXTERNAL AI PLATFORM: ChatGPT / Claude / Gemini / Perplexity / DeepSeek]
4. Paste prompt into model context (attach official gazette PDF if available)
5. Model conducts research, verifies official sources, and emits structured JSON spec in ```json ... ```
   ↓
[ADMIN: EXAM KNOWLEDGE STUDIO]
6. Click "Import External AI Response"
7. Paste raw JSON / markdown response into Import Modal
8. System executes Pipeline Sanitization:
   a. Strips markdown code fences
   b. Normalizes External AI Citation Artifacts (e.g., :contentReference[oaicite:N]{index=N}, 【N†source】)
   c. Validates SHA-256 Context Hash & Target Target Mappings
   d. Runs Automated 5-Gate Validator (Gate 1: Schema, Gate 2: Target, Gate 3: Security & Artifacts, Gate 4: Sources, Gate 5: Domain)
   ↓
[RESULT & REVIEW]
- If Gate Blocked: Rejects payload with explicit diagnostic error (e.g. SECURITY_VIOLATION, CITATION_ARTIFACT_DETECTED)
- If Valid: Ingests as quarantined AI_GENERATED draft version ready for Human Academic Review
```

---

## 2. Provider-Specific Citation Artifact Handling

External AI providers frequently inject proprietary citation tokens into generated text when web browsing or document search is enabled:
- **OpenAI / ChatGPT**: `:contentReference[oaicite:0]{index=0}`, `[oaicite:1]`, `【4†source】`
- **Claude / Anthropic**: `[cite: 1]`, `[source: 2]`, footnote citation tags
- **Perplexity**: `[1]`, `[2]`, `[web: 1]` anchor references
- **Gemini / Google**: `[cite:1]`, `[citation:1]` inline tokens

### Crucial Distinction: Provider Syntax vs Canonical Provenance
- **Provider Presentation Syntax** (`:contentReference[oaicite:0]{index=0}`): Ephemeral provider UI artifacts that must be stripped/normalized during ingestion to prevent candidate-facing pollution.
- **Courage Library Source Provenance** (`exam_sources`, `officialSources`, verified URLs, issuing authorities): Canonical, permanent academic citations rendered in the candidate `Official Sources & Evidence` panel.

---

## 3. Best Practices by Model Provider

- **Claude 3.5 Sonnet / Opus (Anthropic)**: Exceptional compliance with strict JSON schemas, 4-tier source hierarchies, and canonical curriculum taxonomy.
- **ChatGPT GPT-4o / o1 (OpenAI)**: Strong reasoning across multi-tier exam patterns, tabular structuring, and mathematical negative marking calculations.
- **Perplexity / Gemini 1.5 Pro**: Exceptional for live primary notification retrieval, gazette circular URLs, and active cycle date confirmation.

---

## 4. Operational Limitation & Extension Rule

The sanitizer regex suite normalizes currently identified and supported external-AI/provider-specific citation artifact patterns. If an external AI provider introduces a novel citation syntax pattern in the future, add the pattern to `services/ai/ai-citation-sanitizer.ts` and add a corresponding test case to `scripts/test_phase3k16_citation_sanitization.cjs`.

