import React from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PremiumHubService } from "@/services/premium-hub.service";
import { PremiumHubView } from "@/components/premium/premium-hub-view";

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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/premium${examId ? `?examId=${examId}` : ""}`);
  }

  const hubData = await PremiumHubService.getHubData(user.id, examId);

  return <PremiumHubView initialData={hubData} />;
}
