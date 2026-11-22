import { notFound } from "next/navigation";
import type { ActiveAttemptSession, ActiveTestQuestion } from "@/services/assessment.service";
import { MockTestPlayerClient } from "@/app/(site)/mock-tests/[id]/take/player-client";
import { NoGlassZone } from "@/components/ui/no-glass-zone";

/**
 * EXAM-UX-1 test fixture: the REAL exam player with a synthetic attempt, for the local page checks
 * (scripts/live/test_exam_ux1_pages.cjs). Safety (no production rows, ever):
 *   - a route only in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions) — never in a deployed build;
 *     and a 404 on a production deployment anyway (defence in depth)
 *   - no server read: the attempt below is made up (fake ids); the page checks fake every /api/assessment/* call, and the
 *     server would refuse a fake attempt id regardless (not the caller's attempt)
 * Query: ?remaining=<seconds> (default 3600) · ?answered=<n> answered questions to start with · ?long=1 a long passage first
 */
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "sec-gi", name: "General Intelligence & Reasoning", n: 25 },
  { id: "sec-ga", name: "General Awareness", n: 25 },
  { id: "sec-qa", name: "Quantitative Aptitude", n: 30 },
  { id: "sec-en", name: "English Comprehension", n: 25 },
];

const PASSAGE = Array.from({ length: 14 }, (_, i) =>
  `Paragraph ${i + 1}. The committee reviewed the long-term effects of the policy on rural employment, savings and access to credit, and noted that the outcomes varied by region, season and the size of the household. `,
).join("\n\n");

function questions(long: boolean, answered: number): ActiveTestQuestion[] {
  const out: ActiveTestQuestion[] = [];
  let order = 1;
  for (const s of SECTIONS) {
    for (let k = 0; k < s.n; k++) {
      const o = order++;
      out.push({
        mockQuestionId: `fx-q-${o}`,
        questionOrder: o,
        sectionId: s.id,
        sectionName: s.name,
        questionVersionId: `fx-v-${o}`,
        questionId: null,
        questionText: long && o === 1 ? `Read the passage and answer.\n\n${PASSAGE}\n\nWhich statement is best supported by the passage?` : `Fixture question ${o}: choose the correct option for this ${s.name.toLowerCase()} item.`,
        questionImageUrl: null,
        optionsType: "text",
        marks: 2,
        negativeMark: 0.5,
        options: ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key} for question ${o}` })),
        savedAnswer: o <= answered ? { selectedOption: "A", isMarkedForReview: false, timeSpentSeconds: 10 } : undefined,
      });
    }
  }
  return out;
}

export default async function ExamFixturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.VERCEL_ENV === "production" || process.env.EXAM_UX_FIXTURE !== "1") notFound();
  const sp = await searchParams;
  const num = (k: string, d: number) => {
    const v = Number(typeof sp[k] === "string" ? sp[k] : NaN);
    return Number.isFinite(v) && v >= 0 ? v : d;
  };
  const session: ActiveAttemptSession = {
    attemptId: "fx000000-0000-4000-8000-000000000000",
    testId: "fx-test",
    testTitle: "SSC CGL Tier 1 · Full Mock Test 3 (fixture — a long title that has to truncate with an ellipsis)",
    durationMinutes: 60,
    startedAt: new Date().toISOString(),
    remainingSeconds: num("remaining", 3600),
    sections: SECTIONS.map(({ id, name }) => ({ id, name })),
    questions: questions(sp.long === "1", num("answered", 0)),
    resumeOrder: 1,
    visitedOrders: [1],
  };
  return (
    <NoGlassZone>
      <MockTestPlayerClient session={session} />
    </NoGlassZone>
  );
}
