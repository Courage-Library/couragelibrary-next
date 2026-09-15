# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 40: EXTENSION GUIDELINES FOR NEW DEVELOPERS

---

## 1. Safe Extension Protocols

When adding new features to Courage Library that interact with the Mistake Vault:

1. **Adding a New Assessment Source**:
   - Add the new literal to `RawSourceContext` in `types/mistake-longitudinal-intelligence.ts`.
   - Update the CHECK constraint in `user_mistake_occurrences.source_context`.
   - Add mapping logic to `classifySourceToProductCategory()`.
2. **Never Mutate Certified Formulas**:
   - If a new prioritization dimension is required, introduce it as an external modifier rather than altering the frozen `calculateMistakePriorityIndex` baseline.
