# 31 — ROW LEVEL SECURITY (RLS) & DATABASE AUTHORITY

> **DOCUMENTATION CLASSIFICATION:** Database Security & RLS Policy Specification  
> **LIFECYCLE STATUS:** Production & Frozen  
> **SYSTEM LAYER:** PostgreSQL Security Layer  

---

## 1. What is it?
The **Row Level Security (RLS) & Database Authority Architecture** enforces data isolation and access controls directly at the PostgreSQL engine level, guaranteeing that candidates can only read and write their own assessment attempts while administrators and service roles retain governed access.

## 2. Master RLS Policy Catalog

```sql
-- ============================================================================
-- 1. TEST ATTEMPTS RLS POLICIES
-- ============================================================================
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

-- Candidate can only view their own attempts
CREATE POLICY "Candidates can read own attempts"
ON public.test_attempts FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Candidate can only insert attempts for themselves
CREATE POLICY "Candidates can create own attempts"
ON public.test_attempts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Candidate can update in-progress attempts for themselves
CREATE POLICY "Candidates can update own in-progress attempts"
ON public.test_attempts FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'IN_PROGRESS')
WITH CHECK (auth.uid() = user_id);

-- Service role has full access
CREATE POLICY "Service role full access on attempts"
ON public.test_attempts FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- 2. ATTEMPT ANSWERS RLS POLICIES
-- ============================================================================
ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Candidates can read own answers"
ON public.attempt_answers FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.test_attempts a
        WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid()
    )
);

CREATE POLICY "Candidates can stage own answers on in-progress attempts"
ON public.attempt_answers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.test_attempts a
        WHERE a.id = attempt_answers.attempt_id AND a.user_id = auth.uid() AND a.status = 'IN_PROGRESS'
    )
);

-- ============================================================================
-- 3. PSYCHOMETRICS & SNAPSHOTS RLS POLICIES (ADMIN / SERVICE ROLE ONLY)
-- ============================================================================
ALTER TABLE public.test_psychometric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_psychometric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychometric_review_queue ENABLE ROW LEVEL SECURITY;

-- Deny all candidate direct access; allow service role & admin only
CREATE POLICY "Service role access on test psychometric snapshots"
ON public.test_psychometric_snapshots FOR ALL
TO service_role
USING (true) WITH CHECK (true);
```

---

## 3. Why RLS is the Supreme Foundation
Even if a developer accidentally introduces an Insecure Direct Object Reference (IDOR) bug in a React Server Action or REST endpoint, **PostgreSQL RLS stops the unauthorized read or write at the database engine level**, returning an empty set or throwing an RLS violation exception.

---

## 4. What Must Never Happen
- RLS must **never** be disabled (`DISABLE ROW LEVEL SECURITY`) on production assessment tables.
- Candidate users must **never** be granted direct read or write access to `test_psychometric_snapshots` or `item_psychometric_snapshots`.
