/**
 * F1 (#75): pure rules of the exam home page /exams/[slug] — no I/O, unit-tested offline (scripts/test_f1_exam_page.cjs).
 *   resolveExamCta   the ONE primary action by state (R4): signed out (sign-up closed / open), following, not following
 *   continueTarget   "Continue: …" — resume an in-progress mock, else the next free mock not taken, else due mistake
 *                    drills, else the syllabus
 *   glanceRows       the "At a glance" facts, only from the database; anything missing is NOT_PUBLISHED (#15 / #46)
 *   cycleInfo        cycle status + the next FUTURE date that is recorded; never a guessed date
 *   mockStatuses     per-mock status for the signed-in user (Not started / In progress / Done + best score)
 *   guideGroups      published guides in fixed groups; unpublished guides are not listed
 */
import { EXAM_PAGE, NOT_PUBLISHED } from "@/content/exam-page";
import { formatDateShort, formatNumber } from "@/lib/format";
import type { CandidateExamPattern, CandidatePublishedModule, ExamKnowledgeCandidateView, ExamModuleKey } from "@/types/exam-knowledge";

const C = EXAM_PAGE;

// ---------------------------------------------------------------- CTA state machine
export type ContinueTarget = { label: string; href: string };
export type ExamCtaState =
  | { signedIn: false; signupOpen: boolean }
  | { signedIn: true; following: false }
  | { signedIn: true; following: true; next: ContinueTarget };
export type ExamCta =
  | { kind: "sign-in" | "start" | "continue"; label: string; href: string; secondary: { label: string; href: string } | null }
  | { kind: "add"; label: string; secondary: null };

export const PATTERN_ANCHOR = "#at-a-glance";

export function resolveExamCta(state: ExamCtaState, examSlug: string): ExamCta {
  const seePattern = { label: C.cta.seePattern, href: PATTERN_ANCHOR };
  if (!state.signedIn) {
    return state.signupOpen
      ? { kind: "start", label: C.cta.startFree, href: "/auth/signup", secondary: seePattern }
      : { kind: "sign-in", label: C.cta.signIn, href: `/auth/login?next=${encodeURIComponent(`/exams/${examSlug}`)}`, secondary: seePattern };
  }
  if (!state.following) return { kind: "add", label: C.cta.add, secondary: null };
  return { kind: "continue", label: C.cta.continue(state.next.label), href: state.next.href, secondary: null };
}

export type MockListItem = {
  id: string;
  title: string;
  testType: string | null;
  questions: number | null;
  minutes: number | null;
  totalMarks: number | null;
  isFree: boolean;
};
export type MockAttemptRow = {
  id: string;
  mockTestId: string;
  status: string;
  submittedAt: string | null;
  startedAt: string | null;
  score: number | null;
  maxScore: number | null;
};
export type MockStatus =
  | { state: "not-started"; href: string }
  | { state: "in-progress"; href: string }
  | { state: "done"; href: string; score: number | null; maxScore: number | null };

const DONE = new Set(["submitted", "auto_submitted"]);

/** Per mock: an open attempt → In progress (resumes from the test page); a submitted one → Done with the best score. */
export function mockStatuses(mocks: MockListItem[], attempts: MockAttemptRow[]): Map<string, MockStatus> {
  const out = new Map<string, MockStatus>();
  for (const m of mocks) {
    const mine = attempts.filter((a) => a.mockTestId === m.id);
    const open = mine.find((a) => a.status === "in_progress" && a.submittedAt === null);
    const done = mine.filter((a) => DONE.has(a.status));
    if (open) out.set(m.id, { state: "in-progress", href: `/mock-tests/${m.id}` });
    else if (done.length > 0) {
      const scored = done.filter((a) => a.score !== null);
      const best = scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;
      const latest = [...done].sort((a, b) => String(b.submittedAt ?? b.startedAt ?? "").localeCompare(String(a.submittedAt ?? a.startedAt ?? "")))[0];
      out.set(m.id, { state: "done", href: `/mock-tests/${(best ?? latest).id}/result`, score: best?.score ?? null, maxScore: best?.maxScore ?? m.totalMarks });
    } else out.set(m.id, { state: "not-started", href: `/mock-tests/${m.id}` });
  }
  return out;
}

/** The "Continue: …" target for a student who follows this exam. */
export function continueTarget(mocks: MockListItem[], statuses: Map<string, MockStatus>, drillsDue: boolean): ContinueTarget {
  const inProgress = mocks.find((m) => statuses.get(m.id)?.state === "in-progress");
  if (inProgress) return { label: inProgress.title, href: `/mock-tests/${inProgress.id}` };
  const nextFree = mocks.find((m) => m.isFree && statuses.get(m.id)?.state === "not-started");
  if (nextFree) return { label: nextFree.title, href: `/mock-tests/${nextFree.id}` };
  if (drillsDue) return { label: C.cta.drills, href: "/practice" };
  return { label: C.cta.syllabus, href: "#syllabus" };
}

// ---------------------------------------------------------------- At a glance
export type GlanceTable = { stages: string[]; rows: Array<{ fact: string; values: string[] }>; published: boolean };

const n = (v: number | null) => (v === null ? NOT_PUBLISHED : formatNumber(v));

