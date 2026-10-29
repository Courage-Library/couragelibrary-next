/**
 * ADMIN-IA-1 phase B: every admin address that moved, old → new. Pure (no React, no env): next.config.ts turns each
 * entry into a permanent (308) redirect, and the NAV-IA-1 gate checks that every retired address is here and that its
 * target is a real page. Exact paths only (the query string is kept by Next); never a prefix rule, so a new nested
 * route (e.g. /admin/exams/knowledge) can never be captured by an old parent's redirect.
 */
export const ADMIN_REDIRECTS: ReadonlyArray<{ from: string; to: string }> = [
  // CONTENT › Questions (tabs + the import action)
  { from: "/admin/questions/factory", to: "/admin/questions/drafts" },
  { from: "/admin/review/focus", to: "/admin/questions/review" },
  { from: "/admin/bulk-import", to: "/admin/questions/import" },
  // STUDENTS › Reports & support
  { from: "/admin/question-reports", to: "/admin/support/question-reports" },
  { from: "/admin/reports", to: "/admin/support/question-reports" },
  { from: "/admin/community", to: "/admin/support/flags" },
  // CONTENT › Lessons (the generator is the "New lesson" action; the legacy studio is a read-only tab)
  { from: "/admin/lessons/generate", to: "/admin/lessons/new" },
  { from: "/admin/content", to: "/admin/lessons/legacy" },
  { from: "/admin/content/topics", to: "/admin/lessons/legacy" },
  // EXAMS
  { from: "/admin/lessons/coverage", to: "/admin/coverage" },
  { from: "/admin/lessons/notes", to: "/admin/exams/notes" },
  { from: "/admin/exam-knowledge", to: "/admin/exams/knowledge" },
  { from: "/admin/schedules", to: "/admin/exams/cycles" },
  { from: "/admin/categories", to: "/admin/exams" },
  // CONTENT › Master tree
  { from: "/admin/taxonomy", to: "/admin/master-tree" },
  // TESTS › Mock tests
  { from: "/admin/patterns", to: "/admin/mock-tests/patterns" },
  { from: "/admin/sections", to: "/admin/mock-tests/sections" },
  { from: "/admin/mock-tests-management", to: "/admin/mock-tests" },
  // STUDENTS › Students
  { from: "/admin/users", to: "/admin/students" },
  { from: "/admin/pro-library", to: "/admin/students/library-pro" },
  // SETTINGS
  { from: "/admin/billing", to: "/admin/payments" },
  { from: "/admin/premium", to: "/admin/payments/premium" },
  { from: "/admin/settings", to: "/admin/system" },
  { from: "/admin/design-system", to: "/admin/system/design" },
  // retired (Q-D, 2026-10-29): the Descriptive CMS could not create anything; the feature is a future phase
  { from: "/admin/descriptive", to: "/admin" },
];
