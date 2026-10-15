import React, { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "destructive" | "error" | "outline" | "indigo" | "neutral";
}

const badgeVariants = {
  default: "bg-blue-50 text-blue-700 border-blue-200/60",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  warning: "bg-amber-50 text-amber-700 border-amber-200/60",
  destructive: "bg-rose-50 text-rose-700 border-rose-200/60",
  error: "bg-rose-50 text-rose-700 border-rose-200/60",
  outline: "bg-transparent text-slate-700 border-slate-300",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200/60",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}
