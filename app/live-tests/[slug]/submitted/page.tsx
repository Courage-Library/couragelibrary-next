import React from "react";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, ArrowRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function LiveTestSubmittedPage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-6">
            <ShieldCheck className="w-3.5 h-3.5" />
            Live Exam Submitted
          </div>

          {/* Success Icon */}
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">
            Exam Submitted Successfully
          </h1>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            Your submission has been securely recorded. Results will be available when published.
          </p>

          <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 mb-6 space-y-2 text-left">
            <div className="flex justify-between">
              <span className="text-slate-500">Event Identifier</span>
              <span className="font-mono text-slate-300 truncate max-w-[180px]">{slug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Integrity Status</span>
              <span className="text-emerald-400 font-medium">Verified & Finalized</span>
            </div>
          </div>

          <Link href="/live-tests" className="w-full">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-xl gap-2">
              Back to Live Mock Tests
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
