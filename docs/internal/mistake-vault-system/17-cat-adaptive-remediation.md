# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 17: CAT & ADAPTIVE REMEDIATION INTEGRATION

---

## 1. The CAT Remediation Boundary

Computerized Adaptive Testing (CAT) policies dynamically tailor question difficulty during assessment and practice.

```
┌─────────────────────────────────────────────────────────────┐
│                 CAT REMEDIATION BOUNDARY                    │
├──────────────────────────────┬──────────────────────────────┤
│  CAT Engine Responsibilities │ Mistake Vault Boundaries     │
├──────────────────────────────┼──────────────────────────────┤
│  - Selects optimal item      │  - Pure candidate consumer   │
│    difficulty (θ-matching)   │  - Unaffected by CAT θ       │
│  - Targets weak cognitive    │  - Sacred 2-consecutive rule │
│    dimensions                │    remains inviolable        │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 2. Invariant Protection

1. **Zero Mastery Mutation**: CAT ability estimates ($\theta$) **never** alter Mistake Vault mastery status or streak counts.
2. **Deterministic Selection**: CAT utilizes Mistake Vault MPI and Decay scores purely as input weights for remediation candidate selection.
