/**
 * CA-2: the syllabus intake view types shared by the server service and the client screens (pure, no data access).
 */
import type { IntakeLevel, IntakeOrigin } from "@/lib/syllabus/intake-contract";
import type { MatchCandidate, MatchStatus } from "@/lib/syllabus/tree-matcher";

/** INTAKE-CONCEPTS-AS-OUTLINE: OUTLINE = "Keep as lesson outline" (concepts only; no master-tree node; not final). */
export const INTAKE_DECISIONS = ["LINK", "ALIAS", "APPROVE_NEW", "IGNORE", "OUTLINE"] as const;
export type IntakeDecision = (typeof INTAKE_DECISIONS)[number];

/** INTAKE-ASSIST-1 bulk actions (one transaction, one audit row, undoable until the draft is created). */
export const INTAKE_BULK_ACTIONS = ["LINK_EXACT", "APPROVE_CHILDREN", "KEEP_OUTLINE"] as const;
export type IntakeBulkAction = (typeof INTAKE_BULK_ACTIONS)[number];
export const INTAKE_BULK_MAX = 1000;

/** Step 6: the owner's check of the notification named in "based on". */
export const INTAKE_SOURCE_CHECKS = ["VERIFIED", "UNVERIFIABLE"] as const;
export type IntakeSourceCheck = (typeof INTAKE_SOURCE_CHECKS)[number];

/** The newest bulk action that can still be undone (null: none). */
export interface IntakeBatchView {
  id: string;
  action: IntakeBulkAction;
  count: number;
  createdNodes: number;
  createdAt: string;
}

export interface IntakeSessionView {
  id: string;
  examId: string;
  examTitle: string;
  cycleYear: number | null;
  tier: string | null;
  /** v2: the official link; v3: the optional reference link */
  sourceUrl: string | null;
  asOf: string | null;
  /** v3 (SYLLABUS-PROMPT-2): which notification / PYQ years the AI based the syllabus on */
  basedOn: string | null;
  contractVersion: number;
  status: "REVIEW" | "IMPORTED" | "DISCARDED";
  importedVersionId: string | null;
  createdAt: string;
}

export interface IntakeItemView {
  id: string;
  parentId: string | null;
  key: string;
  level: IntakeLevel;
  position: number;
  name: string;
  nameHi: string | null;
  aliases: string[];
  marks: number | null;
  questions: number | null;
  weightageTier: string | null;
  /** v3: OFFICIAL / PYQ_TREND / EXPANDED (topics, subtopics, concepts) */
  origin: IntakeOrigin | null;
  avgQuestions: number | null;
  /** v3: papers only */
  durationMinutes: number | null;
  negativeMarking: string | null;
  uncertain: boolean;
  uncertainReason: string | null;
  headings: string[];
  matchStatus: MatchStatus;
  matchedNodeId: string | null;
  candidates: MatchCandidate[];
  decision: IntakeDecision | null;
  decisionNodeId: string | null;
}

/** A master-tree node the owner may pick (active; path for display). */
export interface IntakeNodeOption {
  id: string;
  parentId: string | null;
  nodeType: string;
  name: string;
  path: string;
}
