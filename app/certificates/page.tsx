import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LiveTestCertificateService } from "@/services/live-test-certificate.service";
import { Award, ShieldCheck, Trophy, Calendar, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "My Certificates | Courage Library",
  description: "View and verify all your official Courage Library competition and mock examination certificates.",
};

export default async function CandidateCertificatesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/certificates");
  }

  const certificates = await LiveTestCertificateService.getCandidateCertificates(user.id);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Award className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Candidate Credentials</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              My Official Certificates
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Verified, cryptographically signed credentials from All-India Live Mock Championships.
            </p>
          </div>
          <Link href="/live-tests">
            <Button variant="outline" size="sm" className="bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800">
              Browse Live Tests
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>

        {/* Certificate List Grid */}
        {certificates.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center max-w-lg mx-auto space-y-4">
            <Award className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="text-lg font-bold text-white">No Certificates Earned Yet</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Participate in All-India Live Mock Tests and achieve outstanding national percentile to earn official certificates of merit and podium standing.
            </p>
            <Link href="/live-tests" className="inline-block mt-2">
              <Button className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold">
                Explore Upcoming Live Tests
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {certificates.map((cert) => {
              const formattedDate = new Date(cert.issued_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={cert.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-6 shadow-xl space-y-5 transition relative overflow-hidden group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider">
                        {cert.certificate_type}
                      </span>
                      <h3 className="font-bold text-base text-white group-hover:text-amber-300 transition">
                        {cert.event_title}
                      </h3>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {cert.certificate_number}
                    </span>
                  </div>

                  {/* Metrics Badge Row */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Rank</span>
                      <strong className="text-sm font-black text-amber-400">
                        {cert.final_rank ? `#${cert.final_rank}` : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Percentile</span>
                      <strong className="text-sm font-bold text-emerald-400">
                        {cert.final_percentile ? `${cert.final_percentile}%` : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Score</span>
                      <strong className="text-sm font-bold text-slate-200">
                        {cert.final_score} / {cert.max_score}
                      </strong>
                    </div>
                  </div>

                  {/* Footer & Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {formattedDate}
                    </span>
                    <Link
                      href={`/verify/c/${cert.verification_code}`}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      Public Verification
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
