import Link from "next/link";
import { Coins } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDateShort } from "@/lib/format";

/**
 * COURSE-UX-1 (decision #78 + owner exception: lesson EARNING only). The wallet while lesson coins are on and the rest
 * of coins (spending, store) is still off: the balance and the recent credits — the student's OWN rows (RLS) — and
 * an honest line that spending is not available yet. Coins are loyalty points with no cash value.
 */
export async function LessonCoinsWallet() {
  const supabase = await createServerSupabaseClient();
  const [{ data: wallet }, { data: ledger }] = await Promise.all([
    supabase.from("coin_wallets").select("current_balance").maybeSingle(),
    supabase.from("coin_ledger").select("id, amount, direction, reason_code, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const balance = wallet?.current_balance ?? 0;
  return (
    <Container className="flex max-w-2xl flex-col gap-4 py-12" data-lesson-coins-wallet="">
      <h1 className="text-h1 font-bold text-fg">Your coins</h1>
      <p className="inline-flex items-center gap-2 text-h2 font-bold text-fg">
        <Coins aria-hidden="true" className="size-7 text-primary-700" /> {balance}
        <span className="sr-only">coins</span>
      </p>
      <p className="text-body text-fg-secondary">You earn coins by completing lessons. Coins are loyalty points with no cash value. Spending coins is not available yet.</p>
      {ledger && ledger.length > 0 ? (
        <section aria-labelledby="coin-history-h" className="flex flex-col gap-2">
          <h2 id="coin-history-h" className="text-h3 font-semibold text-fg">
            Recent coins
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {ledger.map((r) => (
              <li key={r.id} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 text-body">
                <span className="text-fg">{r.reason_code === "LESSON_COMPLETED" ? "Lesson completed" : "Coins"}</span>
                <span className="text-body-sm text-fg-secondary">{formatDateShort(r.created_at)}</span>
                <span className={`font-semibold ${r.direction === "CREDIT" ? "text-success-700" : "text-fg"}`}>
                  {r.direction === "CREDIT" ? "+" : "−"}
                  {r.amount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-body text-fg-secondary">No coins yet. Complete a lesson to earn your first coins.</p>
      )}
      <Link href="/dashboard" className="focus-ring inline-flex min-h-12 items-center self-start font-semibold text-primary-700 underline-offset-2 hover:underline">
        Back to your dashboard
      </Link>
    </Container>
  );
}
