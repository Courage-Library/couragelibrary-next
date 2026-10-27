/**
 * COURAGE LIBRARY — DRILL PRE-SUBMIT PAYLOAD (TYPES-1 B2, architect ruling)
 *
 * The questions a student receives BEFORE submitting a mistake drill must never carry answer data
 * (correct option keys, answer keys, explanations, `is_correct`, solution text). Answers are read only
 * server-side for grading (MistakeService.submitMistakeDrill) and returned after submission.
 *
 * Every pre-submit path (generate / resume) passes its questions through toPublicDrillQuestions(),
 * which rebuilds each question from an explicit whitelist — so even a stored payload that somehow
 * contained extra fields cannot leak them. Pure module (unit-tested by scripts/test_types1_b2.cjs).
 */

export type PublicDrillQuestionOption = {
  id: string;
  option_key: string;
  content_text: string;
  option_text?: string;
  option_order: number;
};

export type PublicDrillQuestion = {
  vault_id: string;
  question_id: string;
  question_version_id?: string | null;
  question_text: string;
  primary_cognitive_type_id: string;
  consecutive_correct: number;
  options: PublicDrillQuestionOption[];
  /** MISTAKE-VERSION-1: the stored version was superseded after the drill was created ("This question was corrected") */
  corrected?: boolean;
  context?: {
    cognitive_type_name?: string;
    total_mistakes_count?: number;
    consecutive_correct?: number;
    last_mistake_at?: string;
    user_custom_notes?: string | null;
  };
};

const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function toPublicOption(raw: unknown): PublicDrillQuestionOption {
  const o = rec(raw);
  const option: PublicDrillQuestionOption = {
    id: str(o.id),
    option_key: str(o.option_key),
    content_text: str(o.content_text ?? o.option_text),
    option_order: num(o.option_order),
  };
  if (o.option_text !== undefined) option.option_text = str(o.option_text);
  return option;
}

/** Rebuilds one drill question from the whitelist above; every other field is dropped. */
export function toPublicDrillQuestion(raw: unknown): PublicDrillQuestion {
  const q = rec(raw);
  const out: PublicDrillQuestion = {
    vault_id: str(q.vault_id),
    question_id: str(q.question_id),
    question_version_id: q.question_version_id === undefined || q.question_version_id === null ? null : str(q.question_version_id),
    question_text: str(q.question_text),
    primary_cognitive_type_id: str(q.primary_cognitive_type_id),
    consecutive_correct: num(q.consecutive_correct),
    options: Array.isArray(q.options) ? q.options.map(toPublicOption) : [],
  };
  if (q.corrected === true) out.corrected = true;
  if (q.context !== undefined && q.context !== null) {
    const c = rec(q.context);
    out.context = {
      ...(c.cognitive_type_name !== undefined ? { cognitive_type_name: str(c.cognitive_type_name) } : {}),
      ...(c.total_mistakes_count !== undefined ? { total_mistakes_count: num(c.total_mistakes_count) } : {}),
      ...(c.consecutive_correct !== undefined ? { consecutive_correct: num(c.consecutive_correct) } : {}),
      ...(c.last_mistake_at !== undefined ? { last_mistake_at: str(c.last_mistake_at) } : {}),
      ...(c.user_custom_notes !== undefined ? { user_custom_notes: c.user_custom_notes === null ? null : str(c.user_custom_notes) } : {}),
    };
  }
  return out;
}

/** Pre-submit projection for a list of drill questions (stored JSON or freshly compiled). */
export function toPublicDrillQuestions(raw: unknown): PublicDrillQuestion[] {
  return Array.isArray(raw) ? raw.map(toPublicDrillQuestion) : [];
}
