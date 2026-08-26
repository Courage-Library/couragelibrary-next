import React from "react";
import { Container } from "@/components/ui/container";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PREPARATION_PILLARS, EXAM_VERTICALS } from "@/config/constants";
import { HealthService } from "@/services/health.service";
import { JsonLd } from "@/components/seo/json-ld";
import { generateOrganizationSchema } from "@/lib/seo/jsonld";

export const revalidate = 60; // ISR baseline

export default async function HomePage() {
  const health = await HealthService.checkSystemHealth();
  const orgSchema = generateOrganizationSchema();

  return (
    <>
      <JsonLd data={orgSchema} />
      <div className="py-12 md:py-20">
        <Container className="space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            <Badge variant="indigo" className="px-3 py-1 text-xs uppercase tracking-wider">
              Phase 1B — Architectural Foundation
            </Badge>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
              The One-Stop Government Exam Preparation Platform
            </h1>
            <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
              Engineered for 50+ government exams with a shared canonical knowledge model,
              mobile-first design system, and adaptive preparation intelligence.
            </p>
          </div>

          {/* System Health Status Card */}
          <Card className="max-w-2xl mx-auto border-blue-100 bg-gradient-to-b from-white to-blue-50/20 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Supabase Connection State</CardTitle>
                <CardDescription className="text-xs">
                  Target Project: <span className="font-mono font-semibold text-blue-700">couragelibrary-next</span>
                </CardDescription>
              </div>
              <Badge variant={health.status === "healthy" ? "success" : "warning"}>
                {health.status.toUpperCase()}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Environment</span>
                  <span className="font-semibold text-slate-800 capitalize">{health.environment}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Supabase URL</span>
                  <span className="font-semibold text-slate-800">
                    {health.supabase.configured ? "Configured" : "Pending .env"}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 col-span-2 sm:col-span-1">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Auth Probe</span>
                  <span className="font-semibold text-slate-800">
                    {health.supabase.reachable ? `Connected (${health.supabase.latencyMs}ms)` : "Standby / Degraded"}
                  </span>
                </div>
              </div>
              {health.supabase.error && (
                <p className="text-amber-700 bg-amber-50 p-2.5 rounded-lg text-xs">
                  ⚠️ Note: {health.supabase.error}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Core Architectural Pillars */}
          <div className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">Next-Gen Architecture Pillars</h2>
              <p className="text-xs text-slate-500">Domain-driven design preparing for 50+ government exams</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PREPARATION_PILLARS.map((pillar) => (
                <Card key={pillar.title} className="p-5 hover:border-blue-200 transition-colors">
                  <h3 className="font-bold text-sm text-slate-900 mb-1">{pillar.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{pillar.description}</p>
                </Card>
              ))}
            </div>
          </div>

          {/* Exam Coverage Target */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200/80 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono">
              Target Exam Verticals
            </h2>
            <div className="flex flex-wrap gap-2">
              {EXAM_VERTICALS.map((exam) => (
                <Badge key={exam.id} variant="outline" className="text-xs py-1 px-3 bg-slate-50">
                  {exam.name}
                </Badge>
              ))}
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
