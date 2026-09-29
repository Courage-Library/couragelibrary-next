# 25 — GAMIFICATION & CL COIN LEDGER ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Gamification Engine & Financial Ledger Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phases 3D, 5E.1 Certified)  
> **SYSTEM LAYER:** Rewards & Settlement Infrastructure  

---

## 1. What is it?
The **Gamification & CL Coin Ledger Architecture** governs the issuance, settlement, and audit tracking of Courage Library Coins (CL Coins)—the platform’s virtual currency awarded for test completion, high accuracy streaks, daily practice habituation, and podium rankings.

## 2. Double-Entry Style Idempotent Ledger

To prevent reward duplication during network retries or concurrent evaluation workers:
- **Wallet Table**: `public.coin_wallets` (stores `user_id`, `balance`, `updated_at`).
- **Ledger Table**: `public.coin_ledger` (immutable, append-only log of every credit/debit).
- **Idempotency Constraint**: `UNIQUE (idempotency_key)`.

```sql
-- Transactional Settlement RPC Snippet
INSERT INTO public.coin_ledger (
    user_id, amount, transaction_type, idempotency_key, metadata
) VALUES (
    p_user_id, p_amount, 'MOCK_COMPLETION_REWARD', p_idempotency_key, p_metadata
)
ON CONFLICT (idempotency_key) DO NOTHING;

IF FOUND THEN
    UPDATE public.coin_wallets
    SET balance = balance + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
END IF;
```

---

## 3. Reward Schedule Matrix

```
+----------------------------------------------------------------------------------------------------+
| TRIGGER EVENT                         | CL COIN AWARD | IDEMPOTENCY KEY FORMAT                     |
+---------------------------------------+---------------+--------------------------------------------+
| Daily Sectional Completion            | +10 CL Coins  | `coin_daily_comp_<attempt_id>`             |
| Daily Mixed Module Completion         | +15 CL Coins  | `coin_daily_comp_<attempt_id>`             |
| Daily Full-Length Completion          | +25 CL Coins  | `coin_daily_comp_<attempt_id>`             |
| High Accuracy Bonus (Acc >= 90%)      | +5 CL Coins   | `coin_acc_bonus_<attempt_id>`              |
| Live All-India Podium 1st (Gold)      | +1,000 Coins  | `coin_live_podium_1_<event_id>_<user_id>`   |
| Live All-India Podium 2nd (Silver)    | +500 Coins    | `coin_live_podium_2_<event_id>_<user_id>`   |
| Live All-India Podium 3rd (Bronze)    | +250 Coins    | `coin_live_podium_3_<event_id>_<user_id>`   |
| Live Top 10% Finisher                 | +50 Coins     | `coin_live_top10_<event_id>_<user_id>`     |
| Verified Question Errata Bounty       | +50 Coins     | `coin_errata_bounty_<report_id>`           |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. What Must Never Happen
- A candidate wallet balance must **never** be updated directly via client requests; all modifications require the backend `SECURITY DEFINER` settlement RPC.
- Coin rewards must **never** be awarded more than once for the same test attempt.
- A reward failure must **never** rollback an authoritative candidate attempt scorecard.
