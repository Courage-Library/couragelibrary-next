# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 38: EXPLICIT NON-GOALS & BOUNDARIES

---

## 1. Explicit Architectural Non-Goals

To maintain architectural focus and prevent scope creep, the following capabilities are explicitly declared as **Non-Goals** for the Mistake Vault:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPLICIT NON-GOALS                              │
├────────────────────────────────────────────────────────────────────────┤
│  1. NOT a Proctoring / Anti-Cheat Engine:                              │
│     Telemetry is captured for cognitive diagnosis, not fraud detection.│
│                                                                        │
│  2. NOT a General Gradebook / Test Scorer:                             │
│     The vault does not calculate total exam scores or percentile ranks.│
│     It operates exclusively on the set of incorrect question attempts. │
│                                                                        │
│  3. NOT an Unbounded Stochastic / Generative Black Box:                │
│     Revision scheduling and MPI calculations are 100% deterministic    │
│     and reproducible without LLM hallucination risk.                   │
│                                                                        │
│  4. NOT a Social Comparison / Public Leaderboard:                      │
│     Mistake data is deeply personal and is strictly isolated per user. │
└────────────────────────────────────────────────────────────────────────┘
```
