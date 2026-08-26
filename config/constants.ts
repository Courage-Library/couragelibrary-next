export const EXAM_VERTICALS = [
  { id: "ssc", name: "Staff Selection Commission (SSC)", slug: "ssc" },
  { id: "defence", name: "Defence & Armed Forces", slug: "defence" },
  { id: "railway", name: "Railway Recruitment Boards (RRB)", slug: "railway" },
  { id: "banking", name: "Banking & Insurance", slug: "banking" },
  { id: "police", name: "State & Central Police", slug: "police" },
  { id: "teaching", name: "Teaching & TET", slug: "teaching" },
  { id: "state-psc", name: "State Public Service Commissions", slug: "state-psc" },
] as const;

export const PREPARATION_PILLARS = [
  {
    title: "Exam Intelligence",
    description: "Real-time readiness analytics, syllabus coverage, and targeted revision queues.",
    icon: "Brain",
  },
  {
    title: "Canonical Knowledge",
    description: "Shared syllabus architecture linking subjects, topics, and multi-exam resources.",
    icon: "BookOpen",
  },
  {
    title: "Adaptive Mocks",
    description: "Server-evaluated mock examinations with precision percentile analytics.",
    icon: "Target",
  },
  {
    title: "Disciplined Practice",
    description: "Daily goal tracking, streak incentives, and structured gamification milestones.",
    icon: "Flame",
  },
] as const;

export const SUPPORTED_LANGUAGES = ["english", "hindi", "both"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
