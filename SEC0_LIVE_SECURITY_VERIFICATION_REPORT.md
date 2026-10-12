# SEC-0 — Live Security Verification Report (READ-ONLY)

- **Date:** 2026-10-11
- **Repo HEAD:** `b8bd693` (branch `main`)
- **Production host:** `couragelibrary-next.vercel.app` (Vercel)
- **Scope:** S1 (admin privilege escalation), S2 (unverified payment fulfilment), S3 (over-permissive RLS)
- **Note:** `PROJECT_FORENSIC_DISCOVERY_REPORT.md` is not in the repo. This report relies on the SEC-0 prompt plus direct code/migration inspection.

---

## 1. Executive summary

1. **S1 — CONFIRMED_LIVE in code.** `checkIsAdminOrStaff()` grants admin to anyone whose `user_metadata.role` is `admin` or `staff`. Users can edit that field themselves. `ADMIN_EMAILS` is **not set** in `.env.local`, so the hard-coded fallback admin emails are in effect locally. Production env is unknown.
2. **S2 — CONFIRMED_LIVE in code and deployment.** The checkout page invents a `pay_<ts>_<rand>` id. The deployed `/api/billing/fulfill-order` route (returns 401 without auth) calls the service-role RPC, which has **no Razorpay signature check and no check that the order belongs to the caller**.
3. **S3 — CONFIRMED in migrations (11 tables with `FOR ALL TO authenticated USING (true) WITH CHECK (true)`).** No later migration replaces them. Live `pg_policies` state is still to be checked.
4. **Exploitation evidence: PENDING_USER_EXECUTION for all three.** Verified TLS to Postgres failed (`SELF_SIGNED_CERT_IN_CHAIN`, because the Supabase root CA is not installed). Per the rules, TLS was not weakened and **no DB query ran**.
5. **Zero mutations. Zero repo changes except this file. No secrets or PII printed.** SEC-0 status: **OPEN** (DB checks pending).

---

## 2. Method & read-only proof

| Step | Action | Result |
|---|---|---|
| Code inspection | Read `services/admin.service.ts`, `app/api/billing/fulfill-order/route.ts`, `app/checkout/[orderId]/checkout-client.tsx`, `services/user-profile.service.ts`, `app/api/health/route.ts`, migrations 017/018/019/037/054/057/061 | Done |
| Env inspection | Variable **names** only from `.env.local` | Done |
| DB connection | Throwaway script in the session scratchpad (outside the repo). `pg@8.23.0`, `ssl: { rejectUnauthorized: true }`, first statement after connect `BEGIN READ ONLY` | **Connection refused at TLS handshake:** `SELF_SIGNED_CERT_IN_CHAIN`. No SQL ran. Script deleted. |
| TLS weakening | Not attempted (no `NODE_TLS_REJECT_UNAUTHORIZED=0`, no `rejectUnauthorized:false`) | Compliant |
| HTTP checks | 3 unauthenticated GETs and 1 unauthenticated POST with `{}` | See §8 |
| Scripts in `scripts/` / `scratch/` | Not run | Compliant |

**Read-only statements prepared (would have run):** `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY; BEGIN READ ONLY; SHOW transaction_read_only; … ROLLBACK;`
`SHOW transaction_read_only = on` could **not** be shown because no session was established. Since no session existed, no mutation was possible.

**git status before** (start of session):
```
?? COURAGE_LIBRARY_COMPLETE_FOUNDER_BRIEF.md
?? CURRENT_AFFAIRS_EXHAUSTIVE_FEATURE_AUDIT.md
?? FOUNDER_BRIEF.md
```
**git status after:** the same three files plus `?? SEC0_LIVE_SECURITY_VERIFICATION_REPORT.md`. Nothing is staged, committed, or modified.

**Env var names present in `.env.local`:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV`, `POSTGRES_URL_NON_POOLING`.
Observations:
- **`ADMIN_EMAILS` is absent.**
- No `RAZORPAY_*` variables exist, so no gateway secret is available to verify signatures.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL` are each defined twice.
- `POSTGRES_URL_NON_POOLING` actually points to the **transaction pooler** (`*.pooler.supabase.com:6543`), despite its name.

