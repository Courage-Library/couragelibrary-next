'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Wand2, ShieldAlert } from 'lucide-react';
import { ALL_CURRENT_AFFAIRS_CATEGORIES } from '@/types/current-affairs';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CurrentAffairsPromptModal({ isOpen, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [focusTopic, setFocusTopic] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const generatedPrompt = `You are an expert editorial researcher and academic curriculum author for Courage Library civil service examinations.

Task: Research and produce a verified, high-yield Current Affairs dossier for:
TOPIC/EVENT: "${focusTopic || '<Specify Event or Headline>'}"
EVENT DATE: "${eventDate}"

STRICT EDITORIAL REQUIREMENTS:
1. Sourcing & Provenance: Use authoritative, primary government sources (PIB, RBI, Gazette, ISRO, Ministry portals) or reputable tier-2/tier-3 media. All URLs must be valid, secure HTTPS links.
2. Fact Verification: State accurate dates, numbers, constitutional provisions, treaties, and institutional bodies. No unsupported claims or hallucinations.
3. Exam Relevance: Highlight conceptual linkages to UPSC / State PSC General Studies papers, statutory background, and potential prelims/mains focus.
4. Clean Content: DO NOT include markdown citations (e.g., [1], [source]) or conversational commentary.
5. Strict JSON Output: Return ONLY a raw JSON object adhering to the schema below.

CATEGORIES (Choose EXACTLY ONE):
${ALL_CURRENT_AFFAIRS_CATEGORIES.join(', ')}

IMPORTANCE TIERS (Choose EXACTLY ONE):
CRITICAL, HIGH, MEDIUM, LOW

REQUIRED JSON SCHEMA:
\`\`\`json
{
  "headline": "Clear, objective headline (10 to 300 characters)",
  "slug": "url-friendly-slug-in-kebab-case",
  "newsDate": "${eventDate}",
  "category": "NATIONAL",
  "importanceTier": "HIGH",
  "summaryMd": "Comprehensive Markdown summary explaining the event, background, context, and constitutional/statutory significance (100 to 5000 chars).",
  "keyTakeaways": [
    "Key actionable takeaway 1",
    "Key actionable takeaway 2",
    "Key actionable takeaway 3"
  ],
  "importantFacts": [
    "Fact 1: Key statutory authority or committee",
    "Fact 2: Numerical target, year, or financial allocation"
  ],
  "examRelevanceNotes": {
    "upsc_prelims": { "focus": "Key treaties, articles, definitions", "weight": "HIGH" },
    "upsc_mains": { "focus": "Policy analysis, socio-economic implications", "weight": "CRITICAL" }
  },
  "sources": [
    {
      "title": "Official Press Release / Gazette Notice",
      "publisher": "Press Information Bureau (PIB)",
      "url": "https://pib.gov.in/PressReleasePage.aspx?PRID=...",
      "tier": "TIER_1",
      "citationContext": "Primary notification of policy enactment"
    }
  ],
  "taxonomyMappings": [],
  "examMappings": []
}
\`\`\`

Return ONLY the valid JSON object.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">AI Prompt Generator</h2>
              <p className="text-[11px] text-slate-500">Generate structured prompt for external LLMs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Target Event / News Topic
              </label>
              <input
                type="text"
                placeholder="e.g., Bharatiya Vayuyan Vidheyak 2024 Passed"
                value={focusTopic}
                onChange={(e) => setFocusTopic(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Event Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-slate-700 text-[11px]">Generated Prompt Output</span>
              <span className="text-[10px] text-slate-400 font-mono">Click Copy &amp; Paste to LLM</span>
            </div>
            <pre className="p-3.5 rounded-xl bg-slate-900 text-slate-200 text-[11px] font-mono whitespace-pre-wrap max-h-64 overflow-y-auto border border-slate-800">
              {generatedPrompt}
            </pre>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <strong>Human Editorial Authority:</strong> External AI is an authoring assistant only. The generated JSON must still pass all 5 validation gates and require human review before publishing.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied to Clipboard!' : 'Copy Prompt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
