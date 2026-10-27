/**
 * CA-2: the syllabus intake view types shared by the server service and the client screens (pure, no data access).
 */
import type { IntakeLevel } from "@/lib/syllabus/intake-contract";
import type { MatchCandidate, MatchStatus } from "@/lib/syllabus/tree-matcher";

export const INTAKE_DECISIONS = ["LINK", "ALIAS", "APPROVE_NEW", "IGNORE"] as const;
export type IntakeDecision = (typeof INTAKE_DECISIONS)[number];

export interface IntakeSessionView {
  id: string;
  examId: string;
  examTitle: string;
  cycleYear: number | null;
  tier: string | null;
  sourceUrl: string;
  asOf: string;
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
