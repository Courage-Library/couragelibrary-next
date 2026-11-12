/**
 * SYLLABUS-UI-1: the syllabus browser's state rules as pure functions (components/syllabus/syllabus-browser.tsx uses
 * them; scripts/test_syllabus_browse1.cjs tests them offline). No React, no DOM.
 *   search   — a topic is shown when its name or one of its terms (subtopics …) contains the query; a topic shown only
 *              because of a term opens by itself (so the matching subtopic is visible) until the user closes it
 *   open     — explicit opens (remembered per session) + search auto-opens − topics closed during this search
 *   restore  — a saved state only keeps subjects and topics that still exist
 */

export type BrowseItem = { id: string; subjectId: string; name: string; terms?: string[]; expandable: boolean };
export type MatchInfo = { name: boolean; terms: boolean };
export type OpenState = { open: ReadonlySet<string>; closedInSearch: ReadonlySet<string> };
export type SavedState = { subject?: string; open?: string[] };

/** lower-case, accents and repeated spaces removed — what search compares */
export const normText = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** q must already be normText()-ed; an empty q matches everything */
export const textMatches = (s: string, q: string): boolean => !q || normText(s).includes(q);

export function matchTopics(topics: readonly BrowseItem[], q: string): Map<string, MatchInfo> {
  const m = new Map<string, MatchInfo>();
  for (const t of topics) m.set(t.id, { name: textMatches(t.name, q), terms: q !== "" && (t.terms ?? []).some((x) => textMatches(x, q)) });
  return m;
}

export const isVisible = (match: ReadonlyMap<string, MatchInfo>, q: string, id: string): boolean => {
  if (!q) return true;
  const r = match.get(id);
  return Boolean(r && (r.name || r.terms));
};

export const isOpen = (t: BrowseItem, s: OpenState, q: string, match: ReadonlyMap<string, MatchInfo>): boolean =>
  t.expandable && !s.closedInSearch.has(t.id) && (s.open.has(t.id) || (q !== "" && Boolean(match.get(t.id)?.terms)));

/** the state after the user clicks a topic's toggle */
export function toggleTopic(s: OpenState, t: BrowseItem, q: string, match: ReadonlyMap<string, MatchInfo>): OpenState {
  if (!t.expandable) return s;
  const wasOpen = isOpen(t, s, q, match);
  const open = new Set(s.open);
  const closedInSearch = new Set(s.closedInSearch);
  if (wasOpen) {
    open.delete(t.id);
    if (q) closedInSearch.add(t.id);
  } else {
    open.add(t.id);
    closedInSearch.delete(t.id);
  }
  return { open, closedInSearch };
}

/** Expand all / Collapse all over the shown topics of the open subject */
export function setAllTopics(s: OpenState, shown: readonly BrowseItem[], expand: boolean): OpenState {
  const ids = shown.filter((t) => t.expandable).map((t) => t.id);
  const open = new Set(s.open);
  for (const id of ids) {
    if (expand) open.add(id);
    else open.delete(id);
  }
  const closedInSearch = new Set(s.closedInSearch);
  for (const id of ids) {
    if (expand) closedInSearch.delete(id);
    else closedInSearch.add(id);
  }
  return { open, closedInSearch };
}

/** shown topics per subject (all topics without a query) */
export function subjectCounts(subjectIds: readonly string[], topics: readonly BrowseItem[], q: string, match: ReadonlyMap<string, MatchInfo>): Map<string, number> {
  const m = new Map(subjectIds.map((id) => [id, 0]));
  for (const t of topics) if (m.has(t.subjectId) && isVisible(match, q, t.id)) m.set(t.subjectId, (m.get(t.subjectId) ?? 0) + 1);
  return m;
}

/** a saved state (sessionStorage, untrusted JSON) → what still exists */
export function restoreState(raw: unknown, subjectIds: readonly string[], topicIds: readonly string[]): { subject: string | null; open: string[] } {
  const v = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as SavedState) : {};
  const subject = typeof v.subject === "string" && subjectIds.includes(v.subject) ? v.subject : null;
  const known = new Set(topicIds);
  const open = Array.isArray(v.open) ? [...new Set(v.open.filter((id): id is string => typeof id === "string" && known.has(id)))] : [];
  return { subject, open };
}

/**
 * SYLLABUS-UI-1 (owner 2026-11-12): the subject TAB label — one row of tabs must fit at ≥ 1280 px, so the long exam
 * subject names get their common short form ("English Comprehension" → "English"). The full name stays on the tab's
 * title, the rail heading and the jump sheet. Unknown names are kept as they are; "Paper · Subject" is shortened per part.
 */
const SHORT_LABELS: Array<[RegExp, string]> = [
  [/^general intelligence\s*(and|&)\s*reasoning(\s+ability)?$/i, "Reasoning"],
  [/^(logical\s+)?reasoning\s+ability$/i, "Reasoning"],
  [/^english\s+(comprehension|language)(\s*(and|&)\s*comprehension)?$/i, "English"],
];
export function shortSubjectLabel(label: string): string {
  return label
    .split(" · ")
    .map((part) => {
      const t = part.trim();
      const hit = SHORT_LABELS.find(([re]) => re.test(t));
      return hit ? hit[1] : t;
    })
    .join(" · ");
}
