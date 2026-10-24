/**
 * F0 onboarding (decision #76) — pure rules shared by the wizard (client), the server action and the offline tests.
 * The database RPC (fn_save_onboarding, migration 091) enforces the same rules again; this module only gives the user
 * an early, friendly answer. No network, no React.
 */

export const LANGUAGES = ["hi", "en", "hinglish"] as const;
export const ATTEMPTS = ["first", "second", "third_plus"] as const;
export const DAILY_MINUTES = [15, 30, 60, 90] as const;
export const MAX_EXAMS = 3;
export const STEPS = ["language", "exams", "timing", "time"] as const;
export const TOTAL_STEPS = STEPS.length;
/** Exam dates more than ~5 years ahead are rejected (same bound as the RPC). */
export const MAX_DAYS_AHEAD = 1830;

export type Language = (typeof LANGUAGES)[number];
export type Attempt = (typeof ATTEMPTS)[number];
export type DailyMinutes = (typeof DAILY_MINUTES)[number];
export type StepKey = (typeof STEPS)[number];

/** Every answer is optional (each step can be skipped). `examDate === null` = "not sure yet". */
export type OnboardingAnswers = {
  language: Language | null;
  examIds: string[];
  examDate: string | null;
  attempt: Attempt | null;
  dailyMinutes: DailyMinutes | null;
};

export const EMPTY_ANSWERS: OnboardingAnswers = { language: null, examIds: [], examDate: null, attempt: null, dailyMinutes: null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date in India (YYYY-MM-DD) — the RPC uses Asia/Kolkata too. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type ValidationResult = { ok: true; value: OnboardingAnswers } | { ok: false; field: keyof OnboardingAnswers };

/**
 * Validates raw (untrusted) answers. `allowedExamIds` = the active exams the user could pick (server side); when
 * given, every chosen exam must be one of them.
 */
export function validateAnswers(raw: unknown, opts: { today?: string; allowedExamIds?: readonly string[] } = {}): ValidationResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const today = opts.today ?? todayInIndia();

  const language = r.language ?? null;
  if (language !== null && !LANGUAGES.includes(language as Language)) return { ok: false, field: "language" };

  const examIdsRaw = r.examIds ?? [];
  if (!Array.isArray(examIdsRaw) || examIdsRaw.some((x) => typeof x !== "string" || !UUID.test(x))) return { ok: false, field: "examIds" };
  const examIds = [...new Set(examIdsRaw.map((x: string) => x.toLowerCase()))];
  if (examIds.length > MAX_EXAMS) return { ok: false, field: "examIds" };
  if (opts.allowedExamIds) {
    const allowed = new Set(opts.allowedExamIds.map((x) => x.toLowerCase()));
    if (examIds.some((x) => !allowed.has(x))) return { ok: false, field: "examIds" };
  }

  const examDate = r.examDate ?? null;
  if (examDate !== null) {
    if (typeof examDate !== "string" || !ISO_DATE.test(examDate) || Number.isNaN(Date.parse(`${examDate}T00:00:00Z`))) return { ok: false, field: "examDate" };
    if (examDate < today || examDate > addDays(today, MAX_DAYS_AHEAD)) return { ok: false, field: "examDate" };
  }

  const attempt = r.attempt ?? null;
  if (attempt !== null && !ATTEMPTS.includes(attempt as Attempt)) return { ok: false, field: "attempt" };

  const dailyMinutes = r.dailyMinutes ?? null;
  if (dailyMinutes !== null && !DAILY_MINUTES.includes(dailyMinutes as DailyMinutes)) return { ok: false, field: "dailyMinutes" };

  return {
    ok: true,
    value: { language: language as Language | null, examIds, examDate: examDate as string | null, attempt: attempt as Attempt | null, dailyMinutes: dailyMinutes as DailyMinutes | null },
  };
}

// ---------------------------------------------------------------- wizard state (Back never loses answers)
export type WizardState = { step: number; answers: OnboardingAnswers };
export type WizardAction =
  | { type: "set"; patch: Partial<OnboardingAnswers> }
  | { type: "toggleExam"; examId: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "skipStep" };

export function initWizard(answers: OnboardingAnswers = EMPTY_ANSWERS): WizardState {
  return { step: 1, answers: { ...answers, examIds: [...answers.examIds] } };
}

