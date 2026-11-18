# PAY-1 Phase A: payments inspection and design

**Status: Phase A done; B1 released (migration 140 applied 2026-11-14); B2 next.** Phase A itself was inspection only:
no code, no database write, no Razorpay dashboard or key change. No key value is printed or written here.

Inspected 2026-11-14 on main `4adacb3`.

**Locked decisions (owner):**
- one-time plans for 3, 6 or 12 months, with no auto-renew;
- a 7-day refund on the first purchase, if at most 1 full Pro mock was attempted, once per user;
- the Razorpay live keys and webhook are not changed before the cutover;
- live keys never go into the new app before the cutover.

**Method:**
- Code read with file:line evidence (two read-only code reviews, their key claims re-checked by hand).
- Read-only production checks, counts and booleans only. They ran in one read-only transaction that is always rolled
  back, partly as the free QA student (role `authenticated`, SELECT statements only).

Legend: **F9** is the new one-time Pro path (`lib/payments/*`, `app/(site)/pricing`, migrations 113/114). **Legacy** is
the older `subscription_plans` + GST-invoice path (migrations 017/018/019/064/106, `services/billing.service.ts`,
`app/api/billing/*`, `app/(site)/checkout/*`, `/admin/payments`).

## 1. Findings

### 1.1 Payment path, end to end

| Step | F9 (new) | Legacy (pre-F9) |
|---|---|---|
| **Plans / prices** | DB table `pro_plan_versions` (113:22-44): PRO_3M ₹299, PRO_6M ₹499, PRO_12M ₹799, PRO_12M_FOUNDING ₹599, INR only, durations 3/6/12 only, one active version per plan. **db:** 4 active versions. The founding plan is shown only while `founding_offer.sold < founding_limit` (113:54-75; `pro-server.ts:145-147`). | `subscription_plans` (017:10). Still read by `billing.service.ts:103-126`; admins can still create rows (`admin/actions.ts:1203-1213`). |
| **Auto-renew** | None. A new purchase **stacks**: it starts at max(now, current end) (114:174-178). The UI says "no auto-renew" (`pricing-client.tsx:187,226`). | none |
| **Order** | Server action `createProOrderAction(planCode, idempotencyKey)` (`pricing/actions.ts:16-25`) → `fn_create_pro_order` (114:40-107). It checks 18+, an advisory lock, 5 orders per 10 min, an active plan and the founding limit. The **amount is the server snapshot**, never the client's. Then Razorpay `POST /orders` with our own order id as receipt, and the response is checked (`razorpay-core.ts:225-228`). `fn_attach_gateway_order` → PENDING. Idempotency key per page view; `gateway_order_id` and `idempotency_key` are UNIQUE (017:59,61). | `/api/billing/create-order` → **410** (`route.ts:8-10`). `fn_create_payment_order`: client EXECUTE revoked (113:145). `BillingService.createPaymentOrder` has no caller. |
| **Checkout** | Razorpay `checkout.js` in `pricing-client.tsx:68-131`. Key id from the server env `RAZORPAY_KEY_ID`, never `NEXT_PUBLIC_` (gate `test_f9b_payments.cjs:271`). `rzp_live_…` is refused unless `RAZORPAY_LIVE_APPROVED=true` (`config/payments.ts:28-33,51`). | `/checkout/[orderId]`: the pay button is permanently disabled. |
| **Client verify** | `POST /api/payments/verify`: needs a session; 503 while checkout is closed. HMAC-SHA256 of `order_id|payment_id`, **constant-time** (`razorpay-core.ts:111-124`). The order must be the caller's own. The **payment is re-fetched** from Razorpay. Amount (integer paise), currency (INR), order id and status are checked (`razorpay-core.ts:149-157`). An *authorized* payment is captured server-side, then checked again (`pro-flows.ts:280-290`). Then `fn_fulfil_pro_order(…,'CLIENT_VERIFY')`. | `/api/billing/fulfill-order` → 503/501, never fulfils. |
| **Webhook** | `POST /api/webhooks/razorpay`, see 1.4. | `fn_process_payment_webhook` (106:15): service_role only, no caller. |
| **Pro activation** | `fn_fulfil_pro_order` (114:128-210): row lock + advisory lock; inserts `payment_transactions`, `user_entitlements` (PRO_SUBSCRIPTION, starts_at, expires_at, source PAYMENT, order_id) and `payment_receipts`; order → PAID; audit row. All 8 F9 functions are SECURITY DEFINER, `search_path ''`, **service_role only** (114:350-365). The app calls them only with the admin client, so activation is server-side only. | `fn_verify_and_fulfill_payment` (106:49): service_role only, no caller. It **writes columns that do not exist** in `user_entitlements` (106:133-151 vs 007:173-190), so it is a latent broken path. |
| **Receipts** | `payment_receipts` (`CL-R-YYMMDD-XXXXXX`, no GST, owner-only RLS; 113:107-129). Listed on `/billing` when PRO_ENABLED is on. The **receipt email is a stub** (`pro-server.ts:72-75`). | GST invoices: `billing_invoices` (017:120). Still read on `/billing` (`billing.service.ts:219-245`). |
| **Refunds** | **Webhook only:** `refund.processed` → `fn_refund_pro_payment` (114:231-298). Idempotent per refund id; refuses more than was paid. A full refund deactivates the entitlement; a partial one shortens it pro rata. No refund API call and no admin refund UI: refunds are started in the Razorpay dashboard (F9_DESIGN §3.10). | none |

**db (production, counts):** 0 payment orders, 0 PRO orders, 0 webhook events, 0 active entitlements, 0 COURSE_PURCHASE
entitlements. Nothing has been bought yet.

### 1.2 Pro lock: where Pro content is enforced

- **Pro is represented** by `user_entitlements` (PRO_SUBSCRIPTION / PROMOTIONAL_PASS, active, not revoked, started, not
  expired). The canonical check is `fn_has_pro` (114:24-38, service_role only). The app wrapper `hasPro()`
  (`pro-server.ts:78-86`) **has no callers**.
- **Lesson paywall:** decided in the app only. A lesson is Pro when it is in a LIVE FREE_N course and its position in the
  chapter is above `LESSON_FREE_PER_CHAPTER` (`lib/learning/chapter-access.ts:25-32`). With `PAYMENTS_ENABLED` off,
  nothing is gated (`lesson-access-settings.ts:20`). The view check is `LearningResolverService.getViewerAccess`
  (`learning-resolver.service.ts:310-327`).

**Proof as a free signed-in user** (read-only transaction, the QA student, 0 entitlements):

| Content | SQL / RLS protection (live catalog) | Free user can read it? |
|---|---|---|
| Lesson body `document_versions.blocks` / `lesson_meta` | column grant withheld from `authenticated` | **No.** Refused with `42501` (control, proven). |
| Lesson quick-check answer key + feedback | `fn_lesson_quick_check_answer`: SECURITY DEFINER, executable by `authenticated`, **no Pro check** (live definition) | **Yes, once Pro lessons exist.** It returns `correct_option_id` + feedback for any published lesson; ids are guessable or probeable. Also reachable signed-out: the server action `answerQuickCheckAction` uses the admin client with no lock check (`app/(site)/learn/actions.tsx:73-90`). |
| Lesson structure / completion | `fn_lesson_progress_save`, `fn_lesson_complete`: **no Pro check** | **Yes:** block-id oracle, quick-check count, reading length. A locked lesson can be marked COMPLETED (coins are off today by DB switch). |
| Premium mock questions (`mock_tests.is_free=false`) | `authenticated` has SELECT on `mock_tests`, `mock_questions`, `question_versions` and `question_options`; their live SELECT policies **do not mention `is_free` or Pro** | **Yes, structurally.** Question text and options are readable via PostgREST without starting an attempt. **Today 0 premium mocks exist**, so the proof query returned 0 rows. |
| Premium mock answers + explanations | `question_answers`: no SELECT for `authenticated` ✔; but `fn_check_practice_answer` (SECURITY DEFINER, `authenticated`) has **no Pro check** | **Yes, probably,** once premium mocks exist: it returns `correct_option_key` + `explanation_md` for a servable version (rate limit 30/min, 1,500/day). |
| PRO flashcard decks | RLS `p_fcards_select`: card ≤ 3 OR **any** active, unexpired entitlement (no type, not `revoked_at`) | No for a user without entitlements; **yes for any entitlement type**. **db:** 0 PRO decks today. |
| Legacy courses `course_lessons.video_url` | policy `is_published` only | Yes if PRO rows exist; the feature is off (`FEATURE_COURSES`). |
| `search_indexes` PRO rows | policy checks entitlement type `'SUBSCRIPTION'`, which does not exist | No, but it also **hides them from paying users**. |

**db:** 0 gated lesson documents and 0 FREE_N launches today. So **no Pro content exists yet and nothing leaks today.**
Every "yes" above becomes a real leak the moment Pro content (gated lessons, premium mocks, PRO decks) is published with
payments on.

**PRO-LOCK-SQL-1 (BACKLOG):**
- *Exists:* `fn_has_pro`, `fn_gated_course_document_ids()`, the FREE_N `access_mode`, `LESSON_FREE_PER_CHAPTER`, chapter
  positions.
- *Missing:*
  - a database-side paywall switch (`PAYMENTS_ENABLED` is env-only);
  - an "is this lesson locked for `auth.uid()`" SQL function;
  - the refusal inside the 3 lesson RPCs and the visitor server action;
  - any Pro check on premium mock content (RLS + `fn_check_practice_answer`);
  - real-role negative tests.

**Other inconsistent Pro checks (app):**
- `flashcard.service.ts:198-206`: any active entitlement, no type or expiry check; two rows make `maybeSingle` error,
  which reads as "no Pro".
- `learning-resolver.service.ts:315-326`: its own query, without `revoked_at` (harmless today: a refund also clears
  `is_active`).
