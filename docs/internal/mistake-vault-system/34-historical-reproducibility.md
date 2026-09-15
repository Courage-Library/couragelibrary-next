# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 34: HISTORICAL REPRODUCIBILITY & EVENT REPLAY

---

## 1. Deterministic Event Sourcing Guarantees

Because every error is captured as an immutable event in `user_mistake_occurrences`, any candidate's historical state can be deterministically replayed and verified at any point in time.

```mermaid
flowchart LR
    LEDGER[(user_mistake_occurrences)]
    REPLAY[Replay Engine / fn_recompute_mistake_profile]
    RECON[Reconstructed State at Time T]

    LEDGER -->|Filter by occurred_at <= T| REPLAY
    REPLAY --> RECON
```

---

## 2. Replay Invariant Verification

- Given an identical ordered sequence of `ACTIVE` mistake occurrences and drill completions, the state recomputation produces **exact mathematical parity** with the live `user_mistake_vault` row.
- Soft errata revocations alter future state computations without destroying the historical record of when the candidate originally slipped.
