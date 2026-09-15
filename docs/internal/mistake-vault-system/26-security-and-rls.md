# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 26: SECURITY & ROW LEVEL SECURITY (RLS)

---

## 1. Multi-Tenant Isolation via PostgreSQL RLS

Every Mistake Vault table enforces strict Row Level Security (RLS) to ensure complete tenant data isolation:

```sql
-- Candidate Access Policy
CREATE POLICY "Users can only access their own mistake vault"
ON public.user_mistake_vault
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only access their own mistake occurrences"
ON public.user_mistake_occurrences
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only access their own mistake drills"
ON public.user_mistake_drills
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

---

## 2. SECURITY DEFINER Function Protections

Functions executing with elevated privileges (`fn_record_mistake_occurrence`, `fn_revoke_mistakes_by_errata`) enforce strict internal caller identity checks:
- Authenticated candidates may only mutate their own records (`caller_id == p_user_id`).
- Staff-only functions require verified JWT claims: `(auth.jwt()->>'role') IN ('admin', 'staff', 'service_role')`.