- `BillingService.getUserSubscriptionStatus` reads legacy columns and **always returns FREE**, so `/billing` and the
  payments-off pricing view never show F9 Pro.
- `grantPromotionalPass` (`admin-premium.service.ts:665-722`) writes PROMOTIONAL_PASS rows directly. They can be
  exam-scoped but count as global Pro in `fn_has_pro`.
- Free-tier limits (`free_practice_daily` 30, `free_memory_lock_active` 50, `free_daily_mock` 1; 113:56-58) are defined
  but **not enforced anywhere**.

### 1.3 Flags

| Flag | Where | Default | Gates |
|---|---|---|---|
| `PAYMENTS_ENABLED` | env (`config/payments.ts:12-14`), exactly `"true"` | false | `checkoutState` step 1; pricing view; lesson paywall (off means nothing is gated); FREE_N launch mode; admin "Plans & payments" nav |
| `PRO_ENABLED` | env (`config/payments.ts:22-24`) | false | `checkoutState`; Pro pricing view; receipts on `/billing`; dashboard "ending soon" banner; reminders cron |
| `RAZORPAY_LIVE_APPROVED` | env (`config/payments.ts:51`) | false | lets a `rzp_live_` key open checkout |
| key presence | `RAZORPAY_KEY_ID` / `_KEY_SECRET` / `_WEBHOOK_SECRET` | none | all three required, or `KEYS_MISSING` |
| `REFUND_POLICY_PUBLISHED` | **a code constant `false`** (`config/payments.ts:43`), not an env | false | `checkoutState` → `REFUND_POLICY_MISSING`; so order creation, verify (503) and webhook (503) are all closed while false |

**F9-B gate wrong folder (confirmed):** `scripts/test_f9b_payments.cjs:136` checks `app/refund-policy/page.tsx`. The page is
`app/(site)/refund-policy/page.tsx` (LEGAL-PAGES-1; the LEGAL gate uses the right path). The comment at
`config/payments.ts:39` names the same wrong path. Today the check is skipped because the constant is false. The change
that flips it to `true` would fail CI gate PB-01 although the page exists. Fix: both paths →
`app/(site)/refund-policy/page.tsx`.

### 1.4 Webhook

- **Signature:** HMAC-SHA256 over the **raw body** with `RAZORPAY_WEBHOOK_SECRET`, constant-time, checked before JSON
  parsing (`razorpay-core.ts:126-129`; `pro-flows.ts:341-351`) ✔.
- **Events:**
  - `payment.captured` and `order.paid` → PAID;
  - `payment.failed` → FAILED;
  - `refund.processed` → REFUND;
  - all others ignored, including `refund.created` and `refund.failed` (`razorpay-core.ts:170-187`).
- **Idempotency** ✔:
  - the event id is claimed in `payment_webhook_events` (unique per gateway + event id); a duplicate that was
    PROCESSED or IGNORED returns `duplicate`;
  - `payment_transactions.gateway_payment_id` is UNIQUE;
  - one entitlement per order (113:103) and one receipt per order (113:111).
  - A duplicate still PENDING is re-processed concurrently, protected by DB locks and unique constraints (by design,
    gate PB-06; not re-proven here).
- **Out of order:**
  - FAILED never overwrites PAID (114:224-225);
  - a FAILED order can still be fulfilled later (114:166);
  - a refund before fulfilment → PAYMENT_NOT_FOUND → event FAILED → **409**, so Razorpay redelivers.
- **Amount / currency:** body amounts are **never trusted**; the payment is re-fetched; amount, currency and order id
  are compared with the snapshot in the app **and** again in SQL (114:169-171) ✔.
- **Server-authoritative activation:** ✔ (`fn_fulfil_pro_order(…,'WEBHOOK')`, service_role only).
- **Audit trail:**
  - `payment_webhook_events` (raw payload, status, error, processed_at);
  - `admin_audit_logs` PRO_ORDER_FULFILLED / REFUNDED / PARTIALLY_REFUNDED;
  - ids-only failure logs.
- **Gap:** a payment that is only *authorized* via webhook is **not captured** (202 `not_captured_yet`, event IGNORED;
  `pro-flows.ts:281,413-414`). If the browser never calls verify, nothing captures it unless Razorpay **auto-capture**
  is on. There is also **no reconciliation job** for orders stuck in PENDING. Both matter because the Refund Policy
  promises a refund if Pro is not active within 24 hours.

### 1.5 Expiry, reminders, refund tracking

- **Expiry:** `expires_at = start + duration_months`, computed at fulfil time; enforced on read (`fn_has_pro` ⇒
  `expires_at > now()`). No job is needed for access.
- **What the legal text promises (`content/legal/legal-pages.ts`):**
  - Terms: "We remind you by email and on the Platform 7 days and 1 day before your plan ends" (:76).
  - Refund Policy: "Access ends on the date shown in Account → Billing. We remind you 7 days and 1 day before." (:504).
- **Reminder machinery today:**
  - Cron route `/api/cron/pro-reminders`: `CRON_SECRET`, constant-time. It **only counts** D7/D1 due reminders and
    **sends nothing**.
  - It is **not scheduled** (`vercel.json` lists only `/api/cron/finalize-attempts`).
  - Table `pro_reminders_sent` (unique entitlement + D7/D1) exists.
  - The in-app "ending soon" banner exists (last 7 days; dashboard).
  - **No email transport** exists for app mail (the receipt and reminder emails are stubs).
  - `/billing` cannot show the end date today: `getUserSubscriptionStatus` reads legacy columns.
- **Refund tracking: not implemented.** Nothing records:
  - "first purchase";
  - "within 7 days";
  - "≤ 1 full Pro mock attempted";
  - "refund already used once".

  There is no admin view of refund eligibility and no refund UI. A refund is a manual Razorpay-dashboard action.
  `fn_refund_pro_payment` then deactivates or shortens access, but does **not** return a founding seat, and does not move
  later stacked periods earlier.
- **Other refund rows of the policy:**
  - double charge → full refund of the extra charge;
  - not activated within 24 h → full refund;
  - feature removed → pro rata.

  All are manual today; nothing detects a double charge or a stuck activation.

### 1.6 What can be tested with Razorpay TEST keys before cutover

**Everything in the F9 path.** `checkoutState` accepts `rzp_test_` keys with no extra approval.

**Constraint:** this project has **one Supabase database shared with production**. A test-mode payment writes real rows
(`payment_orders`, `payment_transactions`, `user_entitlements`, `payment_receipts`, audit) into production tables, and
`payment_orders` has no test/live marker (unverified; 017 has no such column). Test mode therefore needs:
1. a **QA allow-list**: test-mode checkout only for the QA identities;
2. a **mode marker** on orders (`gateway_mode`), so reports and refunds never mix test and live;
3. a **non-production host** for the test keys. Production stays on payments-off until the cutover.

See section 4.

## 2. Gaps, ordered by launch risk

| # | Gap | Risk | Blocks |
|---|---|---|---|
| G1 | **Pro content readable without Pro in SQL**: the lesson answer key (`fn_lesson_quick_check_answer` + the visitor action with the admin client), lesson structure / completion RPCs, premium mock questions (RLS) and answers (`fn_check_practice_answer`) | **Critical:** paid content free for anyone signed in (the quick-check answers also signed out) | turning on any Pro content |
| G2 | **Checkout cannot open:** `REFUND_POLICY_PUBLISHED` is a code constant; the F9-B gate checks the wrong folder | blocker, trivial fix | any test-mode run |
| G3 | **"Paid but not Pro":** an authorized-only payment is not captured from the webhook; no reconciliation for PENDING orders | High: the 24-hour activation promise, double charges, refunds | live launch |
| G4 | **Paying user sees "Free":** `/billing` / `getUserSubscriptionStatus` read legacy columns; `hasPro()` is unused; checks are inconsistent (flashcards: any entitlement; `search_indexes`: a non-existent type; promotional pass scope) | High: support load, wrong access | live launch |
| G5 | **Legal promises not met:** no D7/D1 reminder emails (cron unscheduled, no transport), no receipt email, end date not on `/billing` | High (Terms / Refund Policy wording) | live launch |
| G6 | **Refund eligibility not tracked:** first purchase, 7 days, ≤ 1 Pro mock, once per user; no admin view; refunds only via the dashboard | High: the policy cannot be applied consistently | live launch |
| G7 | **Test mode would write into production tables** without a mode marker or allow-list | High for the test phase | Phase B test runs |
| G8 | **Legacy leftovers (PAY-LEGACY-RETIRE-1):** broken SECDEF `fn_verify_and_fulfill_payment` / `fn_process_payment_webhook`, `fn_create_payment_order`; `/checkout/success` shows "PAYMENT VERIFIED & PRO ACTIVATED" to any visitor; admin can create legacy plans; legacy GST invoices on `/billing`; the stale gate `test_sec1a` S2-5 | Medium | live launch |
| G9 | Free-tier limits defined but not enforced | Medium (product) | owner decision |
| G10 | Refund edge rules: founding seat not returned; stacked periods not shifted; receipt-number collision aborts fulfilment (6 hex characters under UNIQUE) | Low | before volume |

## 3. Phased plan (each phase: local branch → tests → owner "release")

