/**
 * COURAGE LIBRARY — EXTERNAL AI CITATION ARTIFACT SANITIZER & DETECTOR
 * Phase 3K.16: External AI Citation Artifact Forensic Audit & Sanitization
 * 
 * Provides deterministic detection, validation, and sanitization of external-AI
 * citation markers and footnote artifacts (from ChatGPT/OpenAI, Claude, Perplexity, Gemini)
 * without altering legitimate Markdown links, normal punctuation, or official source provenance.
 * 
 * SUPPORTED ARTIFACT PATTERNS:
 * 1. OpenAI / ChatGPT citation directives:
 *    - :contentReference[oaicite:0]{index=0}
 *    - :contentReference[oaicite:N]{index=N}
 *    - [oaicite:N]{index=N}
 *    - [oaicite:N]
 *    - :contentReference[...]
 * 2. OpenAI / ChatGPT search footnote markers:
 *    - 【N†source】
 *    - 【N:M†source】
 *    - 【N†...】
 * 3. Assistant / Perplexity raw citation markers:
 *    - [cite: N] / [citation: N]
 *    - :citationReference[...]{...}
 *    - :sourceReference[...]{...}
 * 
 * SACRED INVARIANTS:
 * - NEVER remove legitimate URLs (http://, https://).
 * - NEVER remove valid Markdown links [Title](https://...).
 * - NEVER remove official sources from exam_sources / officialSources table.
 * - NEVER remove valid LaTeX math or mathematical punctuation ($...$, $$...$$).
 * - NEVER mutate immutable published records directly.
 */

// Strict regex matching all known external AI citation and footnote syntax
export const AI_CITATION_ARTIFACT_REGEX =
  /(:contentReference\[oaicite:\d+\](?:\{index=\d+\})?)|(\[oaicite:\d+\](?:\{index=\d+\})?)|(:contentReference\[[^\]]*\](?:\{[^}]*\})?)|(:citationReference\[[^\]]*\](?:\{[^}]*\})?)|(:sourceReference\[[^\]]*\](?:\{[^}]*\})?)|(【\d+(?::\d+)?†[^】]*】)|(\[(?:cite|citation):\s*\d+\])/gi;

export interface DetectedArtifact {
  token: string;
  index: number;
  line: number;
}

/**
 * Detects any external AI citation artifacts present in the given text.
 */
export function detectAiCitationArtifacts(content: string): DetectedArtifact[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const results: DetectedArtifact[] = [];
  const lines = content.split('\n');
  let runningIndex = 0;

  lines.forEach((line, lineIdx) => {
    let match: RegExpExecArray | null;
    const regex = new RegExp(AI_CITATION_ARTIFACT_REGEX.source, 'gi');

    while ((match = regex.exec(line)) !== null) {
      results.push({
        token: match[0],
        index: runningIndex + match.index,
        line: lineIdx + 1,
      });
    }

    runningIndex += line.length + 1; // +1 for newline
  });

  return results;
}

/**
 * Sanitizes external AI citation artifacts from text while preserving legitimate
 * Markdown, URLs, punctuation, and structural spacing.
 */
export function sanitizeAiCitationArtifacts(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Fast check: if no artifact pattern exists, return unchanged
  if (!AI_CITATION_ARTIFACT_REGEX.test(content)) {
    return content;
  }

  // Reset regex state after test()
  AI_CITATION_ARTIFACT_REGEX.lastIndex = 0;

  // Replace artifact:
  // If the artifact token is preceded by non-space and followed by non-space, replace with space
  // Otherwise replace with empty string
  let cleaned = content.replace(AI_CITATION_ARTIFACT_REGEX, (match, ...args) => {
    return ' ';
  });

  // Clean up punctuation spacing:
  // e.g. "word , next" -> "word, next"
  cleaned = cleaned.replace(/[ \t]+([,.;:!?])/g, '$1');

  // e.g. " ( " -> " ("
  cleaned = cleaned.replace(/([(\[])[ \t]+/g, '$1');
  cleaned = cleaned.replace(/[ \t]+([)\]])/g, '$1');

  // e.g. "word   next" -> "word next" (collapse duplicate inline whitespace)
  cleaned = cleaned.replace(/([^\n\S]){2,}/g, ' ');

  // e.g. "()" -> ""
  cleaned = cleaned.replace(/\(\s*\)/g, '');

  return cleaned.trim();
}

/**
 * Deeply traverses an object or array and sanitizes all string properties recursively.
 */
export function sanitizeObjectCitationArtifacts<T>(target: T): T {
  if (target === null || target === undefined) {
    return target;
  }

  if (typeof target === 'string') {
    return sanitizeAiCitationArtifacts(target) as unknown as T;
  }

  if (Array.isArray(target)) {
    return target.map((item) => sanitizeObjectCitationArtifacts(item)) as unknown as T;
  }

  if (typeof target === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(target)) {
      result[key] = sanitizeObjectCitationArtifacts(value);
    }
    return result as T;
  }

  return target;
}
