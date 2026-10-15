"use client";

import { actionErrorMessage } from "@/lib/actions/action-result";
import React, { useMemo, useState, useTransition } from "react";
import { Copy, Check, Wand2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/legacy/button";
import { Card } from "@/components/ui/legacy/card";
import { qfGeneratePromptAction } from "@/actions/question-factory.actions";
import { QF_MAX_ITEMS_PER_BATCH } from "@/types/question-factory";
import { SELECT_CLASS, type FactoryTaxonomy } from "./types";

interface GeneratedPrompt {
  prompt: string;
  contextHash: string;
  characterCount: number;
  contextCharacters: number;
}

export function GenerateTab({ taxonomy }: { taxonomy: FactoryTaxonomy }) {
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [subtopicId, setSubtopicId] = useState("");
  const [examId, setExamId] = useState("");
  const [mix, setMix] = useState({ easy: 3, medium: 5, hard: 2 });
  const [result, setResult] = useState<GeneratedPrompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const topics = useMemo(() => taxonomy.topics.filter((t) => t.subjectId === subjectId), [taxonomy.topics, subjectId]);
  const subtopics = useMemo(() => taxonomy.subtopics.filter((s) => s.topicId === topicId), [taxonomy.subtopics, topicId]);
  const count = mix.easy + mix.medium + mix.hard;
  const countValid = count >= 1 && count <= QF_MAX_ITEMS_PER_BATCH;

  const setMixValue = (key: keyof typeof mix, value: string) => {
    const n = Math.max(0, Math.min(QF_MAX_ITEMS_PER_BATCH, Math.floor(Number(value) || 0)));
    setMix((m) => ({ ...m, [key]: n }));
  };

  const generate = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await qfGeneratePromptAction({
        topicId,
        subtopicId: subtopicId || null,
        examId: examId || null,
        difficultyMix: mix,
        count,
      });
      if (res.success && res.data) setResult(res.data);
      else setError(actionErrorMessage(res, "Failed to generate prompt."));
    });
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard unavailable — select the prompt text and copy manually.");
    }
  };

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <Card className="p-4 space-y-3 bg-white border-slate-200">
        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide">Target</h2>
        <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
          Subject
          <select className={SELECT_CLASS} value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopicId(""); setSubtopicId(""); }}>
            <option value="">Select subject…</option>
            {taxonomy.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
          Topic
          <select className={SELECT_CLASS} value={topicId} disabled={!subjectId} onChange={(e) => { setTopicId(e.target.value); setSubtopicId(""); }}>
            <option value="">Select topic…</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
          Subtopic (optional)
          <select className={SELECT_CLASS} value={subtopicId} disabled={!topicId || subtopics.length === 0} onChange={(e) => setSubtopicId(e.target.value)}>
            <option value="">Topic level</option>
            {subtopics.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-[11px] font-semibold text-slate-600">
          Exam (optional)
          <select className={SELECT_CLASS} value={examId} onChange={(e) => setExamId(e.target.value)}>
            <option value="">Exam-agnostic</option>
            {taxonomy.exams.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        </label>

        <h2 className="text-xs font-black text-slate-900 uppercase tracking-wide pt-2">Difficulty mix</h2>
        <div className="grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as const).map((k) => (
            <label key={k} className="space-y-1 text-[11px] font-semibold text-slate-600 capitalize">
              {k}
              <input type="number" min={0} max={QF_MAX_ITEMS_PER_BATCH} value={mix[k]} onChange={(e) => setMixValue(k, e.target.value)} className={SELECT_CLASS} />
            </label>
          ))}
        </div>
        <p className={`text-[11px] font-semibold ${countValid ? "text-slate-500" : "text-rose-600"}`}>
          Total: {count} / {QF_MAX_ITEMS_PER_BATCH} max
        </p>

        <Button className="w-full" size="sm" onClick={generate} disabled={!topicId || !countValid} isLoading={isPending}>
          <Wand2 className="w-3.5 h-3.5" /> Build prompt
        </Button>
      </Card>

      <Card className="p-4 space-y-3 bg-white border-slate-200 min-w-0">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {!result && !error && (
          <p className="text-xs text-slate-500">
            Pick a topic and difficulty mix, then build the prompt. Paste it into any external AI and bring the JSON back to the Import tab.
          </p>
        )}
        {result && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-mono text-slate-600 break-all">
                contextHash: <span className="font-bold text-slate-900">{result.contextHash}</span>
              </div>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy prompt"}
              </Button>
            </div>
            <p className="text-[11px] text-slate-500">
              Prompt {result.characterCount.toLocaleString()} chars · context {result.contextCharacters.toLocaleString()} chars.
              The hash goes stale if the topic or its published questions change — rebuild before importing.
            </p>
            <textarea
              readOnly
              value={result.prompt}
              className="w-full h-[480px] p-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-[11px] text-slate-800 outline-none"
            />
          </>
        )}
      </Card>
    </div>
  );
}
