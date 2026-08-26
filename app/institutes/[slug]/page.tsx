import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstituteService } from "@/services/institute.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, ArrowRight } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function InstituteDetailPage({ params }: Props) {
  const { slug } = await params;
  const data = await InstituteService.getInstituteDetail(slug);

  if (!data) {
    notFound();
  }

  const { institute, batches, userRole } = data;

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-6 max-w-4xl">
        <Link
          href="/institutes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Institutes Directory
        </Link>

        {/* Institute Profile Card */}
        <Card className="p-6 sm:p-8 space-y-4 border-slate-200 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {institute.isVerified && (
                  <Badge variant="success" className="text-[10px]">VERIFIED INSTITUTE</Badge>
                )}
                {userRole && (
                  <Badge variant="indigo" className="text-[10px]">YOUR ROLE: {userRole}</Badge>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {institute.name}
              </h1>
            </div>

            {institute.websiteUrl && (
              <a
                href={institute.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Official Website
              </a>
            )}
          </div>

          {institute.description && (
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {institute.description}
            </p>
          )}
        </Card>

        {/* Batches Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Active Coaching Batches</h2>
          <span className="text-xs font-mono text-slate-500 font-semibold bg-white px-2.5 py-1 rounded-lg border border-slate-200">
            {batches.length} Batches Available
          </span>
        </div>

        {/* Batches Grid */}
        {batches.length === 0 ? (
          <Card className="p-8 text-center text-slate-400 space-y-2">
            <Users className="w-8 h-8 mx-auto opacity-50" />
            <h3 className="text-sm font-bold text-slate-700">No Batches Configured</h3>
            <p className="text-xs">This institute has no active cohorts at the moment.</p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {batches.map((b) => (
              <div
                key={b.id}
                className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition-all space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={b.status === "ACTIVE" ? "success" : "outline"} className="text-[10px]">
                      {b.status}
                    </Badge>
                    {b.targetExamTitle && (
                      <span className="font-bold text-slate-500 font-mono text-[11px]">
                        Target: {b.targetExamTitle}
                      </span>
                    )}
                    {b.isEnrolled && (
                      <Badge variant="indigo" className="text-[10px] bg-indigo-600">ENROLLED ({b.userRole})</Badge>
                    )}
                  </div>

                  <span className="font-mono text-xs text-slate-500">
                    Capacity: {b.activeStudentsCount} / {b.maxCapacity} Students
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-base leading-snug">
                  {b.name}
                </h3>

                {b.description && (
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {b.description}
                  </p>
                )}

                <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                  <Link href={`/institutes/${institute.slug}/batches/${b.id}`}>
                    <Button size="sm" variant="default" className="bg-indigo-600 hover:bg-indigo-700 font-bold text-xs">
                      Open Batch Dashboard <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}
