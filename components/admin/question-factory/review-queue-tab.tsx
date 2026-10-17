"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw, X, Send, CheckCircle2, XCircle, MessageSquareWarning, Rocket, Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/legacy/button";
import { Card } from "@/components/ui/legacy/card";
import { Badge } from "@/components/ui/legacy/badge";
import { QuestionRenderer } from "@/components/assessment/question-renderer";
import { QuestionOptions } from "@/components/assessment/question-options";
import {
  qfApproveAction,
  qfEditDraftAction,
  qfGetVersionDetailAction,
  qfListReviewQueueAction,
  qfPublishAction,
  qfRejectAction,
  qfRequestChangesAction,
  qfSubmitForReviewAction,
} from "@/actions/question-factory.actions";
import {
  QF_LIFECYCLE_STATUSES,
  QF_ORIGINS,
  QF_REVIEW_CHECKLIST_ITEMS,
  type QuestionAuthoringItem,
  type QuestionLifecycleStatus,
  type QuestionOptionKey,
  type QuestionOrigin,
  type QuestionReviewChecklist,
  type QuestionReviewQueueItem,
  type QuestionVersionDetail,
} from "@/types/question-factory";
import { GateChips, ItemGateDetail } from "./gate-report-view";
import { SELECT_CLASS, type FactoryTaxonomy } from "./types";

const STATUS_VARIANT: Record<QuestionLifecycleStatus, "default" | "success" | "warning" | "destructive" | "outline" | "indigo" | "neutral"> = {
  DRAFT: "outline",
  IN_REVIEW: "indigo",
  CHANGES_REQUESTED: "warning",
  APPROVED: "success",
  PUBLISHED: "success",
  REJECTED: "destructive",
  SUPERSEDED: "neutral",
};

type ActionResult = { success: boolean; error?: string };

