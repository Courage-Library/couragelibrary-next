# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 31: DATABASE & SCHEMA CONTRACTS

---

## 1. Authoritative Schema Catalog

The Mistake Vault architecture is defined across 4 core tables:

1. **`mistake_cognitive_types`**: Reference table with 7 canonical types.
2. **`user_mistake_vault`**: Candidate question-level aggregate profiles.
3. **`user_mistake_occurrences`**: Immutable forensic event ledger.
4. **`user_mistake_drills`**: Interactive revision practice sessions.

---

## 2. Foreign Key & Constraint Matrix

| Source Column | Target Column | On Delete | Constraint Name |
|---|---|---|---|
| `user_mistake_vault.user_id` | `auth.users.id` | `CASCADE` | `fk_umv_user` |
| `user_mistake_vault.question_id` | `public.questions.id` | `CASCADE` | `fk_umv_question` |
| `user_mistake_occurrences.vault_id` | `user_mistake_vault.id` | `CASCADE` | `fk_umo_vault` |
| `user_mistake_occurrences.question_version_id` | `question_versions.id` | `RESTRICT` | `fk_umo_qv` |
| `user_mistake_drills.user_id` | `auth.users.id` | `CASCADE` | `fk_umd_user` |
