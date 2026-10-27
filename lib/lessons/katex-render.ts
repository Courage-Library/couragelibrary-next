import "server-only";
import katex from "katex";
import { latexProblem } from "@/lib/lessons/blocks";

/**
 * CA-3 formula ruling (architect, 2026-10-27): formulas are rendered SERVER-SIDE with KaTeX (pinned 0.16.11) — never
 * raw LaTeX to students, no client JS. The LaTeX allow-list (lib/lessons/blocks.ts latexProblem) is checked FIRST, so
 * nothing outside it reaches KaTeX (no \href, \url, \includegraphics, \htmlClass …; trust:false refuses them too).
 * Any error → null, and the caller shows the plain-text reading instead. The returned HTML is KaTeX's own output only
 * (branded type): the one place lesson HTML is injected (components/learning/katex-math.tsx) accepts nothing else.
 */

declare const SAFE_KATEX: unique symbol;
export type SafeKatexHtml = string & { readonly [SAFE_KATEX]: true };

export const KATEX_OPTIONS = {
  trust: false,
  strict: "error",
  throwOnError: false,
  maxSize: 10,
  maxExpand: 100,
} as const;

/**
 * display: a block formula (HTML only; the required reading is the accessible text) · inline: also KaTeX's MathML
 * (screen readers read it; inline math has no author-written reading).
 */
export function renderLatex(latex: string, mode: "display" | "inline"): SafeKatexHtml | null {
  if (typeof latex !== "string" || !latex.trim() || latex.length > 500 || latexProblem(latex)) return null;
  try {
    const html = katex.renderToString(latex, { ...KATEX_OPTIONS, displayMode: mode === "display", output: mode === "display" ? "html" : "htmlAndMathml" });
    // throwOnError:false renders a ParseError (incl. strict-mode errors) as a katex-error span: treat it as a failure
    if (!html || html.includes("katex-error")) return null;
    return html as SafeKatexHtml;
  } catch {
    return null;
  }
}
