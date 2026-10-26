"use client";

import React, { useRef, useState } from "react";
import { PRICING_META } from "@/content/public-pages";
import type { UserSubscriptionStatus } from "@/services/billing.service";
import { Container as DsContainer } from "@/components/ui/layout";
import { Badge as DsBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Radio } from "@/components/ui/radio";
import { TextLink } from "@/components/ui/link";
import { PricingCard, type PricingFeature } from "@/components/ui/domain/pricing-card";
import { formatDateShort, formatInr } from "@/lib/format";
import { createProOrderAction } from "./actions";
import type { ProAccountView, ProPlanView } from "@/lib/payments/pro-types";

export type ProCheckoutView = { open: true; keyId: string } | { open: false; message: string };

export interface ProPricingProps {
  plans: ProPlanView[];
  account: ProAccountView;
  checkout: ProCheckoutView;
  legal: { terms: string; refund: string; privacy: string };
}

interface PricingClientProps {
  subStatus: UserSubscriptionStatus;
  paymentsEnabled: boolean;
  /** F9-B: present only when PAYMENTS_ENABLED and PRO_ENABLED are both on (server flags). */
  pro: ProPricingProps | null;
}

export function PricingClient({ subStatus, paymentsEnabled, pro }: PricingClientProps) {
  // UX-2b.H (H-7): while payments are off, nothing may look purchasable.
  if (!paymentsEnabled) return <PaymentsOffView subStatus={subStatus} />;
  if (!pro) return <PaymentsOffView subStatus={subStatus} />;
  return <ProPricingView {...pro} />;
}

/** Calendar months, as the database adds them (make_interval(months => n)). */
function addMonths(iso: string, months: number): Date {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

const ORDER_ERROR: Record<string, string> = {
  AGE_REQUIRED: "Please confirm that you are 18 or older before buying.",
  ALREADY_UNLIMITED: "You already have Pro with no end date. There is nothing to buy.",
  FOUNDING_CLOSED: "The founding offer has ended. Please choose another plan.",
  RATE_LIMITED: "Too many attempts in a short time. Please try again in 10 minutes.",
  PLAN_NOT_FOUND: "This plan is no longer available. Please reload the page.",
  ORDER_IN_PROGRESS: "Your previous attempt is still being set up. Please wait a moment and try again.",
  GATEWAY_UNAVAILABLE: "We couldn't reach the payment provider. You have not been charged. Please try again.",
  UNAUTHENTICATED: "Please sign in to continue.",
};
const GENERIC_ERROR = "Something went wrong. You have not been charged. Please try again.";
const VERIFY_PENDING =
  "We received your payment and are confirming it. Your Pro will appear within a few minutes; refresh this page to check. You will not be charged twice.";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open(): void };

function loadCheckoutScript(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("checkout")));
    s.onerror = () => reject(new Error("checkout"));
    document.body.appendChild(s);
  });
}

/**
 * F9-B payments-ON view (R4 one primary action, R10 48 px targets, R11 / R12 honest: the total, the exact Pro dates,
 * "one-time, no auto-renew" and the Terms / Refund / Privacy links are shown BEFORE paying; no countdown, no
 * strike-through price, no pre-ticked box, no "x left"). Prices come from the server (plan versions); the browser
 * gets only the public key id. The 18+ confirmation is required (server-enforced too).
 */
