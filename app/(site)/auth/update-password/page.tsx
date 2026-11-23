import { paywallSwitchForDisplay } from "@/lib/access/policy";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "./update-password-form";

/** Reset password (from the e-mail link). AUTH-UX-1: inside THE auth layout; the form and its action are unchanged in behaviour. */
export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  const paywall = await paywallSwitchForDisplay();
  return (
    <AuthShell earlyAccess={paywall === "off"}>
      <UpdatePasswordForm />
    </AuthShell>
  );
}
