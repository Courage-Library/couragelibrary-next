import React from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, Search, Sparkles, BookOpen } from "lucide-react";

interface MistakeEmptyStateProps {
  type: "NO_MISTAKES_EVER" | "ALL_MASTERED" | "NO_REPEATED" | "NO_IMPROVING" | "NO_FILTER_MATCH";
  onResetFilters?: () => void;
}

export function MistakeEmptyState({ type }: MistakeEmptyStateProps) {
  if (type === "ALL_MASTERED") {
    return (
      <Card className="p-10 sm:p-14 text-center space-y-4 border-slate-200 bg-white">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-slate-800">All Active Mistakes Mastered</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Outstanding! You have successfully mastered your active revision queue. Take another mock exam to discover new challenges.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/mock-tests">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
              <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Take a Mock Test
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (type === "NO_REPEATED") {
    return (
      <Card className="p-10 sm:p-14 text-center space-y-4 border-slate-200 bg-white">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
          <RotateCcw className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-slate-800">No Repeated Mistakes</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            You don&apos;t have any questions answered incorrectly multiple times. All slips are currently isolated to single occurrences.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/mistakes">
            <Button variant="outline" size="sm" className="text-xs font-semibold border-slate-200">
              View All Mistakes
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (type === "NO_IMPROVING") {
    return (
      <Card className="p-10 sm:p-14 text-center space-y-4 border-slate-200 bg-white">
        <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-200">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-slate-800">No Mistakes in Improving Stage</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Items reach the improving stage after you get them right once in remediation. Start a drill to begin mastering your unresolved slips.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/mistakes/drill">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
              Start a Drill
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  if (type === "NO_FILTER_MATCH") {
    return (
      <Card className="p-10 sm:p-14 text-center space-y-4 border-slate-200 bg-white">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
          <Search className="w-6 h-6" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h3 className="text-base font-bold text-slate-800">No Matching Mistakes</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            No mistake records matched your active filters or search terms. Try adjusting your search query or subject filters.
          </p>
        </div>
        <div className="pt-2">
          <Link href="/mistakes">
            <Button variant="outline" size="sm" className="text-xs font-semibold border-slate-200 text-slate-700">
              Reset Filters
            </Button>
          </Link>
        </div>
      </Card>
    );
  }

  // Default: NO_MISTAKES_EVER
  return (
    <Card className="p-10 sm:p-14 text-center space-y-4 border-slate-200 bg-white">
      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-200">
        <BookOpen className="w-6 h-6" />
      </div>
      <div className="space-y-1.5 max-w-sm mx-auto">
        <h3 className="text-base font-bold text-slate-800">Your Mistake Notebook is Empty</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          You haven&apos;t logged any test mistakes yet. As you take mock tests and sectional exams, incorrect responses will automatically appear here for targeted revision.
        </p>
      </div>
      <div className="pt-2">
        <Link href="/mock-tests">
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
            Start Your First Mock Test
          </Button>
        </Link>
      </div>
    </Card>
  );
}
