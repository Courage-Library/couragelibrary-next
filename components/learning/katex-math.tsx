import React from "react";
import "katex/dist/katex.min.css"; // self-hosted: bundled with its fonts by Next (no CDN); only on pages with lessons
import { renderLatex } from "@/lib/lessons/katex-render";
import type { LessonMathProps } from "@/lib/lessons/blocks";

/**
 * CA-3: server-rendered KaTeX (see lib/lessons/katex-render.ts). The ONLY component that injects HTML in a lesson, and
 * only KaTeX's own output for allow-listed LaTeX. Block formulas: the KaTeX HTML is hidden from assistive technology
 * and the required plain-text reading is the accessible (and crawlable) text. Inline math carries KaTeX's MathML.
 * On any render error: the plain-text reading (or, for inline math without a reading, the source as plain text).
 */
export function KatexMath({ latex, reading, display }: LessonMathProps) {
  const html = renderLatex(latex, display ? "display" : "inline");
  if (!html) {
    return display ? <span className="block text-body text-fg">{reading || latex}</span> : <span className="font-mono">{reading || latex}</span>;
  }
  if (display) {
    return (
      <span className="block overflow-x-auto" data-katex="">
        <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
        {reading && <span className="sr-only">{reading}</span>}
      </span>
    );
  }
  return <span data-katex="" dangerouslySetInnerHTML={{ __html: html }} />;
}
