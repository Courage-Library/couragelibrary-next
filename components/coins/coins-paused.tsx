import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { COINS_PAUSED_REASON } from "@/lib/coins/flag";

/** BRAND-3 fix 1: the wallet / store while COINS_ENABLED is off — no balance or catalogue is read or shown (R12). */
export function CoinsPaused() {
  return (
    <Container className="flex max-w-2xl flex-col gap-3 py-12" data-coins-paused="">
      <h1 className="text-h1 font-bold text-fg">{COINS_PAUSED_REASON}</h1>
      <p className="text-body text-fg-secondary">Coins and the rewards store are switched off while we rebuild them. Your study streak still counts.</p>
      <Link href="/dashboard" className="focus-ring inline-flex min-h-12 items-center self-start font-semibold text-primary-700 underline-offset-2 hover:underline">
        Back to your dashboard
      </Link>
    </Container>
  );
}
