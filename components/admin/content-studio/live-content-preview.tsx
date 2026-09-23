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
    <div className="flex h-full flex-col bg-slate-100/60">
      {/* Device bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5 shadow-2xs">
        <span className="font-bold text-slate-800 text-xs">Live Production Preview</span>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setDeviceMode("DESKTOP")}
            className={`rounded-md p-1.5 text-xs transition ${deviceMode === "DESKTOP" ? "bg-white text-blue-700 shadow-2xs font-bold border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            title="Desktop View"
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("TABLET")}
            className={`rounded-md p-1.5 text-xs transition ${deviceMode === "TABLET" ? "bg-white text-blue-700 shadow-2xs font-bold border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            title="Tablet View"
          >
            <Tablet className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode("MOBILE")}
            className={`rounded-md p-1.5 text-xs transition ${deviceMode === "MOBILE" ? "bg-white text-blue-700 shadow-2xs font-bold border border-slate-200/80" : "text-slate-500 hover:text-slate-800"}`}
            title="Mobile View"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Render Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className={`mx-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${containerWidth}`}>
          <ControlledContentRenderer contentMdx={compiledMdx} />
        </div>
      </div>
    </div>
  );
};
