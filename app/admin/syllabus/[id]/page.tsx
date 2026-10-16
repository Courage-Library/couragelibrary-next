import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { loadSyllabusEditorState } from "@/lib/syllabus/editor-state";
import { SyllabusEditor } from "@/components/admin/syllabus/syllabus-editor";
import type { SyllabusEditorNode, SyllabusTopicOption, SyllabusValidationReport, SyllabusVersionRow } from "@/types/syllabus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Syllabus editor | Courage Library Admin",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GAP2-4b: draft editor (DRAFT) or read-only view (PUBLISHED / ARCHIVED). All writes go through server actions → RPCs. */
export default async function AdminSyllabusVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin/syllabus" });
  const { id: versionId } = await params;
  if (!UUID_RE.test(versionId)) notFound();
  const supabase = await createServerSupabaseClient();

  const { data: version } = await supabase
    .from("exam_syllabus_versions")
    .select("id, exam_id, exam_cycle_id, version_number, version_tag, status, source_kind, is_active, created_at, published_at, archived_at, supersedes_version_id")
    .eq("id", versionId)
    .maybeSingle();
  if (!version) {
    return (
      <div className="flex flex-col gap-3 font-sans text-fg">
        <h1 className="text-h1 font-bold">Syllabus version not found</h1>
        <p className="text-body text-fg-secondary">It may have been deleted (only drafts can be deleted).</p>
        <Link href="/admin/syllabus" className="focus-ring w-fit rounded-badge text-body-sm text-link underline underline-offset-2">
          Back to all syllabus versions
        </Link>
      </div>
    );
  }
  const v = version as SyllabusVersionRow;

  const [examRes, editorState, taxRes, peerRes] = await Promise.all([
    // inactive exams are invisible to the session client; read the title with the service role (after the guard)
    createAdminServerSupabaseClient().from("exams").select("id, title, slug").eq("id", v.exam_id).maybeSingle(),
    loadSyllabusEditorState(supabase, v.id),
    supabase.from("canonical_taxonomy_nodes").select("id, name, slug, node_type, root_subject_id, display_order").in("node_type", ["SUBJECT", "TOPIC"]).eq("is_active", true),
    supabase
      .from("exam_syllabus_versions")
      .select("id, version_number, exam_cycle_id")
      .eq("exam_id", v.exam_id)
      .eq("status", "PUBLISHED")
      .eq("is_active", true),
  ]);

  const nodes: SyllabusEditorNode[] = editorState?.nodes ?? [];

  const tax = taxRes.data ?? [];
  const subjectName = new Map(tax.filter((t) => t.node_type === "SUBJECT").map((t) => [t.id, t.name]));
  const topics: SyllabusTopicOption[] = tax
    .filter((t) => t.node_type === "TOPIC")
    .map((t) => ({ id: t.id, name: t.name, slug: t.slug, subject_id: t.root_subject_id, subject_name: t.root_subject_id ? subjectName.get(t.root_subject_id) ?? null : null }))
    .sort((a, b) => (a.subject_name ?? "").localeCompare(b.subject_name ?? "") || a.name.localeCompare(b.name));

  const report: SyllabusValidationReport | null = editorState?.report ?? null;
  const peer = (peerRes.data ?? []).find((p) => (p.exam_cycle_id ?? null) === (v.exam_cycle_id ?? null) && p.id !== v.id) ?? null;
  const loadError = Boolean(!editorState || !editorState.report || taxRes.error || examRes.error);

  return (
    <SyllabusEditor
      version={v}
      exam={{ id: v.exam_id, title: examRes.data?.title ?? "Exam" }}
      nodes={nodes}
      topics={topics}
      initialReport={report}
      publishedPeer={peer ? { id: peer.id, versionNumber: peer.version_number } : null}
      isAdmin={ctx.role === "admin"}
      loadError={loadError}
    />
  );
}
