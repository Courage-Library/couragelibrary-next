# 18 — AUTHORITATIVE SCORING ENGINE & MARKING SCHEMES

> **DOCUMENTATION CLASSIFICATION:** Mathematical Scoring & Evaluation Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Authoritative Evaluation Core  

---

## 1. What is it?
The **Authoritative Scoring Engine** is the deterministic, server-executed evaluation layer that computes a candidate's final net marks, positive score, negative penalty deduction, section-wise marks, accuracy percentage, and omission metrics based on the test blueprint's marking scheme.

## 2. Why does it exist?
Accurate, tamper-proof scoring is the fundamental trust foundation of Courage Library. 
- A client-side score calculation is vulnerable to inspection, tampering, or network manipulation.
- Downstream systems (Rasch calibration, Cronbach Alpha, CL Coin settlements, Live Leaderboards) rely on the Authoritative Scorer as the **single source of scoring truth**.
- Crucially, **psychometrics must never replace authoritative scoring**: classical Rasch ability $\theta$ is a diagnostic construct; the candidate's admission and ranking are governed solely by their authoritative net score.

---

## 3. Mathematical Scoring Formulations

### 1. Item-Level Scoring Function:
For each question $i \in \{1, 2, \dots, K\}$:
$$S_i = \begin{cases} 
+M_{\text{correct}} & \text{if candidate selected the correct option} \\ 
-M_{\text{penalty}} & \text{if candidate selected an incorrect option} \\ 
0.0 & \text{if question was unanswered/omitted} 
\end{cases}$$

### 2. Aggregate Raw Net Score:
$$\text{Score}_{\text{net}} = \sum_{i=1}^K S_i = (N_{\text{correct}} \times M_{\text{correct}}) - (N_{\text{incorrect}} \times M_{\text{penalty}})$$

### 3. Examination Accuracy Percentage:
$$\text{Accuracy} = \left(\frac{N_{\text{correct}}}{N_{\text{attempted}}}\right) \times 100 = \left(\frac{N_{\text{correct}}}{N_{\text{correct}} + N_{\text{incorrect}}}\right) \times 100$$

> [!NOTE]
> **Omission Exclusion in Accuracy**: Unanswered questions ($N_{\text{unanswered}}$) are strictly excluded from the accuracy denominator. If a candidate attempts 40 out of 100 questions and gets 30 right, their accuracy is $\frac{30}{40} \times 100 = 75.0\%$, not $30\%$.

---

## 4. Worked Numerical Examples across Exam Patterns

### Example 1: SSC CGL Tier 1 Standard Full-Length Paper
- **Blueprint Rules**: $K = 100$ questions, $+2.0$ per correct, $-0.5$ per incorrect. Total marks = $200.0$.
- **Candidate Performance**:
  - $N_{\text{correct}} = 72$
  - $N_{\text{incorrect}} = 18$
  - $N_{\text{unanswered}} = 10$
- **Calculations**:
  - Positive Marks: $72 \times 2.0 = +144.0$
  - Negative Penalty: $18 \times 0.5 = -9.0$
  - Final Net Score: $144.0 - 9.0 = \mathbf{135.0}$ marks (out of 200.0)
  - Accuracy: $\frac{72}{72 + 18} \times 100 = \frac{72}{90} \times 100 = \mathbf{80.0\%}$
  - Percentage: $\frac{135.0}{200.0} \times 100 = \mathbf{67.5\%}$

### Example 2: Railway RRB NTPC Negative Marking (1/3rd Penalty)
- **Blueprint Rules**: $K = 100$ questions, $+1.0$ per correct, $-\frac{1}{3} \approx -0.3333$ per incorrect.
- **Candidate Performance**: $N_{\text{correct}} = 60$, $N_{\text{incorrect}} = 30$, $N_{\text{unanswered}} = 10$.
- **Calculations**:
  - Net Score: $(60 \times 1.0) - (30 \times 0.3333) = 60.0 - 10.0 = \mathbf{50.0}$ marks.
  - Accuracy: $\frac{60}{90} \times 100 = \mathbf{66.67\%}$.

---

## 5. What Must Never Happen
- A scoring engine must **never** award negative marks for unanswered questions unless explicitly specified in the blueprint.
- Psychometrics, AI recommendations, or adaptive ability estimators must **never** alter the candidate's net score.
- Decimal scores must **never** suffer floating-point round-off drift (e.g. $134.999999999$ instead of $135.0$). All scores are rounded to 4 decimal places during intermediate steps and 2 decimal places for display.
