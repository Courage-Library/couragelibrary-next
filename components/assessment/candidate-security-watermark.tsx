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
  // Format clean line 1 & line 2
  const line1 = `COURAGE LIBRARY \u2022 ${examTitle.toUpperCase().slice(0, 24)}`;
  const line2 = `CANDIDATE #${maskedCandidateId} \u2022 ATTEMPT #${attemptIdShort}`;
  const line3 = timestamp ? timestamp.toUpperCase() : "";

  // Encode SVG Pattern into data URI
  const svgContent = `
    <svg xmlns='http://www.w3.org/2000/svg' width='340' height='180' viewBox='0 0 340 180'>
      <g transform='rotate(-20 170 90)' fill='%230f172a' font-family='monospace, sans-serif' font-size='10' font-weight='800' letter-spacing='1.5'>
        <text x='20' y='40'>${line1}</text>
        <text x='20' y='55'>${line2}</text>
        ${line3 ? `<text x='20' y='70'>${line3}</text>` : ""}
        <text x='190' y='130'>${line1}</text>
        <text x='190' y='145'>${line2}</text>
        ${line3 ? `<text x='190' y='160'>${line3}</text>` : ""}
      </g>
    </svg>
  `.trim().replace(/\n/g, "").replace(/\s+/g, " ");

  const encodedSvg = encodeURIComponent(svgContent);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 select-none overflow-hidden ${
        isLighter ? "opacity-[0.015]" : "opacity-[0.022]"
      } ${className}`}
      style={{
        backgroundImage: `url("data:image/svg+xml,${encodedSvg}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}
