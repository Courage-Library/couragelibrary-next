# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 13: MASTERY VERIFICATION & RECOVERY DYNAMICS

---

## 1. The Two-Consecutive Verification Rule

In the Couragian pedagogical model, mastery is defined as proven resilience against memory decay. A single correct response during immediate review may simply reflect short-term recognition memory. 

```
[ Initial Mistake: UNRESOLVED ]
        │
        ▼ (Drill 1: Correct)
[ Verification Stage 1: REVISITING (Streak = 1) ]
        │
        ▼ (Spaced Drill 2: Correct)
[ Verified Mastery: MASTERED (Streak = 2, mastered_at = now()) ]
```

---

## 2. Mastery Transition Guarantees

- **Streak Continuity**: An incorrect attempt at any point resets `consecutive_correct_in_remediation` to **0** and reverts status to `UNRESOLVED`.
- **Temporal Separation**: The second verification must occur in a distinct drill session to prevent immediate repeated guessing.
- **Timestamp Integrity**: `mastered_at` is populated exclusively when the second consecutive correct response is committed.
