import { notFound } from "next/navigation";
import type { TestResultSummary } from "@/services/assessment.service";
import { ResultViewClient } from "@/components/assessment/result-view-client";
import { StudentShell } from "@/components/nav/student-shell";
import { NoGlassZone } from "@/components/ui/no-glass-zone";
import { StudentFooter } from "@/components/footer/student-footer";
import { navLabels } from "@/content/nav/labels";
import { trendGroup, type TrendSource } from "@/lib/assessment/result-ux";

/**
 * RESULT-UX-1 test fixture: the REAL result view inside THE student shell, with a made-up attempt, for the local page
 * checks (scripts/live/test_result_ux1_pages.cjs). Safety (no production data, ever):
 *   - a route only in a build made with EXAM_UX_FIXTURE=1 (next.config pageExtensions) — never in a deployed build;
 *     and a 404 on a production deployment anyway (defence in depth)
 *   - no session, no server read: every value below is synthetic (fake ids, fake student "Fixture Student")
 * Query: ?first=1 first attempt (no delta / trend / past attempts) · ?nowrong=1 no wrong answers · ?standing=1 a rank
 */
export const dynamic = "force-dynamic";

const SECTIONS = [
  { name: "Reasoning", topics: ["Syllogism", "Coding-Decoding", "Series"] },
  { name: "General Awareness", topics: ["Modern History", "Polity", "Geography"] },
  { name: "Quant", topics: ["Number System", "Average", "Time and Work"] },
  { name: "English", topics: ["Grammar", "Vocabulary", "Comprehension"] },
];
const TOPIC_ID = (s: number, t: number) => `fx000000-0000-4000-8000-0000000${s}${t}0`;

type Q = TestResultSummary["reviewQuestions"][number];

function questions(noWrong: boolean): Q[] {
  const out: Q[] = [];
  let order = 0;
  SECTIONS.forEach((sec, s) => {
    for (let k = 0; k < 25; k++) {
      order++;
      const t = k % 3;
      // deterministic pattern: Quant weak + slow, Reasoning mixed, GA skips, English strong
      const r = (order * 37) % 100;
      const skipped = sec.name === "General Awareness" ? r < 30 : r < 8;
      const correct = !skipped && (noWrong || (sec.name === "Quant" ? r < 45 : sec.name === "English" ? r < 85 : r < 65));
      const selected = skipped ? null : correct ? "C" : "B";
      out.push({
        mockQuestionId: `fx-mq-${order}`,
        questionId: `fx000000-0000-4000-8000-${String(order).padStart(12, "0")}`,
        questionVersionId: `fx000000-0000-4000-9000-${String(order).padStart(12, "0")}`,
        questionOrder: order,
        sectionName: sec.name,
        topicId: TOPIC_ID(s, t),
        marks: 2,
        isMarked: false,
        questionText:
          sec.name === "Quant" && t === 0
            ? `Fixture question ${order}: the sum of three consecutive even numbers is ${60 + order}. What is the largest of them?`
            : `Fixture question ${order}: choose the correct option for this ${sec.topics[t].toLowerCase()} item. A longer stem so that the collapsed row has to truncate its one line of text.`,
        questionImageUrl: null,
        optionsType: "text",
        options: ["A", "B", "C", "D"].map((key) => ({ key, text: `Option ${key} for question ${order}` })),
        selectedOption: selected,
        correctOption: "C",
        isCorrect: correct,
        marksAwarded: skipped ? 0 : correct ? 2 : -0.5,
        explanation: `Worked solution for question ${order}: option C follows from the rule for ${sec.topics[t].toLowerCase()}.`,
        topicName: sec.topics[t],
        topicSlug: null,
        timeSpentSeconds: skipped ? undefined : sec.name === "Quant" ? 90 + (order % 40) : 20 + (order % 25),
        learningSlug: t !== 2 ? `fixture-${sec.topics[t].toLowerCase().replace(/[^a-z]+/g, "-")}` : null,
        learningDocTitle: null,
        hasPublishedLearning: t !== 2,
        correction: null,
      });
    }
  });
  return out;
}

