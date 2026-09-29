# 12 — COMPUTERIZED ADAPTIVE TESTING (CAT) ENGINE

> **DOCUMENTATION CLASSIFICATION:** Psychometric Item Selection & Adaptive Runtime Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phases 4A–4D.7 Certified)  
> **SYSTEM LAYER:** Adaptive Psychometric Engine  

---

## 1. What is it?
The **Computerized Adaptive Testing (CAT) Engine** dynamically customizes the difficulty of an examination session in real-time based on the candidate’s estimated latent ability trait ($\theta$) using Item Response Theory (1PL / Rasch Model) and Maximum Fisher Information item selection.

## 2. Why does it exist?
Fixed-form linear tests present the same sequence of questions regardless of candidate ability:
- High-ability candidates waste time answering trivial questions with zero diagnostic value.
- Low-ability candidates experience frustration answering excessively hard questions.
- A CAT engine dynamically zeroes in on a candidate's true ability level ($\theta \in [-3.0, +3.0]$) in far fewer questions with high measurement precision.

---

## 3. Mathematical Architecture: 1PL / Rasch Model

### 1. Item Characteristic Probability Function:
$$P(\text{correct} \mid \theta, b) = \frac{1}{1 + e^{-(\theta - b)}}$$

where:
- $\theta$: Candidate latent ability score (initialized at $\theta_0 = 0.0$).
- $b$: Calibrated item difficulty parameter (bounded in $[-3.0, +3.0]$).

### 2. Fisher Information Function:
$$I_i(\theta) = P_i(\theta) \cdot (1 - P_i(\theta))$$
- **Maximum Information**: Occurs precisely when $\theta = b_i$, where $P_i = 0.5$ and $I_i = 0.25$.

### 3. Ability Estimation Update (EAP / Newton-Raphson):
After candidate submits response $X_k \in \{0, 1\}$ on item $k$:
$$\theta_{k+1} = \theta_k + \frac{X_k - P(\theta_k, b_k)}{\sum_{j=1}^k I_j(\theta_k) + \lambda}$$
where $\lambda = 0.05$ is a Bayesian regularization ridge parameter preventing divergence on small item counts.

### 4. Stopping Rules:
A CAT session terminates when either:
1. **Target Precision Reached**: Standard Error of ability $\text{SE}(\theta) = \frac{1}{\sqrt{\sum I_i(\theta)}} \le 0.30$.
2. **Maximum Question Cap**: Candidate reaches maximum test length (e.g. 30 questions).
3. **Minimum Question Floor**: Candidate must answer at least 15 questions before early termination is evaluated.

---

## 4. Strict Population Isolation Invariant

```
====================================================================================================
               POP_ADAPTIVE_CAT STRICT QUARANTINE FROM LINEAR RELIABILITY
====================================================================================================
In a classical fixed mock test, every candidate receives the same questions under the same conditions.
In a CAT test, question presentation is deliberately biased toward the candidate's real-time ability.

Therefore:
1. CAT response data (POP_ADAPTIVE_CAT) must NEVER be mixed into classical Cronbach's Alpha calculations.
2. CAT response data must NEVER be mixed into classical point-biserial discrimination formulas.
3. CAT ability scores (theta) must NEVER be directly ranked on the same leaderboard as fixed raw scores.
====================================================================================================
```

---

## 5. What Must Never Happen
- A CAT engine must **never** select an uncalibrated question (`state = 'UNCALIBRATED'`).
- The system must **never** mix CAT attempts into classical fixed-mock ranking or norm-referenced scorecards.
