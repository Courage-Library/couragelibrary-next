/**
 * CA-3: one-time converter LessonDocumentSpec v1 (the legacy SOURCE spec JSON — never the compiled MDX, which drops
 * steps, options, variables and summary parts) → LessonBlocksSpec v2 (lib/lessons/blocks.ts). Pure + deterministic.
 * Fail-closed: anything it cannot place without loss (a diagram asset, a PYQ reference, a markdown construct outside the
 * inline subset) throws, so a lesson is never silently shortened. coverageGaps() proves every v1 text survived.
 */
import type { LessonBlock, LessonMeta } from "@/lib/lessons/blocks";

/** The v1 fields the converter reads (types/learning-compiler.ts LessonDocumentSpec 1.0.0). */
export interface V1Spec {
  schemaVersion: string;
  language?: string;
  metadata: { title: string; estimatedReadingMinutes?: number };
  learningObjectives?: string[];
  prerequisites?: { conceptSummary: string }[];
  sections?: { id: string; title: string; sectionType?: string; contentMarkdown: string; diagramAssetId?: string; calloutNotes?: { variant: string; title?: string; body: string }[] }[];
  formulaBlocks?: { id: string; name: string; latexFormula: string; variableDefinitions?: { symbol: string; meaning: string }[]; applicableConditions?: string[]; speedShortcutTrick?: string }[];
  workedExamples?: { id: string; difficulty: string; problemText: string; stepByStepSolution: { stepNumber: number; explanation: string; mathSnippet?: string }[]; shortcutMethod?: string; commonMistakeToAvoid?: string }[];
  cognitiveTraps?: { trapType?: string; misconception: string; correctApproach: string }[];
  authenticPyqReferences?: { questionVersionId: string; relevanceRationale: string }[];
  quickChecks?: { id: string; prompt: string; options: { id: string; text: string; isCorrect: boolean; feedbackExplanation?: string }[] }[];
  revisionSummary?: { keyTakeaways?: string[]; coreFormulas?: string[]; speedRules?: string[] };
  seo?: { metaTitle?: string; metaDescription?: string; focusKeywords?: string[] };
}

export class ConversionError extends Error {}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "x";

