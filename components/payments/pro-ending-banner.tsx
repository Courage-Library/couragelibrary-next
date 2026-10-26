import { Alert } from "@/components/ui/alert";
import { TextLink } from "@/components/ui/link";
import { formatDateShort } from "@/lib/format";

/**
 * F9-B expiry reminder (7 days and less before a fixed Pro period ends). R11: plain facts only — no urgency words, no
 * countdown; nothing renews automatically, so the student simply learns the date and where to buy again if they want.
 */
export function ProEndingBanner({ endsAt, daysLeft }: { endsAt: string; daysLeft: number }) {
  return (
    <Alert tone="info" title={`Your Pro ends on ${formatDateShort(endsAt)}`} data-days-left={daysLeft}>
      Pro does not renew automatically. Your data stays after it ends. If you want more Pro time, you can buy another period on the{" "}
      <TextLink href="/pricing">pricing page</TextLink>.
    </Alert>
  );
}
