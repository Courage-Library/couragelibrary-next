"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, AlertCircle } from "lucide-react";

interface Props {
  initialCycle?: {
    id?: string;
    cycleYear: number;
    cycleName?: string;
    notificationDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
    tier1ExamDate?: string;
  } | null;
  onSave: (data: {
    cycleId?: string;
    cycleYear: number;
    cycleName?: string;
    notificationDate?: string;
    applicationStartDate?: string;
    applicationEndDate?: string;
  }) => Promise<void>;
  onBack: () => void;
  isSaving: boolean;
}

export function Step2Cycles({ initialCycle, onSave, onBack, isSaving }: Props) {
  const [cycleYear, setCycleYear] = useState<number>(initialCycle?.cycleYear || new Date().getFullYear());
  const [cycleName, setCycleName] = useState(initialCycle?.cycleName || "");
  const [notificationDate, setNotificationDate] = useState(initialCycle?.notificationDate || "");
  const [applicationStartDate, setApplicationStartDate] = useState(initialCycle?.applicationStartDate || "");
  const [applicationEndDate, setApplicationEndDate] = useState(initialCycle?.applicationEndDate || "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cycleYear || cycleYear < 2020 || cycleYear > 2040) {
      setError("Please provide a valid recruitment cycle year (e.g. 2026).");
      return;
    }

    try {
      await onSave({
        cycleId: initialCycle?.id,
        cycleYear,
        cycleName: cycleName.trim() || undefined,
        notificationDate: notificationDate || undefined,
        applicationStartDate: applicationStartDate || undefined,
        applicationEndDate: applicationEndDate || undefined,
      });
    } catch (err: any) {
      setError(err.message || "Failed to save recruitment cycle.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" /> Step 2: Recruitment Cycles &amp; Timeline Dates
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Configure the active recruitment cycle and critical milestone dates. Cycle formats can be single year (e.g. 2026) or financial year notation.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {error}
        </div>
      )}

      <Card className="p-6 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Cycle Year <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              value={cycleYear}
              onChange={(e) => setCycleYear(parseInt(e.target.value, 10))}
              min={2020}
              max={2040}
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Cycle Display Label / Code
            </label>
            <input
              type="text"
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              placeholder="e.g. 2026-27 or CRP PO/MT-XIV"
              className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-4">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
            Milestone Dates (Optional / Progressive)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Notification Release Date</label>
              <input
                type="date"
                value={notificationDate}
                onChange={(e) => setNotificationDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Application Start Date</label>
              <input
                type="date"
                value={applicationStartDate}
                onChange={(e) => setApplicationStartDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Application Closing Date</label>
              <input
                type="date"
                value={applicationEndDate}
                onChange={(e) => setApplicationEndDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          onClick={onBack}
          variant="outline"
          className="text-xs font-bold px-5 py-2.5 rounded-xl border-slate-200"
        >
          ← Back to Step 1
        </Button>
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-xs"
        >
          {isSaving ? "Saving..." : "Save & Continue to Step 3 →"}
        </Button>
      </div>
    </form>
  );
}