/** Pure reducer. `next` / `back` move between steps 1…TOTAL_STEPS and never clear answers; `skipStep` clears only the
 *  current step's answer and moves on; selecting a 4th exam is ignored (max 3). */
export function wizardReducer(s: WizardState, a: WizardAction): WizardState {
  switch (a.type) {
    case "set":
      return { ...s, answers: { ...s.answers, ...a.patch } };
    case "toggleExam": {
      const has = s.answers.examIds.includes(a.examId);
      if (!has && s.answers.examIds.length >= MAX_EXAMS) return s;
      const examIds = has ? s.answers.examIds.filter((x) => x !== a.examId) : [...s.answers.examIds, a.examId];
      return { ...s, answers: { ...s.answers, examIds } };
    }
    case "next":
      return { ...s, step: Math.min(s.step + 1, TOTAL_STEPS + 1) };
    case "back":
      return { ...s, step: Math.max(s.step - 1, 1) };
    case "skipStep": {
      const key = STEPS[s.step - 1];
      const cleared: Partial<OnboardingAnswers> =
        key === "language" ? { language: null } : key === "exams" ? { examIds: [] } : key === "timing" ? { examDate: null, attempt: null } : { dailyMinutes: null };
      return { step: Math.min(s.step + 1, TOTAL_STEPS + 1), answers: { ...s.answers, ...cleared } };
    }
    default:
      return s;
  }
}

// ---------------------------------------------------------------- deterministic plan (no AI)
/** Practice-set size by daily minutes (the 10 daily questions come on top). No answer → the 30-minute default. */
export function practiceSetSize(minutes: DailyMinutes | null): number {
  switch (minutes) {
    case 15:
      return 5;
    case 60:
      return 20;
    case 90:
      return 30;
    default:
      return 10;
  }
}

export type PlanExam = { id: string; title: string; slug: string; firstSection: string | null; practiceHref: string | null };
export type Plan = {
  setSize: number;
  exam: PlanExam | null;
  /** the ONE primary action (R4) */
  primary: { href: string; kind: "practice" | "exam" | "exams" };
};

/** First chosen exam drives the plan. Exam-wise practice does not exist yet → the primary action is the exam page. */
export function buildPlan(answers: OnboardingAnswers, exams: readonly PlanExam[]): Plan {
  const exam = answers.examIds.map((id) => exams.find((e) => e.id.toLowerCase() === id.toLowerCase())).find(Boolean) ?? null;
  const setSize = practiceSetSize(answers.dailyMinutes);
  if (!exam) return { setSize, exam: null, primary: { href: "/exams", kind: "exams" } };
  if (exam.practiceHref) return { setSize, exam, primary: { href: exam.practiceHref, kind: "practice" } };
  return { setSize, exam, primary: { href: `/exams/${encodeURIComponent(exam.slug)}`, kind: "exam" } };
}

/** The first top-level section of a syllabus read model (state AVAILABLE), else null. */
export function firstSyllabusSection(readModel: unknown): string | null {
  const rm = readModel as { state?: string; nodes?: Array<{ parent_id: string | null; order: number; title: string }> } | null;
  if (!rm || rm.state !== "AVAILABLE" || !Array.isArray(rm.nodes)) return null;
  const top = rm.nodes.filter((n) => n && n.parent_id === null && typeof n.title === "string").sort((a, b) => a.order - b.order);
  return top[0]?.title ?? null;
}

// ---------------------------------------------------------------- post-login redirect (pure decision)
export type OnboardingStatus = { completed: boolean; skipped: boolean } | null;

/**
 * Where to send a user right after sign-in. Redirect to /onboarding ONCE (the caller records it in a cookie), only
 * when the flag is on, the status is known, and onboarding was neither completed nor skipped. Unknown status (RPC
 * missing / failed) → no redirect (fail open). `target` must already be sanitized.
 */
export function onboardingRedirectDecision(input: { enabled: boolean; alreadyPrompted: boolean; status: OnboardingStatus; target: string }): string {
  const { enabled, alreadyPrompted, status, target } = input;
  if (!enabled || alreadyPrompted || !status || status.completed || status.skipped) return target;
  if (target === "/onboarding" || target.startsWith("/onboarding?") || target.startsWith("/admin")) return target;
  return target === "/dashboard" ? "/onboarding" : `/onboarding?next=${encodeURIComponent(target)}`;
}
