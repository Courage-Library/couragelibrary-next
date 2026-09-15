# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 14: RELAPSE DETECTION & RE-INGESTION

---

## 1. Relapse Definition & Mechanics

A **Relapse** occurs when a candidate answers incorrectly on a question that had previously achieved **`MASTERED`** status.

```mermaid
sequenceDiagram
    participant Exam as Mock Test / Practice Engine
    participant RPC as fn_record_mistake_occurrence
    participant Vault as user_mistake_vault
    participant Ledger as user_mistake_occurrences

    Exam->>RPC: Ingest Mistake for Mastered Question
    RPC->>Vault: Check current status == 'MASTERED'
    Note over Vault: Relapse Detected!
    RPC->>Vault: Set status = 'REVISITING', streak = 0, last_mistake_at = now()
    RPC->>Ledger: Append ACTIVE Occurrence
    RPC-->>Exam: Return status 'REVISITING'
```

---

## 2. Relapse Re-Ingestion Rules

1. **State Demotion**: The vault profile transitions from `MASTERED` to `REVISITING`.
2. **Streak Reset**: `consecutive_correct_in_remediation` is reset to **0**.
3. **Mastery History Preserved**: The original `mastered_at` timestamp is retained for longitudinal analytics to calculate the candidate's exact **relapse latency** ($t_{\text{relapse}} = \text{occurred\_at} - \text{mastered\_at}$).
4. **Elevated Urgency**: Relapsed items immediately receive higher priority in revision feeds.
