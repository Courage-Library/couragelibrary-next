/**
 * CA-7 exam notes (design E) — the paste contract of a per-exam note: the lesson blocks format (the same validator as
 * lessons and the database's fn_lesson_blocks_errors), short — "how it is asked in <exam>", weightage words, that
 * exam's PYQ pattern, a short exam-specific intro. Pure; safe in client components.
 *   { "contract": "EXAM_NOTE v1", "meta": { "title": …, "summary"?: … }, "blocks": [ … ] }
 */
import { validateLesson, type LessonBlock, type LessonMeta } from "@/lib/lessons/blocks";
import { describeBlockPath, extractJson } from "@/lib/prompts/paste-extract";

export const EXAM_NOTE_CONTRACT = "EXAM_NOTE v1";
export const EXAM_NOTE_MAX_BLOCKS = 40;

export type ExamNotePaste =
  | { ok: true; meta: LessonMeta; blocks: LessonBlock[]; notice: string | null }
  | { ok: false; errors: { path: string; code: string; message: string }[] };

export function parseExamNotePaste(text: string): ExamNotePaste {
  const err = (path: string, code: string, message: string): ExamNotePaste => ({ ok: false, errors: [{ path, code, message }] });
  const x = extractJson(text);
  if (!x.ok) return err(x.line ? `line ${x.line}:${x.column}` : "$", x.code, `${x.message}${x.snippet ? ` Near: ${x.snippet}` : ""}`);
  const o = x.data as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || Array.isArray(o)) return err("$", "TYPE", "The note must be one JSON object.");
  for (const k of Object.keys(o)) if (!["contract", "meta", "blocks"].includes(k)) return err(`$.${k}`, "UNKNOWN_KEY", `Unknown key "${k}".`);
  if (o.contract !== EXAM_NOTE_CONTRACT) return err("$.contract", "CONTRACT", `"contract" must be "${EXAM_NOTE_CONTRACT}".`);
  if (Array.isArray(o.blocks) && o.blocks.length > EXAM_NOTE_MAX_BLOCKS) return err("$.blocks", "SIZE", `A note has at most ${EXAM_NOTE_MAX_BLOCKS} blocks; keep it short and link the master lesson.`);
  const v = validateLesson(o.meta, o.blocks);
  if (!v.ok) return { ok: false, errors: v.errors.map((e) => ({ ...e, path: describeBlockPath(e.path, o.blocks) })) };
  return { ok: true, meta: v.meta, blocks: v.blocks, notice: x.notice };
}

/** A short valid example (shown on the screen next to the paste box). */
export function examNoteExample(examTitle: string, nodeName: string) {
  return {
    contract: EXAM_NOTE_CONTRACT,
    meta: { title: `${nodeName} in ${examTitle}`, summary: `How ${nodeName} is asked in ${examTitle}.` },
    blocks: [
      { id: "how-h", type: "heading", level: 2, text: `How ${examTitle} asks ${nodeName}` },
      { id: "how-p", type: "paragraph", text: "One or two short questions per paper, usually direct applications of the basic rule." },
      { id: "pattern", type: "list", ordered: false, items: ["Asked in most recent papers", "Mostly easy to medium", "Watch the units in the options"] },
      { id: "tip", type: "callout", variant: "TIP", title: "Exam tip", text: "Solve these first: they are quick marks." },
    ],
  };
}
