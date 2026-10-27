/**
 * CA-2: the SYLLABUS intake prompt (paste-in / paste-out, ruling 3). The owner copies it into an AI assistant together
 * with the official notification and pastes the strict JSON answer back into the wizard. Pure; English only (R9).
 * CA-4 moves prompt texts into DB prompt templates; until then this is the single source.
 */
import { INTAKE_CONTRACT_VERSION } from "@/lib/syllabus/intake-contract";
import { WEIGHTAGE_TIERS } from "@/lib/syllabus/import-contract";

export interface IntakePromptInput {
  examName: string;
  examSlug: string;
  cycleYear: number | null;
  tier: string | null;
  sourceUrl: string;
  asOf: string;
}

export function buildSyllabusIntakePrompt(i: IntakePromptInput): string {
  const example = {
    contract_version: INTAKE_CONTRACT_VERSION,
    exam: i.examSlug,
    cycle_year: i.cycleYear,
    tier: i.tier,
    source_url: i.sourceUrl,
    as_of: i.asOf,
    papers: [
      {
        name: "Paper name exactly as in the notification",
        marks: 200,
        questions: 100,
        subjects: [
          {
            name: "Quantitative Aptitude",
            name_hi: null,
            aliases: ["Numerical Aptitude"],
            questions: 25,
            weightage_tier: "CORE",
            topics: [
              {
                name: "Percentage",
                subtopics: [{ name: "Successive percentage change", concepts: [{ name: "Net change of two changes", headings: [] }] }],
              },
              { name: "Data Sufficiency", uncertain: true, uncertain_reason: "Listed in the 2024 notice only; not in this one." },
            ],
          },
        ],
      },
    ],
  };
  return [
    `You are helping build the official syllabus of the exam "${i.examName}"${i.cycleYear ? ` for the ${i.cycleYear} cycle` : ""}${i.tier ? `, ${i.tier}` : ""}.`,
    `Source: the official notification at ${i.sourceUrl} (as of ${i.asOf}). Use ONLY this source.`,
    "",
    "Rules:",
    "1. No invention. List only what the notification states. Do not add topics from memory or other exams.",
    "2. Structure: papers (stages / tiers / papers) → subjects → topics → subtopics → concepts. Leave a level out when the notification does not go that deep.",
    "3. Anything deeper than a concept goes into that concept's \"headings\" list, in order.",
    "4. Copy marks, number of questions and weightage only when the notification publishes them; otherwise leave them out.",
    `5. "weightage_tier", when published, is one of ${WEIGHTAGE_TIERS.join(", ")}.`,
    "6. Flag every item you are not sure about with \"uncertain\": true and a short \"uncertain_reason\".",
    "7. Use the names as printed. Put other common names of the same item in \"aliases\". Add \"name_hi\" only if the notification prints the Hindi name.",
    "8. Plain text only: no HTML, Markdown, links or emojis inside values.",
    `9. Answer with ONE strict JSON object (contract SYLLABUS_INTAKE v${INTAKE_CONTRACT_VERSION}) and nothing else: no prose, no code fences.`,
    `10. Keep "contract_version", "exam", "cycle_year", "tier", "source_url" and "as_of" exactly as in the example.`,
    "",
    "Example of the exact shape (replace the sample content with the notification's content):",
    JSON.stringify(example, null, 2),
  ].join("\n");
}
