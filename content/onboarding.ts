/**
 * F0 onboarding (decision #76) — every user-facing string. UX-LANG-1 (R9, #82): the website UI is plain English only;
 * the language step sets the CONTENT language (questions and guides, where a Hindi version exists), not the UI.
 * Respectful, no urgency, no shame (R11); no numbers beyond the user's own choices.
 */
export const ONBOARDING_COPY = {
  pageTitle: "Set up your preparation",
  intro: "Four short questions. You can skip any of them and change them later.",
  progress: (n: number, total: number) => `Step ${n} of ${total}`,
  next: "Next",
  back: "Back",
  skipStep: "Skip this question",
  skipAll: "Skip for now",
  finish: "Show my plan",
  saving: "Saving…",
  error: "We couldn't save that. Please try again.",
  steps: {
    language: {
      title: "Which language do you prefer for questions and guides?",
      note: "Questions and guides use this language where a Hindi version exists. The website itself is in English.",
      options: {
        hi: "Hindi",
        en: "English",
        hinglish: "Hinglish",
      },
    },
    exams: {
      title: "Which exam are you preparing for?",
      note: "Choose up to 3 exams.",
      max: "You have chosen 3 exams.",
      none: "No exam is available yet. Please skip this question.",
      existing: "Your current goals are already ticked. Untick one only if you want to remove it.",
    },
    timing: {
      title: "When is your exam?",
      known: "I know the exam date",
      unknown: "Not sure yet",
      dateLabel: "Exam date",
      datePast: "The date must be today or later.",
      attemptTitle: "Which attempt is this?",
      attempts: {
        first: "First",
        second: "Second",
        third_plus: "Third or more",
      },
    },
    time: {
      title: "How much time can you give each day?",
      minutes: (m: number) => (m >= 90 ? "90+ minutes" : `${m} minutes`),
    },
  },
  plan: {
    title: "Your plan",
    daily: (n: number) => `Daily: 10 questions + 1 practice set of ${n} questions`,
    from: (section: string, exam: string) => `From ${exam}'s first syllabus section: ${section}`,
    fromExam: (exam: string) => `From ${exam}`,
    noExam: "No exam chosen. You can browse all exams.",
    start: "Start today's practice",
    openExam: (exam: string) => `Open ${exam}`,
    browseExams: "Browse exams",
    practiceNotReady: "Practice sets for this exam are not ready yet. Until then, use the exam page for free mock tests and the syllabus.",
    later: "Go to dashboard",
    removed: (names: string) => `Removed from your goals: ${names}`,
    edit: "Change answers",
    diagnostic: "Take a 10-question diagnostic",
  },
  dashboardCard: {
    title: "Set up your preparation",
    text: "Four short questions for a simple daily plan.",
    cta: "Set up",
    dismiss: "Dismiss",
  },
  menuLink: "Study preferences",
} as const;
