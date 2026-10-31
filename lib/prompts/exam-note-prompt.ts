/**
 * EXAM-NOTE-PROMPT-1 (migration 127): the EXAM_NOTE prompt — the owner copies it from /admin/exams/notes, pastes it into
 * an AI chat, and pastes the answer back (contract "EXAM_NOTE v1" = lesson blocks, lib/lessons/exam-note.ts).
 * An exam note is SHORT and exam-specific: how THIS exam asks the topic, its weightage and question pattern, and a few
 * exam-style tips. The teaching itself lives in the exam-neutral master lesson (LESSON v4); the note never repeats it.
 * Facts come only from the context lines below (this exam's published syllabus) — never invented years / counts.
 * Pure; the server renders it (services/lessons/lesson-authoring.service.ts examNotePrompt).
 */
import { EXAM_NOTE_CONTRACT, EXAM_NOTE_MAX_BLOCKS, examNoteExample } from "@/lib/lessons/exam-note";
import { LESSON_BLOCK_SPEC, examLines, type LessonExamCoverage } from "@/lib/prompts/lesson-prompt";

export interface ExamNotePromptContext {
  examName: string;
  examSlug: string;
  nodeName: string;
  nodePath: string;
  nodeLevel: string;
  subjectName: string | null;
  /** THIS exam's published syllabus lines that map the node (or its parent / children) */
  coverage: LessonExamCoverage[];
  /** the published master lesson of the node, if any */
  masterLesson: { title: string; href: string } | null;
}

export function examNotePromptValues(ctx: ExamNotePromptContext): Record<string, string> {
  return {
    EXAM_NAME: ctx.examName,
    EXAM_SLUG: ctx.examSlug,
    NODE_NAME: ctx.nodeName,
    NODE_PATH: ctx.nodePath,
    NODE_LEVEL: ctx.nodeLevel,
    SUBJECT_NAME: ctx.subjectName || "not set",
    EXAM_LINES: ctx.coverage.length ? examLines(ctx.coverage) : `- not in a published ${ctx.examName} syllabus yet (write the note from the topic name only; say "as per the syllabus")`,
    MASTER_LESSON: ctx.masterLesson ? `"${ctx.masterLesson.title}" (${ctx.masterLesson.href})` : "not published yet",
    BLOCK_SPEC: LESSON_BLOCK_SPEC,
    EXAMPLE_JSON: JSON.stringify(examNoteExample(ctx.examName, ctx.nodeName), null, 2),
    MAX_BLOCKS: String(EXAM_NOTE_MAX_BLOCKS),
  };
}

/** EXAM_NOTE template v1 (the code fallback until a DB version is active; scripts/content/exam-note-prompt-1.cjs seeds it). */
export const EXAM_NOTE_TEMPLATE_V1 = `You are a senior teacher for Indian government competitive exams. Write a SHORT EXAM NOTE for one topic and one exam.

EXAM: {{EXAM_NAME}} ({{EXAM_SLUG}})
TOPIC: "{{NODE_NAME}}" ({{NODE_LEVEL}}), subject {{SUBJECT_NAME}}
Place in the syllabus tree: {{NODE_PATH}}
Master lesson (the full teaching, already written; do NOT repeat it): {{MASTER_LESSON}}

WHAT {{EXAM_NAME}} SAYS ABOUT THIS TOPIC (its published syllabus — the ONLY facts you may state about this exam):
{{EXAM_LINES}}

WHAT THE NOTE IS
- How {{EXAM_NAME}} asks this topic: the question formats and the usual difficulty, in plain words.
- Its weightage, in WORDS taken from the lines above ("high-yield", "core", "moderate"); a number only when the lines give it.
- The traps students fall into in THIS exam, and 2 to 4 exam tips (time, elimination, units, what to attempt first).
- One or two worked examples in this exam's style: the question, its options, the answer (one of the options) and a
  two-line solution. Label them "(practice question)": never claim a question appeared in a past paper.

RULES
- Do not invent years, past-paper claims, cut-offs, question counts or dates. If the lines above do not say it, leave it out.
- Do not re-teach the topic: point to the master lesson by name in one line instead.
- Plain English, short sentences, Indian exam terms as the exam uses them.
- At most {{MAX_BLOCKS}} blocks; most notes need 8 to 15.

OUTPUT: exactly ONE JSON object and nothing else:
{ "contract": "${EXAM_NOTE_CONTRACT}", "meta": { "title": "...", "summary": "..." }, "blocks": [ ... ] }
Title: "<Topic> in <Exam>" (e.g. "{{NODE_NAME}} in {{EXAM_NAME}}"). Summary: one sentence.

BLOCKS
{{BLOCK_SPEC}}

A SHORT VALID EXAMPLE (structure only; write your own content):
{{EXAMPLE_JSON}}
`;
