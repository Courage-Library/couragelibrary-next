import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { StatusChip } from "@/components/admin/status-chip";
import { StudioEmpty, StudioPageHeader, StudioPanel } from "@/components/admin/studio/studio-page";

export const metadata: Metadata = { title: "Legacy lessons", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * ADMIN-IA-1 (owner ruling Q-L, 2026-10-29): the retired Content Studio's "learning unit" lessons, READ ONLY. Nothing
 * here writes; the data stays as it is (removal is reviewed 3 months after the domain cutover). New lessons are node
 * lessons (Lessons › New lesson). Service-role read after the admin guard (archived documents are not visible to the
 * admin session's RLS).
 */
export default async function LegacyLessonsPage() {
  await requireAdminPage({ path: "/admin/lessons/legacy" }); // admin only
  const db = createAdminServerSupabaseClient();
  const [units, docs] = await Promise.all([
    db.from("learning_units").select("id, title, slug, unit_type, is_active, topic:canonical_taxonomy_nodes!learning_units_topic_id_node_fkey(name)").order("title"),
    db.from("learning_documents").select("id, canonical_slug, document_type, status, access_level, learning_unit_id, updated_at").neq("document_type", "NODE_LESSON").order("canonical_slug"),
  ]);
  const error = units.error || docs.error;
  const docsOf = (unitId: string) => (docs.data ?? []).filter((d) => d.learning_unit_id === unitId);
  return (
    <div className="space-y-5">
      <StudioPageHeader
        title="Legacy lessons (read only)"
        description="Lessons from the retired Content Studio. They cannot be edited here; new lessons are written per master-tree topic with New lesson."
      />
      {error && (
        <p role="alert" className="rounded-card border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] font-semibold text-danger-800">
          The legacy lessons could not be loaded. Reload the page.
        </p>
      )}
      <StudioPanel>
        {(units.data ?? []).length === 0 ? (
          <StudioEmpty title="No legacy lessons" body="Nothing from the retired Content Studio is left." />
        ) : (
          <table className="w-full text-left text-[14px]" data-legacy-lessons="">
            <caption className="sr-only">Legacy learning units and their documents</caption>
            <thead className="text-[13px] text-fg-secondary">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Unit</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Topic</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(units.data ?? []).map((u) => {
                const topic = Array.isArray(u.topic) ? u.topic[0] : u.topic;
                return (
                  <tr key={u.id}>
                    <th scope="row" className="py-3 pr-4 align-top font-semibold text-fg">
                      {u.title}
                      {!u.is_active && <span className="ml-2 text-[12px] font-normal text-fg-secondary">(inactive)</span>}
                    </th>
                    <td className="py-3 pr-4 align-top text-fg-secondary">{topic?.name ?? "No topic"}</td>
                    <td className="py-3 pr-4 align-top">
                      <ul className="flex flex-col gap-1">
                        {docsOf(u.id).map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[13px]">{d.canonical_slug}</span>
                            <StatusChip status={d.status} />
                            <span className="text-[12px] text-fg-secondary">{d.document_type.replace(/_/g, " ").toLowerCase()} · {d.access_level}</span>
                          </li>
                        ))}
                        {docsOf(u.id).length === 0 && <li className="text-fg-secondary">No documents</li>}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </StudioPanel>
    </div>
  );
}
