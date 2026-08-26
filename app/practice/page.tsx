import React from "react";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, BookOpen } from "lucide-react";

export const revalidate = 60;

export default async function PracticeArenaPage() {
  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-4xl">
        <div className="space-y-2">
          <Badge variant="indigo" className="text-xs">
            Phase 3G Custom Practice Vault
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Adaptive Practice Arena
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Target your weak topics, previous years&apos; questions (PYQ), and bookmark collections with focused practice drills.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-6 space-y-4 hover:border-blue-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-900">Weak Area Remediation</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Adaptive practice algorithm pulls questions from topics with lowest mastery scores.
              </p>
            </div>
            <Button size="md" variant="default" className="w-full font-semibold">
              Start Weak Topic Drill
            </Button>
          </Card>

          <Card className="p-6 space-y-4 hover:border-indigo-300 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-slate-900">Bookmarked Questions</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Review and re-solve questions you previously flagged for revision across mock tests.
              </p>
            </div>
            <Button size="md" variant="outline" className="w-full font-semibold">
              Practice Bookmarks
            </Button>
          </Card>
        </div>
      </Container>
    </div>
  );
}