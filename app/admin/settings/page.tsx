import React from "react";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { getAdminStudioSettings, STUDIO_SETTING_KEYS, DEFAULT_DAILY_REVIEW_GOAL } from "@/lib/admin/studio-settings";

export const dynamic = "force-dynamic";

export const revalidate = 0;

/**
 * Courage Studio — SETTINGS (decision #84, admin only, READ ONLY). Shows the Studio settings and where each value comes
 * from (a row in premium_system_configs, or the documented default). Changing a value is an owner / migration step —
 * this page never writes.
 */
export default async function AdminSettingsPage() {
  await requireAdminPage({ path: "/admin/settings" });
  const s = await getAdminStudioSettings();
  const rows = [
    { key: STUDIO_SETTING_KEYS.goal, label: "Daily review goal", value: String(s.dailyReviewGoal), source: s.source.dailyReviewGoal, def: String(DEFAULT_DAILY_REVIEW_GOAL), help: "The Today mission and the focus review progress (1–200)." },
    { key: STUDIO_SETTING_KEYS.secondReviewer, label: "Require a second reviewer", value: s.requireSecondReviewer ? "On" : "Off", source: s.source.requireSecondReviewer, def: "Off", help: "When on, the admin who approved a question cannot also publish it. When off, a self-approve + publish is recorded in the audit log." },
  ];
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <header>
        <h1 className="text-h1 font-bold text-fg">Settings</h1>
        <p className="text-body text-fg-secondary">Courage Studio settings. Read only here — values are changed by the owner.</p>
      </header>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.key} className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-body font-semibold text-fg">{r.label}</h2>
              <p className="text-h3 font-bold tabular-nums text-fg">{r.value}</p>
            </div>
            <p className="mt-1 text-body-sm text-fg-secondary">{r.help}</p>
            <p className="mt-2 text-caption text-fg-secondary">
              {r.source === "setting" ? "Set in the settings table" : `Default (${r.def}) — no setting stored`} · key <code>{r.key}</code>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
