# 24 — CANDIDATE PERFORMANCE INTELLIGENCE & LONGITUDINAL ANALYTICS

> **DOCUMENTATION CLASSIFICATION:** Longitudinal Analytics & Candidate Mastery Engine  
> **LIFECYCLE STATUS:** Production & Frozen (Phase 5E.4 Certified)  
> **SYSTEM LAYER:** Candidate Learning Analytics  

---

## 1. What is it?
The **Candidate Performance Intelligence Engine** computes longitudinal performance trajectories across attempts, subject-wise competency scores, topic mastery matrices, time-management efficiencies, and readiness indicators using Simple Moving Averages (SMA3) and data-completeness confidence gates.

## 2. Longitudinal Metrics & Trend Formulation

### 1. 3-Attempt Simple Moving Average (SMA3):
$$\text{SMA3}_t = \frac{S_t + S_{t-1} + S_{t-2}}{3}$$

### 2. Trend Classification Policy ($N \ge 5$ Attempts Required):
- **IMPROVING**: $\text{SMA3}_{\text{current}} > \text{SMA3}_{\text{prior}} + 2.5\%$.
- **DECLINING**: $\text{SMA3}_{\text{current}} < \text{SMA3}_{\text{prior}} - 2.5\%$.
- **STABLE**: $|\text{SMA3}_{\text{current}} - \text{SMA3}_{\text{prior}}| \le 2.5\%$.
- **INSUFFICIENT_DATA**: Total completed attempts $N < 5$.

---

## 3. Topic Mastery Vector Formulation

For each topic $j$:
$$\text{Mastery}_j = \left(0.60 \times \text{Accuracy}_j\right) + \left(0.25 \times \text{SpeedScore}_j\right) + \left(0.15 \times \text{Consistency}_j\right)$$

where:
- $\text{Accuracy}_j$: Weighted accuracy on topic $j$ over the last 30 days.
- $\text{SpeedScore}_j = \min(1.0, \frac{\text{TargetTime}_j}{\text{ActualAvgTime}_j})$.
- $\text{Consistency}_j$: Standard deviation penalty of recent scores.

---

## 4. Why There is No Opaque "Courage IQ"
Courage Library deliberately **rejects opaque, proprietary IQ or readiness scores**:
- Aspirants need transparent, actionable metrics (e.g. "Your accuracy on Geometry Tangents is 42%, losing you 6 marks per paper").
- All intelligence outputs are directly explainable by raw attempt answers and time logs.

---

## 5. What Must Never Happen
- Performance intelligence must **never** predict exam selection with certainty.
- Low trend metrics must **never** restrict candidate access to any test modality.
