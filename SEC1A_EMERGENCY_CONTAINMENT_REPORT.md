# SEC-1A — Emergency Containment Report (S1 admin escalation, S2 unverified payments)

- **Date:** 2026-10-11
- **Base commit:** `b8bd693` (`main`). Changes are **uncommitted** in the working tree.
- **Inputs:** `SEC0_LIVE_SECURITY_VERIFICATION_REPORT.md`
- **Scope:** code only. No database, SQL, migration, RPC or data changes.

---

## 1. Files changed

`git diff --stat` (tracked files):
```
 app/api/billing/create-order/route.ts      |  5 +++
 app/api/billing/fulfill-order/route.ts     | 67 +++++++++++-------------------
 app/checkout/[orderId]/checkout-client.tsx | 58 ++++----------------------
 app/pricing/page.tsx                       |  3 +-
 app/pricing/pricing-client.tsx             | 16 ++++++-
 services/admin.service.ts                  | 24 +++++++----
 6 files changed, 72 insertions(+), 101 deletions(-)
```
New files: `config/payments.ts`, `scripts/test_sec1a_containment.cjs`, and this report.

| File | Rationale |
|---|---|
| `services/admin.service.ts` | **S1:** removed `user_metadata.role` from the authorization decision and removed both hard-coded personal admin emails. Added a fail-closed `getConfiguredAdminEmails()` helper, used in both places. Signature, return shape and the `ensureProfile` call are unchanged. |
| `config/payments.ts` (new) | Single server-side kill switch: `isPaymentsEnabled()` is true only when `PAYMENTS_ENABLED === "true"`. It is not a `NEXT_PUBLIC_` variable, so there is no client override. Also holds the shared 503 error payload. |
| `app/api/billing/fulfill-order/route.ts` | **S2:** returns 503 `PAYMENTS_TEMPORARILY_DISABLED` before any auth, DB or RPC work. The RPC call, the admin client and the **anon-key fallback are removed entirely**. With the flag on, it still refuses (501), because no gateway verification exists. |
| `app/api/billing/create-order/route.ts` | **S2:** same 503 gate before parsing the body or calling `BillingService`. Prevents new orders. |
| `app/checkout/[orderId]/checkout-client.tsx` | **S2:** removed the fabricated `pay_<ts>_<rand>` / `sig_<ts>` flow and the fetch to fulfill-order. Shows a "Payments are temporarily unavailable" banner and a disabled button. |
| `app/pricing/page.tsx` | Passes the server-evaluated `paymentsEnabled` flag to the client. |
| `app/pricing/pricing-client.tsx` | When `paymentsEnabled` is false: shows an unavailable banner, disables the "Upgrade" buttons with an unavailable label, and `handleCheckout` returns early. There is no navigation to checkout. |
| `scripts/test_sec1a_containment.cjs` (new) | Offline test suite with mocked Supabase and billing. No env file, network or DB. |

`/premium` (`app/premium/page.tsx`, `actions.ts`) contains **no purchase or checkout actions**. Its only upgrade entry points are links to `/pricing`, which now shows the disabled state, so `/premium` needed no change.

---

## 2. Before / after snippets

### S1 — `AdminService.checkIsAdminOrStaff()`
Before:
```ts
const adminEmails = (process.env.ADMIN_EMAILS || "ja***@g***.com,ja***@g***.com")   // personal emails, masked here
  .split(",")
  .map((e) => e.trim().toLowerCase());

const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
const isMetaAdmin = user.app_metadata?.role === "admin" || user.user_metadata?.role === "admin" || user.user_metadata?.role === "staff";
```
After:
```ts
function getConfiguredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
...
const adminEmails = getConfiguredAdminEmails();

const isEmailAdmin = user.email ? adminEmails.includes(user.email.toLowerCase()) : false;
// Only app_metadata is trusted: it is writable by the service role alone.
// user_metadata is user-editable via auth.updateUser() and must never grant access.
const appRole = user.app_metadata?.role;
const isMetaAdmin = appRole === "admin" || appRole === "staff";
```
The second hard-coded list (admin user listing, previously `~line 1269`) now also uses `getConfiguredAdminEmails()`.
- **Behaviour change:** `app_metadata.role === "staff"` now grants access. Before, only `app_metadata.role === "admin"` did; `staff` was honoured only through the untrusted `user_metadata`. This keeps legitimate staff working through the trusted channel.

