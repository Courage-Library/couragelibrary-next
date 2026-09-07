"use client";

import React from "react";

interface CandidateSecurityWatermarkProps {
  examTitle?: string;
  maskedCandidateId?: string;
  attemptIdShort?: string;
  timestamp?: string;
  className?: string;
  isLighter?: boolean;
}

export function CandidateSecurityWatermark({
  examTitle = "COURAGE LIBRARY",
  maskedCandidateId = "CL••••73",
  attemptIdShort = "A8F31C",
  timestamp = "",
  className = "",
  isLighter = false,
}: CandidateSecurityWatermarkProps) {
  // Format clean line 1 & line 2 (Clear security strings with uppercase branding)
  const line1 = `COURAGE LIBRARY \u2022 ${examTitle.toUpperCase().slice(0, 26)}`;
  const line2 = `CANDIDATE \u2022 #${maskedCandidateId} \u2022 ATTEMPT #${attemptIdShort}`;
  const line3 = timestamp ? timestamp.toUpperCase() : "";

  // Encode SVG Pattern into data URI with larger tile and legible typography (14px font, 360x210 tile)
  const svgContent = `
    <svg xmlns='http://www.w3.org/2000/svg' width='360' height='210' viewBox='0 0 360 210'>
      <g transform='rotate(-22 180 105)' fill='%230f172a' font-family='monospace, -apple-system, sans-serif' font-size='14' font-weight='700' letter-spacing='1.5'>
        <text x='15' y='50'>${line1}</text>
        <text x='15' y='72'>${line2}</text>
        ${line3 ? `<text x='15' y='94'>${line3}</text>` : ""}
        <text x='200' y='155'>${line1}</text>
        <text x='200' y='177'>${line2}</text>
        ${line3 ? `<text x='200' y='199'>${line3}</text>` : ""}
      </g>
    </svg>
  `.trim().replace(/\n/g, "").replace(/\s+/g, " ");

  const encodedSvg = encodeURIComponent(svgContent);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 select-none overflow-hidden transition-opacity duration-300 ${
        isLighter ? "opacity-[0.055]" : "opacity-[0.08]"
      } ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodedSvg}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}

