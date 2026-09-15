# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 25: ASSESSMENT SOURCE INTEGRATION

---

## 1. Supported Assessment Modalities

The Mistake Vault seamlessly ingests errors across 6 distinct assessment sources:

| Source Context | Modality Description | Ingestion Payload |
|---|---|---|
| **`MOCK_TEST`** | Full-length timed simulated exam. | `attempt_answer_id`, `test_id`, pacing telemetry. |
| **`CUSTOM_PRACTICE`** | Untimed topic-specific practice. | `attempt_answer_id`, selected options, response time. |
| **`QUIZ_BATTLE`** | Gamified real-time 1v1 PvP quiz. | PvP match ID, speed telemetry. |
| **`FLASHCARD_REVIEW`** | Spaced formula/fact review cards. | Card ID, recall confidence rating. |
| **`MISTAKE_DRILL`** | Focused remediation drill session. | Drill session ID, item index. |
| **`DIAGNOSTIC_ASSESSMENT`**| Initial baseline diagnostic test. | Diagnostic cohort ID, topic weights. |