export function ReviewQueueTab({ taxonomy }: { taxonomy: FactoryTaxonomy }) {
  const [filters, setFilters] = useState<{ topicId: string; examId: string; lifecycleStatus: string; origin: string; batchId: string }>({
    topicId: "",
    examId: "",
    lifecycleStatus: "",
    origin: "",
    batchId: "",
  });
  const [items, setItems] = useState<QuestionReviewQueueItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const res = await qfListReviewQueueAction({
        topicId: filters.topicId || undefined,
        examId: filters.examId || undefined,
        lifecycleStatus: (filters.lifecycleStatus || undefined) as QuestionLifecycleStatus | undefined,
        origin: (filters.origin || undefined) as QuestionOrigin | undefined,
        batchId: filters.batchId.trim() || undefined,
      });
      if (res.success && res.data) setItems(res.data);
      else setError(actionErrorMessage(res, "Failed to load review queue."));
    });
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-white border-slate-200 grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
        <select className={SELECT_CLASS} value={filters.topicId} onChange={(e) => setFilters((f) => ({ ...f, topicId: e.target.value }))}>
          <option value="">All topics</option>
          {taxonomy.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={SELECT_CLASS} value={filters.examId} onChange={(e) => setFilters((f) => ({ ...f, examId: e.target.value }))}>
          <option value="">All exams</option>
          {taxonomy.exams.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <select className={SELECT_CLASS} value={filters.lifecycleStatus} onChange={(e) => setFilters((f) => ({ ...f, lifecycleStatus: e.target.value }))}>
          <option value="">Open (draft → approved)</option>
          {QF_LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={SELECT_CLASS} value={filters.origin} onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}>
          <option value="">All origins</option>
          {QF_ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input className={SELECT_CLASS} placeholder="Batch id" value={filters.batchId} onChange={(e) => setFilters((f) => ({ ...f, batchId: e.target.value }))} />
        <Button size="sm" variant="outline" onClick={load} isLoading={isPending}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </Card>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <Card className="bg-white border-slate-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wide">
            <tr>
              <th className="text-left p-2.5">Stem</th>
              <th className="text-left p-2.5">Topic</th>
              <th className="text-left p-2.5">Status</th>
              <th className="text-left p-2.5">Origin</th>
              <th className="text-left p-2.5">Diff.</th>
              <th className="text-left p-2.5">v</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-slate-500">No versions match these filters.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.versionId} onClick={() => setSelected(it.versionId)} className="cursor-pointer hover:bg-slate-50">
                <td className="p-2.5 max-w-md truncate text-slate-800">{it.stemPreview}</td>
                <td className="p-2.5 text-slate-600">{it.topicName || "—"}</td>
                <td className="p-2.5"><Badge variant={STATUS_VARIANT[it.lifecycleStatus]} className="text-[10px]">{it.lifecycleStatus}</Badge></td>
                <td className="p-2.5 text-slate-600 font-mono text-[10px]">{it.origin}</td>
                <td className="p-2.5 text-slate-600">{it.difficulty}</td>
                <td className="p-2.5 text-slate-600">{it.versionNumber}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected && (
        <VersionDrawer
          versionId={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function VersionDrawer({ versionId, onClose, onChanged }: { versionId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<QuestionVersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] = useState<Partial<QuestionReviewChecklist>>({});
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await qfGetVersionDetailAction(versionId);
      if (res.success && res.data) {
        setDetail(res.data);
        setError(null);
      } else setError(actionErrorMessage(res, "Failed to load version."));
    });
  }, [versionId]);

  useEffect(() => {
    setChecklist({});
    setNotes("");
    setEditing(false);
    reload();
  }, [reload]);

  const act = (fn: () => Promise<ActionResult>) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.success) {
        setError(actionErrorMessage(res, "Action failed."));
        return;
      }
      setNotes("");
      setChecklist({});
      onChanged();
      const fresh = await qfGetVersionDetailAction(versionId);
      if (fresh.success && fresh.data) setDetail(fresh.data);
    });
  };

  const allChecked = QF_REVIEW_CHECKLIST_ITEMS.every((i) => checklist[i.id] === true);
  const status = detail?.lifecycleStatus;
  const meta = (detail?.authoringMetadata || {}) as Record<string, unknown>;
  const rationale = (meta.distractorRationale || null) as Record<string, string> | null;
  const pyq = (meta.pyq || null) as { examSlug?: string; year?: number; reference?: string } | null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="w-full max-w-2xl h-full overflow-y-auto bg-white shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Question version detail"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-900">Version {detail?.versionNumber ?? ""}</span>
            {status && <Badge variant={STATUS_VARIANT[status]} className="text-[10px]">{status}</Badge>}
            {detail && <span className="text-[10px] font-mono text-slate-500">{detail.origin}</span>}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">{error}</div>
        )}

        {detail && !editing && (
          <>
            <Card className="p-4 border-slate-200">
              <QuestionRenderer
                questionNumber={1}
                questionText={detail.stem}
                marks={2}
                negativeMark={0.5}
                sectionName={detail.topicName || undefined}
                pyqInfo={pyq?.examSlug ? `PYQ ${pyq.examSlug} ${pyq.year ?? ""}` : null}
              />
              <QuestionOptions
                options={detail.options.map((o) => ({ key: o.key, text: o.text }))}
                selectedOption={detail.correctKey}
                onSelectOption={() => undefined}
                disabled
              />
              <p className="text-[11px] text-emerald-700 font-bold mt-2">Correct key: {detail.correctKey ?? "—"}</p>
            </Card>

            <section className="space-y-1">
              <h3 className="text-xs font-black text-slate-900">Explanation</h3>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{detail.explanationMd || "—"}</p>
            </section>

            {rationale && (
              <section className="space-y-1">
                <h3 className="text-xs font-black text-slate-900">Distractor rationale</h3>
                <ul className="text-xs text-slate-700 space-y-0.5">
                  {Object.entries(rationale).map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}
                </ul>
              </section>
            )}

            <section className="text-xs text-slate-700 space-y-0.5">
              <h3 className="text-xs font-black text-slate-900">Provenance</h3>
              <p>Source: {String(meta.sourceType || "—")} · Cognitive trap: {String(meta.cognitiveTrap || "—")}</p>
              {pyq && <p>PYQ: {pyq.examSlug} {pyq.year} — {pyq.reference}</p>}
              {detail.contractVersion && <p className="font-mono text-[10px] text-slate-500">{detail.contractVersion} · {detail.contextHash?.slice(0, 16)}…</p>}
              {detail.reviewNotes && <p className="text-amber-800">Reviewer notes: {detail.reviewNotes}</p>}
            </section>

            {detail.gateReport && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-black text-slate-900">Gate report (at import)</h3>
                <GateChips gates={detail.gateReport.gates} />
                <ItemGateDetail item={detail.gateReport} />
              </section>
            )}

            {status === "IN_REVIEW" && (
              <section className="space-y-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <h3 className="text-xs font-black text-slate-900">Reviewer checklist</h3>
                {QF_REVIEW_CHECKLIST_ITEMS.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checklist[item.id] === true}
                      onChange={(e) => setChecklist((c) => ({ ...c, [item.id]: e.target.checked }))}
                      className="mt-0.5"
                    />
                    {item.label}
                  </label>
                ))}
              </section>
            )}

            {status && ["DRAFT", "IN_REVIEW", "CHANGES_REQUESTED"].includes(status) && (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reviewer notes (required to request changes or reject)"
                className="w-full h-20 p-2 rounded-lg border border-slate-200 text-xs outline-none focus:border-blue-500"
              />
            )}

            <div className="flex flex-wrap gap-2">
              {(status === "DRAFT" || status === "CHANGES_REQUESTED") && (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={isPending}>
                  <Pencil className="w-3.5 h-3.5" /> Edit draft
                </Button>
              )}
              {status === "DRAFT" && (
                <Button size="sm" onClick={() => act(() => qfSubmitForReviewAction(versionId, notes || undefined))} isLoading={isPending}>
                  <Send className="w-3.5 h-3.5" /> Submit for review
                </Button>
              )}
              {status === "IN_REVIEW" && (
                <>
                  <Button size="sm" onClick={() => act(() => qfApproveAction(versionId, checklist as QuestionReviewChecklist, notes || undefined))} disabled={!allChecked} isLoading={isPending}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => act(() => qfRequestChangesAction(versionId, notes))} disabled={!notes.trim()}>
                    <MessageSquareWarning className="w-3.5 h-3.5" /> Request changes
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => act(() => qfRejectAction(versionId, notes))} disabled={!notes.trim()}>
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </Button>
                </>
              )}
              {status === "APPROVED" && (
                <Button size="sm" variant="primary" onClick={() => act(() => qfPublishAction(versionId))} isLoading={isPending}>
                  <Rocket className="w-3.5 h-3.5" /> Publish (atomic)
                </Button>
              )}
            </div>
          </>
        )}

        {detail && editing && (
          <DraftEditor
            detail={detail}
            onCancel={() => setEditing(false)}
            onSave={(item) =>
              act(async () => {
                const res = await qfEditDraftAction(versionId, item);
                if (res.success) setEditing(false);
                return res;
              })
            }
            isPending={isPending}
          />
        )}
      </div>
    </div>
  );
}

