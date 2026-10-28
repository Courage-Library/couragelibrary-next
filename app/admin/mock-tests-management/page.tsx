import React from "react";
import Link from "next/link";
import { AdminService } from "@/services/admin.service";
import { StudioPageHeader, StudioPanel, StudioStatStrip, studioPrimaryAction, studioQuietAction } from "@/components/admin/studio/studio-page";
import { requireAdminPage } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

export const revalidate = 0;

/**
 * Courage Studio phase 3 batch 2 — the mock-test setup overview on the Studio template: ONE primary (Bulk import, as
 * before), a stat strip of the real counts ("–" when a count could not be read, never a made-up 0 — R12), the content
 * hierarchy as a plain ordered list, and every module as a row with one link.
 */
export default async function AdminMockTestsManagementPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/mock-tests-management" });
  const [categories, patterns, sections, questionsCountRes, schedules, mockTests] = await Promise.all([
    AdminService.getAdminCategories(),
    AdminService.getAdminPatterns(),
    AdminService.getAdminSections(),
    AdminService.getQuestionsCount(),
    AdminService.getAdminSchedules(),
    AdminService.getAdminMockTests(),
  ]);
  const questions = typeof questionsCountRes === "number" ? questionsCountRes : null;

  const modules = [
    { title: "Categories", description: "The exams and their conducting boards.", href: "/admin/categories", action: "Open categories" },
    { title: "Patterns", description: "Each exam stage: duration, questions, marks and negative marking.", href: "/admin/patterns", action: "Open patterns" },
    { title: "Sections", description: "The subject divisions of a pattern and how many questions each needs.", href: "/admin/sections", action: "Open sections" },
    { title: "Question bank", description: "Questions with their answer keys (kept on the server) and previous-year sources.", href: "/admin/questions", action: "Open the question bank" },
    { title: "Schedules", description: "Notification, application and exam dates per cycle.", href: "/admin/schedules", action: "Open schedules" },
    { title: "Mock tests", description: "Full-length papers; publish one to make it available to students.", href: "/admin/mock-tests", action: "Open mock tests" },
    { title: "Bulk import", description: "A two-step, validated import that keeps category → pattern → section intact.", href: "/admin/bulk-import", action: "Open bulk import" },
  ];

  return (
    <div className="space-y-4 pb-8">
      <StudioPageHeader
        title="Mock test setup"
        description="Everything a mock test is built from, in the order it depends on: category, pattern, section, questions, then the paper."
        primary={
          <Link href="/admin/bulk-import" className={studioPrimaryAction}>
            Bulk import
          </Link>
        }
        actions={
          <Link href="/admin/mock-tests" className={studioQuietAction}>
            Mock tests
          </Link>
        }
      />

      <StudioStatStrip
        label="Content counts"
        stats={[
          { key: "categories", label: "Categories", value: categories.length, tone: "blue" },
          { key: "patterns", label: "Patterns", value: patterns.length, tone: "blue" },
          { key: "sections", label: "Sections", value: sections.length, tone: "teal" },
          { key: "questions", label: "Questions", value: questions, tone: "green" },
          { key: "schedules", label: "Schedules", value: schedules.length, tone: "muted" },
          { key: "mocks", label: "Mock tests", value: mockTests.length, tone: "orange" },
        ]}
      />

      <StudioPanel>
        <h2 className="text-[15px] font-bold text-fg">How the content fits together</h2>
        <ol className="mt-2 flex list-decimal flex-wrap gap-x-8 gap-y-1 pl-5 text-[13px] text-fg">
          <li>Category (the exam)</li>
          <li>Pattern (an exam stage)</li>
          <li>Section (a subject division)</li>
          <li>Topic (the master tree)</li>
          <li>Question (versions and keys)</li>
        </ol>
      </StudioPanel>

      <StudioPanel>
        <h2 className="text-[15px] font-bold text-fg">Modules</h2>
        <ul className="mt-2 divide-y divide-line" aria-label="Modules">
          {modules.map((m) => (
            <li key={m.href} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-fg">{m.title}</h3>
                <p className="text-[13px] text-fg-secondary">{m.description}</p>
              </div>
              <Link href={m.href} className={studioQuietAction}>
                {m.action}
              </Link>
            </li>
          ))}
        </ul>
      </StudioPanel>
    </div>
  );
}
