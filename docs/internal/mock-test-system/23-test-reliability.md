# 23 — SECTION & TEST RELIABILITY ENGINE

> **DOCUMENTATION CLASSIFICATION:** Psychometric Reliability & Measurement Error Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phase 5E.6.6 Certified)  
> **SYSTEM LAYER:** Test-Level Reliability Engine  

---

## 1. What is it?
The **Section & Test Reliability Engine** computes test-level and section-level internal consistency metrics (**Cronbach's Alpha $\alpha$**) and the **Test Standard Error of Measurement ($\text{TEST\_SEM}$)** across completed candidate response matrices, enforcing strict data-sufficiency safeguards, population isolation, and McDonald's Omega quarantine.

## 2. Mathematical Formulation: Cronbach's Alpha ($\alpha$)

### Classical Formula:
$$\alpha = \frac{K}{K - 1} \left(1 - \frac{\sum_{i=1}^K \sigma_i^2}{\sigma_T^2}\right)$$

where:
- $K$: Number of test items ($K \ge 3$ required).
- $N$: Number of complete candidate cases ($N \ge 30$ required).
- $X_{N \times K}$: Binary response matrix ($X_{ji} \in \{0, 1\}$).
- $T_j = \sum_{i=1}^K X_{ji}$: Binary total score for candidate $j$.
- $\sigma_T^2 = \frac{1}{N - 1} \sum_{j=1}^N (T_j - \bar{T})^2$: Sample variance of total binary test score.
- $\sigma_i^2 = \frac{N}{N - 1} p_i (1 - p_i)$: Sample variance of binary item $i$.

---

## 3. Test Standard Error of Measurement ($\text{TEST\_SEM}$)

$$\text{TEST\_SEM} = \sigma_{\text{test}} \cdot \sqrt{\max(0, 1 - \alpha)}$$

where:
- $\sigma_{\text{test}}$: Sample standard deviation of the **authoritative evaluated net score** (accounting for $+M_{\text{correct}}$ and $-M_{\text{penalty}}$).
- $\alpha$: Test-level Cronbach's Alpha.

```
+----------------------------------------------------------------------------------------------------+
|               CRITICAL TERMINOLOGY DISTINCTION: TEST SEM vs ITEM INFORMATION SE                    |
+----------------------------------------------------------------------------------------------------+
| DIMENSION         | TEST_SEM (Phase 5E.6.6)           | CONDITIONAL_ITEM_INFORMATION_SE (5E.6.5)   |
+-------------------+-----------------------------------+--------------------------------------------+
| Formula           | sigma_test * sqrt(1 - alpha)      | 1 / sqrt(I(theta)) = 1 / sqrt(P(1 - P))    |
| Measurement Space | Aggregate Test Mark Scale (0-200M)| Latent Rasch Ability Trait Scale (-3 to +3)|
| Scope             | Entire Test / Section             | Single Item at Ability Level theta         |
| Consumer          | Score Confidence Band             | Item Quality & CAT Selection Optimization  |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Worked Numerical Example: 5-Item, 30-Candidate Test

- $K = 5$ items, $N = 30$ candidates.
- $\sum_{i=1}^5 \sigma_i^2 = 1.1500$.
- Total score variance $\sigma_T^2 = 3.8500$.
- Authoritative score standard deviation $\sigma_{\text{test}} = 12.0$ marks.

### Step 1: Calculate Cronbach's Alpha
$$\alpha = \frac{5}{5 - 1} \left(1 - \frac{1.1500}{3.8500}\right) = 1.25 \times (1 - 0.2987) = 1.25 \times 0.7013 = \mathbf{0.8766}$$

### Step 2: Calculate Test SEM
$$\text{TEST\_SEM} = 12.0 \times \sqrt{1 - 0.8766} = 12.0 \times \sqrt{0.1234} = 12.0 \times 0.3513 = \mathbf{4.2154} \text{ marks}$$

---

## 5. McDonald's Omega Quarantine
McDonald's Omega ($\omega$) is explicitly **QUARANTINED** as `EXPERIMENTAL_RESEARCH`. In Phase 5E.6.6:
- `mcdonaldOmegaResearch = null`.
- `omegaStatus = 'EXPERIMENTAL_RESEARCH'`.
- It is never exposed as an authoritative metric to candidates or admins.

---

## 6. What Must Never Happen
- Cronbach's Alpha must **never** be computed with $K < 3$ (returns `NOT_APPLICABLE`) or $N < 30$ (returns `INSUFFICIENT_DATA`).
- Negative alpha ($\alpha < 0$) must **never** crash the system or be silently truncated to 0; it is preserved as diagnostic evidence with the `NEGATIVE_ALPHA` flag.
