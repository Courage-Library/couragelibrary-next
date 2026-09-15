import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";

interface MistakeHeroProps {
  activeMistakesCount: number;
  totalMistakesCount: number;
}

export function MistakeHero({ activeMistakesCount }: MistakeHeroProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="indigo" className="text-xs font-semibold px-2.5 py-0.5">
              Personal Revision Engine
            </Badge>
            {activeMistakesCount > 0 ? (
              <Badge variant="outline" className="text-xs font-medium text-slate-600 bg-slate-50 border-slate-200">
                {activeMistakesCount} {activeMistakesCount === 1 ? "slip needs revision" : "slips need revision"}
              </Badge>
            ) : (
              <Badge variant="success" className="text-xs font-medium">
                All active mistakes resolved
              </Badge>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Mistake Vault
          </h1>

          <p className="text-slate-600 text-sm leading-relaxed">
            Your dedicated workspace to analyze past exam slips, eliminate repeated errors, and master weak topics through targeted remediation drills.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link href="/mistakes/drill">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
              Launch Remediation Drill
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
