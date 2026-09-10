"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import React, { useState } from "react";
import { Award, ShieldCheck, Download, Printer, Copy, Check, X, ExternalLink, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveCertificateType } from "@/types/live-test";

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificate: {
    id: string;
    certificateNumber: string;
    verificationCode: string;
    certificateType: LiveCertificateType;
    issuedAt: string;
  };
  candidateName: string;
  eventTitle: string;
  rank?: number | null;
  percentile?: number | null;
  totalParticipants?: number;
}

export function CertificateModal({
  isOpen,
  onClose,
  certificate,
  candidateName,
  eventTitle,
  rank,
  percentile,
  totalParticipants,
}: CertificateModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const verificationUrl = typeof window !== "undefined"
    ? `${window.location.origin}/verify/c/${certificate.verificationCode}`
    : `/verify/c/${certificate.verificationCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(verificationUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = new Date(certificate.issuedAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Top Action Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 text-amber-400">
            <Award className="w-6 h-6" />
            <span className="font-bold text-lg text-white">Official Certificate</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Certificate Vector Canvas Artwork Container */}
        <div className="relative bg-gradient-to-br from-amber-950/20 via-slate-950 to-indigo-950/20 border-2 border-amber-500/40 rounded-xl p-8 sm:p-12 text-center shadow-inner overflow-hidden">
          {/* Decorative Corner Ornaments */}
          <div className="absolute top-2 left-2 w-8 h-8 border-t-2 border-l-2 border-amber-500/60 rounded-tl-lg" />
          <div className="absolute top-2 right-2 w-8 h-8 border-t-2 border-r-2 border-amber-500/60 rounded-tr-lg" />
          <div className="absolute bottom-2 left-2 w-8 h-8 border-b-2 border-l-2 border-amber-500/60 rounded-bl-lg" />
          <div className="absolute bottom-2 right-2 w-8 h-8 border-b-2 border-r-2 border-amber-500/60 rounded-br-lg" />

          {/* Certificate Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black text-xl shadow-lg shadow-amber-500/20 mb-2">
              CL
            </div>
            <h2 className="text-xs uppercase tracking-[0.25em] font-bold text-amber-400/90">
              Courage Library Examination Authority
            </h2>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
              CERTIFICATE OF {certificate.certificateType}
            </h1>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              This is to certify the official competition standing and performance in the All-India Live Mock Examination.
            </p>
          </div>

          {/* Recipient Section */}
          <div className="my-8 space-y-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Awarded To</span>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-300 font-serif tracking-tight">
              {candidateName}
            </div>
            <div className="h-0.5 w-48 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent mx-auto mt-2" />
          </div>

          {/* Event & Performance Details */}
          <div className="space-y-4 max-w-lg mx-auto">
            <p className="text-sm text-slate-300 leading-relaxed">
              for outstanding participation in <span className="font-semibold text-white">{eventTitle}</span>
            </p>

            {(rank !== null && rank !== undefined) && (
              <div className="inline-flex items-center gap-4 bg-slate-900/80 border border-amber-500/30 rounded-xl px-4 py-2 text-xs">
                <span className="text-slate-400 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  All-India Rank: <strong className="text-amber-300 font-mono">#{rank}</strong>
                  {totalParticipants ? ` / ${totalParticipants}` : ""}
                </span>
                {percentile !== null && percentile !== undefined && (
                  <span className="text-slate-400 border-l border-slate-700 pl-4">
                    Percentile: <strong className="text-emerald-400 font-mono">{percentile}%</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Certificate Footer / Signatures & Seal */}
          <div className="mt-10 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-left text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Date of Issuance</div>
              <div className="text-slate-200 font-medium">{formattedDate}</div>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                VERIFIED AUTHENTIC
              </div>
              <div className="text-[9px] font-mono text-slate-400 mt-1">
                {certificate.certificateNumber}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Verification Code</div>
              <div className="text-amber-300 font-mono font-bold tracking-wider">
                {certificate.verificationCode}
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="sm"
              className="bg-slate-800/60 border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
              {copied ? "Link Copied!" : "Copy Verification Link"}
            </Button>
            <a
              href={verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-1"
            >
              Open Verification Page
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold"
              size="sm"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print / Save PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
