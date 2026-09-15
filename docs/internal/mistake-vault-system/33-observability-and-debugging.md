# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 33: OBSERVABILITY & DEBUGGING

---

## 1. Telemetry Logging & Diagnostics

The service layer logs structured diagnostic events to aid debugging:

```typescript
console.log(JSON.stringify({
  event: "MISTAKE_OCCURRENCE_INGESTED",
  userId: p_user_id,
  questionId: p_question_id,
  sourceContext: p_source_context,
  cognitiveType: p_cognitive_type_id,
  durationMs: executionTime
}));
```

---

## 2. Developer Debugging Runbook

- **Symptom: Candidate streak not advancing after drill**:
  - Check `user_mistake_drills.status` (must be `COMPLETED`).
  - Verify `attempt_answer_id` integrity.
- **Symptom: Errata correction did not update vault count**:
  - Run `SELECT * FROM public.fn_recompute_mistake_profile(user_id, question_id)`.
