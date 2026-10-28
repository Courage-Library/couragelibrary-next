/**
 * CA-4: DB prompt templates (prompt_templates) — pure rendering + checks, shared by the server and the admin screens.
 * A template body is plain text with {{NAME}} slots and optional {{#NAME}}…{{/NAME}} sections (kept only when NAME has a
 * non-empty value; SYLLABUS-PROMPT-2). Each template type has a FIXED set of placeholders. Rendering refuses an unknown
 * or missing placeholder (a template edit can never silently drop the exam context). Values are inserted verbatim (they
 * are built by the server from the DB, never from the pasted AI answer). The SQL twin is fn_prompt_template_problems.
 */

export const TEMPLATE_TYPES = ["SYLLABUS", "LESSON", "QUESTION", "TRANSLATE_HI"] as const;
export type TemplateType = (typeof TEMPLATE_TYPES)[number];

/** LESSON-PROMPT-2: the subject-type sections ({{#APTITUDE}}…{{/APTITUDE}}); exactly one is true when rendering. */
export const SUBJECT_TYPE_SECTIONS = ["APTITUDE", "REASONING", "LANGUAGE", "GK_GA", "TECHNICAL", "PEDAGOGY"] as const;

/**
 * The placeholders each type may use; every "required" one must appear, and at least one of each "requiredAny" group
 * (LESSON-PROMPT-2: v2 names EXAM_LINES / EXAMPLE_FOR_SUBJECT_TYPE beside the v1 names, so a retired v1 stays valid).
 */
export const TEMPLATE_PLACEHOLDERS: Record<TemplateType, { allowed: readonly string[]; required: readonly string[]; requiredAny?: readonly (readonly string[])[] }> = {
  SYLLABUS: {
    allowed: ["EXAM_NAME", "EXAM_SLUG", "CYCLE", "TIER", "TIER_JSON"],
    required: ["EXAM_NAME", "EXAM_SLUG", "CYCLE", "TIER_JSON"],
  },
  LESSON: {
    allowed: [
      "NODE_NAME", "NODE_PATH", "NODE_LEVEL", "SUBJECT_NAME", "SUBJECT_TYPE", "EXAM_COVERAGE", "CHILD_NODES", "ALIASES", "EXISTING_LESSONS", "BLOCK_SPEC",
      "EXAMPLE_JSON", "MIN_EXAMPLES", "MAX_EXAMPLES", "MIN_QUICK_CHECKS",
      // LESSON-PROMPT-2 (v2)
      "CHILDREN", "EXAM_LINES", "EXAMPLE_FOR_SUBJECT_TYPE", ...SUBJECT_TYPE_SECTIONS,
    ],
    required: ["NODE_NAME", "NODE_PATH", "BLOCK_SPEC"],
    requiredAny: [["EXAM_COVERAGE", "EXAM_LINES"], ["EXAMPLE_JSON", "EXAMPLE_FOR_SUBJECT_TYPE"]],
  },
  QUESTION: { allowed: ["TOPIC_NAME", "TOPIC_PATH", "EXAM_COVERAGE", "QUESTION_SPEC", "COUNT"], required: ["TOPIC_NAME", "QUESTION_SPEC"] },
  TRANSLATE_HI: {
    allowed: ["LESSON_TITLE", "GLOSSARY", "EN_JSON", "BLOCK_RULES"],
    required: ["GLOSSARY", "EN_JSON", "BLOCK_RULES"],
  },
};

export const TEMPLATE_BODY_MAX = 20000;
export const TEMPLATE_NOTES_MAX = 500;
const SLOT_RE = /\{\{([#/]?)([A-Za-z_]+)\}\}/g;

/** Every placeholder name used (slots and section names). */
export function templateSlots(body: string): string[] {
  return [...new Set([...body.matchAll(SLOT_RE)].map((m) => m[2]))];
}

/** Problems with a template body for its type: [] = savable. */
export function templateProblems(type: TemplateType, body: string): string[] {
  const p: string[] = [];
  if (typeof body !== "string" || !body.trim()) return ["The template is empty."];
  if (body.length > TEMPLATE_BODY_MAX) p.push(`At most ${TEMPLATE_BODY_MAX} characters.`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body)) p.push("Control characters are not allowed.");
  const spec = TEMPLATE_PLACEHOLDERS[type];
  const slots = templateSlots(body);
  for (const s of slots) if (!spec.allowed.includes(s)) p.push(`Unknown placeholder {{${s}}} for ${type}.`);
  for (const r of spec.required) if (!slots.includes(r)) p.push(`Required placeholder {{${r}}} is missing.`);
  for (const g of spec.requiredAny ?? []) if (!g.some((x) => slots.includes(x))) p.push(`One of ${g.map((x) => `{{${x}}}`).join(" / ")} is required.`);
  // sections: balanced, not nested
  let open: string | null = null;
  for (const m of body.matchAll(SLOT_RE)) {
    if (m[1] === "#") {
      if (open) p.push(`Section {{#${m[2]}}} is inside {{#${open}}} (no nesting).`);
      open = m[2];
    } else if (m[1] === "/") {
      if (open !== m[2]) p.push(`{{/${m[2]}}} closes nothing.`);
      open = null;
    }
  }
  if (open) p.push(`Section {{#${open}}} is not closed.`);
  return p;
}

/** Renders a body; throws on an invalid template or a missing value (never silently empty). */
export function renderTemplate(type: TemplateType, body: string, values: Record<string, string>): string {
  const problems = templateProblems(type, body);
  if (problems.length) throw new Error(`Template ${type} is not valid: ${problems.join(" ")}`);
  const value = (name: string) => {
    const v = values[name];
    if (typeof v !== "string") throw new Error(`No value for {{${name}}}.`);
    return v;
  };
  const withSections = body.replace(/\{\{#([A-Za-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, name: string, inner: string) => (value(name) !== "" ? inner : ""));
  return withSections.replace(SLOT_RE, (_, kind: string, name: string) => (kind ? "" : value(name)));
}
