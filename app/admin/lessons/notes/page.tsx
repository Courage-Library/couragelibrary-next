import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { CoverageService } from "@/services/learning/coverage.service";
import { ExamNoteService } from "@/services/learning/exam-note.service";
import { ExamNotesEditor } from "@/components/admin/lessons/exam-notes-editor";

export const metadata: Metadata = { title: "Exam notes", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-7 (design E): the per-exam note of a mapped node — how it is asked, weightage, PYQ pattern; EN master + HI. */
export default async function ExamNotesPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  await requireAdminPage({ path: "/admin/lessons/notes" }); // admin only
  const { exam } = await searchParams;
  const exams = await CoverageService.listExams();
  const list = exams.success ? exams.data : [];
  const selectedId = exam && list.some((e) => e.id === exam) ? exam : (list[0]?.id ?? null);
  const [view, notes] = selectedId ? await Promise.all([CoverageService.forExam(selectedId), ExamNoteService.listForExam(selectedId)]) : [null, null];
  return (
    <ExamNotesEditor
      exams={list.map((e) => ({ id: e.id, title: e.title }))}
      examId={selectedId}
      nodes={view && view.success ? view.data.coverage.rows.map((r) => ({ id: r.nodeId, name: r.name, nodeType: r.nodeType })) : []}
      notes={notes && notes.success ? notes.data : []}
      loadError={!exams.success ? exams.error : view && !view.success ? view.error : notes && !notes.success ? notes.error : null}
    />
  );
}
