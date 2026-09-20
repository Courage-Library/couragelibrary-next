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
      bg: "bg-emerald-50/60 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/60 dark:text-emerald-200",
      icon: <Lightbulb className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
    },
    WARNING: {
      bg: "bg-rose-50/60 border-rose-200 text-rose-900 dark:bg-rose-950/20 dark:border-rose-900/60 dark:text-rose-200",
      icon: <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />,
    },
    INFO: {
      bg: "bg-blue-50/60 border-blue-200 text-blue-900 dark:bg-blue-950/20 dark:border-blue-900/60 dark:text-blue-200",
      icon: <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />,
    },
    MEMORY_HOOK: {
      bg: "bg-purple-50/60 border-purple-200 text-purple-900 dark:bg-purple-950/20 dark:border-purple-900/60 dark:text-purple-200",
      icon: <Bookmark className="h-5 w-5 text-purple-600 dark:text-purple-400" />,
    },
  }[variant] || {
    bg: "bg-gray-50 border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-800 dark:text-gray-200",
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
