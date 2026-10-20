import React from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { PremiumHubService } from "@/services/premium-hub.service";
import { PremiumHubView } from "@/components/premium/premium-hub-view";
import { getServerSession } from "@/lib/auth/session";
import { SessionUnavailable } from "@/components/auth/session-unavailable";
import { loginRedirectPath } from "@/lib/auth/safe-redirect";

export const metadata: Metadata = {
  title: "Premium Practice Hub | Courage Library",
  description:
    "AI-balanced dynamic generators, full-length simulations, PYQ drills, and targeted error remediation.",
};

export const revalidate = 0;

interface PremiumPageProps {
  searchParams: Promise<{
    examId?: string;
  }>;
}

export default async function PremiumHubPage({ searchParams }: PremiumPageProps) {
  const { examId } = await searchParams;
  // AUTH-1 2a: tri-state session — a Supabase outage shows a retry state, never a login redirect or data
  const session = await getServerSession();
  if (session.state === "error") return <SessionUnavailable />;
  if (session.state === "none") redirect(loginRedirectPath(`/premium${examId ? `?examId=${examId}` : ""}`));
  const user = session.user;

  const hubData = await PremiumHubService.getHubData(user.id, examId);

  return <PremiumHubView initialData={hubData} />;
}
