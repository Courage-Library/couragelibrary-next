import React from "react";
import Link from "next/link";
import { ArrowUp, Check, Circle, X } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { isFeatureEnabled } from "@/config/features";
import { isPaymentsEnabled } from "@/config/payments";
import { isSupportTicketsEnabled } from "@/lib/support/tickets";
import { getTodayV2, humanAction, actionKind, type TodayV2 } from "@/lib/admin/today";
import { greeting } from "@/lib/admin/review-stats-core";
import { FocusShortcut } from "@/components/admin/studio/focus-shortcut";
import { cn } from "@/components/ui/cn";

export const dynamic = "force-dynamic";

export const revalidate = 0;

const FOCUS_HREF = "/admin/questions/review";
const IMPORT_HREF = "/admin/questions/import";
const NA = "Not available";

/**
 * Courage Studio — TODAY v2 (decision #84; STUDIO-P2-POLISH = the approved concept). Greeting + "N things need you
 * today"; the gradient MISSION card spanning two card rows (goal, ring, time left, streak, ONE primary: "Start focus
 * session" (F) — or "Import questions" when the queue is empty); four queue cards with a status line; an "Also" strip;
 * content health (every exam with questions × subject: published + in review); recent activity grouped (no e-mails). Guard first; every number real
 * or "Not available" (R12).
 */
export default async function AdminTodayPage() {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin" });
  const flags = { ADAPTIVE: isFeatureEnabled("ADAPTIVE"), LIVE_TESTS: isFeatureEnabled("LIVE_TESTS"), SUPPORT: isSupportTicketsEnabled(), PAYMENTS: isPaymentsEnabled() };
  const d = await getTodayV2({ role: ctx.role, userId: ctx.userId, flags });
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date());
  const queueEmpty = d.mission.queueSize === 0;

  return (
    <div className="flex flex-col gap-4">
      {!queueEmpty && <FocusShortcut href={FOCUS_HREF} />}
      <header>
        <h1 className="text-[28px] font-bold leading-tight text-fg">
          {greeting()}, {d.greetingName}
        </h1>
        <p className="mt-1 text-[14px] text-fg-secondary">
          {today} · {d.needYou === 0 ? "nothing needs you right now" : `${d.needYou} thing${d.needYou === 1 ? "" : "s"} need${d.needYou === 1 ? "s" : ""} you today`}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Mission m={d.mission} empty={queueEmpty} />
        <QueueCard id="question-drafts" title="Question drafts" value={d.drafts.inReview} status="in review" tone="blue"
          line={d.drafts.approved === null ? null : `${d.drafts.approved} approved, waiting to publish`} href="/admin/questions/drafts?tab=review&status=IN_REVIEW" linkLabel="Open queue">
          <Sparkline points={d.drafts.spark} label="Drafts created per day, last 14 days" />
        </QueueCard>
        {d.reports && (
          <QueueCard id="question-reports" title="Question reports" value={d.reports.open}
            status={d.reports.open === 0 ? "all clear" : d.reports.oldestDays !== null ? `oldest ${d.reports.oldestDays} day${d.reports.oldestDays === 1 ? "" : "s"}` : null}
            tone={d.reports.overdue ? "red" : "green"} line="students found a problem" href="/admin/support/question-reports?status=OPEN" linkLabel="Fix now">
            <OverdueBar open={d.reports.open} overdue={d.reports.overdue} />
          </QueueCard>
        )}
        <QueueCard id="current-affairs" title="Current affairs" value={d.ca.inReview} status={d.ca.drafts === null ? null : `${d.ca.drafts} draft${d.ca.drafts === 1 ? "" : "s"}`} tone="teal"
          line="waiting for your review" href="/admin/current-affairs?status=IN_REVIEW" linkLabel="Review" />
        {d.tickets ? (
          <QueueCard id="tickets" title="Tickets" value={d.tickets.open} status={d.tickets.late === null ? null : d.tickets.late > 0 ? `${d.tickets.late} past 24 h` : "all on time"} tone={d.tickets.late ? "red" : "green"}
            line="open · 24h reply promise" href="/admin/support?status=OPEN" linkLabel="Open inbox" />
        ) : (
          <QueueCard id="tickets" title="Tickets" value={null} valueText="Off" status="switched off" tone="muted" line="Support tickets are not switched on yet." href={null} linkLabel="" />
        )}
      </div>

      <section aria-label="Also" className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-card border border-line bg-surface px-[18px] py-3 text-[13px]" data-today-also="">
        <span className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">Also</span>
        <MiniStat label="Community flags waiting" value={d.flags} href="/admin/support/flags" />
        {d.libraryEnding !== null && <MiniStat label="Library Pro grants ending in 7 days" value={d.libraryEnding} href="/admin/students/library-pro" />}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ContentHealth h={d.health} />
        {d.recent && <Recent rows={d.recent} />}
      </div>
    </div>
  );
}

