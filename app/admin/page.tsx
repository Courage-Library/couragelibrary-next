import React from "react";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { isFeatureEnabled } from "@/config/features";
import { isPaymentsEnabled } from "@/config/payments";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { getTodayV2, humanAction, type TodayV2 } from "@/lib/admin/today";
import { greeting } from "@/lib/admin/review-stats-core";
import { FocusShortcut } from "@/components/admin/studio/focus-shortcut";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

export const revalidate = 0;

const FOCUS_HREF = "/admin/review/focus";
const NA = "Not available";

/**
 * Courage Studio — TODAY v2 (decision #84). Greeting + "N things need you today"; the gradient MISSION card (daily
 * review goal, today's progress, time-left estimate, review streak, "Start focus session" = the ONE primary, F);
 * queue cards with real counts → filtered lists; content health (published questions by exam × subject); recent
 * activity (no e-mails). The guard is unchanged and first; every number is real or "Not available" (R12).
 */
export default async function AdminTodayPage() {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin" });
  const flags = { ADAPTIVE: isFeatureEnabled("ADAPTIVE"), LIVE_TESTS: isFeatureEnabled("LIVE_TESTS"), SUPPORT: isSupportTicketsEnabled(), PAYMENTS: isPaymentsEnabled() };
  const d = await getTodayV2({ role: ctx.role, userId: ctx.userId, flags });
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div className="flex flex-col gap-6">
      <FocusShortcut href={FOCUS_HREF} />
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">
          {greeting()}, {d.greetingName}
        </h1>
        <p className="text-body text-fg-secondary">
          {today} · {d.needYou === 0 ? "nothing needs you right now" : `${d.needYou} thing${d.needYou === 1 ? "" : "s"} need${d.needYou === 1 ? "s" : ""} you today`}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Mission m={d.mission} />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:col-span-2">
          <QueueCard id="question-drafts" title="Question drafts" status={d.drafts.inReview ? "in review" : null} statusTone="blue" value={d.drafts.inReview}
            line={d.drafts.approved === null ? null : `${d.drafts.approved} approved, waiting to publish`} href="/admin/questions/factory?tab=review&status=IN_REVIEW" linkLabel="Open queue">
            <Sparkline points={d.drafts.spark} label="Drafts created per day, last 14 days" />
          </QueueCard>
          {d.reports && (
            <QueueCard id="question-reports" title="Question reports" status={d.reports.oldestDays !== null ? `oldest ${d.reports.oldestDays} day${d.reports.oldestDays === 1 ? "" : "s"}` : null} statusTone={d.reports.overdue ? "red" : "green"}
              value={d.reports.open} line="students found a problem" href="/admin/question-reports?status=OPEN" linkLabel="Fix now">
              <OverdueBar open={d.reports.open} overdue={d.reports.overdue} />
            </QueueCard>
          )}
          <QueueCard id="current-affairs" title="Current affairs" status={d.ca.drafts !== null ? `${d.ca.drafts} draft${d.ca.drafts === 1 ? "" : "s"}` : null} statusTone="cyan" value={d.ca.inReview}
            line="waiting for your review" href="/admin/current-affairs?status=IN_REVIEW" linkLabel="Review" />
          {d.tickets && (
            <QueueCard id="tickets" title="Tickets" status={d.tickets.late === null ? null : d.tickets.late > 0 ? `${d.tickets.late} past 24 h` : "all on time"} statusTone={d.tickets.late ? "red" : "green"}
              value={d.tickets.open} line="open · 24 h reply promise" href="/admin/support?status=OPEN" linkLabel="Open inbox" />
          )}
          <QueueCard id="community-flags" title="Community flags" status={null} statusTone="blue" value={d.flags} line="waiting for moderation" href="/admin/community" linkLabel="Moderate" />
          {d.libraryEnding !== null && (
            <QueueCard id="library-ending" title="Library Pro" status={null} statusTone="blue" value={d.libraryEnding} line="grants ending within 7 days" href="/admin/pro-library" linkLabel="Library Pro" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ContentHealth h={d.health} />
        {d.recent && (
          <section aria-labelledby="today-recent" className="rounded-card border border-line bg-surface p-4">
            <h2 id="today-recent" className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">
              Recent activity
            </h2>
            {d.recent.length === 0 ? (
              <p className="mt-2 text-body-sm text-fg-secondary">No audited changes yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {d.recent.map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 py-2 text-body-sm">
                    <span className="text-fg">{humanAction(r.action)}</span>
                    <time dateTime={r.at} className="shrink-0 text-fg-secondary">
                      {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(r.at))}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Mission({ m }: { m: TodayV2["mission"] }) {
  const done = m.stats?.doneToday ?? null;
  const pct = done === null ? 0 : Math.min(1, done / Math.max(1, m.goal));
  const C = 2 * Math.PI * 34;
  return (
    <section aria-labelledby="mission-title" className="mission-gradient relative flex min-h-80 flex-col gap-4 overflow-hidden rounded-panel p-6 text-fg-inverse" data-today-mission="">
      <p className="text-caption font-semibold uppercase tracking-widest">Today&apos;s mission</p>
      <h2 id="mission-title" className="text-h2 font-bold">
        Review {m.goal} questions
      </h2>
      <p className="max-w-sm text-body-sm">Every question you approve becomes practice for thousands of students.</p>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative size-24" role="img" aria-label={done === null ? "Progress not available" : `${done} of ${m.goal} reviewed today`}>
          <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="8" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-body-lg font-bold tabular-nums">{done === null ? "–" : `${done}/${m.goal}`}</span>
        </div>
        <dl className="flex flex-col gap-2">
          <div>
            <dt className="sr-only">Time left</dt>
            <dd className="text-h3 font-bold">{m.stats?.minutesLeft == null ? "–" : `~${m.stats.minutesLeft} min`}</dd>
            <dd className="text-caption">{m.stats?.minutesLeft == null ? "time left appears after two reviews today" : "left at your pace today"}</dd>
          </div>
          <div>
            <dt className="sr-only">Review streak</dt>
            <dd className="text-h3 font-bold">{m.stats ? `${m.stats.streakDays}-day` : NA}</dd>
            <dd className="text-caption">review streak</dd>
          </div>
        </dl>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3">
        <Link href={FOCUS_HREF} className="focus-ring-on-dark inline-flex min-h-12 items-center gap-2 rounded-control bg-surface px-5 text-body font-semibold text-primary-700 hover:bg-primary-50" data-today-primary="">
          Start focus session <kbd className="rounded border border-primary-200 px-1.5 text-caption">F</kbd>
        </Link>
        <span className="text-caption">{m.queueSize === null ? NA : `${m.queueSize} in the queue`}</span>
      </div>
    </section>
  );
}

const TONE: Record<string, string> = { blue: "bg-primary-700", red: "bg-danger-600", green: "bg-success-600", cyan: "bg-accent-700" };

function QueueCard({ id, title, status, statusTone, value, line, href, linkLabel, children }: { id: string; title: string; status: string | null; statusTone: string; value: number | null; line: string | null; href: string; linkLabel: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={`q-${id}`} className="flex min-h-40 flex-col gap-1 rounded-card border border-line bg-surface p-4" data-today-card={id}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={`q-${id}`} className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">
          {title}
        </h2>
        {status && (
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-fg-secondary">
            <span aria-hidden="true" className={cn("size-2 rounded-full", TONE[statusTone])} />
            {status}
          </span>
        )}
      </div>
      <p className={cn("font-bold tabular-nums", value === null ? "text-body text-fg-secondary" : "text-h1 text-fg")}>{value === null ? NA : value}</p>
      {line && <p className="text-body-sm text-fg-secondary">{line}</p>}
      {children}
      <Link href={href} className="focus-ring mt-auto inline-flex min-h-11 items-center self-start text-body-sm font-semibold text-link underline-offset-2 hover:underline">
        {linkLabel}
        <span className="sr-only"> ({title})</span>&nbsp;→
      </Link>
    </section>
  );
}

function Sparkline({ points, label }: { points: number[] | null; label: string }) {
  if (!points) return <p className="text-caption text-fg-secondary">Trend not available</p>;
  const max = Math.max(1, ...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 200},${38 - (p / max) * 34}`).join(" ");
  return (
    <svg viewBox="0 0 200 40" className="h-10 w-full text-primary-700" role="img" aria-label={`${label}: ${points.join(", ")}`}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function OverdueBar({ open, overdue }: { open: number | null; overdue: number | null }) {
  if (open === null || overdue === null) return null;
  const n = Math.min(open, 10);
  return (
    <div className="flex gap-1" role="img" aria-label={`${overdue} of ${open} open reports are older than 2 days`}>
      {Array.from({ length: Math.max(n, 5) }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < Math.min(overdue, n) ? "bg-danger-600" : i < n ? "bg-primary-700" : "bg-ink-200")} />
      ))}
    </div>
  );
}

function ContentHealth({ h }: { h: TodayV2["health"] }) {
  return (
    <section aria-labelledby="content-health" className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="content-health" className="text-caption font-semibold uppercase tracking-wide text-fg-secondary">
          Content health — published questions by exam &amp; subject
        </h2>
        <Link href="/admin/questions/factory?tab=coverage" className="focus-ring inline-flex min-h-11 items-center text-body-sm font-semibold text-link hover:underline">
          Where to build next →
        </Link>
      </div>
      {!h ? (
        <p className="mt-2 text-body-sm text-fg-secondary">{NA}</p>
      ) : h.subjects.length === 0 ? (
        <p className="mt-2 text-body-sm text-fg-secondary">No published questions are mapped to a subject yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-separate border-spacing-1 text-body-sm">
            <caption className="sr-only">Published questions by exam and subject</caption>
            <thead>
              <tr>
                <th scope="col" className="text-left font-semibold text-fg-secondary">
                  <span className="sr-only">Exam</span>
                </th>
                {h.subjects.map((s) => (
                  <th key={s.id} scope="col" className="px-2 text-center font-semibold text-fg-secondary">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.exams.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="pr-2 text-left font-semibold text-fg">
                    {e.title}
                  </th>
                  {h.subjects.map((s) => {
                    const n = h.cells[`${e.id}:${s.id}`] ?? 0;
                    return (
                      <td key={s.id} className={cn("rounded-control px-2 py-2 text-center tabular-nums", n === 0 ? "bg-ink-100 text-fg-secondary" : n >= 30 ? "bg-primary-100 font-semibold text-primary-800" : "bg-primary-50 font-semibold text-primary-700")}>
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
