import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { loadOwnProfile } from "@/lib/profile/server";

export const dynamic = "force-dynamic";

const DELETE_ACCOUNT_MAILTO = "mailto:support@couragelibrary.in?subject=Account%20deletion%20request";
const DELETE_ACCOUNT_NOTE =
  "Send us a deletion request from your registered email address. We delete or anonymise your data within 30 days; payment records are kept for 8 years, as the law requires.";
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

/** F8 (#80): username + opt-in public profile (18+ only). Signed-in only; flag off → 404. */
export default async function ProfileSettingsPage() {
  if (!isProfilesEnabled()) notFound();
  const supabase = await createServerSupabaseClient();
  const session = await getSessionState(supabase);
  if (session.state !== "user") redirect("/auth/login?next=%2Fsettings%2Fprofile");
  const p = await loadOwnProfile(supabase, session.user.id);
  return (
    <Container className="flex max-w-2xl flex-col gap-6 py-8 lg:py-10">
      <h1 className="text-h1 font-bold text-fg">Profile</h1>
      <ProfileSettingsForm username={p?.username ?? null} usernameChangedAt={p?.usernameChangedAt ?? null} profilePublic={p?.profilePublic ?? false} adultConfirmed={p?.adultConfirmed ?? false} leaderboardOptIn={p?.leaderboardOptIn ?? false} />
      {/* LEGAL-PAGES-1 (interim, no DB): "Account settings → Delete account" opens an email request; the in-app flow is
          designed in docs/legal/ACCOUNT_DELETION_DESIGN_1.md */}
      <section aria-labelledby="delete-account" className="flex flex-col gap-2 border-t border-line pt-6" data-delete-account="">
        <h2 id="delete-account" className="text-h3 font-semibold text-fg">
          Delete account
        </h2>
        <p className="text-body text-fg-secondary">{DELETE_ACCOUNT_NOTE}</p>
        <a href={DELETE_ACCOUNT_MAILTO} className="focus-ring inline-flex min-h-12 w-fit items-center rounded-badge font-medium text-danger-700 underline underline-offset-2">
          Delete account
        </a>
      </section>
    </Container>
  );
}
