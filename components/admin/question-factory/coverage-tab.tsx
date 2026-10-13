"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { qfGetCoverageAction } from "@/actions/question-factory.actions";
import { QF_LIFECYCLE_STATUSES, type QuestionCoverageRow } from "@/types/question-factory";
import { SELECT_CLASS, type FactoryTaxonomy } from "./types";

export function CoverageTab({ taxonomy }: { taxonomy: FactoryTaxonomy }) {
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<QuestionCoverageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    if (!subjectId) {
      setRows([]);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await qfGetCoverageAction(subjectId);
      if (res.success && res.data) setRows(res.data);
      else setError(actionErrorMessage(res, "Failed to load coverage."));
    });
  }, [subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const cell = (r: QuestionCoverageRow, status: (typeof QF_LIFECYCLE_STATUSES)[number]) => {
    const c = r.counts[status];
    const total = c.easy + c.medium + c.hard + c.other;
    if (total === 0) return <span className="text-slate-300">0</span>;
    return (
      <span title={`easy ${c.easy} · medium ${c.medium} · hard ${c.hard}${c.other ? ` · other ${c.other}` : ""}`}>
        <b>{total}</b>{" "}
        <span className="text-[10px] text-slate-500">({c.easy}/{c.medium}/{c.hard})</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-white border-slate-200 flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-[11px] font-semibold text-slate-600 min-w-[220px]">
          Subject
          <select className={SELECT_CLASS} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Select subject…</option>
            {taxonomy.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={load} disabled={!subjectId} isLoading={isPending}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
        <p className="text-[11px] text-slate-500">Counts per lifecycle; (easy/medium/hard). Read-only.</p>
      </Card>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {rows.length > 0 && (
        <Card className="bg-white border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
              <tr>
                <th className="text-left p-2.5">Topic</th>
                {QF_LIFECYCLE_STATUSES.map((s) => <th key={s} className="text-left p-2.5">{s.replace("_", " ")}</th>)}
                <th className="text-left p-2.5">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.topicId}>
                  <td className="p-2.5 font-semibold text-slate-800">{r.topicName}</td>
                  {QF_LIFECYCLE_STATUSES.map((s) => <td key={s} className="p-2.5 text-slate-700">{cell(r, s)}</td>)}
                  <td className="p-2.5 font-black text-slate-900">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
