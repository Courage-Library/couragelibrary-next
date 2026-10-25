import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { Container } from "@/components/ui/layout";
import { isProfilesEnabled } from "@/lib/profile/flag";
import { loadPublicProfile } from "@/lib/profile/server";

export const dynamic = "force-dynamic";
// public profiles are opt-in; still kept out of search engines by default
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

const monthFmt = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/** F8 (#80): a public profile shows ONLY the username and the month joined, and exists only when its owner (18+) opted in. */
export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  if (!isProfilesEnabled()) notFound();
  const { username } = await params;
  const p = await loadPublicProfile(decodeURIComponent(username));
  if (!p) notFound();
  return (
    <Container className="flex max-w-2xl flex-col items-start gap-3 py-10" data-public-profile="">
      <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <UserRound className="size-8" />
      </span>
      <h1 className="text-h1 font-bold text-fg">@{p.username}</h1>
      <p className="text-body text-fg-secondary">Studying with Courage Library since {monthFmt.format(new Date(p.memberSince))}.</p>
    </Container>
  );
}
