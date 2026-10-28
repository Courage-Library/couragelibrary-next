/**
 * INTAKE-CONCEPTS-AS-OUTLINE (architect ruling 2026-10-28): SYLLABUS prompt template v3 — v2 with the default depth
 * subject → topic → subtopic; a subtopic's concepts are its "outline" (contract 3.2: kept as the lesson's MUST COVER
 * lines, never created as master-tree nodes unless the owner promotes one). Same five placeholders as v1 / v2, so the
 * database's template checker accepts it; the PREFERRED NAMES block is still appended by buildSyllabusIntakePrompt.
 * Saved as a new DRAFT and activated through the audited RPCs (scripts/content/syllabus-prompt-32.cjs).
 */
export const SYLLABUS_TEMPLATE_V3 = `You are an expert on Indian government competitive exams and a senior syllabus designer for a coaching platform.

TASK: Build the COMPLETE, CURRENT syllabus of "{{EXAM_NAME}}"{{#TIER}} — {{TIER}}{{/TIER}} for the {{CYCLE}} cycle, as a
teaching tree (subject → topic → subtopic, each subtopic with its lesson outline) that a student can study from start to
finish and cover 100% of what is asked in this exam.

HOW TO BUILD IT
1. Start from the LATEST official syllabus and exam pattern you know (if you can browse, check the latest official
   notification first). Say which notification/year it is based on in "based_on". Only cite a notification you are
   confident exists; otherwise set "uncertain": true on the paper and explain in its "uncertain_reason".
2. Cover EVERY stage/tier/paper of the exam{{#TIER}} — only {{TIER}}{{/TIER}}. For each: sections/subjects, number of questions,
   marks, time, negative marking (as currently applicable). Put "duration_minutes" / "negative_marking" on a SUBJECT only
   if the official pattern has sectional timing / a different marking for that subject; otherwise give them at the paper
   level only.
3. For EVERY subject list ALL topics — the officially named ones AND every topic actually asked in the last 5–10 years of
   previous papers, even if the official text doesn't name it.
4. Break EVERY topic into subtopics, deep enough to teach and to classify any question asked in this exam. Do NOT create
   concept objects: give each subtopic an "outline" — the ordered list (at most 30 short lines) of the concepts its
   lesson must cover. Example: Percentage → Successive Percentage Change → outline ["Net change of two changes", …].
   Go deeper than the official syllabus — that is the point.
5. Mark the origin of EVERY topic and subtopic:
   "OFFICIAL" = named in the official syllabus · "PYQ_TREND" = not named officially but regularly asked in previous papers ·
   "EXPANDED" = a teaching breakdown needed for complete understanding.
6. Weightage per topic from recent papers: "weightage_tier" = HIGH_YIELD (asked almost every paper, many questions) · CORE ·
   MODERATE · LOW · OPTIONAL (rare). Add "avg_questions" when you can estimate it.
7. Names: prefer the existing master-tree names in "PREFERRED NAMES" at the end of this prompt whenever your item is the
   same thing (reuse the exact spelling). Otherwise use the standard names used in Indian exam preparation (e.g. "Time and
   Work", "Profit and Loss", "Simple Interest"). Singular, consistent, Title Case, no numbering. Put other common names in
   "aliases" (e.g. "BODMAS" for Simplification). Add "name_hi" with the standard Hindi name used in Hindi-medium preparation.
8. Accuracy: never invent exam-pattern numbers. If you are not sure of any fact (pattern, a topic's inclusion, weightage),
   set "uncertain": true with a short "uncertain_reason". Better flagged than wrong.
9. Plain text only in values (no HTML, Markdown, links, emojis).

SELF-CHECK BEFORE ANSWERING (silently): no duplicate topics/subtopics within a subject; every topic has subtopics unless it is
truly atomic; every subtopic has an outline and no "concepts"; nothing from a different exam; the pattern numbers add up (subject marks / timings sum to the paper's when
given); all origins and weightage tiers set.

OPTIONAL KEYS (leave out what you do not know): paper — "uncertain", "uncertain_reason" · subject — "marks",
"duration_minutes", "negative_marking" (sectional patterns only), "aliases" · topic / subtopic — "aliases" · subtopic —
"outline".

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
      "uncertain": false,
      "subjects": [
        {
          "name": "Quantitative Aptitude", "name_hi": "मात्रात्मक योग्यता", "aliases": ["Numerical Aptitude"],
          "questions": 25, "marks": 50,
          "topics": [
            {
              "name": "Percentage", "name_hi": "प्रतिशत", "aliases": ["Percentages"], "origin": "OFFICIAL",
              "weightage_tier": "HIGH_YIELD", "avg_questions": 2,
              "subtopics": [
                {
                  "name": "Successive Percentage Change", "origin": "PYQ_TREND",
                  "outline": ["Net Change of Two Changes", "Successive Discounts", "Population Growth over Years"]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;
