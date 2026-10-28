/** CA-3: lesson admin view types shared by the server service and the client editor (pure, no data access). */
import type { LessonBlock, LessonMeta } from "@/lib/lessons/blocks";

export interface LessonDocumentRow {
  id: string;
  slug: string;
  title: string;
  documentType: string;
  status: string;
  accessLevel: string;
  currentFormat: string | null;
  currentVersion: number | null;
  hasDraft: boolean;
  /** CA-4: NODE_LESSON documents belong to a master-tree node */
  nodeId: string | null;
  /** CA-4: the translation state: NONE / DRAFT / PUBLISHED / OUTDATED (published, from an older English version) */
  hiState: "NONE" | "DRAFT" | "PUBLISHED" | "OUTDATED";
}

export interface LessonEditorData {
  document: LessonDocumentRow;
  language: "en" | "hi";
  /** the open draft, else the current published lesson, else null (legacy / new) */
  source: "DRAFT" | "PUBLISHED" | "NONE";
  versionId: string | null;
  versionNumber: number | null;
  meta: LessonMeta | null;
  blocks: LessonBlock[] | null;
}


/** CA-4: a master-tree node a lesson can belong to (active TOPIC / SUBTOPIC / CONCEPT). */
export interface LessonNodeOption {
  id: string;
  name: string;
  nodeType: string;
  path: string;
  documentId: string | null;
  documentStatus: string | null;
}

/** CA-4: the lesson generator for one node. */
export interface LessonGeneratorData {
  context: import("@/lib/prompts/lesson-prompt").LessonPromptContext;
  prompt: string;
  templateVersion: number | null;
  templateSource: "db" | "code";
  documentId: string | null;
  /** LESSON-PROMPT-2: the SIZE rule of the highest weightage among the exams */
  size: { tier: string; minExamples: number; maxExamples: number; quickChecks: number };
}

/** CA-4: the EN | HI translation screen. */
export interface LessonTranslationData {
  documentId: string;
  slug: string;
  /** the current published English master (null: publish English first) */
  en: { versionId: string; versionNumber: number; meta: LessonMeta; blocks: LessonBlock[] } | null;
  /** the open HI draft, else the current published HI version */
  hi: { versionId: string; versionNumber: number; source: "DRAFT" | "PUBLISHED"; meta: LessonMeta; blocks: LessonBlock[]; outdated: boolean } | null;
  prompt: string | null;
  templateVersion: number | null;
}
