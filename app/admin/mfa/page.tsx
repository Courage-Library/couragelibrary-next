import { requireAdminPage, sanitizeAdminNext } from "@/lib/auth/require-admin";
import { Container } from "@/components/ui/layout";
import { AdminMfaPanel } from "@/components/admin/admin-mfa-panel";
import { isAdminMfaRequired } from "@/lib/auth/mfa";

export const dynamic = "force-dynamic";

/**
 * AUTH-1 2b-3: authenticator (TOTP) enrol / verify for admin and staff ONLY. The single admin page an AAL1 admin session
 * may open (allowAal1) — every other admin page sends it here while ADMIN_MFA_REQUIRED is on.
 */
export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireAdminPage({ allowStaff: true, path: "/admin/mfa", allowAal1: true });
  const { next } = await searchParams;
  return (
    <Container className="flex max-w-xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-h1 font-bold text-fg">Two-step verification</h1>
        <p className="text-body text-fg-secondary">
          Admin and staff accounts use an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password …) in addition to the password.
          {isAdminMfaRequired() ? " It is required for the admin studio." : " It is not required yet — set it up now so nothing breaks when it is switched on."}
        </p>
      </header>
      <AdminMfaPanel next={sanitizeAdminNext(next)} />
    </Container>
  );
}