| Phase | Scope | Tests (new or extended gates) |
|---|---|---|
| **B1: hygiene + legacy retire** | Fix the F9-B path + comment; turn `REFUND_POLICY_PUBLISHED` into a reviewed constant flip (stays false until B7). `/checkout/*` → redirect to `/pricing` / `/billing`. `/billing` + payments-off pricing read F9 (`hasPro`, the entitlement end date). Remove admin legacy-plan creation. Migration: drop (or revoke + comment) the legacy payment functions; lower the SECDEF allow-list. Retire the stale S2-5 test. | F9-B PB-01 with the real path (negative: a wrong path fails); SECDEF ratchet −3; page smokes for `/checkout/*` → redirect; `/billing` shows Pro end date for a seeded entitlement (rolled-back live gate) |
| **B2: access policy + close the 5 bypass paths** (superseded design: section 7) | The `access_policies` table, the paywall master switch (off), the ONE central check `fn_access_allowed`, the admin "Free & Pro" page (audited), the D1 seed. D2 enforcement: mock content only through a server-started attempt; answers and explanations only after submit. The quick-check and practice-answer RPCs and the visitor server action call the central check. | Executed with the free QA student, rolled back: each of the 5 paths (A–E) refused; admin flips an item FREE↔PRO → the student's access follows; a non-admin cannot change policy; an unknown item is locked; switch off → today's behaviour. LOCAL_PG_TEST first; EARLIER-GATES (lesson 136/137, practice 093, mock gates) |
| **B3: every check through the central function** | Analytics, Mistake Vault, Memory Lock, flashcards, mock start, lessons and `/billing` call `canAccess(kind, key)` (server) / `fn_access_allowed` (SQL). Remove the hard-coded rules (`is_free`, `access_tier`, FREE_N, `LESSON_FREE_PER_CHAPTER`, the flashcard entitlement query, the `search_indexes` 'SUBSCRIPTION' policy). Promotional-pass scope (D10). | A static gate: no Pro rule outside the central function (allow-list); live gates per feature: free refused with the switch on, allowed with it off or with the item FREE; expired / revoked / COURSE_PURCHASE ≠ Pro |
| **B4: payment robustness** | Capture rule (D3); a **reconciliation job** for PENDING orders older than N minutes: fetch the order's payments → fulfil or mark FAILED; refund-before-fulfil handled; receipt number with retry on collision; `gateway_mode` column + QA allow-list for test mode (G7) | Unit tests with a fake Razorpay; webhook duplicate / out-of-order / amount-mismatch cases; reconciliation idempotency; test-mode e2e (section 4) |
| **B5: emails + reminders** | App mail transport (D8). Receipt email after fulfil. Cron scheduled daily: D7 / D1 email + in-app, idempotent via `pro_reminders_sent`. `/billing` shows the end date. | Cron with a fake clock: exactly one D7 and one D1 per entitlement; no mail for expired / refunded; `CRON_SECRET` negative; template allow-list (like the auth emails) |
| **B6: refund operations** | Refund-eligibility record: first purchase, purchase time, count of full Pro mock attempts (D5), refund used once. Admin refund view; refund execution per D4; founding-seat rule (D6); stacked-period rule (D7) | Eligibility unit tests (7-day boundary, 2 mocks → not eligible, second refund → not eligible); `refund.processed` idempotency; admin authz (SEC1B/1C registries) |
| **B7: test-mode end to end** | Section 4 on the test host with TEST keys; flip `REFUND_POLICY_PUBLISHED` (reviewed). | Scripted checklist + live gates on the test host |
| **B8: cutover (owner)** | At cutover only: live keys + webhook URL in the new project, `RAZORPAY_LIVE_APPROVED=true`, `PRO_ENABLED` / `PAYMENTS_ENABLED`, DB paywall switch, in DEPLOY-BEFORE-ACTIVATE order | Anonymous prod smoke; one real low-value purchase by the owner + refund (optional, D11) |

**Order:**
- **B1 → B2 → B3** can ship while payments stay off (they only harden).
- **B4–B6** are needed before live payments.
- **B7** proves everything with TEST keys.
- **B8** is the cutover.

## 4. Test-mode plan (Razorpay TEST keys, before cutover)

1. **Host:** a Vercel **Preview** deployment (or a separate test project) with Preview-scoped env:
   - `rzp_test_` key id, key secret and webhook secret;
   - `PAYMENTS_ENABLED` / `PRO_ENABLED` = `true`.

   Production keeps payments off and never gets any key before cutover. The webhook needs a public URL: Razorpay test
   dashboard → Webhooks → the Preview URL `…/api/webhooks/razorpay`, with Deployment Protection bypassed for that path
   only (or a protection-bypass token).
2. **Who can pay:** the QA allow-list only (B4), so nobody else can make a test-mode order in the shared database.
3. **Scenarios (each with the expected DB state, checked by a rolled-back read):**
   - success via verify;
   - success via **webhook only** (close the tab after paying);
   - failed payment (`failure@razorpay` UPI / test failure card);
   - **duplicate webhook** (resend from the dashboard) → `duplicate`, one entitlement;
   - **out of order:** refund before fulfil → 409, then success after fulfil;
   - **authorized, not captured** (auto-capture off in the test account) → the B4 capture / reconciliation rule;
   - **full refund** → Pro off;
   - **partial refund** → shortened period;
   - **founding limit** reached → plan hidden;
   - **stacking:** a second purchase starts at the old end;
   - **idempotency:** a double click → one order;
   - **rate limit:** 6 orders in 10 minutes → refused;
   - **18+ missing** → refused;
   - **expiry / reminders** with a seeded short entitlement on a QA account (D7 / D1 mails to a QA mailbox).
4. **Clean-up:** test-mode rows are tagged `gateway_mode='test'`. They are excluded from revenue and admin totals, and
   removed per the owner's rule after B7.

## 5. Owner decisions (choose one per question)

**D1. Which Pro content at launch?**
- (a) lessons beyond the free N per chapter only — *recommended first*
- (b) (a) + premium mock tests
- (c) (b) + PRO flashcard decks

**D2. How to protect premium mock questions?**
- (a) premium mock questions are readable only through an attempt (Pro, or a free daily mock) and their answers only
  after submit — *recommended*
- (b) keep premium questions in a separate pool that free practice never serves
- (c) both

**D3. Capturing payments:**
- (a) Razorpay **auto-capture ON** in the dashboard, plus the B4 reconciliation job — *recommended*
- (b) also capture from the webhook path
- (c) manual capture only

