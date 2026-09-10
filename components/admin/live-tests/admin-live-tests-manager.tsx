"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState, useTransition } from "react";
import { LiveTestEvent, LiveEventStatus, CreateLiveEventDTO } from "@/types/live-test";
import {
  createLiveEventAction,
  updateLiveEventStatusAction,
  updateLiveEventScheduleAction,
} from "@/app/admin/live-tests/actions";
import {
  Radio,
  Calendar,
  Clock,
  Plus,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldAlert,
  Loader2,
  X,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

interface AdminLiveTestsManagerProps {
  initialEvents: LiveTestEvent[];
  exams: Array<{ id: string; title: string }>;
  mockTests: Array<{ id: string; title: string; duration_minutes: number }>;
}

export function AdminLiveTestsManager({
  initialEvents,
  exams,
  mockTests,
}: AdminLiveTestsManagerProps) {
  const [events, setEvents] = useState<LiveTestEvent[]>(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [isPending, startTransition] = useTransition();

  // Create Event Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newExamId, setNewExamId] = useState(exams[0]?.id || "");
  const [newMockTestId, setNewMockTestId] = useState(mockTests[0]?.id || "");
  const [newRegStart, setNewRegStart] = useState("");
  const [newRegEnd, setNewRegEnd] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newDuration, setNewDuration] = useState(60);
  const [newMaxParticipants, setNewMaxParticipants] = useState<number | undefined>(undefined);
  const [newIsPremium, setNewIsPremium] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Status Transition Modal
  const [selectedEventForTransition, setSelectedEventForTransition] = useState<LiveTestEvent | null>(null);
  const [targetStatus, setTargetStatus] = useState<LiveEventStatus>("REGISTRATION_OPEN");
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const filteredEvents = events.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateEvent = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newTitle || !newSlug || !newExamId || !newMockTestId || !newRegStart || !newRegEnd || !newEventStart || !newEventEnd) {
      setCreateError("All schedule fields are required.");
      return;
    }

    const dto: CreateLiveEventDTO = {
      exam_id: newExamId,
      mock_test_id: newMockTestId,
      title: newTitle,
      slug: newSlug,
      registration_start_at: new Date(newRegStart).toISOString(),
      registration_end_at: new Date(newRegEnd).toISOString(),
      event_start_at: new Date(newEventStart).toISOString(),
      event_end_at: new Date(newEventEnd).toISOString(),
      duration_minutes: Number(newDuration),
      max_participants: newMaxParticipants ? Number(newMaxParticipants) : undefined,
      is_premium_only: newIsPremium,
    };

    startTransition(async () => {
      const res = await createLiveEventAction(dto);
      if (res.success && res.data) {
        setEvents((prev) => [res.data!, ...prev]);
        setShowCreateModal(false);
        // Reset form
        setNewTitle("");
        setNewSlug("");
      } else {
        setCreateError(res.error || "Failed to create live event.");
      }
    });
  };

  const handleStatusTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventForTransition) return;
    setTransitionError(null);

    if (!transitionReason || transitionReason.trim().length < 5) {
      setTransitionError("Please provide a reason with at least 5 characters.");
      return;
    }

    startTransition(async () => {
      const res = await updateLiveEventStatusAction(
        selectedEventForTransition.id,
        targetStatus,
        transitionReason
      );

      if (res.success && res.data) {
        setEvents((prev) =>
          prev.map((item) => (item.id === res.data!.id ? res.data! : item))
        );
        setSelectedEventForTransition(null);
        setTransitionReason("");
      } else {
        setTransitionError(res.error || "Failed to update status.");
      }
    });
  };

  return (
    <div className="space-y-8">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-6 rounded-2xl border border-border/80 bg-card shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-primary animate-pulse" />
            <h1 className="text-2xl font-bold text-foreground">Live / All-India Test Manager</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Schedule national examination events, configure registration windows, and monitor candidate registrations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/live-tests/intelligence"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-secondary text-secondary-foreground border border-border shadow-sm transition-all hover:bg-secondary/80"
          >
            <History className="w-4 h-4 text-primary" />
            Competition Intelligence
          </Link>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-md transition-all hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Schedule New Live Event
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search events by title or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-background border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
          {["ALL", "DRAFT", "SCHEDULED", "REGISTRATION_OPEN", "READY", "LIVE", "PUBLISHED"].map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {status.replace("_", " ")}
              </button>
            )
          )}
        </div>
      </div>

      {/* Events Table / List */}
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
              <th className="py-3.5 px-4">Event Title & Slug</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Registration Window</th>
              <th className="py-3.5 px-4">Live Test Window</th>
              <th className="py-3.5 px-4 text-center">Registrations</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-foreground line-clamp-1">{evt.title}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{evt.slug}</p>
                  </td>

                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        evt.status === "LIVE"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : evt.status === "REGISTRATION_OPEN"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : evt.status === "SCHEDULED"
                          ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {evt.status.replace("_", " ")}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 text-muted-foreground">
                    <p>Start: {new Date(evt.registration_start_at).toLocaleString("en-IN")}</p>
                    <p>End: {new Date(evt.registration_end_at).toLocaleString("en-IN")}</p>
                  </td>

                  <td className="py-3.5 px-4 text-muted-foreground">
                    <p>Start: {new Date(evt.event_start_at).toLocaleString("en-IN")}</p>
                    <p>End: {new Date(evt.event_end_at).toLocaleString("en-IN")}</p>
                  </td>

                  <td className="py-3.5 px-4 text-center font-bold text-foreground">
                    {evt.current_registered_count.toLocaleString()}
                    {evt.max_participants && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        / {evt.max_participants}
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setSelectedEventForTransition(evt);
                        setTargetStatus(
                          evt.status === "DRAFT"
                            ? "SCHEDULED"
                            : evt.status === "SCHEDULED"
                            ? "REGISTRATION_OPEN"
                            : evt.status === "REGISTRATION_OPEN"
                            ? "REGISTRATION_CLOSED"
                            : "CANCELLED"
                        );
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      Change Status
                    </button>

                    <Link
                      href={`/live-tests/${evt.slug}`}
                      target="_blank"
                      className="inline-flex items-center px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  No live events found matching the criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-lg font-bold text-foreground">Schedule New Live Mock Test</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Event Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SSC CGL All-India Mock #01"
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">URL Slug</label>
                  <input
                    type="text"
                    required
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Exam</label>
                  <select
                    value={newExamId}
                    onChange={(e) => setNewExamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  >
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Mock Test Blueprint</label>
                  <select
                    value={newMockTestId}
                    onChange={(e) => setNewMockTestId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  >
                    {mockTests.map((mt) => (
                      <option key={mt.id} value={mt.id}>
                        {mt.title} ({mt.duration_minutes}m)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Registration Start</label>
                  <input
                    type="datetime-local"
                    required
                    value={newRegStart}
                    onChange={(e) => setNewRegStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Registration End</label>
                  <input
                    type="datetime-local"
                    required
                    value={newRegEnd}
                    onChange={(e) => setNewRegEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Live Event Start</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">Live Event End</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="premiumOnly"
                  checked={newIsPremium}
                  onChange={(e) => setNewIsPremium(e.target.checked)}
                  className="rounded border-border"
                />
                <label htmlFor="premiumOnly" className="text-xs font-medium text-foreground">
                  Premium Exclusive Event
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-md flex items-center gap-1.5"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Schedule Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Transition Modal */}
      {selectedEventForTransition && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h2 className="text-base font-bold text-foreground">
              Transition Event Status: {selectedEventForTransition.title}
            </h2>

            {transitionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {transitionError}
              </div>
            )}

            <form onSubmit={handleStatusTransition} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Current Status</label>
                <p className="text-sm font-bold text-foreground">
                  {selectedEventForTransition.status}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Target Status</label>
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value as LiveEventStatus)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                >
                  {[
                    "DRAFT",
                    "SCHEDULED",
                    "REGISTRATION_OPEN",
                    "REGISTRATION_CLOSED",
                    "READY",
                    "LIVE",
                    "GRACE_PERIOD",
                    "PROCESSING",
                    "RESULTS_READY",
                    "PUBLISHED",
                    "ARCHIVED",
                    "CANCELLED",
                  ].map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Reason for Status Change (Mandatory)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Scheduled registration window opened as per timetable..."
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-background border border-border"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedEventForTransition(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-muted text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground shadow-md flex items-center gap-1.5"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Transition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
