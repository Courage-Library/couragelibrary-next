# 28 — PREMIUM ENTITLEMENT & TRANSACTIONAL QUOTA ARCHITECTURE

> **DOCUMENTATION CLASSIFICATION:** Monetization & Access Control Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phases 3S–3V Certified)  
> **SYSTEM LAYER:** Entitlement & Quota Gateway  

---

## 1. What is it?
The **Premium Entitlement & Quota Engine** evaluates candidate subscription states, validates active pass validity windows, and enforces row-locked atomic quota consumption across the 8 Premium test modalities.

## 2. Active Entitlement Evaluation Logic

```sql
-- Active Subscription Entitlement SQL Predicate
SELECT *
FROM public.user_subscriptions
WHERE 
    user_id = p_user_id
    AND is_active = true
    AND starts_at <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (
        scope = 'PLATFORM_ALL_ACCESS'
        OR (scope = 'EXAM_SPECIFIC' AND exam_id = p_target_exam_id)
    );
```

---

## 3. Transactional Quota Decrement Mutex

```sql
CREATE OR REPLACE FUNCTION public.fn_consume_premium_quota_atomic(
    p_user_id UUID,
    p_quota_key VARCHAR(50)
)
RETURNS JSONB AS $$
DECLARE
    v_usage RECORD;
    v_limit INTEGER;
BEGIN
    -- 1. Fetch Plan Limit
    SELECT q.quota_limit INTO v_limit
    FROM public.subscription_plan_quotas q
    JOIN public.user_subscriptions s ON s.plan_id = q.plan_id
    WHERE s.user_id = p_user_id AND s.is_active = true AND q.quota_key = p_quota_key;

    IF v_limit IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NO_ACTIVE_PLAN_OR_QUOTA_KEY');
    END IF;

    -- 2. Acquire row lock on usage row
    SELECT * INTO v_usage
    FROM public.candidate_quota_usages
    WHERE user_id = p_user_id AND quota_key = p_quota_key
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.candidate_quota_usages (user_id, quota_key, used_count)
        VALUES (p_user_id, p_quota_key, 1);
        RETURN jsonb_build_object('success', true, 'remaining', v_limit - 1);
    END IF;

    -- 3. Check Capacity
    IF v_usage.used_count >= v_limit THEN
        RETURN jsonb_build_object('success', false, 'error', 'QUOTA_EXHAUSTED', 'limit', v_limit);
    END IF;

    -- 4. Decrement Quota
    UPDATE public.candidate_quota_usages
    SET used_count = used_count + 1, updated_at = NOW()
    WHERE id = v_usage.id;

    RETURN jsonb_build_object('success', true, 'remaining', v_limit - (v_usage.used_count + 1));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. What Must Never Happen
- A candidate must **never** be able to bypass quota checks via client-side state manipulation.
- Quota must **never** be deducted if test initialization fails midway through transaction execution.