---

## 3. Q0 baseline before/after

**Status: PENDING_USER_EXECUTION.** No DB session was established, so neither before nor after counts exist. Because nothing connected, the database is unchanged by this phase. See §9 Q0 for the SQL; run it before and after any later verification.

| Table | Before | After | Match |
|---|---|---|---|
| (all 26 tables) | PENDING | PENDING | N/A, no connection made |

---

## 4. S1 — Admin privilege escalation

### Code evidence (HEAD `b8bd693`)
`services/admin.service.ts:232-239`:
```ts
const adminEmails = (process.env.ADMIN_EMAILS || "ja***@g***.com,ja***@g***.com")   // masked
  .split(",")
  .map((e) => e.trim().toLowerCase());

const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
const isMetaAdmin = user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" || user.user_metadata?.role === "staff";

const isAuthorized = isEmailAdmin || isMetaAdmin;
```
- `user_metadata` can be written by the user via `supabase.auth.updateUser({ data: { role: "admin" } })` using only the public anon key and their own session.
- `checkIsAdminOrStaff` is referenced **208 times** across `app/`, `actions/`, `lib/`, so one bypass unlocks the whole admin surface.
- The same hard-coded fallback list appears again at `services/admin.service.ts:1269`. The admin user list there also shows `meta.role` from `user_metadata` as the user's role (line 1288). That is display only, not an auth decision.
- `services/user-profile.service.ts:34` reads `user_metadata` only for `full_name` / `language_preference` (not authorization).
- `checkIsAdminOrStaff` also calls `UserProfileService.ensureProfile(user)`, an **upsert into `user_profiles` on every admin check**. This side effect is noted for SEC-1.

### Checks
| Check | Result |
|---|---|
| S1-a/b/c (auth.users metadata roles) | PENDING_USER_EXECUTION (§9) |
| S1-d `ADMIN_EMAILS` defined? | **Not defined in `.env.local`.** Vercel production env: **UNKNOWN** (PENDING_USER_INPUT). If unset in Vercel too, the hard-coded fallback is live in prod. |
| S1-e admin_audit_logs actors | PENDING_USER_EXECUTION. Columns confirmed from migration 037: `actor_id, actor_email, action_type, target_entity, target_id, created_at` |
| S1-f non-admin authored writes | PENDING_USER_EXECUTION (§9 includes a column-discovery generator) |

### Classification
- **LIVE:** CONFIRMED_LIVE (code path deployed. A metadata-based bypass works regardless of `ADMIN_EMAILS`.)
- **EXPLOITATION:** PENDING_USER_EXECUTION (S1-a/b shows whether any non-intended user carries `role=admin|staff`)
- **Severity:** **CRITICAL**. Any signed-up user can promote themselves to full admin with a single client-side call.

---

## 5. S2 — Unverified payment fulfilment

