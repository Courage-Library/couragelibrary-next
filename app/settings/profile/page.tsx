import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/layout";
import { ProfileSettingsForm } from "@/components/profile/profile-settings-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSessionState } from "@/lib/auth/session-state";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { loadOwnProfile } from "@/lib/profile/server";

export const dynamic = "force-dynamic";
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
    </Container>
  );
}
