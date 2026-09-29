# 45 — System Design Deep Dives & Interview-Ready Notes

## 1. Executive Summary & Architecture Pitch

> "Courage Library is an enterprise-grade assessment platform engineered to deliver high-stakes competitive examinations across India. The system scales to 100,000+ concurrent test-takers with zero data loss, guarantees sub-50ms monotonic answer persistence, and provides real-time psychometric evaluation (Classical Test Theory, 1PL Rasch IRT, and Cronbach's Alpha Reliability) while strictly preserving historical auditability across 14 immutable core tables."

---

## 2. Core System Design Trade-Offs & Justifications

### 2.1 Why PostgreSQL + RPCs Over NoSQL / Document Databases?
- **The Question**: *"Why use a relational database like PostgreSQL for high-frequency answer writes instead of MongoDB, DynamoDB, or Cassandra?"*
- **Authoritative Answer**: 
  1. **Strict Transactional Invariants**: Assessment scoring, daily attempt limits (1-attempt mutex), and quota consumption require atomic serializability. A candidate must never be able to start two attempts concurrently or exploit race conditions in virtual coin balances.
  2. **Row-Level Security & Encapsulated RPCs**: Business rules (e.g., preventing answers from being saved after `started_at + duration + grace`) are enforced natively in database stored procedures (`SECURITY DEFINER`), guaranteeing zero bypass even if API layers are compromised.
  3. **Row-Level Upsert Performance**: PostgreSQL `ON CONFLICT DO UPDATE` on `(attempt_id, question_id)` easily sustains 25,000+ writes/sec with PgBouncer connection pooling and localized row locks without requiring eventual consistency reconciliation.

---

### 2.2 Why Client Monotonic Sequence IDs Over Distributed Vector Clocks?
- **The Question**: *"How do you handle out-of-order network packets when candidates click multiple options in poor mobile network conditions?"*
- **Authoritative Answer**:
  1. Each candidate session operates as a **single linear writer** per question. Therefore, complex distributed vector clocks or CRDTs are unnecessary overhead.
  2. The client increments a strictly monotonic sequence counter (`sequence_id: 1, 2, 3...`) for every mutation on question $Q_i$.
  3. The database executes:
     $$\text{ACCEPT} \iff \text{incoming.sequence\_id} > \text{stored.sequence\_id}$$
  4. Stale, delayed, or duplicated HTTP packets arriving out of order are discarded deterministically without corrupting the candidate's latest intended answer.

---

### 2.3 How to Handle the "100k Live Test Auto-Submit Storm"
- **The Question**: *"When 100,000 candidates reach the 12:00:00 PM deadline on a national live test, how do you prevent database connection pool exhaustion and transaction lock contention?"*
- **Authoritative Answer**:
  1. **Client Jitter Staggering**: Clients compute a deterministic submission jitter $\delta = \text{hash}(\text{user\_id}) \pmod{2500}\text{ms}$, smoothing the spike across a 2.5-second window.
  2. **Two-Phase Scoring Pipeline**:
     - *Phase 1 (Synchronous & Light)*: The submission RPC marks `test_attempts.status = 'completed'`, verifies deadline compliance, calculates raw marks ($+M, -M$), and writes `test_results`. This takes $< 15\text{ms}$.
     - *Phase 2 (Asynchronous Batch)*: Percentiles, All-India ranks, and psychometric calibration are **not** computed per-user; they are calculated via a single-pass parallel window query after the live submission window officially terminates.
  3. **Background Sweeper Failsafe**: Any candidate whose connection completely dropped is automatically evaluated by a server-side pg_cron sweeper operating on `FOR UPDATE SKIP LOCKED`.

---

### 2.4 Why 1PL Rasch Model Over 3PL for Standard Indian Test Preparation?
- **The Question**: *"Why did you implement the 1PL / Rasch Model instead of 3PL IRT?"*
- **Authoritative Answer**:
  1. **Sample Size Constraints**: 3PL models require large candidate cohorts ($N > 1,000$) per item to accurately estimate the pseudo-guessing ($c_i$) and discrimination ($a_i$) parameters without unstable convergence. In contrast, 1PL JMLE converges stably on cohorts as small as $N = 30$.
  2. **Specific Objectivity**: In the Rasch model, person ability and item difficulty are mathematically separable. The total raw score is a sufficient statistic for estimating ability $\theta$.
  3. **Deterministic Calibration**: Phase 5E.6 achieves deterministic calibration with reproducible SHA-256 evidence watermarks, serving as a solid foundation before Phase 6 introduces 2PL/3PL.

---

## 3. High-Frequency Interview Q&A Quick Reference

| Question | Short Technical Answer |
|---|---|
| **Where are the correct answer keys stored during an exam?** | Strictly on the server. The exam player receives only question text, math diagrams, and option UUIDs. `is_correct` and explanations are completely stripped from API payloads. |
| **How do you prevent candidates from manipulating the exam timer?** | The timer is anchored to `started_at` in PostgreSQL. Remaining duration is calculated as `Duration - (ServerNOW - started_at)`. Client clock adjustments have zero effect. |
| **What happens if a candidate loses internet for 30 minutes?** | Answers continue saving locally in IndexedDB. When reconnecting, pending sync packets are flushed with their sequence numbers. If the exam deadline expired while offline, the local mirror triggers auto-submit. |
| **Why is McDonald's Omega quarantined in Phase 5E.6?** | To ensure production stability. Cronbach's $\alpha$ is universally stable; Omega requires factor analysis covariance matrix convergence which can fail ($NaN$) on small or non-normal candidate cohorts. |
