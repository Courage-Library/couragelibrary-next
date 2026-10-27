import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { LessonAdminService } from "@/services/lessons/lesson-admin.service";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioEmpty, StudioPageHeader, StudioPanel } from "@/components/admin/studio/studio-page";

export const metadata: Metadata = { title: "Lessons", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** CA-3: lessons stored as DB blocks (the MDX path is retired). Open one to edit its blocks, preview and publish. */
export default async function AdminLessonsPage() {
  await requireAdminPage({ path: "/admin/lessons" }); // admin only
  const r = await LessonAdminService.listDocuments();
  const docs = r.success ? r.data : [];
  return (
    <div className="space-y-5">
      <StudioPageHeader title="Lessons" description="Lessons are stored as checked blocks in the database. Open a lesson to edit it, preview it and publish it." />
      {!r.success && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          {r.error}
        </p>
      )}
      <StudioPanel>
        {docs.length === 0 ? (
          <StudioEmpty title="No lessons yet" body="Lessons appear here once a learning document exists." />
        ) : (
          <ul className="divide-y divide-line" aria-label="Lessons">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                <Link href={`/admin/lessons/${d.id}`} className="focus-ring min-h-10 flex-1 rounded-control py-2 font-semibold text-link">
                  {d.title}
                </Link>
                <span className="font-mono text-fg-secondary">{d.slug}</span>
                <span className="text-fg-secondary">{d.currentFormat === "BLOCKS" ? `v${d.currentVersion} blocks` : d.currentFormat === "LEGACY_MDX" ? "legacy (retired)" : "no published version"}</span>
                {d.hasDraft && <span className="font-semibold text-warning-700">Draft open</span>}
                <StatusChip status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </StudioPanel>
    </div>
  );
}