### S2 — `POST /api/billing/fulfill-order`
Before (excerpt):
```ts
const { data: { user } } = await supabaseUser.auth.getUser();
if (!user) return 401;
const { orderId, gatewayPaymentId, gatewaySignature, ... } = await request.json();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
... rpc("fn_verify_and_fulfill_payment", { p_order_id: orderId, p_gateway_payment_id: gatewayPaymentId, ... })
```
After:
```ts
export async function POST() {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ success: false, error: PAYMENTS_DISABLED_ERROR }, { status: 503 });
  }
  // Even with the flag on, never fulfil without server-side gateway verification.
  return NextResponse.json({ success: false, error: { code: "PAYMENT_VERIFICATION_NOT_IMPLEMENTED", ... } }, { status: 501 });
}
```
`PAYMENTS_DISABLED_ERROR = { code: "PAYMENTS_TEMPORARILY_DISABLED", message: "Online payments are temporarily unavailable." }`

**Design note:**
- The prompt asked for a 503 when the flag is false. It did not say what should happen when the flag is true.
- Restoring the old RPC path behind the flag would let anyone re-open S2 just by setting `PAYMENTS_ENABLED=true`, so the route never calls the RPC.
- Real fulfilment must be rebuilt in SEC-1 with signature and webhook verification. The old code remains in git history (`b8bd693`).

### S2 — `POST /api/billing/create-order`
Before: parsed the body and called `BillingService.createPaymentOrder(payload)` directly.
After: the same, preceded by:
```ts
if (!isPaymentsEnabled()) {
  return NextResponse.json({ success: false, error: PAYMENTS_DISABLED_ERROR }, { status: 503 });
}
```

---

## 3. Every `user_metadata` hit and what was done with it

Search: `rg "user_metadata" app services lib actions components middleware.ts`

| Location | Use | Action |
|---|---|---|
| `services/admin.service.ts:237` (old) | **Authorization:** `user_metadata.role` admin/staff | **Removed.** Only `app_metadata.role` is trusted. |
| `services/admin.service.ts` (~1290) `const meta = u.user_metadata \|\| …` | Admin user list: display name, and `role` label shown when the user isn't in `ADMIN_EMAILS` | Unchanged. Display only, never used for an access decision. **Kept on purpose:** during SEC-1 triage it shows admins which accounts have self-assigned `role=admin`. |
| `services/admin-premium.service.ts:653` | `full_name` display | Unchanged (display name) |
| `services/assessment.service.ts:830` | `full_name` display | Unchanged |
| `services/dashboard.service.ts:135` | `full_name` display | Unchanged |
| `services/premium-hub.service.ts:137` | `full_name` display | Unchanged |
| `services/user-profile.service.ts:23,34` | Type, plus `full_name` / `language_preference` for the profile upsert | Unchanged |
| `components/layout/header.tsx:35` | `full_name` display | Unchanged |

No other authorization check in `app/`, `services/`, `lib/`, `actions/`, `components/` or `middleware.ts` reads a role from `user_metadata` (asserted by test S1-12). `components/admin/admin-users-manager.tsx:155` only styles a badge from the listed `role`.

Payment-flow references (`fulfill-order|create-order|fn_verify_and_fulfill_payment|fn_create_payment_order`):
- `checkout-client.tsx`: the fulfill call is removed.
- `pricing-client.tsx`: the create-order call is gated.
- `services/billing.service.ts:185`: calls `fn_create_payment_order`. Reached only through the gated create-order route; unchanged.
- No other caller of `fn_verify_and_fulfill_payment` exists.

