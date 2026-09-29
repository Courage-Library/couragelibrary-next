# Appendix C — Complete Mathematical & Psychometric Formula Reference

This appendix provides the definitive mathematical formulations, variable definitions, boundary constraints, and worked examples for all algorithms in the Courage Library Assessment Engine.

---

## 1. Authoritative Scoring & Accuracy

### Raw Score Formula
$$\text{RawScore} = \left( \sum_{i \in \text{Correct}} M_{\text{correct}}(i) \right) - \left( \sum_{j \in \text{Incorrect}} M_{\text{penalty}}(j) \right)$$

### Accuracy Percentage (Omissions Strictly Excluded)
$$\text{Accuracy} = \begin{cases} 
0.0\% & \text{if } N_{\text{correct}} + N_{\text{incorrect}} = 0 \\
\left( \frac{N_{\text{correct}}}{N_{\text{correct}} + N_{\text{incorrect}}} \right) \times 100 & \text{otherwise}
\end{cases}$$

---

## 2. Classical Test Theory (CTT) Parameters

### Facility Index ($p$-value / Item Difficulty)
$$p_i = \frac{N_{\text{correct}}(i)}{N_{\text{total}}}$$
- **Interpretation**: $p \in [0.0, 1.0]$. Values $> 0.80$ indicate easy items; $< 0.30$ indicate difficult items.

### Corrected Point-Biserial Discrimination ($r_{\text{pbis}}$)
To eliminate spurious self-correlation between item $i$ and total score, the criterion score $Y_{(i)}$ strictly excludes item $i$:

$$Y_{(i)} = Y_{\text{total}} - Y_i$$

$$r_{\text{pbis}}(i) = \frac{\bar{Y}_{(i), \text{correct}} - \bar{Y}_{(i), \text{incorrect}}}{s_{Y_{(i)}}} \sqrt{\frac{N_{\text{correct}} \cdot N_{\text{incorrect}}}{N_{\text{total}}(N_{\text{total}} - 1)}}$$

Where:
- $\bar{Y}_{(i), \text{correct}}$: Mean rest-score of candidates who answered item $i$ correctly.
- $\bar{Y}_{(i), \text{incorrect}}$: Mean rest-score of candidates who answered item $i$ incorrectly.
- $s_{Y_{(i)}}$: Sample standard deviation of the rest-scores.

---

## 3. Distractor Point-Biserial Correlation ($r_{\text{dist}}(k)$)

For option $k \in \{A, B, C, D\}$, let indicator $X_k \in \{0, 1\}$ denote whether the candidate selected option $k$. Distractor discrimination is the exact Pearson correlation:

$$r_{\text{dist}}(k) = \text{Corr}(X_k, Y_{(i)}) = \frac{\sum_{n=1}^N (X_{nk} - \bar{X}_k)(Y_{n(i)} - \bar{Y}_{(i)})}{\sqrt{\sum_{n=1}^N (X_{nk} - \bar{X}_k)^2 \sum_{n=1}^N (Y_{n(i)} - \bar{Y}_{(i)})^2}}$$

### Classification Standard:
- **Functional Distractor**: $r_{\text{dist}}(k) \le -0.10$ and selection frequency $\ge 5\%$.
- **Flawed / Attractive Distractor**: $r_{\text{dist}}(k) > +0.05$ (Higher-ability candidates are erroneously selecting this option).

---

## 4. 1PL / Rasch Item Response Theory

### Probability of Correct Response (Rasch Model)
$$P_i(\theta) = \frac{1}{1 + e^{-(\theta - b_i)}} = \frac{e^{\theta - b_i}}{1 + e^{\theta - b_i}}$$

### Item Information Function ($I_i(\theta)$)
$$I_i(\theta) = P_i(\theta) \cdot Q_i(\theta) = P_i(\theta)(1 - P_i(\theta)) = \frac{e^{\theta - b_i}}{(1 + e^{\theta - b_i})^2}$$
- **Maximum Value**: $\max I_i(\theta) = 0.25$ occurs at $\theta = b_i$.

### Total Test Information Function
$$I_{\text{test}}(\theta) = \sum_{i=1}^K I_i(\theta)$$

### Conditional Latent Ability Standard Error
$$SE(\hat{\theta}) = \frac{1}{\sqrt{I_{\text{test}}(\hat{\theta})}} = \frac{1}{\sqrt{\sum_{i=1}^K P_i(\hat{\theta})(1 - P_i(\hat{\theta}))}}$$

---

## 5. Joint Maximum Likelihood Estimation (JMLE Newton-Raphson)

The update equation for estimating item difficulty $b_i$ from candidate responses $u_{ni} \in \{0, 1\}$:

$$b_i^{(t+1)} = b_i^{(t)} - \frac{\sum_{n=1}^N (u_{ni} - P_i(\theta_n^{(t)}))}{-\sum_{n=1}^N P_i(\theta_n^{(t)})(1 - P_i(\theta_n^{(t)}))}$$

---

## 6. Test & Section Reliability

### Cronbach's Alpha ($\alpha$)
$$\alpha = \frac{K}{K - 1} \left( 1 - \frac{\sum_{i=1}^K s_i^2}{s_X^2} \right)$$
Where:
- $K$: Number of items ($K \ge 2$).
- $s_i^2$: Sample variance of scores on item $i$.
- $s_X^2$: Sample variance of the total composite test scores.

### Classical Test Standard Error of Measurement ($\text{SEM}_{\text{test}}$)
$$\text{SEM}_{\text{test}} = s_X \sqrt{1 - \alpha}$$

---

## 7. Ranking & Continuous Percentile

### Continuous Percentile Formula
$$\text{Percentile} = \left( \frac{N_{\text{below}} + (0.5 \times N_{\text{equal}})}{N_{\text{total}}} \right) \times 100$$
Where:
- $N_{\text{below}}$: Number of candidates with raw score strictly less than candidate's score.
- $N_{\text{equal}}$: Number of candidates with raw score equal to candidate's score.
- $N_{\text{total}}$: Total candidate cohort size.