### Code evidence
`app/checkout/[orderId]/checkout-client.tsx:40-49`:
```ts
const mockPaymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const mockSignature = `sig_${Date.now()}`;

const res = await fetch("/api/billing/fulfill-order", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    orderId: order.id,
    gatewayPaymentId: mockPaymentId,
    gatewaySignature: mockSignature,
```
`app/api/billing/fulfill-order/route.ts` (excerpt):
```ts
const { orderId, gatewayPaymentId, gatewaySignature, paymentMethod, amount, billingName, billingState } = await request.json();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
... rpc("fn_verify_and_fulfill_payment", { p_order_id: orderId, p_gateway_payment_id: gatewayPaymentId, p_gateway_signature: gatewaySignature, ... })
```
`supabase/migrations/20260824000019_phase3i_closure_hardening.sql:261-283` (latest RPC definition):
```sql
SELECT * INTO v_order FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
...
IF p_amount IS NOT NULL AND p_amount != v_order.total_payable_amount THEN   -- amount is client-supplied & optional
```
Findings:
- **No signature verification anywhere.** The search `createHmac|razorpay_signature|validatePaymentVerification` finds only `services/live-test-certificate.service.ts:56`, which is unrelated certificate signing. No Razorpay env vars exist.
- **No ownership check.** The route never passes `user.id`, and the RPC fetches the order by id only. Any authenticated user who knows or obtains an order UUID can mark it PAID. The entitlement goes to `v_order.user_id`.
- The amount check is skipped if `amount` is omitted, and it compares against a client value anyway.
- The route **falls back to the anon key** if the service role key is missing. That fallback is a silent misconfiguration risk, though the RPC would then be denied, because grants allow `service_role` only.
- Grants (migration 019:392-393): `fn_verify_and_fulfill_payment` is executable by `service_role` only, revoked from `anon, authenticated, public`. **Direct RPC abuse is blocked. Abuse through the API route is not.** `fn_create_payment_order` is executable by `authenticated, service_role`.
- `ON CONFLICT (gateway_payment_id) DO UPDATE SET status='SUCCESS'` lets a replayed payment id re-mark a transaction as SUCCESS.

### Checks
| Check | Result |
|---|---|
| S2-a … S2-e | PENDING_USER_EXECUTION (§9) |
| S2-f grants | From migrations: as above. Live `proacl` check: PENDING_USER_EXECUTION |
| Deployed route | `POST /api/billing/fulfill-order` with `{}` and no cookies returns **401**. The route is live and auth-gated, consistent with HEAD. |

### Classification
- **LIVE:** CONFIRMED_LIVE (route deployed. The fabricated-id flow is the only payment path in the code.)
- **EXPLOITATION:** PENDING_USER_EXECUTION. Note that **every** legitimate checkout to date necessarily used a fabricated id, so S2-b/S2-d will show how many PAID orders / entitlements were never actually paid for.
- **Severity:** **CRITICAL**. Any signed-in user gets free PRO/course entitlements and GST invoices are issued for unpaid orders, a direct revenue and tax-compliance impact.

---

## 6. S3 — Over-permissive RLS

### Migration evidence
`20260919000054_phase3h1_exam_knowledge_foundation.sql:355-394`. Policies `FOR ALL TO authenticated USING (true) WITH CHECK (true)` on:
`exam_posts`, `exam_sources`, `exam_knowledge_documents`, `exam_doc_versions`, `exam_claims`, `exam_claim_sources`.
Example:
```sql
CREATE POLICY "Admin staff full management of exam posts"
    ...
    TO authenticated
    USING (true)
```
`20261001000057_phase3r1_dynamic_syllabus_schema_foundation.sql:~347-379`. Same pattern on:
`canonical_taxonomy_nodes`, `taxonomy_aliases`, `exam_syllabus_versions`, `exam_syllabus_nodes`, `exam_syllabus_canonical_mappings`.

- The policy names claim "Admin staff", but the predicate is `true`, so every authenticated user qualifies.
- RLS **is enabled** on these tables (11 `ENABLE ROW LEVEL SECURITY` statements across the two migrations). The `true` predicate makes it moot for writes.
- The only later migration touching these table names (`20261001000061_phase4a_current_affairs_canonical_schema.sql`) does **not** drop or replace these policies.
- Policies are permissive and OR'd together, so the separate public SELECT policies don't narrow anything.

### Checks
| Check | Result |
|---|---|
| S3-a live `pg_policies` | PENDING_USER_EXECUTION |
| S3-b platform-wide permissive write policies | PENDING_USER_EXECUTION |
| S3-c table grants for anon/authenticated | PENDING_USER_EXECUTION |
| S3-d tampering indicators | PENDING_USER_EXECUTION (`reviewed_by` exists on one syllabus table. Others have no author column, so tampering must be inferred from timestamps / row-count drift) |
| S3-e RLS flags | Enabled per migrations. Live check PENDING |