export default async function ResultFixturePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.VERCEL_ENV === "production" || process.env.EXAM_UX_FIXTURE !== "1") notFound();
  const sp = await searchParams;
  const qs = questions(sp.nowrong === "1");
  const correct = qs.filter((q) => q.selectedOption !== null && q.isCorrect).length;
  const wrong = qs.filter((q) => q.selectedOption !== null && !q.isCorrect).length;
  const skipped = qs.filter((q) => q.selectedOption === null).length;
  const total = correct * 2 - wrong * 0.5;
  const rows: TrendSource[] = [
    ["fx-a1", "2026-10-02T14:00:00Z", 58],
    ["fx-a2", "2026-10-16T14:00:00Z", 64.5],
    ["fx-a3", "2026-11-01T14:00:00Z", 71.5],
    ["fx-x50", "2026-11-05T14:00:00Z", 30, 50],
    ["fx-cur", "2026-11-23T14:12:00Z", total],
  ].map(([id, at, score, max]) => ({
    attemptId: String(id),
    status: "submitted",
    examId: "fx-exam",
    examTitle: "SSC CGL",
    mockTestId: `fx-mock-${id}`,
    mockTitle: id === "fx-cur" ? "Full Mock 3" : `Full Mock (fixture ${id})`,
    mockKind: "full_mock",
    submittedAt: String(at),
    score: Number(score),
    maxScore: Number(max ?? 200),
    accuracy: 60,
  }));
  const group = trendGroup(sp.first === "1" ? rows.filter((r) => r.attemptId === "fx-cur") : rows, "fx-cur");
  const sectionRows = SECTIONS.map((sec, s) => {
    const sq = qs.filter((q) => q.sectionName === sec.name);
    const att = sq.filter((q) => q.selectedOption !== null);
    const ok = att.filter((q) => q.isCorrect).length;
    return {
      id: `fx-sec-${s}`,
      sectionName: sec.name,
      totalQuestions: sq.length,
      attemptedCount: att.length,
      correctCount: ok,
      incorrectCount: att.length - ok,
      unansweredCount: sq.length - att.length,
      sectionScore: ok * 2 - (att.length - ok) * 0.5,
      maxScore: 50,
      accuracyPercentage: att.length ? Number(((ok / att.length) * 100).toFixed(2)) : 0,
      timeSpentSeconds: sq.reduce((a, q) => a + (q.timeSpentSeconds ?? 0), 0),
      durationMinutes: null,
    };
  });
  const data: TestResultSummary = {
    result: {
      id: "fx-result",
      attemptId: "fx-cur",
      totalQuestions: qs.length,
      attemptedCount: correct + wrong,
      correctCount: correct,
      incorrectCount: wrong,
      unansweredCount: skipped,
      totalScore: total,
      maxScore: 200,
      accuracyPercentage: Number(((correct / Math.max(1, correct + wrong)) * 100).toFixed(2)),
      timeSpentSeconds: 3490,
      rank: null,
      percentile: null,
    },
    test: { id: "fx-mock-fx-cur", title: "SSC CGL Tier 1 · Full Mock 3", durationMinutes: 60, totalQuestions: 100, totalMarks: 200 },
    standing: sp.standing === "1" ? { rank: 12, percentile: 81, n: 64 } : null,
    security: { candidateId: "fx-user", maskedId: "CL••••FX00", attemptIdShort: "FX0000", examTitle: "SSC CGL", timestamp: "23 Nov 2026, 7:42 pm" },
    rewards: { completionCoins: 0, completionReason: "", isAccuracyEligible: false, minAttemptRequired: 0, accuracyPercentage: 0, accuracyBonusCoins: 0, accuracyReason: "", streakCoins: 0, streakReason: "", currentStreak: 0, totalCoinsEarned: 0 },
    insights: { strongestSection: null, weakestSection: null, accuracyLevel: "", speedSecondsPerQuestion: 0, reviewCount: wrong },
    analysis: {
      negativeMarksLost: wrong * 0.5,
      takeaways: [],
      trend: null,
      examSlug: "ssc-cgl",
      memoryLockEnabled: true,
      trendGroup: group,
      practiceTopicIds: [TOPIC_ID(2, 0), TOPIC_ID(2, 1), TOPIC_ID(0, 0)],
      practiceEnabled: true,
    },
    sections: sectionRows,
    reviewQuestions: qs,
  };
  return (
    <StudentShell
      t={navLabels("en")}
      account={{ name: "Fixture Student", isStaff: false }}
      flags={{ practice: true, payments: false }}
      paywall={Promise.resolve(false)}
      pathname="/mock-tests/fx-cur/result"
      lessonCoins={false}
      studyPreferencesLabel="Study preferences"
      footer={<StudentFooter />}
    >
      <NoGlassZone>
        <ResultViewClient data={data} />
      </NoGlassZone>
    </StudentShell>
  );
}
