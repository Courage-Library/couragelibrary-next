"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import type { TestLeaderboardData } from "@/services/assessment.service";
import { setLeaderboardOptInAction } from "@/app/mock-tests/[id]/leaderboard/actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Switch } from "@/components/ui/switch";
import { formatDuration, formatPercent } from "@/lib/format";
import { fmtMarks } from "@/lib/assessment/result-analysis";
import { cn } from "@/lib/utils";

/**
 * LEADERBOARD-GATE-1 (R12): ranks only from ≥ RANK_MIN_COHORT real students (n stated); public rows only for students
 * who opted in (masked names); the viewer's own rank is shown to them only. Below the threshold: a plain
 * "Not enough students yet" state — no ranks, no counts, no podium.
 */
export function LeaderboardViewClient({ data }: { data: TestLeaderboardData }) {
  const { test, view } = data;
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-canvas py-6 sm:py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 sm:px-6">
        <div className="flex flex-col gap-2">
          <Link href={`/mock-tests/${test.id}`} prefetch={false} className="focus-ring inline-flex min-h-12 w-fit items-center gap-1.5 text-body-sm font-medium text-fg-secondary hover:text-fg">
            <ArrowLeft aria-hidden="true" className="size-4" /> {test.title}
          </Link>
          <h1 className="text-h1 font-bold text-fg">Leaderboard</h1>
        </div>

        {view.state === "not_enough" ? (
          <div data-leaderboard-state="not_enough" className="rounded-card border border-line bg-surface">
            <EmptyState icon={<Users />} title="Not enough students yet" description="Ranks appear once enough students have taken this mock. Your own score is on your result page." headingLevel={2} />
          </div>
        ) : (
          <section aria-labelledby="ranks-title" data-leaderboard-state="ranked" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-6">
            <h2 id="ranks-title" className="text-h2 font-bold text-fg">
              Ranks among {view.n} students
            </h2>
            <p className="text-body-sm text-fg-secondary">Based on each student&apos;s first attempt. Only students who chose to appear are listed, with masked names.</p>
            {view.viewer && (
              <p className="rounded-xl border border-line bg-surface-sunken px-3 py-2 text-body text-fg" data-leaderboard-viewer="">
                Your rank: <strong className="tabular-nums">{view.viewer.rank}</strong> of {view.n}
                {!view.viewer.optedIn && <span className="text-fg-secondary"> (only you can see this)</span>}
              </p>
            )}
            {view.entries.length === 0 ? (
              <p className="text-body text-fg-secondary">No student has chosen to appear yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-body-sm">
                  <caption className="sr-only">Ranks of students who chose to appear</caption>
                  <thead>
                    <tr className="border-b border-line text-fg-secondary">
                      <th scope="col" className="py-2 pr-3 font-medium">Rank</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Student</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Score</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Accuracy</th>
                      <th scope="col" className="py-2 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.entries.map((e, i) => (
                      <tr key={i} className={cn("border-b border-line last:border-0", e.isCurrentUser && "bg-primary-50")}>
                        <td className="py-2 pr-3 tabular-nums text-fg">{e.rank}</td>
                        <td className="py-2 pr-3 text-fg">{e.displayName}</td>
                        <td className="py-2 pr-3 tabular-nums text-fg">
                          {fmtMarks(e.score)} / {fmtMarks(e.maxScore)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-fg">{formatPercent(e.accuracyPercentage)}</td>
                        <td className="py-2 tabular-nums text-fg">{formatDuration(e.timeSpentSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {data.viewerOptedIn !== null && <OptInToggle initial={data.viewerOptedIn} mockId={test.id} />}
      </div>
    </div>
  );
}

function OptInToggle({ initial, mockId }: { initial: boolean; mockId: string }) {
  const [on, setOn] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-2" data-leaderboard-optin="">
      <Switch
        label="Show me on mock leaderboards"
        description="Off by default. When on, your masked name, score, accuracy and time appear to other students on leaderboards with enough students."
        checked={on}
        disabled={pending}
        className="min-h-12"
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          setFailed(false);
          start(async () => {
            const r = await setLeaderboardOptInAction({ optIn: next, mockId }).catch(() => ({ ok: false }));
            if (!r.ok) {
              setOn(!next);
              setFailed(true);
            }
          });
        }}
      />
      {failed && (
        <p role="alert" className="pb-2 text-body-sm text-danger-700">
          Your choice was not saved. Try again.
        </p>
      )}
    </div>
  );
}
