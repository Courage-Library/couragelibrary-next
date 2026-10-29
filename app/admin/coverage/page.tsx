import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { CoverageService } from "@/services/learning/coverage.service";
import { CoverageMatrix } from "@/components/admin/lessons/coverage-matrix";

export const metadata: Metadata = { title: "Coverage and launch", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-7 (design H): per exam — % of its mapped syllabus nodes with a published EN / HI lesson, build next, launch. */
export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  await requireAdminPage({ path: "/admin/coverage" }); // admin only
  const { exam } = await searchParams;
  const exams = await CoverageService.listExams();
  const list = exams.success ? exams.data : [];
  const selectedId = exam && list.some((e) => e.id === exam) ? exam : (list.find((e) => e.launch)?.id ?? list[0]?.id ?? null);
  const view = selectedId ? await CoverageService.forExam(selectedId) : null;
  return (
    <CoverageMatrix
      exams={list}
      view={view && view.success ? view.data : null}
      loadError={!exams.success ? exams.error : view && !view.success ? view.error : null}
    />
  );
}
