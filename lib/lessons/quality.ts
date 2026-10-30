/**
 * LESSON-PROMPT-QUALITY-1 (architect 2026-10-30): quality WARNINGS for a node lesson (never errors — they never block a
 * draft or a publish; the owner decides). Pure; safe in client components.
 *   - answer_in_options: a solved example whose question lists options "(a) … (b) …" must give an "answer" that is one
 *     of them (its letter, or its text)
 *   - mistake_names_option: its "mistake" must name one of those options (letter or text)
 *   - word_bank: a VOCABULARY topic (synonyms, antonyms, one-word substitution, idioms / phrases, spelling) needs at
 *     least 100 table rows in total (the prompt asks for 120–150)
 *   - exam_neutral: master lessons are shared by all exams — no exam name, tier name or 4-digit year in the title,
 *     the summary or a heading
 */
import type { LessonBlock, LessonMeta } from "@/lib/lessons/blocks";

export interface LessonQualityContext {
  meta?: Pick<LessonMeta, "title" | "summary"> | null;
  nodeName?: string | null;
  nodePath?: string | null;
  /** exam titles to flag besides the built-in list (e.g. the exams that map this node) */
  examNames?: string[];
}
export interface QualityWarning {
  key: "answer_in_options" | "mistake_names_option" | "word_bank" | "exam_neutral";
  label: string;
  ok: boolean;
  detail: string;
}

export const WORD_BANK_MIN_ROWS = 100;
const VOCAB_RE = /\b(synonyms?|antonyms?|one[- ]word substitut\w*|idioms?|phrases?|spelling)\b/i;
// exam families / exams / tiers commonly named in lesson titles; the node's own exam titles are added by the caller
const EXAM_TERMS = [
  "SSC", "CGL", "CHSL", "MTS", "CPO", "GD", "IBPS", "SBI", "RRB", "NTPC", "RBI", "UPSC", "CDS", "NDA", "AFCAT", "CTET", "TET",
  "Tier 1", "Tier 2", "Tier I", "Tier II", "Tier-I", "Tier-II", "Tier-1", "Tier-2", "Prelims", "Mains",
];
const YEAR_RE = /\b(19|20)\d{2}\b/;

/** The options listed in a question: "(a) foo (b) bar …" → [{ key: "a", text: "foo" }, …] (needs at least 2). */
export function questionOptions(question: string): { key: string; text: string }[] {
  const re = /\(([a-dA-D])\)\s*/g;
  const marks = [...question.matchAll(re)];
  if (marks.length < 2) return [];
  return marks.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? (marks[i + 1].index ?? question.length) : question.length;
    return { key: m[1].toLowerCase(), text: question.slice(start, end).replace(/[\s,;.]+$/g, "").trim() };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[*_`$]/g, "").replace(/\s+/g, " ").trim();
function namesOption(s: string, opts: { key: string; text: string }[]): boolean {
  const t = norm(s);
  return opts.some((o) => new RegExp(`\\(${o.key}\\)|\\boption ${o.key}\\b`, "i").test(s) || (o.text.length > 0 && t.includes(norm(o.text))));
}

/** Exam / tier / year mentions in a piece of text (whole words). */
export function examMentions(text: string, extra: string[] = []): string[] {
  const out: string[] = [];
  for (const term of [...EXAM_TERMS, ...extra.filter((x) => x && x.trim().length >= 2)]) {
    const re = new RegExp(`(^|[^A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[ -]/g, "[ -]?")}($|[^A-Za-z0-9])`, "i");
    if (re.test(text)) out.push(term);
  }
  const y = text.match(YEAR_RE);
  if (y) out.push(y[0]);
  return [...new Set(out)];
}

export const isVocabularyTopic = (ctx: LessonQualityContext) => VOCAB_RE.test(`${ctx.nodeName ?? ""} ${ctx.nodePath ?? ""}`);

export function lessonQualityWarnings(blocks: LessonBlock[], ctx: LessonQualityContext = {}): QualityWarning[] {
  const examples = blocks.filter((b): b is Extract<LessonBlock, { type: "solved_example" }> => b.type === "solved_example");
  const withOpts = examples.map((e) => ({ e, opts: questionOptions(e.question) })).filter((x) => x.opts.length >= 2);
  const badAnswer = withOpts.filter(({ e, opts }) => !namesOption(e.answer ?? "", opts)).map(({ e }) => e.id);
  const badMistake = withOpts.filter(({ e }) => e.mistake && e.mistake.trim()).filter(({ e, opts }) => !namesOption(e.mistake as string, opts)).map(({ e }) => e.id);
  const out: QualityWarning[] = [
    {
      key: "answer_in_options",
      label: "Every solved example's answer is one of the options in its question",
      ok: badAnswer.length === 0,
      detail: withOpts.length ? (badAnswer.length ? `check: ${badAnswer.slice(0, 6).join(", ")}` : `${withOpts.length} example(s) with options`) : "no example lists its options",
    },
    {
      key: "mistake_names_option",
      label: "Every \"mistake\" names a wrong option from the question",
      ok: badMistake.length === 0,
      detail: badMistake.length ? `check: ${badMistake.slice(0, 6).join(", ")}` : "",
    },
  ];
  if (isVocabularyTopic(ctx)) {
    const rows = blocks.reduce((n, b) => n + (b.type === "table" ? b.rows.length : 0), 0);
    out.push({ key: "word_bank", label: `A word bank of at least ${WORD_BANK_MIN_ROWS} table rows (vocabulary topic)`, ok: rows >= WORD_BANK_MIN_ROWS, detail: `${rows} table row(s)` });
  }
  const places: string[] = [];
  const extra = ctx.examNames ?? [];
  if (ctx.meta?.title) for (const m of examMentions(ctx.meta.title, extra)) places.push(`title: ${m}`);
  if (ctx.meta?.summary) for (const m of examMentions(ctx.meta.summary, extra)) places.push(`summary: ${m}`);
  for (const b of blocks) if (b.type === "heading") for (const m of examMentions(b.text, extra)) places.push(`heading "${b.id}": ${m}`);
  out.push({
    key: "exam_neutral",
    label: "Exam-neutral: no exam, tier or year in the title, summary or headings (exam-specific content goes to exam notes)",
    ok: places.length === 0,
    detail: places.slice(0, 6).join("; "),
  });
  return out;
}