### Classification
- **LIVE:** INCONCLUSIVE, likely live (migrations define it and nothing reverts it. Live `pg_policies` unconfirmed.)
- **EXPLOITATION:** PENDING_USER_EXECUTION. Absent author columns, exploitation may be **undetectable** from data alone. Postgres/API logs (Supabase Dashboard → Logs → PostgREST) would be needed.
- **Severity:** **HIGH → CRITICAL**. Any user can delete or corrupt the exam knowledge base and syllabus taxonomy through PostgREST with the anon key. This is integrity and availability damage, not a data-confidentiality breach.

---

## 7. Extra findings

- **X1 / X2 (SECURITY DEFINER exposure, unpinned `search_path`):** PENDING_USER_EXECUTION (§9). `fn_verify_and_fulfill_payment` itself pins `search_path = public, pg_temp`.
- **Other `user_metadata` trust:** Only `services/admin.service.ts:237` makes an auth decision. Line 1288 (admin user list) displays `meta.role` as the role label, which could mislead admins into believing a self-promoted user is legit.
- **Hard-coded admin emails in source** (`admin.service.ts:232`, `:1269`): a personal-address dependency, and PII committed to git.
- **Service-role → anon-key fallback** in the fulfill route (silent misconfiguration).
- **Side-effecting admin check** (`ensureProfile` upsert on every `checkIsAdminOrStaff` call).
- **Duplicate env definitions** in `.env.local` (3 variables defined twice. Which one wins depends on the loader.)

---

## 8. Deployment reachability results

| Request | Status |
|---|---|
| `GET /pricing` | 200 |
| `GET /premium` | 200 |
| `GET /api/health` | 200 (`status: healthy`, `version: 0.1.0`) |
| `POST /api/billing/fulfill-order` body `{}`, no cookies (sent once) | **401** (expected) |

- **Build vs HEAD:** **UNKNOWN**. `/api/health` exposes only `version: 0.1.0` (the package.json version), not a commit SHA. Edge: `bom1::iad1`.
- `NEXT_PUBLIC_SITE_URL` appears twice in `.env.local` (one `localhost`, one the Vercel host). The Vercel host was used.

---

## 9. PENDING_USER_EXECUTION / PENDING_USER_INPUT

**Option A (preferred): enable verified TLS so Claude can run this automatically.**
In the Supabase Dashboard, go to **Project Settings → Database → SSL Configuration** and choose **Download certificate**. Save it outside the repo (e.g. `C:\Users\hp\supabase-prod-ca.crt`) and give Claude the path. The script then uses `ssl: { ca, rejectUnauthorized: true }`.

**Option B: run the SQL below in the Supabase SQL Editor.**
- Run each block separately; the editor shows only the last result set.
- Each block opens with `BEGIN READ ONLY;` and ends with `ROLLBACK;`.
- Replace `'<ADMIN_1>','<ADMIN_2>'` with the intended admin emails (lowercase). This happens only in your editor; the query returns yes/no flags, not the list.

### Q0 Baseline (run first and last; counts must match)
```sql
BEGIN READ ONLY;
SHOW transaction_read_only;  -- must be 'on'
SELECT 'auth.users' AS tbl, (SELECT count(*) FROM auth.users) AS n
UNION ALL
SELECT t, CASE WHEN to_regclass('public.'||t) IS NULL THEN NULL
  ELSE (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text::bigint END
FROM unnest(ARRAY['user_profiles','questions','question_versions','question_options','question_answers','mock_tests',
 'test_attempts','test_results','user_mistake_vault','canonical_taxonomy_nodes','taxonomy_aliases','exam_knowledge_documents',
 'exam_doc_versions','exam_claims','exam_sources','exam_posts','exam_syllabus_versions','exam_syllabus_nodes',
 'exam_syllabus_canonical_mappings','payment_orders','payment_transactions','billing_invoices','user_entitlements',
 'admin_audit_logs','current_affairs_articles']) AS t;
ROLLBACK;
```
(NULL = table does not exist.)

