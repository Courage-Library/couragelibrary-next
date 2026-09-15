# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 37: FROZEN CONTRACTS & NON-DRIFT POLICY

---

## 1. Authoritative List of Frozen Architecture Contracts

The following core contracts are certified and **permanently frozen against drift**:

1. **MPI Mathematical Formula**:
   $$\text{MPI} = (0.35 \cdot S_{\text{rec}}) + (0.30 \cdot S_{\text{unres}}) + (0.20 \cdot S_{\text{recency}}) + (0.15 \cdot S_{\text{mastery\_gap}})$$
2. **Revision Priority Formula**:
   $$\text{Revision Priority} = (0.70 \cdot \text{MPI}) + (0.15 \cdot \text{dueUrgency}) + B_{\text{content}} - P_{\text{fatigue}}$$
3. **Error Decay Heuristic**:
   $$R(t) = \exp\left( -\frac{t}{S \cdot (1 + \mu \cdot C_{\text{effective}})} \right)$$
4. **Canonical 7-Type Cognitive Taxonomy**: `CONCEPTUAL_GAP`, `CALCULATION_SLIP`, `MISREAD_QUESTION`, `TIME_PANIC`, `FORMULA_CONFUSION`, `DISTRACTOR_TRAP`, `UNCLASSIFIED`.
5. **Sample-Size Safety Thresholds**: Topics ($N \ge 3$), Subjects ($N \ge 5$), Contexts ($N \ge 3$), Trajectories ($N \ge 3$).
6. **Canonical Trajectory Enum**: `IMPROVING`, `PERSISTENT`, `STABLE`, `VOLATILE`, `DECLINING` (Strictly NO `DETERIORATING`).
