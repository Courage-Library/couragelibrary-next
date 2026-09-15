# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 35: DATA QUALITY & INTEGRITY GATES

---

## 1. Database Integrity Constraints

Courage Library enforces data correctness at the PostgreSQL storage engine level:

1. **Check Constraints**:
   - `total_mistakes_count >= 0`
   - `consecutive_correct_in_remediation >= 0`
   - `lifecycle_status IN ('UNRESOLVED', 'REVISITING', 'MASTERED')`
   - `heuristic_confidence_pct BETWEEN 0 AND 100`
   - `total_questions BETWEEN 1 AND 50` (Drills)
2. **Foreign Key Guarantees**:
   - All vault and drill records reference valid `auth.users(id)` with cascading deletes.
   - All occurrences reference valid `question_versions(id)` with `ON DELETE RESTRICT` to prevent accidental loss of content history.
