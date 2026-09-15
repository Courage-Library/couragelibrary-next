# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 43: AUTHORITATIVE GLOSSARY OF TERMS

---

| Term | Canonical Definition |
|---|---|
| **Mistake Vault** | The core aggregate profile storage subsystem managing lifetime question mastery. |
| **Mistake Occurrence** | A discrete, immutable event representing a single failed question attempt. |
| **MPI** | Mistake Priority Index — deterministic severity score $[0.0000, 1.0000]$. |
| **Revision Priority** | Real-time queue ordering score combining MPI, due urgency, and content bonuses. |
| **Retention Score $R(t)$** | Deterministic revision-retention heuristic value $[0.0000, 1.0000]$. |
| **Retention Risk** | Urgency signal defined as $1.0000 - R(t)$. |
| **Effective Stability ($S_{\text{eff}}$)** | Base stability scaled by streak: $S \cdot (1 + 0.50 \cdot C_{\text{effective}})$. |
| **Relapse** | An error committed on a question that previously achieved `MASTERED` status. |
| **$M_{\text{norm}}$** | Normalized Mistake Rate: $\frac{\text{mistakes}}{\max(\text{attempts}, 1)} \times 100$. |
| **$I_{\text{cross}}$** | Cross-Exam Dispersion Index: $\frac{\text{maxRate} - \text{minRate}}{\max(\text{avgRate}, 1.0)}$. |
| **`DECLINING`** | Certified trajectory state representing worsening performance ($\Delta M \ge +15\%$). |
