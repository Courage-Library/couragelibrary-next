# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 42: FAQ & ENGINEERING RUNBOOK

---

## 1. Frequently Asked Questions

### Q: Why does a candidate have a streak of 1 but status is REVISITING?
**A**: This is expected behavior. The first correct remediation advances the candidate to `REVISITING`. The second correct remediation is required to transition to `MASTERED`.

### Q: How does the system handle rapid repeated errors on the same question?
**A**: Each error appends an immutable record to `user_mistake_occurrences`, increments `total_mistakes_count` in `user_mistake_vault`, and resets streak to 0.

### Q: What is the difference between MPI and Revision Priority?
**A**: MPI measures intrinsic question severity ($0-1$). Revision Priority augments MPI with due urgency, learning content bonus, and fatigue penalties for candidate queue sorting.
