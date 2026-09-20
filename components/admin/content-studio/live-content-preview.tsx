"use client";

import React, { useState } from "react";
import { ControlledContentRenderer } from "@/components/learning/controlled-content-renderer";
import { Monitor, Tablet, Smartphone } from "lucide-react";

interface Props {
  compiledMdx: string;
}

export const LiveContentPreview: React.FC<Props> = ({ compiledMdx }) => {
  const [deviceMode, setDeviceMode] = useState<"DESKTOP" | "TABLET" | "MOBILE">("DESKTOP");

  const containerWidth =
    deviceMode === "MOBILE"
      ? "max-w-sm"
      : deviceMode === "TABLET"
      ? "max-w-2xl"
      : "max-w-4xl";

  return (
    <div className="flex h-full flex-col bg-slate-100 dark:bg-slate-950">
      {/* Device bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <span className="font-bold text-slate-800 text-xs dark:text-slate-200">Live Production Preview</span>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setDeviceMode("DESKTOP")}
            className={`rounded p-1 text-xs ${deviceMode === "DESKTOP" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
            title="Desktop View"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("TABLET")}
            className={`rounded p-1 text-xs ${deviceMode === "TABLET" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
            title="Tablet View"
          >
            <Tablet className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("MOBILE")}
            className={`rounded p-1 text-xs ${deviceMode === "MOBILE" ? "bg-slate-200 dark:bg-slate-700" : ""}`}
            title="Mobile View"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Render Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className={`mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${containerWidth}`}>
          <ControlledContentRenderer contentMdx={compiledMdx} />
        </div>
      </div>
    </div>
  );
};
