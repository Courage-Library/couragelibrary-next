import { requireAdminPage, sanitizeAdminNext } from "@/lib/auth/require-admin";
import { AdminMfaPanel } from "@/components/admin/admin-mfa-panel";
import { MfaAccountRow } from "@/components/admin/mfa/mfa-account";
import { maskEmail } from "@/lib/auth/mfa-ui";
import { footerEmail } from "@/lib/site/footer-config";

export const dynamic = "force-dynamic";

/**
 * AUTH-1 2b-3: authenticator (TOTP) enrol / verify for admin and staff ONLY. The single admin page an AAL1 admin session
 * may open (allowAal1) — every other admin page sends it here while ADMIN_MFA_REQUIRED is on.
 * ADMIN-MFA-LOOP-1: lives in the (admin-auth) route group (URL unchanged) so the AAL2-requiring admin layout never wraps
 * it; this guard must stay the FIRST awaited call (anonymous → login, no role → 404).
 * ADMIN-MFA-UX-1: THE auth layout (AuthShell) with the admin panel. The account row shows the e-mail MASKED, taken from
 * the guard's own session read (no new read); only the masked string reaches the HTML. `next` is sanitized here, as before.
 */
export default async function AdminMfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { userEmail } = await requireAdminPage({ allowStaff: true, path: "/admin/mfa", allowAal1: true });
  const { next } = await searchParams;
  const masked = maskEmail(userEmail);
  const email = footerEmail();
  return <AdminMfaPanel next={sanitizeAdminNext(next)} maskedEmail={masked} account={<MfaAccountRow masked={masked} />} helpHref={email ? `mailto:${email}` : null} />;
}
