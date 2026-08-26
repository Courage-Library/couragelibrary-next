import React from "react";
import Link from "next/link";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Clock, Award } from "lucide-react";

export const revalidate = 30;

export default async function MockTestsDirectoryPage() {
  const tests = await AssessmentService.getMockTestsDirectory();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        <div className="space-y-2">
          <Badge variant="indigo" className="text-xs">
            Phase 3B Mock Engine
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Full-Length Mock Tests
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Simulate real examination conditions with timed, section-wise blueprints and instant AI-evaluated percentiles.
          </p>
        </div>

        {tests.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <Target className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Published Mock Tests Yet</h3>
            <p className="text-xs">Check back soon for new national level mock papers.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.map((test) => (
              <Card key={test.id} className="p-5 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between h-full">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">
                      {test.category}
                    </Badge>
                    {test.isFree && (
                      <Badge variant="success" className="text-[10px]">
                        FREE
                      </Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 font-semibold">{test.examTitle}</span>
                    <h3 className="font-bold text-base text-slate-900 mt-0.5">{test.title}</h3>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{test.durationMinutes}m</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      <span>{test.totalMarks} Marks</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>{test.totalQuestions} Qs</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100">
                  <Link href={`/mock-tests/${test.id}`}>
                    <Button size="md" variant="default" className="w-full font-semibold shadow-xs">
                      Take Test
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}