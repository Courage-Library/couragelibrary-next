/**
 * CA-7 dashboard "next step" (design I + STUDENT-DASH-1) — pure; real state only (R12), one primary (R4).
 *   continue  (first) the newest lesson the student is READING — preferring one in a LIVE exam course (design I: "the newest
 *             progress row in the student's launched exam course"); else the newest READING lesson anywhere
 *   guide     nothing to continue and no finished mock yet (a new student): pick an exam → take the first free mock → see the Mistake
 *             Vault fill up; each step's "done" is read from their data; the primary goes to the first open step
 *   null      nothing to suggest (the regular dashboard cards carry on)
 */
export interface ProgressInput {
  documentId: string;
  title: string;
  href: string;
  status: "READING" | "COMPLETED" | string;
  updatedAt: string;
  inLiveCourse: boolean;
}

export interface NextStepState {
  progress: ProgressInput[];
  pickedExam: boolean;
  submittedMock: boolean;
  mistakes: number;
}

export interface GuideStep {
  key: "exam" | "mock" | "vault";
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

export type NextStep =
  | { kind: "continue"; title: string; href: string; inLiveCourse: boolean }
  | { kind: "guide"; steps: GuideStep[]; primary: GuideStep }
  | null;

export function decideNextStep(s: NextStepState): NextStep {
  const reading = s.progress.filter((p) => p.status === "READING").sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  const pick = reading.find((p) => p.inLiveCourse) ?? reading[0];
  if (pick) return { kind: "continue", title: pick.title, href: pick.href, inLiveCourse: pick.inLiveCourse };
  if (s.submittedMock) return null;
  const steps: GuideStep[] = [
    { key: "exam", label: "Pick your exam", detail: "Your dashboard, mocks and lessons follow it.", href: "/onboarding", done: s.pickedExam },
    { key: "mock", label: "Take your first free mock", detail: "A full test under exam conditions.", href: "/mock-tests", done: false },
    { key: "vault", label: "See your Mistake Vault fill up", detail: "Every wrong answer becomes revision.", href: "/mistakes", done: s.mistakes > 0 },
  ];
  return { kind: "guide", steps, primary: steps.find((x) => !x.done) ?? steps[1] };
}
