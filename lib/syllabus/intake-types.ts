/**
 * CA-2: the syllabus intake view types shared by the server service and the client screens (pure, no data access).
 */
import type { IntakeLevel, IntakeOrigin } from "@/lib/syllabus/intake-contract";
import type { MatchCandidate, MatchStatus } from "@/lib/syllabus/tree-matcher";

export const INTAKE_DECISIONS = ["LINK", "ALIAS", "APPROVE_NEW", "IGNORE"] as const;
export type IntakeDecision = (typeof INTAKE_DECISIONS)[number];

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
