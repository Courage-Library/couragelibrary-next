/**
 * PAY-1 B5 transactional e-mails (owner D8, E4, E7): receipt, D7 / D1 expiry reminder, refund confirmation. Pure
 * functions, no imports — the offline gate renders these exact templates.
 *   - Brand Band like the auth e-mails: 600px, system fonts, the own-domain banner (alt text when images are off),
 *     one solid #1D4ED8 button with a plain-text link under it, inline CSS only, no tracking, no utm_
 *   - every value is HTML-escaped; every message has a plain-text twin with the same facts
 *   - every message names the support address (reply-to is support too)
 *   - dates are shown in India time (Asia/Kolkata); amounts in rupees
 *   - E7: while the business is not GST-registered the receipt says "Payment receipt — not a tax invoice"
 *   - the only links: <site>/billing, <site>/pricing (reminders), the support mailto
 */

export type ProEmailKind = "PRO_RECEIPT" | "PRO_EXPIRY_D7" | "PRO_EXPIRY_D1" | "PRO_REFUND";

export interface EmailContext {
  /** The deployment's own origin, e.g. https://couragelibrary.in (no trailing slash). */
  siteUrl: string;
  supportEmail: string;
  /** E1: a QA account's mail goes to the QA inbox; the subject names the account it was for. */
  qaFor?: string | null;
}

export interface ReceiptData {
  receiptNumber: string;
  planCode: string;
  amountPaise: number;
  paidAt: string;
  proUntil: string;
  gstRegistered: boolean;
}
export interface ExpiryData {
  endsAt: string;
}
export interface RefundData {
  receiptNumber: string | null;
  /** The total refunded for this payment so far (Razorpay can refund in parts). */
  refundedTotalPaise: number;
  /** The whole payment is refunded (Pro from it has ended). */
  full: boolean;
  /** A duplicate / unfulfillable payment: no Pro was granted for it, so the plan is unchanged. */
  unapplied: boolean;
  /** The user's Pro end after the refund (null = no active Pro). */
  proUntil: string | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const C = { canvas: "#f7f8fc", surface: "#ffffff", line: "#e6e9f2", fg: "#0b1b4d", muted: "#64708a", brand: "#1d4ed8" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const BANNER = "https://couragelibrary.in/email/banner.png";

export const PLAN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  PRO_3M: "Pro · 3 months",
  PRO_6M: "Pro · 6 months",
  PRO_12M: "Pro · 12 months",
  PRO_12M_FOUNDING: "Pro · 12 months (founding offer)",
});

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(d);
}

export function formatRupees(paise: number): string {
  const r = Math.round(paise) / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Layout {
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  rows: Array<[string, string]>;
  button: { label: string; path: string };
  notes: string[];
  why: string;
}

function render(l: Layout, ctx: EmailContext): RenderedEmail {
  const site = ctx.siteUrl.replace(/\/+$/, "");
  const url = `${site}${l.button.path}`;
  const subject = ctx.qaFor ? `[QA test for ${ctx.qaFor}] ${l.subject}` : l.subject;
  const td = (extra: string) => `font-family:${FONT};${extra}`;
  const rows = l.rows
    .map(
      ([k, v]) =>
        `<tr><td style="${td(`padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;line-height:20px;color:${C.muted};`)}">${esc(k)}</td>` +
        `<td align="right" style="${td(`padding:8px 0;border-bottom:1px solid ${C.line};font-size:14px;line-height:20px;font-weight:bold;color:${C.fg};`)}">${esc(v)}</td></tr>`,
    )
    .join("\n");
  const notes = l.notes.map((n) => `<p style="margin:12px 0 0 0;font-size:14px;line-height:22px;color:${C.muted};">${esc(n)}</p>`).join("\n");
  const support = esc(ctx.supportEmail);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.canvas};font-family:${FONT};color:${C.fg};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.canvas};">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background-color:${C.canvas};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
        <tr>
          <td bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:16px 16px 0 0;${td("font-size:20px;line-height:28px;font-weight:bold;color:#ffffff;")}"><img src="${BANNER}" width="600" height="120" alt="Courage Library" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:16px 16px 0 0;"></td>
        </tr>
        <tr>
          <td bgcolor="${C.surface}" style="background-color:${C.surface};border:1px solid ${C.line};border-top:0;border-radius:0 0 16px 16px;padding:32px;${td("")}">
            <h1 style="margin:0;font-size:24px;line-height:30px;font-weight:bold;color:${C.fg};">${esc(l.title)}</h1>
            <p style="margin:10px 0 0 0;font-size:16px;line-height:24px;color:${C.fg};">${esc(l.intro)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;">
${rows}
            </table>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
              <tr>
                <td bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:10px;">
                  <a href="${esc(url)}" style="display:inline-block;min-height:44px;box-sizing:border-box;padding:13px 28px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(l.button.label)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0 0;font-size:14px;line-height:22px;color:${C.muted};">If the button doesn't work, copy this link into your browser:<br>
            <a href="${esc(url)}" style="color:${C.brand};text-decoration:underline;word-break:break-all;">${esc(url)}</a></p>
${notes}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 32px 0 32px;${td(`font-size:12px;line-height:18px;color:${C.muted};`)}">You received this because ${esc(l.why)}.<br>Questions? <a href="mailto:${support}" style="color:${C.muted};text-decoration:underline;">${support}</a> — or reply to this email.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
  const text = [
    l.title,
    "",
    l.intro,
    "",
    ...l.rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `${l.button.label}: ${url}`,
    ...(l.notes.length ? ["", ...l.notes] : []),
    "",
    "—",
    `You received this because ${l.why}.`,
    `Questions? Write to ${ctx.supportEmail} or reply to this email.`,
    "Courage Library",
    "",
  ].join("\n");
  return { subject, html, text };
}

