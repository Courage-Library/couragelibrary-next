import React from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestRegistrationService } from "@/services/live-test-registration.service";
import { LiveEventCard } from "@/components/live-test/live-event-card";
import { Radio, Calendar, Trophy, Sparkles } from "lucide-react";

export const metadata = {
  title: "All-India Live Mock Tests | Courage Library",
  description:
    "Participate in nationwide scheduled live mock tests, compete with thousands of aspirants, and evaluate your All-India Rank and percentile.",
};

export const revalidate = 60; // Revalidate every minute for live schedule sync

export default async function LiveTestsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const events = await LiveTestRegistrationService.getLiveEventsDirectory(user?.id);

  const activeEvents = events.filter((e) => ["REGISTRATION_OPEN", "READY", "LIVE"].includes(e.status));
  const upcomingScheduled = events.filter((e) => e.status === "SCHEDULED");
  const pastEvents = events.filter((e) => ["PROCESSING", "RESULTS_READY", "PUBLISHED"].includes(e.status));

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 space-y-10">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 md:p-12">
        <div className="max-w-2xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-sm">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            ALL-INDIA LIVE ARENA
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-foreground">
            All-India Live Mock Tests
          </h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            Experience authentic national examination conditions. Compete simultaneously with thousands of candidates, benchmark your accuracy, and discover your real-time All-India Rank.
          </p>
        </div>
      </div>

      {/* Active & Open for Registration Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
            <h2 className="text-xl font-bold text-foreground">Live & Open for Registration</h2>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {activeEvents.length} {activeEvents.length === 1 ? "Event" : "Events"}
          </span>
        </div>

        {activeEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeEvents.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/80 p-10 text-center space-y-3">
            <Calendar className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-semibold text-foreground">No events open right now</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Check out upcoming scheduled tests below or visit our Daily Mock section.
            </p>
          </div>
        )}
      </section>

      {/* Upcoming Scheduled Events */}
      {upcomingScheduled.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-border/60">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">Upcoming Schedule</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingScheduled.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {/* Past / Completed Events */}
      {pastEvents.length > 0 && (
        <section className="space-y-4 pt-6 border-t border-border/60">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-bold text-foreground">Recent All-India Mocks & Results</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pastEvents.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
