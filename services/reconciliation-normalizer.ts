/**
 * COURAGE LIBRARY — RECONCILIATION TEXT NORMALIZER & SIMILARITY UTILITY
 * Phase 3R.3: Context-Aware Reconciliation Engine & Gap Manifest
 * 
 * Provides deterministic, mathematical string normalization and local
 * n-gram similarity scoring for candidate taxonomy matching.
 * 
 * INVARIANTS:
 * 1. 100% DETERMINISTIC: Same input string always produces identical normalized output.
 * 2. NO AGGRESSIVE STEMMING: Preserves educational keywords without blind word truncation.
 * 3. NO EXTERNAL AI CALLS: Operates purely on fast in-memory string metrics.
 */

export class ReconciliationNormalizer {
  /**
   * Deterministically normalizes title strings for comparison.
   * - Unicode NFKC normalization
   * - Lowercase and trim
   * - Conjunction standardization ('&' -> 'and', '+' -> 'plus')
   * - Punctuation stripping (removes colons, quotes, hyphens, parentheses)
   * - Whitespace collapsing
   */
  static normalize(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .normalize('NFKC')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/\+/g, ' plus ')
      .replace(/[/\\_-]+/g, ' ')
      .replace(/[^\w\s]/g, '') // remove remaining punctuation
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generates a standard slug from text.
   */
  static slugify(text: string): string {
    return this.normalize(text).replace(/\s+/g, '-');
  }

  /**
   * Extracts character trigrams (3-grams) from normalized string.
   */
  static getTrigrams(text: string): Set<string> {
    const padded = `  ${text}  `;
    const trigrams = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) {
      trigrams.add(padded.slice(i, i + 3));
    }
    return trigrams;
  }

  /**
   * Computes deterministic Dice-Sørensen Trigram Similarity (0.00 to 1.00).
   */
  static computeSimilarity(a: string, b: string): number {
    const normA = this.normalize(a);
    const normB = this.normalize(b);

    if (normA === normB) {
      return 1.0;
    }
    if (!normA || !normB) {
      return 0.0;
    }

    // Substring containment bonus for multi-word phrases
    if (normA.includes(normB) || normB.includes(normA)) {
      const shorterLen = Math.min(normA.length, normB.length);
      const longerLen = Math.max(normA.length, normB.length);
      const ratio = shorterLen / longerLen;
      if (ratio > 0.65) {
        return Math.min(0.92, 0.80 + ratio * 0.12);
      }
    }

    const triA = this.getTrigrams(normA);
    const triB = this.getTrigrams(normB);

    if (triA.size === 0 || triB.size === 0) {
      return 0.0;
    }

    let intersectionCount = 0;
    for (const gram of triA) {
      if (triB.has(gram)) {
        intersectionCount++;
      }
    }

    const score = (2.0 * intersectionCount) / (triA.size + triB.size);
    return Math.round(score * 100) / 100;
  }
}
