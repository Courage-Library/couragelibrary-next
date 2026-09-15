# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 28: PERFORMANCE & QUERY STRATEGY

---

## 1. Measured Benchmarks vs SLA Framing

> **NOTE ON BENCHMARKS**: Analytical latency targets (e.g., $< 300\text{ms}$) represent **measured performance targets on warm database connections**, not a rigid contractual SLA under arbitrary network conditions.

---

## 2. Query Optimization Strategy

1. **Composite Indexes**:
   - `idx_umv_user_status`: `(user_id, lifecycle_status)` — Enables sub-millisecond filtering on candidate feeds.
   - `idx_umo_status`: `(user_id, occurrence_status)` — Speeds up longitudinal ledger scans by ignoring revoked errata.
2. **Two-Stage Longitudinal Fetch**:
   - Stage 1: Fast aggregated count query across analytical windows ($2W$ span).
   - Stage 2: Parallel fetch of weakest topics and cognitive distributions.
3. **Payload Pruning**: JSON snapshots omit unnecessary question metadata to maintain small network payloads ($< 50\text{KB}$).