### S1
```sql
BEGIN READ ONLY;
-- S1-a
SELECT raw_user_meta_data->>'role' AS meta_role, count(*) FROM auth.users
WHERE raw_user_meta_data->>'role' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S1-b (masked)
WITH intended AS (SELECT unnest(ARRAY['<ADMIN_1>','<ADMIN_2>']) AS email)
SELECT regexp_replace(u.email, '^(.{2}).*@', '\1***@') AS email_masked,
       left(u.id::text, 8) AS id_prefix, u.created_at, u.last_sign_in_at,
       u.raw_user_meta_data->>'role' AS meta_role, u.raw_app_meta_data->>'role' AS app_role,
       (lower(u.email) IN (SELECT email FROM intended)) AS is_intended_admin
FROM auth.users u
WHERE u.raw_user_meta_data->>'role' IN ('admin','staff')
ORDER BY u.created_at;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S1-c
SELECT count(*) AS app_meta_admins FROM auth.users WHERE raw_app_meta_data->>'role' = 'admin';
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S1-e
WITH intended AS (SELECT u.id FROM auth.users u WHERE lower(u.email) IN ('<ADMIN_1>','<ADMIN_2>'))
SELECT count(*) AS total,
       count(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30d,
       count(DISTINCT actor_id) AS distinct_actors,
       count(DISTINCT actor_id) FILTER (WHERE actor_id NOT IN (SELECT id FROM intended)) AS non_intended_actors,
       count(*) FILTER (WHERE actor_id NOT IN (SELECT id FROM intended)) AS rows_by_non_intended
FROM public.admin_audit_logs;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S1-f step 1: generate per-table count queries for author-like columns (run the generated SQL in a new READ ONLY block)
SELECT string_agg(format(
  'SELECT %L AS tbl, %L AS col, count(*) AS rows_by_non_intended FROM public.%I WHERE %I IS NOT NULL AND %I NOT IN (SELECT id FROM auth.users WHERE lower(email) IN (''<ADMIN_1>'',''<ADMIN_2>''))',
  table_name, column_name, table_name, column_name, column_name), E'\nUNION ALL\n')
FROM information_schema.columns
WHERE table_schema='public' AND data_type='uuid'
  AND column_name IN ('created_by','updated_by','reviewed_by','approved_by','published_by','author_id','actor_id','verified_by');
ROLLBACK;
```

### S2
```sql
BEGIN READ ONLY;
-- S2-a
SELECT status, gateway, order_type, count(*) AS n, sum(total_payable_amount) AS total_payable
FROM public.payment_orders GROUP BY 1,2,3 ORDER BY 1,2,3;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S2-b
SELECT CASE WHEN gateway_payment_id ~ '^pay_[0-9]{13}_[a-z0-9]{6}$' THEN 'SIMULATED_checkout_client'
            WHEN gateway_payment_id ~ '^pay_[A-Za-z0-9]{14}$' THEN 'RAZORPAY_shaped'
            ELSE 'OTHER' END AS id_pattern,
       status, count(*) AS n, min(created_at) AS earliest, max(created_at) AS latest
FROM public.payment_transactions GROUP BY 1,2 ORDER BY 1,2;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S2-c (to_jsonb used because user_entitlements columns differ across migrations: status/is_active, valid_until/expires_at)
SELECT e.entitlement_type, to_jsonb(e)->>'status' AS status, to_jsonb(e)->>'is_active' AS is_active, count(*) AS n
FROM public.user_entitlements e GROUP BY 1,2,3 ORDER BY 1,2,3;
-- Active subscriptions whose user has a simulated-payment invoice (FK path: billing_invoices.transaction_id -> payment_transactions.id)
SELECT count(DISTINCT e.id) AS active_subs_from_simulated
FROM public.user_entitlements e
JOIN public.billing_invoices bi ON bi.user_id = e.user_id
JOIN public.payment_transactions pt ON pt.id = bi.transaction_id
WHERE e.entitlement_type = 'SUBSCRIPTION'
  AND coalesce(to_jsonb(e)->>'status','ACTIVE') = 'ACTIVE'
  AND coalesce((to_jsonb(e)->>'valid_until')::timestamptz, (to_jsonb(e)->>'expires_at')::timestamptz, 'infinity') > now()
  AND pt.gateway_payment_id ~ '^pay_[0-9]{13}_[a-z0-9]{6}$';
ROLLBACK;
```
(The second SELECT is the one the editor displays. Run the first separately if needed.)
```sql
BEGIN READ ONLY;
-- S2-d
SELECT count(*) AS paid_simulated_non_admin, coalesce(sum(o.total_payable_amount),0) AS unpaid_value
FROM public.payment_orders o
JOIN public.payment_transactions pt ON pt.order_id = o.id
JOIN auth.users u ON u.id = o.user_id
WHERE o.status = 'PAID'
  AND pt.gateway_payment_id ~ '^pay_[0-9]{13}_[a-z0-9]{6}$'
  AND lower(u.email) NOT IN ('<ADMIN_1>','<ADMIN_2>');
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S2-e
SELECT gateway, signature_verified, processing_status, count(*) AS n, max(received_at) AS latest
FROM public.payment_webhook_events GROUP BY 1,2,3;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S2-f
SELECT p.oid::regprocedure AS fn, p.proacl,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('fn_verify_and_fulfill_payment','fn_create_payment_order');
ROLLBACK;
```

