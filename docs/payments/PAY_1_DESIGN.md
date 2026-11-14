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
