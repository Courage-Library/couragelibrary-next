/**
 * CA-4: the TRANSLATE_HI prompt (paste flow, no API key): from the PUBLISHED English lesson, the owner gets a prompt,
 * pastes the answer back → parseTranslationPaste → the block rules → the STRUCTURE-PARITY check (lib/lessons/parity.ts;
 * the DB enforces the same, fn_lesson_parity_errors) → a Hindi DRAFT → the side-by-side EN | HI review → publish.
 * Pure; safe in client components. A machine-translation provider is a later flag (lib/prompts/translation-provider.ts).
 */
import { validateLesson, type BlockError, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";
import { glossaryLines } from "@/lib/lessons/glossary-hi";
import { parityErrors } from "@/lib/lessons/parity";

export const TRANSLATION_PASTE_CONTRACT = "LESSON_BLOCKS v2 hi";

export const TRANSLATE_BLOCK_RULES = `- Keep EVERY block: the same "id", the same "type", the same order. Do not add, drop, merge or split blocks.
- Translate only the words: "text", "title", "name", "reading", "question", "answer", "shortcut", "mistake", "why",
  "caption", "label", "prompt", "feedback", list items, table headers and cells, summary bullets and speed rules,
  Memory Lock points, and meta.title / meta.summary.
- Never change: "latex" and step "math" and summary "formulas" (copy them character for character), inline math between
  $…$, every number (keep digits as 12, 3.5 — never Devanagari digits), quick-check option "id" and "correct", "level",
  "ordered", "variant", "kind", "difficulty", "mode", "node_id", and the number of list items, rows, cells, steps and points.
- Keep **bold**, *italic* and \`code\` marks around the translated words.`;

export function translatePromptValues(meta: LessonMeta, blocks: LessonBlock[]): Record<string, string> {
  return {
    LESSON_TITLE: meta.title,
    GLOSSARY: glossaryLines(),
    EN_JSON: JSON.stringify({ contract: TRANSLATION_PASTE_CONTRACT, meta, blocks }, null, 2),
    BLOCK_RULES: TRANSLATE_BLOCK_RULES,
  };
}

/** TRANSLATE_HI template v1 (seeded by migration 119; the gates prove the seed equals this constant). */
export const TRANSLATE_HI_TEMPLATE_V1 = `You are an expert Hindi-medium teacher for Indian government competitive exams. Translate the lesson
"{{LESSON_TITLE}}" below from English into natural, simple exam Hindi — the Hindi a Hindi-medium student reads in good
preparation material. Not word for word, not Sanskritised: clear and natural.

GLOSSARY (use these standard exam terms; keep an English term in brackets after the Hindi the first time when students also
know it in English):
{{GLOSSARY}}

STRUCTURE RULES (the platform checks every one; a mismatch is refused):
{{BLOCK_RULES}}

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences — with the SAME shape: "contract" exactly
"LESSON_BLOCKS v2 hi", then "meta" and "blocks".

THE ENGLISH LESSON:
{{EN_JSON}}`;

export type TranslationPaste = { ok: true; meta: LessonMeta; blocks: LessonBlock[] } | { ok: false; errors: BlockError[] };

/** Parses the pasted translation and checks the block rules AND parity against the English blocks. */
export function parseTranslationPaste(text: string, enBlocks: LessonBlock[]): TranslationPaste {
  const err = (path: string, code: string, message: string): TranslationPaste => ({ ok: false, errors: [{ path, code, message }] });
  let raw = (text || "").trim();
  const fence = /^```[a-z]*\n([\s\S]*)\n```$/i.exec(raw);
  if (fence) raw = fence[1].trim();
  if (!raw) return err("$", "EMPTY", "Paste the assistant's JSON answer.");
  if (raw.length > 400 * 1024) return err("$", "TOO_LARGE", "The answer is larger than 400 KB.");
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return err("$", "INVALID_JSON", "This is not valid JSON. Paste only the JSON object the assistant returned.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return err("$", "TYPE", "The answer must be one JSON object.");
  const o = data as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!["contract", "meta", "blocks"].includes(k)) return err(`$.${k}`, "UNKNOWN_KEY", `Unknown key "${k}".`);
  if (o.contract !== TRANSLATION_PASTE_CONTRACT) return err("$.contract", "CONTRACT", `"contract" must be "${TRANSLATION_PASTE_CONTRACT}".`);
  const v = validateLesson(o.meta, o.blocks);
  if (!v.ok) return { ok: false, errors: v.errors };
  const p = parityErrors(enBlocks, v.blocks);
  if (p.length) return { ok: false, errors: p.map((x) => ({ path: x.index < 0 ? "$.blocks" : `$.blocks[${x.index}]`, code: `PARITY_${x.code}`, message: x.message })) };
  return { ok: true, meta: v.meta, blocks: v.blocks };
}