---

## 4. Test results

**SEC-1A suite:** `node scripts/test_sec1a_containment.cjs` gives **20/20 passed**.

| # | Test | Result |
|---|---|---|
| S1-1 | `user_metadata.role=admin`, no `app_metadata`, email not listed → false | PASS |
| S1-2 | `user_metadata.role=staff` → false | PASS |
| S1-3 | `user_metadata.role=admin` with `ADMIN_EMAILS` unset → false | PASS |
| S1-4 | `app_metadata.role=admin` → true | PASS |
| S1-5 | `app_metadata.role=staff` → true | PASS |
| S1-6 | Email in `ADMIN_EMAILS` (case-insensitive, trimmed) → true; return shape intact | PASS |
| S1-7 | `ADMIN_EMAILS` unset / `""` / `" , "` → previously hard-coded addresses get **false** (addresses loaded from `git show b8bd693`, never stored in the test file) | PASS |
| S1-8 | Empty / odd `ADMIN_EMAILS` entries never match empty emails | PASS |
| S1-9 | No user → false | PASS |
| S1-10 | Static: no `user_metadata.role` / `user_metadata?.role` in `admin.service.ts` | PASS |
| S1-11 | Static: no `@gmail.com` literal in `admin.service.ts` | PASS |
| S1-12 | Static: no `user_metadata` role check anywhere in app/services/lib/actions/components | PASS |
| S2-1 | fulfill-order, with and without fake session, 2 bodies each → 503 `PAYMENTS_TEMPORARILY_DISABLED`; RPC, `createClient` and `getUser` spies all at 0 | PASS |
| S2-2 | fulfill-order with `PAYMENTS_ENABLED=true` → 501; RPC never invoked | PASS |
| S2-3 | create-order → 503; `BillingService.createPaymentOrder` never invoked | PASS |
| S2-4 | Strict flag: unset/`""`/`"1"`/`"TRUE"`/`"yes"`/`"false"` → 503 on both routes | PASS |
| S2-5 | create-order with `PAYMENTS_ENABLED=true` reaches BillingService (proves the gate is the flag) | PASS |
| S2-6 | Static: fulfill-order has no anon key, service-role key, `createClient` or RPC reference | PASS |
| S2-7 | Static: `checkout-client.tsx` no longer generates `pay_` ids or calls fulfill-order | PASS |
| S2-8 | Static: flag is server-side only; pricing client doesn't read env; pricing page passes the server flag | PASS |

**Global gates**

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** (exit 0) |
| `npm run lint` | **0 errors, 249 warnings** (exit 0). **None of the warnings are in changed files.** Examples: unused eslint-disable directives in `lib/admin/bulk-importer.ts`. |
| `npm run build` | **Success** (exit 0). Its only warnings are webpack cache notices and the Supabase Edge Runtime notice from `lib/supabase/middleware.ts`; neither comes from this change. All affected routes are dynamic (`ƒ`): `/api/billing/create-order`, `/api/billing/fulfill-order`, `/checkout/[orderId]`, `/pricing`. |
| `git diff --stat` | Only the 6 intended tracked files, plus the 2 new files and this report |

---

## 5. Data-safety confirmation

- **Zero direct DB connections:**
  - No `pg` client was used.
  - The test suite deletes `SUPABASE*`/`POSTGRES*`/`DATABASE_URL` from its environment, never reads `.env.local`, and mocks every Supabase module.
  - **Caveat:** `npm run build` uses `.env.local` as Next.js always does. Its static generation may make the app's normal **read-only** Supabase HTTP API fetches. No writes are issued at build time.
