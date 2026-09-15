# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 23: ERRATA & SOFT EVIDENCE REVOCATION

---

## 1. The Soft Revocation Pattern

When an administrative errata correction occurs (e.g., Question #104's official key is corrected from Option B to Option C), deleting historical candidate records would destroy analytical auditability.

Courage Library implements the **Soft Revocation Pattern** via `fn_revoke_mistakes_by_errata`:

```mermaid
flowchart TD
    ERRATA[Admin Updates Question Answer Key]
    TRIGGER[Invoke fn_revoke_mistakes_by_errata]
    FIND[Find Occurrences with question_version_id & corrected_option_id]
    UPDATE[Set occurrence_status = 'REVOKED_ERRATA', revoked_at = now()]
    RECOMP[Invoke fn_recompute_mistake_profile for Affected Candidates]
    VAULT[Candidate Vault Profile Updated / Restored to MASTERED]

    ERRATA --> TRIGGER
    TRIGGER --> FIND
    FIND --> UPDATE
    UPDATE --> RECOMP
    RECOMP --> VAULT
```

---

## 2. Invalidation Mechanics

1. **Zero Row Deletion**: Physical rows in `user_mistake_occurrences` are **never** deleted.
2. **Audit Timestamping**: The `revoked_at` and `revocation_reason` fields permanently record the administrative action.
3. **Automatic Profile Restoration**: If all occurrences for a question are revoked, the candidate's profile is neutralized to `MASTERED` with 0 active errors.