function DraftEditor({
  detail,
  onCancel,
  onSave,
  isPending,
}: {
  detail: QuestionVersionDetail;
  onCancel: () => void;
  onSave: (item: QuestionAuthoringItem) => void;
  isPending: boolean;
}) {
  const meta = (detail.authoringMetadata || {}) as Record<string, unknown>;
  const [stem, setStem] = useState(detail.stem);
  const [difficulty, setDifficulty] = useState(detail.difficulty);
  const [options, setOptions] = useState(detail.options.map((o) => ({ ...o })));
  // QB-KEY-1: no default key — a missing key stays empty and must be chosen explicitly
  const [correctKey, setCorrectKey] = useState(detail.correctKey ?? "");
  const [explanation, setExplanation] = useState(detail.explanationMd || "");

  const save = () => {
    const item: QuestionAuthoringItem = {
      clientRef: String(meta.clientRef || "edit"),
      stem,
      language: detail.language === "hi" ? "hi" : "en",
      difficulty: (["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium") as QuestionAuthoringItem["difficulty"],
      options: options.map((o) => ({ key: o.key as QuestionOptionKey, text: o.text })),
      correctKey: correctKey as QuestionOptionKey,
      explanationMd: explanation,
      sourceType: (["ORIGINAL", "PYQ", "ADAPTED"].includes(String(meta.sourceType)) ? meta.sourceType : "ORIGINAL") as QuestionAuthoringItem["sourceType"],
    };
    if (meta.distractorRationale) item.distractorRationale = meta.distractorRationale as QuestionAuthoringItem["distractorRationale"];
    if (meta.cognitiveTrap) item.cognitiveTrap = String(meta.cognitiveTrap);
    if (meta.pyq) item.pyq = meta.pyq as QuestionAuthoringItem["pyq"];
    onSave(item);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">Saving re-runs gates 1, 2, 4 and 5 and returns the version to DRAFT.</p>
      <textarea value={stem} onChange={(e) => setStem(e.target.value)} className="w-full h-28 p-2 rounded-lg border border-slate-200 text-xs" />
      {options.map((o, idx) => (
        <div key={o.key} className="flex items-center gap-2">
          <input type="radio" name="correct" checked={correctKey === o.key} onChange={() => setCorrectKey(o.key)} aria-label={`Mark ${o.key} correct`} />
          <span className="text-xs font-bold w-4">{o.key}</span>
          <input
            value={o.text}
            onChange={(e) => setOptions((prev) => prev.map((p, i) => (i === idx ? { ...p, text: e.target.value } : p)))}
            className="flex-1 p-2 rounded-lg border border-slate-200 text-xs"
          />
        </div>
      ))}
      <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={SELECT_CLASS}>
        <option value="easy">easy</option>
        <option value="medium">medium</option>
        <option value="hard">hard</option>
      </select>
      <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className="w-full h-28 p-2 rounded-lg border border-slate-200 text-xs" placeholder="Explanation (≥ 40 chars)" />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} isLoading={isPending}>Save draft</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