### S3
```sql
BEGIN READ ONLY;
-- S3-a
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('canonical_taxonomy_nodes','taxonomy_aliases','exam_syllabus_versions',
 'exam_syllabus_nodes','exam_syllabus_canonical_mappings','exam_knowledge_documents','exam_doc_versions','exam_claims',
 'exam_claim_sources','exam_sources','exam_posts')
ORDER BY tablename, policyname;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S3-b platform-wide
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
  AND roles && ARRAY['authenticated','public','anon']::name[]
  AND (qual = 'true' OR with_check = 'true' OR (cmd='INSERT' AND with_check IS NULL))
ORDER BY tablename, policyname;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S3-c
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  AND table_name IN ('canonical_taxonomy_nodes','taxonomy_aliases','exam_syllabus_versions','exam_syllabus_nodes',
   'exam_syllabus_canonical_mappings','exam_knowledge_documents','exam_doc_versions','exam_claims','exam_claim_sources',
   'exam_sources','exam_posts')
GROUP BY 1,2 ORDER BY 1,2;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S3-d tampering indicators (generic via to_jsonb so missing columns don't error)
SELECT t AS tbl,
  (xpath('/row/n/text()',  query_to_xml(format('select count(*) as n from public.%I', t), false, true, '')))[1]::text AS row_count,
  (xpath('/row/mc/text()', query_to_xml(format('select max((to_jsonb(x)->>''created_at'')::timestamptz) as mc from public.%I x', t), false, true, '')))[1]::text AS max_created,
  (xpath('/row/mu/text()', query_to_xml(format('select max((to_jsonb(x)->>''updated_at'')::timestamptz) as mu from public.%I x', t), false, true, '')))[1]::text AS max_updated
FROM unnest(ARRAY['canonical_taxonomy_nodes','taxonomy_aliases','exam_syllabus_versions','exam_syllabus_nodes',
 'exam_syllabus_canonical_mappings','exam_knowledge_documents','exam_doc_versions','exam_claims','exam_claim_sources',
 'exam_sources','exam_posts']) AS t;
ROLLBACK;
```
```sql
BEGIN READ ONLY;
-- S3-e
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('canonical_taxonomy_nodes','taxonomy_aliases','exam_syllabus_versions',
 'exam_syllabus_nodes','exam_syllabus_canonical_mappings','exam_knowledge_documents','exam_doc_versions','exam_claims',
 'exam_claim_sources','exam_sources','exam_posts')
ORDER BY 1;
ROLLBACK;
```

### X1 / X2
```sql
BEGIN READ ONLY;
SELECT p.oid::regprocedure AS fn,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%') AS search_path_unpinned
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%'))
ORDER BY 1;
ROLLBACK;
```

