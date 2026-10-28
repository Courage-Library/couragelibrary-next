/**
 * CA-2 / SYLLABUS-PROMPT-2: the SYLLABUS intake prompt (paste-in / paste-out). The owner copies it into an AI assistant
 * and pastes the strict JSON answer (contract SYLLABUS_INTAKE v3) back into the wizard. Pure; safe in client components.
 * CA-4: the text is the SYLLABUS prompt template (prompt_templates; v1 = SYLLABUS_TEMPLATE_V1, the owner-approved text
 * verbatim); the server passes the ACTIVE version's body, this module fills the placeholders and renders it.
 */
import { renderTemplate } from "@/lib/prompts/template";

export interface IntakePromptInput {
  examName: string;
  examSlug: string;
  cycleYear: number;
  tier: string | null;
}

/** SYLLABUS-CONTRACT-3.1: the master tree's current topic names per subject (active, not internal) — reuse hints. */
export interface PreferredNames {
  subject: string;
  topics: string[];
}

export const PREFERRED_NAMES_HEADING = "PREFERRED NAMES (the existing master tree — reuse these exact names when equivalent):";

/** The compact block appended after the rendered template (one line per subject). Empty input → nothing. */
export function preferredNamesBlock(names: PreferredNames[]): string {
  const lines = names.filter((n) => n.topics.length > 0).map((n) => `${n.subject}: ${n.topics.join(", ")}`);
  return lines.length ? `\n\n${PREFERRED_NAMES_HEADING}\n${lines.join("\n")}` : "";
}

/** The values the server fills into a SYLLABUS template ({{#TIER}} sections render only when a tier is set). */
export function syllabusPromptValues(i: IntakePromptInput): Record<string, string> {
  return {
    EXAM_NAME: i.examName,
    EXAM_SLUG: i.examSlug,
    CYCLE: String(i.cycleYear),
    TIER: i.tier || "",
    TIER_JSON: i.tier ? JSON.stringify(i.tier) : "null",
  };
}

export function buildSyllabusIntakePrompt(i: IntakePromptInput, body: string = SYLLABUS_TEMPLATE_V1, preferred: PreferredNames[] = []): string {
  // SYLLABUS-CONTRACT-3.1: the preferred names are appended (the template keeps its placeholders; v2 points to this block)
  return renderTemplate("SYLLABUS", body, syllabusPromptValues(i)) + preferredNamesBlock(preferred);
}

/**
 * SYLLABUS template v1 — the owner-approved prompt (SYLLABUS-PROMPT-2), VERBATIM. Seeded into prompt_templates by
 * migration 119; the gates prove the seeded body equals this constant byte for byte. Later versions: /admin/prompts.
 */
export const SYLLABUS_TEMPLATE_V1 = `You are an expert on Indian government competitive exams and a senior syllabus designer for a coaching platform.

TASK: Build the COMPLETE, CURRENT syllabus of "{{EXAM_NAME}}"{{#TIER}} — {{TIER}}{{/TIER}} for the {{CYCLE}} cycle, as a
4-level teaching tree that a student can study from start to finish and cover 100% of what is asked in this exam.

HOW TO BUILD IT
1. Start from the LATEST official syllabus and exam pattern you know (if you can browse, check the latest official
   notification first). Say which notification/year it is based on in "based_on".
2. Cover EVERY stage/tier/paper of the exam{{#TIER}} — only {{TIER}}{{/TIER}}. For each: sections/subjects, number of questions,
   marks, time, negative marking (as currently applicable).
3. For EVERY subject list ALL topics — the officially named ones AND every topic actually asked in the last 5–10 years of
   previous papers, even if the official text doesn't name it.
4. Break EVERY topic into subtopics, and every subtopic into concepts, deep enough to teach and to classify any question
   asked in this exam. Example: Percentage → Successive percentage change → Net change of two changes.
   Go deeper than the official syllabus — that is the point. Anything deeper than a concept goes in "headings".
5. Mark the origin of EVERY topic, subtopic and concept:
   "OFFICIAL" = named in the official syllabus · "PYQ_TREND" = not named officially but regularly asked in previous papers ·
   "EXPANDED" = a teaching breakdown needed for complete understanding.
6. Weightage per topic from recent papers: "weightage_tier" = HIGH_YIELD (asked almost every paper, many questions) · CORE ·
   MODERATE · LOW · OPTIONAL (rare). Add "avg_questions" when you can estimate it.
7. Names: use the standard names used in Indian exam preparation (e.g. "Time and Work", "Profit and Loss",
   "Simple Interest"). Singular, consistent, Title Case, no numbering. Put other common names in "aliases"
   (e.g. "BODMAS" for Simplification). Add "name_hi" with the standard Hindi name used in Hindi-medium preparation.
8. Accuracy: never invent exam-pattern numbers. If you are not sure of any fact (pattern, a topic's inclusion, weightage),
   set "uncertain": true with a short "uncertain_reason". Better flagged than wrong.
9. Plain text only in values (no HTML, Markdown, links, emojis).

SELF-CHECK BEFORE ANSWERING (silently): no duplicate topics/subtopics within a subject; every topic has subtopics unless it is
truly atomic; nothing from a different exam; the pattern numbers add up; all origins and weightage tiers set.

OUTPUT: ONE strict JSON object, nothing else — no prose, no code fences. Exactly this shape (contract SYLLABUS_INTAKE v3):
{
  "contract_version": 3,
  "exam": "{{EXAM_SLUG}}",
  "cycle_year": {{CYCLE}},
  "tier": {{TIER_JSON}},
  "based_on": "e.g. SSC CGL 2025 official notification + PYQs 2016–2025",
  "papers": [
    {
      "name": "Tier 1",
      "questions": 100, "marks": 200, "duration_minutes": 60, "negative_marking": "0.50 per wrong answer",
      "subjects": [
        {
          "name": "Quantitative Aptitude", "name_hi": "मात्रात्मक योग्यता", "aliases": ["Numerical Aptitude"],
          "questions": 25,
          "topics": [
            {
              "name": "Percentage", "name_hi": "प्रतिशत", "origin": "OFFICIAL",
              "weightage_tier": "HIGH_YIELD", "avg_questions": 2,
              "subtopics": [
                {
                  "name": "Successive Percentage Change", "origin": "PYQ_TREND",
                  "concepts": [ { "name": "Net Change of Two Changes", "origin": "EXPANDED", "headings": [] } ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;
