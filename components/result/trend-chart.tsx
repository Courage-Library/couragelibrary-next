"use client";

import React, { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import { fmtPct, fmtScore, trendPoints, type TrendGroup } from "@/lib/assessment/result-ux";

/**
 * RESULT-UX-1 §2.4 — score in % for the comparable series only (same exam + mock kind + max score; never mixed),
 * Last 5 / All, the current attempt highlighted. The SVG is decoration (aria-hidden); the same numbers are a real table
 * for screen readers (the text alternative). Hidden with < 2 points: "Take this mock again to see your trend".
 */
const W = 320;
const H = 150;
const PAD = { l: 34, r: 12, t: 12, b: 26 };

export function TrendChart({ group }: { group: TrendGroup | null }) {
  const [range, setRange] = useState<"last5" | "all">("last5");
  const id = useId();
  const pts = trendPoints(group, range);
  const total = group?.points.length ?? 0;
  if (!pts) {
    return (
      <p className="rounded-xl border border-dashed border-cl-mist bg-cl-cloud px-3 py-3 text-body-sm text-cl-slate" data-trend-empty="">
        Take this mock again to see your trend.
      </p>
    );
  }
  const x = (i: number) => PAD.l + (pts.length === 1 ? 0 : (i * (W - PAD.l - PAD.r)) / (pts.length - 1));
  const y = (pct: number) => PAD.t + ((100 - Math.max(0, Math.min(100, pct))) * (H - PAD.t - PAD.b)) / 100;
  const first = total - pts.length;
  return (
    <figure className="m-0 flex flex-col gap-2" aria-labelledby={`${id}-cap`} data-trend-chart="">
      <div className="flex flex-wrap items-center gap-2">
        <figcaption id={`${id}-cap`} className="text-caption text-cl-slate">
          {group!.examTitle ? `${group!.examTitle} ` : ""}
          {group!.kindLabel} mocks · score %
        </figcaption>
        {total > 5 && (
          <div role="group" aria-label="Trend range" className="ml-auto inline-flex gap-0.5 rounded-full bg-cl-cloud p-0.5">
            {(["last5", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn("focus-ring min-h-11 rounded-full px-3 text-caption font-semibold", range === r ? "bg-cl-white text-cl-charcoal shadow-xs" : "text-cl-slate hover:text-cl-charcoal")}
              >
                {r === "last5" ? "Last 5" : "All"}
              </button>
            ))}
          </div>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" aria-hidden="true" focusable="false">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} className="stroke-cl-line" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(g) + 4} textAnchor="end" className="fill-cl-slate text-[10px]">
              {g}%
            </text>
          </g>
        ))}
        <polyline points={pts.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")} fill="none" className="stroke-cl-blue" strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.attemptId}>
            <circle cx={x(i)} cy={y(p.pct)} r={p.isCurrent ? 5.5 : 3.5} className={p.isCurrent ? "fill-cl-blue stroke-cl-white" : "fill-cl-white stroke-cl-blue"} strokeWidth={2} />
            {p.isCurrent && (
              <text x={x(i)} y={y(p.pct) - 10} textAnchor={i === pts.length - 1 ? "end" : "middle"} className="fill-cl-charcoal text-[11px] font-semibold">
                {fmtPct(p.pct)}
              </text>
            )}
            <text x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} className={p.isCurrent ? "fill-cl-charcoal text-[10px] font-semibold" : "fill-cl-slate text-[10px]"}>
              {p.isCurrent ? "This attempt" : `#${first + i + 1}`}
            </text>
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Your score in percent, oldest first</caption>
        <thead>
          <tr>
            <th scope="col">Attempt</th>
            <th scope="col">Date</th>
            <th scope="col">Score</th>
            <th scope="col">Percent</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p, i) => (
            <tr key={p.attemptId}>
              <th scope="row">{p.isCurrent ? "This attempt" : `#${first + i + 1}`}</th>
              <td>{formatDateShort(p.submittedAt)}</td>
              <td>{fmtScore(p.score, p.maxScore)}</td>
              <td>{fmtPct(p.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
