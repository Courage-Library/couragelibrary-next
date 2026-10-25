/**
 * F2 topic practice (decision #79) — pure rules, no I/O (unit-tested offline: scripts/test_f2_practice.cjs).
 *   pickSet            n questions from a topic: never-seen first, then least recently seen; random inside each tier
 *   pickDiagnostic     a mixed set across the exam's sections (round-robin, same preference rule)
 *   toPracticeQuestion the ONLY shape a question reaches the client in: text + options, NO key, NO explanation
 *   chooseVersion      content language (#82): the preferred-language version when one exists, else English; the
 *                      other language is offered as a per-question toggle only when a version in it exists
 *   takeaways          2–3 task-focused lines for the end of a set (R3: about the task and the next step)
 *   validateReport     the "Report this question" input rules (mirrored by fn_report_question)
 */
import { PRACTICE_COPY } from "@/content/practice";

export const SET_SIZES = [5, 10, 20] as const;
export type SetSize = (typeof SET_SIZES)[number];
export const DEFAULT_SET_SIZE: SetSize = 10;
export const DIAGNOSTIC_SIZE = 10;
export const REPORT_NOTE_MAX = 500;
export const REPORT_REASONS = ["WRONG_ANSWER_KEY", "TYPO_OR_UNCLEAR", "TRANSLATION_ERROR", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ContentLanguage = "en" | "hi";
export type PracticeMode = "TOPIC" | "DIAGNOSTIC";

export function parseSetSize(v: unknown): SetSize {
  const n = Number(v);
  return (SET_SIZES as readonly number[]).includes(n) ? (n as SetSize) : DEFAULT_SET_SIZE;
}

/** A servable question: published question + its current published (hence key-valid, migration 087) version. */
export type Candidate = { questionId: string; lastAnsweredAt: string | null };

type Rng = () => number;
function shuffle<T>(xs: T[], rng: Rng): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Never-seen questions first (random order), then the least recently answered (oldest first, ties random). */
export function rankCandidates(candidates: Candidate[], rng: Rng = Math.random): Candidate[] {
  const unique = [...new Map(candidates.map((c) => [c.questionId, c])).values()];
  const unseen = shuffle(unique.filter((c) => !c.lastAnsweredAt), rng);
  const seen = shuffle(unique.filter((c) => c.lastAnsweredAt), rng).sort((a, b) => String(a.lastAnsweredAt).localeCompare(String(b.lastAnsweredAt)));
  return [...unseen, ...seen];
}

export function pickSet(candidates: Candidate[], n: number, rng: Rng = Math.random): string[] {
  return rankCandidates(candidates, rng).slice(0, Math.max(0, n)).map((c) => c.questionId);
}

/** Round-robin across sections (section order kept), each section ranked by the same preference rule. */
export function pickDiagnostic(bySection: Array<{ sectionId: string; candidates: Candidate[] }>, n: number = DIAGNOSTIC_SIZE, rng: Rng = Math.random): string[] {
  const queues = bySection.map((s) => rankCandidates(s.candidates, rng)).filter((q) => q.length > 0);
  const out: string[] = [];
  const seen = new Set<string>();
  while (out.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      while (q.length > 0 && seen.has(q[0].questionId)) q.shift();
      const next = q.shift();
      if (next && out.length < n) {
        out.push(next.questionId);
        seen.add(next.questionId);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- client payload (no key, no explanation)
export type VersionRow = {
  id: string;
  question_id: string;
  language: string;
  question_text: string;
  question_image_url: string | null;
  options_type: string | null;
  options: Array<{ option_key: string; option_text: string | null; option_image_url: string | null; order_index: number | null }>;
};
export type PracticeQuestion = {
  questionId: string;
  versionId: string;
  language: ContentLanguage;
  text: string;
  imageUrl: string | null;
  options: Array<{ key: string; text: string; imageUrl: string | null }>;
  topicId: string | null;
  /** other-language versions of the same question (EN/HI toggle); empty → no toggle */
  alternates: Array<{ language: ContentLanguage; versionId: string; text: string; options: Array<{ key: string; text: string; imageUrl: string | null }> }>;
};

const lang = (l: string): ContentLanguage => (l === "hi" ? "hi" : "en");
const opts = (v: VersionRow) =>
  [...v.options]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || a.option_key.localeCompare(b.option_key))
    .map((o) => ({ key: o.option_key, text: o.option_text ?? "", imageUrl: o.option_image_url ?? null }));

/** Builds the client payload field by field — nothing else from the row can leak (keys live in question_answers). */
export function toPracticeQuestion(primary: VersionRow, alternates: VersionRow[] = [], topicId: string | null = null): PracticeQuestion {
  return {
    questionId: primary.question_id,
    versionId: primary.id,
    language: lang(primary.language),
    text: primary.question_text,
    imageUrl: primary.question_image_url ?? null,
    options: opts(primary),
    topicId,
    alternates: alternates
      .filter((a) => a.question_id === primary.question_id && a.id !== primary.id && lang(a.language) !== lang(primary.language))
      .map((a) => ({ language: lang(a.language), versionId: a.id, text: a.question_text, options: opts(a) })),
  };
}

/** The version to show first: the user's content language when a version in it exists, else English, else any. */
export function chooseVersion<T extends { language: string }>(versions: T[], preferred: ContentLanguage): { primary: T | null; alternates: T[] } {
  const pick = versions.find((v) => lang(v.language) === preferred) ?? versions.find((v) => lang(v.language) === "en") ?? versions[0] ?? null;
  return { primary: pick, alternates: pick ? versions.filter((v) => v !== pick) : [] };
}

// ---------------------------------------------------------------- end of set (R3)
export type SetResult = { questionId: string; topicName: string | null; isCorrect: boolean; answered: boolean };

export function takeaways(results: SetResult[]): string[] {
  const C = PRACTICE_COPY.end;
  const wrong = results.filter((r) => r.answered && !r.isCorrect).length;
  const unanswered = results.filter((r) => !r.answered).length;
  const out: string[] = [wrong > 0 ? C.takeawayRevisit(wrong) : C.takeawayNoneWrong];
  if (unanswered > 0) out.push(C.takeawayUnanswered(unanswered));
  const byTopic = new Map<string, { n: number; wrong: number }>();
  for (const r of results) {
    if (!r.topicName) continue;
    const t = byTopic.get(r.topicName) ?? { n: 0, wrong: 0 };
    t.n++;
    if (!r.isCorrect) t.wrong++;
    byTopic.set(r.topicName, t);
  }
  const weakest = [...byTopic.entries()].filter(([, t]) => t.wrong > 0).sort((a, b) => b[1].wrong / b[1].n - a[1].wrong / a[1].n)[0];
  if (byTopic.size > 1 && weakest) out.push(C.takeawayTopic(weakest[0]));
  else out.push(C.takeawayNext);
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- report input
export type ReportCheck = { ok: true; reason: ReportReason; note: string } | { ok: false; code: "INVALID_INPUT" | "NOTE_TOO_LONG" };

export function validateReport(reason: unknown, note: unknown): ReportCheck {
  if (!(REPORT_REASONS as readonly string[]).includes(String(reason))) return { ok: false, code: "INVALID_INPUT" };
  const n = typeof note === "string" ? note.trim() : "";
  if ([...n].length > REPORT_NOTE_MAX) return { ok: false, code: "NOTE_TOO_LONG" };
  return { ok: true, reason: reason as ReportReason, note: n };
}
