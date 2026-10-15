# Pricing: `/pricing`

**Purpose.** State clearly what is free forever and what Pro adds. The page collects upgrade interest while payments are not built. The touchpoints are designed now, but checkout is not; Commerce owns it.

**User and job-to-be-done.** A student who has hit a Pro lock, or who is evaluating the platform. Their job: "What do I get free, what does Pro add, and what does it cost?"

## Today
- The plans list works, with 1 active `subscription_plans` row.
- The subscription status always shows FREE, because `getUserSubscriptionStatus` reads columns that don't exist (tracked as `TYPES-1:B-BILLING-SUB-STATUS`, owner pending).
- Purchases return 503 because payments are off (SEC-1A containment).
- `/billing` and `/premium` overlap with this page.

## Sections
1. h1 "Start free. Go Pro when you're ready" and a billing-period toggle (only if more than one plan period exists).
2. **Plan cards:**
   - **Free:** mocks (free series), mistake vault and revision, free lessons, basic analytics
   - **Pro** (highlighted): all lessons, Pro test series, detailed solutions (if tiered), advanced analytics
   - **Pro annual**, if it exists

   Each card shows the price in ₹ with a GST note and a feature list with ✓. While payments are off, the CTA is **"Notify me when Pro opens"**, which records interest; signed out, it asks the student to sign in first.
3. **Comparison table** (Free vs Pro, by feature row; on mobile it becomes accordions by category).
4. **Library members:** the Courage Library Kanpur members offer (owner decision; this is a touchpoint only).
5. FAQ: refunds (link to `/legal/refund`), validity, devices, payment methods (when live).
6. Trust: "Secure payments via {provider}" is shown only when it is true.

**Components.** Pricing card, Tabs (period), Table, Accordion, Button, Badge ("Current plan"), Toast ("We'll notify you").

## Data
- `BillingService.getSubscriptionPlans`: `subscription_plans` with `base_price_inr`, `tax_rate_pct`, `duration_days` and `feature_flags`.
- The current plan comes from entitlements. **Fix needed:** `PRO_SUBSCRIPTION` / `PROMOTIONAL_PASS` with `is_active` plus the `starts_at`/`expires_at` window, as `LearningResolverService` already does. This is a billing-owner decision.
- **MISSING:** an interest-capture store (`upgrade_interest` events via ACT-1, or a small table).

**States.**
- Payments off: no price is used to imply purchase. If the owner hasn't approved prices, show "Pricing announced soon".
- Current Pro: "You're on Pro until {date}" with a manage link.
- Error: the plans fail to load, so show a static Free / Pro comparison without prices.

**Access tier.** Public.

**SEO.** Title "Pricing: Free & Pro Plans | Courage Library". `Product` / `Offer` JSON-LD only when prices are live and purchasable.

**Analytics events.** `pricing_viewed` (with `from`), `plan_cta_clicked`, `pro_interest_registered`, `pricing_faq_expanded`.

**Mobile behaviour.**
- The Pro card comes first, and the cards are swipeable.
- The comparison collapses into accordions.

**Dependencies.**
- Commerce (payments, entitlements, invoices).
- Legal pages (refund / terms) are required before taking any payment.
- The owner decides prices and what is in Pro.

Build phase: the touchpoints and the interest CTA ship in UX-2; full checkout comes in UX-7 or with Commerce.