function ProPricingView({ plans, account, checkout, legal }: ProPricingProps) {
  const [selected, setSelected] = useState<string>(() => (plans.find((p) => p.badge) ?? plans[0])?.planCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ expiresAt: string | null; receipt: string | null; pending?: boolean } | null>(null);
  // one idempotency key per plan for this page view: a double click returns the same open order
  const keys = useRef<Record<string, string>>({});
  const plan = plans.find((p) => p.planCode === selected) ?? null;
  const start = account.currentEnd ?? new Date().toISOString();
  const end = plan ? addMonths(start, plan.durationMonths) : null;

  async function pay() {
    if (!plan || !checkout.open || busy) return;
    setBusy(true);
    setError(null);
    try {
      keys.current[plan.planCode] ??= crypto.randomUUID().replace(/-/g, "");
      const order = await createProOrderAction(plan.planCode, keys.current[plan.planCode]);
      if (!order.ok) {
        setError(ORDER_ERROR[order.code] ?? GENERIC_ERROR);
        setBusy(false);
        return;
      }
      const Razorpay = await loadCheckoutScript();
      const rzp = new Razorpay({
        key: order.keyId,
        order_id: order.gatewayOrderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Courage Library",
        description: plan.label,
        handler: async (resp: RazorpayResponse) => {
          try {
            const res = await fetch("/api/payments/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(resp) });
            const data = (await res.json().catch(() => null)) as { ok?: boolean; expiresAt?: string | null; receiptNumber?: string | null } | null;
            setDone(data?.ok ? { expiresAt: data.expiresAt ?? null, receipt: data.receiptNumber ?? null } : { expiresAt: null, receipt: null, pending: true });
          } catch {
            setDone({ expiresAt: null, receipt: null, pending: true });
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch {
      setError(GENERIC_ERROR);
      setBusy(false);
    }
  }

  const priceLabel = plan ? formatInr(plan.pricePaise / 100) : "";
  let action: React.ReactNode;
  if (done) {
    action = done.pending ? (
      <Alert tone="info">{VERIFY_PENDING}</Alert>
    ) : (
      <Alert tone="success" title="Payment received">
        {done.expiresAt ? `You're on Pro until ${formatDateShort(done.expiresAt)}.` : "Your Pro is active."}
        {done.receipt ? ` Receipt ${done.receipt} is in Billing.` : ""}
      </Alert>
    );
  } else if (account.unlimited) {
    action = <Alert tone="success">You have Pro with no end date. There is nothing to buy.</Alert>;
  } else if (!checkout.open) {
    action = (
      <>
        <Alert tone="info">{checkout.message}</Alert>
        <Button size="lg" fullWidth disabled>
          Pay {priceLabel}
        </Button>
      </>
    );
  } else if (!account.signedIn) {
    action = (
      <ButtonLink href="/auth/login?next=/pricing" size="lg" fullWidth>
        Sign in to continue
      </ButtonLink>
    );
  } else if (!account.adultConfirmed) {
    action = (
      <>
        <p className="text-body-sm text-fg-secondary">Pro is for people aged 18 or older. Please confirm your age first.</p>
        <ButtonLink href="/confirm-age?next=/pricing" size="lg" fullWidth>
          Confirm your age
        </ButtonLink>
      </>
    );
  } else {
    action = (
      <Button size="lg" fullWidth loading={busy} disabled={!plan} onClick={pay} data-pro-pay="">
        Pay {priceLabel}
      </Button>
    );
  }

  return (
    <DsContainer className="flex flex-col gap-8 py-8 lg:py-12">
      <header className="mx-auto flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-h1 font-bold text-fg">Plans and pricing</h1>
        <p className="text-body text-fg-secondary">Pro is a one-time payment for a fixed period. It does not renew automatically.</p>
      </header>

      <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <PricingCard name="Free" priceInr={0} period={null} features={FREE_FEATURES} ctaHref="/mock-tests" ctaLabel="Take a free mock test" />

        <section aria-labelledby="plan-pro" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
          <h2 id="plan-pro" className="text-h3 font-semibold text-fg">
            Pro
          </h2>
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Choose a Pro plan</legend>
            {plans.map((p) => (
              <Radio
                key={p.planCode}
                tile
                name="pro-plan"
                value={p.planCode}
                checked={selected === p.planCode}
                onChange={() => setSelected(p.planCode)}
                disabled={busy || !!done}
                label={`${p.label} · ${formatInr(p.pricePaise / 100)}`}
                description={p.isFounding ? "Founding offer for the first 1,000 buyers. Founding buyers keep this price when they buy again." : (p.badge ?? undefined)}
              />
            ))}
          </fieldset>

          {plan && end && (
            <dl className="flex flex-col gap-1 rounded-control border border-line p-4 text-body-sm" data-pro-summary="">
              <div className="flex justify-between gap-4">
                <dt className="text-fg-secondary">Total</dt>
                <dd className="font-semibold tabular-nums text-fg">{priceLabel}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-fg-secondary">Pro period</dt>
                <dd className="text-right text-fg">
                  {account.currentEnd ? `From ${formatDateShort(start)} (after your current Pro)` : "From today"} until {formatDateShort(end)}
                </dd>
              </div>
              <p className="pt-1 text-fg-secondary">One-time payment. No auto-renew. No GST is charged.</p>
            </dl>
          )}

          {error && (
            <Alert tone="danger" live>
              {error}
            </Alert>
          )}
          <div className="flex flex-col gap-3">{action}</div>

          <p className="text-caption text-fg-muted">
            By paying you agree to our <TextLink href={legal.terms}>Terms</TextLink>, <TextLink href={legal.refund}>Refund policy</TextLink> and{" "}
            <TextLink href={legal.privacy}>Privacy policy</TextLink>. Payments are processed by Razorpay.
          </p>
        </section>
      </div>
    </DsContainer>
  );
}

// Features a free account can use today. Each one is live and verified (UX-2b.H report §2); dormant features
// (courses, battles, live tests, descriptive evaluation) are not listed while their flags are off.
const FREE_FEATURES: PricingFeature[] = [
  { label: "Mock tests with full answer review", included: true },
  { label: "Mistake Vault: revise and drill every question you got wrong", included: true },
  { label: "Exam guides: pattern, syllabus and eligibility", included: true },
];

/** Payments off: DESIGN_SYSTEM Pricing card "Opening soon" variant; no price, no checkout, no coupon, no badge. */
function PaymentsOffView({ subStatus }: { subStatus: UserSubscriptionStatus }) {
  return (
    <DsContainer className="flex flex-col gap-8 py-8 lg:py-12">
      <header className="mx-auto flex max-w-2xl flex-col gap-2 text-center">
        <h1 className="text-h1 font-bold text-fg">Plans and pricing</h1>
        <p className="text-body-lg font-semibold text-fg" data-pricing-headline="">{PRICING_META.headline}</p>
        <p className="text-body text-fg-secondary">
          Courage Library is free during early access. Pro is not open yet, and there is nothing to pay today.
        </p>
      </header>

      {subStatus.isPro && subStatus.validUntil && (
        <Alert tone="success" className="mx-auto w-full max-w-xl">
          You&apos;re on Pro until {formatDateShort(subStatus.validUntil)}.
        </Alert>
      )}

      <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <PricingCard
          name="Free"
          priceInr={0}
          period={null}
          features={FREE_FEATURES}
          ctaHref="/mock-tests"
          ctaLabel="Take a free mock test"
        />

        <section aria-labelledby="plan-pro" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="plan-pro" className="text-h3 font-semibold text-fg">
              Pro
            </h3>
            <DsBadge tone="neutral">Opening soon</DsBadge>
          </div>
          <p className="text-h3 font-semibold text-fg">Pricing announced soon</p>
          <p className="text-body-sm text-fg-secondary">
            Pro is not open yet. What it includes and what it costs will be announced here before it opens.
          </p>
          <span
            className="mt-auto inline-flex h-11 w-full items-center justify-center rounded-control border border-line-control bg-surface text-body font-medium text-fg-secondary"
            aria-disabled="true"
          >
            Opening soon
          </span>
        </section>
      </div>
    </DsContainer>
  );
}
