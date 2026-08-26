import React from "react";
import Link from "next/link";
import { AssessmentService } from "@/services/assessment.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Shield, Award, Train } from "lucide-react";

export const revalidate = 60; // ISR baseline

export default async function ExamsDirectoryPage() {
  const exams = await AssessmentService.getExamDirectory();

  // Group by category
  const categoriesMap = new Map<string, typeof exams>();
  exams.forEach((exam) => {
    const cat = exam.category || "Other Competitive Exams";
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat)!.push(exam);
  });

  const getCategoryIcon = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes("defence") || lower.includes("nda") || lower.includes("cds")) {
      return <Shield className="w-5 h-5 text-amber-600" />;
    }
    if (lower.includes("railway") || lower.includes("rrb")) {
      return <Train className="w-5 h-5 text-emerald-600" />;
    }
    return <Award className="w-5 h-5 text-blue-600" />;
  };

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-10">
        <div className="space-y-3 max-w-2xl">
          <Badge variant="indigo" className="text-xs">
            Phase 3A Taxonomy
          </Badge>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Target Competitive Examinations
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Select your target exam vertical to access specialized mock test blueprints, syllabus-aligned practice drills, and previous years&apos; questions.
          </p>
        </div>

        {Array.from(categoriesMap.entries()).map(([category, categoryExams]) => (
          <div key={category} className="space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200">
              {getCategoryIcon(category)}
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">{category}</h2>
              <Badge variant="outline" className="text-xs ml-2">
                {categoryExams.length} Exams
              </Badge>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryExams.map((exam) => (
                <Link key={exam.id} href={`/exams/${exam.slug}`} className="group">
                  <Card className="p-5 hover:border-blue-300 hover:shadow-md transition-all h-full flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {exam.conductingOrg}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                        {exam.title}
                      </h3>
                      {exam.description && (
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {exam.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 text-xs font-semibold text-blue-600">
                      <span>View Syllabus & Tests</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </Container>
    </div>
  );
}