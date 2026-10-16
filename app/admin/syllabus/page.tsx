import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { SyllabusVersionList } from "@/components/admin/syllabus/version-list";
import type { SyllabusVersionRow } from "@/types/syllabus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Syllabus | Courage Library Admin",
  robots: { index: false, follow: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GAP2-4b: exam picker + syllabus versions per exam (admin and staff; publish / archive are admin-only). */
export default async function AdminSyllabusPage({ searchParams }: { searchParams: Promise<{ exam?: string }> }) {
  const ctx = await requireAdminPage({ allowStaff: true, path: "/admin/syllabus" });
  const { exam } = await searchParams;
  const supabase = await createServerSupabaseClient();
  // Exams and cycles include INACTIVE ones (drafting happens before an exam goes live); the session client only
  // sees active exams, so these read-only lookups use the service role after the page guard. Versions are read with
  // the caller's session (admin / staff RLS read policy).
  const admin = createAdminServerSupabaseClient();

  const { data: exams } = await admin.from("exams").select("id, slug, title, is_active").order("title");
  const examList = exams ?? [];
  const selected = examList.find((e) => e.id === exam) ?? (UUID_RE.test(exam ?? "") ? null : examList.find((e) => e.is_active) ?? examList[0] ?? null);

  let versions: SyllabusVersionRow[] = [];
  let cycles: Array<{ id: string; cycle_year: number }> = [];
  const publishers: Record<string, { email: string; at: string }> = {};
  let loadError = false;
  if (selected) {
    const [vRes, cRes] = await Promise.all([
      supabase
        .from("exam_syllabus_versions")
        .select("id, exam_id, exam_cycle_id, version_number, version_tag, status, source_kind, is_active, created_at, published_at, archived_at, supersedes_version_id")
        .eq("exam_id", selected.id)
        .order("version_number", { ascending: false }),
      admin.from("exam_cycles").select("id, cycle_year").eq("exam_id", selected.id).order("cycle_year", { ascending: false }),
    ]);
    loadError = Boolean(vRes.error || cRes.error);
    versions = (vRes.data ?? []) as SyllabusVersionRow[];
    cycles = cRes.data ?? [];
    const publishedIds = versions.filter((v) => v.published_at).map((v) => v.id);
    if (publishedIds.length) {
      // Who published: the SYLLABUS_PUBLISH audit rows (service role, after the page guard; e-mail and time only).
      const { data: audits } = await admin
        .from("admin_audit_logs")
        .select("target_id, actor_email, created_at")
        .eq("action_type", "SYLLABUS_PUBLISH")
        .in("target_id", publishedIds);
      for (const a of audits ?? []) if (a.target_id) publishers[a.target_id] = { email: a.actor_email, at: a.created_at };
    }
  }

  return (
    <div className="flex flex-col gap-6 font-sans text-fg">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 font-bold">Syllabus</h1>
        <p className="max-w-prose text-body text-fg-secondary">
          Each exam has one published syllabus at a time. Staff build drafts; an admin publishes them. Published and archived
          versions are read-only.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-4">
        <div className="flex min-w-64 flex-col gap-1.5">
          <label htmlFor="syllabus-exam" className="text-body-sm font-medium text-fg">
            Exam
          </label>
          <select
            id="syllabus-exam"
            name="exam"
            defaultValue={selected?.id ?? ""}
            className="focus-ring h-11 rounded-control border border-line-control bg-surface px-3 text-body text-fg"
          >
            {examList.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="focus-ring h-11 rounded-control border border-line-control bg-surface px-4 text-body font-medium text-fg hover:bg-ink-50">
          Show versions
        </button>
      </form>

      {!selected ? (
        <p className="text-body text-fg-secondary">No exams found.</p>
      ) : (
        <SyllabusVersionList
          exam={{ id: selected.id, title: selected.title }}
          cycles={cycles}
          versions={versions}
          publishers={publishers}
          isAdmin={ctx.role === "admin"}
          loadError={loadError}
        />
      )}
      <p className="text-body-sm text-fg-secondary">
        Canonical topics are managed in <Link href="/admin/taxonomy" className="focus-ring rounded-badge text-link underline underline-offset-2">Taxonomy</Link>.
      </p>
    </div>
  );
}