/** One column per published stage; a missing value is NOT_PUBLISHED. No stage published → one column, all NOT_PUBLISHED. */
export function glanceRows(patterns: CandidateExamPattern[]): GlanceTable {
  const g = C.glance;
  if (patterns.length === 0) {
    return { stages: [NOT_PUBLISHED], published: false, rows: [g.sections, g.questions, g.marks, g.time, g.negative].map((fact) => ({ fact, values: [NOT_PUBLISHED] })) };
  }
  const col = (f: (p: CandidateExamPattern) => string) => patterns.map(f);
  return {
    stages: col((p) => p.tierName || p.name || NOT_PUBLISHED),
    published: true,
    rows: [
      { fact: g.sections, values: col((p) => (p.sections.length > 0 ? p.sections.map((s) => s.name).join(", ") : NOT_PUBLISHED)) },
      { fact: g.questions, values: col((p) => n(p.totalQuestions)) },
      { fact: g.marks, values: col((p) => n(p.totalMarks)) },
      { fact: g.time, values: col((p) => (p.durationMinutes === null ? NOT_PUBLISHED : g.minutes(formatNumber(p.durationMinutes)))) },
      {
        fact: g.negative,
        values: col((p) => (p.negativeMarkValue === null ? NOT_PUBLISHED : p.negativeMarkValue === 0 ? g.noNegative : g.negativePerWrong(`−${formatNumber(p.negativeMarkValue)}`))),
      },
    ],
  };
}

// ---------------------------------------------------------------- Exam cycle
export type CycleInfo = { status: string; next: string | null };

/** Status of the active cycle and its next future recorded date (India day). Null when there is no cycle. */
export function cycleInfo(cycle: ExamKnowledgeCandidateView["activeCycle"], now: Date = new Date()): CycleInfo | null {
  if (!cycle) return null;
  const s = String(cycle.status || "").toLowerCase();
  const status = C.cycle.status(cycle.cycleYear, C.cycle.statusLabel[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : NOT_PUBLISHED));
  const L = C.cycle.dateLabel;
  const today = istDay(now);
  const upcoming = (
    [
      [L.notification, cycle.notificationDate],
      [L.applicationStart, cycle.applicationStartDate],
      [L.applicationEnd, cycle.applicationEndDate],
      [L.examStart, cycle.examStartDate],
    ] as Array<[string, string | null]>
  )
    .filter((d): d is [string, string] => typeof d[1] === "string" && !Number.isNaN(Date.parse(d[1])) && istDay(new Date(d[1])) >= today)
    .sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]))[0];
  return { status, next: upcoming ? C.cycle.next(upcoming[0], formatDateShort(upcoming[1])) : null };
}

/** YYYY-MM-DD in India time (dates are stored as IST midnight). */
function istDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- Guides
const GROUPS: Array<{ key: keyof typeof C.guides.groups; modules: ExamModuleKey[] }> = [
  { key: "about", modules: ["EXAM_OVERVIEW", "IMPORTANT_DATES", "NOTIFICATIONS", "APPLICATION_PROCESS", "ADMIT_CARD", "RESULT"] },
  { key: "eligibility", modules: ["ELIGIBILITY", "AGE_LIMIT", "QUALIFICATION", "PHYSICAL_STANDARDS"] },
  { key: "pattern", modules: ["EXAM_PATTERN", "SYLLABUS", "SYLLABUS_OVERVIEW"] },
  { key: "selection", modules: ["SELECTION_PROCESS", "VACANCIES", "CUTOFF", "CUTOFF_TRENDS"] },
  { key: "salary", modules: ["POSTS", "SALARY", "POST_PREFERENCE_SALARY", "CAREER"] },
  { key: "preparation", modules: ["PREPARATION", "PREPARATION_STRATEGY", "FAQ"] },
];
export const GROUPED_MODULE_KEYS: ExamModuleKey[] = GROUPS.flatMap((g) => g.modules);

export type GuideGroup = { title: string; guides: Array<{ key: ExamModuleKey; title: string; href: string; asOf: string | null }> };

/** Published guides (with compiled content) in fixed groups; empty groups are dropped. */
export function guideGroups(modules: Partial<Record<ExamModuleKey, CandidatePublishedModule | null>>, examSlug: string, displayName: (k: ExamModuleKey) => string): GuideGroup[] {
  return GROUPS.map((g) => ({
    title: C.guides.groups[g.key],
    guides: g.modules
      .filter((k) => Boolean(modules[k]?.compiledMdx))
      .map((k) => {
        const asOf = modules[k]?.lastVerifiedDate ?? null;
        return {
          key: k,
          title: displayName(k),
          href: `/exams/${examSlug}/${k.toLowerCase().replace(/_/g, "-")}`,
          asOf: asOf ? C.guides.asOf(/^\d{4}-\d{2}-\d{2}/.test(asOf) ? formatDateShort(asOf) : asOf) : null,
        };
      }),
  })).filter((g) => g.guides.length > 0);
}

// ---------------------------------------------------------------- Content language (#82)
export type ContentLanguage = "en" | "hi";

/** Guides / questions follow the user's content language where a Hindi version exists; anything else reads English. */
export function contentLanguage(pref: unknown): ContentLanguage {
  return pref === "hi" ? "hi" : "en";
}

/** Per guide: the preferred-language version when one is published, else the English one. */
export function preferModules<T>(preferred: Partial<Record<ExamModuleKey, T | null>>, english: Partial<Record<ExamModuleKey, T | null>>): Partial<Record<ExamModuleKey, T | null>> {
  const out: Partial<Record<ExamModuleKey, T | null>> = { ...english };
  for (const [k, v] of Object.entries(preferred) as Array<[ExamModuleKey, T | null]>) if (v) out[k] = v;
  return out;
}
