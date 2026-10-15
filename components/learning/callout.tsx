"use client";

import React from "react";
import { CalloutProps } from "@/types/learning-compiler";
import { Info, AlertTriangle, Lightbulb, Bookmark } from "lucide-react";

export const Callout: React.FC<CalloutProps> = ({
  variant = "INFO",
  title,
  body,
}) => {
  const styles = {
    TIP: {
      bg: "bg-emerald-50/60 border-emerald-200 text-emerald-900",
      icon: <Lightbulb className="h-5 w-5 text-emerald-600" />,
    },
    WARNING: {
      bg: "bg-rose-50/60 border-rose-200 text-rose-900",
      icon: <AlertTriangle className="h-5 w-5 text-rose-600" />,
    },
    INFO: {
      bg: "bg-blue-50/60 border-blue-200 text-blue-900",
      icon: <Info className="h-5 w-5 text-blue-600" />,
    },
    MEMORY_HOOK: {
      bg: "bg-purple-50/60 border-purple-200 text-purple-900",
      icon: <Bookmark className="h-5 w-5 text-purple-600" />,
    },
  }[variant] || {
    bg: "bg-gray-50 border-gray-200 text-gray-900",
    icon: <Info className="h-5 w-5 text-gray-600" />,
  };

  return (
    <div className={`my-5 rounded-xl border p-4 shadow-xs ${styles.bg}`}>
      <div className="flex items-center gap-2 font-semibold text-sm">
        {styles.icon}
        <span>{title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed opacity-90">{body}</p>
    </div>
  );
};
