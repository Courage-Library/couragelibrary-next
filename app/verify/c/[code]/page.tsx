import React from "react";
import Link from "next/link";
import { Metadata } from "next";
import { LiveTestCertificateService } from "@/services/live-test-certificate.service";
import { ShieldCheck, AlertTriangle, XCircle, Award, Calendar, Trophy, Users, ArrowRight } from "lucide-react";

interface Props {
  params: Promise<{
    code: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `Certificate Verification: ${code} | Courage Library`,
    description: "Official public verification for Courage Library All-India Live Mock Examination certificates.",
  };
}

export default async function CertificateVerificationPage({ params }: Props) {
  const { code } = await params;
  const verification = await LiveTestCertificateService.verifyCertificatePublic(code);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Header Branding */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-white hover:opacity-90 transition">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/20">
            CL
          </div>
          <span>Courage Library</span>
        </Link>
        <p className="text-xs uppercase tracking-widest text-slate-400 mt-1 font-semibold">
          Official Credential Verification Service
        </p>
      </div>

      {/* Main Verification Card */}
      <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Verification Status Header */}
        {verification.valid && verification.status === "ISSUED" && (
          <div className="flex items-center gap-3 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-xl mb-6 text-emerald-400">
            <ShieldCheck className="h-7 w-7 shrink-0 text-emerald-400" />
            <div>
              <h3 className="font-bold text-base text-emerald-300">Authentic Credential Verified</h3>
              <p className="text-xs text-emerald-400/80">Issued and cryptographically signed by Courage Library Examination Authority.</p>
            </div>
          </div>
        )}

        {verification.status === "SUPERSEDED" && (
          <div className="flex items-start gap-3 p-4 bg-amber-950/40 border border-amber-500/30 rounded-xl mb-6 text-amber-300">
            <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-amber-200">Certificate Superseded</h3>
              <p className="text-xs text-amber-300/80 mt-1">
                {verification.superseded_notice || "This certificate was superseded following official examination result recalculation."}
              </p>
              {verification.replacement_verification_code && (
                <div className="mt-3">
                  <Link
                    href={`/verify/c/${verification.replacement_verification_code}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-900/30 hover:bg-amber-900/50 px-3 py-1.5 rounded-lg border border-amber-500/30 transition"
                  >
                    View Active Replacement Certificate
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {verification.status === "REVOKED" && (
          <div className="flex items-start gap-3 p-4 bg-rose-950/40 border border-rose-500/30 rounded-xl mb-6 text-rose-300">
            <XCircle className="h-6 w-6 shrink-0 text-rose-400 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-rose-200">Certificate Revoked</h3>
              <p className="text-xs text-rose-300/80 mt-1">
                This certificate has been administratively revoked.
              </p>
              {verification.revocation_reason && (
                <p className="text-xs text-rose-400 mt-2 font-mono bg-rose-950/60 p-2 rounded border border-rose-900/40">
                  Reason: {verification.revocation_reason}
                </p>
              )}
            </div>
          </div>
        )}

        {verification.status === "NOT_FOUND" && (
          <div className="text-center py-8">
            <XCircle className="h-16 w-16 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Certificate Not Found</h2>
            <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
              No official record matches the verification code <span className="font-mono text-slate-200">{code}</span>. Please verify the code on your certificate.
            </p>
            <Link
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition"
            >
              Return to Courage Library
            </Link>
          </div>
        )}

        {/* Certificate Credential Metadata */}
        {verification.status !== "NOT_FOUND" && (
          <div className="space-y-5">
            {/* Candidate & Certificate Type */}
            <div className="border-b border-slate-800 pb-5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Award className="h-3.5 w-3.5" />
                  {verification.certificate_type} CERTIFICATE
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {verification.certificate_number}
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {verification.candidate_display_name}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {verification.event_title}
              </p>
            </div>

            {/* Examination Academic Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {verification.rank !== null && verification.rank !== undefined && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-center">
                  <div className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                    <Trophy className="h-3.5 w-3.5 text-amber-400" />
                    All-India Rank
                  </div>
                  <div className="text-xl font-black text-amber-400">
                    #{verification.rank}
                  </div>
                </div>
              )}

              {verification.percentile !== null && verification.percentile !== undefined && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-center">
                  <div className="text-xs text-slate-400 mb-1">Percentile</div>
                  <div className="text-xl font-bold text-emerald-400">
                    {Number(verification.percentile).toFixed(2)}%
                  </div>
                </div>
              )}

              {verification.total_participants !== null && verification.total_participants !== undefined && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-center">
                  <div className="text-xs text-slate-400 flex items-center justify-center gap-1 mb-1">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    Cohort
                  </div>
                  <div className="text-xl font-bold text-slate-200">
                    {verification.total_participants.toLocaleString("en-IN")}
                  </div>
                </div>
              )}
            </div>

            {/* Issuance & Verification Details */}
            <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/50 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Issue Date:
                </span>
                <span className="font-medium text-slate-300">
                  {verification.issued_at ? new Date(verification.issued_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Verification Code:</span>
                <span className="font-mono font-bold text-slate-200">
                  {verification.verification_code || code}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Issuer:</span>
                <span className="font-semibold text-amber-400">Courage Library Examination Authority</span>
              </div>
            </div>
          </div>
        )}

        {/* Card Footer */}
        <div className="mt-8 pt-4 border-t border-slate-800/60 text-center text-xs text-slate-500">
          Zero-PII Secure Verification &bull; &copy; {new Date().getFullYear()} Courage Library
        </div>
      </div>
    </div>
  );
}
