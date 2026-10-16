/**
 * GAP2-4b: maps errors raised by the role-checked syllabus RPCs (migration 079) to safe, uniform action
 * failures. The RPCs raise SYLLABUS_* codes as the message prefix (SQLSTATE P0001 / P0002 / 22023 / 23503 / 42501);
 * nothing from the database message text beyond the known code ever reaches the UI.
 */
import { actionFailure, type ActionFailure } from "@/lib/auth/require-admin";

const MESSAGES: Record<string, string> = {
  SYLLABUS_FORBIDDEN: "You do not have permission to perform this action.",
  SYLLABUS_NOT_DRAFT: "This version is no longer a draft. Published and archived versions are read-only.",
  SYLLABUS_IMMUTABLE: "Published and archived versions are read-only.",
  SYLLABUS_VERSION_NOT_FOUND: "That syllabus version no longer exists.",
  SYLLABUS_NODE_NOT_FOUND: "That node no longer exists. Reload the page.",
  SYLLABUS_EXAM_NOT_FOUND: "That exam no longer exists.",
  SYLLABUS_CYCLE_NOT_OF_EXAM: "The selected cycle belongs to another exam.",
  SYLLABUS_SOURCE_OTHER_EXAM: "You can only copy a version of the same exam.",
  SYLLABUS_SOURCE_NOT_PUBLISHED: "Only a published version can be copied into a new draft.",
  SYLLABUS_NODE_TITLE_INVALID: "Enter a title (1–200 characters).",
  SYLLABUS_USE_MOVE: "Use Move to change where a node sits in the tree.",
  SYLLABUS_PARENT_OTHER_VERSION: "A node can only be placed under a node of the same version.",
  SYLLABUS_NODE_VERSION_LOCKED: "A node cannot move to another version.",
  SYLLABUS_MAPPING_NOT_UNIT: "Only UNIT nodes can be mapped to topics.",
  SYLLABUS_TOPICS_INVALID: "Choose distinct, active topics.",
  SYLLABUS_WEIGHTS_INVALID: "Weights must be set for every topic (each above 0, at most 1) and add up to 1 — or leave all weights empty.",
  SYLLABUS_ALREADY_ARCHIVED: "This version is already archived.",
  SYLLABUS_CYCLE: "A node cannot be moved under itself or one of its own children.",
  SYLLABUS_DUPLICATE_SLUG: "A sibling node already uses this title or slug. Choose a different one.",
};

/** The SYLLABUS_* code at the start of a raised message, or a recognised trigger / constraint condition. */
export function syllabusErrorCode(err: unknown): string | null {
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  const m = /^(SYLLABUS_[A-Z_]+)/.exec(message);
  if (m) return m[1];
  if (e?.code === "42501") return "SYLLABUS_FORBIDDEN";
  if (/Circular parent|Self-parenting|cannot be its own parent/i.test(message)) return "SYLLABUS_CYCLE";
  if (e?.code === "23505" && /uq_syllabus_node_sibling_slug/.test(message)) return "SYLLABUS_DUPLICATE_SLUG";
  return null;
}

/** Uniform failure: FORBIDDEN, VALIDATION (known code, curated text) or DB_ERROR (generic text). */
export function mapSyllabusError(context: string, err: unknown): ActionFailure {
  const code = syllabusErrorCode(err);
  if (code === "SYLLABUS_FORBIDDEN") return actionFailure("FORBIDDEN", MESSAGES.SYLLABUS_FORBIDDEN);
  if (code && MESSAGES[code]) return actionFailure("VALIDATION", MESSAGES[code]);
  const e = err as { code?: unknown } | null;
  console.error(`[${context}] syllabus RPC error: ${typeof e?.code === "string" ? e.code : "unknown"}`);
  return actionFailure("DB_ERROR", "The change could not be saved. Please try again.");
}