**D4. Executing refunds:**
- (a) Razorpay dashboard only; the webhook updates access (today's design) — *recommended for launch*
- (b) an admin "Refund" button that calls the Razorpay Refunds API

**D5. "Attempted no more than 1 full mock test on Pro" means:**
- (a) at most 1 **submitted** attempt of a premium (`is_free=false`) mock during the plan — *recommended*
- (b) at most 1 attempt started
- (c) at most 1 attempt with ≥ 50 % answered

**D6. Founding offer seat after a full refund:**
- (a) the seat returns (`sold` −1)
- (b) the seat stays used — *simpler*

**D7. Refund of a stacked purchase:**
- (a) only the latest period can be refunded; earlier periods are untouched — *recommended*
- (b) refund any period and move later periods earlier

**D8. App e-mail (receipts, reminders):**
- (a) ZeptoMail API, sender `no-reply@couragelibrary.in` (the same provider as the auth mails) — *recommended*
- (b) Brevo
- (c) in-app only, and change the Terms wording (not recommended: the Terms promise e-mail)

**D9. Tax:**
- (a) receipts only for now ("not a tax invoice"); GST later when registered
- (b) GST invoices from day one (needs a GSTIN and invoice rules)

**D10. Promotional passes:**
- (a) always global Pro (drop the exam scope)
- (b) honour the exam scope (Pro only for that exam's content)

**D11. Free-tier limits (30 practice/day, 50 Memory Lock items, 1 mock/day):**
- (a) enforce at launch (server-side, B3)
- (b) not at launch (remove from the settings until decided)

**D12. Test-mode host:**
- (a) Vercel Preview with Preview-scoped TEST keys + QA allow-list — *recommended*
- (b) a local server + a tunnel for the webhook

**D13. A real live purchase after cutover:**
- (a) the owner buys the cheapest plan once and refunds it
- (b) no live test, rely on B7

## 7. Owner decisions 2026-11-14 and the admin-controlled access policy (supersedes B2 / B3 above)

**Decided (all as recommended in section 5):**
- **D3 = a:** Razorpay auto-capture ON + the B4 reconciliation job.
- **D4 = a:** refunds are started in the Razorpay dashboard; the webhook updates access.
- **D5 = a:** "≤ 1 full Pro mock" = at most 1 *submitted* attempt of a Pro mock during the plan.
- **D6 = b:** a founding seat stays used after a refund.
- **D7 = a:** only the latest stacked period can be refunded.
- **D8 = a:** app e-mail via the ZeptoMail API, sender `no-reply@couragelibrary.in`.
- **D9 = a:** receipts only ("not a tax invoice"); GST later.
- **D10 = b:** exam-scoped promotional passes are honoured through the access policy.
- **D12 = a:** test mode on Vercel Preview with TEST keys + the QA allow-list.
- **D13 = a:** after cutover the owner buys the cheapest plan once and refunds it.
- **PREMIUM_CA:** seeded PRO; the admin can change it.
- **D1 Pro at launch:** premium / full mock series, advanced analytics, Mistake Vault, Memory Lock. **Lessons stay free
  (FREE_ALL).** D1 is the *seeded default*; the admin can change any item.
- **D2:** mock questions are served **only through an active, server-started test, after the access check**. **No direct
  table reads for anyone**: the client roles have no SELECT on mock content. Answers and explanations come **only after
  submit**. The quick-check answer-key and practice-answer paths are closed the same way, through the central check. D2
  applies **whatever the policy setting**.
- **D11:** no free-tier limits at launch; only the Free / Pro boundary. The unused settings `free_practice_daily`,
  `free_memory_lock_active` and `free_daily_mock` are retired in B3.

**Owner requirement: Free vs Pro is fully admin-controlled, never hard-coded.**

1. **One table `access_policies`:**
   - `item_kind`: FEATURE · MOCK_SERIES · MOCK_TEST · COURSE · LESSON · TOPIC;
   - `item_key`: a feature code, or the item's id as text; `'*'` = the default for that kind;
   - `tier` = FREE / PRO;
   - `updated_at`, `updated_by`.
   - Primary key (`item_kind`, `item_key`).
   - Feature codes: ADVANCED_ANALYTICS, MISTAKE_VAULT, MEMORY_LOCK, FLASHCARDS, PREMIUM_CA (the list grows by data; an
     unknown code is PRO).
2. **Resolution:**
   1. the exact item;
   2. its parent (a mock test → its series; a lesson → its course / topic);
   3. the kind default `'*'`;
   4. **otherwise PRO** (fail-closed: missing or unknown = locked).
3. **The ONE central check `fn_access_allowed(kind, key)`.**
   - **Properties:** SECURITY DEFINER, STABLE, `search_path ''`.
   - **The rule:**
     - the paywall master switch is off → true (today's behaviour);
     - else the tier is FREE → true;
     - else `fn_has_pro(auth.uid())`.
   - **Who uses it:**
     - RLS policies and RPCs call it;
     - server code calls it through one wrapper, `canAccess(kind, key)`, with the user's session, so `auth.uid()` is
       the user;
     - nothing else may decide Free / Pro. A static gate keeps an allow-list of the few files that may mention
       tiers.
4. **Immediate effect, no cache:** the function reads the table at call time; no deploy, no cache to invalidate. If a
   cache is ever added, the set-function must invalidate it.
5. **The paywall master switch** (one row, admin-controlled, audited) stays **off** until the payments cutover (B8).
   With it off, everything stays reachable as today, so B2 / B3 can ship without taking anything away from current
   users (DEPLOY-BEFORE-ACTIVATE). D2 is enforced with the switch off too.
6. **Admin page "Free & Pro"** (admin only, not staff):
   - lists the features, mock series / tests and courses / lessons / topics with their resolved tier and its source
     (exact / parent / default);
   - changes go through `fn_access_policy_set` (service_role only), which writes `admin_audit_logs` (who, when, item,
     old → new);
   - the switch has its own confirm step and audit row.
7. **Seed (D1):**
   - FEATURE ADVANCED_ANALYTICS / MISTAKE_VAULT / MEMORY_LOCK = PRO; FLASHCARDS = FREE; PREMIUM_CA = PRO (*owner to
     confirm; it is not in D1*);
   - MOCK_TEST `'*'` = PRO, plus an explicit FREE row for every mock that is free today (`is_free=true`);
   - LESSON / COURSE / TOPIC `'*'` = FREE.
8. **Tests (B2 / B3), executed as the free QA student in rolled-back transactions:**
   - the admin flips an item FREE↔PRO → the student's access changes immediately;
   - a non-admin (student, staff, anon) cannot call the set-function or the admin action;
   - an unknown item or kind is locked;
   - switch off → today's behaviour;
   - each of the 5 bypass paths (A quick-check key, B lesson structure / completion, C mock questions by table read,
     D practice-answer key of a mock question, E lesson body control) is refused, plus mutation (negative) controls.

## 8. B2 inventory (2026-11-15, code read with file:line; live grants still to be re-checked) and the B2a / B2b split

**Findings that shape B2:**
1. **One shared question pool.**
   - Practice, Memory Lock and mock tests use the same `questions` + current PUBLISHED `question_versions`.
     `ensureMockTestQuestions` picks from exactly that set (`assessment.service.ts:1512-1519`).
   - **No column marks a question as mock-only.**
2. **Free practice reads question content with the user's session:**
   - `lib/practice/server.ts:69-77, 115-124` (practice, Memory Lock sessions, topic / lesson "Practice" links);
   - the Mistake Vault list and answered texts (`mistake.service.ts:1048, 1087`), bookmarks (`bookmark.service.ts:76`);
   - landing counts (`landing-data.ts:101`, `hindi-content.ts:25`);
   - the mock list, instructions, answer-save and result ownership reads embed `mock_tests` through the session client
     (`assessment.service.ts:889-893, 1612, 1971, 2393-2424`), as do the exam hub (`exam-page-server.ts:20`) and the CA
     daily quiz.

   Revoking client SELECT on `question_versions` / `question_options` / `mock_tests` without first moving these 13 sites
   to server-side (service-role) delivery would break practice, the Mistake Vault, bookmarks, answer saving and results.
   The CI gate QF1-DB currently **asserts** that anon can read published versions and options, so its expectation must
   change with the revoke.
3. **A sixth bypass path F: the answer key during an open mock attempt, for free mocks too.**
   - The player receives each question's `questionVersionId` / `questionId` (`assessment.service.ts:1898-1899`).
   - `fn_check_practice_answer` accepts any published, current, servable version and returns `correct_option_key` +
     `explanation_md` (093:83-92). So does `fn_memory_lock_add` + `fn_memory_lock_answer` (095).
   - A signed-in student can therefore get the key **before submit**. This breaks D2 whatever the tier.
4. **Side effect:** the instructions page runs `ensureMockTestQuestions` with the service role on any GET, including
   anon, and can **insert** `mock_sections` / `mock_questions` (`assessment.service.ts:1607-1608`).
5. **Pro definition drift:**
   - `fn_authorize_and_start_test_attempt` (035:359) and `getViewerAccess` ignore `revoked_at`;
   - flashcards accept any entitlement type.

   All of them move to the central check (B3).
6. **PREMIUM_CA:** no premium current-affairs content or schema exists. The seed row is harmless and waits for content.

**E1 decided (owner, 2026-11-15) = b:**
- Only questions assigned to a **PRO** mock (per the access policy) are excluded from practice and Memory Lock;
  free-mock questions stay in the shared pool.
- **In all cases:** no answer or explanation for any question in the caller's own **open** attempt (practice-answer and
  Memory Lock RPCs refuse it), and the mock player stops receiving internal question version ids (opaque per-attempt
  ids instead).

**B2a status (2026-11-15):**
- Migration 141 applied; RLS P-6 then flagged the blanket client read on `access_settings`.
- Migration 142 (owner GO) makes it private and the central check SECURITY DEFINER.
- New runbook rule: the RLS gate + SECDEF ratchet run in the LOCAL cycle of every migration that adds tables, policies
  or functions.

**B2 split (agreed):**
- **B2a, the access-policy foundation (no user-visible change: the switch stays off):**
  - migration: `access_policies`, the paywall switch, `fn_access_tier`, `fn_access_allowed`, `fn_access_policy_set` /
    `fn_paywall_set` (service_role, audited);
  - the D1 seed;
  - the admin "Free & Pro" page;
  - `canAccess()`;
  - tests: admin flip FREE↔PRO changes the free QA student's result immediately; non-admin refused; unknown = locked.
- **B2b, close the paths (D2, whatever the switch):**
  - mock content served only by the server (no client table reads; the player gets opaque per-attempt ids, not version
    ids);
  - the practice / Memory Lock answer RPCs refuse versions in the caller's open attempt (and Pro mocks the caller cannot
    access);
  - the lesson RPCs and the visitor action call `fn_access_allowed`;
  - the session-client content reads move server-side, then the client SELECT revoke;
  - the instructions-page insert side effect is removed;
  - executed proof with the free QA student: paths A–F.

## 9. B2b part 2: public question-content inventory and the descriptive check (2026-11-15)

**Descriptive questions: no direct exposure.** Read-only check on production (rolled back), as anon and as the free QA
student:
- `descriptive_questions.model_answer_md` and `evaluation_guidelines_md` have **no column grant** for anon /
  authenticated, so they cannot be read directly;
- the table has 0 rows today.

Nothing to fix now. **Note for when descriptive content goes live:** `services/descriptive.service.ts` selects `*`
through the session client and always returns `evaluation_guidelines_md` (`:205-206`). With the column grants as they
are, that read fails; if a grant were ever added, the guidelines would reach students. Review both when the feature
launches.

**Public question-content surfaces (code read, file:line in the inventory):**
- **Mostly clean:** no anonymous page renders question-bank text, options, keys or explanations. There are no question
  SEO pages, no question / mock / session URLs in the sitemap, no quiz JSON-LD.
- **One real payload leak:** `/current-affairs/[slug]` (ISR 60 s, in the sitemap) loads `question_versions.question_text`
  of its mapped questions with the anon client and passes it to a client component. Only a count is shown, but the
  text is in the page payload. Those questions also feed the CA daily mock.
- **Reads that break under the revoke (must move server-side first):**
  - landing / `/exams` counts; the exam hub mock list;
  - the CA quiz card and date pages;
  - `/practice` topic counts and the practice links on lesson / topic / exam pages;
  - practice sessions;
  - the `/mock-tests` catalogue and instructions;
  - bookmarks, reports, the lesson resolver;
  - the Mistake Vault question texts and the longitudinal intelligence embed;
  - the staff overview pages.

**Step 1 (code release) then step 2 (the revoke):**
- **Step 1:**
  - the CA leak closed (count only);
  - every read above moves to server-side reads with the **same visibility filters** the RLS policies applied
    (published / current / own dynamic), stated explicitly;
  - practice delivery and topic counts exclude questions reserved for PRO mocks (E1 = b), through a database function
    (no app-side tier rule);
  - SEO URLs, canonicals and the sitemap unchanged;
  - the anonymous smoke extended to every public surface (+ "no question text in the CA payload").
- **Step 2:** the revoke migration, the QF1-DB expectation flip, the full A–F + anonymous proof.

**Step 1 status (2026-11-15, local, not released):**
- **Migration 144** `fn_reserved_question_ids` is applied. It is DEFINER, uses the PRO tier from `fn_access_tier` (not the
  paywall switch) and grants EXECUTE to service_role only. Practice delivery and topic counts use it on the server and
  fail closed.
- **Reads moved server-side**, each keeping the RLS visibility it had, stated explicitly:
  - question versions: PUBLISHED / SUPERSEDED;
  - mock listings: published and non-dynamic;
  - the player, dashboard and results: own dynamic mocks too;
  - the longitudinal embed: details only for the caller's own answers.
- **Files changed:**
  - landing, exam pages, CA daily quiz and date pages, practice;
  - mock dashboard, instructions, answer saving and results;
  - bookmarks, reports, Mistake Vault texts, longitudinal intelligence;
  - admin overview, categories, patterns, daily programme and mock list;
  - question-bank search, blueprint audit;
  - public mock listings (`lib/mocks/server-reads.ts`);
  - the CA article (no question text).
- **Not changed, by design:**
  - The adaptive services: their flag is off and they read through a passed client. They must be revisited before
    the flag is turned on.
  - The AI / question-factory paths: every app caller passes the admin client. The other callers are scripts.
- **Gates:**
  - offline `test_pay1_b2b.cjs` P3-07..09: 144 shape; a scan that no app file reads the four tables through a session
    client; the CA service has no question text; 6 negative controls;
  - live B-R: the reserved list follows the tier, and anon and the free student get 42501;
  - the anonymous smoke PAY-1 block: public pages render, the CA article has no question text, canonicals stay
    self-canonical, `fn_reserved_question_ids` refused for anon;
  - the student and admin page lists are extended.
- **SEO:** the sitemap source (`app/sitemap.ts`), routes and canonical metadata are untouched.

**B2 closed 2026-11-15:** 145 (public reads) and 146 (client revoke) are applied and released. See §8 / §9 and the
release log.

## 10. B3 inventory: Free / Pro decided outside the central check (2026-11-15, code read only)

**Already central:**
- `LESSON`: `learn/actions.tsx:88`, plus the three SQL lesson functions (migration 143).
- `MOCK_TEST`: `assessment.service.ts:1765`.
- By design (D2): `fn_answer_blocked` and `fn_reserved_question_ids` use `fn_access_tier`.

**Enforcement outside the central check:**

| Feature | Where | Own rule |
|---|---|---|
| Lessons | `lib/learning/chapter-access.ts` (FREE_N + `LESSON_FREE_PER_CHAPTER`); `lesson-access-settings.ts` (env `PAYMENTS_ENABLED` = a second switch); `learning-resolver.service.ts:310-327` (own Pro check, no `revoked_at`); `master-lesson.service.ts:197`, `course.service.ts:137` | Chapter position, own entitlement read |
| Lessons (legacy courses) | SQL `fn_update_lesson_playback_position` (010), policy `p_threads_read_public` (102) | `is_free_preview`, `courses.access_tier`, entitlement types |
| Mock start | `assessment.service.ts:1766`: **after** `canAccess`, `is_free=false` also needs `PremiumEntitlementService.authorizeAndStartAttempt` (Pro + per-exam quota), SQL `fn_authorize_and_start_test_attempt` (035) | `is_free` + quota: a mock the admin sets FREE is still refused |
| Adaptive (flag off) | `adaptive-session.service.ts:266` → `fn_check_premium_access_and_quota` | Entitlement + quota |
| Flashcards | `flashcard.service.ts:198-219` (any active entitlement = Pro; no expiry / revoke; `.maybeSingle()` errors on 2+ rows); policy `p_fcards_select` (102); `fn_submit_flashcard_review` (107) | 3-card preview of PRO decks |
| Battles | `fn_find_or_create_battle_room` (087), `fn_join_battle_by_code` (028); `api/battles/create` takes `accessTier` from the client | `status='ACTIVE'` (other code uses `is_active`) |
| Live tests (flag) | `fn_register_live_test` (045) | `is_premium_only`, entitlement `status` |
| Search (unused) | policy `p_search_indexes_read_auth` (102) | `entitlement_type='SUBSCRIPTION'` (no longer issued) |

**Display only** (badges, sort, SEO): the mock `is_free` sort / badge / "next free" (exam page, dashboard,
`fn_public_exam_mocks`), `isAccessibleForFree`, course / deck tier badges, billing status, the Pro-ending banner.

**No gate at all today:** analytics / performance, Mistake Vault, Memory Lock, `PREMIUM_CA` (no code), practice
(`free_practice_daily` not enforced), the daily mock (`free_daily_mock` not enforced).

**Dead code:** `PremiumHubService`, `premium-generator.service.ts` with `premium/actions.ts` and `PremiumHubView` (never
rendered); `fn_get_due_flashcards`, `fn_create_custom_flashcard_deck` (execute revoked); the three `free_*` settings in
`pro-server.ts` (read, never enforced).

**Admin tooling** (stays): grant / revoke / quota reports, Library Pro, the reminders cron, the FREE_N launch choice,
the `is_free` / `access_tier` defaults written on create.

**Owner decisions B3 (2026-11-15): 1–10 as recommended, with two refinements.**
1. Per-exam mock quotas: dropped. The admin tier (`MOCK_TEST`) decides.
2. FREE_N / `LESSON_FREE_PER_CHAPTER`: retired. "First N lessons free" is expressed as `LESSON` policy rows. The env
   switch `PAYMENTS_ENABLED` is removed from access decisions; `paywall_enabled` is the only switch.
3. Legacy course / document levels: retired, **only after confirming no live reader** (check below).
4. Flashcards: the 3-card preview of PRO decks stays, under the `FLASHCARDS` feature. There is no per-deck kind.
5. The free limits (`free_practice_daily`, `free_memory_lock_active`, `free_daily_mock`): deleted (D11).
6. Battles / live tests: PRO rooms and premium-only events removed for now. The tier comes from the server only.
7. Search: the unused `SUBSCRIPTION` policy is dropped.
8. Badges / SEO: derived from `accessTier()`, not `is_free`.
9. Default tiers, seeded as policy rows. Nothing changes while the paywall is off.
   - Basic mock result (score, section-wise, answers / explanations after submit): FREE.
   - Advanced analytics: PRO.
   - Mistake Vault: viewing is FREE, drills are PRO.
   - Memory Lock: PRO.
10. Dead code (premium hub / generator / actions / view, the two revoked flashcard functions): deleted.

**Decision 3 check (2026-11-15; code read + read-only production counts):**

| Legacy field | Live reader | Production data |
|---|---|---|
| `learning_documents.access_level` (non-node documents) | `/articles/[slug]` resolver path, which decides `is_locked` | 2 non-node documents, **both ARCHIVED**; all 18 PUBLISHED documents are node lessons (FREE; the chapter rule applies) |
| `courses.access_tier`, `course_lessons.is_free_preview` | `/courses` pages are dormant (`FEATURE_COURSES` off → 404). **The live community policy `discussion_threads.p_threads_read_public` reads `courses.access_tier`.** | 1 course (FREE, published); 1 lesson, no free preview |
| Other policies on legacy fields | `flashcards.p_fcards_select` (live); `search_indexes` read policies (no app reader) | — |

**Consequence:** retirement means repointing, not deleting.
- The thread policy moves to `fn_access_allowed('COURSE', …)` (true while the paywall is off).
- The flashcard policy moves to `FLASHCARDS`.
- The search policies are dropped.
- The resolver's older-document path moves to `LESSON`.
- The columns stay, unread, until a later cleanup.

## 6. Evidence (read-only, 2026-11-14)

**Production database** (counts only; read-only transaction, rolled back):
- payment_orders 0; PRO orders 0; webhook events 0; active entitlements 0 (QA student 0); COURSE_PURCHASE entitlements
  0; active plan versions 4;
- premium mocks 0 (with questions 0); PRO flashcard decks 0; gated lesson documents 0; FREE_N launches 0.

**Grants for `authenticated`:**

| Object | Grant |
|---|---|
| `mock_tests` / `mock_questions` / `question_versions` / `question_options` | SELECT yes |
| `question_answers` | SELECT no |
| `document_versions.blocks` | no |
| `fn_lesson_quick_check_answer`, `fn_check_practice_answer` | EXECUTE yes |

**Live policies** on `mock_tests`, `mock_questions`, `question_versions` and `question_options` (SELECT): none mentions
`is_free` or Pro. **Live function definitions** of `fn_lesson_quick_check_answer`, `fn_lesson_progress_save`,
`fn_lesson_complete` and `fn_check_practice_answer`: SECURITY DEFINER, no Pro check.

**As the free QA student:** premium mock rows visible 0 (none exist); `document_versions.blocks` → `42501` (control).

**Not run on purpose:** paths A, B and D (the RPCs write attempt rows even inside a rolled-back transaction; the owner
asked for no database writes). They are proven from the live function definitions above; Phase B2 proves them with
real-role negative tests.

## 11. B3 build plan (2026-11-15)

Order (deploy-before-drop):

**147 (SQL; compatible with the app on main and with B3):**
- Seed:
  - `FEATURE MISTAKE_VAULT` → FREE, only where no admin has changed it (`updated_by IS NULL`);
  - new `FEATURE MISTAKE_DRILLS` PRO.
- `fn_access_allowed_many(kind, keys[])`: the same rule as `fn_access_allowed`, for a list in one call (course and lesson
  lists). DEFINER, `search_path ''`, P-9 + allow-list.
- Policies moved to the central check:
  - `discussion_threads.p_threads_read_public`: the course part becomes `fn_access_allowed('COURSE', c.id)`.
  - `flashcards.p_fcards_select` and `fn_submit_flashcard_review`: a PRO deck beyond card 3 needs
    `fn_access_allowed('FEATURE', 'FLASHCARDS')`. The deck's `access_tier` stays only as its PRO marker.
- `search_indexes` read policies (`p_search_indexes_read_public`, `p_search_indexes_read_auth`): dropped (no reader).
- Battles (`fn_find_or_create_battle_room`, `fn_join_battle_by_code`): FREE rooms only. Live tests
  (`fn_register_live_test`): premium-only events refused.

**B3 app:**
- Lessons: lock and badge from `canAccess` / `accessTier('LESSON', doc)` (batched).
  - Retired: `chapter-access.ts` (FREE_N), `lesson-access-settings.ts` (env `PAYMENTS_ENABLED`),
    `getViewerAccess`' own entitlement read, the older-document `access_level` path.
- Mock start: only `canAccess('MOCK_TEST')`; the quota branch is dropped. Badges / sort / "next free" come from
  `accessTier`.
- Gates:
  - flashcards → `canAccess('FEATURE', 'FLASHCARDS')`;
  - performance → `ADVANCED_ANALYTICS`;
  - drills → `MISTAKE_DRILLS`;
  - Memory Lock → `MEMORY_LOCK`;
  - adaptive → `MOCK_TEST`.
- The battles API ignores the client's tier.
- `pro-server.ts` drops the free limits.
- Dead code deleted (premium hub / generator / actions / view).
- Static gate: no Pro rule outside `lib/access/policy.ts` (allow-list).

**148 (after the B3 app is live):** drop the functions no caller uses any more:
- `fn_authorize_and_start_test_attempt`
- `fn_check_premium_access_and_quota`
- `fn_create_dynamic_mock_instance_atomic`
- `fn_get_due_flashcards`
- `fn_create_custom_flashcard_deck`

The allow-list maxima are lowered.

**Behaviour change while the paywall is OFF (owner to confirm):** today two places enforce Pro on their own, whatever
the switch says:
- PRO flashcard decks show only cards 1–3;
- mocks with `is_free=false` need an entitlement and quota.

After B3 both follow the central check, so with the paywall off they are fully reachable, like everything else.

**147 applied on production 2026-11-16 14:13 IST.**
- Before the apply:
  - backup `pre-147-pay1-b3` (resilient), verified 100%;
  - TLS: public roots for GitHub, Vercel and Supabase. The first two GitHub lookups failed with a DNS ENOTFOUND, then the check passed; no interception;
  - dry-run OK;
  - `test_pay1_b3.cjs --pre`: 6/6.
- After the apply:
  - PAY1-B3 6/6;
  - B2a 9/9 (the first run lost its connection; the rerun passed);
  - B2b, B1, public reads and the revoke replay: all pass;
  - SECDEF ratchet 6/6 (134/134); SEC-HOTFIX-4 RLS 12/12;
  - DRILL1 11/11, SECDEF-S2-1 7/7, QBKEY1 14/14;
  - `npm run db:types` matches the hand-added `fn_access_allowed_many` entry and adds the two 146 helpers.
- Section 7 (decision 9 hardening): Memory Lock and the drill RPCs check their feature themselves (`PRO_REQUIRED`).
- Deferred to 148:
  - the dead premium hub and generator code;
  - the three uncalled `assessment.service` list functions (allow-listed in P4-07);
  - the FREE_N pieces in the database.

**148 applied on production 2026-11-18 15:44 IST** (owner "release"): backup `pre-148-apply` (resilient, verified 100%, 2 resumes); TLS public roots on all three hosts before the backup, the apply and the gates; dry-run OK; `--pre` launch gate 3/3; `npm run db:types` = the hand-edited types (no diff), `db:types:check` OK.

**148 built 2026-11-18:**
- Migration `20261118000148_pay1_cleanup.sql`:
  - drops `fn_authorize_and_start_test_attempt`, `fn_check_premium_access_and_quota`,
    `fn_create_dynamic_mock_instance_atomic`, `fn_get_due_flashcards` and `fn_create_custom_flashcard_deck`;
  - drops FREE_N: `exam_course_launches.access_mode`, `fn_gated_course_document_ids` and the `p_access_mode` argument of
    `fn_exam_course_launch_set`, which is now 6 arguments, INVOKER, service_role only, with the 126 rules unchanged;
  - refuses to run while any launch is not FREE_ALL.
- SECDEF allow-list: total 134 → 129, B-service 40 → 37.
- App:
  - deleted the premium hub / generator / entitlement services, the hub actions and view, the three uncalled
    `assessment.service` mock-list functions and two server-read helpers only they used;
  - removed the admin candidate tool's quota report (it read the dropped quota function; quotas retired in B3);
  - the launch action, service and screen are launch / pause only.
- P4-07 allow-list: 12 → 8 reviewed exceptions.
- New offline gate PAY1-148 (7 checks, 19 negative controls).
- LAUNCH-MODE-1-LIVE rewritten for the post-148 launch function.

## 12. B4 plan: payment robustness (2026-11-18, code read; nothing built yet)

**Today (code read, file:line in the B4 survey):**
- `RazorpayApi` can create an order, fetch a payment and capture a payment (`razorpay-core.ts:109-113`). Nothing lists an
  order's payments, so nothing can find a payment the browser never reported.
- `fetch` is injected into `createRazorpayApi` (`razorpay-core.ts:123-158`), but no gate exercises it: the F9-B gate
  fakes the whole API object (`test_f9b_payments.cjs:64-121`).
- The webhook never captures (`allowCapture=false`, `pro-flows.ts:122,252-255`: `NOT_CAPTURED_YET`, event IGNORED).
- No reconciliation, no `gateway_mode`, no QA check on the order path (`pricing/actions.ts:16-25`).
- Receipt number = `CL-R-YYMMDD-` + 6 hex of md5(order ‖ payment), no retry (114:194-195). A collision rolls back the
  whole fulfilment and every retry collides again (the inputs are the same).
- A refund that arrives before the fulfilment → `PAYMENT_NOT_FOUND` → event FAILED → 409. It works only while Razorpay
  keeps redelivering.
- The status trigger makes EXPIRED and CANCELLED terminal (019:28-34). Reconciliation must therefore use FAILED, which
  `fn_fulfil_pro_order` still accepts (114:166), so a late payment can still activate Pro.
- Vercel Hobby runs a cron once a day (`finalize-attempts/route.ts:6`), so a job every N minutes cannot be a Vercel cron.

**Migration 149 (SQL; compatible with the app on main):**
1. `payment_orders.gateway_mode text NOT NULL DEFAULT 'live' CHECK (gateway_mode IN ('test','live'))` (0 orders today).
   Plus a partial index on `(created_at)` WHERE `status = 'PENDING' AND order_type = 'PRO_PLAN'`.
2. `fn_create_pro_order(…, p_gateway_mode text DEFAULT 'live')`:
   - stores the mode;
   - **test mode only for QA identities**: the user's e-mail ends in the reserved `.test` QA domain, checked in SQL
     as well as on the server;
   - returns `TEST_MODE_QA_ONLY` otherwise.
3. `fn_fulfil_pro_order`:
   - `p_source` also accepts `'RECONCILE'`;
   - refuses an order whose `gateway_mode` differs from the caller's key mode (`MODE_MISMATCH`);
   - **receipt number retried up to 5 times** with a counter in the hash (`md5(order ‖ payment ‖ n)`), raising only
     after 5 collisions.
No new function: the job reads its candidates (PENDING PRO orders of the current mode, older than R3, oldest first,
batch of 50) with the server's service-role client, which already has the table. The existing functions keep SECURITY
DEFINER, `search_path ''` and service_role only; the SECDEF count does not change.

**B4 app:**
1. `razorpay-core`:
   - `listOrderPayments(orderId)` (`GET /orders/{id}/payments`), shape-checked like `createOrder`;
   - `classifyOrderPayments(order, payments)` → `{captured | authorized | none | refunded_only | double_charge}`, pure.
2. `pro-flows.reconcileOrder(order)`:
   - captured → `fulfilChecked(…, 'RECONCILE')`;
   - authorized → capture, then fulfil (the R2 rule below);
   - none or failed only, and the order is older than the give-up age (R3) → `fn_mark_pro_order_failed`;
   - refunded only → mark FAILED, never fulfil;
   - two or more captured payments → fulfil with the first, and write `PRO_DOUBLE_CHARGE` to the audit log for a
     manual refund (D4 = a).

   Idempotent: a second run finds the order PAID (`already_fulfilled`).
3. Route `POST /api/cron/reconcile-payments`:
   - `CRON_SECRET` checked in constant time, like the other crons;
   - no-op while checkout is closed;
   - a batch of 50 for the current key mode only;
   - counts-only log;
   - it also replays stored `refund.processed` events left FAILED with `PAYMENT_NOT_FOUND` once their payment exists
     (refund before fulfil).
4. `createProOrder` passes `checkoutState().mode`. In test mode a non-QA user gets "Test checkout is for QA accounts
   only" before any gateway call.
5. Admin totals and revenue count `gateway_mode = 'live'` only.

**Tests:**
- **Offline gate PAY1-B4**, with a fake `fetch` driving the real `createRazorpayApi`:
  - `listOrderPayments` shape refusals;
  - every `classifyOrderPayments` branch;
  - `reconcileOrder` for each case, plus a second run that changes nothing;
  - a mode mismatch is refused;
  - test mode for a non-QA user is refused before any gateway call;
  - the cron rejects a missing or wrong secret;
  - webhook duplicate / out of order / amount mismatch stay green (F9-B);
  - negative controls.
- **Live gate PAY1-B4-LIVE**, run as the real roles and rolled back:
  - `gateway_mode` stored;
  - test mode refused for the free non-QA path and allowed for QA;
  - a forced receipt collision → the second suffix is used;
  - `RECONCILE` accepted and `MODE_MISMATCH` refused;
  - FAILED → late fulfil still works;
  - `fn_create_pro_order` / `fn_fulfil_pro_order` stay service_role only (anon and student 42501).
- The local cycle (RLS + ratchet), F9-PRICING and the EARLIER-GATES (114 / 140).

**Owner decisions needed before the build:**
- **R1. Where the job runs:**
  - (a) a GitHub Actions scheduled workflow every 15 min that calls the route with `CRON_SECRET` (SCHEDULED-CHECKS
    already prefers GitHub Actions for timed work) — *recommended*;
  - (b) the Vercel cron once a day (too slow for the 24-hour promise on a bad day);
  - (c) Vercel Pro.
- **R2. An authorized but not captured payment found by the job:**
  - (a) the job captures it and fulfils, the same as the browser's verify path — *recommended*. It is the safety net if
    auto-capture fails or is switched off;
  - (b) only report it.
- **R3. Timings:**
  - check orders older than 15 min;
  - give up (FAILED) after 2 h with no paid payment;
  - look back 7 days.

  *Recommended as listed.* A FAILED order still activates if the payment appears later.
- **R4. Double charge:** audit row + admin list only; the refund stays a dashboard action (D4 = a) — *recommended*.

**Activation order (DEPLOY-BEFORE-ACTIVATE):** 149 → the B4 app on main and deployed → only then the GitHub schedule. With
payments off the job is a no-op (checkout closed).

**Owner decisions 2026-11-18:**
- **R1 = a**, with conditions:
  - GitHub Actions only triggers;
  - the work runs in the Vercel route `POST /api/cron/reconcile`, guarded by the `CRON_SECRET` bearer (constant time, POST
    only, no other auth path);
  - the Razorpay keys stay in the Vercel env;
  - the job is idempotent and safe when runs overlap.
- **R2 = a:** capture + activate only after the same checks as verify; Pro at most once.
- **R3:** 15 min / 2 h FAILED / 7 days.
- **R4:** audit row + admin list; refunds in the dashboard.

**B4 built 2026-11-18 (local; production apply waits for "release"):**
- **Migration `20261118000149_pay1_b4_payment_robustness.sql`:**
  - `payment_orders.gateway_mode` (default live), plus the job index.
  - `fn_create_pro_order(…, p_gateway_mode)`: TEST mode only for a QA identity, checked first; an idempotency key is
    never reused across modes.
  - `fn_fulfil_pro_order(…, p_gateway_mode)`:
    - `RECONCILE` source; `MODE_MISMATCH`;
    - a second captured payment on a paid order → `ORDER_ALREADY_PAID` + one `PRO_DOUBLE_CHARGE` row per payment;
    - a payment on a REFUNDED / EXPIRED / CANCELLED order → one `PRO_PAYMENT_TO_REFUND` row;
    - receipt number retried up to 5 times.
  - `fn_refund_pro_payment`: the dashboard refund of such a payment is acknowledged once
    (`PRO_UNAPPLIED_PAYMENT_REFUNDED`). It used to be `PAYMENT_NOT_FOUND` → 409 → redelivered forever. The rest is the 114
    body unchanged.
  - `payment_job_leases` + `fn_payment_job_lease` (INVOKER, service_role only): one run at a time.
  - SECDEF counts unchanged: two entries renamed to the new signatures.
- **App:**
  - `listOrderPayments` + `classifyOrderPayments` (`razorpay-core`); `reconcileOrder` / `runReconciliation`
    (`pro-flows`); `getReconcileDeps` (`pro-server`); route `app/api/cron/reconcile`.
  - The key mode on every order and fulfil.
  - Test-mode checkout for QA identities only (server + SQL).
  - Admin `/admin/payments`: "Payments to refund" (open / refunded) and a TEST label; admin order counts are live only.
- **Trigger:** `.github/workflows/payments-reconcile.yml`:
  - every 15 min, POST with `secrets.CRON_SECRET` to `secrets.RECONCILE_URL`;
  - `permissions: {}`; `curl -s` (no host in errors);
  - runs only when the repository variable `PAYMENTS_RECONCILE_ENABLED` is `true` (DEPLOY-BEFORE-ACTIVATE).
- **Gates:**
  - **PAY1-B4 (offline):** 9 checks, 22 negative controls. The real Razorpay client is driven with a fake `fetch`;
    reconciliation runs against a fake database that behaves like 149.
  - **PAY1-B4-LIVE:** rolled back, real roles, `--pre`; in live-journeys next to F9-PRICING.
  - F9-PRICING follows the new fulfil signature.
- **Local copy (pre-148-apply backup + 148 + 149):**
  - ratchet 6/6 (129, unchanged); RLS 6/6 (6 need the QA accounts);
  - rollback → the three functions byte-equal to the 114 bodies with service-role-only grants; only the ledger row
    changed;
  - re-apply OK; rollback chains 0 problems;
  - a real two-connection race on the lease: the second waits, then gets false.

**149 applied on production 2026-11-18 ≈ 18:00 IST** (owner "release"): backup `pre-149-apply` (resilient, 187 tables,
verified 100%, 0 resumes); TLS public roots on GitHub, Vercel and Supabase; dry-run OK; applied with the ledger row.
`db:types` differs from the hand edit only in key order (`p_gateway_mode` / `p_gateway_order_id`); `db:types:check`
OK. Post-apply gates: PAY1-B4-LIVE, F9-PRICING (new signature), PAY1-B1-LIVE, PAY1-B3-LIVE all pass; ratchet 6/6 (129);
RLS 12/12; SECDEF-S2-2 8/8. The reconcile schedule stays off until the owner sets `CRON_SECRET` / `RECONCILE_URL`
and then `PAYMENTS_RECONCILE_ENABLED=true` after the deploy.

## 13. B5 plan: transactional e-mail (2026-11-18, plan only; nothing built)

**Owner scope (D8 = ZeptoMail API, sender `no-reply@couragelibrary.in`):** receipt after Pro activation; expiry
reminders 7 days and 1 day before (Terms :76, Refund Policy :504); refund confirmation. Idempotent (at most once per
event, recorded); the reminder job uses the reconcile pattern (GitHub triggers a protected POST route); no PII in logs;
plain text + HTML; support contact in every mail; test-mode orders mail QA accounts only.

**Today:**
- `sendReceiptEmail` is a stub (`pro-server.ts:71-77`), called by `afterFulfil`. Fulfil never fails because of it
  (`pro-flows.ts:164-168`).
- `/api/cron/pro-reminders` is GET, only counts, and is not scheduled.
- `pro_reminders_sent` (unique entitlement + D7/D1) exists, service_role only.
- A renewal **stacks**: it is a new entitlement starting at the old end (114:174-185). Reminders keyed per entitlement
  would therefore warn a user who has already renewed. B5 keys them on the user's **overall** Pro end.
- Refunds are applied in `fn_refund_pro_payment` (webhook and the reconcile replay). There is no after-refund hook.

**Build (migration 150 + app):**
- **`email_events` table:**
  - `kind` (PRO_RECEIPT / PRO_EXPIRY_D7 / PRO_EXPIRY_D1 / PRO_REFUND);
  - `event_key` UNIQUE: the receipt id / `entitlement chain end + kind` / the gateway refund id;
  - `user_id`, `gateway_mode`, `status` (CLAIMED / SENT / FAILED / UNKNOWN / SUPPRESSED), `attempts`,
    `provider_ref`, `error_code`, timestamps.
  - It stores **no address and no body**. RLS on, service_role only.
- **Send protocol (at most once):**
  1. Claim with an insert (`ON CONFLICT DO NOTHING`).
  2. Call the ZeptoMail API.
  3. Mark SENT with the request id.
  - **Definite error** (an HTTP status came back): mark FAILED. Retry up to 3 times by the job.
  - **Timeout / network drop / crash after the claim:** mark UNKNOWN. Never retried automatically; listed on
    `/admin/payments`.
- **Transport:** `lib/email/zeptomail.ts`.
  - `POST https://api.zeptomail.in/v1.1/email`; the token is in Vercel env only (`ZEPTOMAIL_TOKEN`).
  - 10 s timeout; `text` + `html`; `reply_to` support.
  - `EMAIL_APP_ENABLED` kill switch (off = SUPPRESSED, nothing sent).
- **Templates:**
  - Brand Band (like the auth mails, generated, inline CSS), with a plain-text twin.
  - Receipt: number, plan, amount, date, the Pro end date, "not a tax invoice" while `gst_registered` is false,
    the support contact.
  - Template allow-list gate: no unknown `{{ }}`, no secret, no tracking pixel.
- **Triggers:**
  - **Receipt:** from `afterFulfil` (verify, webhook and reconcile paths).
  - **Refund confirmation:** from a new `afterRefund` after an applied **or** unapplied refund (double charge).
  - **Reminders and retries:** the reminder route becomes POST-only (reconcile pattern) and does the D7/D1 sends plus
    FAILED retries. It is triggered by a GitHub workflow with its own enable variable.
- **Test mode:** a test-mode event never mails the real recipient.
- **Gates:**
  - **offline PAY1-B5:** fake ZeptoMail fetch; templates; the at-most-once matrix; no PII in logs;
  - **live PAY1-B5-LIVE:** 150, rolled back;
  - **local route check:** 405 / 401 / skipped.
- **Activation (DEPLOY-BEFORE-ACTIVATE):** 150 → app deployed → owner token in Vercel → `EMAIL_APP_ENABLED` →
  the GitHub variable.

**DNS, read-only on 2026-11-18:**

| Record | Status |
|---|---|
| ZeptoMail bounce CNAME | `bounce-zem` → `cluster89.zeptomail.in`, which publishes `v=spf1 include:zeptomail.net.in -all`. SPF passes on the return path. |
| ZeptoMail DKIM | Not found at common selectors (`zeptomail`, `zmail`, `zoho`, `default`, `zm`, …). ZeptoMail generates the selector, so the owner must read it from the console. |
| Root SPF | Still `v=spf1 include:zoho.in +all` (EMAIL-DNS-FIX-1 not done; anyone can pass SPF as the domain). |
| DMARC | `p=none`, reports to Brevo. |
| MX | `0 mx.couragelibrary.in` still exists and resolves only via the wildcard A to the web host. Replies to support are tried there first. |

**Owner decisions (2026-11-18):** all recommended, E1a–E7a. The QA inbox for E1 is `qa@couragelibrary.in` (the owner
creates it as a Zoho alias).

**B5 built 2026-11-18 (local; production apply waits for "release"):**
- **Migration `20261118000150_pay1_b5_email_events.sql`:**
  - Table `email_events` only; no function, so the SECDEF count is unchanged (129).
  - CHECKs on kind / status / attempts (1–3) / mode and on the key format; `event_key` UNIQUE; FK to auth.users.
  - RLS on, no policy; service_role SELECT / INSERT / UPDATE (no DELETE).
  - No address, name or body column (the proof block checks it).
  - Rollback 150: chain line `none`; drops the table.
- **`lib/email/zeptomail.ts`:**
  - The India endpoint, the `Zoho-enczapikey` header, text + HTML, reply-to support, no open / click tracking.
  - 10 s timeout.
  - Outcomes: 2xx → SENT (request id); 4xx / 503 → FAILED; other 5xx / timeout / network → UNKNOWN.
- **`lib/email/pro-templates.ts`:**
  - Receipt, D7, D1, refund (full / partial / unapplied), in the Brand Band design with a plain-text twin.
  - Links: only `/billing`, `/pricing` and the support mailto. Every value is escaped; dates are in India time.
  - E7 wording; the E1 QA subject.
- **`lib/email/pro-emails.ts` (core):**
  - `sendEvent`: the recipient → render → claim → send → record sequence.
  - QA routing; test-mode non-QA → SUPPRESSED; no address → SUPPRESSED.
  - Unreadable facts → nothing recorded; a renewed plan → STALE.
  - `runEmailJob`: lease `pro_emails`; stale claims → UNKNOWN after 10 min; catch-up of receipts / refunds (7 days);
    D7 / D1 from 09:00 IST (`reminderFor`: ≤ 1 day → D1, ≤ 7 → D7; a missed D7 is not sent late); FAILED retries
    after 30 min, at most 3 attempts in all; 25 sends a run.
- **`lib/email/pro-email-server.ts`:**
  - Wiring: `EMAIL_APP_ENABLED` + `ZEPTOMAIL_TOKEN` (Vercel only).
  - Sender `no-reply@`, reply-to support, `QA_INBOX`.
  - Refund facts come from `payment_transactions.refund_ids` or the unapplied audit row.
- **`pro-server.ts`:**
  - `afterFulfil` sends the receipt; `afterRefund` sends the refund confirmation.
  - The old stub is removed.
  - `getProEnd` / `listProEnds` use the user's OVERALL end, because renewals stack.
- **`pro-flows.ts`:** `afterRefund` runs after a webhook refund and after a replayed refund, not for a repeat.
- **Route `POST /api/cron/emails`:** the reconcile pattern; 401 before any read; e-mail off → skipped.
  The old GET `/api/cron/pro-reminders` is removed.
- **Workflow `payments-emails.yml`:**
  - Hourly at :07; `permissions: {}`; concurrency group.
  - Gated by `PAYMENTS_EMAILS_ENABLED`.
  - Secrets: `CRON_SECRET` + `EMAILS_URL` only.
- **`/admin/payments`:** "E-mails to check" (UNKNOWN, or FAILED × 3): kind, key, code, attempts. ids only.
- **E6:** `/billing` already shows "Pro until <date>" (B1, the overall end); unchanged.
- **Gates:**
  - **PAY1-B5 (offline):** 9 checks, 27 negative controls.
  - **PAY1-B5-LIVE:** real roles, rolled back, `--pre` and `--local`; in live-journeys after PAY1-B4-LIVE.
- **Checks before release:** offline 112/112; build OK; local route R-1..R-4 and the admin / student page smokes pass;
  TLS clean; production dry-run 150 OK; PAY1-B5-LIVE `--pre` on production 8/8 (rolled back).
- **Local copy (pre-149-apply backup + 149 + 150):**
  - `--pre` 8/8; after apply 8/8;
  - ratchet 6/6 (129); RLS 6/6 (6 need the QA accounts);
  - re-apply refused; rollback → only the ledger row changed; re-apply OK; chain lines `none`.
- **Activation (DEPLOY-BEFORE-ACTIVATE):**
  1. 150 + the app on main and deployed;
  2. the owner sets `ZEPTOMAIL_TOKEN` and then `EMAIL_APP_ENABLED=true` in Vercel;
  3. then the GitHub secrets `EMAILS_URL` (+ `CRON_SECRET`) and the variable `PAYMENTS_EMAILS_ENABLED=true`.
  - The receipt / refund sends run inside the payment flows, which stay closed until checkout opens (B7).

**150 applied on production 2026-11-18 ≈ 21:45 IST** (owner "release"): backup `pre-150-apply` (resilient, 188 tables,
verified 100%, 0 resumes); TLS public roots on GitHub, Vercel and Supabase; dry-run OK; applied with the ledger row.
`db:types` identical to the hand edit; `db:types:check` OK. Post-apply gates: PAY1-B5-LIVE, PAY1-B4-LIVE, F9-PRICING
all pass; ratchet 6/6 (129); RLS 12/12. Nothing is sent until the owner sets `ZEPTOMAIL_TOKEN` and
`EMAIL_APP_ENABLED=true` in Vercel after the deploy, then `EMAILS_URL` and `PAYMENTS_EMAILS_ENABLED=true` in GitHub.

## 14. B6 plan: refunds (2026-11-19, plan only; nothing built)

**Locked by the owner:**
- **D4:** refunds are made in the Razorpay dashboard; the webhook updates access.
- **D5:** "≤ 1 Pro mock" = ≤ 1 SUBMITTED Pro mock attempt.
- **D6:** a founding seat stays used after a refund.
- **D7:** only the latest period of a stacked purchase is refundable.
- **Refund Policy 3.2:** within 7 days of the first purchase of a plan, once per user, a full refund.
- The other refund rows (double charge, not activated in 24 h, failed-but-debited, a feature removed → pro rata) are
  done in the dashboard as today.

**Today (149):**
- `fn_refund_pro_payment` is idempotent per refund id (`refund_ids`).
  - A full refund revokes that order's entitlement and sets the order REFUNDED.
  - A partial refund removes pro-rata days from that entitlement only.
  - An unapplied payment's refund (double charge / unfulfillable) is acknowledged once (B4).
  - It writes PRO_ORDER_REFUNDED / PARTIALLY_REFUNDED audit rows.
  - It has no mode check; the founding seat is untouched (D6 already holds).
- **Gaps:**
  1. **No eligibility anywhere:** first purchase, 7 days, Pro mocks submitted and "used before" are not computed.
  2. **A refund of a NON-latest stacked period** leaves a gap: later periods keep their dates, so paid days vanish.
  3. **Test-mode refunds** are not mode-checked. A live server rejects test webhooks by signature, but the database
     function does not check.
  4. **Nothing distinguishes a 7-day policy refund** from the other kinds, so "once per user" cannot be enforced.
  5. **`/billing` does not mark a refunded receipt.**
- **Pro mock = a mock whose current tier is PRO** (`fn_access_tier('MOCK_TEST', id)`). Attempts record no tier.

**Build (migration 151 + app):**
- **`fn_pro_refund_eligibility(p_order_id)`:**
  - SQL, STABLE, INVOKER, service_role only (no SECDEF change).
  - Returns `first_purchase`, `within_7_days` (from the payment's `captured_at`), `pro_mocks_submitted` (submitted
    attempts on PRO-tier mocks since the payment), `policy_refund_used`, `latest_period`, `already_refunded`, `mode`,
    `founding`, `eligible` and `reasons[]`.
- **`pro_refund_approvals` table:**
  - Holds order, payment, reason (POLICY_7_DAY / DOUBLE_CHARGE / NOT_ACTIVATED / FAILED_DEBITED / FEATURE_REMOVED /
    GOODWILL), the eligibility snapshot, the admin id and the time.
  - An admin action writes it **before** refunding in the dashboard.
  - The webhook links the refund to it, so "once per user" = a completed POLICY_7_DAY refund.
- **`fn_refund_pro_payment` v3 (same signature + `p_gateway_mode DEFAULT 'live'`):**
  - MODE_MISMATCH for another mode.
  - **Stacked periods:** a refund of a period that is not the latest moves every later period of that user earlier
    by the time removed.
    - Full refund: `old end − max(start, now)`.
    - Partial refund: the pro-rata days.
    - So the user keeps exactly the paid days they still have.
  - Links the approval (`approval_id`, `refund_kind`) in the audit row.
  - Everything else stays as 149: idempotent per refund id, the unapplied branch, no founding change.
- **`/admin/payments` "Refund check":**
  - Look up an order by payment id or receipt number. The last 7 days of PAID live orders are listed with their
    eligibility (green / red reasons).
  - "Record approval" (reason + note) → then refund in the Razorpay dashboard.
  - Shows refunded state once the webhook lands.
- **`/billing`:** a refunded receipt shows "Refunded ₹X" (own rows, RLS).
- **The B5 refund confirmation e-mail** runs unchanged after the webhook.

**Edge cases:**
| Case | Behaviour |
|---|---|
| Refund after the period expired | Recorded; the entitlement is revoked (no access change); the e-mail says Pro from that payment has ended. |
| Double charge | The B4 unapplied branch, unchanged; never counts as the policy refund. |
| Test-mode order | Only a test-key server handles it; MODE_MISMATCH otherwise. |
| A second refund webhook (Razorpay retry) | `already_processed`; no second e-mail (B5 guard). |
| Partial, then full | Totals add up; the final refund revokes. |
| A refund larger than paid | REFUND_EXCEEDS_PAYMENT (as 149). |
| Founding order refunded | Seat stays used (D6). |
| Refund with no approval | Still applied (money already left). The audit row says `refund_kind = UNRECORDED` and the admin list flags it. |

**Gates:**
- **PAY1-B6 (offline):** migration / rollback text, the eligibility rules as a pure function in the app (same rules as the
  SQL), the admin action (admin only, reason allow-list), negative controls.
- **PAY1-B6-LIVE (rolled back, `--pre` / `--local`):**
  - the eligibility matrix (each reason on / off);
  - full refund of the latest stacked period → that period is revoked, the earlier one untouched;
  - full refund of the earlier period → the later one moves earlier by exactly the removed time;
  - partial refund → pro-rata days, later periods moved;
  - replay → no change;
  - MODE_MISMATCH;
  - refund after expiry;
  - founding `sold` unchanged;
  - once per user;
  - anon / student → 42501.
- Admin / student page smokes for `/admin/payments` and `/billing`.
