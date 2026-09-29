# Exam Knowledge Master Prompt Specification
**Authoritative 12-Pillar Prompt Specification for CL-EXAM-AUTHOR-v1.0**

---

## 1. Structure of the Master Prompt

The generated prompt comprises 16 XML-tagged sections generated deterministically by `ExamKnowledgePromptBuilder`:

1. **Header & Context Hash**: Identifies contract version (`CL-EXAM-AUTHOR-v1.0`), target exam, cycle, module, and SHA-256 hash.
2. `<COURAGE_ROLE_AND_AUTHORITY>`: Establishes the research mission and declares the authority invariant.
3. `<RESEARCH_MANDATE_AND_PHILOSOPHY>`: Enforces **`CONTEXT ≠ TRUTH`** and mandates the `RESEARCH → VERIFY → RESOLVE → AUTHOR → STRUCTURE → SELF-CHECK` workflow.
4. `<SOURCE_AUTHORITY_HIERARCHY>`: Defines the 4-tier hierarchy (Tier 1 Primary Official > Tier 2 Govt > Tier 3 Media > Tier 4 Blogs Prohibited).
5. `<OFFICIAL_URL_AND_PROVENANCE_RULES>`: Forbids fabricated URLs, mandates real official domains, bans placeholder strings in URL fields.
6. `<FRESHNESS_AND_CURRENT_CYCLE_VERIFICATION>`: Mandates target cycle verification and corrigenda checking.
7. `<CONFLICT_RESOLUTION_PROTOCOL>`: Instructions for identifying, weighing, and resolving factual discrepancies.
8. `<ANTI_LAZY_PLACEHOLDER_POLICY>`: Prohibits `TO_BE_ANNOUNCED` unless research proves the authority has genuinely not announced the fact.
9. `<EXACT_TARGET_IDENTITY>`: Exam ID, Slug, Title, Conducting Authority, Cycle ID, Year, Module Key, Language.
10. `<EXAM_CONTEXT>` & `<EXAM_CYCLE_CONTEXT>`: System metadata cleaned of synthetic fallback domains.
11. `<MODULE_SPECIFIC_RESEARCH_DIRECTIVES>`: Specific, data-driven, exam-agnostic research directives for the active module.
12. `<KNOWN_STRUCTURED_FACTS>`: Exam patterns, posts, milestone dates, vacancies, parameters.
13. `<CANONICAL_CURRICULUM_CONTEXT>`: Canonical subjects and high-yield topic bounds.
14. `<QUESTION_BANK_CONTEXT>`: Relevant PYQ references from the Question Bank.
15. `<EXISTING_SOURCES>` & `<EXISTING_VERIFIED_CLAIMS>`: Current database sources and claims.
16. `<CANONICAL_TAXONOMY_PROTECTION>`: Prohibits modifying subjects, inventing topic IDs, or renaming taxonomy entities.
17. `<CANDIDATE_FACING_QUALITY_STANDARDS>`: Clarity, depth, tabular structure, zero administrative jargon or promotional fluff.
18. `<REVISION_AND_HUMAN_EDIT_PRESERVATION>`: Directives for preserving approved content and addressing reviewer feedback.
19. `<CONTENT_BOUNDARIES>`: In-scope vs. Out-of-scope rules and the 4 canonical section types (`SUMMARY`, `DETAILED_GUIDE`, `IMPORTANT_INSTRUCTIONS`, `FAQS`).
20. `<PRE_OUTPUT_SELF_CHECKLIST>`: Mandatory 14-point internal verification checklist (A through N).
21. `<OUTPUT_JSON_SCHEMA>` & `<FINAL_OUTPUT_INSTRUCTION>`: Exact JSON schema matching `ExamKnowledgeDocumentSpec v1.0.0`.
