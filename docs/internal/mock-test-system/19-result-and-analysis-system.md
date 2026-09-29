# 19 — RESULT & PERFORMANCE ANALYSIS SYSTEM

> **DOCUMENTATION CLASSIFICATION:** Analytics & Candidate Result Presentation  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Post-Assessment Intelligence  

---

## 1. What is it?
The **Result & Performance Analysis System** generates the post-exam diagnostic dashboard—delivering score breakdowns, sectional accuracy heatmaps, time-spent distribution vs topper benchmarks, question-by-question solution reviews, and longitudinal performance tracking.

## 2. Why does it exist?
A simple numerical score provides minimal pedagogical value. Aspirants need to know:
1. Did they spend too much time on easy questions?
2. Which specific sub-topics caused negative marking penalties?
3. How does their sectional pacing compare with the top 10% of candidates?
4. Which incorrect questions need immediate routing to the Mistake Vault for re-drilling?

---

## 3. Result Analytics Structure

```
+----------------------------------------------------------------------------------------------------+
|                               CANDIDATE RESULT DASHBOARD MATRIX                                    |
+----------------------------------------------------------------------------------------------------+

[ 1. EXECUTIVE SCORECARD ]
* Total Net Score: 135.0 / 200.0 (67.5%)
* All-India Rank / Percentile: Rank 42 / 94.2 Percentile (Live Competition only)
* Accuracy: 80.0% (72 Correct / 18 Incorrect / 10 Omitted)
* Total Time Spent: 54 mins 20 secs / 60 mins

[ 2. SECTIONAL BREAKDOWN TABLE ]
+----------------------+-----------+---------+---------+-----------+----------+-----------+
| SECTION NAME         | ATTEMPTED | CORRECT | WRONG   | NET SCORE | ACCURACY | TIME SPENT|
+----------------------+-----------+---------+---------+-----------+----------+-----------+
| Reasoning & Intel    | 24 / 25   | 22      | 2       | 43.0 / 50 | 91.7%    | 12m 10s   |
| General Awareness    | 20 / 25   | 14      | 6       | 25.0 / 50 | 70.0%    | 06m 45s   |
| Quantitative Aptitude| 22 / 25   | 18      | 4       | 34.0 / 50 | 81.8%    | 24m 30s   |
| English Comprehension| 24 / 25   | 18      | 6       | 33.0 / 50 | 75.0%    | 10m 55s   |
+----------------------+-----------+---------+---------+-----------+----------+-----------+

[ 3. TIME DISTRIBUTION BENCHMARK ]
* Candidate Average Time per Question: 36.2 seconds
* Topper Average Time per Question: 28.5 seconds
* Time Spent on Incorrect Questions: 14 mins 10 secs (Lost Time Analysis)

[ 4. DETAILED QUESTION SOLUTION REVIEW ]
* Filter by: [All] [Correct] [Incorrect] [Omitted] [Marked for Review]
* Question text, candidate choice, correct answer, step-by-step mathematical solution.
* Single-click: "Add to Mistake Vault" or "Report Question Issue".
```

---

## 4. Current vs Historical Result during Errata
If an official answer key correction occurs months later:
- The system computes an updated evaluation version (`EVAL_V2_ERRATA`).
- The candidate’s result screen clearly shows:
  - **Original Evaluated Score**: $135.0$ marks (Audited historical record).
  - **Post-Errata Revised Score**: $137.5$ marks (Active current scorecard).

---

## 5. What Must Never Happen
- A candidate must **never** see another candidate's private scorecard or attempt answers.
- Solution explanations must **never** be rendered until the test status is in `RESULT_AVAILABLE` state.
