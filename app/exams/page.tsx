import React from "react";
import Link from "next/link";
import { ExamKnowledgeCandidateService } from "@/services/exam-knowledge/exam-knowledge-candidate.service";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Shield,
  Award,
  Train,
  Layers,
  BookOpen,
} from "lucide-react";
import { constructMetadata } from "@/lib/seo/metadata";

export const revalidate = 60; // ISR baseline

export const metadata = constructMetadata({
  title: "National Competitive Exam Knowledge Hub",
  description:
    "Authoritative, verified syllabus, exam patterns, eligibility criteria, pay scales, and previous year trends for Indian competitive examinations.",
  canonicalUrl: "/exams",
});

export default async function ExamsDirectoryPage() {
  const exams = await ExamKnowledgeCandidateService.getExamsDirectory();

  // Group by category
  const categoriesMap = new Map<string, typeof exams>();
  exams.forEach((exam) => {
    const cat = exam.category || "Competitive Examinations";
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat)!.push(exam);
  });

  const getCategoryIcon = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes("defence") || lower.includes("nda") || lower.includes("cds") || lower.includes("afcat")) {
      return <Shield className="w-5 h-5 text-amber-600" />;
    }
    if (lower.includes("railway") || lower.includes("rrb")) {
      return <Train className="w-5 h-5 text-emerald-600" />;
    }
    return <Award className="w-5 h-5 text-blue-600" />;
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://couragelibrary.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Exams Directory",
        item: "https://couragelibrary.com/exams",
      },
    ],
  };

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Container className="space-y-10">
        <div className="space-y-3 max-w-2xl">
          <Badge variant="indigo" className="text-xs">
            Official Knowledge Repository
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Target Competitive Examinations
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Verified, commission-accurate exam blueprints, structured syllabus breakdowns, official notification timelines, and career pay matrices.
          </p>
        </div>

        {exams.length === 0 ? (
          <Card className="border-slate-200/80 shadow-xs">
            <CardContent className="py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-xs">
                <Layers className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-lg font-extrabold text-slate-900">No Published Exams Found</h3>
                <p className="text-xs text-slate-500">
                  Target exam taxonomies and knowledge bases are being populated into the authoritative repository.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Link href="/practice">
                  <Button variant="default" size="sm" className="font-semibold shadow-xs">
                    Explore Practice Questions
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          Array.from(categoriesMap.entries()).map(([category, categoryExams]) => (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200">
                {getCategoryIcon(category)}
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">{category}</h2>
                <Badge variant="outline" className="text-xs ml-2">
                  {categoryExams.length} {categoryExams.length === 1 ? "Exam" : "Exams"}
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {categoryExams.map((exam) => (
                  <Link key={exam.id} href={`/exams/${exam.slug}`} className="group block">
                    <Card className="p-5 hover:border-blue-400 hover:shadow-md transition-all h-full flex flex-col justify-between rounded-2xl bg-white border border-slate-200">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px] font-mono font-medium text-slate-600">
                            {exam.conductingOrg.shortName || exam.conductingOrg.name}
                          </Badge>
                          {exam.latestCycleYear && (
                            <Badge variant="indigo" className="text-[10px]">
                              Cycle {exam.latestCycleYear}
                            </Badge>
                          )}
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

                      <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-medium">
                            {exam.publishedModulesCount} {exam.publishedModulesCount === 1 ? "Module" : "Modules"}
                          </span>
                        </div>
                        <span className="font-semibold text-blue-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                          Knowledge Hub <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
      </Container>
    </div>
  );
}
