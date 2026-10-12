import React from "react";
import { PauseCircle } from "lucide-react";
import { FEATURE_ENV, FEATURE_LABELS, type FeatureKey } from "@/config/features";

/** Shown in place of an admin page whose feature is quarantined (server-rendered, no data access). */
export function FeatureDisabledPanel({ feature }: { feature: FeatureKey }) {
  return (
    <div className="max-w-xl mx-auto mt-10 p-6 rounded-2xl border border-slate-200 bg-white text-center space-y-3">
      <PauseCircle className="w-8 h-8 text-slate-400 mx-auto" />
      <h1 className="text-lg font-black text-slate-900">Feature not enabled</h1>
      <p className="text-sm text-slate-600">
        {FEATURE_LABELS[feature]} is switched off for this environment because its database objects are not deployed.
      </p>
      <p className="text-xs text-slate-400 font-mono">{FEATURE_ENV[feature]}</p>
    </div>
  );
}
