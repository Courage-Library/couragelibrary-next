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

