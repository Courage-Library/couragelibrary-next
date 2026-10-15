"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useState, useTransition } from "react";
import { FlaskConical, UploadCloud, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/legacy/button";
import { Card } from "@/components/ui/legacy/card";
import { qfImportAction } from "@/actions/question-factory.actions";
import { QF_MAX_PAYLOAD_BYTES, type QuestionImportResult } from "@/types/question-factory";
import { GateChips, ItemGateDetail } from "./gate-report-view";

export function ImportTab() {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<QuestionImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const tooLarge = new Blob([raw]).size > QF_MAX_PAYLOAD_BYTES;

  const run = (mode: "dry-run" | "commit") => {
    setError(null);
    startTransition(async () => {
      const res = await qfImportAction(raw, mode);
      if (res.data) setResult(res.data);
      if (!res.success) setError(actionErrorMessage(res, "Import failed."));
    });
  };

  const report = result?.report;
  const canCommit = result?.status === "DRY_RUN" && (report?.acceptedCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3 bg-white border-slate-200">
        <label className="block text-xs font-black text-slate-900 uppercase tracking-wide">
          Paste the external AI response (one ```json block)
        </label>
        <textarea
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setResult(null); }}
          placeholder={"```json\n{ \"specVersion\": \"1.0.0\", ... }\n```"}
          className="w-full h-64 p-3 rounded-xl border border-slate-200 font-mono text-[11px] outline-none focus:border-blue-500"
        />
        {tooLarge && <p className="text-[11px] font-semibold text-rose-600">Payload exceeds 200 KB.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run("dry-run")} disabled={!raw.trim() || tooLarge} isLoading={isPending}>
            <FlaskConical className="w-3.5 h-3.5" /> Dry-run gates
          </Button>
          <Button size="sm" onClick={() => run("commit")} disabled={!canCommit || isPending}>
            <UploadCloud className="w-3.5 h-3.5" /> Commit {report?.acceptedCount ?? 0} accepted as DRAFT
          </Button>
        </div>
        <p className="text-[11px] text-slate-500">
          Commit re-runs every gate server-side and writes only accepted items, atomically. Nothing is published from here.
        </p>
      </Card>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {result?.status === "IMPORTED" && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Imported {result.imported?.length ?? 0} DRAFT version(s) in batch {result.batchId?.slice(0, 8)}. Continue in the Review Queue.
        </div>
      )}

      {report && (
        <Card className="p-4 space-y-3 bg-white border-slate-200">
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
            <span className="text-slate-900">Gate report</span>
            <span className="text-emerald-700">{report.acceptedCount} accepted</span>
            <span className="text-rose-700">{report.rejectedCount} rejected</span>
            <GateChips gates={report.batchGates} />
          </div>
          {report.errors.length > 0 && (
            <ul className="text-[11px] text-rose-700 space-y-0.5">
              {report.errors.map((e, i) => <li key={i}>✕ {e}</li>)}
            </ul>
          )}
          <div className="divide-y divide-slate-100">
            {report.items.map((item) => (
              <div key={item.index} className="py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-black ${item.passed ? "text-emerald-700" : "text-rose-700"}`}>
                    {item.passed ? "ACCEPT" : "REJECT"}
                  </span>
                  <span className="text-[11px] font-mono text-slate-600">{item.clientRef}</span>
                  <GateChips gates={item.gates} />
                </div>
                <ItemGateDetail item={item} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