export function renderReceipt(d: ReceiptData, ctx: EmailContext): RenderedEmail {
  return render(
    {
      subject: `Your Courage Library Pro receipt ${d.receiptNumber}`,
      preheader: `Pro is active until ${formatDate(d.proUntil)}. Receipt ${d.receiptNumber}.`,
      title: "Thank you — Pro is active",
      intro: `Your payment is complete and Pro is active until ${formatDate(d.proUntil)}.`,
      rows: [
        ["Receipt number", d.receiptNumber],
        ["Plan", PLAN_LABELS[d.planCode] ?? d.planCode],
        ["Amount paid", formatRupees(d.amountPaise)],
        ["Paid on", formatDate(d.paidAt)],
        ["Pro active until", formatDate(d.proUntil)],
      ],
      button: { label: "View billing", path: "/billing" },
      notes: [
        d.gstRegistered ? "This receipt is also listed in Account → Billing." : "Payment receipt — not a tax invoice. No GST is charged. This receipt is also listed in Account → Billing.",
        "Refunds follow our Refund Policy; write to us if something looks wrong.",
      ],
      why: "you bought Courage Library Pro",
    },
    ctx,
  );
}

export function renderExpiry(kind: "PRO_EXPIRY_D7" | "PRO_EXPIRY_D1", d: ExpiryData, ctx: EmailContext): RenderedEmail {
  const d1 = kind === "PRO_EXPIRY_D1";
  const end = formatDate(d.endsAt);
  return render(
    {
      subject: d1 ? "Your Pro plan ends tomorrow" : "Your Pro plan ends in 7 days",
      preheader: `Pro ends on ${end}. Renew any time — the new plan starts when this one ends.`,
      title: d1 ? "Pro ends tomorrow" : "Pro ends in 7 days",
      intro: `Your Courage Library Pro access ends on ${end}. After that your account stays, with the free features.`,
      rows: [["Pro ends on", end]],
      button: { label: "Renew Pro", path: "/pricing" },
      notes: ["If you renew before it ends, the new plan starts when this one ends, so you lose no days. The end date is always shown in Account → Billing."],
      why: "your Courage Library Pro plan is ending (we promised to remind you 7 days and 1 day before)",
    },
    ctx,
  );
}

export function renderRefund(d: RefundData, ctx: EmailContext): RenderedEmail {
  const rows: Array<[string, string]> = [];
  if (d.receiptNumber) rows.push(["Receipt number", d.receiptNumber]);
  rows.push([d.unapplied ? "Refunded" : "Refunded so far for this payment", formatRupees(d.refundedTotalPaise)]);
  let status: string;
  if (d.unapplied) status = d.proUntil ? `Unchanged — Pro is active until ${formatDate(d.proUntil)}` : "Unchanged";
  else if (d.proUntil) status = `Pro is active until ${formatDate(d.proUntil)}`;
  else status = "Pro from this payment has ended";
  rows.push(["Your Pro plan", status]);
  return render(
    {
      subject: d.unapplied ? "Refund of a duplicate payment" : d.receiptNumber ? `Refund recorded for receipt ${d.receiptNumber}` : "Refund recorded",
      preheader: `${formatRupees(d.refundedTotalPaise)} is on its way back to your original payment method.`,
      title: "Your refund is recorded",
      intro: d.unapplied
        ? "We took a payment that did not add Pro to your account (for example a second payment for the same order). It has been refunded."
        : "We have recorded a refund for your Courage Library Pro payment.",
      rows,
      button: { label: "View billing", path: "/billing" },
      notes: ["Refunds go back to the original payment method through Razorpay, usually within 5–7 working days. Your bank may take a few more days to show it."],
      why: "a refund was made for a payment on your Courage Library account",
    },
    ctx,
  );
}
