# 32 — CONCURRENCY, IDEMPOTENCY & TRANSACTIONAL INTEGRITY

> **DOCUMENTATION CLASSIFICATION:** Concurrency Control & ACID Transaction Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** Database Concurrency & Mutex Engine  

---

## 1. What is it?
The **Concurrency, Idempotency & Transactional Integrity Architecture** defines the mutexes, row-level locks, unique database constraints, and idempotency keys that prevent race conditions during burst traffic events (e.g., Live Competition seat reservation, quota decrements, and double submissions).

## 2. Production Concurrency Scenarios & Protections

```
+----------------------------------------------------------------------------------------------------+
| CONCURRENCY SCENARIO              | POTENTIAL RACE RISK             | POSTGRESQL MUTEX / MECHANISM |
+-----------------------------------+---------------------------------+------------------------------+
| 1. Live Contest Seat Reservation  | 5,000 users competing for 1,000 | `SELECT seat_count FOR UPDATE`|
|                                   | seats at 10:00:00 AM.           | in reservation RPC.          |
+-----------------------------------+---------------------------------+------------------------------+
| 2. Premium Quota Decrement        | Candidate opens 5 browser tabs  | `SELECT used_count FOR UPDATE`|
|                                   | and clicks "Start" in all 5.    | on quota usage record.       |
+-----------------------------------+---------------------------------+------------------------------+
| 3. Daily Mock Start Race          | Candidate triggers 2 start      | Unique partial index:        |
|                                   | requests within 50ms.           | `uq_user_daily_mock_occur`   |
+-----------------------------------+---------------------------------+------------------------------+
| 4. Double Test Submission         | Network retry sends 2 submit    | `UPDATE ... WHERE status =   |
|                                   | requests simultaneously.        | 'IN_PROGRESS'` (1 row update)|
+-----------------------------------+---------------------------------+------------------------------+
| 5. Gamification Coin Credit       | Background scorer & webhook both| `coin_ledger` unique constraint|
|                                   | try to credit completion coins. | on `idempotency_key`.        |
+-----------------------------------+---------------------------------+------------------------------+
```

---

## 3. Idempotency Key Formulation Standards

| Transaction Type | Idempotency Key Format | Lifecycle Scope |
| :--- | :--- | :--- |
| Mock Completion Coins | `coin_comp_att_<attempt_id>` | 1 per Attempt |
| Accuracy Bonus Coins | `coin_acc_bonus_<attempt_id>` | 1 per Attempt |
| Live Podium Reward | `coin_live_podium_<pos>_<event_id>_<user_id>` | 1 per Event/User |
| Achievement Unlock | `achv_<user_id>_<badge_key>_<attempt_id>` | 1 per Badge/Attempt |
| Certificate Issuance | `cert_live_<event_id>_<user_id>_<snapshot_id>` | 1 per Publication |

---

## 4. What Must Never Happen
- A database transaction must **never** execute an external HTTP call while holding a `FOR UPDATE` lock on high-traffic tables.
- Database locks must **never** result in deadlocks; all transactions acquire locks in strict alphabetical table order.
