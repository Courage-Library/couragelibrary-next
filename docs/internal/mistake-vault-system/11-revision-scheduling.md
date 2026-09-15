# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 11: REVISION SCHEDULING & DUAL STATE ENUMS

---

## 1. Dual Scheduling Architecture

Courage Library maintains two complementary scheduling enums designed for specific presentation and filtering layers:

```
┌─────────────────────────────────────────────────────────────┐
│                    SCHEDULING LAYER                         │
├──────────────────────────────┬──────────────────────────────┤
│  Phase 4: RevisionDueState   │ Phase 6: DecayPresentation   │
│  (Action-Oriented Filtering) │ (Cognitive Memory Urgency)   │
├──────────────────────────────┼──────────────────────────────┤
│  - DUE_NOW                   │  - OVERDUE                   │
│  - HIGH_PRIORITY             │  - DUE_NOW                   │
│  - NEEDS_ATTENTION           │  - DUE_SOON                  │
│  - IMPROVING                 │  - NOT_DUE                   │
│  - MASTERED                  │  - REFRESH_DUE               │
│  - DUE_REFRESH               │                              │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 2. Phase 4 `RevisionDueState` Mapping Table

| State | Urgency ($U$) | Trigger Condition | Candidate Label |
|---|---|---|---|
| **`DUE_NOW`** | $0.70 - 1.00$ | $\text{mistakes} \ge 2$ or $t \ge 1.0\text{d}$ (Unresolved) / $t \ge 3.0\text{d}$ (Revisiting) | "Due for Revision" / "Due for 2nd Verification" |
| **`NEEDS_ATTENTION`** | $0.65$ | Recent unresolved mistake ($t < 1.0\text{d}$, 1 slip) | "Needs Attention" |
| **`IMPROVING`** | $0.40$ | Revisiting streak 1/2 within active window ($t < 3.0\text{d}$) | "Improving (Streak 1/2)" |
| **`DUE_REFRESH`** | $0.30$ | Mastered item where $\text{daysSinceMastered} \ge 14.0\text{d}$ | "Retention Refresher" |
| **`MASTERED`** | $0.05$ | Mastered item within 14-day retention window | "Mastered" |

---

## 3. Coexistence and Presentation Rules

- **Candidate Dashboard Filter**: Uses `RevisionDueState` for primary tab segregation (`All`, `Due for Revision`, `Improving`, `Mastered`).
- **Memory Card Badging**: Uses `DecayPresentationState` to display real-time memory risk badges (`OVERDUE` in red, `DUE_NOW` in amber, `DUE_SOON` in blue, `NOT_DUE` in green, `REFRESH_DUE` in purple).
