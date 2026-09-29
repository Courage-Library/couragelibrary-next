# 27 — ACHIEVEMENTS & 18-BADGE RECOGNITION ENGINE

> **DOCUMENTATION CLASSIFICATION:** Candidate Milestone & Achievement Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phase 5E.3 Certified)  
> **SYSTEM LAYER:** Gamification & Milestone Recognition  

---

## 1. What is it?
The **Achievements & Badge Recognition Engine** tracks candidate milestones, evaluating 18 distinct competitive achievement criteria upon test completion and recording unlock events in an immutable, idempotent achievement ledger.

## 2. The 18 Production Achievement Badges

```
+----------------------------------------------------------------------------------------------------+
| BADGE KEY                     | CATEGORY        | TRIGGER CRITERIA                                 |
+-------------------------------+-----------------+--------------------------------------------------+
| `FIRST_LIVE_TEST`             | Participation   | First completed Live All-India contest attempt   |
| `LIVE_WARRIOR_3`              | Persistence     | Completed 3 distinct Live All-India contests     |
| `LIVE_VETERAN_10`             | Persistence     | Completed 10 distinct Live All-India contests    |
| `DAILY_STREAK_7`              | Habituation     | Completed 7 consecutive Daily Mock occurrences   |
| `DAILY_STREAK_30`             | Habituation     | Completed 30 consecutive Daily Mock occurrences  |
| `CENTURION_ACCURACY`          | Excellence      | 100% Accuracy on a 25+ question test             |
| `SHARPSHOOTER_90`             | Excellence      | >= 90% Accuracy on a Full-Length Mock            |
| `SPEED_DEMON`                 | Time Mastery    | Completed Full-Length Mock in < 70% allotted time|
| `TOP_100_NATIONAL`            | Merit Ranking   | Ranked in Top 100 in an All-India Live Event     |
| `TOP_10_PERCENT`              | Merit Ranking   | Percentile P >= 90.0% in an All-India Live Event |
| `TOP_1_PERCENT_ELITE`         | Merit Ranking   | Percentile P >= 99.0% in an All-India Live Event |
| `PODIUM_GOLD`                 | Champion        | Rank 1 in an All-India Live Competition          |
| `PODIUM_SILVER`               | Champion        | Rank 2 in an All-India Live Competition          |
| `PODIUM_BRONZE`               | Champion        | Rank 3 in an All-India Live Competition          |
| `VAULT_CLEANSER_50`           | Remediation     | Resolved 50 questions in the Mistake Vault       |
| `WEAKNESS_CONQUEROR`          | Remediation     | Raised a weak topic accuracy from <50% to >80%   |
| `PERSONAL_BEST_CRUSHER`       | Growth          | Achieved a new personal highest score            |
| `CONSISTENT_PERFORMER_3`      | Consistency     | 3 consecutive tests with score > 80th percentile |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Idempotent Unlock Ledger Architecture
- **Badges Master**: `public.badges` (defines `key`, `title`, `description`, `icon_url`, `tier`).
- **User Badges**: `public.user_badges` (stores `user_id`, `badge_id`, `unlocked_at`).
- **Achievement Ledger**: `public.achievement_evidence_ledger` (stores `user_id`, `badge_key`, `evidence_attempt_id`, `idempotency_key`).
- **Constraint**: `UNIQUE (user_id, badge_key, evidence_attempt_id)` prevents duplicate unlocks on the same attempt.

---

## 4. What Must Never Happen
- A badge unlock must **never** be triggered by un-evaluated or abandoned test attempts.
- A candidate must **never** lose already-unlocked badges during downstream errata re-evaluations unless the underlying attempt was invalidated for academic dishonesty.
