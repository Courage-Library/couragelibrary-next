/** "SSC" · "SSC & Railway" · "SSC, Railway & Banking" (used by content/landing.ts, which may hold no digits) */
/** "questions and lessons" → "Questions and lessons" */
export function sentenceCase(s: string): string {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}

export function andList(names: readonly string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, names.length - 1).join(", ")} & ${names[names.length - 1]}`;
}
