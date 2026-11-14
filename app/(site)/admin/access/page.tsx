import { requireAdminPage } from "@/lib/auth/require-admin";
import { Container } from "@/components/ui/layout";
import { FEATURE_CODES, loadAccessPolicyForAdmin } from "@/lib/access/policy";
import { AccessPolicyPanel } from "./access-policy-panel";

export const dynamic = "force-dynamic";

/**
 * PAY-1 B2a: "Free & Pro" — which items are Free and which need Pro (docs/payments/PAY_1_DESIGN.md §7). ADMIN only;
 * every change is audited (who, when, old → new) and takes effect on the next request (no deploy, no cache).
 */
export default async function AdminAccessPage() {
  await requireAdminPage({ path: "/admin/access" });
  const { rows, paywallEnabled, error } = await loadAccessPolicyForAdmin();
  return (
    <Container className="flex max-w-4xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">Free &amp; Pro</h1>
        <p className="text-body text-fg-secondary">
          Choose what is Free and what needs Pro. An item without its own setting follows its default; anything unknown is Pro. Changes apply
          straight away and are recorded.
        </p>
      </header>
      <AccessPolicyPanel rows={rows} paywallEnabled={paywallEnabled} loadError={error} features={FEATURE_CODES.map((f) => ({ code: f.code, label: f.label }))} />
    </Container>
  );
}
