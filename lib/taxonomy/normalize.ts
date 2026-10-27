/**
 * CA-1: the ONE taxonomy name normalization, mirrored exactly by public.fn_taxonomy_normalize (migration 115).
 * Used to compare names and aliases within a parent scope (an alias may not equal a sibling's name or alias).
 * NFKC → lower case → "&" becomes " and " → the punctuation below becomes a space → whitespace collapsed + trimmed.
 * Pure and dependency-free: safe in client components. Changing it requires the same change in SQL (gate CA1-N).
 */

/** Exactly the 40 characters folded by the SQL translate() (ASCII punctuation except "&", curly quotes, dashes, …, danda). */
export const TAXONOMY_PUNCTUATION = "!\"#$%'()*+,-./:;<=>?@[\\]^_`{|}~‘’“”–—…।॥";

export function normalizeTaxonomyName(input: string | null | undefined): string {
  const lowered = String(input ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ");
  let folded = "";
  for (const ch of lowered) folded += TAXONOMY_PUNCTUATION.includes(ch) ? " " : ch;
  return folded.replace(/\s+/g, " ").trim();
}

/** Test vectors shared by the offline gate and the DB smoke (SQL output must equal the TS output for each). */
export const NORMALIZE_VECTORS: readonly string[] = [
  "Percentage",
  "  Profit & Loss  ",
  "Time, Speed & Distance",
  "Simple/Compound Interest",
  "Number-System",
  "Mensuration (2D)",
  "Reading   Comprehension",
  "‘Fill’ in the “blanks” – part—two…",
  "ＦＵＬＬ　ｗｉｄｔｈ",
  "Café Économie",
  "प्रतिशत",
  "लाभ और हानि।",
  "हिंदी व्याकरण॥ अभ्यास",
  "Ratio: Proportion; Partnership!",
  "C++ & C#",
  "100% Questions?",
];
