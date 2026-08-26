import React from "react";
import Link from "next/link";
import { InstituteService } from "@/services/institute.service";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, ShieldCheck } from "lucide-react";

export const revalidate = 30;

export default async function InstitutesDirectoryPage() {
  const institutes = await InstituteService.getInstitutes();

  return (
    <div className="py-10 bg-slate-50/50 min-h-[calc(100vh-4rem)]">
      <Container className="space-y-8 max-w-5xl">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-3">
          <Badge variant="indigo" className="bg-white/20 text-white border-white/20">
            Phase 3P Institutional Coaching Portal
          </Badge>
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-3">
            <Building2 className="w-8 h-8 text-indigo-400" />
            Partner Coaching Institutes & Cohorts
          </h1>
          <p className="text-indigo-100 text-sm max-w-2xl">
            Join verified institutional coaching batches, complete assigned curriculum, and track your progress with faculty guidance.
          </p>
        </div>

        {/* Directory Grid */}
        {institutes.length === 0 ? (
          <Card className="p-12 text-center text-slate-400 space-y-3">
            <Building2 className="w-10 h-10 mx-auto opacity-50" />
            <h3 className="text-base font-bold text-slate-700">No Partner Institutes Found</h3>
            <p className="text-xs">Partner coaching institutes will be listed here soon.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {institutes.map((inst) => (
              <Card key={inst.id} className="p-6 flex flex-col justify-between hover:border-indigo-300 hover:shadow-md transition-all space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {inst.isVerified && (
                        <Badge variant="success" className="text-[10px] flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> VERIFIED
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                      {inst.activeBatchesCount} Active Batches
                    </span>
                  </div>

                  <h3 className="font-black text-slate-900 text-lg leading-snug">
                    {inst.name}
                  </h3>

                  {inst.description && (
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {inst.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <Link href={`/institutes/${inst.slug}`}>
                    <Button variant="default" size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold">
                      View Batches & Portal <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
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