function Mission({ m, empty }: { m: TodayV2["mission"]; empty: boolean }) {
  const done = m.stats?.doneToday ?? 0;
  const pct = Math.min(1, done / Math.max(1, m.goal));
  const C = 2 * Math.PI * 34;
  const streak = m.stats?.streakDays ?? null;
  return (
    <section aria-labelledby="mission-title" className="mission-gradient relative flex flex-col overflow-hidden rounded-panel p-6 text-white md:col-span-2 xl:col-span-1 xl:row-span-2" data-today-mission="">
      {/* the faint logo-triangle shape (decorative) */}
      <svg aria-hidden="true" viewBox="0 0 100 100" className="pointer-events-none absolute -right-6 top-0 hidden h-full w-1/2 text-white opacity-[0.12] sm:block" preserveAspectRatio="none">
        <polygon points="0,0 100,35 100,100 20,75" fill="currentColor" />
      </svg>
      <div className="relative flex flex-1 flex-col sm:max-w-[70%]">
        <p className="text-[11.5px] font-semibold uppercase tracking-[.12em]">Today&apos;s mission</p>
        <h2 id="mission-title" className="mt-2 text-[26px] font-extrabold leading-tight">
          {empty ? "Your review queue is empty" : `Review ${m.goal} questions`}
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug">
          {empty ? "Import questions — they arrive as drafts and enter review after the automatic checks." : "Every question you approve becomes practice for thousands of students."}
        </p>
        <div className="mt-5 flex items-center gap-5">
          <div className="relative size-24 shrink-0" role="img" aria-label={m.stats ? `${done} of ${m.goal} reviewed today` : "Progress not available"}>
            <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden="true">
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="9" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[20px] font-extrabold tabular-nums">{m.stats ? `${done}/${m.goal}` : "–"}</span>
          </div>
          <dl className="flex flex-col gap-2.5">
            {m.stats?.minutesLeft != null && (
              <div>
                <dt className="sr-only">Time left</dt>
                <dd className="text-[24px] font-extrabold leading-none">~{m.stats.minutesLeft} min</dd>
                <dd className="mt-1 text-[12.5px]">left at your pace</dd>
              </div>
            )}
            <div>
              <dt className="sr-only">Review streak</dt>
              {streak === null ? (
                <dd className="text-[13px]">Streak {NA.toLowerCase()}</dd>
              ) : streak === 0 ? (
                <dd className="text-[15px] font-bold">Start your streak today</dd>
              ) : (
                <>
                  <dd className="text-[24px] font-extrabold leading-none">{streak}-day</dd>
                  <dd className="mt-1 text-[12.5px]">review streak</dd>
                </>
              )}
            </div>
          </dl>
        </div>
        <div className="mt-auto pt-5">
          {empty ? (
            <Link href={IMPORT_HREF} className="focus-ring-on-dark inline-flex min-h-11 items-center gap-2 rounded-control bg-white px-5 text-[15px] font-semibold text-primary-700 hover:bg-primary-50" data-today-primary="">
              Import questions
            </Link>
          ) : (
            <Link href={FOCUS_HREF} className="focus-ring-on-dark inline-flex min-h-11 items-center gap-2 rounded-control bg-white px-5 text-[15px] font-semibold text-primary-700 hover:bg-primary-50" data-today-primary="">
              Start focus session <kbd className="rounded border border-primary-200 px-1.5 text-[11.5px]">F</kbd>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

const TONE: Record<string, { dot: string; text: string }> = {
  blue: { dot: "bg-primary-700", text: "text-primary-700" },
  red: { dot: "bg-danger-600", text: "text-danger-700" },
  green: { dot: "bg-success-600", text: "text-success-700" },
  teal: { dot: "bg-accent-700", text: "text-accent-700" },
  muted: { dot: "bg-ink-400", text: "text-ink-500" },
};

function QueueCard({ id, title, status, tone, value, valueText, line, href, linkLabel, children }: { id: string; title: string; status: string | null; tone: string; value: number | null; valueText?: string; line: string | null; href: string | null; linkLabel: string; children?: React.ReactNode }) {
  return (
    <section aria-labelledby={`q-${id}`} className="flex min-h-[172px] flex-col rounded-card border border-line bg-surface p-[18px]" data-today-card={id}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={`q-${id}`} className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">
          {title}
        </h2>
        {status && (
          <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", TONE[tone].text)}>
            <span aria-hidden="true" className={cn("size-2 rounded-full", TONE[tone].dot)} />
            {status}
          </span>
        )}
      </div>
      <p className={cn("mt-2 font-extrabold leading-none tabular-nums", value === null && !valueText ? "text-[15px] font-semibold text-fg-secondary" : "text-[33px] text-fg")}>{value === null ? (valueText ?? NA) : value}</p>
      {line && <p className="mt-1.5 text-[13px] text-fg-secondary">{line}</p>}
      {children && <div className="mt-2">{children}</div>}
      {href && (
        <Link href={href} className="focus-ring mt-auto inline-flex min-h-9 items-center self-start pt-2 text-[13px] font-semibold text-link underline-offset-2 hover:underline">
          {linkLabel}
          <span className="sr-only"> ({title})</span>&nbsp;→
        </Link>
      )}
    </section>
  );
}

function MiniStat({ label, value, href }: { label: string; value: number | null; href: string }) {
  return (
    <Link href={href} className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-control text-fg hover:underline">
      <span className="font-extrabold tabular-nums">{value === null ? NA : value}</span>
      <span className="text-fg-secondary">{label}</span>
    </Link>
  );
}

function Sparkline({ points, label }: { points: number[] | null; label: string }) {
  if (!points) return <p className="text-[12.5px] text-fg-secondary">Trend not available</p>;
  const max = Math.max(1, ...points);
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 200},${30 - (p / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 200 32" className="h-8 w-full max-w-56 text-primary-700" role="img" aria-label={`${label}: ${points.join(", ")}`}>
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

/** Short column labels (the full subject name stays available as a tooltip and for screen readers). */
const SHORT: Record<string, string> = {
  "Quantitative Aptitude": "Quant",
  "General Intelligence and Reasoning": "Reasoning",
  "English Comprehension": "English",
  "General Awareness": "GK / GA",
};
const ORDER = ["Quantitative Aptitude", "General Intelligence and Reasoning", "English Comprehension", "General Awareness"];

function cellClass(n: number, max: number): string {
  if (n === 0) return "bg-ink-100 text-fg-secondary";
  const r = n / Math.max(1, max);
  return r > 0.75 ? "bg-primary-200 font-semibold text-primary-800" : r > 0.4 ? "bg-primary-100 font-semibold text-primary-800" : "bg-primary-50 font-semibold text-primary-700";
}

function ContentHealth({ h }: { h: TodayV2["health"] }) {
  const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
  const subjects = h ? [...h.subjects].sort((a, b) => rank(a.name) - rank(b.name)) : [];
  const max = h ? Math.max(0, ...Object.values(h.cells).map((c) => c.published)) : 0;
  const lowest = h?.exams.find((e) => e.id === h.lowestExamId) ?? null;
  return (
    <section aria-labelledby="content-health" className="rounded-card border border-line bg-surface p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="content-health" className="text-[12px] font-semibold text-ink-500">
          <span className="uppercase tracking-[.08em]">Content health</span> — published questions by exam &amp; subject (+ in review)
        </h2>
        {lowest && (
          <Link href={`/admin/exams/${lowest.id}`} className="focus-ring inline-flex min-h-9 items-center text-[13px] font-semibold text-link hover:underline" title={`Lowest coverage: ${lowest.title}`}>
            Where to build next<span className="sr-only">: {lowest.title}</span>&nbsp;→
          </Link>
        )}
      </div>
      {!h ? (
        <p className="mt-2 text-[13px] text-fg-secondary">{NA}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-separate border-spacing-1.5 text-[12.5px]">
            <caption className="sr-only">Published questions by exam and subject, with the number in review</caption>
            <thead>
              <tr>
                <th scope="col" className="w-28 text-left font-semibold text-ink-500">
                  <span className="sr-only">Exam</span>
                </th>
                {subjects.map((s) => (
                  <th key={s.id} scope="col" className="px-2 text-center font-semibold text-ink-500" title={s.name}>
                    <span aria-hidden="true">{SHORT[s.name] ?? s.name}</span>
                    <span className="sr-only">{s.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {h.exams.map((e) => (
                <tr key={e.id}>
                  <th scope="row" className="pr-2 text-left font-semibold text-fg">
                    {e.title}
                    {!e.live && <span className="ml-1.5 whitespace-nowrap rounded-badge bg-ink-100 px-1.5 py-0.5 text-[11.5px] font-semibold text-fg-secondary">not live</span>}
                    {e.sharedTopics > 0 && (
                      <span className="block text-[11.5px] font-normal text-fg-secondary" title="Questions on this exam's syllabus topics that are not linked to the exam (not counted)">
                        {e.sharedTopics} more share its topics
                      </span>
                    )}
                  </th>
                  {subjects.map((s) => {
                    const c = h.cells[`${e.id}:${s.id}`] ?? { published: 0, inReview: 0 };
                    return (
                      <td key={s.id} className={cn("rounded-control px-2 py-1.5 text-center tabular-nums", cellClass(c.published, max))}>
                        <span className="block">{c.published}</span>
                        {c.inReview > 0 && <span className="block text-[11.5px] font-medium text-fg-secondary">+{c.inReview} in review</span>}
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

const KIND: Record<ReturnType<typeof actionKind>, { icon: React.ReactNode; tile: string }> = {
  import: { icon: <ArrowUp aria-hidden="true" className="size-3.5" />, tile: "bg-accent-50 text-accent-700" },
  publish: { icon: <Circle aria-hidden="true" className="size-2.5 fill-current" />, tile: "bg-success-50 text-success-700" },
  approve: { icon: <Check aria-hidden="true" className="size-3.5" />, tile: "bg-primary-50 text-primary-700" },
  reject: { icon: <X aria-hidden="true" className="size-3.5" />, tile: "bg-danger-50 text-danger-700" },
  other: { icon: <Circle aria-hidden="true" className="size-2" />, tile: "bg-ink-100 text-ink-500" },
};

function Recent({ rows }: { rows: NonNullable<TodayV2["recent"]> }) {
  const full = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(iso));
  // short like the concept: "11:28" today, "Yesterday", else "26 Oct" (the full time stays in the tooltip)
  const short = (iso: string) => {
    const day = (t: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(t);
    const d = new Date(iso);
    const now = new Date();
    if (day(d) === day(now)) return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(d);
    if (day(d) === day(new Date(now.getTime() - 86400e3))) return "Yesterday";
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);
  };
  return (
    <section aria-labelledby="today-recent" className="rounded-card border border-line bg-surface p-[18px]">
      <h2 id="today-recent" className="text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-500">
        Recent activity
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-fg-secondary">No audited changes yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {rows.map((r, i) => {
            const k = KIND[actionKind(r.action)];
            return (
              <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-control", k.tile)}>{k.icon}</span>
                <span className="min-w-0 flex-1 text-fg">
                  {humanAction(r.action)}
                  {r.count > 1 && <span className="font-semibold"> ×{r.count}{r.more ? "+" : ""}</span>}
                </span>
                <time dateTime={r.at} title={full(r.at)} className="shrink-0 text-[12px] text-ink-500">
                  {r.count > 1 && <span className="sr-only">latest </span>}
                  {short(r.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
