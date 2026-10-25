/**
 * "Memory Lock" — brand term for spaced revision (F5 Revision Engine). Always written exactly "Memory Lock"
 * (capital M and L): import MEMORY_LOCK.name instead of retyping it (scripts/test_f2_practice.cjs T-13 checks).
 * Plain English UI (R9); feedback about the task, never the person; no streak shaming, no fake urgency (R3, R11).
 */
export const MEMORY_LOCK = {
  name: "Memory Lock",
  tagline: "Spaced revision, right on time",
  comingSoon: "Coming soon",
  dueToday: (n: number, topics: number) =>
    n === 0 ? "Nothing due today" : `Due today: ${n} ${n === 1 ? "question" : "questions"} from ${topics} ${topics === 1 ? "topic" : "topics"}`,
  dueLead: "Questions you got wrong come back on a schedule — 1, 3, 7, 14 and 30 days — until you answer them right on different days.",
  moreDue: (n: number) => `${n} more ${n === 1 ? "is" : "are"} due; they wait for your next session.`,
  start: "Start",
  nothingDue: "Nothing is due today. Wrong answers from practice and mocks are added here automatically.",
  empty: "Your Memory Lock is empty. Wrong answers from practice and mock tests are added here automatically.",
  practiceCta: "Practice a topic",
  meterTitle: "Locked",
  meter: (locked: number, total: number) => `${locked} of ${total} ${total === 1 ? "question" : "questions"} locked`,
  meterHelp: "A question is locked when you answer it right on at least two different days and its next review is a week or more away.",
  upcomingTitle: "Next 7 days",
  upcomingNone: "Nothing due in the next 7 days.",
  sessionTitle: "Memory Lock review",
  back: "Back to Memory Lock",
  done: "Review complete",
  add: "Add to Memory Lock",
  added: "Added to Memory Lock",
  addResults: {
    ADDED: "Added to Memory Lock",
    ALREADY_ADDED: "Already in Memory Lock",
    RATE_LIMITED: "You have added many questions today. Try again tomorrow.",
    NOT_SIGNED_IN: "Sign in to use Memory Lock.",
    NOT_FOUND: "This question cannot be added.",
    FAILED: "Could not add this question. Please try again.",
  } as Record<string, string>,
  errors: {
    NOT_IN_MEMORY_LOCK: "This question is no longer in your Memory Lock. Skip to the next one.",
  } as Record<string, string>,
} as const;
