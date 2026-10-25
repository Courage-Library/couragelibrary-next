/**
 * F1 (#75): copy for the exam home page /exams/[slug]. English only (#82): content language (guides, questions) follows
 * the user's preference where a Hindi version exists; the UI does not. No numbers here: every number on the page comes
 * from the database (#15 / #46), and anything not in the database reads NOT_PUBLISHED.
 */
export const NOT_PUBLISHED = "Not published yet";

export const EXAM_PAGE = {
  crumbs: { exams: "Exams" },
  conductedBy: (body: string) => `Conducted by ${body}`,
  cta: {
    signIn: "Sign in to start",
    startFree: "Start free",
    seePattern: "See the pattern",
    continue: (what: string) => `Continue: ${what}`,
    add: "Add to my exams",
    adding: "Adding…",
    added: "Added to your exams.",
    addFailed: "Could not add this exam right now. Please try again.",
    following: "You are preparing for this exam.",
    drills: "Mistake drills",
    syllabus: "Syllabus",
  },
  glance: {
    title: "At a glance",
    caption: (exam: string) => `${exam} exam pattern`,
    fact: "Fact",
    stage: "Stage",
    stages: "Stages",
    sections: "Sections",
    questions: "Questions",
    marks: "Marks",
    time: "Time",
    negative: "Negative marking",
    minutes: (n: string) => `${n} min`,
    negativePerWrong: (n: string) => `${n} per wrong answer`,
    noNegative: "None",
    onlyPublished: "Only the stages we have published are shown.",
  },
  cycle: {
    title: "Exam cycle",
    status: (year: number, status: string) => `Cycle ${year} · ${status}`,
    statusLabel: { active: "Active", upcoming: "Upcoming", closed: "Closed", completed: "Completed" } as Record<string, string>,
    next: (label: string, date: string) => `Next: ${label} on ${date}`,
    dateLabel: {
      notification: "notification",
      applicationStart: "applications open",
      applicationEnd: "last date to apply",
      examStart: "exam starts",
    },
    noDates: "No dates are published for this cycle yet.",
  },
  mocks: {
    title: "Mock tests",
    free: "Free",
    pro: "Pro",
    notStarted: "Not started",
    inProgress: "In progress",
    done: "Done",
    score: (score: string, max: string) => `Score ${score} / ${max}`,
    shape: (questions: string, minutes: string) => `${questions} questions · ${minutes} min`,
    fullLength: "Full-length",
    sectional: "Sectional",
    empty: "No mock tests are published for this exam yet.",
    signInForStatus: "Sign in to see your progress on each test.",
  },
  syllabus: {
    title: "Syllabus",
    summary: (topics: string, questions: string) => `${topics} topics · ${questions} practice questions`,
    show: "Show the full syllabus",
  },
  guides: {
    title: "Exam guides",
    asOf: (date: string) => `Information as of ${date}`,
    empty: "No exam guides are published for this exam yet.",
    sources: "Sources",
    groups: {
      about: "About & dates",
      eligibility: "Eligibility",
      pattern: "Pattern & syllabus",
      selection: "Selection & cut-offs",
      salary: "Posts & salary",
      preparation: "Preparation & FAQs",
    },
  },
  comingSoon: {
    badge: "Coming soon",
    mocks: "Mock tests for this exam are coming soon.",
    syllabus: "The syllabus for this exam is coming soon.",
    guides: "Exam guides for this exam are coming soon.",
  },
} as const;
