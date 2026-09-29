# 22 — QUESTION QUALITY PSYCHOMETRICS & 1PL ITEM CALIBRATION

> **DOCUMENTATION CLASSIFICATION:** Psychometric Theory, Item Response Theory & Calibration Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phases 5E.6.1–5E.6.5 Certified)  
> **SYSTEM LAYER:** Diagnostic Item Quality Engine  

---

## 1. What is it?
The **Question Quality Psychometrics & Item Calibration Engine** evaluates the statistical quality, difficulty, discrimination, and option attractor dynamics of every question in Courage Library using both Classical Test Theory (CTT) and Item Response Theory (IRT 1PL / Rasch Model).

## 2. Classical Item Statistics & Difficulty Formulations

### 1. Facility Index ($p$-value):
$$p = \frac{N_{\text{correct}}}{N_{\text{eligible}}}$$
where $N_{\text{eligible}} = N_{\text{correct}} + N_{\text{incorrect}}$ (or total complete attempts).
- $p \in [0.0, 1.0]$. High $p$ indicates an easy question; low $p$ indicates a difficult question.

### 2. Empirical Difficulty ($d$):
$$d = 1.0 - p$$

### 3. Standard Error of Facility:
$$\text{SE}(p) = \sqrt{\frac{p(1 - p)}{N_{\text{eligible}}}}$$

---

## 3. Corrected Point-Biserial Discrimination ($r_{pbis}$)

### Formula (Excluding Focal Item Contribution):
$$r_{pbis} = \frac{\bar{Y}_{(i), 1} - \bar{Y}_{(i), 0}}{S_{Y_{(i)}}} \cdot \sqrt{p(1 - p)}$$

where:
- $Y_{(i)} = Y_{\text{total}} - Y_i$: Candidate criterion score on the rest of the test (excluding item $i$).
- $\bar{Y}_{(i), 1}$: Mean rest-of-test score of candidates who answered item $i$ **correctly**.
- $\bar{Y}_{(i), 0}$: Mean rest-of-test score of candidates who answered item $i$ **incorrectly**.
- $S_{Y_{(i)}}$: Sample standard deviation of the rest-of-test score across all eligible candidates.
- $p$: Facility index of item $i$.

### Distractor Point-Biserial ($r_{\text{dist}}(k)$):
For each distractor option $k \in \{A, B, C, D\}$ (where $k \ne \text{correct}$):
$$r_{\text{dist}}(k) = \frac{\bar{Y}_{(i), k} - \bar{Y}_{(i), \neg k}}{S_{Y_{(i)}}} \cdot \sqrt{f(k)(1 - f(k))}$$
- **Healthy Distractor**: $r_{\text{dist}}(k) < 0.0$ (lower-scoring candidates select it).
- **Positive Distractor Flag**: $r_{\text{dist}}(k) > +0.05$ (indicates high scorers are trapped, suggesting ambiguity or trick wording).
- **Non-Functioning Distractor**: Selection proportion $f(k) < 0.03$ (fewer than 3% candidates choose it).

---

## 4. 1PL / Rasch Item Difficulty Calibration Engine

```
====================================================================================================
                        1PL / RASCH MATHEMATICAL SPECIFICATION
====================================================================================================

Item Response Probability:
   P(correct | theta, b) = 1 / (1 + exp(-(theta - b)))

1. PROX Initialization:
   b_0 = ln((1 - p) / p) = -logit(p)

2. Alternating Joint Maximum Likelihood Estimation (JMLE):
   In each iteration t:
   a. Calculate expected correct responses for item i: E_i = sum_j P(theta_j^(t), b_i^(t))
   b. Calculate item information sum: W_i = sum_j P_ij * (1 - P_ij)
   c. Delta update with lambda=0.05 ridge regularization:
      Delta_b_i = (E_i - R_i) / (W_i + lambda)
   d. Zero-mean centering: b_i^(t+1) = (b_i^(t) + Delta_b_i) - mean(Delta_b)

3. Convergence Criteria:
   Terminate when max(|Delta_b_i|) < 0.005 OR iterations reached 50.
====================================================================================================
```

---

## 5. Item Information Function & 61-Point ICC Grid

### Fisher Item Information Function (IIF):
$$I(\theta) = P(\theta, b) \cdot (1 - P(\theta, b)) \le 0.25$$
$$\text{Normalized Information } I_{\text{norm}}(\theta) = \frac{I(\theta)}{0.25} = 4 P(1 - P) \le 1.0$$
$$\text{CONDITIONAL\_ITEM\_INFORMATION\_SE} = \frac{1}{\sqrt{I(\theta)}} = \frac{1}{\sqrt{P(1-P)}}$$

### Deterministic 61-Point ICC Evaluation Grid:
- **Grid Range**: $\theta \in [-3.0, +3.0]$ with uniform step $\Delta\theta = 0.1$.
- Generates 61 deterministic coordinate points for administrative visualization.

---

## 6. What Must Never Happen
- Calibration must **never** mix `POP_ADAPTIVE_CAT` data into linear 1PL Rasch calibration.
- Negative discrimination flags must **never** automatically delete questions without human review.
