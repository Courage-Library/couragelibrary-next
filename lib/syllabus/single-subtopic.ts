/**
 * LESSON-PROMPT-QUALITY-1 item 8 (REPORT ONLY): a TOPIC whose one and only SUBTOPIC just renames it (e.g. "Antonyms ›
 * Opposite Word Meaning") gives the lesson generator a node that splits nothing. This file classifies such pairs; the
 * owner decides what to do with each (scripts/content/single-subtopic-report.cjs lists them, nothing is changed).
 * A rename adds nothing: every key word of the subtopic is a topic word or a gloss of one.
 *   - same_name:   the same key words after normalising (case, punctuation, a plural "s", filler / task words)
 *   - same_words:  every subtopic key word is a topic word or a gloss of one, at least one a topic word
 *   - gloss:       every subtopic key word only glosses the topic (a small fixed list, e.g. antonym → opposite)
 *   - filler_only: the subtopic name has no key word at all ("Meaning and Usage")
 *   - different:   the subtopic adds a word of its own, i.e. a real part (still listed, lower priority)
 * Pure; no I/O.
 */
export type SingleSubtopicKind = "same_name" | "same_words" | "gloss" | "filler_only" | "different";

// filler and generic task words never make a subtopic a real part ("Spelling Identification" = "Spelling")
const FILLER = new Set([
  "a", "an", "the", "of", "and", "or", "in", "on", "to", "for", "with", "word", "words", "meaning", "meanings", "basic", "basics",
  "type", "types", "question", "questions", "based", "concept", "concepts", "introduction", "general",
  "identification", "identify", "transformation", "usage", "use", "understanding", "completion", "practice",
]);

// topic key word → the words that only gloss it
const GLOSSES: Record<string, string[]> = {
  antonym: ["opposite", "contrary", "reverse"],
  synonym: ["similar", "same", "equivalent"],
  idiom: ["phrase", "phrasal", "expression", "idiomatic"],
  spelling: ["misspelt", "misspelled", "spell", "correct"],
  substitution: ["single", "replace", "replacement"],
  percentage: ["percent"],
  cloze: ["passage", "contextual", "context", "fill", "blank"],
  comprehension: ["passage", "reading", "context"],
  active: ["voice"],
  passive: ["voice"],
  indirect: ["reported", "narration"],
  direct: ["reported", "narration"],
};

const stem = (w: string) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
// the same word in another form: "idiomatic" starts with "idiom" (whole shorter word of at least 5 letters)
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

export function keyWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(stem)
    .filter((w) => !FILLER.has(w));
}

export function classifySingleSubtopic(topic: string, subtopic: string): SingleSubtopicKind {
  const t = keyWords(topic);
  const s = keyWords(subtopic);
  if (s.length === 0) return "filler_only";
  if (t.join(" ") === s.join(" ")) return "same_name";
  const glosses = t.flatMap((w) => GLOSSES[w] ?? []);
  const isTopicWord = (w: string) => t.some((x) => sameWord(x, w));
  if (s.some((w) => !isTopicWord(w) && !glosses.includes(w))) return "different";
  return s.some(isTopicWord) ? "same_words" : "gloss";
}

/** A rename is any kind except "different". */
export const isRename = (kind: SingleSubtopicKind) => kind !== "different";
