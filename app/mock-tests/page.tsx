import React from "react";
import Link from "next/link";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Clock, Award, Sparkles, HelpCircle } from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 30;

export const metadata = constructMetadata({
  title: "Full-Length Mock Tests",
  description: "Simulate real examination conditions with timed, section-wise blueprints and instant AI-evaluated percentiles.",
});

export default async function MockTestsDirectoryPage() {
  const tests = await AssessmentService.getMockTestsDirectory();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8">
        <div className="space-y-2">
          <Badge variant="indigo" className="text-xs">
            Mock Test Engine
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Full-Length Mock Tests
          </h1>
          <p className="text-sm text-slate-600 max-w-2xl">
            Simulate real examination conditions with timed, section-wise blueprints and instant AI-evaluated percentiles.
          </p>
        </div>

        {tests.length === 0 ? (
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                <Target className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-lg font-extrabold text-slate-900">No Published Mock Tests Yet</h3>
                <p className="text-xs text-slate-500">
                  National level mock test papers are being authored and scheduled. In the meantime, build speed with topic-wise practice drills or active recall flashcards.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link href="/practice">
                  <Button variant="default" size="sm" className="font-semibold shadow-xs">
                    <HelpCircle className="w-3.5 h-3.5 mr-1" /> Practice Questions
                  </Button>
                </Link>
                <Link href="/flashcards">
                  <Button variant="outline" size="sm" className="font-semibold">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Flashcards & SRS
                  </Button>
                </Link>
              </div>
            </CardContent>
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