### PENDING_USER_INPUT
- Is `ADMIN_EMAILS` set in **Vercel Production** env? (Answer with the name's presence only, yes/no.)
- Are `SUPABASE_SERVICE_ROLE_KEY` and any `RAZORPAY_*` keys set in Vercel Production? (yes/no)

---

## 10. Containment recommendations for SEC-1 (ranked, description only, NOT implemented)

1. **S2 — Immediately disable fulfilment.** Make `/api/billing/fulfill-order` return 503 (or hide checkout/pricing purchase buttons) until real Razorpay integration exists. Then rebuild the flow:
   - Server-side Razorpay order creation.
   - HMAC-SHA256 verification of `razorpay_order_id|razorpay_payment_id` with the key secret.
   - Verified webhook (`payment.captured`) as the source of truth.
   - Enforce `order.user_id = auth.uid()` in route and RPC.
   - Take the amount from the DB, never from the client.
   - Remove the anon-key fallback.
2. **S1 — Remove `user_metadata` from the authorization decision.** Use `app_metadata.role` (service-role writable only) and/or a server-side `admin_users` table. Require `ADMIN_EMAILS` (fail closed if unset) and remove the hard-coded emails from source (`admin.service.ts:232`, `:1269`). Move the `ensureProfile` side effect out of the auth check.
3. **S1 — Clean up flagged accounts.** Strip `role` from `raw_user_meta_data` for non-intended users found in S1-b, and force sign-out (revoke refresh tokens) for those users.
4. **S3 — New migration replacing the 11 `USING (true)` write policies** with an admin predicate (e.g. `public.is_admin()` backed by `app_metadata`/admin table, `SECURITY DEFINER`, pinned `search_path`). Keep public `SELECT` policies for published rows only. Consider revoking INSERT/UPDATE/DELETE grants from `authenticated` on these tables if writes go only through server/service role.
5. **S2 cleanup:** Use the S2-b/S2-d results to decide the business treatment of entitlements granted from simulated payments (grandfather, revoke, or convert). Review GST invoices issued for unpaid orders with your accountant.
6. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** if S1 exploitation is confirmed, because an attacker with admin UI access may have reached service-role-backed features.
7. **Observability:** expose the commit SHA (`VERCEL_GIT_COMMIT_SHA`) in `/api/health`, and enable Supabase log retention for PostgREST writes on S3 tables.
8. Deduplicate `.env.local` and rename the `POSTGRES_URL_NON_POOLING` value or variable (it is the pooler).

---

## 11. Open questions for the owner

1. Can you download the Supabase CA certificate (Option A) so the DB checks can run automatically under verified TLS? Or will you run §9 in the SQL Editor and paste back the outputs?
2. Is `ADMIN_EMAILS` set in Vercel Production? Who are the intended admins/staff, and are there any `staff` accounts by design?
3. Has any real money ever been collected (any Razorpay account/keys)? Or were all PAID orders to date test/simulated?
4. Is the payment flow intentionally in "demo mode" for launch? If so, should purchasing be disabled publicly right now?
5. Are there legitimate non-admin contributors who are supposed to write exam knowledge / syllabus data from the browser?
6. Do you have Supabase log retention (Pro plan) to look for historic PostgREST writes to S3 tables?

---

## 12. Final status

**Self-check:** this report was grepped for the five required patterns (JWT prefix, both Postgres URI schemes, Supabase secret-key prefix, Gmail domain): **0 hits each**. The patterns are described rather than written literally so the check stays clean. Emails are masked. No keys, tokens, connection strings, or full ids are included.

`SEC-0 STATUS: OPEN`. All three issues are confirmed from code, migrations, and deployment. Exploitation evidence and live DB state (Q0, S1-a…f, S2-a…f, S3-a…e, X1/X2) are **PENDING_USER_EXECUTION**, because verified TLS to Postgres could not be established without the Supabase CA certificate, and weakening TLS is prohibited.
