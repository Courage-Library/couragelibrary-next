/**
 * GAP2-4c: "Suggest topics" for the /admin/syllabus topic picker — the only part kept from the retired phase-3R
 * reconciliation workbench (its text normalizer + trigram similarity).
 *
 * Pure and read-only: given a unit title and the active TOPIC nodes the picker already holds, it ranks likely
 * matches. It never maps anything — staff tick the topics that apply and press "Save topics" (role-checked RPC).
 * Deterministic: same input → same output; no network, no AI.
 */

export interface SuggestableTopic {
  id: string;
  name: string;
  subject_name?: string | null;
}

export interface TopicSuggestion<T extends SuggestableTopic = SuggestableTopic> {
  topic: T;
  /** 0–1 similarity between the unit title and the topic name */
  score: number;
}

/** NFKC, lower case, "&" → "and", "+" → "plus", separators → space, punctuation removed, whitespace collapsed. */
export function normalizeTopicText(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[/\\_-]+/g, " ")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trigrams(text: string): Set<string> {
  const padded = `  ${text}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Dice–Sørensen trigram similarity (0–1, two decimals), with a containment bonus for close multi-word phrases. */
export function topicSimilarity(a: string, b: string): number {
  const na = normalizeTopicText(a);
  const nb = normalizeTopicText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    if (ratio > 0.65) return Math.min(0.92, 0.8 + ratio * 0.12);
  }
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let shared = 0;
  for (const g of ta) if (tb.has(g)) shared++;
  return Math.round(((2 * shared) / (ta.size + tb.size)) * 100) / 100;
}

/**
 * Ranks topics against a unit title: score ≥ minScore, best first (ties by name), at most `limit`.
 * A topic whose name is one of the title's words (e.g. unit "Percentage and profit" → topic "Percentage") also
 * qualifies with at least the containment score.
 */
export function suggestTopics<T extends SuggestableTopic>(
  unitTitle: string,
  topics: readonly T[],
  opts: { limit?: number; minScore?: number } = {},
): TopicSuggestion<T>[] {
  const { limit = 8, minScore = 0.45 } = opts;
  const title = normalizeTopicText(unitTitle);
  if (!title) return [];
  const words = new Set(title.split(" ").filter((w) => w.length >= 4));
  const scored: TopicSuggestion<T>[] = [];
  for (const topic of topics) {
    const name = normalizeTopicText(topic.name);
    if (!name) continue;
    let score = topicSimilarity(title, name);
    const nameWords = name.split(" ");
    if (score < 0.8 && nameWords.length > 0 && nameWords.every((w) => words.has(w))) score = 0.8;
    if (score >= minScore) scored.push({ topic, score });
  }
  scored.sort((x, y) => y.score - x.score || x.topic.name.localeCompare(y.topic.name));
  return scored.slice(0, limit);
}
