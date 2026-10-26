import React from "react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { isFeatureEnabled } from "@/config/features";
import { isPaymentsEnabled } from "@/config/payments";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { getTodayData, humanAction, type TodayCard } from "@/lib/admin/today";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

export const revalidate = 0;

/**
 * ADMIN-UX-1 phase B — TODAY: what needs attention now. Each card = a real count + ONE link to the already-filtered
 * list. Read-only, role-aware (lib/admin/today.ts). The guard is unchanged and first.
 */
export default async function AdminTodayPage() {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin" });
  const flags = { ADAPTIVE: isFeatureEnabled("ADAPTIVE"), LIVE_TESTS: isFeatureEnabled("LIVE_TESTS"), SUPPORT: isSupportTicketsEnabled(), PAYMENTS: isPaymentsEnabled() };
  const data = await getTodayData(ctx.role, flags);
  const waiting = data.cards.filter((c) => c.tone === "waiting" && (c.count ?? 0) > 0);
  const busiest = [...waiting].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0] ?? null;
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-h2 font-bold text-fg">Today</h1>
        <p className="text-body text-fg-secondary">
          {today} · {waiting.length === 0 ? "nothing is waiting" : `${waiting.length} queue${waiting.length === 1 ? "" : "s"} need${waiting.length === 1 ? "s" : ""} attention`}
        </p>
        {busiest && (
          <Link
            href={busiest.href}
            className="focus-ring ml-auto inline-flex min-h-11 items-center rounded-control bg-accent-500 px-4 text-body font-semibold text-ink-950 hover:bg-accent-400"
            data-today-primary=""
          >
            {busiest.linkLabel} ({busiest.count})
          </Link>
        )}
      </header>

      <section aria-labelledby="today-attention">
        <h2 id="today-attention" className="sr-only">
          Needs attention
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.cards.map((c) => (
            <li key={c.id}>
              <TodayCardView card={c} />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 lg:grid-cols-3">
        {data.recent && (
          <section aria-labelledby="today-recent" className="rounded-card border border-line bg-surface p-4 lg:col-span-2">
            <h2 id="today-recent" className="text-body-lg font-semibold text-fg">
              Recently changed
            </h2>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-body-sm text-fg-secondary">No audited changes yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-2 text-body-sm">
                    <span className="text-fg">
                      {humanAction(r.action)} <span className="text-fg-secondary">· {r.entity.replace(/_/g, " ")}</span>
                    </span>
                    <time dateTime={r.at} className="text-fg-secondary">
                      {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(r.at))}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section aria-labelledby="today-glance" className="rounded-card border border-line bg-surface p-4">
          <h2 id="today-glance" className="text-body-lg font-semibold text-fg">
            Content at a glance
          </h2>
          <dl className="mt-2 divide-y divide-line">
            {data.glance.map((g) => (
              <div key={g.label} className="flex justify-between gap-2 py-2 text-body-sm">
                <dt className="text-fg-secondary">{g.label}</dt>
                <dd className="font-semibold tabular-nums text-fg">{g.value ?? "Not available"}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function TodayCardView({ card }: { card: TodayCard }) {
  const waiting = card.tone === "waiting" && (card.count ?? 0) > 0;
  return (
    <div
      className={cn(
        "flex h-full min-h-32 flex-col gap-1 rounded-card border bg-surface p-4",
        waiting ? "border-accent-500 shadow-[inset_0_3px_0_var(--color-accent-500)]" : "border-line",
      )}
      data-today-card={card.id}
    >
      <p className={cn("text-h2 font-bold tabular-nums", card.count === null ? "text-fg-secondary" : "text-fg")}>
        {card.count === null ? "Not available" : card.count}
      </p>
      <p className="text-body text-fg">{card.label}</p>
      {card.detail && <p className="text-body-sm text-fg-secondary">{card.detail}</p>}
      <Link href={card.href} className="focus-ring mt-auto inline-flex min-h-11 items-center self-start text-body-sm font-semibold text-primary-700 underline-offset-2 hover:underline">
        {card.linkLabel}
        <span className="sr-only"> ({card.label})</span> →
      </Link>
    </div>
  );
}
