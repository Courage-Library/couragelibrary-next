/**
 * Courage Studio phase 2 (decision #84, Q3): AUTO CHECKS for a question under review, computed on the SERVER from the
 * stored version (never from client values). Pure — the offline gate drives it with fixtures.
 * A failed BLOCKING check stops Approve (QF service transition → QF_AUTO_CHECK_FAILED) with its reason. The Hindi
 * check is shown as a WARNING (not blocking) until a ruling: every question today is English-only and the schema has
 * no translation link, so a blocking Hindi check would stop every approval.
 */
export type AutoCheckId = "answer_key" | "explanation" | "topic_mapped" | "hindi_linked" | "no_duplicate" | "difficulty_set";

export interface AutoCheck {
  id: AutoCheckId;
  label: string;
  ok: boolean;
  blocking: boolean;
  /** shown when the check fails */
  reason: string;
}

export interface AutoCheckInput {
  correctKey: string | null;
  optionKeys: string[];
  explanationMd: string | null;
  topicId: string | null;
  topicName: string | null;
  difficulty: string | null;
  language: string;
  /** another version of the same question exists in the other language (en ↔ hi) */
  hasOtherLanguage: boolean;
  /** other questions' live versions with the same content checksum */
  duplicateCount: number;
}

export const MIN_EXPLANATION_CHARS = 20;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function computeAutoChecks(i: AutoCheckInput): AutoCheck[] {
  const keyOk = !!i.correctKey && i.optionKeys.includes(i.correctKey);
  const expl = String(i.explanationMd ?? "").trim();
  const other = i.language === "hi" ? "English" : "Hindi";
  return [
    { id: "answer_key", label: "Answer key present", ok: keyOk, blocking: true, reason: i.correctKey ? `The answer key (${i.correctKey}) is not one of the options.` : "No answer key is stored." },
    { id: "explanation", label: "Explanation written", ok: expl.length >= MIN_EXPLANATION_CHARS, blocking: true, reason: expl ? `The explanation is too short (under ${MIN_EXPLANATION_CHARS} characters).` : "No explanation is stored." },
    { id: "topic_mapped", label: "Topic mapped", ok: !!i.topicId && !!i.topicName, blocking: true, reason: "The question is not mapped to a canonical topic." },
    { id: "hindi_linked", label: `${other} version linked`, ok: i.hasOtherLanguage, blocking: false, reason: `No ${other} version yet (shown as a warning; it does not block approval).` },
    { id: "no_duplicate", label: "No duplicate found", ok: i.duplicateCount === 0, blocking: true, reason: `${i.duplicateCount} other question${i.duplicateCount === 1 ? "" : "s"} with the same content already exist${i.duplicateCount === 1 ? "s" : ""}.` },
    { id: "difficulty_set", label: "Difficulty set", ok: (DIFFICULTIES as readonly string[]).includes(String(i.difficulty)), blocking: true, reason: "No valid difficulty (easy / medium / hard)." },
  ];
}

/** Blocking failures (empty = Approve may proceed). */
export function blockingFailures(checks: AutoCheck[]): AutoCheck[] {
  return checks.filter((c) => c.blocking && !c.ok);
}
