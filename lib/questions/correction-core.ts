/**
 * MISTAKE-VERSION-1 (architect, 2026-10-27): a mistake / review always shows the version the student ANSWERED (the
 * snapshot: stem, options, their answer). When a NEWER published version of the same question is current (a
 * correction), the corrected version + its key are shown as well, labelled "This question was corrected". A superseded
 * version is never shown as if it were current. Pure (offline-testable; scripts/test_mistake_version1.cjs).
 */
export const CORRECTED_NOTICE = "This question was corrected";

export interface VersionSnapshot {
  id: string;
  questionText: string;
  options: Array<{ id?: string; key: string; text: string }>;
  /** null = no valid key (QB-KEY-1) */
  correctOptionKey: string | null;
  explanation: string | null;
}

/** The corrected version to show next to the answered one, or null when the answered version is still the current one. */
export function correctionFor(answeredVersionId: string | null | undefined, current: VersionSnapshot | null | undefined): VersionSnapshot | null {
  if (!answeredVersionId || !current) return null;
  return current.id !== answeredVersionId ? current : null;
}

/**
 * The version a mistake was made on: the newest ACTIVE occurrence that recorded one, else the newest occurrence that
 * recorded one (occurrences newest first). null = no occurrence recorded a version (legacy rows): the caller shows the
 * current version and says the answered version is unknown — it never pretends.
 */
export function answeredVersionIdOf(occurrences: Array<{ question_version_id?: string | null; occurrence_status?: string | null }>): string | null {
  const withVersion = occurrences.filter((o) => !!o.question_version_id);
  const active = withVersion.find((o) => (o.occurrence_status ?? "ACTIVE") === "ACTIVE");
  return (active ?? withVersion[0])?.question_version_id ?? null;
}

/** The text a mistake list shows: the answered version's text, else the CURRENT version's, never an arbitrary one. */
export function listTextFor(answeredText: string | null | undefined, versions: Array<{ question_text?: string | null; is_current?: boolean | null }> | null | undefined): string {
  if (answeredText) return answeredText;
  const current = (versions ?? []).find((v) => v.is_current);
  return current?.question_text || "Question prompt unavailable";
}
