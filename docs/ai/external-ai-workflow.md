# External AI Workflow & Execution Guide
**Human-in-the-Loop Operational Guide for Authoring with ChatGPT, Claude, Gemini & Perplexity**

---

## 1. Operational Workflow

```
[ADMIN: EXAM KNOWLEDGE STUDIO]
1. Select Target Exam + Cycle + Module
2. Click "Generate Authoritative Prompt"
3. Click "Copy Prompt" (Copies complete 16-section master prompt with SHA-256 hash)
   ↓
[EXTERNAL AI PLATFORM: ChatGPT / Claude / Gemini / Perplexity / DeepSeek]
4. Paste prompt into model context
5. Model conducts research, verifies official sources, and emits structured JSON spec in ```json ... ```
   ↓
[ADMIN: EXAM KNOWLEDGE STUDIO]
6. Click "Import External AI Response"
7. Paste raw JSON / markdown response into Import Modal
8. System strips code fences, checks idempotency hash, runs 5-Gate Validator
   ↓
[RESULT]
- If Gate Blocked: Returns detailed error message (e.g. TARGET_MISMATCH, SECURITY_VIOLATION)
- If Valid: Ingests as quarantined AI_GENERATED draft version ready for Academic Review
```

---

## 2. Best Practices by Model Provider

- **Claude 3.5 Sonnet / Opus (Anthropic)**: Excellent compliance with complex schema constraints, 4-tier source hierarchies, and canonical taxonomy rules.
- **ChatGPT GPT-4o (OpenAI)**: Strong reasoning across multi-tier exam patterns, tabular structuring, and mathematical negative marking explanations.
- **Perplexity / Gemini 1.5 Pro**: Exceptional for live primary notification retrieval, gazette circular URLs, and active cycle date confirmation.
