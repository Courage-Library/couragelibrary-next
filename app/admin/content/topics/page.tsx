import { AdminContentStudioService } from "@/services/admin-content-studio.service";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { TopicLinksView } from "@/components/admin/content-studio/topic-links-view";

export const dynamic = "force-dynamic";

/**
 * F6: topics ↔ study notes. Admins / staff link study units (and so their articles) to canonical topics: add a unit to
 * a topic, or move a unit to another topic (audited). One article per document type per unit — nothing is copied.
 */
export default async function AdminTopicLinksPage() {
  await requireAdminPage({ allowStaff: true, path: "/admin/content/topics" });
  const topics = await AdminContentStudioService.getTopicLinks().catch(() => []);
  return <TopicLinksView topics={topics} />;
}