/** Markdown → paragraph / list / heading blocks (the inline subset is kept as-is: **bold**, *italic*, `code`). */
function markdownBlocks(md: string, idBase: string): LessonBlock[] {
  const out: LessonBlock[] = [];
  let n = 0;
  const id = () => `${idBase}-${++n}`;
  for (const chunk of md.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) out.push({ id: id(), type: "list", ordered: false, items: lines.map((l) => l.replace(/^\s*[-*]\s+/, "")) });
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push({ id: id(), type: "list", ordered: true, items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")) });
    else if (lines.length === 1 && /^#{2,3}\s+/.test(lines[0])) out.push({ id: id(), type: "heading", level: lines[0].startsWith("###") ? 3 : 2, text: lines[0].replace(/^#{2,3}\s+/, "") });
    else if (lines.some((l) => /^\s*([-*]|\d+[.)]|#{1,6})\s+/.test(l) || /^\s*>/.test(l) || /^\s*\|/.test(l)))
      throw new ConversionError(`Mixed or unsupported markdown in "${idBase}": convert this section by hand.`);
    else out.push({ id: id(), type: "paragraph", text: lines.join(" ") });
  }
  return out;
}

export function convertV1(spec: V1Spec): { meta: LessonMeta; blocks: LessonBlock[] } {
  if (spec.schemaVersion !== "1.0.0") throw new ConversionError(`Unsupported spec version ${spec.schemaVersion}.`);
  if ((spec.authenticPyqReferences || []).length) throw new ConversionError("PYQ references point at question versions, not nodes: convert by hand.");
  const blocks: LessonBlock[] = [];
  const objectives = spec.learningObjectives || [];
  if (objectives.length) {
    blocks.push({ id: "objectives-h", type: "heading", level: 2, text: "What you will learn" });
    blocks.push({ id: "objectives", type: "list", ordered: false, items: objectives });
  }
  const prereq = (spec.prerequisites || []).map((p) => p.conceptSummary).filter(Boolean);
  if (prereq.length) {
    blocks.push({ id: "prereq-h", type: "heading", level: 2, text: "Before you start" });
    blocks.push({ id: "prereq", type: "list", ordered: false, items: prereq });
  }
  for (const s of spec.sections || []) {
    if (s.diagramAssetId) throw new ConversionError(`Section "${s.title}" has a diagram asset: move it to lesson-images and convert by hand.`);
    const base = `s-${slug(s.id)}`;
    blocks.push({ id: `${base}-h`, type: "heading", level: 2, text: s.title });
    blocks.push(...markdownBlocks(s.contentMarkdown, base));
    (s.calloutNotes || []).forEach((c, i) => {
      const variant = (["TIP", "WARNING", "INFO", "MEMORY_HOOK"] as const).find((v) => v === c.variant);
      if (!variant) throw new ConversionError(`Unknown callout variant ${c.variant}.`);
      blocks.push({ id: `${base}-c${i + 1}`, type: "callout", variant, ...(c.title ? { title: c.title } : {}), text: c.body });
    });
  }
  const formulas = spec.formulaBlocks || [];
  if (formulas.length) blocks.push({ id: "formulas-h", type: "heading", level: 2, text: "Formulas" });
  for (const f of formulas) {
    const base = `f-${slug(f.id)}`;
    const vars = (f.variableDefinitions || []).map((v) => `${v.symbol}: ${v.meaning}`);
    blocks.push({ id: base, type: "formula", name: f.name, latex: f.latexFormula, reading: [f.name, ...vars].join(". ") });
    if ((f.applicableConditions || []).length) blocks.push({ id: `${base}-when`, type: "list", ordered: false, items: f.applicableConditions as string[] });
    if (f.speedShortcutTrick) blocks.push({ id: `${base}-trick`, type: "callout", variant: "TIP", title: "Shortcut", text: f.speedShortcutTrick });
  }
  const examples = spec.workedExamples || [];
  if (examples.length) blocks.push({ id: "examples-h", type: "heading", level: 2, text: "Solved examples" });
  for (const w of examples) {
    const difficulty = (["EASY", "MEDIUM", "HARD"] as const).find((d) => d === w.difficulty);
    if (!difficulty) throw new ConversionError(`Unknown difficulty ${w.difficulty}.`);
    blocks.push({
      id: `e-${slug(w.id)}`,
      type: "solved_example",
      difficulty,
      question: w.problemText,
      steps: [...w.stepByStepSolution].sort((a, b) => a.stepNumber - b.stepNumber).map((st) => ({ text: st.explanation, ...(st.mathSnippet ? { math: st.mathSnippet } : {}) })),
      ...(w.shortcutMethod ? { shortcut: w.shortcutMethod } : {}),
      ...(w.commonMistakeToAvoid ? { mistake: w.commonMistakeToAvoid } : {}),
    });
  }
  const traps = spec.cognitiveTraps || [];
  if (traps.length) blocks.push({ id: "traps-h", type: "heading", level: 2, text: "Common traps" });
  traps.forEach((t, i) => {
    const kind = (["CALCULATION_SLIP", "MISREAD_KEYWORD", "FORMULA_CONFUSION", "DISTRACTOR_TRAP"] as const).find((k) => k === t.trapType);
    blocks.push({ id: `t-${i + 1}`, type: "trap", ...(kind ? { kind } : {}), text: t.misconception, why: t.correctApproach });
  });
  const checks = spec.quickChecks || [];
  if (checks.length) blocks.push({ id: "checks-h", type: "heading", level: 2, text: "Quick check" });
  for (const q of checks) {
    blocks.push({
      id: `q-${slug(q.id)}`,
      type: "quick_check",
      prompt: q.prompt,
      options: q.options.map((o) => ({ id: slug(o.id), text: o.text, correct: o.isCorrect, ...(o.feedbackExplanation ? { feedback: o.feedbackExplanation } : {}) })),
    });
  }
  const rs = spec.revisionSummary;
  if (rs && ((rs.keyTakeaways || []).length || (rs.coreFormulas || []).length || (rs.speedRules || []).length)) {
    blocks.push({ id: "summary-h", type: "heading", level: 2, text: "Revision summary" });
    blocks.push({
      id: "summary",
      type: "revision_summary",
      bullets: (rs.keyTakeaways || []).length ? (rs.keyTakeaways as string[]) : ["See the formulas and speed rules below."],
      ...((rs.coreFormulas || []).length ? { formulas: rs.coreFormulas } : {}),
      ...((rs.speedRules || []).length ? { speed_rules: rs.speedRules } : {}),
    });
  }
  const meta: LessonMeta = {
    title: spec.metadata.title,
    ...(spec.metadata.estimatedReadingMinutes ? { estimated_minutes: Math.round(spec.metadata.estimatedReadingMinutes) } : {}),
    ...(spec.seo
      ? { seo: { ...(spec.seo.metaTitle ? { meta_title: spec.seo.metaTitle } : {}), ...(spec.seo.metaDescription ? { meta_description: spec.seo.metaDescription } : {}), ...(spec.seo.focusKeywords ? { focus_keywords: spec.seo.focusKeywords } : {}) } }
      : {}),
  };
  return { meta, blocks };
}

/** Every content text of the v1 spec, normalised (markdown list markers / blank lines removed). */
export function v1Texts(spec: V1Spec): string[] {
  const out: string[] = [spec.metadata.title, ...(spec.learningObjectives || []), ...(spec.prerequisites || []).map((p) => p.conceptSummary)];
  for (const s of spec.sections || []) {
    out.push(s.title);
    for (const line of s.contentMarkdown.split("\n")) {
      const t = line.replace(/^\s*([-*]|\d+[.)]|#{2,3})\s+/, "").trim();
      if (t) out.push(t);
    }
    for (const c of s.calloutNotes || []) out.push(...(c.title ? [c.title] : []), c.body);
  }
  for (const f of spec.formulaBlocks || []) out.push(f.name, f.latexFormula, ...(f.variableDefinitions || []).flatMap((v) => [v.symbol, v.meaning]), ...(f.applicableConditions || []), ...(f.speedShortcutTrick ? [f.speedShortcutTrick] : []));
  for (const w of spec.workedExamples || []) out.push(w.problemText, ...w.stepByStepSolution.flatMap((s) => [s.explanation, ...(s.mathSnippet ? [s.mathSnippet] : [])]), ...(w.shortcutMethod ? [w.shortcutMethod] : []), ...(w.commonMistakeToAvoid ? [w.commonMistakeToAvoid] : []));
  for (const t of spec.cognitiveTraps || []) out.push(t.misconception, t.correctApproach);
  for (const q of spec.quickChecks || []) out.push(q.prompt, ...q.options.flatMap((o) => [o.text, ...(o.feedbackExplanation ? [o.feedbackExplanation] : [])]));
  const rs = spec.revisionSummary || {};
  out.push(...(rs.keyTakeaways || []), ...(rs.coreFormulas || []), ...(rs.speedRules || []));
  if (spec.seo) out.push(...(spec.seo.metaTitle ? [spec.seo.metaTitle] : []), ...(spec.seo.metaDescription ? [spec.seo.metaDescription] : []), ...(spec.seo.focusKeywords || []));
  return out.filter((t) => t && t.trim());
}

/** The v1 texts that do NOT appear (verbatim) anywhere in the converted { meta, blocks } — must be empty. */
export function coverageGaps(spec: V1Spec, converted: { meta: unknown; blocks: unknown }): string[] {
  const hay = JSON.stringify(converted);
  return v1Texts(spec).filter((t) => !hay.includes(JSON.stringify(t.trim()).slice(1, -1)));
}
