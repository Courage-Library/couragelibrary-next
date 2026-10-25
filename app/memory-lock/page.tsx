import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLink } from "@/components/ui/pill-button";
import { ProgressBar } from "@/components/ui/progress";
import { MEMORY_LOCK } from "@/content/memory-lock";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isMemoryLockEnabled } from "@/lib/memory-lock/flag";
import { loadMemoryLock } from "@/lib/memory-lock/server";
import { formatDateShort } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: MEMORY_LOCK.name, robots: { index: false, follow: false } };

/**
 * F5 Memory Lock overview (R4: ONE primary action — "Start"; R5: due count, lock meter and the next 7 days always
 * visible; R11: no streaks, no shaming, no urgency). Signed-in only; flag off → 404.
 */
export default async function MemoryLockPage() {
  if (!isMemoryLockEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") {
    return (
      <Container className="py-10">
        <EmptyState icon={<Lock />} title={MEMORY_LOCK.name} description={MEMORY_LOCK.addResults.NOT_SIGNED_IN} action={<ButtonLink href="/auth/login?next=%2Fmemory-lock">Sign in</ButtonLink>} />
      </Container>
    );
  }
  const ml = await loadMemoryLock(supabase, session.user.id);
  const topics = ml.groups.length;

  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8 lg:py-10" data-memory-lock-page="">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">{MEMORY_LOCK.name}</h1>
        <p className="text-body text-fg-secondary">{MEMORY_LOCK.dueLead}</p>
      </header>

      {ml.meter.total === 0 ? (
        <EmptyState icon={<Lock />} title={MEMORY_LOCK.name} description={MEMORY_LOCK.empty} action={<ButtonLink href="/practice">{MEMORY_LOCK.practiceCta}</ButtonLink>} headingLevel={2} />
      ) : (
        <>
          <Card className="flex flex-col gap-3" data-memory-lock-due={ml.total}>
            <h2 className="text-h2 font-bold text-fg">{MEMORY_LOCK.dueToday(ml.total, topics)}</h2>
            {ml.total > 0 ? (
              <>
                <ul className="flex flex-col gap-1 text-body text-fg-secondary">
                  {ml.groups.map((g) => (
                    <li key={g.topicId ?? "none"}>
                      {g.topicName}: {g.items.length}
                    </li>
                  ))}
                </ul>
                {ml.dueTotal > ml.total && <p className="text-body-sm text-fg-secondary">{MEMORY_LOCK.moreDue(ml.dueTotal - ml.total)}</p>}
                <div>
                  <PillLink href="/memory-lock/session" variant="accent-on-light" data-memory-lock-start="">
                    {MEMORY_LOCK.start}
                  </PillLink>
                </div>
              </>
            ) : (
              <p className="text-body text-fg-secondary">{MEMORY_LOCK.nothingDue}</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{MEMORY_LOCK.meterTitle}</h2>
            <ProgressBar label={MEMORY_LOCK.meter(ml.meter.locked, ml.meter.total)} value={ml.meter.locked} max={Math.max(1, ml.meter.total)} valueText={MEMORY_LOCK.meter(ml.meter.locked, ml.meter.total)} />
            <p className="text-body-sm text-fg-secondary">{MEMORY_LOCK.meterHelp}</p>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-h3 font-semibold text-fg">{MEMORY_LOCK.upcomingTitle}</h2>
            {ml.upcoming.every((d) => d.count === 0) ? (
              <p className="text-body text-fg-secondary">{MEMORY_LOCK.upcomingNone}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 text-body text-fg sm:grid-cols-2">
                {ml.upcoming.map((d) => (
                  <li key={d.day} className="flex justify-between gap-3 border-b border-line py-1.5 tabular-nums">
                    <span>{formatDateShort(`${d.day}T12:00:00+05:30`)}</span>
                    <span>{d.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Container>
  );
}
