# 44 — Glossary & Mathematical Variable Index

## 1. Assessment & Psychometric Terminology

- **Classical Test Theory (CTT)**: A traditional psychometric measurement framework based on the true-score model ($X = T + E$), where candidate observed score equals true ability plus random measurement error.
- **Item Response Theory (IRT)**: A modern mathematical measurement paradigm modeling candidate response probability as a non-linear function of latent ability ($\theta$) and item characteristics (difficulty $b$, discrimination $a$, guessing $c$).
- **Rasch / 1PL Model**: A unidimensional IRT model with item discrimination fixed ($a_i = 1$) and zero pseudo-guessing ($c_i = 0$), where response probability depends solely on the difference $(\theta - b_i)$.
- **Facility Value ($p$-value)**: The proportion of candidates who answered an item correctly: $p = N_{\text{correct}} / N_{\text{total}}$. Ranges from $0.0$ (hardest) to $1.0$ (easiest).
- **Point-Biserial Discrimination ($r_{\text{pbis}}$)**: The product-moment correlation between binary performance on a focal item ($0$ or $1$) and total test score excluding the item. Measures how effectively an item differentiates high performers from low performers.
- **Distractor Point-Biserial ($r_{\text{dist}}(k)$)**: The Pearson correlation between choosing distractor $k$ and total score excluding the focal item. A healthy distractor has a negative correlation ($r_{\text{dist}} < 0$).
- **Joint Maximum Likelihood Estimation (JMLE)**: An iterative optimization algorithm (Newton-Raphson) used in 1PL Rasch calibration to estimate item difficulties ($b_i$) and person abilities ($\theta_n$) simultaneously.
- **Item Characteristic Curve (ICC)**: The S-shaped logistic curve plotting the probability of correct response $P_i(\theta)$ across candidate latent ability levels $\theta \in [-3.0, +3.0]$.
- **Item Information Function ($I_i(\theta)$)**: The mathematical measurement precision provided by an item at ability level $\theta$. In 1PL Rasch, $I_i(\theta) = P_i(\theta)(1 - P_i(\theta))$.
- **Cronbach's Alpha ($\alpha$)**: An internal consistency coefficient estimating the reliability of a composite test based on item variances and total test score variance.
- **Standard Error of Measurement ($\text{SEM}_{\text{test}}$)**: The standard deviation of errors of measurement associated with test scores: $\text{SEM} = s_X \sqrt{1 - \alpha}$.
- **McDonald's Omega ($\omega$)**: A model-based reliability estimate derived from factor analysis loadings, quarantined as experimental in Courage Library.
- **Computerized Adaptive Testing (CAT)**: An examination format where items are dynamically selected in real-time to match the estimated ability level ($\hat{\theta}$) of the candidate.

---

## 2. Platform & System Terms

- **Mistake Vault**: An intelligent revision repository that automatically captures every incorrect question answered across mock tests, tracking mastery state and error classifications.
- **CL Coins**: Virtual platform utility currency awarded for academic consistency and mock test completion, redeemable for premium test generations and features.
- **Palette State**: The five visual indicator states of a question during exam taking: *Not Visited*, *Not Answered*, *Answered*, *Marked for Review*, and *Answered & Marked for Review*.
- **Manual Next Supremacy**: The architectural rule requiring explicit candidate action to advance to the next question, preventing accidental transitions on option selection.
- **Write-Once-Read-Many (WORM)**: A database design pattern applied to `test_results` and `question_versions` ensuring immutable historical records.
- **Advisory Lock**: A PostgreSQL application-level locking primitive (`pg_advisory_xact_lock`) used to guarantee 1-attempt daily limits without table-level serialization bottlenecks.
- **Evidence Watermark**: A cryptographic SHA-256 hash computed over calibration datasets to ensure forensic reproducibility and auditability.

---

## 3. Mathematical Variable Index

| Symbol | Mathematical Meaning | Typical Domain / Range | Production Code Equivalent |
|---|---|---|---|
| $\theta$ | Candidate Latent Ability | $\mathbb{R}$, typically $[-3.0, +3.0]$ | `candidate_theta` |
| $\hat{\theta}$ | Estimated Candidate Ability | $\mathbb{R}$, typically $[-3.0, +3.0]$ | `estimated_theta` |
| $b_i$ | Item Difficulty Parameter (Rasch) | $\mathbb{R}$, typically $[-3.0, +3.0]$ | `difficulty_parameter_b` |
| $p_i$ | Classical Facility Index ($p$-value) | $[0.0, 1.0]$ | `facility_value_p` |
| $r_{\text{pbis}}$ | Corrected Point-Biserial Discrimination | $[-1.0, +1.0]$ | `point_biserial_r` |
| $r_{\text{dist}}(k)$| Distractor Discrimination for Option $k$ | $[-1.0, +1.0]$ | `distractor_point_biserial` |
| $P_i(\theta)$ | Probability of Correct Response at Ability $\theta$ | $[0.0, 1.0]$ | `probability_correct` |
| $I_i(\theta)$ | Item Information Function | $[0.0, 0.25]$ (1PL) | `item_information` |
| $I_{\text{test}}(\theta)$ | Total Test Information Function | $\sum I_i(\theta) \ge 0$ | `test_information` |
| $SE(\hat{\theta})$ | Standard Error of Ability Estimate | $\frac{1}{\sqrt{I_{\text{test}}(\hat{\theta})}} > 0$ | `theta_standard_error` |
| $\alpha$ | Cronbach's Alpha Reliability Coefficient | $[-\infty, 1.0]$, usually $[0.70, 0.95]$ | `cronbach_alpha` |
| $\text{SEM}$ | Standard Error of Measurement (Test) | $\ge 0$ | `standard_error_measurement` |
| $s_X^2$ | Total Test Score Variance | $> 0$ | `total_test_variance` |
| $s_i^2$ | Single Item Score Variance | $\ge 0$ | `item_variance` |
| $K$ | Number of Items in Test or Section | $\mathbb{Z}^+$, $K \ge 1$ | `item_count` |
| $N$ | Sample Size of Candidate Cohort | $\mathbb{Z}^+$, $N \ge 1$ | `sample_size_n` |
| $M_{\text{correct}}$| Marks Awarded for Correct Answer | $> 0$, e.g., $+2.0, +1.0$ | `correct_marks` |
| $M_{\text{penalty}}$| Marks Deducted for Incorrect Answer | $\ge 0$, e.g., $0.5, 0.25$ | `penalty_marks` |
| $\text{RTO}$ | Recovery Time Objective | Duration (e.g., $< 3\text{s}$) | `rto_target` |
| $\text{RPO}$ | Recovery Point Objective | Duration (e.g., $0\text{s}$) | `rpo_target` |
