import { requireAdminPage } from "@/lib/auth/require-admin";
import { createAdminServerSupabaseClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/layout";
import { LibraryProPanel, type LibraryGrantRow } from "./library-pro-panel";

export const dynamic = "force-dynamic";

/** F9-B: Pro for library members, granted by an admin (no payment). Admin only; every grant / revoke is audited. */
export default async function AdminProLibraryPage() {
  await requireAdminPage({ path: "/admin/students/library-pro" });
  const { data } = await createAdminServerSupabaseClient()
    .from("user_entitlements")
    .select("id, user_id, starts_at, expires_at, is_active, revoked_at")
    .eq("source", "LIBRARY")
    .order("created_at", { ascending: false })
    .limit(200);
  const grants: LibraryGrantRow[] = (data ?? []).map((g) => ({
    id: g.id,
    userId: g.user_id,
    startsAt: g.starts_at,
    expiresAt: g.expires_at,
    active: g.is_active && !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > Date.now()),
  }));
  return (
    <Container className="flex max-w-3xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">Library Pro</h1>
        <p className="text-body text-fg-secondary">Give Pro to a library member for a fixed period. No payment is taken. Grants can be revoked; nothing is deleted.</p>
      </header>
      <LibraryProPanel grants={grants} />
    </Container>
  );
}