- **Zero SQL, zero migrations, zero RPC edits, zero data changes.** Orders, invoices, entitlements and user metadata are untouched.
- No scripts in `scripts/` or `scratch/` were run, except the new offline test.
- No secrets were printed or written. Personal emails appear only masked (`ja***@g***.com`) in this report.
- No TLS weakening was added. The new test does not set `NODE_TLS_REJECT_UNAUTHORIZED`.
- Nothing was committed or pushed.

---

## 6. Owner deployment checklist

**Before deploying (Vercel → Project → Settings → Environment Variables → Production):**
1. **Set `ADMIN_EMAILS`** = comma-separated list of the intended admin/staff emails. ⚠️ **Required.** Without it the hard-coded fallback is gone and **no one has admin access**, unless their account has `app_metadata.role` set.
2. **`PAYMENTS_ENABLED`:** leave **unset**, or set it to `false`.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set. Other server features need it, though fulfill-order no longer uses it.
4. **Local dev:** add `ADMIN_EMAILS` to `.env.local` as well, or local `/admin` access will stop working. (I did not edit `.env.local`.)

**Deploy**, then verify:
1. Run:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" -d "{}" https://couragelibrary-next.vercel.app/api/billing/fulfill-order
   ```
   Expect **503**. Before this change it returned 401.
2. Same with `/api/billing/create-order`: expect **503**.
3. Open `/pricing`: the amber "Payments are temporarily unavailable" banner shows and the Upgrade buttons are disabled.
4. Open an existing `/checkout/<orderId>` as its owner: the banner shows, the button is disabled, and nothing happens on click.
5. Sign in as the owner (an email listed in `ADMIN_EMAILS`) and open **`/admin`**: it must load.
6. Optional: a non-admin test account that ran `auth.updateUser({ data: { role: "admin" } })` must **not** get into `/admin`. Use a throwaway test account only.

**Rollback:** revert this change. Note that rolling back **re-opens S1 and S2**.

---

## 7. Residual risk (NOT fixed by SEC-1A)

1. **S3:** 11 tables still have `FOR ALL TO authenticated USING (true) WITH CHECK (true)`. Any signed-in user can write to or delete exam knowledge and syllabus data through PostgREST. Needs a SEC-1 migration.
2. **No real payment integration:** no Razorpay order creation, signature HMAC verification or webhook processing. Payments stay off until these exist.
3. **Already-granted entitlements and invoices:** all PRO entitlements and GST invoices issued so far came from fabricated payment ids. They are still active and untouched. A decision is needed after the SEC-0 DB evidence (S2-b/S2-d).
4. **Self-assigned admin flags:** any `raw_user_meta_data.role = admin|staff` values still exist in `auth.users`. They no longer grant access, but they should be audited (SEC-0 S1-b) and cleaned. Any sessions that abused admin before deployment may already have changed data. Check `admin_audit_logs` (SEC-0 S1-e).
5. **Key rotation:** if SEC-0 shows S1 was exploited, rotate `SUPABASE_SERVICE_ROLE_KEY` and review admin-made changes.
6. **Direct RPC:** `fn_create_payment_order` stays executable by `authenticated` via PostgREST. Users can still create PENDING orders directly, but cannot fulfil them: `fn_verify_and_fulfill_payment` is service-role-only, and its only caller is now disabled. That is low risk, but it adds clutter.
7. **`ensureProfile` side effect:** every admin check still upserts `user_profiles`. Left in place per scope.
8. **Out-of-scope observation:** existing test suites (e.g. `scripts/test_ca_public_read_regression.cjs`) set `NODE_TLS_REJECT_UNAUTHORIZED = '0'` and connect to production. Recommend fixing in a later phase.
9. **SEC-0 is still OPEN:** live DB evidence (exploitation status) is pending the Supabase CA certificate or a manual SQL Editor run.

---

SEC-1A STATUS: CLOSED. S1 and S2 are contained in code: 20/20 tests pass, tsc and lint show 0 errors, and the build succeeds. Containment is not live until the owner sets `ADMIN_EMAILS` in Vercel Production and deploys. Nothing is committed.
