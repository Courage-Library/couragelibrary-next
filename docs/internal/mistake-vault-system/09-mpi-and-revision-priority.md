# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 09: MISTAKE PRIORITY INDEX (MPI) & REVISION PRIORITY

---

## 1. Mistake Priority Index (MPI) Definition

The **Mistake Priority Index (MPI)** is a deterministic mathematical heuristic ($0.0000 le 	ext{MPI} le 1.0000$) implemented in `services/mistake.service.ts` that quantifies the intrinsic severity of a candidate's mistake based on recurrence, lifecycle status, temporal recency, and current remediation mastery gap.

$$\text{MPI} = (0.35 \cdot S_{\text{rec}}) + (0.30 \cdot S_{\text{unres}}) + (0.20 \cdot S_{\text{recency}}) + (0.15 \cdot S_{\text{mastery\_gap}})$$

---

## 2. Canonical Sub-Score Components

| Component | Code Variable | Formula | Domain Range | Pedagogical Purpose |
|---|---|---|---|---|
| **Recurrence Score** | `recurrenceScore` | $\min\left(\frac{\text{total\_mistakes\_count}}{5.0}, 1.0\right)$ | $[0.0, 1.0]$ | Penalizes chronic, repeat errors across multiple tests. |
| **Unresolved Score** | `unresolvedScore` | $\begin{cases} 1.0 & \text{if } \text{status} = \text{'UNRESOLVED'} \\ 0.5 & \text{if } \text{status} = \text{'REVISITING'} \\ 0.0 & \text{if } \text{status} = \text{'MASTERED'} \end{cases}$ | $[0.0, 1.0]$ | Prioritizes unaddressed mistakes over partially resolved items. |
| **Recency Score** | `recencyScore` | $\max\left(0, 1.0 - \frac{\text{daysSinceSlip}}{30.0}\right)$ | $[0.0, 1.0]$ | Elevates recent slips while maintaining a 30-day graceful linear fade. |
| **Mastery Gap Score** | `masteryGapScore` | $\max\left(0, \frac{2 - \text{consecutive\_correct}}{2.0}\right)$ | $[0.0, 1.0]$ | Measures proximity to the 2-consecutive correct mastery target. |

### Source Code Reference (`services/mistake.service.ts:313-327`)
```typescript
export function calculateMistakePriorityIndex(record: {
  total_mistakes_count: number;
  lifecycle_status: string;
  consecutive_correct_in_remediation: number;
  last_mistake_at: string;
}): number {
  const recurrenceScore = Math.min(record.total_mistakes_count / 5.0, 1.0);
  const unresolvedScore = record.lifecycle_status === "UNRESOLVED" ? 1.0 : record.lifecycle_status === "REVISITING" ? 0.5 : 0.0;
  const daysSinceSlip = Math.max(0, (Date.now() - new Date(record.last_mistake_at).getTime()) / (1000 * 60 * 60 * 24));
  const recencyScore = Math.max(0, 1.0 - daysSinceSlip / 30.0);
  const masteryGapScore = Math.max(0, (2 - (record.consecutive_correct_in_remediation || 0)) / 2.0);

  const mpi = (0.35 * recurrenceScore) + (0.30 * unresolvedScore) + (0.20 * recencyScore) + (0.15 * masteryGapScore);
  return Number(mpi.toFixed(4));
}
```

---

## 3. Revision Priority Definition

**Revision Priority** represents the real-time operational sorting score ($0.0000 \le \text{Priority} \le 1.0000$) used to order candidate revision queues and "Next Best Revision" recommendations. It augments the base MPI with scheduling urgency, learning content availability, and fatigue control.

$$\text{Revision Priority} = \text{clamp}\Big((0.70 \cdot \text{MPI}) + (0.15 \cdot \text{dueUrgency}) + B_{\text{content}} - P_{\text{fatigue}}, 0.0, 1.0\Big)$$

### Modifiers:
- **`dueUrgency`**: Urgency value from `calculateRevisionDueState` ($0.05$ to $1.00$).
- **$B_{\text{content}}$ (Learning Bonus)**: $+0.10$ if foundational reading or solution article is attached.
- **$P_{\text{fatigue}}$ (Fatigue Penalty)**: $-0.15$ if practiced recently (within 24 hours) to prevent redundant over-drilling.

### Source Code Reference (`services/mistake.service.ts:419-433`)
```typescript
export function calculateRevisionPriority(params: {
  mpi: number;
  dueUrgency: number;
  hasLearningContent?: boolean;
  isRecentlyDrilled?: boolean;
}): number {
  let score = (0.70 * params.mpi) + (0.15 * params.dueUrgency);
  if (params.hasLearningContent) {
    score += 0.10;
  }
  if (params.isRecentlyDrilled) {
    score -= 0.15; // Fatigue penalty
  }
  return Number(Math.max(0.0, Math.min(1.0, score)).toFixed(4));
}
```

---

## 4. Invariant Non-Drift Rules

- **MPI is NOT Mastery**: Mastery is strictly defined by the discrete state machine ($C \ge 2$).
- **MPI is NOT a Probability**: It does not represent probability of failure or Ebbinghaus retention.
- **MPI is Purely Deterministic**: Given identical timestamp and count inputs, MPI produces identical outputs across all environments.
