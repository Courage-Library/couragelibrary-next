import React from "react";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestRegistrationService } from "@/services/live-test-registration.service";
import { LiveEventDetailView } from "@/components/live-test/live-event-detail-view";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const event = await LiveTestRegistrationService.getLiveEventDetails(slug);
  if (!event) return { title: "Live Test | Courage Library" };

  return {
    title: `${event.title} | All-India Live Mock`,
    description: event.description || `Register for ${event.title} on Courage Library.`,
  };
}

export default async function LiveTestDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const event = await LiveTestRegistrationService.getLiveEventDetails(slug, user?.id);
  if (!event) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <LiveEventDetailView event={event} isLoggedIn={Boolean(user)} />
    </div>
  );
}
